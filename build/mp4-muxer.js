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

  // src/main.ts
  var main_exports = {};
  __export(main_exports, {
    ArrayBufferWriteTarget: () => ArrayBufferWriteTarget,
    WriteTarget: () => WriteTarget,
    default: () => main_default
  });
  var TIMESTAMP_OFFSET = 2082848400;
  var _target, _mdat, _videoDecoderConfig, _chunks;
  var Mp4Muxer = class {
    constructor() {
      __privateAdd(this, _target, void 0);
      __privateAdd(this, _mdat, void 0);
      __privateAdd(this, _videoDecoderConfig, void 0);
      __privateAdd(this, _chunks, []);
      __privateSet(this, _target, new ArrayBufferWriteTarget());
    }
    addVideoChunk(chunk, meta) {
      var _a;
      let data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      __privateGet(this, _chunks).push(data);
      if ((_a = meta == null ? void 0 : meta.decoderConfig) == null ? void 0 : _a.description) {
        __privateSet(this, _videoDecoderConfig, new Uint8Array(meta.decoderConfig.description));
        console.log(__privateGet(this, _videoDecoderConfig));
      }
    }
    finalize() {
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
          50
          // mp42
        ])
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
          u32(1),
          // Entry count
          u32(100),
          u32(100)
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
      let sampleToChunkBox = {
        type: "stsc" /* SampleToChunk */,
        contents: new Uint8Array([
          0,
          // Version
          0,
          0,
          0,
          // Flags
          u32(1),
          // Entry count
          u32(1),
          // First chunk
          u32(100),
          // Samples per chunk
          u32(1)
          // Sample description index
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
          u32(100),
          // Sample count
          __privateGet(this, _chunks).flatMap((x) => u32(x.byteLength))
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
          u32(1),
          // Entry count
          u32(0)
          // Chunk offset PLACEHOLDER
        ].flat())
      };
      __privateGet(this, _target).writeBox({
        type: "moov" /* Movie */,
        children: [{
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
            u32(1e3),
            // Time scale
            u32(1e4),
            // Duration
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
        }, {
          type: "trak" /* Track */,
          children: [{
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
              u32(1e4),
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
              fixed32(512),
              // Track width
              fixed32(512)
              // Track height
            ].flat())
          }, {
            type: "mdia" /* Media */,
            children: [{
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
                u32(1e3),
                // Time scale
                u32(1e4),
                // Duration
                85,
                196,
                // Language ("und", undetermined)
                0,
                0
                // Pre-defined
              ].flat())
            }, {
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
            }, {
              type: "minf" /* MediaInformation */,
              children: [{
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
              }, {
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
              }, {
                type: "stbl" /* SampleTable */,
                children: [{
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
                      u16(512),
                      // Width
                      u16(512),
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
                }, timeToSampleBox, syncSampleBox, sampleToChunkBox, sampleSizeBox, chunkOffsetBox]
              }]
            }]
          }]
        }]
      });
      __privateSet(this, _mdat, {
        type: "mdat" /* MovieData */
      });
      __privateGet(this, _target).writeBox(__privateGet(this, _mdat));
      chunkOffsetBox.contents = new Uint8Array([
        0,
        // Version
        0,
        0,
        0,
        // Flags,
        u32(1),
        // Entry count
        u32(__privateGet(this, _target).pos)
        // Chunk offset
      ].flat());
      let endPos = __privateGet(this, _target).pos;
      __privateGet(this, _target).pos = __privateGet(this, _target).offsets.get(chunkOffsetBox);
      __privateGet(this, _target).writeBox(chunkOffsetBox);
      __privateGet(this, _target).pos = endPos;
      for (let chunk of __privateGet(this, _chunks))
        __privateGet(this, _target).write(chunk);
      let mdatPos = __privateGet(this, _target).offsets.get(__privateGet(this, _mdat));
      let mdatSize = __privateGet(this, _target).pos - mdatPos;
      endPos = __privateGet(this, _target).pos;
      __privateGet(this, _target).pos = mdatPos;
      __privateGet(this, _target).writeU32(mdatSize);
      __privateGet(this, _target).pos = endPos;
      let buffer = __privateGet(this, _target).finalize();
      return buffer;
    }
  };
  _target = new WeakMap();
  _mdat = new WeakMap();
  _videoDecoderConfig = new WeakMap();
  _chunks = new WeakMap();
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
    let result = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
    if (nullTerminated)
      result.push(0);
    return result;
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
      this.offsets.set(box, this.pos);
      if (box.contents && !box.children) {
        this.writeU32(box.contents.byteLength + 8);
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
        let size = endPos - startPos;
        this.pos = startPos;
        this.writeU32(size);
        this.pos = endPos;
      }
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
