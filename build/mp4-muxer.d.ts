declare interface VideoOptions {
	/**
	 * The codec of the encoded video chunks.
	 */
	codec: 'avc' | 'hevc' | 'vp9' | 'av1',
	/**
	 * The width of the video in pixels.
	 */
	width: number,
	/**
	 * The height of the video in pixels.
	 */
	height: number,
	/**
	 * The clockwise rotation of the video in degrees.
	 */
	rotation?: 0 | 90 | 180 | 270
}

declare interface AudioOptions {
	/**
	 * The codec of the encoded audio chunks.
	 */
	codec: 'aac' | 'opus',
	/**
	 * The number of audio channels in the audio track.
	 */
	numberOfChannels: number,
	/**
	 * The sample rate of the audio track in samples per second per channel.
	 */
	sampleRate: number
}

type NoInfer<T> = T extends infer S ? S : never;

/**
 * Describes the properties used to configure an instance of `Muxer`.
 */
declare type MuxerOptions<
	T extends Target,
	V extends VideoOptions | undefined = undefined,
	A extends AudioOptions | undefined = undefined
> = {
	/**
	 * Specifies what happens with the data created by the muxer.
	 */
	target: T,

	/**
	 * When set, declares the existence of a video track in the MP4 file and configures that video track.
	 */
	video?: V,

	/**
	 * When set, declares the existence of an audio track in the MP4 file and configures that audio track.
	 */
	audio?: A,

	/**
	 * Controls the placement of metadata in the file. Placing metadata at the start of the file is known as "Fast
	 * Start", which results in better playback at the cost of more required processing or memory.
	 *
	 * Use `false` to disable Fast Start, placing the metadata at the end of the file. Fastest and uses the least
	 * memory.
	 *
	 * Use `'in-memory'` to produce a file with Fast Start by keeping all media chunks in memory until the file is
	 * finalized. This produces a high-quality and compact output at the cost of a more expensive finalization step and
	 * higher memory requirements.
	 *
	 * Use an object to produce a file with Fast Start by reserving space for metadata when muxing starts. In order to
	 * know how much space needs to be reserved, you'll need to tell it the upper bound of how many media chunks will be
	 * muxed. Do this by setting `expectedVideoChunks` and/or `expectedAudioChunks`.
	 */
	fastStart: false | 'in-memory' | (
		(NoInfer<V> extends undefined ? { expectedVideoChunks?: never } : { expectedVideoChunks: number })
		& (NoInfer<A> extends undefined ? { expectedAudioChunks?: never } : { expectedAudioChunks: number })
	),

	/**
	 * Specifies how to deal with the first chunk in each track having a non-zero timestamp. In the default strict mode,
	 * timestamps must start with 0 to ensure proper playback. However, when directly piping video frames or audio data
	 * from a MediaTrackStream into the encoder and then the muxer, the timestamps are usually relative to the age of
	 * the document or the computer's clock, which is typically not what we want. Handling of these timestamps must be
	 * set explicitly:
	 *
	 * Use `'offset'` to offset the timestamp of each video track by that track's first chunk's timestamp. This way, it
	 * starts at 0.
	 */
	firstTimestampBehavior?: 'strict' | 'offset'
};

declare type Target = ArrayBufferTarget | StreamTarget | FileSystemWritableFileStreamTarget;

/** The file data will be written into a single large buffer, which is then stored in `buffer` upon finalization.. */
declare class ArrayBufferTarget {
	buffer: ArrayBuffer;
}

/**
 * This target defines callbacks that will get called whenever there is new data available  - this is useful if
 * you want to stream the data, e.g. pipe it somewhere else.
 *
 * When using `chunked: true` in the options, data created by the muxer will first be accumulated and only written out
 * once it has reached sufficient size, using a default chunk size of 16 MiB. This is useful for reducing the total
 * amount of writes, at the cost of latency.
 */
