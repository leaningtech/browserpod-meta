// BrowserPod needs SharedArrayBuffer and workers, so nothing here is server rendered.
// adapter-static still prerenders the shell for the static host.
export const ssr = false;
export const prerender = true;
