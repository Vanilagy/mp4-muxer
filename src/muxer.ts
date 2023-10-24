import { Box, free, ftyp, mdat, moov } from './box';
import { deepClone, intoTimescale, last } from './misc';
import { ArrayBufferTarget, FileSystemWritableFileStreamTarget, StreamTarget, Target } from './target';
import {
	Writer,
	ArrayBufferTargetWriter,
	StreamTargetWriter,
	ChunkedStreamTargetWriter,
	FileSystemWritableFileStreamTargetWriter
} from './writer';

export const GLOBAL_TIMESCALE = 1000;
export const SUPPORTED_VIDEO_CODECS = ['avc', 'hevc', 'vp9', 'av1'] as const;
export const SUPPORTED_AUDIO_CODECS = ['aac', 'opus'] as const;
const TIMESTAMP_OFFSET = 2_082_844_800; // Seconds between Jan 1 1904 and Jan 1 1970
const MAX_CHUNK_DURATION = 0.5; // In seconds
const FIRST_TIMESTAMP_BEHAVIORS = ['strict',  'offset'] as const;

interface VideoOptions {
	codec: typeof SUPPORTED_VIDEO_CODECS[number],
	width: number,
	height: number,
	rotation?: 0 | 90 | 180 | 270
}

interface AudioOptions {
	codec: typeof SUPPORTED_AUDIO_CODECS[number],
	numberOfChannels: number,
	sampleRate: number
}

type NoInfer<T> = T extends infer S ? S : never;
type Mp4MuxerOptions<
	T extends Target,
	V extends VideoOptions | undefined = undefined,
	A extends AudioOptions | undefined = undefined
> =  {
	target: T,
	video?: V,
	audio?: A,
	fastStart: false | 'in-memory' | (
		(NoInfer<V> extends undefined ? { expectedVideoChunks?: never } : { expectedVideoChunks: number })
		& (NoInfer<A> extends undefined ? { expectedAudioChunks?: never } : { expectedAudioChunks: number })
	),
	firstTimestampBehavior?: typeof FIRST_TIMESTAMP_BEHAVIORS[number]
};

export interface Track {
	id: number,
	info: {
		type: 'video',
		codec: VideoOptions['codec'],
		width: number,
		height: number,
		rotation: 0 | 90 | 180 | 270
	} | {
		type: 'audio',
		codec: AudioOptions['codec'],
		numberOfChannels: number,
		sampleRate: number
	},
	timescale: number,
	codecPrivate: Uint8Array,
	samples: Sample[],

	firstTimestamp: number,
	lastTimestamp: number,

	timeToSampleTable: { sampleCount: number, sampleDelta: number }[];
	lastTimescaleUnits: number,

	finalizedChunks: Chunk[],
	currentChunk: Chunk,
	compactlyCodedChunkTable: {
		firstChunk: number,
		samplesPerChunk: number
	}[]
}

export type VideoTrack = Track & { info: { type: 'video' } };
export type AudioTrack = Track & { info: { type: 'audio' } };

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

export class Muxer<
	T extends Target,
	V extends VideoOptions | never = never,
	A extends AudioOptions | never = never
