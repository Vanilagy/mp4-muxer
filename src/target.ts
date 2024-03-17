export type Target = ArrayBufferTarget | StreamTarget | FileSystemWritableFileStreamTarget;

export class ArrayBufferTarget {
	buffer: ArrayBuffer = null;
}

export class StreamTarget {
	constructor(public options: {
		onData?: (data: Uint8Array, position: number) => void,
		chunked?: boolean,
		chunkSize?: number
	}) {}
}

export class FileSystemWritableFileStreamTarget {
	constructor(
		public stream: FileSystemWritableFileStream,
		public options?: { chunkSize?: number }
	) {}
}
