export async function copyFile(pod, path) {
  const f = await pod.createFile("/"+path, "binary");
  const resp = await fetch(path);
  const buf = await resp.arrayBuffer();
  await f.write(buf);
  await f.close();
}
