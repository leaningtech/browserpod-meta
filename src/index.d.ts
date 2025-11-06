export class Terminal {}
export class Process {}

export class BinaryFile {
	write(data: ArrayBuffer): Promise<number>;

	read(length: number): Promise<ArrayBuffer>;
  
	getSize(): Promise<number>;

   close(): Promise<void>;
}

export class TextFile {
	write(data: string): Promise<number>;

	read(length: number): Promise<string>;

	getSize(): Promise<number>;

	close(): Promise<void>;
}


export class BrowserPod {
	static boot(opts: {
		nodeVersion?: string;
		apiKey: string;
  	}): Promise<BrowserPod>;

	run(
		executable: string,
		args: Array<string>,
		opts: {
				terminal: Terminal,
				env?: Array<string>;
				cwd?: string,
				echo?: boolean
			}
  	): Promise<Process>;

   onPortal(cb: ( args: { url: string, port: number }) => void): void;

	createDirectory(
		path: string,
		opts?: { recursive?: boolean }
  	): Promise<void>;

	createFile(path: string, mode: string): Promise<BinaryFile | TextFile>;

	openFile(path: string, mode: string): Promise<BinaryFile | TextFile>;

	createDefaultTerminal(
		consoleDiv: HTMLElement,
	): Promise<Terminal>;
}

