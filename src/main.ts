class Mp4Muxer {
	#target: WriteTarget;
	#mdat: Box;

	constructor() {
		this.#target = new ArrayBufferWriteTarget();

		this.#target.writeBox({
			type: BoxType.FileType,
			contents: new Uint8Array([
				0x69, 0x73, 0x6f, 0x6d, // mp42
				0x00, 0x00, 0x00, 0x00, // Minor version 0
				0x69, 0x73, 0x6f, 0x32, // iso2
				0x61, 0x76, 0x63, 0x31, // avc1
				0x6d, 0x70, 0x34, 0x31  // mp42
			])
		});

		this.#target.writeBox({
			type: BoxType.Movie,
			children: [{
				type: BoxType.MovieHeader,
				contents: new Uint8Array([
					0x00, // Version
					0x00, 0x00, 0x00, // Flags
					u32(Math.floor(Date.now() / 1000) + 2**31), // Creation time (seconds since January 1, 1904)
					u32(Math.floor(Date.now() / 1000) + 2**31), // Modification time
					u32(1000), // Time scale
					u32(1000), // Duration
					fixed32(1.0), // Preferred rate
					fixed16(1.0), // Preferred volume
					Array(10).fill(0), // Reserved
					[1, 0, 0, // Matrix structure
					 0, 1, 0,
					 0, 0, 1].flatMap(fixed32),
					Array(24).fill(0), // Pre-defined
					u32(1) // Next track ID
				].flat())
			}, {
				type: BoxType.Track,
				children: [{
					type: BoxType.TrackHeader,
					contents: new Uint8Array([
						0x00, // Version
						0x00, 0x00, 0x03, // Flags (enabled + in movie)
						u32(Math.floor(Date.now() / 1000) + 2**31), // Creation time (seconds since January 1, 1904)
						u32(Math.floor(Date.now() / 1000) + 2**31), // Modification time
						u32(1), // Track ID
						u32(0), // Reserved
						u32(1000), // Duration
						Array(8).fill(0), // Reserved
						0x00, 0x00, // Layer
						0x00, 0x00, // Alternate group
						fixed16(1.0),
						0x00, 0x00, // Reserved
						[1, 0, 0, // Matrix structure
						 0, 1, 0,
						 0, 0, 1].flatMap(fixed32),
						fixed32(512), // Track width
						fixed32(512) // Track height
					].flat())
				}, {
					type: BoxType.Media,
					children: [{
						type: BoxType.MediaHeader,
						contents: new Uint8Array([
							0x00, // Version
							0x00, 0x00, 0x00, // Flags
							u32(Math.floor(Date.now() / 1000) + 2**31), // Creation time (seconds since January 1, 1904)
							u32(Math.floor(Date.now() / 1000) + 2**31), // Modification time
							u32(1000), // Time scale
							u32(1000), // Duration
							0x00, 0x00, // Language
							0x00, 0x00 // Pre-defined
						].flat())
					}, {
						type: BoxType.HandlerReference,
						contents: new Uint8Array([
							0x00, // Version
							0x00, 0x00, 0x00, // Flags
							u32(0), // Pre-defined
							ascii('vide'), // Component subtype
							Array(12).fill(0), // Reserved
							ascii('Video track'), 0x00
						].flat())
					}, {
						type: BoxType.MediaInformation,
						children: [{
							type: BoxType.VideoMediaInformationHeader,
							contents: new Uint8Array([
								0x00, // Version
								0x00, 0x00, 0x01, // Flags
								0x00, 0x00, // Graphics mode
								0x00, 0x00, // Opcolor R
								0x00, 0x00, // Opcolor G
								0x00, 0x00, // Opcolor B
							])
						}, {
							type: BoxType.SampleTable,
							children: [{
								type: BoxType.SampleDescription,
								contents: new Uint8Array([
									0x00, // Version
									0x00, 0x00, 0x00, // Flags
									u32(1) // Entry count
								].flat()),
								children: [{
									type: 'avc1',
									contents: new Uint8Array([
										Array(6).fill(0), // Reserved
										0x00, 0x00, // Data reference index
										0x00, 0x00, // Pre-defined
										0x00, 0x00, // Reserved
										Array(12).fill(0), // Pre-defined
										u16(512), // Width
										u16(512), // Height
										u32(0x00480000), // Horizontal resolution
										u32(0x00480000), // Vertical resolution
										u32(0), // Reserved
										u16(1), // Frame count
										Array(32).fill(0), // Compressor name
										u16(0x0018), // Depth
										i16(0xffff), // Pre-defined
									].flat())
								}]
							}]
						}]
					}]
				}]
			}]
		});

		this.#mdat = {
			type: BoxType.MovieData
		};
		this.#target.writeBox(this.#mdat);
	}

	addVideoChunk(chunk: EncodedVideoChunk/*, meta: EncodedVideoChunkMetadata*/) {
		let data = new Uint8Array(chunk.byteLength);
		chunk.copyTo(data);
		this.#target.write(data);
	}

	finalize() {
		let mdatPos = this.#target.offsets.get(this.#mdat);
		let mdatSize = this.#target.pos - mdatPos;
		let endPos = this.#target.pos;
		this.#target.pos = mdatPos;
		this.#target.writeU32(mdatSize);
		this.#target.pos = endPos;

		let buffer = (this.#target as ArrayBufferWriteTarget).finalize();
		return buffer;
	}
}

const u16 = (value: number) => {
	let bytes = new Uint8Array(2);
	let view = new DataView(bytes.buffer);
	view.setUint16(0, value, false);
	return [...bytes];
};

const i16 = (value: number) => {
	let bytes = new Uint8Array(2);
	let view = new DataView(bytes.buffer);
	view.setInt16(0, value, false);
	return [...bytes];
};

const u32 = (value: number) => {
	let bytes = new Uint8Array(4);
	let view = new DataView(bytes.buffer);
	view.setUint32(0, value, false);
	return [...bytes];
};

const fixed16 = (value: number) => {
	let bytes = new Uint8Array(2);
	let view = new DataView(bytes.buffer);
	view.setUint8(0, value);
	view.setUint8(1, value << 8);
	return [...bytes];
};

const fixed32 = (value: number) => {
	let bytes = new Uint8Array(4);
	let view = new DataView(bytes.buffer);
	view.setUint16(0, value, false);
	view.setUint16(2, value << 16, false);
	return [...bytes];
};

const ascii = (text: string) => {
	return Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
};

interface Box {
	type: string,
	contents?: Uint8Array,
	children?: Box[]
}

enum BoxType {
	FileType = 'ftyp',
	Movie = 'moov',
	MovieHeader = 'mvhd',
	Track = 'trak',
	TrackHeader = 'tkhd',
	Media = 'mdia',
	MediaHeader = 'mdhd',
	HandlerReference = 'hdlr',
	MediaInformation = 'minf',
	VideoMediaInformationHeader = 'vmhd',
	SampleTable = 'stbl',
	SampleDescription = 'stsd',
	MovieData = 'mdat'
}

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
			this.writeU32(box.contents.byteLength + 8);
			this.writeAscii(box.type);
			this.write(box.contents);
		} else {
			let startPos = this.pos;
			this.pos += 4;
			this.writeAscii(box.type);

			if (box.contents) this.write(box.contents);
			if (box.children) for (let child of box.children) this.writeBox(child);

			let endPos = this.pos;
			let size = endPos - startPos;
			this.pos = startPos;
			this.writeU32(size);
			this.pos = endPos;
		}
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

export default Mp4Muxer;