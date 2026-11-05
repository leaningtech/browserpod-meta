import { BrowserPod } from '@leaningtech/browserpod'
import { copyFile } from './utils'

// Read the API key
// VITE_BP_APIKEY is an optional environment variable containing your API key
// Its value is defined in the file `.env` in the project's main directory
// To get an API key, visit https://console.browserpod.io
// An empty string would still count as a key, so treat it as no key
const apiKey = import.meta.env.VITE_BP_APIKEY?.trim() || undefined;

// Portals need an API key, so show how to enable the preview instead
const urlDiv = document.getElementById("url");
if (!apiKey) {
  urlDiv.classList.add("warning");
  urlDiv.innerHTML = 'The preview needs an API key. Add <code>VITE_BP_APIKEY</code> to <code>.env</code> and restart the dev server. Get a key at <a href="https://console.browserpod.io">console.browserpod.io</a>.';
}

// Initialize the Pod
// With an API key the Pod can use Portals; without one it runs keyless
// Keyless boot needs opinionatedFetch, as plain fetch fails CORS checks (e.g. during npm install)
const pod = apiKey
  ? await BrowserPod.boot({apiKey})
  : await BrowserPod.boot({network:await BrowserPod.createFetchNetwork({fetch:BrowserPod.opinionatedFetch})});

// Create a Terminal
const terminal = await pod.createDefaultTerminal(document.querySelector("#console"));

// Hook the portal to preview the web page in an iframe
const portalIframe = document.getElementById("portal");
pod.onPortal(({ url, port }) => {
  urlDiv.innerHTML = `Portal available at <a href="${url}">${url}</a> for local server listening on port ${port}`;
  portalIframe.src = url;
});

// Copy our project files
const homePath = "/home/user";
const projectPath = `${homePath}/project`;
await pod.createDirectory(projectPath);
await copyFile(pod, "project/main.js", homePath);
await copyFile(pod, "project/package.json", homePath);

// Install dependencies
await pod.run("npm", ["install"], {echo:true, terminal:terminal, cwd: projectPath});
// Run the web server
await pod.run("node", ["main.js"], {echo:true, terminal:terminal, cwd: projectPath});
