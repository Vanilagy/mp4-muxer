import { GLOBAL_TIMESCALE, Sample, Track } from "./main";
import { ascii, i16, last, u16 } from "./misc";
import { u32, fixed32, fixed16, u24, timestampToUnits } from "./misc";

const IDENTITY_MATRIX = [
	0x00010000, 0, 0,
	0, 0x00010000, 0,
	0, 0, 0x40000000
].map(u32);

export interface Box {
	type: string,
	contents?: Uint8Array,
	children?: Box[],
	size?: number,
	largeSize?: boolean
}

type NestedNumberArray = (number | NestedNumberArray)[];

export const box = (type: string, contents?: NestedNumberArray, children?: Box[]): Box => ({
	type,
	contents: contents && new Uint8Array(contents.flat(10) as number[]),
	children
});

/** A FullBox always starts with a version byte, followed by three flag bytes. */
export const fullBox = (
	type: string,
	version: number,
	flags: number,
	contents?: NestedNumberArray,
	children?: Box[]
) => box(
	type,
	[version, u24(flags), contents ?? []],
	children
);

/**
 * File Type Compatibility Box: Allows the reader to determine whether this is a type of file that the
 * reader understands.
 */
export const ftyp = () => box('ftyp', [
	ascii('isom'), // Major brand
	u32(0), // Minor version
	ascii('isom'), // Compatible brand 1
	ascii('avc1'), // Compatible brand 2
	ascii('mp41') // Compatible brand 3
]);

/** Movie Sample Data Box. Contains the actual frames/samples of the media. */
export const mdat = (): Box => ({ type: 'mdat', largeSize: true });

/**
 * Movie Box: Used to specify the information that defines a movie - that is, the information that allows
 * an application to interpret the sample data that is stored elsewhere.
 */
export const moov = (tracks: Track[], creationTime: number) => box('moov', null, [
	mvhd(creationTime, tracks),
	...tracks.map(x => trak(x, creationTime))
]);

/** Movie Header Box: Used to specify the characteristics of the entire movie, such as timescale and duration. */
export const mvhd = (
	creationTime: number,
	tracks: Track[]
) => {
	let duration = timestampToUnits(Math.max(
		...tracks.map(x => last(x.samples).timestamp + last(x.samples).duration)
	), GLOBAL_TIMESCALE);
	let nextTrackId = Math.max(...tracks.map(x => x.id)) + 1;

	return fullBox('mvhd', 0, 0, [
		u32(creationTime), // Creation time
		u32(creationTime), // Modification time
		u32(GLOBAL_TIMESCALE), // Timescale
		u32(duration), // Duration
		fixed32(1.0), // Preferred rate
		fixed16(1.0), // Preferred volume
		Array(10).fill(0), // Reserved
		IDENTITY_MATRIX, // Matrix
		Array(24).fill(0), // Pre-defined
		u32(nextTrackId) // Next track ID
	]);
};

/**
 * Track Box: Defines a single track of a movie. A movie may consist of one or more tracks. Each track is
 * independent of the other tracks in the movie and carries its own temporal and spatial information. Each Track Box
 * contains its associated Media Box.
 */
export const trak = (track: Track, creationTime: number) => box('trak', null, [
	tkhd(track, creationTime),
	mdia(track, creationTime)
]);

/** Track Header Box: Specifies the characteristics of a single track within a movie. */
export const tkhd = (
	track: Track,
	creationTime: number
) => {
	let lastSample = last(track.samples);
	let durationInGlobalTimescale = timestampToUnits(
		lastSample.timestamp + lastSample.duration,
		GLOBAL_TIMESCALE
	);

	return fullBox('tkhd', 0, 3, [
		u32(creationTime), // Creation time
		u32(creationTime), // Modification time
		u32(track.id), // Track ID
		u32(0), // Reserved
		u32(durationInGlobalTimescale), // Duration
		Array(8).fill(0), // Reserved
		0x00, 0x00, // Layer
		0x00, 0x00, // Alternate group
		fixed16(track.info.type === 'audio' ? 1 : 0), // Volume
		0x00, 0x00, // Reserved
		IDENTITY_MATRIX, // Matrix
		fixed32(track.info.type === 'video' ? track.info.width : 0), // Track width
		fixed32(track.info.type === 'video' ? track.info.height : 0) // Track height
	]);
};

