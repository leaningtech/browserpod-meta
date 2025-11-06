export type int = number;

export class BinaryFile {
	write(data: ArrayBuffer): Promise<int>;

	read(length: int): Promise<ArrayBuffer>;
  
	getSize(): Promise<int>;

   close(): Promise<void>;
}

export class TextFile {
	write(data: string): Promise<int>;

	read(length: int): Promise<string>;

	getSize(): Promise<int>;

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

   onPortal(cb: ({ url: string, port: int }) => void): void;

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
