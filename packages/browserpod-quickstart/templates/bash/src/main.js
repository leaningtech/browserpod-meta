import { BrowserPod } from '@leaningtech/browserpod'

// Read the API key
// VITE_BP_APIKEY is an optional environment variable containing your API key
// Its value is defined in the file `.env` in the project's main directory
// To get an API key, visit https://console.browserpod.io
// An empty string would still count as a key, so treat it as no key
const apiKey = import.meta.env.VITE_BP_APIKEY?.trim() || undefined;

// Initialize the Pod
// With an API key the Pod can use Portals; without one it runs keyless
// Keyless boot needs opinionatedFetch, as plain fetch fails CORS checks (e.g. during npm install)
const pod = apiKey
  ? await BrowserPod.boot({apiKey})
  : await BrowserPod.boot({network:await BrowserPod.createFetchNetwork({fetch:BrowserPod.opinionatedFetch})});

// Create a Terminal
const terminal = await pod.createDefaultTerminal(document.querySelector("#console"));

// Run an interactive Bash shell
await pod.run("bash", [], {terminal:terminal});