/** Media Box: Describes and define a track's media type and sample data. */
export const mdia = (track: Track, creationTime: number) => box('mdia', null, [
	mdhd(track, creationTime),
	hdlr(track.info.type === 'video' ? 'vide' : 'soun'),
	minf(track)
]);

/** Media Header Box: Specifies the characteristics of a media, including timescale and duration. */
export const mdhd = (
	track: Track,
	creationTime: number
) => {
	let lastSample = last(track.samples);
	let localDuration = timestampToUnits(
		lastSample.timestamp + lastSample.duration,
		track.timescale
	);

	return fullBox('mdhd', 0, 0, [
		u32(creationTime), // Creation time
		u32(creationTime), // Modification time
		u32(track.timescale), // Timescale
		u32(localDuration), // Duration
		0b01010101, 0b11000100, // Language ("und", undetermined)
		u16(0) // Quality
	]);
};

/** Handler Reference Box: Specifies the media handler component that is to be used to interpret the media's data. */
export const hdlr = (componentSubtype: string) => fullBox('hdlr', 0, 0, [
	ascii('mhlr'), // Component type
	ascii(componentSubtype), // Component subtype
	u32(0), // Component manufacturer
	u32(0), // Component flags
	u32(0), // Component flags mask
	ascii('mp4-muxer-hdlr') // Component name
]);

/**
 * Media Information Box: Stores handler-specific information for a track's media data. The media handler uses this
 * information to map from media time to media data and to process the media data.
 */
export const minf = (track: Track) => box('minf', null, [
	track.info.type === 'video' ? vmhd() : smhd(),
	dinf(),
	stbl(track)
]);

/** Video Media Information Header Box: Defines specific color and graphics mode information. */
export const vmhd = () => fullBox('vmhd', 0, 1, [
	u16(0), // Graphics mode
	u16(0), // Opcolor R
	u16(0), // Opcolor G
	u16(0) // Opcolor B
]);

/** Sound Media Information Header Box: Stores the sound media's control information, such as balance. */
export const smhd = () => fullBox('smhd', 0, 0, [
	0x00, 0x00, // Balance
	0x00, 0x00 // Reserved
]);

/**
 * Data Information Box: Contains information specifying the data handler component that provides access to the
 * media data. The data handler component uses the Data Information Box to interpret the media's data.
 */
export const dinf = () => box('dinf', null, [
	dref()
]);

/**
 * Data Reference Box: Contains tabular data that instructs the data handler component how to access the media's data.
 */
export const dref = () => fullBox('dref', 0, 0, [
	u32(1) // Entry count
], [
	url()
]);

export const url = () => fullBox('url ', 0, 1); // Self-reference flag enabled

/**
 * Sample Table Box: Contains information for converting from media time to sample number to sample location. This box
 * also indicates how to interpret the sample (for example, whether to decompress the video data and, if so, how).
 */
export const stbl = (track: Track) => box('stbl', null, [
	stsd(track),
	stts(track),
	stss(track),
	stsc(track),
	stsz(track),
	stco(track)
]);

/**
 * Sample Description Box: Stores information that allows you to decode samples in the media. The data stored in the
 * sample description varies, depending on the media type.
 */
export const stsd = (track: Track) => fullBox('stsd', 0, 0, [
	u32(1) // Entry count
], [
	track.info.type === 'video'
		? avc1(track as Track & { info: { type: 'video' } })
		: mp4a(track as Track & { info: { type: 'audio' } })
]);

/** Video Sample Description Box: Contains information that defines how to interpret video media data. */
export const avc1 = (track: Track & { info: { type: 'video' } }) => box('avc1', [
	Array(6).fill(0), // Reserved
	0x00, 0x01, // Data reference index
	0x00, 0x00, // Pre-defined
	0x00, 0x00, // Reserved
	Array(12).fill(0), // Pre-defined
	u16(track.info.width), // Width
	u16(track.info.height), // Height
	u32(0x00480000), // Horizontal resolution
	u32(0x00480000), // Vertical resolution
	u32(0), // Reserved
	u16(1), // Frame count
	Array(32).fill(0), // Compressor name
	u16(0x0018), // Depth
	i16(0xffff) // Pre-defined
], [
	avcC(track)
]);

