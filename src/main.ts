import { Box, BoxType, timestampToUnits, u32, ascii, u16, i16, fixed16, fixed32, last } from "./misc";
import {
	WriteTarget,
	ArrayBufferWriteTarget,
	FileSystemWritableFileStreamWriteTarget,
	StreamingWriteTarget
} from "./write_target";

const TIMESTAMP_OFFSET = 2_082_848_400; // Seconds between Jan 1 1904 and Jan 1 1970
const MAX_CHUNK_LENGTH = 500_000; // In microseconds
const FIRST_TIMESTAMP_BEHAVIORS = ['strict',  'offset', 'permissive'] as const;
const GLOBAL_TIMESCALE = 1000;

interface Mp4MuxerOptions {
	target:
		'buffer'
		| ((data: Uint8Array, offset: number, done: boolean) => void)
		| FileSystemWritableFileStream,
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

interface Track {
	info: {
		type: 'video',
		width: number,
		height: number
	} | {
		type: 'audio',
		numberOfChannels: number,
		sampleRate: number,
		bitDepth: number
	},
	codecPrivate: Uint8Array,
	samples: Sample[],
	writtenChunks: Chunk[],
	currentChunk: Chunk
}

interface Sample {
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
		if (options.firstTimestampBehavior && !FIRST_TIMESTAMP_BEHAVIORS.includes(options.firstTimestampBehavior)) {
			throw new Error(`Invalid first timestamp behavior: ${options.firstTimestampBehavior}`);
		}
	}

