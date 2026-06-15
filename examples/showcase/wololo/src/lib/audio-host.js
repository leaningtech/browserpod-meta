import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { sanitizeBaseName } from './conversion-registry.js';

let ffmpeg = null;
let ffmpegLoadPromise = null;
let ffmpegAssetPromise = null;

const FFMPEG_BASE_URL =
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

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

async function ensureFfmpeg(onProgress = () => {}) {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
  }

  if (!ffmpegAssetPromise) {
    ffmpegAssetPromise = Promise.all([
      toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    ]).catch((error) => {
      ffmpegAssetPromise = null;
      throw error;
    });
  }

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = ffmpegAssetPromise
      .then(([coreURL, wasmURL]) =>
        ffmpeg.load({
          coreURL,
          wasmURL,
        })
      )
      .catch((error) => {
        ffmpegLoadPromise = null;
        throw error;
      });
  }

  onProgress(10);
  await ffmpegLoadPromise;
  return ffmpeg;
}

function getOutputName(inputName, targetExt) {
  return `${sanitizeBaseName(inputName)}.${targetExt}`;
}

function getMimeType(targetExt) {
  return targetExt === 'mp3' ? 'audio/mpeg' : 'audio/wav';
}

function getCommand(sourceExt, targetExt, inputPath, outputPath) {
  if (sourceExt === 'wav' && targetExt === 'mp3') {
    return ['-i', inputPath, '-codec:a', 'libmp3lame', '-q:a', '2', outputPath];
  }

  if (sourceExt === 'mp3' && targetExt === 'wav') {
    return ['-i', inputPath, '-acodec', 'pcm_s16le', outputPath];
  }

  throw new Error('Unsupported audio conversion.');
}

export async function convertAudioInBrowser({
  file,
  sourceExt,
  targetExt,
  onProgress = () => {},
}) {
  const reportProgress = createProgressReporter(onProgress);
  const ffmpegInstance = await ensureFfmpeg(reportProgress);
  const inputPath = `input.${sourceExt}`;
  const outputPath = `output.${targetExt}`;
  const outputName = getOutputName(file.name, targetExt);
  const inputBytes = new Uint8Array(await file.arrayBuffer());

  reportProgress(20);
  await ffmpegInstance.writeFile(inputPath, inputBytes);

  const progressHandler = ({ progress }) => {
    if (typeof progress === 'number' && Number.isFinite(progress)) {
      reportProgress(24 + progress * 68);
    }
  };

  ffmpegInstance.on('progress', progressHandler);

  try {
    const exitCode = await ffmpegInstance.exec(
      getCommand(sourceExt, targetExt, inputPath, outputPath)
    );

    if (exitCode !== 0) {
      throw new Error('Audio conversion failed.');
    }
  } finally {
    ffmpegInstance.off('progress', progressHandler);
  }

  reportProgress(94);

  const outputBytes = await ffmpegInstance.readFile(outputPath);

  try {
    await ffmpegInstance.deleteFile(inputPath);
  } catch {}

  try {
    await ffmpegInstance.deleteFile(outputPath);
  } catch {}

  reportProgress(100);

  return {
    name: outputName,
    mime: getMimeType(targetExt),
    blob: new Blob([outputBytes], {
      type: getMimeType(targetExt),
    }),
  };
}
