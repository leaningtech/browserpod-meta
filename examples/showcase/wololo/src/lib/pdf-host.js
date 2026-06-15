import { zipSync } from 'fflate';
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { sanitizeBaseName } from './conversion-registry.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function createProgressReporter(onProgress) {
  let lastPercent = 0;

  return (percent) => {
    const nextPercent = Math.max(
      lastPercent,
      Math.min(100, Math.round(percent))
    );

    if (nextPercent !== lastPercent) {
      lastPercent = nextPercent;
      onProgress(nextPercent);
    }
  };
}

function canvasToBlob(canvas, targetExt) {
  const mime = targetExt === 'png' ? 'image/png' : 'image/jpeg';
  const quality = targetExt === 'jpg' ? 0.92 : undefined;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('Could not render PDF page.'));
    }, mime, quality);
  });
}

function getScaleForPage(pageCount) {
  return pageCount > 12 ? 1.35 : 1.85;
}

export async function convertPdfInBrowser({
  file,
  targetExt,
  onProgress = () => {},
}) {
  const reportProgress = createProgressReporter(onProgress);
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const baseName = sanitizeBaseName(file.name);

  reportProgress(10);

  const loadingTask = pdfjs.getDocument({ data: sourceBytes });
  const pdfDocument = await loadingTask.promise;
  const pageCount = pdfDocument.numPages;
  const pageFiles = [];

  reportProgress(20);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: getScaleForPage(pageCount) });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', {
      alpha: targetExt === 'png',
    });

    if (!context) {
      throw new Error('Could not render PDF page.');
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    if (targetExt === 'jpg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const blob = await canvasToBlob(canvas, targetExt);
    const fileBytes = new Uint8Array(await blob.arrayBuffer());
    const fileName =
      pageCount === 1
        ? `${baseName}.${targetExt}`
        : `${baseName}-${String(pageNumber).padStart(2, '0')}.${targetExt}`;

    pageFiles.push({
      name: fileName,
      mime: blob.type,
      bytes: fileBytes,
    });

    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;

    reportProgress(20 + (pageNumber / pageCount) * 70);
  }

  await pdfDocument.destroy();

  if (pageFiles.length === 1) {
    const [output] = pageFiles;
    reportProgress(100);

    return {
      name: output.name,
      mime: output.mime,
      blob: new Blob([output.bytes], { type: output.mime }),
    };
  }

  const archiveEntries = Object.fromEntries(
    pageFiles.map((entry) => [entry.name, entry.bytes])
  );
  const archiveName = `${baseName}-${targetExt}.zip`;
  const archiveBytes = zipSync(archiveEntries, { level: 0 });

  reportProgress(100);

  return {
    name: archiveName,
    mime: 'application/zip',
    blob: new Blob([archiveBytes], { type: 'application/zip' }),
  };
}
