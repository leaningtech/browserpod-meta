import { BrowserPod } from '@leaningtech/browserpod'

// Initialize the Pod.
// VITE_BP_APIKEY is an environmental variable containing your Api Key.
// You can define it by creating a file called `.env` in the project directory
// with the content `VITE_BP_APIKEY=your-key`.
// To get an Api Key, visit https://console.browserpod.io .
const pod = await BrowserPod.boot({apiKey:import.meta.env.VITE_BP_APIKEY});

// Create an HTML element to use as our Terminal
const terminalElem = document.createElement("pre");
document.body.appendChild(terminalElem);
// Create a Terminal
const terminal = await pod.createDefaultTerminal(terminalElem);

// A simple script that we want to execute inside the Pod
const script = `
const fs = require("node:fs");
console.log("hello from node", process.version);
const rootContents = fs.readdirSync("/");
console.log(rootContents);
process.exit(0);
`;
// Write the script into the Pod's filesystem
const scriptFile = await pod.createFile("/script.js", "utf-8");
await scriptFile.write(script);
await scriptFile.close();
// Run the script
await pod.run("node", ["script.js"], {terminal:terminal});
console.log("done!");
