import { sanitizeBaseName } from './conversion-registry.js';

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

function getMimeType(targetExt) {
  if (targetExt === 'jpg') {
    return 'image/jpeg';
  }

  if (targetExt === 'png') {
    return 'image/png';
  }

  return 'image/webp';
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image.'));
    };
    image.src = url;
  });
}

function drawToCanvas(image, targetExt) {
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', {
    alpha: targetExt !== 'jpg',
  });

  if (!context) {
    throw new Error('Could not process image.');
  }

  if (targetExt === 'jpg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }

  context.drawImage(image, 0, 0, width, height);

  return canvas;
}

function canvasToBlob(canvas, targetExt) {
  const mime = getMimeType(targetExt);
  const quality = targetExt === 'png' ? undefined : 0.92;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('Could not encode image.'));
    }, mime, quality);
  });
}

export async function convertImageInBrowser({
  file,
  targetExt,
  onProgress = () => {},
}) {
  const reportProgress = createProgressReporter(onProgress);
  const baseName = sanitizeBaseName(file.name);

  reportProgress(12);
  const image = await decodeImage(file);

  reportProgress(42);
  const canvas = drawToCanvas(image, targetExt);

  reportProgress(74);
  const blob = await canvasToBlob(canvas, targetExt);

  if (typeof image.close === 'function') {
    image.close();
  }

  canvas.width = 0;
  canvas.height = 0;

  reportProgress(100);

  return {
    name: `${baseName}.${targetExt}`,
    mime: getMimeType(targetExt),
    blob,
  };
}
