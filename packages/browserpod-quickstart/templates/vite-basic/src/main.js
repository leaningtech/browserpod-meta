import { BrowserPod } from '@leaningtech/browserpod'

// Initialize the Pod
// VITE_BP_APIKEY is an environmental variable containing your Api Key
// Its value is defined in the file `.env` in the project's main directory
// To get an Api Key, visit https://console.browserpod.io
const pod = await BrowserPod.boot({apiKey:import.meta.env.VITE_BP_APIKEY});

// Create a Terminal
const terminal = await pod.createDefaultTerminal(document.querySelector("#console"));

// Run Node's REPL
await pod.run("node", [], {terminal:terminal});
