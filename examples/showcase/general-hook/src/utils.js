export async function copyFile(pod, path) {
  const f = await pod.createFile("/" + path, "binary");
  const resp = await fetch(path);
  const buf = await resp.arrayBuffer();
  await f.write(buf);
  await f.close();
}

export async function writeTextFile(pod, podPath, content) {
  const f = await pod.createFile(podPath, "utf-8");
  await f.write(content);
  await f.close();
}

// Copy a public asset to a specific destination path in the pod
export async function copyFileTo(pod, srcPath, destPodPath) {
  const f = await pod.createFile(destPodPath, "binary");
  const resp = await fetch(srcPath);
  const buf = await resp.arrayBuffer();
  await f.write(buf);
  await f.close();
}
