/** Awaiting a Process resolves to its exit code once it exits. */
export interface Process {
	then(
		onExit: (exitCode: number) => void,
		onError?: (error: unknown) => void
	): void;
}

export interface Terminal {
	write(data: string | Uint8Array): void;
}

export interface BinaryFile {
	write(data: ArrayBuffer): Promise<number>;
	read(length: number): Promise<ArrayBuffer>;

	getSize(): Promise<number>;

	close(): Promise<void>;
}

export interface TextFile {
	write(data: string): Promise<number>;

	read(length: number): Promise<string>;

	getSize(): Promise<number>;

	close(): Promise<void>;
}

export interface BootOptions {
	/** Node.js major version to run inside the pod. */
	nodeVersion?: string;
	/** BrowserPod API key. */
	apiKey: string;
	/** Alternative portal origin, such as "https://main.browserportal.io", used when self-hosting. */
	apiOrigin?: string;
	/** Persistence key for the pod's disk, stored in OPFS (IndexedDB if unsupported). Omit for an ephemeral pod. */
	storageKey?: string;
	/** Disk image to be mounted on /home. */
	userImage?: string;
}

export interface RunOptions {
	terminal: Terminal;
	env?: Array<string>;
	cwd?: string;
	echo?: boolean;
}

export class BrowserPod {
	static boot(opts: BootOptions): Promise<BrowserPod>;

	run(executable: string, args: Array<string>, opts: RunOptions): Process;

	onPortal(cb: ( args: { url: string, port: number }) => void): void;
	onOpen(cb: ( urlOrPath: string ) => void): void;

	createDirectory(
		path: string,
		opts?: { recursive?: boolean }
	): Promise<void>;

	createFile(path: string, mode: string): Promise<BinaryFile | TextFile>;

	openFile(path: string, mode: string): Promise<BinaryFile | TextFile>;

	createDefaultTerminal(
		consoleDiv: HTMLElement,
	): Promise<Terminal>;

	createCustomTerminal(opts: {
		cols?: number;
		rows?: number;
		onOutput: (buffer: Uint8Array, vt?: number) => void;
	}): Promise<Terminal>;
}
