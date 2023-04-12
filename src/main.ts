import { Box, ftyp, mdat, moov } from "./boxes";
import {
	WriteTarget,
	ArrayBufferWriteTarget,
	FileSystemWritableFileStreamWriteTarget,
	StreamingWriteTarget
} from "./write_target";

const TIMESTAMP_OFFSET = 2_082_848_400; // Seconds between Jan 1 1904 and Jan 1 1970
const MAX_CHUNK_DURATION = 0.5; // In seconds
const SUPPORTED_VIDEO_CODECS = ['avc', 'hevc'] as const;
const SUPPORTED_AUDIO_CODECS = ['aac'] as const;
const FIRST_TIMESTAMP_BEHAVIORS = ['strict',  'offset', 'permissive'] as const;
export const GLOBAL_TIMESCALE = 1000;

interface Mp4MuxerOptions {
	target:
		'buffer'
		| ((data: Uint8Array, offset: number, done: boolean) => void)
		| FileSystemWritableFileStream,
	video?: {
		codec: typeof SUPPORTED_VIDEO_CODECS[number],
		width: number,
		height: number
	},
	audio?: {
		codec: typeof SUPPORTED_AUDIO_CODECS[number],
		numberOfChannels: number,
		sampleRate: number
	},
	firstTimestampBehavior?: typeof FIRST_TIMESTAMP_BEHAVIORS[number]
}

export interface Track {
	id: number,
	info: {
		type: 'video',
		codec: Mp4MuxerOptions['video']['codec'],
		width: number,
		height: number
	} | {
		type: 'audio',
		codec: Mp4MuxerOptions['audio']['codec'],
		numberOfChannels: number,
		sampleRate: number
	},
	timescale: number,
	codecPrivate: Uint8Array,
	samples: Sample[],
	writtenChunks: Chunk[],
	currentChunk: Chunk
}

export interface Sample {
	timestamp: number,
	duration: number,
	size: number,
	type: 'key' | 'delta'
}

interface Chunk {
	startTimestamp: number,
	sampleData: Uint8Array[],
	sampleCount: number,
	offset?: number
}

class Mp4Muxer {
	#options: Mp4MuxerOptions;
	#target: WriteTarget;
	#mdat: Box;

	#videoTrack: Track = null;
	#audioTrack: Track = null;
	#creationTime = Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET;

	#finalized = false;

	constructor(options: Mp4MuxerOptions) {
		this.#validateOptions(options);

		this.#options = {
			firstTimestampBehavior: 'strict',
			...options
		};

		if (options.target === 'buffer') {
			this.#target = new ArrayBufferWriteTarget();
		} else if (options.target instanceof FileSystemWritableFileStream) {
			this.#target = new FileSystemWritableFileStreamWriteTarget(options.target);
		} else if (typeof options.target === 'function') {
			this.#target = new StreamingWriteTarget(options.target);
		} else {
			throw new Error(`Invalid target: ${options.target}`);
		}

