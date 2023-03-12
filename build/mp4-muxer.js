"use strict";
var Mp4Muxer = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __pow = Math.pow;
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
    ArrayBufferWriteTarget: () => ArrayBufferWriteTarget,
    WriteTarget: () => WriteTarget,
    default: () => main_default
  });
  var TIMESTAMP_OFFSET = 2082848400;
  var MAX_CHUNK_LENGTH = 5e5;
  var _options, _target, _mdat, _videoDecoderConfig, _videoSampleRecords, _chunks, _currentVideoChunk, _writeChunk, writeChunk_fn, _writeMovieBox, writeMovieBox_fn;
  var Mp4Muxer = class {
    constructor(options) {
      __privateAdd(this, _writeChunk);
      __privateAdd(this, _writeMovieBox);
      __privateAdd(this, _options, void 0);
      __privateAdd(this, _target, void 0);
      __privateAdd(this, _mdat, void 0);
      __privateAdd(this, _videoDecoderConfig, void 0);
      __privateAdd(this, _videoSampleRecords, []);
      __privateAdd(this, _chunks, []);
      __privateAdd(this, _currentVideoChunk, void 0);
      __privateSet(this, _options, options);
      __privateSet(this, _target, new ArrayBufferWriteTarget());
      __privateGet(this, _target).writeBox({
        type: "ftyp" /* FileType */,
        contents: new Uint8Array([
          109,
          112,
          52,
          50,
          // mp42
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
          50,
          // mp42
          109,
          112,
          52,
          49
          // mp41
        ])
      });
      __privateSet(this, _mdat, {
        type: "mdat" /* MovieData */
      });
      __privateGet(this, _target).writeBox(__privateGet(this, _mdat));
    }
    addVideoChunk(sample, meta) {
      var _a;
      if (!__privateGet(this, _currentVideoChunk) || sample.timestamp - __privateGet(this, _currentVideoChunk).startTimestamp >= MAX_CHUNK_LENGTH) {
        if (__privateGet(this, _currentVideoChunk))
          __privateMethod(this, _writeChunk, writeChunk_fn).call(this, __privateGet(this, _currentVideoChunk));
        __privateSet(this, _currentVideoChunk, { startTimestamp: sample.timestamp, sampleData: [], sampleCount: 0 });
      }
      let data = new Uint8Array(sample.byteLength);
      sample.copyTo(data);
      __privateGet(this, _currentVideoChunk).sampleData.push(data);
      __privateGet(this, _currentVideoChunk).sampleCount++;
      if ((_a = meta.decoderConfig) == null ? void 0 : _a.description) {
        __privateSet(this, _videoDecoderConfig, new Uint8Array(meta.decoderConfig.description));
      }
      __privateGet(this, _videoSampleRecords).push({
        timestamp: sample.timestamp / 1e6,
        size: data.byteLength
      });
    }
    finalize() {
      __privateMethod(this, _writeChunk, writeChunk_fn).call(this, __privateGet(this, _currentVideoChunk));
      let mdatPos = __privateGet(this, _target).offsets.get(__privateGet(this, _mdat));
      let mdatSize = __privateGet(this, _target).pos - mdatPos;
      __privateGet(this, _mdat).size = mdatSize;
      __privateGet(this, _target).patchBox(__privateGet(this, _mdat));
      __privateMethod(this, _writeMovieBox, writeMovieBox_fn).call(this);
      let buffer = __privateGet(this, _target).finalize();
      return buffer;
    }
  };
  _options = new WeakMap();
  _target = new WeakMap();
  _mdat = new WeakMap();
  _videoDecoderConfig = new WeakMap();
  _videoSampleRecords = new WeakMap();
  _chunks = new WeakMap();
  _currentVideoChunk = new WeakMap();
  _writeChunk = new WeakSet();
  writeChunk_fn = function(chunk) {
    chunk.offset = __privateGet(this, _target).pos;
    for (let bytes of chunk.sampleData)
      __privateGet(this, _target).write(bytes);
    chunk.sampleData = null;
    __privateGet(this, _chunks).push(chunk);
  };
  _writeMovieBox = new WeakSet();
  writeMovieBox_fn = function() {
    var _a, _b;
    const timescale = 1e3;
    let current = [];
    let entries = [];
    for (let sample of __privateGet(this, _videoSampleRecords)) {
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
      sampleDelta: Math.floor(timestampToUnits((_b = (_a = current[1]) == null ? void 0 : _a.timestamp) != null ? _b : current[0].timestamp, timescale))
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
    let syncSampleBox = {
      type: "stss" /* SyncSample */,
      contents: new Uint8Array([
        0,
        // Version
        0,
        0,
        0,
        // Flags
        u32(1),
        // Entry count
        u32(1)
        // Sample number
      ].flat())
    };
    let compactlyCodedChunks = __privateGet(this, _chunks).reduce((acc, next, index) => {
      if (acc.length === 0 || acc[acc.length - 1].samplesPerChunk !== next.sampleCount)
        return [
          ...acc,
          { firstChunk: index + 1, samplesPerChunk: next.sampleCount }
        ];
      return acc;
    }, []);
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
        u32(__privateGet(this, _videoSampleRecords).length),
        // Sample count
        __privateGet(this, _videoSampleRecords).flatMap((x) => u32(x.size))
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
        u32(__privateGet(this, _chunks).length),
        // Entry count
        __privateGet(this, _chunks).flatMap((x) => u32(x.offset))
      ].flat())
    };
    let duration = timestampToUnits(
      __privateGet(this, _videoSampleRecords)[__privateGet(this, _videoSampleRecords).length - 1].timestamp,
      timescale
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
        u32(duration),
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
        ascii("vide"),
        // Component subtype
        Array(12).fill(0),
        // Reserved
        ascii("Video track", true)
      ].flat())
    };
    let mediaInformationHeaderBox = {
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
            0,
            0,
            // Flags
            ascii("", true)
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
      children: [{
        type: "avc1",
        contents: new Uint8Array([
          Array(6).fill(0),
          // Reserved
          0,
          0,
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
          contents: __privateGet(this, _videoDecoderConfig)
        }]
      }]
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
        u32(1),
        // Track ID
        u32(0),
        // Reserved
        u32(duration),
        // Duration
        Array(8).fill(0),
        // Reserved
        0,
        0,
        // Layer
        0,
        0,
        // Alternate group
        fixed16(0),
        // Volume
        0,
        0,
        // Reserved
        [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824].flatMap(u32),
        fixed32(__privateGet(this, _options).video.width),
        // Track width
        fixed32(__privateGet(this, _options).video.height)
        // Track height
      ].flat())
    };
    let trackBox = {
      type: "trak" /* Track */,
      children: [trackHeaderBox, mediaBox]
    };
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
        u32(timescale),
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
        u32(2)
        // Next track ID
      ].flat())
    };
    let movieBox = {
      type: "moov" /* Movie */,
      children: [movieHeaderBox, trackBox]
    };
    __privateGet(this, _target).writeBox(movieBox);
  };
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
    return Math.floor(timestamp * timescale);
  };
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
        this.writeU32((_a = box.size) != null ? _a : box.contents.byteLength + 8);
        this.writeAscii(box.type);
        this.write(box.contents);
      } else {
        let startPos = this.pos;
        this.pos += 4;
        this.writeAscii(box.type);
        if (box.contents)
          this.write(box.contents);
        if (box.children)
          for (let child of box.children)
            this.writeBox(child);
        let endPos = this.pos;
        let size = (_b = box.size) != null ? _b : endPos - startPos;
        this.pos = startPos;
        this.writeU32(size);
        this.pos = endPos;
      }
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
  var main_default = Mp4Muxer;
  return __toCommonJS(main_exports);
})();
Mp4Muxer = Mp4Muxer.default;
if (typeof module === "object" && typeof module.exports === "object") module.exports = Mp4Muxer;
