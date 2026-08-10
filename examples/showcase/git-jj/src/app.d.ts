// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}

	interface ImportMetaEnv {
		/** BrowserPod API key, read at boot. Set it in `.env` (see `.env.example`). */
		readonly VITE_BP_APIKEY?: string;
	}
}

export {};
