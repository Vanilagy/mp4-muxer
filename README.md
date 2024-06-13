# mp4-muxer - JavaScript MP4 multiplexer

[![](https://img.shields.io/npm/v/mp4-muxer)](https://www.npmjs.com/package/mp4-muxer)
[![](https://img.shields.io/bundlephobia/minzip/mp4-muxer)](https://bundlephobia.com/package/mp4-muxer)
[![](https://img.shields.io/npm/dm/mp4-muxer)](https://www.npmjs.com/package/mp4-muxer)

The WebCodecs API provides low-level access to media codecs, but provides no way of actually packaging (multiplexing)
the encoded media into a playable file. This project implements an MP4 multiplexer in pure TypeScript, which is
high-quality, fast and tiny, and supports both video and audio as well as various internal layouts such as Fast Start or
fragmented MP4.

[Demo: Muxing into a file](https://vanilagy.github.io/mp4-muxer/demo/)

[Demo: Live streaming](https://vanilagy.github.io/mp4-muxer/demo-streaming)

> **Note:** If you're looking to create **WebM** files, check out [webm-muxer](https://github.com/Vanilagy/webm-muxer),
the sister library to mp4-muxer.

> Consider [donating](https://ko-fi.com/vanilagy) if you've found this library useful and wish to support it ❤️

## Quick start
The following is an example for a common usage of this library:
```js
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

let muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
        codec: 'avc',
        width: 1280,
        height: 720
    },
    fastStart: 'in-memory'
});

let videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => console.error(e)
});
videoEncoder.configure({
    codec: 'avc1.42001f',
    width: 1280,
    height: 720,
    bitrate: 1e6
});

/* Encode some frames... */

await videoEncoder.flush();
muxer.finalize();

let { buffer } = muxer.target; // Buffer contains final MP4 file
```

## Motivation
After [webm-muxer](https://github.com/Vanilagy/webm-muxer) gained traction for its ease of use and integration with the
WebCodecs API, this library was created to now also allow the creation of MP4 files while maintaining the same DX.
While WebM is a more modern format, MP4 is an established standard and supported on way more devices.

## Installation
Using NPM, simply install this package using
```
npm install mp4-muxer
```
You can import all exported classes like so:
```js
import * as Mp4Muxer from 'mp4-muxer';
// Or, using CommonJS:
const Mp4Muxer = require('mp4-muxer');
```
Alternatively, you can simply include the library as a script in your HTML, which will add an `Mp4Muxer` object,
containing all the exported classes, to the global object, like so:
```html
<script src="build/mp4-muxer.js"></script>
```

## Usage
### Initialization
For each MP4 file you wish to create, create an instance of `Muxer` like so:
```js
import { Muxer } from 'mp4-muxer';

let muxer = new Muxer(options);
```
The available options are defined by the following interface:
```ts
interface MuxerOptions {
    target:
        | ArrayBufferTarget
        | StreamTarget
        | FileSystemWritableFileStreamTarget,

    video?: {
        codec: 'avc' | 'hevc' | 'vp9' | 'av1',
        width: number,
        height: number,

        // Adds rotation metadata to the file
        rotation?: 0 | 90 | 180 | 270 | TransformationMatrix
    },

    audio?: {
        codec: 'aac' | 'opus',
        numberOfChannels: number,
        sampleRate: number
    },

    fastStart:
        | false
        | 'in-memory'
        | 'fragmented'
        | { expectedVideoChunks?: number, expectedAudioChunks?: number }

    firstTimestampBehavior?: 'strict' | 'offset' | 'cross-track-offset'
}
```
Codecs currently supported by this library are AVC/H.264, HEVC/H.265, VP9 and AV1 for video, and AAC and Opus for audio.
#### `target` (required)
This option specifies where the data created by the muxer will be written. The options are:
- `ArrayBufferTarget`: The file data will be written into a single large buffer, which is then stored in the target.

    ```js
    import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

    let muxer = new Muxer({
        target: new ArrayBufferTarget(),
        fastStart: 'in-memory',
        // ...
    });

    // ...

    muxer.finalize();
    let { buffer } = muxer.target;
    ```
- `StreamTarget`: This target defines callbacks that will get called whenever there is new data available  - this is
    useful if you want to stream the data, e.g. pipe it somewhere else. The constructor has the following signature:

    ```ts
    constructor(options: {
        onData?: (data: Uint8Array, position: number) => void,
        chunked?: boolean,
        chunkSize?: number
    });
    ```

    `onData` is called for each new chunk of available data. The `position` argument specifies the offset in bytes at
    which the data has to be written. Since the data written by the muxer is not always sequential, **make sure to
    respect this argument**.
    
    When using `chunked: true`, data created by the muxer will first be accumulated and only written out once it has
    reached sufficient size. This is useful for reducing the total amount of writes, at the cost of latency. It using a
    default chunk size of 16 MiB, which can be overridden by manually setting `chunkSize` to the desired byte length.

    If you want to use this target for *live-streaming*, i.e. playback before muxing has finished, you also need to set
    `fastStart: 'fragmented'`.

    Usage example:
    ```js
    import { Muxer, StreamTarget } from 'mp4-muxer';

    let muxer = new Muxer({
        target: new StreamTarget({
            onData: (data, position) => { /* Do something with the data */ }
        }),
        fastStart: false,
        // ...
    });
    ```
- `FileSystemWritableFileStreamTarget`: This is essentially a wrapper around a chunked `StreamTarget` with the intention
    of simplifying the use of this library with the File System Access API. Writing the file directly to disk as it's
    being created comes with many benefits, such as creating files way larger than the available RAM.

    You can optionally override the default `chunkSize` of 16 MiB.
    ```ts
    constructor(
        stream: FileSystemWritableFileStream,
        options?: { chunkSize?: number }
    );
    ```

    Usage example:
    ```js
    import { Muxer, FileSystemWritableFileStreamTarget } from 'mp4-muxer';
    
    let fileHandle = await window.showSaveFilePicker({
        suggestedName: `video.mp4`,
        types: [{
            description: 'Video File',
            accept: { 'video/mp4': ['.mp4'] }
        }],
    });
    let fileStream = await fileHandle.createWritable();
    let muxer = new Muxer({
        target: new FileSystemWritableFileStreamTarget(fileStream),
        fastStart: false,
        // ...
    });
    
    // ...

    muxer.finalize();
    await fileStream.close(); // Make sure to close the stream
    ```
#### `fastStart` (required)
By default, MP4 metadata (track info, sample timing, etc.) is stored at the end of the file - this makes writing the
file faster and easier. However, placing this metadata at the _start_ of the file instead (known as "Fast Start")
provides certain benefits: The file becomes easier to stream over the web without range requests, and sites like YouTube
can start processing the video while it's uploading. This library provides full control over the placement of metadata
setting `fastStart` to one of these options:
- `false`: Disables Fast Start, placing all metadata at the end of the file. This option is the fastest and uses the
    least memory. This option is recommended for large, unbounded files that are streamed directly to disk.
- `'in-memory'`: Produces a file with Fast Start by keeping all media chunks in memory until the file is finalized. This
    option produces the most compact output possible at the cost of a more expensive finalization step and higher memory
    requirements. This is the preferred option when using `ArrayBufferTarget` as it will result in a higher-quality
    output with no change in memory footprint.
- `'fragmented'`: Produces a _fragmented MP4 (fMP4)_ file, evenly placing sample metadata throughout the file by
    grouping it into "fragments" (short sections of media), while placing general metadata at the beginning of the file.
    Fragmented files are ideal for streaming, as they are optimized for random access with minimal to no seeking.
    Furthermore, they remain lightweight to create no matter how large the file becomes, as they don't require media to
    be kept in memory for very long. While fragmented files are not as widely supported as regular MP4 files, this
    option provides powerful benefits with very little downsides. Further details
    [here](#additional-notes-about-fragmented-mp4-files).
- `object`: Produces a file with Fast Start by reserving space for metadata when muxing begins. To know
    how many bytes need to be reserved to be safe, you'll have to provide the following data:
    ```ts
    {
        expectedVideoChunks?: number,
        expectedAudioChunks?: number
    }
    ```
    Note that the property `expectedVideoChunks` is _required_ if you have a video track - the same goes for audio. With
    this option set, you cannot mux more chunks than the number you've specified (although less is fine).

    This option is faster than `'in-memory'` and uses no additional memory, but results in a slightly larger output,
    making it useful for when you want to stream the file to disk while still retaining Fast Start.
#### `firstTimestampBehavior` (optional)
Specifies how to deal with the first chunk in each track having a non-zero timestamp. In the default strict mode,
timestamps must start with 0 to ensure proper playback. However, when directly piping video frames or audio data
from a MediaTrackStream into the encoder and then the muxer, the timestamps are usually relative to the age of
the document or the computer's clock, which is typically not what we want. Handling of these timestamps must be
set explicitly:
- Use `'offset'` to offset the timestamp of each track by that track's first chunk's timestamp. This way, it
starts at 0.
- Use `'cross-track-offset'` to offset the timestamp of each track by the _minimum of all tracks' first chunk timestamp_.
This works like `'offset'`, but should be used when the all tracks use the same clock.

### Muxing media chunks
Then, with VideoEncoder and AudioEncoder set up, send encoded chunks to the muxer using the following methods:
```ts
addVideoChunk(
    chunk: EncodedVideoChunk,
    meta?: EncodedVideoChunkMetadata,
    timestamp?: number,
    compositionTimeOffset?: number
): void;

addAudioChunk(
    chunk: EncodedAudioChunk,
    meta?: EncodedAudioChunkMetadata,
    timestamp?: number
): void;
```

Both methods accept an optional, third argument `timestamp` (microseconds) which, if specified, overrides
the `timestamp` property of the passed-in chunk.

The metadata comes from the second parameter of the `output` callback given to the
VideoEncoder or AudioEncoder's constructor and needs to be passed into the muxer, like so:
```js
let videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => console.error(e)
});
videoEncoder.configure(/* ... */);
```

The optional field `compositionTimeOffset` can be used when the decode time of the chunk doesn't equal its presentation
time; this is the case when [B-frames](https://en.wikipedia.org/wiki/Video_compression_picture_types) are present.
B-frames don't occur when using the WebCodecs API for encoding. The decode time is calculated by subtracting
`compositionTimeOffset` from `timestamp`, meaning `timestamp` dictates the presentation time.

Should you have obtained your encoded media data from a source other than the WebCodecs API, you can use these following
methods to directly send your raw data to the muxer:
```ts
addVideoChunkRaw(
    data: Uint8Array,
    type: 'key' | 'delta',
    timestamp: number, // in microseconds
    duration: number, // in microseconds
    meta?: EncodedVideoChunkMetadata,
    compositionTimeOffset?: number // in microseconds
): void;

addAudioChunkRaw(
    data: Uint8Array,
    type: 'key' | 'delta',
    timestamp: number, // in microseconds
    duration: number, // in microseconds
    meta?: EncodedAudioChunkMetadata
): void;
```

### Finishing up
When encoding is finished and all the encoders have been flushed, call `finalize` on the `Muxer` instance to finalize
the MP4 file:
```js
muxer.finalize();
```
When using an ArrayBufferTarget, the final buffer will be accessible through it:
```js
let { buffer } = muxer.target;
```
When using a FileSystemWritableFileStreamTarget, make sure to close the stream after calling `finalize`:
```js
await fileStream.close();
```

## Details
### Variable frame rate
MP4 files support variable frame rate, however some players (such as QuickTime) have been observed not to behave well
when the timestamps are irregular. Therefore, whenever possible, try aiming for a fixed frame rate.

### Additional notes about fragmented MP4 files
By breaking up the media and related metadata into small fragments, fMP4 files optimize for random access and are ideal
for streaming, while remaining cheap to write even for long files. However, you should keep these things in mind:
- **Media chunk buffering:**
    When muxing a file with a video **and** an audio track, the muxer needs to wait for the chunks from _both_ media
    to finalize any given fragment. In other words, it must buffer chunks of one medium if the other medium has not yet
    encoded chunks up to that timestamp. For example, should you first encode all your video frames and then encode the
    audio afterward, the multiplexer will have to hold all those video frames in memory until the audio chunks start
    coming in. This might lead to memory exhaustion should your video be very long. When there is only one media track,
    this issue does not arise. So, when muxing a multimedia file, make sure it is somewhat limited in size or the chunks
    are encoded in a somewhat interleaved way (like is the case for live media). This will keep memory usage at a
    constant low.
- **Video key frame frequency:**
    Every track's first sample in a fragment must be a key frame in order to be able to play said fragment without the
    knowledge of previous ones. However, this means that the muxer needs to wait for a video key frame to begin a new
    fragment. If these key frames are too infrequent, fragments become too large, harming random access. Therefore,
    every 5–10 seconds, you should force a video key frame like so:
    ```js
    videoEncoder.encode(frame, { keyFrame: true });
    ```

## Implementation & development
MP4 files are based on the ISO Base Media Format, which structures its files as a hierarchy of boxes (or atoms). The
standards used to implement this library were
[ISO/IEC 14496-1](http://netmedia.zju.edu.cn/multimedia2013/mpeg-4/ISO%20IEC%2014496-1%20MPEG-4%20System%20Standard.pdf),
[ISO/IEC 14496-12](https://web.archive.org/web/20231123030701/https://b.goeswhere.com/ISO_IEC_14496-12_2015.pdf)
and
[ISO/IEC 14496-14](https://github.com/OpenAnsible/rust-mp4/raw/master/docs/ISO_IEC_14496-14_2003-11-15.pdf).
Additionally, the
[QuickTime MP4 Specification](https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFPreface/qtffPreface.html)
was a very useful resource.

For development, clone this repository, install everything with `npm install`, then run `npm run watch` to bundle the
code into the `build` directory. Run `npm run check` to run the TypeScript type checker, and `npm run lint` to run
ESLint.
