import { BrowserPod } from '@leaningtech/browserpod'
import { copyFile } from './utils'

// Initialize the Pod
// VITE_BP_APIKEY is an environmental variable containing your Api Key
// Its value is defined in the file `.env` in the project's main directory
// To get an Api Key, visit https://console.browserpod.io
const pod = await BrowserPod.boot({apiKey:import.meta.env.VITE_BP_APIKEY});

// Create a Terminal
const terminal = await pod.createDefaultTerminal(document.querySelector("#console"));

// Hook the portal to preview the web page in an iframe
const portalIframe = document.getElementById("portal");
const urlDiv = document.getElementById("url");
pod.onPortal(({ url, port }) => {
  urlDiv.innerHTML = `Portal available at <a href="${url}">${url}</a> for local server listening on port ${port}`;
  portalIframe.src = url;
});

// Copy our project files
await pod.createDirectory("/project");
await copyFile(pod, "project/main.js");
await copyFile(pod, "project/package.json");

// Install dependencies
await pod.run("npm", ["install"], {echo:true, terminal:terminal, cwd: "/project"});
// Run the web server
await pod.run("node", ["main.js"], {echo:true, terminal:terminal, cwd: "/project"});
