export type Target = ArrayBufferTarget | StreamTarget | FileSystemWritableFileStreamTarget;

export class ArrayBufferTarget {
	buffer: ArrayBuffer = null;
}

export class StreamTarget {
	constructor(
		public onData: (data: Uint8Array, position: number) => void,
		public onDone?: () => void,
		public options?: { chunked?: true, chunkSize?: number }
	) {}
}

export class FileSystemWritableFileStreamTarget {
	constructor(
		public stream: FileSystemWritableFileStream,
		public options?: { chunkSize?: number }
	) {}
}