declare class StreamTarget {
	constructor(
		onData: (data: Uint8Array, position: number) => void,
		onDone?: () => void,
		options?: { chunked?: boolean, chunkSize?: number }
	);
}

/**
 * This is essentially a wrapper around a chunked `StreamTarget` with the intention of simplifying the use of this
 * library with the File System Access API. Writing the file directly to disk as it's being created comes with many
 * benefits, such as creating files way larger than the available RAM.
 */
declare class FileSystemWritableFileStreamTarget {
	constructor(
		stream: FileSystemWritableFileStream,
		options?: { chunkSize?: number }
	);
}

/**
 * Used to multiplex video and audio chunks into a single MP4 file. For each MP4 file you want to create, create
 * one instance of `Muxer`.
 */
declare class Muxer<
	T extends Target,
	V extends VideoOptions | undefined = undefined,
	A extends AudioOptions | undefined = undefined
> {
	target: T;

	/**
	 * Creates a new instance of `Muxer`.
	 * @param options Specifies configuration and metadata for the MP4 file.
	 */
	constructor(options: MuxerOptions<T, V, A>);

	/**
	 * Adds a new, encoded video chunk to the MP4 file.
	 * @param chunk The encoded video chunk. Can be obtained through a `VideoEncoder`.
	 * @param meta The metadata about the encoded video, also provided by `VideoEncoder`.
	 * @param timestamp Optionally, the timestamp to use for the video chunk. When not provided, it will use the one
	 * specified in `chunk`.
	 */
	addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata, timestamp?: number): void;
	/**
	 * Adds a new, encoded audio chunk to the MP4 file.
	 * @param chunk The encoded audio chunk. Can be obtained through an `AudioEncoder`.
	 * @param meta The metadata about the encoded audio, also provided by `AudioEncoder`.
	 * @param timestamp Optionally, the timestamp to use for the audio chunk. When not provided, it will use the one
	 * specified in `chunk`.
	 */
	addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata, timestamp?: number): void;

	/**
	 * Adds a raw video chunk to the MP4 file. This method should be used when the encoded video is not obtained
	 * through a `VideoEncoder` but through some other means, where no instance of `EncodedVideoChunk`is available.
	 * @param data The raw data of the video chunk.
	 * @param type Whether the video chunk is a keyframe or delta frame.
	 * @param timestamp The timestamp of the video chunk.
	 * @param duration The duration of the video chunk (typically 0).
	 * @param meta Optionally, any encoder metadata.
	 */
	addVideoChunkRaw(
		data: Uint8Array,
		type: 'key' | 'delta',
		timestamp: number,
		duration: number,
		meta?: EncodedVideoChunkMetadata
	): void;
	/**
	 * Adds a raw audio chunk to the MP4 file. This method should be used when the encoded audio is not obtained
	 * through an `AudioEncoder` but through some other means, where no instance of `EncodedAudioChunk`is available.
	 * @param data The raw data of the audio chunk.
	 * @param type Whether the audio chunk is a keyframe or delta frame.
	 * @param timestamp The timestamp of the audio chunk.
	 * @param duration The duration of the audio chunk.
	 * @param meta Optionally, any encoder metadata.
	 */
	addAudioChunkRaw(
		data: Uint8Array,
		type: 'key' | 'delta',
		timestamp: number,
		duration: number,
		meta?: EncodedAudioChunkMetadata
	): void;

	/**
	 * Is to be called after all media chunks have been added to the muxer. Make sure to call and await the `flush`
	 * method on your `VideoEncoder` and/or `AudioEncoder` before calling this method to ensure all encoding has
	 * finished. This method will then finish up the writing process of the MP4 file.
	 */
	finalize(): void;
}

declare global {
	let Mp4Muxer: typeof Mp4Muxer;
}

export { Muxer, ArrayBufferTarget, StreamTarget, FileSystemWritableFileStreamTarget };
export as namespace Mp4Muxer;