	#writeHeader() {
		this.#target.writeBox({
			type: BoxType.FileType,
			contents: new Uint8Array([
				0x69, 0x73, 0x6f, 0x6d, // isom
				0x00, 0x00, 0x00, 0x00, // Minor version 0
				0x69, 0x73, 0x6f, 0x6d, // isom
				0x61, 0x76, 0x63, 0x31, // avc1
				0x6d, 0x70, 0x34, 0x31  // mp41
			])
		});

		this.#mdat = {
			type: BoxType.MovieData,
			largeSize: true
		};
		this.#target.writeBox(this.#mdat);
	}

	#prepareTracks() {
		if (this.#options.video) {
			this.#videoTrack = {
				info: {
					type: 'video',
					width: this.#options.video.width,
					height: this.#options.video.height,
				},
				codecPrivate: null,
				samples: [],
				writtenChunks: [],
				currentChunk: null
			};
		}

		if (this.#options.audio) {
			this.#audioTrack = {
				info: {
					type: 'audio',
					numberOfChannels: this.#options.audio.numberOfChannels,
					sampleRate: this.#options.audio.sampleRate,
					bitDepth: this.#options.audio.bitDepth ?? 16
				},
				codecPrivate: null,
				samples: [],
				writtenChunks: [],
				currentChunk: null
			};
		}
	}

	addVideoChunk(sample: EncodedVideoChunk, meta: EncodedVideoChunkMetadata) {
		this.#ensureNotFinalized();
		if (!this.#options.video) throw new Error("No video track declared.");

		this.#addSampleToTrack(this.#videoTrack, sample, meta);
	}

	addAudioChunk(sample: EncodedAudioChunk, meta: EncodedAudioChunkMetadata) {
		this.#ensureNotFinalized();
		if (!this.#options.audio) throw new Error("No audio track declared.");

		this.#addSampleToTrack(this.#audioTrack, sample, meta);
	}

	#addSampleToTrack(
		track: Track,
		sample: EncodedVideoChunk | EncodedAudioChunk,
		meta: EncodedVideoChunkMetadata | EncodedAudioChunkMetadata
	) {
		if (!track.currentChunk || sample.timestamp - track.currentChunk.startTimestamp >= MAX_CHUNK_LENGTH) {
			if (track.currentChunk) this.#writeCurrentChunk(track);
			track.currentChunk = { startTimestamp: sample.timestamp, sampleData: [], sampleCount: 0 };
		}

		let data = new Uint8Array(sample.byteLength);
		sample.copyTo(data);

		track.currentChunk.sampleData.push(data);
		track.currentChunk.sampleCount++;

		if (meta.decoderConfig?.description) {
			track.codecPrivate = new Uint8Array(meta.decoderConfig.description as ArrayBuffer);
		}

		track.samples.push({
			timestamp: sample.timestamp / 1e6,
			duration: sample.duration / 1e6,
			size: data.byteLength,
			type: sample.type
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

		let movieBox = this.#createMovieBox();
		this.#target.writeBox(movieBox);

		let buffer = (this.#target as ArrayBufferWriteTarget).finalize();
		return buffer;
	}

	#createMovieBox() {
		let lastVideoSample = last(this.#videoTrack?.samples);
		let lastAudioSample = last(this.#audioTrack?.samples);

		let duration = timestampToUnits(Math.max(
			lastVideoSample ? lastVideoSample.timestamp + lastVideoSample.duration : 0,
			lastAudioSample ? lastAudioSample.timestamp + lastAudioSample.duration : 0
		), GLOBAL_TIMESCALE);

		let videoTrackBox = this.#videoTrack && this.#createTrackBox(this.#videoTrack);
		let audioTrackBox = this.#audioTrack && this.#createTrackBox(this.#audioTrack);

		let movieHeaderBox: Box = {
			type: BoxType.MovieHeader,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x00, // Flags
				u32(Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET), // Creation time
				u32(Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET), // Modification time
				u32(GLOBAL_TIMESCALE),
				u32(duration),
				fixed32(1.0), // Preferred rate
				fixed16(1.0), // Preferred volume
				Array(10).fill(0), // Reserved
				[ 0x00010000,0,0,0,0x00010000,0,0,0,0x40000000].flatMap(u32),
				Array(24).fill(0), // Pre-defined
				u32(+!!this.#options.audio + +!!this.#options.video + 1) // Next track ID
			].flat())
		};

		let movieBox: Box = {
			type: BoxType.Movie,
			children: [movieHeaderBox, videoTrackBox, audioTrackBox]
		};

		return movieBox;
	}

	#createTrackBox(track: Track) {
		let timescale = track.info.type === 'video' ? 960 : track.info.sampleRate;

		let current: Sample[] = [];
		let entries: { sampleCount: number, sampleDelta: number }[] = [];
		for (let sample of track.samples) {
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
			sampleDelta:
				timestampToUnits((current[1]?.timestamp ?? current[0].timestamp) - current[0].timestamp, timescale)
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

		let syncSampleBox: Box = null;
		if (!track.samples.every(x => x.type === 'key')) {
			let keySamples = [...track.samples.entries()].filter(([, sample]) => sample.type === 'key');

			syncSampleBox = {
				type: BoxType.SyncSample,
				contents: new Uint8Array([
					0x00, // Version
					0x00, 0x00, 0x00, // Flags
					u32(keySamples.length), // Entry count
					keySamples.flatMap(([index]) => u32(index + 1)) // Sample numbers
				].flat())
			};
		}

		let compactlyCodedChunks: {
			firstChunk: number,
			samplesPerChunk: number
		}[] = [];
		for (let i = 0; i < track.writtenChunks.length; i++) {
			let next = track.writtenChunks[i];
			if (compactlyCodedChunks.length === 0 || last(compactlyCodedChunks).samplesPerChunk !== next.sampleCount) {
				compactlyCodedChunks.push({ firstChunk: i + 1, samplesPerChunk: next.sampleCount });
			}
		}

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
				u32(track.samples.length), // Sample count
				track.samples.flatMap(x => u32(x.size))
			].flat())
		};

		let chunkOffsetBox: Box = {
			type: BoxType.ChunkOffset,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x00, // Flags,
				u32(track.writtenChunks.length), // Entry count
				track.writtenChunks.flatMap(x => u32(x.offset))
			].flat())
		};

		let lastSample = last(track.samples);
		let localDuration = timestampToUnits(
			lastSample.timestamp + lastSample.duration,
			timescale
		);
		let globalDuration = timestampToUnits(
			lastSample.timestamp + lastSample.duration,
			GLOBAL_TIMESCALE
		);

		let mediaHeaderBox: Box = {
			type: BoxType.MediaHeader,
			contents: new Uint8Array([
				0x00, // Version
				0x00, 0x00, 0x00, // Flags
				u32(Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET), // Creation time
				u32(Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET), // Modification time
				u32(timescale),
				u32(localDuration),
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
				ascii(track.info.type === 'video' ? 'vide' : 'soun'), // Component subtype
				Array(12).fill(0), // Reserved
				ascii(track.info.type === 'video' ? 'Video track' : 'Audio track', true)
			].flat())
		};

		let mediaInformationHeaderBox: Box = track.info.type === 'video'
			? {
				type: BoxType.VideoMediaInformationHeader,
				contents: new Uint8Array([
					0x00, // Version
					0x00, 0x00, 0x01, // Flags
					0x00, 0x00, // Graphics mode
					0x00, 0x00, // Opcolor R
					0x00, 0x00, // Opcolor G
					0x00, 0x00, // Opcolor B
				])
			}
			: {
				type: BoxType.SoundMediaInformationHeader,
				contents: new Uint8Array([
					0x00, // Version
					0x00, 0x00, 0x00, // Flags
					0x00, 0x00, // Balance
					0x00, 0x00, // Reserved
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
						0x00, // Version
						0x00, 0x00, 0x01 // Flags (with self-reference enabled)
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
			children: [track.info.type === 'video'
				? {
					type: 'avc1',
					contents: new Uint8Array([
						Array(6).fill(0), // Reserved
						0x00, 0x01, // Data reference index
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
						contents: track.codecPrivate
					}]
				}
				: {
					type: 'mp4a',
					contents: new Uint8Array([
						Array(6).fill(0), // Reserved
						u16(1), // Data reference index
						u16(0), // Version
						u16(0), // Revision level
						u32(0), // Vendor
						u16(track.info.numberOfChannels),
						u16(track.info.bitDepth),
						u16(0), // Compression ID
						u16(0), // Packet size
						fixed32(track.info.sampleRate),
					].flat()),
					children: [{
						type: 'esds',
						contents: new Uint8Array([
							// https://stackoverflow.com/a/54803118
							0x00, // Version
							0x00, 0x00, 0x00, // Flags
							u32(0x03808080), // TAG(3) = Object Descriptor ([2])
							0x22, // length of this OD (which includes the next 2 tags)
							u16(1), // ES_ID = 1
							0x00, // flags etc = 0
							u32(0x04808080), // TAG(4) = ES Descriptor ([2]) embedded in above OD
							0x14, // length of this ESD
							0x40, // MPEG-4 Audio
							0x15, // stream type(6bits)=5 audio, flags(2bits)=1
							0x00, 0x00, 0x00, // 24bit buffer size
							u32(0x0001FC17), // max bitrate
							u32(0x0001FC17), // avg bitrate
							u32(0x05808080), // TAG(5) = ASC ([2],[3]) embedded in above OD
							0x02, // length
							track.codecPrivate[0], track.codecPrivate[1],
							u32(0x06808080), // TAG(6)
							0x01, // length
							0x02 // data
						].flat())
					}]
				}
			]
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
				u32(track.info.type === 'video' ? 1 : 1 + +!!this.#options.video), // Track ID
				u32(0), // Reserved
				u32(globalDuration), // Duration
				Array(8).fill(0), // Reserved
				0x00, 0x00, // Layer
				0x00, 0x00, // Alternate group
				fixed16(track.info.type === 'audio' ? 1 : 0), // Volume
				0x00, 0x00, // Reserved
				[0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].flatMap(u32),
				fixed32(track.info.type === 'video' ? track.info.width : 0), // Track width
				fixed32(track.info.type === 'video' ? track.info.height : 0) // Track height
			].flat())
		};

		let trackBox: Box = {
			type: BoxType.Track,
			children: [trackHeaderBox, mediaBox]
		};

		return trackBox;
	}
}

export default Mp4Muxer;