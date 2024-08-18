export type Target = ArrayBufferTarget | StreamTarget | FileSystemWritableFileStreamTarget;

export class ArrayBufferTarget {
	buffer: ArrayBuffer = null;
}

export class StreamTarget {
	constructor(public options: {
		onData?: (data: Uint8Array, position: number) => void,
		chunked?: boolean,
		chunkSize?: number
	}) {
		if (typeof options !== 'object') {
			throw new TypeError('StreamTarget requires an options object to be passed to its constructor.');
		}
		if (options.onData) {
			if (typeof options.onData !== 'function') {
				throw new TypeError('options.onData, when provided, must be a function.');
			}
			if (options.onData.length < 2) {
				// Checking the amount of parameters here is an important validation step as it catches a common error
				// where people do not respect the position argument.
				throw new TypeError(
					'options.onData, when provided, must be a function that takes in at least two arguments (data and '
					+ 'position). Ignoring the position argument, which specifies the byte offset at which the data is '
					+ 'to be written, can lead to broken outputs.'
				);
			}
		}
		if (options.chunked !== undefined && typeof options.chunked !== 'boolean') {
			throw new TypeError('options.chunked, when provided, must be a boolean.');
		}
		if (options.chunkSize !== undefined && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
			throw new TypeError('options.chunkSize, when provided, must be a positive integer.');
		}
	}
}

export class FileSystemWritableFileStreamTarget {
	constructor(
		public stream: FileSystemWritableFileStream,
		public options?: { chunkSize?: number }
	) {
		if (!(stream instanceof FileSystemWritableFileStream)) {
			throw new TypeError('FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.');
		}
		if (options !== undefined && typeof options !== 'object') {
			throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");
		}
		if (options) {
			if (options.chunkSize !== undefined && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
				throw new TypeError('options.chunkSize, when provided, must be a positive integer');
			}
		}
	}
}
