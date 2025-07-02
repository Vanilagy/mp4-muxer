# Guide: Migrating to Mediabunny

mp4-muxer has been deprecated and is superseded by [Mediabunny](https://mediabunny.dev/). Mediabunny's MP4 multiplexer was originally based on the one from mp4-muxer and has now evolved into a much better multiplexer:

- Produces better, more correct MP4 files
- Support for multiple video & audio tracks
- Support for many, *many* more codecs
- Support for writing .mov files
- Support for subtitle tracks
- Support for more track metadata
- Pipelining & backpressure features
- Improved performance

And even though Mediabunny has many other features, it is built to be extremely tree-shakable and therefore will still result in a tiny bundle when only using its MP4 multiplexer (17 kB vs mp4-muxer's 9 kB). Thus, you should **always** prefer Mediabunny over mp4-muxer - this library is now obsolete.

## Muxer migration

If you wanted to perform the most direct mapping possible, the following code using mp4-muxer:
```ts
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

let muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
        codec: VIDEO_CODEC,
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
        rotation: VIDEO_ROTATION,
        frameRate: VIDEO_FRAME_RATE,
    },
    audio: {
        codec: AUDIO_CODEC,
        numberOfChannels: AUDIO_NUMBER_OF_CHANNELS,
        sampleRate: AUDIO_SAMPLE_RATE
    },
    fastStart: FAST_START,
    minFragmentDuration: MIN_FRAGMENT_DURATION
});

// Assuming these are called from video/audio encoder callbacks
muxer.addVideoChunk(VIDEO_CHUNK, VIDEO_CHUNK_METADATA);
muxer.addAudioChunk(AUDIO_CHUNK, AUDIO_CHUNK_METADATA);

muxer.finalize();
```

...maps to this code using Mediabunny:
```ts
import { Output, Mp4OutputFormat, BufferTarget, EncodedVideoPacketSource, EncodedAudioPacketSource, EncodedPacket } from 'mediabunny';

const output = new Output({
    format: new Mp4OutputFormat({
        fastStart: FAST_START,
        minimumFragmentDuration: MIN_FRAGMENT_DURATION,
    }),
    target: new BufferTarget(),
});

const videoSource = new EncodedVideoPacketSource(VIDEO_CODEC);
output.addVideoTrack(videoSource, {
    rotation: VIDEO_ROTATION,
    frameRate: VIDEO_FRAME_RATE,
});

const audioSource = new EncodedAudioPacketSource(AUDIO_CODEC);
output.addAudioTrack(audioSource);

await output.start();

// Assuming these are called from video/audio encoder callbacks
await videoSource.add(EncodedPacket.fromEncodedChunk(VIDEO_CHUNK), VIDEO_CHUNK_METADATA);
await audioSource.add(EncodedPacket.fromEncodedChunk(AUDIO_CHUNK), AUDIO_CHUNK_METADATA);

await output.finalize();
```

The major differences are:
- `Muxer` is now `Output`: Each `Output` represents one media file. The MP4-specific options are now nested within `Mp4OutputFormat`.
- Tracks must be added to the `Output` after instantiating it.
- `start` must be called before adding any media data, and after registering all tracks.
- Adding encoded chunks is no longer a direct functionality; instead, it is enabled by the `EncodedVideoPacketSource` and `EncodedAudioPacketSource`.
- Encoded chunks are now provided via Mediabunny's own [`EncodedPacket`](https://mediabunny.dev/guide/packets-and-samples#encodedpacket) class.
- Media characteristics, such as width, height, channel count or sample rate, must no longer be specified anywhere - they are deduced automatically.
- Many methods must now be `await`ed; this is because Mediabunny is deeply pipelined with complex backpressure handling logic, which automatically propagates to the top-level code via promises.

### But wait:

Even though this direct mapping works, Mediabunny has rich, powerful abstractions around the WebCodecs API and it's very likely you can ditch your entire manual encoding stack altogether. This means you likely won't need to use `EncodedVideoPacketSource` or `EncodedAudioPacketSource` at all.

To learn more, read up on [Media sources](https://mediabunny.dev/guide/media-sources).

## Target migration

An `Output`'s target can be accessed via `output.target`.

### `ArrayBufferTarget`

This class is simply called `BufferTarget` now. Just like `ArrayBufferTarget`, its `buffer` property is `null` before file finalization and an `ArrayBuffer` after.

### `StreamTarget`

This class is still called `StreamTarget` in Mediabunny but is now based on [`WritableStream`](https://developer.mozilla.org/en-US/docs/Web/API/WritableStream) to integrate natively with the Streams API and allow for writer backpressure.

The direct mapping is:

```ts
import { StreamTarget } from 'mp4-muxer';

let target = new StreamTarget({
    onData: ON_DATA_CALLBACK,
    chunked: CHUNKED_OPTION,
    chunkSize: CHUNK_SIZE_OPTION
});
```
->
```ts
import { StreamTarget } from 'mediabunny';

const target = new StreamTarget(new WritableStream({
    write(chunk) {
        ON_DATA_CALLBACK(chunk.data, chunk.position);
    }
}), {
    chunked: CHUNKED_OPTION,
    chunkSize: CHUNK_SIZE_OPTION,
})
```

### `FileSystemWritableFileStreamTarget`

This class has been removed. Instead, `StreamTarget` now naturally integrates with the File System API:

```ts
import { StreamTarget } from 'mediabunny';

const handle = await window.showSaveFilePicker();
const writableStream = await handle.createWritable();
const target = new StreamTarget(writableStream);
```

With this pattern, there is now no more need to manually close the file stream - `finalize()` will automatically do it for you.

## Other things

### Adding raw data

The previous `addVideoChunkRaw` and `addAudioChunkRaw` methods can now simply be emulated by creating an [`EncodedPacket`](https://mediabunny.dev/guide/packets-and-samples#encodedpacket) from the raw data and passing it to `add` on the respective track source.

### `firstTimestampBehavior`

No longer exists. Timestamp behavior is now much more permissive, allowing tracks to start with a non-zero timestamp. Tracks driven by live media sources via [`MediaStreamVideoTrackSource`](https://mediabunny.dev/guide/media-sources#mediastreamvideotracksource) and [`MediaStreamAudioTrackSource`](https://mediabunny.dev/guide/media-sources#mediastreamaudiotracksource) will automatically behave the same as the old `cross-track-offset` option.

### `compositionTimeOffset` and B-frames

The option `compositionTimeOffset` no longer exists. Instead, the timestamps of all packets added to the file refer to their *presentation timestamp*. To enable B-frames, which have out-of-order presentation timestamps, the API is dead-simple: Simply add the chunks in decode order. The multiplexer will automatically figure out the decode timestamps for you. For more detail on this, check out the section on [B-frames](https://mediabunny.dev/guide/media-sources#b-frames).

### Object in `fastStart`

Removed.

### Transformation matrix for video rotation

Removed.