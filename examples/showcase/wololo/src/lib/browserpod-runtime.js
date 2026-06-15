import { BrowserPod } from '@leaningtech/browserpod';
import { getFileExtension } from './conversion-registry.js';
import {
  copyPublicFileToPod,
  delay,
  readPodBinaryFile,
  readPodTextFile,
  writePodBinaryFile,
  writePodTextFile,
} from './pod-utils.js';

const apiKey = import.meta.env.VITE_BP_APIKEY?.trim() ?? '';

let podPromise = null;

async function bootPod(terminalHost) {
  if (!apiKey) {
    throw new Error('VITE_BP_APIKEY missing.');
  }

  if (!terminalHost) {
    throw new Error('Terminal host missing.');
  }

  const pod = await BrowserPod.boot({
    apiKey,
    storageName: `baha-${crypto.randomUUID()}`,
  });

  await delay(500);

  const terminal = await pod.createDefaultTerminal(terminalHost);

  await pod.createDirectory('/project', { recursive: true });
  await pod.createDirectory('/project/jobs', { recursive: true });
  await copyPublicFileToPod(pod, '/project/convert.mjs', '/project/convert.mjs');
  await copyPublicFileToPod(pod, '/project/package.json', '/project/package.json');

  return { pod, terminal };
}

async function readProgressPercent(pod, progressPath) {
  try {
    const raw = await readPodTextFile(pod, progressPath);
    const parsed = JSON.parse(raw);
    const percent = Number(parsed.percent);

    if (Number.isFinite(percent)) {
      return percent;
    }
  } catch {
    return null;
  }

  return null;
}

export function ensurePod(terminalHost) {
  if (!podPromise) {
    podPromise = bootPod(terminalHost).catch((error) => {
      podPromise = null;
      throw error;
    });
  }

  return podPromise;
}

export async function runPodConversion({
  terminalHost,
  file,
  targetExt,
  onProgress = () => {},
}) {
  const { pod, terminal } = await ensurePod(terminalHost);

  let lastPercent = 0;
  const reportProgress = (percent) => {
    const nextPercent = Math.max(
      lastPercent,
      Math.min(100, Math.round(percent))
    );

    if (nextPercent !== lastPercent) {
      lastPercent = nextPercent;
      onProgress(nextPercent);
    }
  };

  reportProgress(6);

  const jobId = crypto.randomUUID();
  const sourceExt = getFileExtension(file.name);
  const jobDir = `/project/jobs/${jobId}`;
  const inputPath = `${jobDir}/inbox/source.${sourceExt}`;
  const requestPath = `${jobDir}/request.json`;
  const progressPath = `${jobDir}/.progress.json`;
  const resultPath = `${jobDir}/result.json`;

  await pod.createDirectory(jobDir, { recursive: true });
  await pod.createDirectory(`${jobDir}/inbox`, { recursive: true });
  await pod.createDirectory(`${jobDir}/out`, { recursive: true });

  reportProgress(12);

  const inputBytes = await file.arrayBuffer();
  await writePodBinaryFile(pod, inputPath, inputBytes);
  await writePodTextFile(
    pod,
    requestPath,
    JSON.stringify(
      {
        jobId,
        sourcePath: inputPath,
        sourceName: file.name,
        sourceExt,
        targetExt,
      },
      null,
      2
    )
  );
  await writePodTextFile(pod, progressPath, JSON.stringify({ percent: 18 }));

  reportProgress(18);

  let processError = null;
  const progressTimer = window.setInterval(async () => {
    const nextPercent = await readProgressPercent(pod, progressPath);

    if (typeof nextPercent === 'number') {
      reportProgress(nextPercent);
    }
  }, 140);

  try {
    await pod.run('node', ['/project/convert.mjs', jobDir], {
      terminal,
      cwd: '/project',
      echo: false,
    });
  } catch (error) {
    processError = error;
  } finally {
    window.clearInterval(progressTimer);
  }

  const resultRaw = await readPodTextFile(pod, resultPath).catch(() => '');

  if (!resultRaw) {
    throw processError ?? new Error('Conversion failed.');
  }

  const result = JSON.parse(resultRaw);

  if (!result.ok) {
    throw new Error(result.error || 'Conversion failed.');
  }

  const output = Array.isArray(result.outputs) ? result.outputs[0] : null;

  if (!output?.path || !output?.name) {
    throw new Error('No output file generated.');
  }

  const outputBytes = await readPodBinaryFile(pod, output.path);

  reportProgress(100);

  return {
    name: output.name,
    mime: output.mime || 'application/octet-stream',
    blob: new Blob([outputBytes], {
      type: output.mime || 'application/octet-stream',
    }),
  };
}