/** Provides additional information to the decoder. */
export const avcC = (track: Track) => box('avcC', [...track.codecPrivate]);

/** Sound Sample Description Box: Contains information that defines how to interpret sound media data. */
export const mp4a = (track: Track & { info: { type: 'audio' } }) => box('mp4a', [
	Array(6).fill(0), // Reserved
	u16(1), // Data reference index
	u16(0), // Version
	u16(0), // Revision level
	u32(0), // Vendor
	u16(track.info.numberOfChannels), // Number of channels
	u16(track.info.bitDepth), // Sample size (bits)
	u16(0), // Compression ID
	u16(0), // Packet size
	fixed32(track.info.sampleRate) // Sample rate
], [
	esds(track)
]);

/** MPEG-4 Elementary Stream Descriptor Box. */
export const esds = (track: Track) => fullBox('esds', 0, 0, [
	// https://stackoverflow.com/a/54803118
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
]);

/**
 * Time-To-Sample Box: Stores duration information for a media's samples, providing a mapping from a time in a media
 * to the corresponding data sample. The table is compact, meaning that consecutive samples with the same time delta
 * will be grouped.
 */
export const stts = (track: Track) => {
	let current: Sample[] = [];
	let entries: { sampleCount: number, sampleDelta: number }[] = [];

	for (let sample of track.samples) {
		current.push(sample);
		if (current.length === 1) continue;

		let referenceDelta = timestampToUnits(current[1].timestamp - current[0].timestamp, track.timescale);
		let newDelta = timestampToUnits(sample.timestamp - current[current.length - 2].timestamp, track.timescale);
		if (newDelta !== referenceDelta) {
			entries.push({ sampleCount: current.length - 1, sampleDelta: referenceDelta });
			current = current.slice(-2);
		}
	}

	entries.push({
		sampleCount: current.length,
		sampleDelta:
			timestampToUnits((current[1]?.timestamp ?? current[0].timestamp) - current[0].timestamp, track.timescale)
	});

	return fullBox('stts', 0, 0, [
		u32(entries.length), // Number of entries
		entries.map(x => [u32(x.sampleCount), u32(x.sampleDelta)]) // Time-to-sample table
	]);
};

/** Sync Sample Box: Identifies the key frames in the media, marking the random access points within a stream. */
export const stss = (track: Track) => {
	if (track.samples.every(x => x.type === 'key')) return null; // No stss box -> every frame is a key frame

	let keySamples = [...track.samples.entries()].filter(([, sample]) => sample.type === 'key');
	return fullBox('stss', 0, 0, [
		u32(keySamples.length), // Number of entries
		keySamples.map(([index]) => u32(index + 1)) // Sync sample table
	]);
};

/**
 * Sample-To-Chunk Box: As samples are added to a media, they are collected into chunks that allow optimized data
 * access. A chunk contains one or more samples. Chunks in a media may have different sizes, and the samples within a
 * chunk may have different sizes. The Sample-To-Chunk Box stores chunk information for the samples in a media, stored
 * in a compactly-coded fashion.
 */
export const stsc = (track: Track) => {
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

	return fullBox('stsc', 0, 0, [
		u32(compactlyCodedChunks.length), // Number of entries
		compactlyCodedChunks.map(x => [ // Sample-to-chunk table
			u32(x.firstChunk), // First chunk
			u32(x.samplesPerChunk), // Samples per chunk
			u32(1) // Sample description index
		])
	]);
};

/** Sample Size Box: Specifies the byte size of each sample in the media. */
export const stsz = (track: Track) => fullBox('stsz', 0, 0, [
	u32(0), // Sample size (0 means non-constant size)
	u32(track.samples.length), // Number of entries
	track.samples.map(x => u32(x.size)) // Sample size table
]);

/** Chunk Offset Box: Identifies the location of each chunk of data in the media's data stream, relative to the file. */
export const stco = (track: Track) => fullBox('stco', 0, 0, [
	u32(track.writtenChunks.length), // Number of entries
	track.writtenChunks.map(x => u32(x.offset)) // Chunk offset table
]);