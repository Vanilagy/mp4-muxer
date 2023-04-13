import { Box, ftyp, mdat, moov } from "./box";
import { ArrayBufferTarget, FileSystemWritableFileStreamTarget, StreamTarget, Target } from "./target";
import {
	Writer,
	ArrayBufferTargetWriter,
	StreamTargetWriter,
	ChunkedStreamTargetWriter,
	FileSystemWritableFileStreamTargetWriter
} from "./writer";

export const GLOBAL_TIMESCALE = 1000;
const TIMESTAMP_OFFSET = 2_082_844_800; // Seconds between Jan 1 1904 and Jan 1 1970
const MAX_CHUNK_DURATION = 0.5; // In seconds
const SUPPORTED_VIDEO_CODECS = ['avc', 'hevc'] as const;
const SUPPORTED_AUDIO_CODECS = ['aac'] as const;
const FIRST_TIMESTAMP_BEHAVIORS = ['strict',  'offset', 'permissive'] as const;

interface Mp4MuxerOptions<T extends Target> {
	target: T,
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
		codec: Mp4MuxerOptions<any>['video']['codec'],
		width: number,
		height: number
	} | {
		type: 'audio',
		codec: Mp4MuxerOptions<any>['audio']['codec'],
		numberOfChannels: number,
		sampleRate: number
	},
	timescale: number,
	codecPrivate: Uint8Array,
	samples: Sample[],
	writtenChunks: Chunk[],
	currentChunk: Chunk,
	firstTimestamp: number,
	lastTimestamp: number
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

export class Muxer<T extends Target> {
	target: T;

	#options: Mp4MuxerOptions<T>;
	#writer: Writer;
	#mdat: Box;

	#videoTrack: Track = null;
	#audioTrack: Track = null;
	#creationTime = Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET;

	#finalized = false;

	constructor(options: Mp4MuxerOptions<T>) {
		this.#validateOptions(options);

		this.target = options.target;
		this.#options = {
			firstTimestampBehavior: 'strict',
			...options
		};

		if (options.target instanceof ArrayBufferTarget) {
			this.#writer = new ArrayBufferTargetWriter(options.target);
		} else if (options.target instanceof StreamTarget) {
			this.#writer = options.target.options?.chunked
				? new ChunkedStreamTargetWriter(options.target)
				: new StreamTargetWriter(options.target);
		} else if (options.target instanceof FileSystemWritableFileStreamTarget) {
			this.#writer = new FileSystemWritableFileStreamTargetWriter(options.target);
		} else {
			throw new Error(`Invalid target: ${options.target}`);
		}

		this.#writeHeader();
		this.#prepareTracks();
	}

	#validateOptions(options: Mp4MuxerOptions<T>) {
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
		this.#writer.writeBox(ftyp(holdsHevc));

		this.#mdat = mdat();
		this.#writer.writeBox(this.#mdat);

		this.#maybeFlushStreamingTargetWriter();
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
				codecPrivate: new Uint8Array(0),
				samples: [],
				writtenChunks: [],
				currentChunk: null,
				firstTimestamp: undefined,
				lastTimestamp: -1
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
				codecPrivate: new Uint8Array(0),
				samples: [],
				writtenChunks: [],
				currentChunk: null,
				firstTimestamp: undefined,
				lastTimestamp: -1
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

		if (track.firstTimestamp === undefined) track.firstTimestamp = timestampInSeconds;
		timestampInSeconds = this.#validateTimestamp(timestampInSeconds, track);

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

	#validateTimestamp(timestamp: number, track: Track) {
		// Check first timestamp behavior
		if (this.#options.firstTimestampBehavior === 'strict' && track.lastTimestamp === -1 && timestamp !== 0) {
			throw new Error(
				`The first chunk for your media track must have a timestamp of 0 (received ${timestamp}). Non-zero ` +
				`first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack ` +
				`into the encoder. Their timestamps are typically relative to the age of the document, which is ` +
				`probably what you want.\n\nIf you want to offset all timestamps of a track such that the first one ` +
				`is zero, set firstTimestampBehavior: 'offset' in the options.\nIf you want to allow non-zero first ` +
				`timestamps, set firstTimestampBehavior: 'permissive'.\n`
			);
		} else if (this.#options.firstTimestampBehavior === 'offset') {
			timestamp -= track.firstTimestamp;
		}

		if (timestamp < track.lastTimestamp) {
			throw new Error(
				`Timestamps must be monotonically increasing ` +
				`(went from ${track.lastTimestamp * 1e6} to ${timestamp * 1e6}).`
			);
		}

		return timestamp;
	}

	#writeCurrentChunk(track: Track) {
		if (!track.currentChunk) return;

		track.currentChunk.offset = this.#writer.pos;
		for (let bytes of track.currentChunk.sampleData) this.#writer.write(bytes);
		track.currentChunk.sampleData = null;

		track.writtenChunks.push(track.currentChunk);

		this.#maybeFlushStreamingTargetWriter();
	}

	#maybeFlushStreamingTargetWriter() {
		if (this.#writer instanceof StreamTargetWriter) {
			this.#writer.flush();
		}
	}

	#ensureNotFinalized() {
		if (this.#finalized) {
			throw new Error("Cannot add new video or audio chunks after the file has been finalized.");
		}
	}

	finalize() {
		if (this.#videoTrack) this.#writeCurrentChunk(this.#videoTrack);
		if (this.#audioTrack) this.#writeCurrentChunk(this.#audioTrack);

		let mdatPos = this.#writer.offsets.get(this.#mdat);
		let mdatSize = this.#writer.pos - mdatPos;
		this.#mdat.size = mdatSize;
		this.#writer.patchBox(this.#mdat);

		let movieBox = moov([this.#videoTrack, this.#audioTrack].filter(Boolean), this.#creationTime);
		this.#writer.writeBox(movieBox);

		this.#maybeFlushStreamingTargetWriter();

		this.#writer.finalize();
	}
}