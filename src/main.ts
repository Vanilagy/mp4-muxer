const TIMESTAMP_OFFSET = 2_082_848_400; // Seconds between Jan 1 1904 and Jan 1 1970
const MAX_CHUNK_LENGTH = 500_000; // In microseconds
const FIRST_TIMESTAMP_BEHAVIORS = ['strict',  'offset', 'permissive'] as const;

interface SampleRecord {
	timestamp: number,
	size: number
}
interface Chunk {
	startTimestamp: number,
	sampleData: Uint8Array[],
	sampleCount: number,
	offset?: number
}

interface Mp4MuxerOptions {
	target: 'buffer',
	video?: {
		width: number,
		height: number
		frameRate?: number
	},
	audio?: {
		numberOfChannels: number,
		sampleRate: number,
		bitDepth?: number
	},
	firstTimestampBehavior?: typeof FIRST_TIMESTAMP_BEHAVIORS[number]
}

class Mp4Muxer {
	#options: Mp4MuxerOptions;
	#target: WriteTarget;
	#mdat: Box;
	#videoDecoderConfig: Uint8Array;
	#videoSampleRecords: SampleRecord[] = [];
	#chunks: Chunk[] = [];
	#currentVideoChunk: Chunk;

	constructor(options: Mp4MuxerOptions) {
		this.#options = options;
		this.#target = new ArrayBufferWriteTarget();

		this.#target.writeBox({
			type: BoxType.FileType,
			contents: new Uint8Array([
				0x6d, 0x70, 0x34, 0x32, // mp42
				0x00, 0x00, 0x00, 0x00, // Minor version 0
				0x69, 0x73, 0x6f, 0x6d, // isom
				0x61, 0x76, 0x63, 0x31, // avc1
				0x6d, 0x70, 0x34, 0x32, // mp42
				0x6d, 0x70, 0x34, 0x31  // mp41
			])
		});

		this.#mdat = {
			type: BoxType.MovieData,
			largeSize: true
		};
		this.#target.writeBox(this.#mdat);
	}

	addVideoChunk(sample: EncodedVideoChunk, meta: EncodedVideoChunkMetadata) {
		if (!this.#currentVideoChunk || sample.timestamp - this.#currentVideoChunk.startTimestamp >= MAX_CHUNK_LENGTH) {
			if (this.#currentVideoChunk) this.#writeChunk(this.#currentVideoChunk);
			this.#currentVideoChunk = { startTimestamp: sample.timestamp, sampleData: [], sampleCount: 0 };
		}

		let data = new Uint8Array(sample.byteLength);
		sample.copyTo(data);

		this.#currentVideoChunk.sampleData.push(data);
		this.#currentVideoChunk.sampleCount++;

		if (meta.decoderConfig?.description) {
			this.#videoDecoderConfig = new Uint8Array(meta.decoderConfig.description as ArrayBuffer);
		}

		this.#videoSampleRecords.push({
			timestamp: sample.timestamp / 1e6,
			size: data.byteLength
		});
	}

	#writeChunk(chunk: Chunk) {
		chunk.offset = this.#target.pos;
		for (let bytes of chunk.sampleData) this.#target.write(bytes);
		chunk.sampleData = null;

		this.#chunks.push(chunk);
	}

	finalize() {
		this.#writeChunk(this.#currentVideoChunk);

		let mdatPos = this.#target.offsets.get(this.#mdat);
		let mdatSize = this.#target.pos - mdatPos;
		this.#mdat.size = mdatSize;
		this.#target.patchBox(this.#mdat);

		this.#writeMovieBox();

		let buffer = (this.#target as ArrayBufferWriteTarget).finalize();
		return buffer;
	}

	#writeMovieBox() {
		const timescale = 1000;

		let current: SampleRecord[] = [];
		let entries: { sampleCount: number, sampleDelta: number }[] = [];
		for (let sample of this.#videoSampleRecords) {
			current.push(sample);

			if (current.length === 1) continue;

			let referenceDelta = timestampToUnits(current[1].timestamp - current[0].timestamp, timescale);
			let newDelta = timestampToUnits(sample.timestamp - current[current.length - 2].timestamp, timescale);
			if (newDelta !== referenceDelta) {
				entries.push({ sampleCount: current.length - 1, sampleDelta: referenceDelta });
				current = current.slice(-2);
			}
		}

		entries.push({
			sampleCount: current.length,
			sampleDelta: Math.floor(
				timestampToUnits((current[1]?.timestamp ?? current[0].timestamp) - current[0].timestamp, timescale)
			)
		});

		let timeToSampleBox: Box = {
			type: BoxType.TimeToSample,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x00, // Flags
				u32(entries.length),
				...entries.flatMap(x => [u32(x.sampleCount), u32(x.sampleDelta)])
			].flat())
		};

		let syncSampleBox: Box = {
			type: BoxType.SyncSample,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x00, // Flags
				u32(1), // Entry count
				u32(1), // Sample number
			].flat())
		};

		let compactlyCodedChunks = this.#chunks.reduce<{
			firstChunk: number,
			samplesPerChunk: number
		}[]>((acc, next, index) => {
			if (acc.length === 0 || acc[acc.length - 1].samplesPerChunk !== next.sampleCount) return [
				...acc,
				{ firstChunk: index + 1, samplesPerChunk: next.sampleCount }
			];
			return acc;
		}, []);

		let sampleToChunkBox: Box = {
			type: BoxType.SampleToChunk,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x00, // Flags
				u32(compactlyCodedChunks.length), // Entry count
				...compactlyCodedChunks.flatMap(x => [
					u32(x.firstChunk),
					u32(x.samplesPerChunk),
					u32(1) // Sample description index
				]),
			].flat())
		};

		let sampleSizeBox: Box = {
			type: BoxType.SampleSize,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x00, // Flags
				u32(0), // Sample size
				u32(this.#videoSampleRecords.length), // Sample count
				this.#videoSampleRecords.flatMap(x => u32(x.size))
			].flat())
		};

		let chunkOffsetBox: Box = {
			type: BoxType.ChunkOffset,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x00, // Flags,
				u32(this.#chunks.length), // Entry count
				this.#chunks.flatMap(x => u32(x.offset))
			].flat())
		};

		let duration = timestampToUnits(
			this.#videoSampleRecords[this.#videoSampleRecords.length - 1].timestamp,
			timescale
		);

		let mediaHeaderBox: Box = {
			type: BoxType.MediaHeader,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x00, // Flags
				u32(Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET), // Creation time
				u32(Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET), // Modification time
				u32(timescale),
				u32(duration),
				0b01010101, 0b11000100, // Language ("und", undetermined)
				0x00, 0x00 // Pre-defined
			].flat())
		};

		let handlerReferenceBox: Box = {
			type: BoxType.HandlerReference,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x00, // Flags
				u32(0), // Pre-defined
				ascii('vide'), // Component subtype
				Array(12).fill(0), // Reserved
				ascii('Video track', true)
			].flat())
		};

		let mediaInformationHeaderBox: Box = {
			type: BoxType.VideoMediaInformationHeader,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x01, // Flags
				0x00, 0x00, // Graphics mode
				0x00, 0x00, // Opcolor R
				0x00, 0x00, // Opcolor G
				0x00, 0x00, // Opcolor B
			])
		};

		let dataInformationBox: Box = {
			type: BoxType.DataInformation,
			children: [{
				type: BoxType.DataReference,
				contents: new Uint8Array([
					0x00, // Version
					0x00, 0x00, 0x00, // Flags
					u32(1) // Entry count
				].flat()),
				children: [{
					type: 'url ',
					contents: new Uint8Array([
						0x00, 0x00, 0x00, // Flags
						ascii('', true)
					].flat())
				}]
			}]
		};

		let sampleDescriptionBox = {
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
					u16(this.#options.video.width), // Width
					u16(this.#options.video.height), // Height
					u32(0x00480000), // Horizontal resolution
					u32(0x00480000), // Vertical resolution
					u32(0), // Reserved
					u16(1), // Frame count
					Array(32).fill(0), // Compressor name
					u16(0x0018), // Depth
					i16(0xffff), // Pre-defined
				].flat()),
				children: [{
					type: 'avcC',
					contents: this.#videoDecoderConfig
				}]
			}]
		};

		let sampleTableBox: Box = {
			type: BoxType.SampleTable,
			children: [
				sampleDescriptionBox,
				timeToSampleBox,
				syncSampleBox,
				sampleToChunkBox,
				sampleSizeBox,
				chunkOffsetBox
			]
		};

		let mediaInformationBox: Box = {
			type: BoxType.MediaInformation,
			children: [mediaInformationHeaderBox, dataInformationBox, sampleTableBox]
		};

		let mediaBox: Box = {
			type: BoxType.Media,
			children: [mediaHeaderBox, handlerReferenceBox, mediaInformationBox]
		};

		let trackHeaderBox: Box = {
			type: BoxType.TrackHeader,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x03, // Flags (enabled + in movie)
				u32(Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET), // Creation time
				u32(Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET), // Modification time
				u32(1), // Track ID
				u32(0), // Reserved
				u32(duration), // Duration
				Array(8).fill(0), // Reserved
				0x00, 0x00, // Layer
				0x00, 0x00, // Alternate group
				fixed16(0), // Volume
				0x00, 0x00, // Reserved
				[ 0x00010000,0,0,0,0x00010000,0,0,0,0x40000000].flatMap(u32),
				fixed32(this.#options.video.width), // Track width
				fixed32(this.#options.video.height) // Track height
			].flat())
		};

		let trackBox: Box = {
			type: BoxType.Track,
			children: [trackHeaderBox, mediaBox]
		};

		let movieHeaderBox: Box = {
			type: BoxType.MovieHeader,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x00, // Flags
				u32(Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET), // Creation time
				u32(Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET), // Modification time
				u32(timescale),
				u32(duration),
				fixed32(1.0), // Preferred rate
				fixed16(1.0), // Preferred volume
				Array(10).fill(0), // Reserved
				[ 0x00010000,0,0,0,0x00010000,0,0,0,0x40000000].flatMap(u32),
				Array(24).fill(0), // Pre-defined
				u32(2) // Next track ID
			].flat())
		};

		let movieBox: Box = {
			type: BoxType.Movie,
			children: [movieHeaderBox, trackBox]
		};

		this.#target.writeBox(movieBox);
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

const ascii = (text: string, nullTerminated = false) => {
	let bytes = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
	if (nullTerminated) bytes.push(0x00);
	return bytes;
};

const timestampToUnits = (timestamp: number, timescale: number) => {
	return Math.floor(timestamp * timescale);
};

interface Box {
	type: string,
	contents?: Uint8Array,
	children?: Box[],
	size?: number,
	largeSize?: boolean
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
	DataInformation = 'dinf',
	DataReference = 'dref',
	SampleTable = 'stbl',
	SampleDescription = 'stsd',
	TimeToSample = 'stts',
	SyncSample = 'stss',
	SampleToChunk = 'stsc',
	SampleSize = 'stsz',
	ChunkOffset = 'stco',
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
			if (box.children) for (let child of box.children) this.writeBox(child);

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

export default Mp4Muxer;