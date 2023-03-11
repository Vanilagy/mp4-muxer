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
  var _target, _mdat;
  var Mp4Muxer = class {
    constructor() {
      __privateAdd(this, _target, void 0);
      __privateAdd(this, _mdat, void 0);
      __privateSet(this, _target, new ArrayBufferWriteTarget());
      __privateGet(this, _target).writeBox({
        type: "ftyp" /* FileType */,
        contents: new Uint8Array([
          105,
          115,
          111,
          109,
          // mp42
          0,
          0,
          0,
          0,
          // Minor version 0
          105,
          115,
          111,
          50,
          // iso2
          97,
          118,
          99,
          49,
          // avc1
          109,
          112,
          52,
          49
          // mp42
        ])
      });
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
            u32(Math.floor(Date.now() / 1e3) + __pow(2, 31)),
            // Creation time (seconds since January 1, 1904)
            u32(Math.floor(Date.now() / 1e3) + __pow(2, 31)),
            // Modification time
            u32(1e3),
            // Time scale
            u32(1e3),
            // Duration
            fixed32(1),
            // Preferred rate
            fixed16(1),
            // Preferred volume
            Array(10).fill(0),
            // Reserved
            [
              1,
              0,
              0,
              // Matrix structure
              0,
              1,
              0,
              0,
              0,
              1
            ].flatMap(fixed32),
            Array(24).fill(0),
            // Pre-defined
            u32(1)
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
              u32(Math.floor(Date.now() / 1e3) + __pow(2, 31)),
              // Creation time (seconds since January 1, 1904)
              u32(Math.floor(Date.now() / 1e3) + __pow(2, 31)),
              // Modification time
              u32(1),
              // Track ID
              u32(0),
              // Reserved
              u32(1e3),
              // Duration
              Array(8).fill(0),
              // Reserved
              0,
              0,
              // Layer
              0,
              0,
              // Alternate group
              fixed16(1),
              0,
              0,
              // Reserved
              [
                1,
                0,
                0,
                // Matrix structure
                0,
                1,
                0,
                0,
                0,
                1
              ].flatMap(fixed32),
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
                u32(Math.floor(Date.now() / 1e3) + __pow(2, 31)),
                // Creation time (seconds since January 1, 1904)
                u32(Math.floor(Date.now() / 1e3) + __pow(2, 31)),
                // Modification time
                u32(1e3),
                // Time scale
                u32(1e3),
                // Duration
                0,
                0,
                // Language
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
                ascii("Video track"),
                0
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
                    ].flat())
                  }]
                }]
              }]
            }]
          }]
        }]
      });
      __privateSet(this, _mdat, {
        type: "mdat" /* MovieData */
      });
      __privateGet(this, _target).writeBox(__privateGet(this, _mdat));
    }
    addVideoChunk(chunk) {
      let data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      __privateGet(this, _target).write(data);
    }
    finalize() {
      let mdatPos = __privateGet(this, _target).offsets.get(__privateGet(this, _mdat));
      let mdatSize = __privateGet(this, _target).pos - mdatPos;
      let endPos = __privateGet(this, _target).pos;
      __privateGet(this, _target).pos = mdatPos;
      __privateGet(this, _target).writeU32(mdatSize);
      __privateGet(this, _target).pos = endPos;
      let buffer = __privateGet(this, _target).finalize();
      return buffer;
    }
  };
  _target = new WeakMap();
  _mdat = new WeakMap();
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
  var ascii = (text) => {
    return Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
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
