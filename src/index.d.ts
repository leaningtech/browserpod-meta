export interface Process {}

export interface Terminal {
	write(data: string): void;
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

export interface BootOptions {
	/** Node.js major version to run inside the pod. */
	nodeVersion?: string;
	/** BrowserPod API key. */
	apiKey: string;
	/** Alternative portal domain, used when self-hosting. */
	apiDomain?: string;
	/** Persistence key for the pod's disk in IndexedDB. */
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

	run(executable: string, args: Array<string>, opts: RunOptions): Promise<Process>;

	onPortal(cb: ( args: { url: string, port: number }) => void): void;
	onOpen(cb: ( urlOrPath: string ) => void): void;

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

	createDefaultTerminal(
		consoleDiv: HTMLElement,
	): Promise<Terminal>;

	createCustomTerminal(opts: {
		cols?: number;
		rows?: number;
		onOutput: (buffer: ArrayBuffer, vt?: unknown) => void;
	}): Promise<Terminal>;
}
