export async function copyFile(pod, path) {
  const file = await pod.createFile(`/${path}`, 'binary');
  const response = await fetch(`/${path}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await file.write(buffer);
  await file.close();
}

export async function writeTextFile(pod, path, contents) {
  const file = await pod.createFile(path, 'text');
  await file.write(contents);
  await file.close();
}