> {
	target: T;

	#options: Mp4MuxerOptions<T, V, A>;
	#writer: Writer;
	#ftypSize: number;
	#mdat: Box;

	#videoTrack: Track = null;
	#audioTrack: Track = null;
	#creationTime = Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET;
	#finalizedChunks: Chunk[] = [];

	#finalized = false;

	constructor(options: Mp4MuxerOptions<T, V, A>) {
		this.#validateOptions(options);

		// Don't want these to be modified from the outside while processing:
		options.video = deepClone(options.video);
		options.audio = deepClone(options.audio);
		options.fastStart = deepClone(options.fastStart);

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

	#validateOptions(options: Mp4MuxerOptions<T, V, A>) {
		if (options.video) {
			if (!SUPPORTED_VIDEO_CODECS.includes(options.video.codec)) {
				throw new Error(`Unsupported video codec: ${options.video.codec}`);
			}

			if (options.video.rotation !== undefined && ![0, 90, 180, 270].includes(options.video.rotation)) {
				throw new Error(`Invalid video rotation: ${options.video.rotation}. Has to be 0, 90, 180 or 270.`);
			}
		}

		if (options.audio && !SUPPORTED_AUDIO_CODECS.includes(options.audio.codec)) {
			throw new Error(`Unsupported audio codec: ${options.audio.codec}`);
		}

		if (options.firstTimestampBehavior && !FIRST_TIMESTAMP_BEHAVIORS.includes(options.firstTimestampBehavior)) {
			throw new Error(`Invalid first timestamp behavior: ${options.firstTimestampBehavior}`);
		}

		if (typeof options.fastStart === 'object') {
			if (options.video && options.fastStart.expectedVideoChunks === undefined) {
				throw new Error(`'fastStart' is an object but is missing property 'expectedVideoChunks'.`);
			}

			if (options.audio && options.fastStart.expectedAudioChunks === undefined) {
				throw new Error(`'fastStart' is an object but is missing property 'expectedAudioChunks'.`);
			}
		} else if (![false, 'in-memory'].includes(options.fastStart)) {
			throw new Error(`'fastStart' option must be false, 'in-memory' or an object.`);
		}
	}

	#writeHeader() {
		let holdsHevc = this.#options.video?.codec === 'hevc';
		this.#writer.writeBox(ftyp(holdsHevc));

		this.#ftypSize = this.#writer.pos;

		if (this.#options.fastStart === 'in-memory') {
			this.#mdat = mdat(false);
		} else {
			if (typeof this.#options.fastStart === 'object') {
				let moovSizeUpperBound = this.#computeMoovSizeUpperBound();
				this.#writer.seek(this.#writer.pos + moovSizeUpperBound);
			}

			this.#mdat = mdat(true); // Reserve large size by default, can refine this when finalizing.
			this.#writer.writeBox(this.#mdat);
		}

		this.#maybeFlushStreamingTargetWriter();
	}

	#computeMoovSizeUpperBound() {
		if (typeof this.#options.fastStart !== 'object') return;

		let upperBound = 0;
		let sampleCounts = [
			this.#options.fastStart.expectedVideoChunks,
			this.#options.fastStart.expectedAudioChunks
		];

		for (let n of sampleCounts) {
			if (!n) continue;

			// Given the max allowed sample count, compute the space they'll take up in the Sample Table Box, assuming
			// the worst case for each individual box:

			// stts box - since it is compactly coded, the maximum length of this table will be 2/3n
			upperBound += (4 + 4) * Math.ceil(2/3 * n);
			// stss box - 1 entry per sample
			upperBound += 4 * n;
			// stsc box - since it is compactly coded, the maximum length of this table will be 2/3n
			upperBound += (4 + 4 + 4) * Math.ceil(2/3 * n);
			// stsz box - 1 entry per sample
			upperBound += 4 * n;
			// co64 box - we assume 1 sample per chunk and 64-bit chunk offsets
			upperBound += 8 * n;
		}

		upperBound += 4096; // Assume a generous 4 kB for everything else: Track metadata, codec descriptors, etc.

		return upperBound;
	}

	#prepareTracks() {
		if (this.#options.video) {
			this.#videoTrack = {
				id: 1,
				info: {
					type: 'video',
					codec: this.#options.video.codec,
					width: this.#options.video.width,
					height: this.#options.video.height,
					rotation: this.#options.video.rotation ?? 0
				},
				timescale: 720, // = lcm(24, 30, 60, 120, 144, 240, 360), so should fit with many framerates
				codecPrivate: new Uint8Array(0),
				samples: [],
				finalizedChunks: [],
				currentChunk: null,
				firstTimestamp: undefined,
				lastTimestamp: -1,
				timeToSampleTable: [],
				lastTimescaleUnits: null,
				compactlyCodedChunkTable: []
			};
		}

		if (this.#options.audio) {
			// For the case that we don't get any further decoder details, we can still make a pretty educated guess:
			let guessedCodecPrivate = this.#generateMpeg4AudioSpecificConfig(
				2, // Object type for AAC-LC, since it's the most common
				this.#options.audio.sampleRate,
				this.#options.audio.numberOfChannels
			);

			this.#audioTrack = {
				id: this.#options.video ? 2 : 1,
				info: {
					type: 'audio',
					codec: this.#options.audio.codec,
					numberOfChannels: this.#options.audio.numberOfChannels,
					sampleRate: this.#options.audio.sampleRate
				},
				timescale: this.#options.audio.sampleRate,
				codecPrivate: guessedCodecPrivate,
				samples: [],
				finalizedChunks: [],
				currentChunk: null,
				firstTimestamp: undefined,
				lastTimestamp: -1,
				timeToSampleTable: [],
				lastTimescaleUnits: null,
				compactlyCodedChunkTable: []
			};
		}
	}

	// https://wiki.multimedia.cx/index.php/MPEG-4_Audio
	#generateMpeg4AudioSpecificConfig(objectType: number, sampleRate: number, numberOfChannels: number) {
		let frequencyIndices =
			[96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
		let frequencyIndex = frequencyIndices.indexOf(sampleRate);
		let channelConfig = numberOfChannels;

		let configBits = '';
		configBits += objectType.toString(2).padStart(5, '0');

		configBits += frequencyIndex.toString(2).padStart(4, '0');
		if (frequencyIndex === 15) configBits += sampleRate.toString(2).padStart(24, '0');

		configBits += channelConfig.toString(2).padStart(4, '0');

		// Pad with 0 bits to fit into a multiple of bytes
		let paddingLength = Math.ceil(configBits.length / 8) * 8;
		configBits = configBits.padEnd(paddingLength, '0');

		let configBytes = new Uint8Array(configBits.length / 8);
		for (let i = 0; i < configBits.length; i += 8) {
			configBytes[i / 8] = parseInt(configBits.slice(i, i + 8), 2);
		}

		return configBytes;
	}

	addVideoChunk(sample: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata, timestamp?: number) {
		let data = new Uint8Array(sample.byteLength);
		sample.copyTo(data);

		this.addVideoChunkRaw(data, sample.type, timestamp ?? sample.timestamp, sample.duration, meta);
	}

	addVideoChunkRaw(
		data: Uint8Array,
		type: 'key' | 'delta',
		timestamp: number,
		duration: number,
		meta?: EncodedVideoChunkMetadata
	) {
		this.#ensureNotFinalized();
		if (!this.#options.video) throw new Error('No video track declared.');

		if (
			typeof this.#options.fastStart === 'object' &&
			this.#videoTrack.samples.length === this.#options.fastStart.expectedVideoChunks
		) {
			throw new Error(`Cannot add more video chunks than specified in 'fastStart' (${
				this.#options.fastStart.expectedVideoChunks
			}).`);
		}

		this.#addSampleToTrack(this.#videoTrack, data, type, timestamp, duration, meta);
	}

	addAudioChunk(sample: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata, timestamp?: number) {
		let data = new Uint8Array(sample.byteLength);
		sample.copyTo(data);

		this.addAudioChunkRaw(data, sample.type, timestamp ?? sample.timestamp, sample.duration, meta);
	}

	addAudioChunkRaw(
		data: Uint8Array,
		type: 'key' | 'delta',
		timestamp: number,
		duration: number,
		meta?: EncodedAudioChunkMetadata
	) {
		this.#ensureNotFinalized();
		if (!this.#options.audio) throw new Error('No audio track declared.');

		if (
			typeof this.#options.fastStart === 'object' &&
			this.#audioTrack.samples.length === this.#options.fastStart.expectedAudioChunks
		) {
			throw new Error(`Cannot add more audio chunks than specified in 'fastStart' (${
				this.#options.fastStart.expectedAudioChunks
			}).`);
		}

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
		track.lastTimestamp = timestampInSeconds;

		if (!track.currentChunk || timestampInSeconds - track.currentChunk.startTimestamp >= MAX_CHUNK_DURATION) {
			if (track.currentChunk) this.#finalizeCurrentChunk(track); // Chunk is long enough, finalize it

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

		// Fill the time-to-sample table
		if (track.lastTimescaleUnits !== null) {
			let timescaleUnits = intoTimescale(timestampInSeconds, track.timescale, false);
			let delta = Math.round(timescaleUnits - track.lastTimescaleUnits);
			track.lastTimescaleUnits += delta;

			let lastTableEntry = last(track.timeToSampleTable);
			if (lastTableEntry.sampleCount === 1) {
				// If we hit this case, we're the second sample
				lastTableEntry.sampleDelta = delta;
				lastTableEntry.sampleCount++;
			} else if (lastTableEntry.sampleDelta === delta) {
				// Simply increment the count
				lastTableEntry.sampleCount++;
			} else {
				// The delta has changed, so subtract one from the previous run and create a new run with the new delta
				lastTableEntry.sampleCount--;
				track.timeToSampleTable.push({
					sampleCount: 2,
					sampleDelta: delta
				});
			}
		} else {
			track.lastTimescaleUnits = 0;
			track.timeToSampleTable.push({
				sampleCount: 1,
				sampleDelta: intoTimescale(durationInSeconds, track.timescale)
			});
		}
	}

	#validateTimestamp(timestamp: number, track: Track) {
		// Check first timestamp behavior
		if (this.#options.firstTimestampBehavior === 'strict' && track.lastTimestamp === -1 && timestamp !== 0) {
			throw new Error(
				`The first chunk for your media track must have a timestamp of 0 (received ${timestamp}). Non-zero ` +
				`first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack ` +
				`into the encoder. Their timestamps are typically relative to the age of the document, which is ` +
				`probably what you want.\n\nIf you want to offset all timestamps of a track such that the first one ` +
				`is zero, set firstTimestampBehavior: 'offset' in the options.\n`
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

	#finalizeCurrentChunk(track: Track) {
		if (!track.currentChunk) return;

		if (
			track.compactlyCodedChunkTable.length === 0
			|| last(track.compactlyCodedChunkTable).samplesPerChunk !== track.currentChunk.sampleCount
		) {
			track.compactlyCodedChunkTable.push({
				firstChunk: track.finalizedChunks.length + 1, // 1-indexed
				samplesPerChunk: track.currentChunk.sampleCount
			});
		}

		track.finalizedChunks.push(track.currentChunk);
		this.#finalizedChunks.push(track.currentChunk);

		if (this.#options.fastStart === 'in-memory') {
			track.currentChunk.offset = 0; // We'll compute the proper offset when finalizing
			return;
		}

		// Write out the data
		track.currentChunk.offset = this.#writer.pos;
		for (let bytes of track.currentChunk.sampleData) this.#writer.write(bytes);
		track.currentChunk.sampleData = null;

		this.#maybeFlushStreamingTargetWriter();
	}

	#maybeFlushStreamingTargetWriter() {
		if (this.#writer instanceof StreamTargetWriter) {
			this.#writer.flush();
		}
	}

	#ensureNotFinalized() {
		if (this.#finalized) {
			throw new Error('Cannot add new video or audio chunks after the file has been finalized.');
		}
	}

	/** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
	finalize() {
		if (this.#videoTrack) this.#finalizeCurrentChunk(this.#videoTrack);
		if (this.#audioTrack) this.#finalizeCurrentChunk(this.#audioTrack);

		let tracks = [this.#videoTrack, this.#audioTrack].filter(Boolean);

		if (this.#options.fastStart === 'in-memory') {
			let mdatSize: number;

			// We know how many chunks there are, but computing the chunk positions requires an iterative approach:
			// In order to know where the first chunk should go, we first need to know the size of the moov box. But we
			// cannot write a proper moov box without first knowing all chunk positions. So, we generate a tentative
			// moov box with placeholder values (0) for the chunk offsets to be able to compute its size. If it then
			// turns out that appending all chunks exceeds 4 GiB, we need to repeat this process, now with the co64 box
			// being used in the moov box instead, which will make it larger. After that, we definitely know the final
			// size of the moov box and can compute the proper chunk positions.

			for (let i = 0; i < 2; i++) {
				let movieBox = moov(tracks, this.#creationTime);
				let movieBoxSize = this.#writer.measureBox(movieBox);
				mdatSize = this.#writer.measureBox(this.#mdat);
				let currentChunkPos = this.#writer.pos + movieBoxSize + mdatSize;

				for (let chunk of this.#finalizedChunks) {
					chunk.offset = currentChunkPos;
					for (let bytes of chunk.sampleData) {
						currentChunkPos += bytes.byteLength;
						mdatSize += bytes.byteLength;
					}
				}

				if (currentChunkPos < 2**32) break;
				if (mdatSize >= 2**32) this.#mdat.largeSize = true;
			}

			let movieBox = moov(tracks, this.#creationTime);
			this.#writer.writeBox(movieBox);

			this.#mdat.size = mdatSize;
			this.#writer.writeBox(this.#mdat);

			for (let chunk of this.#finalizedChunks) {
				for (let bytes of chunk.sampleData) this.#writer.write(bytes);
				chunk.sampleData = null;
			}
		} else {
			let mdatPos = this.#writer.offsets.get(this.#mdat);
			let mdatSize = this.#writer.pos - mdatPos;
			this.#mdat.size = mdatSize;
			this.#mdat.largeSize = mdatSize >= 2**32; // Only use the large size if we need it
			this.#writer.patchBox(this.#mdat);

			let movieBox = moov(tracks, this.#creationTime);

			if (typeof this.#options.fastStart === 'object') {
				this.#writer.seek(this.#ftypSize);
				this.#writer.writeBox(movieBox);

				let remainingBytes = mdatPos - this.#writer.pos;
				this.#writer.writeBox(free(remainingBytes));
			} else {
				this.#writer.writeBox(movieBox);
			}
		}

		this.#maybeFlushStreamingTargetWriter();
		this.#writer.finalize();

		this.#finalized = true;
	}
}