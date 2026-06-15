export function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeArrayBuffer(data) {
  if (data instanceof ArrayBuffer) {
    return data;
  }

  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }

  throw new TypeError('Expected binary data.');
}

export async function writePodTextFile(pod, path, content) {
  let file;

  try {
    file = await pod.createFile(path, 'utf-8');
    await file.write(content);
  } finally {
    if (file) {
      await file.close();
    }
  }
}

export async function writePodBinaryFile(pod, path, data) {
  let file;

  try {
    file = await pod.createFile(path, 'binary');
    await file.write(normalizeArrayBuffer(data));
  } finally {
    if (file) {
      await file.close();
    }
  }
}

export async function readPodTextFile(pod, path) {
  let file;

  try {
    file = await pod.openFile(path, 'utf-8');
    const size = await file.getSize();
    return await file.read(size);
  } finally {
    if (file) {
      await file.close();
    }
  }
}

export async function readPodBinaryFile(pod, path) {
  let file;

  try {
    file = await pod.openFile(path, 'binary');
    const size = await file.getSize();
    return await file.read(size);
  } finally {
    if (file) {
      await file.close();
    }
  }
}

export async function copyPublicFileToPod(pod, publicPath, podPath) {
  const response = await fetch(publicPath);

  if (!response.ok) {
    throw new Error(`Could not load ${publicPath}.`);
  }

  const bytes = await response.arrayBuffer();
  await writePodBinaryFile(pod, podPath, bytes);
}

export function formatError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}
