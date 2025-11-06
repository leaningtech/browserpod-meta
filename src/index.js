const version="0.9.1"
const dynImport = new Function("x", "return import(x)");
const BrowserPod = await dynImport(`https://rt.browserpod.io/${version}/browserpod.js`);
debugger;
export const BrowserPod = BrowserPod.BrowserPod;
export const BinaryFile = BrowserPod.BinaryFile;
export const TextFile = BrowserPod.TextFile;