		this.#writeHeader();
		this.#prepareTracks();
	}

	#validateOptions(options: Mp4MuxerOptions) {
		if (options.video && !SUPPORTED_VIDEO_CODECS.includes(options.video.codec)) {
			throw new Error(`Unsupported video codec: ${options.video.codec}`);
		}

		if (options.audio && !SUPPORTED_AUDIO_CODECS.includes(options.audio.codec)) {
			throw new Error(`Unsupported audio codec: ${options.audio.codec}`);
		}

		if (options.firstTimestampBehavior && !FIRST_TIMESTAMP_BEHAVIORS.includes(options.firstTimestampBehavior)) {
			throw new Error(`Invalid first timestamp behavior: ${options.firstTimestampBehavior}`);
		}
	}

	#writeHeader() {
		let holdsHevc = this.#options.video?.codec === 'hevc';
		this.#target.writeBox(ftyp(holdsHevc));

		this.#mdat = mdat();
		this.#target.writeBox(this.#mdat);
	}

	#prepareTracks() {
		if (this.#options.video) {
			this.#videoTrack = {
				id: 1,
				info: {
					type: 'video',
					codec: this.#options.video.codec,
					width: this.#options.video.width,
					height: this.#options.video.height
				},
				timescale: 720, // = lcm(24, 30, 60, 120, 144, 240, 360), so should fit with many framerates
				codecPrivate: null,
				samples: [],
				writtenChunks: [],
				currentChunk: null
			};
		}

		if (this.#options.audio) {
			this.#audioTrack = {
				id: this.#options.video ? 2 : 1,
				info: {
					type: 'audio',
					codec: this.#options.audio.codec,
					numberOfChannels: this.#options.audio.numberOfChannels,
					sampleRate: this.#options.audio.sampleRate
				},
				timescale: this.#options.audio.sampleRate,
				codecPrivate: null,
				samples: [],
				writtenChunks: [],
				currentChunk: null
			};
		}
	}

	addVideoChunk(sample: EncodedVideoChunk, meta: EncodedVideoChunkMetadata) {
		let data = new Uint8Array(sample.byteLength);
		sample.copyTo(data);

		this.addVideoChunkRaw(data, sample.type, sample.timestamp, sample.duration, meta);
	}

	addVideoChunkRaw(
		data: Uint8Array,
		type: 'key' | 'delta',
		timestamp: number,
		duration: number,
		meta?: EncodedVideoChunkMetadata
	) {
		this.#ensureNotFinalized();
		if (!this.#options.video) throw new Error("No video track declared.");

		this.#addSampleToTrack(this.#videoTrack, data, type, timestamp, duration, meta);
	}

	addAudioChunk(sample: EncodedAudioChunk, meta: EncodedAudioChunkMetadata) {
		let data = new Uint8Array(sample.byteLength);
		sample.copyTo(data);

		this.addAudioChunkRaw(data, sample.type, sample.timestamp, sample.duration, meta);
	}

	addAudioChunkRaw(
		data: Uint8Array,
		type: 'key' | 'delta',
		timestamp: number,
		duration: number,
		meta?: EncodedAudioChunkMetadata
	) {
		this.#ensureNotFinalized();
		if (!this.#options.audio) throw new Error("No audio track declared.");

		this.#addSampleToTrack(this.#audioTrack, data, type, timestamp, duration, meta);
	}

	#addSampleToTrack(
		track: Track,
		data: Uint8Array,
		type: 'key' | 'delta',
		timestamp: number,
		duration: number,
		meta: EncodedVideoChunkMetadata | EncodedAudioChunkMetadata
	) {
		let timestampInSeconds = timestamp / 1e6;
		let durationInSeconds = duration / 1e6;

		if (!track.currentChunk || timestampInSeconds - track.currentChunk.startTimestamp >= MAX_CHUNK_DURATION) {
			if (track.currentChunk) this.#writeCurrentChunk(track);

			track.currentChunk = {
				startTimestamp: timestampInSeconds,
				sampleData: [],
				sampleCount: 0
			};
		}

		track.currentChunk.sampleData.push(data);
		track.currentChunk.sampleCount++;

		if (meta?.decoderConfig?.description) {
			track.codecPrivate = new Uint8Array(meta.decoderConfig.description as ArrayBuffer);
		}

		track.samples.push({
			timestamp: timestampInSeconds,
			duration: durationInSeconds,
			size: data.byteLength,
			type: type
		});
	}

	#writeCurrentChunk(track: Track) {
		if (!track.currentChunk) return;

		track.currentChunk.offset = this.#target.pos;
		for (let bytes of track.currentChunk.sampleData) this.#target.write(bytes);
		track.currentChunk.sampleData = null;

		track.writtenChunks.push(track.currentChunk);
	}

	#ensureNotFinalized() {
		if (this.#finalized) {
			throw new Error("Cannot add new video or audio chunks after the file has been finalized.");
		}
	}

	finalize() {
		if (this.#videoTrack) this.#writeCurrentChunk(this.#videoTrack);
		if (this.#audioTrack) this.#writeCurrentChunk(this.#audioTrack);

		let mdatPos = this.#target.offsets.get(this.#mdat);
		let mdatSize = this.#target.pos - mdatPos;
		this.#mdat.size = mdatSize;
		this.#target.patchBox(this.#mdat);

		let movieBox = moov([this.#videoTrack, this.#audioTrack].filter(Boolean), this.#creationTime);
		this.#target.writeBox(movieBox);

		let buffer = (this.#target as ArrayBufferWriteTarget).finalize();
		return buffer;
	}
}

export default Mp4Muxer;