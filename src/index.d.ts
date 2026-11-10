declare const podNetwork: unique symbol;
export {};

/** A network a pod boots with, from BrowserPod.createEdgeNetwork or BrowserPod.createFetchNetwork. It serves one pod. */
export interface PodNetwork {
	readonly [podNetwork]: true;
}

/**
 * A process started by BrowserPod.run. Awaiting it resolves to the exit code. It rejects when the program cannot
 * start or is killed by a signal.
 */
export interface Process {
	then(onFulfilled?: (exitCode: number) => void, onRejected?: (reason: unknown) => void): void;
}

export interface Terminal {
	/** Writes to the terminal's output, not to the input of the processes running on it. */
	write(data: string | Uint8Array): void;
}

export interface BinaryFile {
	/** Resolves to the number of bytes written. */
	write(data: ArrayBuffer): Promise<number>;
	/** Reads up to length bytes; the result is shorter at the end of the file. */
	read(length: number): Promise<ArrayBuffer>;

	getSize(): Promise<number>;

	close(): Promise<void>;
}

export interface TextFile {
	/** Writes data encoded as UTF-8 and resolves to the number of bytes written. */
	write(data: string): Promise<number>;
	/** Reads up to length bytes and decodes them as UTF-8. */
	read(length: number): Promise<string>;

	/** Resolves to the size in bytes. */
	getSize(): Promise<number>;

	close(): Promise<void>;
}

export type FetchInit = RequestInit & {
	/** The browser's fetch() */
	defaultFetch: typeof fetch;
};

export interface BootOptions {
	/** Node.js major version to run inside the pod. Only "22" is available. */
	nodeVersion?: string;
	/** BrowserPod API key: the pod boots on an edge network. Omitted, with no network: on a fetch network. */
	apiKey?: string;
	/** The pod's network, instead of apiKey. */
	network?: PodNetwork;
	/**
	 * Key of the pod's persistent storage. The same key resumes the same disk.
	 * Omitted or empty: ephemeral, a fresh disk on every boot.
	 */
	storageKey?: string;
	/**
	 * URL or path of an ext2 image mounted on /home, over http(s) or ws(s). The image is a read-only base; writes go
	 * to the pod's storage.
	 */
	userImage?: string;
}

export interface EdgeNetworkOptions {
	/** BrowserPod API key. */
	apiKey: string;
}

export interface FetchNetworkOptions {
	/** Sends the pod's requests. Defaults to the browser's fetch(), which it receives as init.defaultFetch. */
	fetch?: (url: string, init: FetchInit) => Promise<Response>;
}

export interface RunOptions {
	terminal: Terminal;
	/** Entries of the form "KEY=value", added to the default environment. */
	env?: Array<string>;
	/** Defaults to "/home/user". */
	cwd?: string;
	/** Writes the command line to the terminal. */
	echo?: boolean;
}

export interface CustomTerminalOptions {
	/** Defaults to 80. */
	cols?: number;
	/** Defaults to 24. */
	rows?: number;
	/** Receives the terminal's output. vt is the ID of the pod terminal that produced it, absent for Terminal.write. */
	onOutput: (buffer: Uint8Array, vt?: number) => void;
}

export class BrowserPod {
	private constructor();

	static boot(opts?: BootOptions): Promise<BrowserPod>;

	/** A network through BrowserPod's edge, where listening programs get a portal. */
	static createEdgeNetwork(opts: EdgeNetworkOptions): Promise<PodNetwork>;

	/** A network that reaches out only over HTTP, HTTPS and WebSocket, through a fetch() from the page. */
	static createFetchNetwork(opts?: FetchNetworkOptions): Promise<PodNetwork>;

	/** A fetch for createFetchNetwork that adapts the requests to known origins, such as the npm registry. */
	static opinionatedFetch(url: string, init: FetchInit): Promise<Response>;

	/** Runs executable, an absolute path or a name looked up in PATH. */
	run(executable: string, args: Array<string>, opts: RunOptions): Process;

	onPortal(cb: (args: { url: string; port: number }) => void): void;
	/** Called when a program in the pod runs xdg-open. */
	onOpen(cb: (urlOrPath: string) => void): void;

	/** path is absolute. Creating an existing directory succeeds. */
	createDirectory(
		path: string,
		opts?: { recursive?: boolean }
	): Promise<void>;

	/** Creates the file at the absolute path, truncating an existing one. */
	createFile(path: string, mode: "binary"): Promise<BinaryFile>;
	createFile(path: string, mode: "utf-8"): Promise<TextFile>;

	/** Opens the existing file at the absolute path. */
	openFile(path: string, mode: "binary"): Promise<BinaryFile>;
	openFile(path: string, mode: "utf-8"): Promise<TextFile>;

	/** An xterm.js terminal in consoleDiv, sized to it. */
	createDefaultTerminal(consoleDiv: HTMLElement): Promise<Terminal>;

	/** A headless terminal whose output goes to opts.onOutput. */
	createCustomTerminal(opts: CustomTerminalOptions): Promise<Terminal>;
}
