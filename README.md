# mp4-muxer - JavaScript MP4 multiplexer

[![](https://img.shields.io/npm/v/mp4-muxer)](https://www.npmjs.com/package/mp4-muxer)
[![](https://img.shields.io/bundlephobia/minzip/mp4-muxer)](https://bundlephobia.com/package/mp4-muxer)

The WebCodecs API provides low-level access to media codecs, but provides no way of actually packaging (multiplexing)
the encoded media into a playable file. This project implements an MP4 multiplexer in pure TypeScript, which is
high-quality, fast and tiny, and supports both video and audio.

[Demo: Muxing into a file](https://vanilagy.github.io/mp4-muxer/demo/)

> **Note:** If you're looking to create **WebM** files, check out [webm-muxer](https://github.com/Vanilagy/webm-muxer),
the sister library to mp4-muxer.

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
    }
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
        rotation?: 0 | 90 | 180 | 270 // Adds rotation metadata to the file
    },

    audio?: {
        codec: 'aac' | 'opus',
        numberOfChannels: number,
        sampleRate: number
    },

    firstTimestampBehavior?: 'strict' | 'offset'
}
```
Codecs currently supported by this library are AVC/H.264, HEVC/H.265, VP9 and AV1 for video, and AAC and Opus for audio.
#### `target`
This option specifies where the data created by the muxer will be written. The options are:
- `ArrayBufferTarget`: The file data will be written into a single large buffer, which is then stored in the target.

    ```js
    import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

    let muxer = new Muxer({
        target: new ArrayBufferTarget(),
        // ...
    });

    // ...

    muxer.finalize();
    let { buffer } = muxer.target;
    ```
- `StreamTarget`: This target defines callbacks that will get called whenever there is new data available  - this is
    useful if you want to stream the data, e.g. pipe it somewhere else. The constructor has the following signature:

    ```ts
    constructor(
        onData: (data: Uint8Array, position: number) => void,
        onDone?: () => void,
        options?: { chunked?: true, chunkSize?: number }
    );
    ```

    The `position` argument specifies the offset in bytes at which the data has to be written. Since the data written by
    the muxer is not entirely sequential, **make sure to respect this argument**.
    
    When using `chunked: true` in the options, data created by the muxer will first be accumulated and only written out
    once it has reached sufficient size. This is useful for reducing the total amount of writes, at the cost of
    latency. It using a default chunk size of 16 MiB, which can be overridden by manually setting `chunkSize` to the
    desired byte length.
    
    Note that this target is **not** intended for *live-streaming*, i.e. playback before muxing has finished.

    ```js
    import { Muxer, StreamTarget } from 'mp4-muxer';

    let muxer = new Muxer({
        target: new StreamTarget(
            (data, position) => { /* Do something with the data */ },
            () => { /* Muxing has finished */ }
        ),
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
        // ...
    });
    
    // ...

    muxer.finalize();
    await fileStream.close(); // Make sure to close the stream
    ```
#### `firstTimestampBehavior` (optional)
Specifies how to deal with the first chunk in each track having a non-zero timestamp. In the default strict mode,
timestamps must start with 0 to ensure proper playback. However, when directly piping video frames or audio data
from a MediaTrackStream into the encoder and then the muxer, the timestamps are usually relative to the age of
the document or the computer's clock, which is typically not what we want. Handling of these timestamps must be
set explicitly:
- Use `'offset'` to offset the timestamp of each video track by that track's first chunk's timestamp. This way, it
starts at 0.

### Muxing media chunks
Then, with VideoEncoder and AudioEncoder set up, send encoded chunks to the muxer using the following methods:
```ts
addVideoChunk(
    chunk: EncodedVideoChunk,
    meta?: EncodedVideoChunkMetadata,
    timestamp?: number
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

Should you have obtained your encoded media data from a source other than the WebCodecs API, you can use these following
methods to directly send your raw data to the muxer:
```ts
addVideoChunkRaw(
    data: Uint8Array,
    type: 'key' | 'delta',
    timestamp: number, // in microseconds
    duration: number, // in microseconds
    meta?: EncodedVideoChunkMetadata
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

## Implementation & development
MP4 files are based on the ISO Base Media Format, which structures its files as a hierarchy of boxes (or atoms). The
standards used to implement this library were
[ISO/IEC 14496-1](http://netmedia.zju.edu.cn/multimedia2013/mpeg-4/ISO%20IEC%2014496-1%20MPEG-4%20System%20Standard.pdf),
[ISO/IEC 14496-12](https://web.archive.org/web/20180219054429/http://l.web.umkc.edu/lizhu/teaching/2016sp.video-communication/ref/mp4.pdf)
and
[ISO/IEC 14496-14](https://github.com/OpenAnsible/rust-mp4/raw/master/docs/ISO_IEC_14496-14_2003-11-15.pdf).
Additionally, the
[QuickTime MP4 Specification](https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFPreface/qtffPreface.html)
was a very useful resource.

For development, clone this repository, install everything with `npm install`, then run `npm run watch` to bundle the
code into the `build` directory. Run `npm run check` to run the TypeScript type checker, and `npm run lint` to run
ESLint.