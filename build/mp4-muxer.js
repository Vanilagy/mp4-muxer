"use strict";
var Mp4Muxer = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __pow = Math.pow;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b ||= {})
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __accessCheck = (obj, member, msg) => {
    if (!member.has(obj))
      throw TypeError("Cannot " + msg);
  };
  var __privateGet = (obj, member, getter) => {
    __accessCheck(obj, member, "read from private field");
    return getter ? getter.call(obj) : member.get(obj);
  };
  var __privateAdd = (obj, member, value) => {
    if (member.has(obj))
      throw TypeError("Cannot add the same private member more than once");
    member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  };
  var __privateSet = (obj, member, value, setter) => {
    __accessCheck(obj, member, "write to private field");
    setter ? setter.call(obj, value) : member.set(obj, value);
    return value;
  };
  var __privateMethod = (obj, member, method) => {
    __accessCheck(obj, member, "access private method");
    return method;
  };

  // src/main.ts
  var main_exports = {};
  __export(main_exports, {
    default: () => main_default
  });

  // src/misc.ts
  var u16 = (value) => {
    let bytes = new Uint8Array(2);
    let view = new DataView(bytes.buffer);
    view.setUint16(0, value, false);
    return [...bytes];
  };
  var i16 = (value) => {
    let bytes = new Uint8Array(2);
    let view = new DataView(bytes.buffer);
    view.setInt16(0, value, false);
    return [...bytes];
  };
  var u32 = (value) => {
    let bytes = new Uint8Array(4);
    let view = new DataView(bytes.buffer);
    view.setUint32(0, value, false);
    return [...bytes];
  };
  var fixed16 = (value) => {
    let bytes = new Uint8Array(2);
    let view = new DataView(bytes.buffer);
    view.setUint8(0, value);
    view.setUint8(1, value << 8);
    return [...bytes];
  };
  var fixed32 = (value) => {
    let bytes = new Uint8Array(4);
    let view = new DataView(bytes.buffer);
    view.setUint16(0, value, false);
    view.setUint16(2, value << 16, false);
    return [...bytes];
  };
  var ascii = (text, nullTerminated = false) => {
    let bytes = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
    if (nullTerminated)
      bytes.push(0);
    return bytes;
  };
  var timestampToUnits = (timestamp, timescale) => {
    return Math.round(timestamp * timescale);
  };
  var last = (arr) => {
    return arr && arr[arr.length - 1];
  };

  // src/write_target.ts
  var _helper, _helperView;
  var WriteTarget = class {
    constructor() {
      this.pos = 0;
      __privateAdd(this, _helper, new Uint8Array(8));
      __privateAdd(this, _helperView, new DataView(__privateGet(this, _helper).buffer));
      /**
       * Stores the position from the start of the file to where boxes elements have been written. This is used to
       * rewrite/edit elements that were already added before, and to measure sizes of things.
       */
      this.offsets = /* @__PURE__ */ new WeakMap();
    }
    writeU32(value) {
      __privateGet(this, _helperView).setUint32(0, value, false);
      this.write(__privateGet(this, _helper).subarray(0, 4));
    }
    writeU64(value) {
      __privateGet(this, _helperView).setUint32(0, Math.floor(value / __pow(2, 32)), false);
      __privateGet(this, _helperView).setUint32(4, value, false);
      this.write(__privateGet(this, _helper).subarray(0, 8));
    }
    writeAscii(text) {
      for (let i = 0; i < text.length; i++) {
        __privateGet(this, _helperView).setUint8(i % 8, text.charCodeAt(i));
        if (i % 8 === 7)
          this.write(__privateGet(this, _helper));
      }
      if (text.length % 8 !== 0) {
        this.write(__privateGet(this, _helper).subarray(0, text.length % 8));
      }
    }
    writeBox(box) {
      var _a, _b;
      this.offsets.set(box, this.pos);
      if (box.contents && !box.children) {
        this.writeBoxHeader(box, (_a = box.size) != null ? _a : box.contents.byteLength + 8);
        this.write(box.contents);
      } else {
        let startPos = this.pos;
        this.writeBoxHeader(box, 0);
        if (box.contents)
          this.write(box.contents);
        if (box.children) {
          for (let child of box.children)
            if (child)
              this.writeBox(child);
        }
        let endPos = this.pos;
        let size = (_b = box.size) != null ? _b : endPos - startPos;
        this.pos = startPos;
        this.writeBoxHeader(box, size);
        this.pos = endPos;
      }
    }
    writeBoxHeader(box, size) {
      this.writeU32(box.largeSize ? 1 : size);
      this.writeAscii(box.type);
      if (box.largeSize)
        this.writeU64(size);
    }
    patchBox(box) {
      let endPos = this.pos;
      this.pos = this.offsets.get(box);
      this.writeBox(box);
      this.pos = endPos;
    }
  };
  _helper = new WeakMap();
  _helperView = new WeakMap();
  var _buffer, _bytes;
  var ArrayBufferWriteTarget = class extends WriteTarget {
    constructor() {
      super();
      __privateAdd(this, _buffer, new ArrayBuffer(__pow(2, 16)));
      __privateAdd(this, _bytes, new Uint8Array(__privateGet(this, _buffer)));
    }
    ensureSize(size) {
      let newLength = __privateGet(this, _buffer).byteLength;
      while (newLength < size)
        newLength *= 2;
      if (newLength === __privateGet(this, _buffer).byteLength)
        return;
      let newBuffer = new ArrayBuffer(newLength);
      let newBytes = new Uint8Array(newBuffer);
      newBytes.set(__privateGet(this, _bytes), 0);
      __privateSet(this, _buffer, newBuffer);
      __privateSet(this, _bytes, newBytes);
    }
    write(data) {
      this.ensureSize(this.pos + data.byteLength);
      __privateGet(this, _bytes).set(data, this.pos);
      this.pos += data.byteLength;
    }
    seek(newPos) {
      this.pos = newPos;
    }
    finalize() {
      this.ensureSize(this.pos);
      return __privateGet(this, _buffer).slice(0, this.pos);
    }
  };
  _buffer = new WeakMap();
  _bytes = new WeakMap();
  var FILE_CHUNK_SIZE = __pow(2, 24);
  var MAX_CHUNKS_AT_ONCE = 2;
  var _stream, _chunks;
  var FileSystemWritableFileStreamWriteTarget = class extends WriteTarget {
    constructor(stream) {
      super();
      __privateAdd(this, _stream, void 0);
      /**
       * The file is divided up into fixed-size chunks, whose contents are first filled in RAM and then flushed to disk.
       * A chunk is flushed to disk if all of its contents have been written.
       */
      __privateAdd(this, _chunks, []);
      __privateSet(this, _stream, stream);
    }
    write(data) {
      this.writeDataIntoChunks(data, this.pos);
      this.flushChunks();
      this.pos += data.byteLength;
    }
    writeDataIntoChunks(data, position) {
      let chunkIndex = __privateGet(this, _chunks).findIndex((x) => x.start <= position && position < x.start + FILE_CHUNK_SIZE);
      if (chunkIndex === -1)
        chunkIndex = this.createChunk(position);
      let chunk = __privateGet(this, _chunks)[chunkIndex];
      let relativePosition = position - chunk.start;
      let toWrite = data.subarray(0, Math.min(FILE_CHUNK_SIZE - relativePosition, data.byteLength));
      chunk.data.set(toWrite, relativePosition);
      let section = {
        start: relativePosition,
        end: relativePosition + toWrite.byteLength
      };
      insertSectionIntoFileChunk(chunk, section);
      if (chunk.written[0].start === 0 && chunk.written[0].end === FILE_CHUNK_SIZE) {
        chunk.shouldFlush = true;
      }
      if (__privateGet(this, _chunks).length > MAX_CHUNKS_AT_ONCE) {
        for (let i = 0; i < __privateGet(this, _chunks).length - 1; i++) {
          __privateGet(this, _chunks)[i].shouldFlush = true;
        }
        this.flushChunks();
      }
      if (toWrite.byteLength < data.byteLength) {
        this.writeDataIntoChunks(data.subarray(toWrite.byteLength), position + toWrite.byteLength);
      }
    }
    createChunk(includesPosition) {
      let start = Math.floor(includesPosition / FILE_CHUNK_SIZE) * FILE_CHUNK_SIZE;
      let chunk = {
        start,
        data: new Uint8Array(FILE_CHUNK_SIZE),
        written: [],
        shouldFlush: false
      };
      __privateGet(this, _chunks).push(chunk);
      __privateGet(this, _chunks).sort((a, b) => a.start - b.start);
      return __privateGet(this, _chunks).indexOf(chunk);
    }
    flushChunks(force = false) {
      for (let i = 0; i < __privateGet(this, _chunks).length; i++) {
        let chunk = __privateGet(this, _chunks)[i];
        if (!chunk.shouldFlush && !force)
          continue;
        for (let section of chunk.written) {
          __privateGet(this, _stream).write({
            type: "write",
            data: chunk.data.subarray(section.start, section.end),
            position: chunk.start + section.start
          });
        }
        __privateGet(this, _chunks).splice(i--, 1);
      }
    }
    seek(newPos) {
      this.pos = newPos;
    }
    finalize() {
      this.flushChunks(true);
    }
  };
  _stream = new WeakMap();
  _chunks = new WeakMap();
  var insertSectionIntoFileChunk = (chunk, section) => {
    let low = 0;
    let high = chunk.written.length - 1;
    let index = -1;
    while (low <= high) {
      let mid = Math.floor(low + (high - low + 1) / 2);
      if (chunk.written[mid].start <= section.start) {
        low = mid + 1;
        index = mid;
      } else {
        high = mid - 1;
      }
    }
    chunk.written.splice(index + 1, 0, section);
    if (index === -1 || chunk.written[index].end < section.start)
      index++;
    while (index < chunk.written.length - 1 && chunk.written[index].end >= chunk.written[index + 1].start) {
      chunk.written[index].end = Math.max(chunk.written[index].end, chunk.written[index + 1].end);
      chunk.written.splice(index + 1, 1);
    }
  };
  var _sections, _onFlush;
  var StreamingWriteTarget = class extends WriteTarget {
    constructor(onFlush) {
      super();
      __privateAdd(this, _sections, []);
      __privateAdd(this, _onFlush, void 0);
      __privateSet(this, _onFlush, onFlush);
    }
    write(data) {
      __privateGet(this, _sections).push({
        data: data.slice(),
        start: this.pos
      });
      this.pos += data.byteLength;
    }
    seek(newPos) {
      this.pos = newPos;
    }
    flush(done) {
      if (__privateGet(this, _sections).length === 0)
        return;
      let chunks = [];
      let sorted = [...__privateGet(this, _sections)].sort((a, b) => a.start - b.start);
      chunks.push({
        start: sorted[0].start,
        size: sorted[0].data.byteLength
      });
      for (let i = 1; i < sorted.length; i++) {
        let lastChunk = chunks[chunks.length - 1];
        let section = sorted[i];
        if (section.start <= lastChunk.start + lastChunk.size) {
          lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
        } else {
          chunks.push({
            start: section.start,
            size: section.data.byteLength
          });
        }
      }
      for (let chunk of chunks) {
        chunk.data = new Uint8Array(chunk.size);
        for (let section of __privateGet(this, _sections)) {
          if (chunk.start <= section.start && section.start < chunk.start + chunk.size) {
            chunk.data.set(section.data, section.start - chunk.start);
          }
        }
        let isLastFlush = done && chunk === chunks[chunks.length - 1];
        __privateGet(this, _onFlush).call(this, chunk.data, chunk.start, isLastFlush);
      }
      __privateGet(this, _sections).length = 0;
    }
  };
  _sections = new WeakMap();
  _onFlush = new WeakMap();

  // src/main.ts
  var TIMESTAMP_OFFSET = 2082848400;
  var MAX_CHUNK_LENGTH = 5e5;
  var FIRST_TIMESTAMP_BEHAVIORS = ["strict", "offset", "permissive"];
  var GLOBAL_TIMESCALE = 1e3;
  var _options, _target, _mdat, _videoTrack, _audioTrack, _finalized, _validateOptions, validateOptions_fn, _writeHeader, writeHeader_fn, _prepareTracks, prepareTracks_fn, _addSampleToTrack, addSampleToTrack_fn, _writeCurrentChunk, writeCurrentChunk_fn, _ensureNotFinalized, ensureNotFinalized_fn, _createMovieBox, createMovieBox_fn, _createTrackBox, createTrackBox_fn;
  var Mp4Muxer = class {
    constructor(options) {
      __privateAdd(this, _validateOptions);
      __privateAdd(this, _writeHeader);
      __privateAdd(this, _prepareTracks);
      __privateAdd(this, _addSampleToTrack);
      __privateAdd(this, _writeCurrentChunk);
      __privateAdd(this, _ensureNotFinalized);
      __privateAdd(this, _createMovieBox);
      __privateAdd(this, _createTrackBox);
      __privateAdd(this, _options, void 0);
      __privateAdd(this, _target, void 0);
      __privateAdd(this, _mdat, void 0);
      __privateAdd(this, _videoTrack, null);
      __privateAdd(this, _audioTrack, null);
      __privateAdd(this, _finalized, false);
      __privateMethod(this, _validateOptions, validateOptions_fn).call(this, options);
      __privateSet(this, _options, __spreadValues({
        firstTimestampBehavior: "strict"
      }, options));
      if (options.target === "buffer") {
        __privateSet(this, _target, new ArrayBufferWriteTarget());
      } else if (options.target instanceof FileSystemWritableFileStream) {
        __privateSet(this, _target, new FileSystemWritableFileStreamWriteTarget(options.target));
      } else if (typeof options.target === "function") {
        __privateSet(this, _target, new StreamingWriteTarget(options.target));
      } else {
        throw new Error(`Invalid target: ${options.target}`);
      }
      __privateMethod(this, _writeHeader, writeHeader_fn).call(this);
      __privateMethod(this, _prepareTracks, prepareTracks_fn).call(this);
    }
    addVideoChunk(sample, meta) {
      __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
      if (!__privateGet(this, _options).video)
        throw new Error("No video track declared.");
      __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), sample, meta);
    }
    addAudioChunk(sample, meta) {
      __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
      if (!__privateGet(this, _options).audio)
        throw new Error("No audio track declared.");
      __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), sample, meta);
    }
    finalize() {
      if (__privateGet(this, _videoTrack))
        __privateMethod(this, _writeCurrentChunk, writeCurrentChunk_fn).call(this, __privateGet(this, _videoTrack));
      if (__privateGet(this, _audioTrack))
        __privateMethod(this, _writeCurrentChunk, writeCurrentChunk_fn).call(this, __privateGet(this, _audioTrack));
      let mdatPos = __privateGet(this, _target).offsets.get(__privateGet(this, _mdat));
      let mdatSize = __privateGet(this, _target).pos - mdatPos;
      __privateGet(this, _mdat).size = mdatSize;
      __privateGet(this, _target).patchBox(__privateGet(this, _mdat));
      let movieBox = __privateMethod(this, _createMovieBox, createMovieBox_fn).call(this);
      __privateGet(this, _target).writeBox(movieBox);
      let buffer = __privateGet(this, _target).finalize();
      return buffer;
    }
  };
  _options = new WeakMap();
  _target = new WeakMap();
  _mdat = new WeakMap();
  _videoTrack = new WeakMap();
  _audioTrack = new WeakMap();
  _finalized = new WeakMap();
  _validateOptions = new WeakSet();
  validateOptions_fn = function(options) {
    if (options.firstTimestampBehavior && !FIRST_TIMESTAMP_BEHAVIORS.includes(options.firstTimestampBehavior)) {
      throw new Error(`Invalid first timestamp behavior: ${options.firstTimestampBehavior}`);
    }
  };
  _writeHeader = new WeakSet();
  writeHeader_fn = function() {
    __privateGet(this, _target).writeBox({
      type: "ftyp" /* FileType */,
      contents: new Uint8Array([
        105,
        115,
        111,
        109,
        // isom
        0,
        0,
        0,
        0,
        // Minor version 0
        105,
        115,
        111,
        109,
        // isom
        97,
        118,
        99,
        49,
        // avc1
        109,
        112,
        52,
        49
        // mp41
      ])
    });
    __privateSet(this, _mdat, {
      type: "mdat" /* MovieData */,
      largeSize: true
    });
    __privateGet(this, _target).writeBox(__privateGet(this, _mdat));
  };
  _prepareTracks = new WeakSet();
  prepareTracks_fn = function() {
    var _a;
    if (__privateGet(this, _options).video) {
      __privateSet(this, _videoTrack, {
        info: {
          type: "video",
          width: __privateGet(this, _options).video.width,
          height: __privateGet(this, _options).video.height
        },
        codecPrivate: null,
        samples: [],
        writtenChunks: [],
        currentChunk: null
      });
    }
    if (__privateGet(this, _options).audio) {
      __privateSet(this, _audioTrack, {
        info: {
          type: "audio",
          numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
          sampleRate: __privateGet(this, _options).audio.sampleRate,
          bitDepth: (_a = __privateGet(this, _options).audio.bitDepth) != null ? _a : 16
        },
        codecPrivate: null,
        samples: [],
        writtenChunks: [],
        currentChunk: null
      });
    }
  };
  _addSampleToTrack = new WeakSet();
  addSampleToTrack_fn = function(track, sample, meta) {
    var _a;
    if (!track.currentChunk || sample.timestamp - track.currentChunk.startTimestamp >= MAX_CHUNK_LENGTH) {
      if (track.currentChunk)
        __privateMethod(this, _writeCurrentChunk, writeCurrentChunk_fn).call(this, track);
      track.currentChunk = { startTimestamp: sample.timestamp, sampleData: [], sampleCount: 0 };
    }
    let data = new Uint8Array(sample.byteLength);
    sample.copyTo(data);
    track.currentChunk.sampleData.push(data);
    track.currentChunk.sampleCount++;
    if ((_a = meta.decoderConfig) == null ? void 0 : _a.description) {
      track.codecPrivate = new Uint8Array(meta.decoderConfig.description);
    }
    track.samples.push({
      timestamp: sample.timestamp / 1e6,
      duration: sample.duration / 1e6,
      size: data.byteLength,
      type: sample.type
    });
  };
  _writeCurrentChunk = new WeakSet();
  writeCurrentChunk_fn = function(track) {
    if (!track.currentChunk)
      return;
    track.currentChunk.offset = __privateGet(this, _target).pos;
    for (let bytes of track.currentChunk.sampleData)
      __privateGet(this, _target).write(bytes);
    track.currentChunk.sampleData = null;
    track.writtenChunks.push(track.currentChunk);
  };
  _ensureNotFinalized = new WeakSet();
  ensureNotFinalized_fn = function() {
    if (__privateGet(this, _finalized)) {
      throw new Error("Cannot add new video or audio chunks after the file has been finalized.");
    }
  };
  _createMovieBox = new WeakSet();
  createMovieBox_fn = function() {
    var _a, _b;
    let lastVideoSample = last((_a = __privateGet(this, _videoTrack)) == null ? void 0 : _a.samples);
    let lastAudioSample = last((_b = __privateGet(this, _audioTrack)) == null ? void 0 : _b.samples);
    let duration = timestampToUnits(Math.max(
      lastVideoSample ? lastVideoSample.timestamp + lastVideoSample.duration : 0,
      lastAudioSample ? lastAudioSample.timestamp + lastAudioSample.duration : 0
    ), GLOBAL_TIMESCALE);
    let videoTrackBox = __privateGet(this, _videoTrack) && __privateMethod(this, _createTrackBox, createTrackBox_fn).call(this, __privateGet(this, _videoTrack));
    let audioTrackBox = __privateGet(this, _audioTrack) && __privateMethod(this, _createTrackBox, createTrackBox_fn).call(this, __privateGet(this, _audioTrack));
    let movieHeaderBox = {
      type: "mvhd" /* MovieHeader */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        0,
        // Flags
        u32(Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET),
        // Creation time
        u32(Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET),
        // Modification time
        u32(GLOBAL_TIMESCALE),
        u32(duration),
        fixed32(1),
        // Preferred rate
        fixed16(1),
        // Preferred volume
        Array(10).fill(0),
        // Reserved
        [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824].flatMap(u32),
        Array(24).fill(0),
        // Pre-defined
        u32(+!!__privateGet(this, _options).audio + +!!__privateGet(this, _options).video + 1)
        // Next track ID
      ].flat())
    };
    let movieBox = {
      type: "moov" /* Movie */,
      children: [movieHeaderBox, videoTrackBox, audioTrackBox]
    };
    return movieBox;
  };
  _createTrackBox = new WeakSet();
  createTrackBox_fn = function(track) {
    var _a, _b;
    let timescale = track.info.type === "video" ? 960 : track.info.sampleRate;
    let current = [];
    let entries = [];
    for (let sample of track.samples) {
      current.push(sample);
      if (current.length === 1)
        continue;
      let referenceDelta = timestampToUnits(current[1].timestamp - current[0].timestamp, timescale);
      let newDelta = timestampToUnits(sample.timestamp - current[current.length - 2].timestamp, timescale);
      if (newDelta !== referenceDelta) {
        entries.push({ sampleCount: current.length - 1, sampleDelta: referenceDelta });
        current = current.slice(-2);
      }
    }
    entries.push({
      sampleCount: current.length,
      sampleDelta: timestampToUnits(((_b = (_a = current[1]) == null ? void 0 : _a.timestamp) != null ? _b : current[0].timestamp) - current[0].timestamp, timescale)
    });
    let timeToSampleBox = {
      type: "stts" /* TimeToSample */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        0,
        // Flags
        u32(entries.length),
        ...entries.flatMap((x) => [u32(x.sampleCount), u32(x.sampleDelta)])
      ].flat())
    };
    let syncSampleBox = null;
    if (!track.samples.every((x) => x.type === "key")) {
      let keySamples = [...track.samples.entries()].filter(([, sample]) => sample.type === "key");
      syncSampleBox = {
        type: "stss" /* SyncSample */,
        contents: new Uint8Array([
          0,
          // Version
          0,
          0,
          0,
          // Flags
          u32(keySamples.length),
          // Entry count
          keySamples.flatMap(([index]) => u32(index + 1))
          // Sample numbers
        ].flat())
      };
    }
    let compactlyCodedChunks = [];
    for (let i = 0; i < track.writtenChunks.length; i++) {
      let next = track.writtenChunks[i];
      if (compactlyCodedChunks.length === 0 || last(compactlyCodedChunks).samplesPerChunk !== next.sampleCount) {
        compactlyCodedChunks.push({ firstChunk: i + 1, samplesPerChunk: next.sampleCount });
      }
    }
    let sampleToChunkBox = {
      type: "stsc" /* SampleToChunk */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        0,
        // Flags
        u32(compactlyCodedChunks.length),
        // Entry count
        ...compactlyCodedChunks.flatMap((x) => [
          u32(x.firstChunk),
          u32(x.samplesPerChunk),
          u32(1)
          // Sample description index
        ])
      ].flat())
    };
    let sampleSizeBox = {
      type: "stsz" /* SampleSize */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        0,
        // Flags
        u32(0),
        // Sample size
        u32(track.samples.length),
        // Sample count
        track.samples.flatMap((x) => u32(x.size))
      ].flat())
    };
    let chunkOffsetBox = {
      type: "stco" /* ChunkOffset */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        0,
        // Flags,
        u32(track.writtenChunks.length),
        // Entry count
        track.writtenChunks.flatMap((x) => u32(x.offset))
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
    let mediaHeaderBox = {
      type: "mdhd" /* MediaHeader */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        0,
        // Flags
        u32(Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET),
        // Creation time
        u32(Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET),
        // Modification time
        u32(timescale),
        u32(localDuration),
        85,
        196,
        // Language ("und", undetermined)
        0,
        0
        // Pre-defined
      ].flat())
    };
    let handlerReferenceBox = {
      type: "hdlr" /* HandlerReference */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        0,
        // Flags
        u32(0),
        // Pre-defined
        ascii(track.info.type === "video" ? "vide" : "soun"),
        // Component subtype
        Array(12).fill(0),
        // Reserved
        ascii(track.info.type === "video" ? "Video track" : "Audio track", true)
      ].flat())
    };
    let mediaInformationHeaderBox = track.info.type === "video" ? {
      type: "vmhd" /* VideoMediaInformationHeader */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        1,
        // Flags
        0,
        0,
        // Graphics mode
        0,
        0,
        // Opcolor R
        0,
        0,
        // Opcolor G
        0,
        0
        // Opcolor B
      ])
    } : {
      type: "smhd" /* SoundMediaInformationHeader */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        0,
        // Flags
        0,
        0,
        // Balance
        0,
        0
        // Reserved
      ])
    };
    let dataInformationBox = {
      type: "dinf" /* DataInformation */,
      children: [{
        type: "dref" /* DataReference */,
        contents: new Uint8Array([
          0,
          // Version
          0,
          0,
          0,
          // Flags
          u32(1)
          // Entry count
        ].flat()),
        children: [{
          type: "url ",
          contents: new Uint8Array([
            0,
            // Version
            0,
            0,
            1
            // Flags (with self-reference enabled)
          ].flat())
        }]
      }]
    };
    let sampleDescriptionBox = {
      type: "stsd" /* SampleDescription */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        0,
        // Flags
        u32(1)
        // Entry count
      ].flat()),
      children: [
        track.info.type === "video" ? {
          type: "avc1",
          contents: new Uint8Array([
            Array(6).fill(0),
            // Reserved
            0,
            1,
            // Data reference index
            0,
            0,
            // Pre-defined
            0,
            0,
            // Reserved
            Array(12).fill(0),
            // Pre-defined
            u16(__privateGet(this, _options).video.width),
            // Width
            u16(__privateGet(this, _options).video.height),
            // Height
            u32(4718592),
            // Horizontal resolution
            u32(4718592),
            // Vertical resolution
            u32(0),
            // Reserved
            u16(1),
            // Frame count
            Array(32).fill(0),
            // Compressor name
            u16(24),
            // Depth
            i16(65535)
            // Pre-defined
          ].flat()),
          children: [{
            type: "avcC",
            contents: track.codecPrivate
          }]
        } : {
          type: "mp4a",
          contents: new Uint8Array([
            Array(6).fill(0),
            // Reserved
            u16(1),
            // Data reference index
            u16(0),
            // Version
            u16(0),
            // Revision level
            u32(0),
            // Vendor
            u16(track.info.numberOfChannels),
            u16(track.info.bitDepth),
            u16(0),
            // Compression ID
            u16(0),
            // Packet size
            fixed32(track.info.sampleRate)
          ].flat()),
          children: [{
            type: "esds",
            contents: new Uint8Array([
              // https://stackoverflow.com/a/54803118
              0,
              // Version
              0,
              0,
              0,
              // Flags
              u32(58753152),
              // TAG(3) = Object Descriptor ([2])
              34,
              // length of this OD (which includes the next 2 tags)
              u16(1),
              // ES_ID = 1
              0,
              // flags etc = 0
              u32(75530368),
              // TAG(4) = ES Descriptor ([2]) embedded in above OD
              20,
              // length of this ESD
              64,
              // MPEG-4 Audio
              21,
              // stream type(6bits)=5 audio, flags(2bits)=1
              0,
              0,
              0,
              // 24bit buffer size
              u32(130071),
              // max bitrate
              u32(130071),
              // avg bitrate
              u32(92307584),
              // TAG(5) = ASC ([2],[3]) embedded in above OD
              2,
              // length
              track.codecPrivate[0],
              track.codecPrivate[1],
              u32(109084800),
              // TAG(6)
              1,
              // length
              2
              // data
            ].flat())
          }]
        }
      ]
    };
    let sampleTableBox = {
      type: "stbl" /* SampleTable */,
      children: [
        sampleDescriptionBox,
        timeToSampleBox,
        syncSampleBox,
        sampleToChunkBox,
        sampleSizeBox,
        chunkOffsetBox
      ]
    };
    let mediaInformationBox = {
      type: "minf" /* MediaInformation */,
      children: [mediaInformationHeaderBox, dataInformationBox, sampleTableBox]
    };
    let mediaBox = {
      type: "mdia" /* Media */,
      children: [mediaHeaderBox, handlerReferenceBox, mediaInformationBox]
    };
    let trackHeaderBox = {
      type: "tkhd" /* TrackHeader */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        3,
        // Flags (enabled + in movie)
        u32(Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET),
        // Creation time
        u32(Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET),
        // Modification time
        u32(track.info.type === "video" ? 1 : 1 + +!!__privateGet(this, _options).video),
        // Track ID
        u32(0),
        // Reserved
        u32(globalDuration),
        // Duration
        Array(8).fill(0),
        // Reserved
        0,
        0,
        // Layer
        0,
        0,
        // Alternate group
        fixed16(track.info.type === "audio" ? 1 : 0),
        // Volume
        0,
        0,
        // Reserved
        [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824].flatMap(u32),
        fixed32(track.info.type === "video" ? track.info.width : 0),
        // Track width
        fixed32(track.info.type === "video" ? track.info.height : 0)
        // Track height
      ].flat())
    };
    let trackBox = {
      type: "trak" /* Track */,
      children: [trackHeaderBox, mediaBox]
    };
    return trackBox;
  };
  var main_default = Mp4Muxer;
  return __toCommonJS(main_exports);
})();
Mp4Muxer = Mp4Muxer.default;
if (typeof module === "object" && typeof module.exports === "object") module.exports = Mp4Muxer;
