export async function copyFile(pod, path, prefix) {
  const normalizedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const f = await pod.createFile(`${normalizedPrefix}/${path}`, "binary");
  const resp = await fetch(path);
  const buf = await resp.arrayBuffer();
  await f.write(buf);
  await f.close();
}
