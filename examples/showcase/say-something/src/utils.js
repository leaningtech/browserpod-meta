export async function copyFile(pod, path) {
  try {
    console.log(`Fetching ${path}...`);
    const resp = await fetch(path);
    if (!resp.ok) {
      throw new Error(`Fetch failed: ${resp.status} ${resp.statusText}`);
    }
    console.log(`Creating file /${path}...`);
    const f = await pod.createFile("/"+path, "binary");
    console.log(`Reading buffer...`);
    const buf = await resp.arrayBuffer();
    console.log(`Writing buffer (${buf.byteLength} bytes)...`);
    await f.write(buf);
    console.log(`Closing file...`);
    await f.close();
    console.log(`✓ Copied ${path}`);
  } catch (err) {
    console.error(`Failed to copy ${path}:`, err);
    throw err;
  }
}
