import { Box } from "./boxes";

export abstract class WriteTarget {
	pos = 0;
	#helper = new Uint8Array(8);
	#helperView = new DataView(this.#helper.buffer);

	/**
	 * Stores the position from the start of the file to where boxes elements have been written. This is used to
	 * rewrite/edit elements that were already added before, and to measure sizes of things.
	 */
	offsets = new WeakMap<Box, number>();

	/** Writes the given data to the target, at the current position. */
	abstract write(data: Uint8Array): void;
	/** Sets the current position for future writes to a new one. */
	abstract seek(newPos: number): void;

	writeU32(value: number) {
		this.#helperView.setUint32(0, value, false);
		this.write(this.#helper.subarray(0, 4));
	}

	writeU64(value: number) {
		this.#helperView.setUint32(0, Math.floor(value / 2**32), false);
		this.#helperView.setUint32(4, value, false);
		this.write(this.#helper.subarray(0, 8));
	}

	writeAscii(text: string) {
		for (let i = 0; i < text.length; i++) {
			this.#helperView.setUint8(i % 8, text.charCodeAt(i));
			if (i % 8 === 7) this.write(this.#helper);
		}

		if (text.length % 8 !== 0) {
			this.write(this.#helper.subarray(0, text.length % 8));
		}
	}

	writeBox(box: Box) {
		this.offsets.set(box, this.pos);

		if (box.contents && !box.children) {
			this.writeBoxHeader(box, box.size ?? box.contents.byteLength + 8);
			this.write(box.contents);
		} else {
			let startPos = this.pos;
			this.writeBoxHeader(box, 0);

			if (box.contents) this.write(box.contents);
			if (box.children) for (let child of box.children) if (child) this.writeBox(child);

			let endPos = this.pos;
			let size = box.size ?? endPos - startPos;
			this.pos = startPos;
			this.writeBoxHeader(box, size);
			this.pos = endPos;
		}
	}

	writeBoxHeader(box: Box, size: number) {
		this.writeU32(box.largeSize ? 1 : size);
		this.writeAscii(box.type);
		if (box.largeSize) this.writeU64(size);
	}

	patchBox(box: Box) {
		let endPos = this.pos;
		this.pos = this.offsets.get(box);
		this.writeBox(box);
		this.pos = endPos;
	}
}

export class ArrayBufferWriteTarget extends WriteTarget {
	#buffer = new ArrayBuffer(2**16);
	#bytes = new Uint8Array(this.#buffer);

	constructor() {
		super();
	}

	ensureSize(size: number) {
		let newLength = this.#buffer.byteLength;
		while (newLength < size) newLength *= 2;

		if (newLength === this.#buffer.byteLength) return;

		let newBuffer = new ArrayBuffer(newLength);
		let newBytes = new Uint8Array(newBuffer);
		newBytes.set(this.#bytes, 0);

		this.#buffer = newBuffer;
		this.#bytes = newBytes;
	}

	write(data: Uint8Array) {
		this.ensureSize(this.pos + data.byteLength);

		this.#bytes.set(data, this.pos);
		this.pos += data.byteLength;
	}

	seek(newPos: number) {
		this.pos = newPos;
	}

	finalize() {
		this.ensureSize(this.pos);
		return this.#buffer.slice(0, this.pos);
	}
}

const FILE_CHUNK_SIZE = 2**24;
const MAX_CHUNKS_AT_ONCE = 2;

interface FileChunk {
	start: number,
	written: FileChunkSection[],
	data: Uint8Array,
	shouldFlush: boolean
}

interface FileChunkSection {
	start: number,
	end: number
}

/**
 * A WriteTarget which writes directly to a file on disk, using the FileSystemWritableFileStream provided by the
 * amazing File System Access API. It minimizes actual writes to disk by caching chunks of data in RAM and then flushing
 * only large chunks of data to disk periodically.
 */
export class FileSystemWritableFileStreamWriteTarget extends WriteTarget {
	#stream: FileSystemWritableFileStream;
	/**
	 * The file is divided up into fixed-size chunks, whose contents are first filled in RAM and then flushed to disk.
	 * A chunk is flushed to disk if all of its contents have been written.
	 */
	#chunks: FileChunk[] = [];

	constructor(stream: FileSystemWritableFileStream) {
		super();

		this.#stream = stream;
	}

	write(data: Uint8Array) {
		this.writeDataIntoChunks(data, this.pos);
		this.flushChunks();

		this.pos += data.byteLength;
	}

	writeDataIntoChunks(data: Uint8Array, position: number) {
		// First, find the chunk to write the data into, or create one if none exists
		let chunkIndex = this.#chunks.findIndex(x => x.start <= position && position < x.start + FILE_CHUNK_SIZE);
		if (chunkIndex === -1) chunkIndex = this.createChunk(position);
		let chunk = this.#chunks[chunkIndex];

		// Figure out how much to write to the chunk, and then write to the chunk
		let relativePosition = position - chunk.start;
		let toWrite = data.subarray(0, Math.min(FILE_CHUNK_SIZE - relativePosition, data.byteLength));
		chunk.data.set(toWrite, relativePosition);

		// Create a section describing the region of data that was just written to
		let section: FileChunkSection = {
			start: relativePosition,
			end: relativePosition + toWrite.byteLength
		};
		insertSectionIntoFileChunk(chunk, section);

		// Queue chunk for flushing to disk if it has been fully written to
		if (chunk.written[0].start === 0 && chunk.written[0].end === FILE_CHUNK_SIZE) {
			chunk.shouldFlush = true;
		}

		// Make sure we don't hold too many chunks in memory at once to keep memory usage down
		if (this.#chunks.length > MAX_CHUNKS_AT_ONCE) {
			// Flush all but the last chunk
			for (let i = 0; i < this.#chunks.length-1; i++) {
				this.#chunks[i].shouldFlush = true;
			}
			this.flushChunks();
		}

		// If the data didn't fit in one chunk, recurse with the remaining datas
		if (toWrite.byteLength < data.byteLength) {
			this.writeDataIntoChunks(data.subarray(toWrite.byteLength), position + toWrite.byteLength);
		}
	}

	createChunk(includesPosition: number) {
		let start = Math.floor(includesPosition / FILE_CHUNK_SIZE) * FILE_CHUNK_SIZE;
		let chunk: FileChunk = {
			start,
			data: new Uint8Array(FILE_CHUNK_SIZE),
			written: [],
			shouldFlush: false
		};
		this.#chunks.push(chunk);
		this.#chunks.sort((a, b) => a.start - b.start);

		return this.#chunks.indexOf(chunk);
	}

	flushChunks(force = false) {
		for (let i = 0; i < this.#chunks.length; i++) {
			let chunk = this.#chunks[i];
			if (!chunk.shouldFlush && !force) continue;

			for (let section of chunk.written) {
				this.#stream.write({
					type: 'write',
					data: chunk.data.subarray(section.start, section.end),
					position: chunk.start + section.start
				});
			}
			this.#chunks.splice(i--, 1);
		}
	}

	seek(newPos: number) {
		this.pos = newPos;
	}

	finalize() {
		this.flushChunks(true);
	}
}

const insertSectionIntoFileChunk = (chunk: FileChunk, section: FileChunkSection) => {
	let low = 0;
	let high = chunk.written.length - 1;
	let index = -1;

	// Do a binary search to find the last section with a start not larger than `section`'s start
	while (low <= high) {
		let mid = Math.floor(low + (high - low + 1) / 2);

		if (chunk.written[mid].start <= section.start) {
			low = mid + 1;
			index = mid;
		} else {
			high = mid - 1;
		}
	}

	// Insert the new section
	chunk.written.splice(index + 1, 0, section);
	if (index === -1 || chunk.written[index].end < section.start) index++;

	// Merge overlapping sections
	while (index < chunk.written.length - 1 && chunk.written[index].end >= chunk.written[index + 1].start) {
		chunk.written[index].end = Math.max(chunk.written[index].end, chunk.written[index + 1].end);
		chunk.written.splice(index + 1, 1);
	}
};

/**
 * This WriteTarget will fire a callback every time it is flushed, sending out all of the new data written since the
 * last flush. This is useful for streaming applications.
 */
export class StreamingWriteTarget extends WriteTarget {
	#sections: {
		data: Uint8Array,
		start: number
	}[] = [];
	#onFlush: (data: Uint8Array, offset: number, done: boolean) => void;

	constructor(onFlush: (data: Uint8Array, offset: number, done: boolean) => void) {
		super();

		this.#onFlush = onFlush;
	}

	write(data: Uint8Array) {
		this.#sections.push({
			data: data.slice(),
			start: this.pos
		});
		this.pos += data.byteLength;
	}

	seek(newPos: number) {
		this.pos = newPos;
	}

	flush(done: boolean) {
		if (this.#sections.length === 0) return;

		let chunks: {
			start: number,
			size: number,
			data?: Uint8Array
		}[] = [];
		let sorted = [...this.#sections].sort((a, b) => a.start - b.start);

		chunks.push({
			start: sorted[0].start,
			size: sorted[0].data.byteLength
		});

		// Figure out how many contiguous chunks we have
		for (let i = 1; i < sorted.length; i++) {
			let lastChunk = chunks[chunks.length - 1];
			let section = sorted[i];

			if (section.start <= lastChunk.start + lastChunk.size) {
				lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
			} else {
				chunks.push({
					start: section.start,
					size: section.data.byteLength
				});
			}
		}

		for (let chunk of chunks) {
			chunk.data = new Uint8Array(chunk.size);

			// Make sure to write the data in the correct order for correct overwriting
			for (let section of this.#sections) {
				// Check if the section is in the chunk
				if (chunk.start <= section.start && section.start < chunk.start + chunk.size) {
					chunk.data.set(section.data, section.start - chunk.start);
				}
			}

			let isLastFlush = done && chunk === chunks[chunks.length - 1];
			this.#onFlush(chunk.data, chunk.start, isLastFlush);
		}

		this.#sections.length = 0;
	}
}