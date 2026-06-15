export async function copyFile(pod, path) {
  const f = await pod.createFile("/"+path, "binary");
  const resp = await fetch(path);
  if (!resp.ok) {
    await f.close();
    throw new Error(`Failed to fetch ${path}: ${resp.status} ${resp.statusText}`);
  }
  const buf = await resp.arrayBuffer();
  await f.write(buf);
  await f.close();
}
