(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.AV = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var key, ref, val;

ref = require('./src/aurora');
for (key in ref) {
  val = ref[key];
  exports[key] = val;
}

require('./src/devices/webaudio');

require('./src/devices/mozilla');


},{"./src/aurora":3,"./src/devices/mozilla":22,"./src/devices/webaudio":24}],2:[function(require,module,exports){
var Asset, BufferSource, Decoder, Demuxer, EventEmitter, FileSource, HTTPSource,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

EventEmitter = require('./core/events');

HTTPSource = require('./sources/node/http');

FileSource = require('./sources/node/file');

BufferSource = require('./sources/buffer');

Demuxer = require('./demuxer');

Decoder = require('./decoder');

Asset = (function(superClass) {
  extend(Asset, superClass);

  function Asset(source) {
    this.source = source;
    this._decode = bind(this._decode, this);
    this.findDecoder = bind(this.findDecoder, this);
    this.probe = bind(this.probe, this);
    this.buffered = 0;
    this.duration = null;
    this.format = null;
    this.metadata = null;
    this.active = false;
    this.demuxer = null;
    this.decoder = null;
    this.source.once('data', this.probe);
    this.source.on('error', (function(_this) {
      return function(err) {
        _this.emit('error', err);
        return _this.stop();
      };
    })(this));
    this.source.on('progress', (function(_this) {
      return function(buffered) {
        _this.buffered = buffered;
        return _this.emit('buffer', _this.buffered);
      };
    })(this));
  }

  Asset.fromURL = function(url) {
    return new Asset(new HTTPSource(url));
  };

  Asset.fromFile = function(file) {
    return new Asset(new FileSource(file));
  };

  Asset.fromBuffer = function(buffer) {
    return new Asset(new BufferSource(buffer));
  };

  Asset.prototype.start = function(decode) {
    if (this.active) {
      return;
    }
    if (decode != null) {
      this.shouldDecode = decode;
    }
    if (this.shouldDecode == null) {
      this.shouldDecode = true;
    }
    this.active = true;
    this.source.start();
    if (this.decoder && this.shouldDecode) {
      return this._decode();
    }
  };

  Asset.prototype.stop = function() {
    if (!this.active) {
      return;
    }
    this.active = false;
    return this.source.pause();
  };

  Asset.prototype.get = function(event, callback) {
    if (event !== 'format' && event !== 'duration' && event !== 'metadata') {
      return;
    }
    if (this[event] != null) {
      return callback(this[event]);
    } else {
      this.once(event, (function(_this) {
        return function(value) {
          _this.stop();
          return callback(value);
        };
      })(this));
      return this.start();
    }
  };

  Asset.prototype.decodePacket = function() {
    return this.decoder.decode();
  };

  Asset.prototype.decodeToBuffer = function(callback) {
    var chunks, dataHandler, length;
    length = 0;
    chunks = [];
    this.on('data', dataHandler = function(chunk) {
      length += chunk.length;
      return chunks.push(chunk);
    });
    this.once('end', function() {
      var buf, chunk, j, len, offset;
      buf = new Float32Array(length);
      offset = 0;
      for (j = 0, len = chunks.length; j < len; j++) {
        chunk = chunks[j];
        buf.set(chunk, offset);
        offset += chunk.length;
      }
      this.off('data', dataHandler);
      return callback(buf);
    });
    return this.start();
  };

  Asset.prototype.probe = function(chunk) {
    var demuxer;
    if (!this.active) {
      return;
    }
    demuxer = Demuxer.find(chunk);
    if (!demuxer) {
      return this.emit('error', 'A demuxer for this container was not found.');
    }
    this.demuxer = new demuxer(this.source, chunk);
    this.demuxer.on('format', this.findDecoder);
    this.demuxer.on('duration', (function(_this) {
      return function(duration) {
        _this.duration = duration;
        return _this.emit('duration', _this.duration);
      };
    })(this));
    this.demuxer.on('metadata', (function(_this) {
      return function(metadata) {
        _this.metadata = metadata;
        return _this.emit('metadata', _this.metadata);
      };
    })(this));
    return this.demuxer.on('error', (function(_this) {
      return function(err) {
        _this.emit('error', err);
        return _this.stop();
      };
    })(this));
  };

  Asset.prototype.findDecoder = function(format) {
    var decoder, div;
    this.format = format;
    if (!this.active) {
      return;
    }
    this.emit('format', this.format);
    decoder = Decoder.find(this.format.formatID);
    if (!decoder) {
      return this.emit('error', "A decoder for " + this.format.formatID + " was not found.");
    }
    this.decoder = new decoder(this.demuxer, this.format);
    if (this.format.floatingPoint) {
      this.decoder.on('data', (function(_this) {
        return function(buffer) {
          return _this.emit('data', buffer);
        };
      })(this));
    } else {
      div = Math.pow(2, this.format.bitsPerChannel - 1);
      this.decoder.on('data', (function(_this) {
        return function(buffer) {
          var buf, i, j, len, sample;
          buf = new Float32Array(buffer.length);
          for (i = j = 0, len = buffer.length; j < len; i = ++j) {
            sample = buffer[i];
            buf[i] = sample / div;
          }
          return _this.emit('data', buf);
        };
      })(this));
    }
    this.decoder.on('error', (function(_this) {
      return function(err) {
        _this.emit('error', err);
        return _this.stop();
      };
    })(this));
    this.decoder.on('end', (function(_this) {
      return function() {
        return _this.emit('end');
      };
    })(this));
    this.emit('decodeStart');
    if (this.shouldDecode) {
      return this._decode();
    }
  };

  Asset.prototype._decode = function() {
    while (this.decoder.decode() && this.active) {
      continue;
    }
    if (this.active) {
      return this.decoder.once('data', this._decode);
    }
  };

  return Asset;

})(EventEmitter);

module.exports = Asset;


},{"./core/events":9,"./decoder":12,"./demuxer":15,"./sources/buffer":32,"./sources/node/file":30,"./sources/node/http":31}],3:[function(require,module,exports){
var key, ref, val;

ref = require('./aurora_base');
for (key in ref) {
  val = ref[key];
  exports[key] = val;
}

require('./demuxers/caf');

require('./demuxers/m4a');

require('./demuxers/aiff');

require('./demuxers/wave');

require('./demuxers/au');

require('./decoders/lpcm');

require('./decoders/xlaw');


},{"./aurora_base":4,"./decoders/lpcm":13,"./decoders/xlaw":14,"./demuxers/aiff":16,"./demuxers/au":17,"./demuxers/caf":18,"./demuxers/m4a":19,"./demuxers/wave":20}],4:[function(require,module,exports){
exports.Base = require('./core/base');

exports.Buffer = require('./core/buffer');

exports.BufferList = require('./core/bufferlist');

exports.Stream = require('./core/stream');

exports.Bitstream = require('./core/bitstream');

exports.EventEmitter = require('./core/events');

exports.UnderflowError = require('./core/underflow');

exports.HTTPSource = require('./sources/node/http');

exports.FileSource = require('./sources/node/file');

exports.BufferSource = require('./sources/buffer');

exports.Demuxer = require('./demuxer');

exports.Decoder = require('./decoder');

exports.AudioDevice = require('./device');

exports.Asset = require('./asset');

exports.Player = require('./player');

exports.Filter = require('./filter');

exports.VolumeFilter = require('./filters/volume');

exports.BalanceFilter = require('./filters/balance');


},{"./asset":2,"./core/base":5,"./core/bitstream":6,"./core/buffer":7,"./core/bufferlist":8,"./core/events":9,"./core/stream":10,"./core/underflow":11,"./decoder":12,"./demuxer":15,"./device":21,"./filter":25,"./filters/balance":26,"./filters/volume":27,"./player":28,"./sources/buffer":32,"./sources/node/file":30,"./sources/node/http":31}],5:[function(require,module,exports){
var Base,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

Base = (function() {
  var fnTest;

  function Base() {}

  fnTest = /\b_super\b/;

  Base.extend = function(prop) {
    var Class, _super, fn, key, keys, ref;
    Class = (function(superClass) {
      extend(Class, superClass);

      function Class() {
        return Class.__super__.constructor.apply(this, arguments);
      }

      return Class;

    })(this);
    if (typeof prop === 'function') {
      keys = Object.keys(Class.prototype);
      prop.call(Class, Class);
      prop = {};
      ref = Class.prototype;
      for (key in ref) {
        fn = ref[key];
        if (indexOf.call(keys, key) < 0) {
          prop[key] = fn;
        }
      }
    }
    _super = Class.__super__;
    for (key in prop) {
      fn = prop[key];
      if (typeof fn === 'function' && fnTest.test(fn)) {
        (function(key, fn) {
          return Class.prototype[key] = function() {
            var ret, tmp;
            tmp = this._super;
            this._super = _super[key];
            ret = fn.apply(this, arguments);
            this._super = tmp;
            return ret;
          };
        })(key, fn);
      } else {
        Class.prototype[key] = fn;
      }
    }
    return Class;
  };

  return Base;

})();

module.exports = Base;


},{}],6:[function(require,module,exports){
var Bitstream;

Bitstream = (function() {
  function Bitstream(stream) {
    this.stream = stream;
    this.bitPosition = 0;
  }

  Bitstream.prototype.copy = function() {
    var result;
    result = new Bitstream(this.stream.copy());
    result.bitPosition = this.bitPosition;
    return result;
  };

  Bitstream.prototype.offset = function() {
    return 8 * this.stream.offset + this.bitPosition;
  };

  Bitstream.prototype.available = function(bits) {
    return this.stream.available((bits + 8 - this.bitPosition) / 8);
  };

  Bitstream.prototype.advance = function(bits) {
    var pos;
    pos = this.bitPosition + bits;
    this.stream.advance(pos >> 3);
    return this.bitPosition = pos & 7;
  };

  Bitstream.prototype.rewind = function(bits) {
    var pos;
    pos = this.bitPosition - bits;
    this.stream.rewind(Math.abs(pos >> 3));
    return this.bitPosition = pos & 7;
  };

  Bitstream.prototype.seek = function(offset) {
    var curOffset;
    curOffset = this.offset();
    if (offset > curOffset) {
      return this.advance(offset - curOffset);
    } else if (offset < curOffset) {
      return this.rewind(curOffset - offset);
    }
  };

  Bitstream.prototype.align = function() {
    if (this.bitPosition !== 0) {
      this.bitPosition = 0;
      return this.stream.advance(1);
    }
  };

  Bitstream.prototype.read = function(bits, signed) {
    var a, a0, a1, a2, a3, a4, mBits;
    if (bits === 0) {
      return 0;
    }
    mBits = bits + this.bitPosition;
    if (mBits <= 8) {
      a = ((this.stream.peekUInt8() << this.bitPosition) & 0xff) >>> (8 - bits);
    } else if (mBits <= 16) {
      a = ((this.stream.peekUInt16() << this.bitPosition) & 0xffff) >>> (16 - bits);
    } else if (mBits <= 24) {
      a = ((this.stream.peekUInt24() << this.bitPosition) & 0xffffff) >>> (24 - bits);
    } else if (mBits <= 32) {
      a = (this.stream.peekUInt32() << this.bitPosition) >>> (32 - bits);
    } else if (mBits <= 40) {
      a0 = this.stream.peekUInt8(0) * 0x0100000000;
      a1 = this.stream.peekUInt8(1) << 24 >>> 0;
      a2 = this.stream.peekUInt8(2) << 16;
      a3 = this.stream.peekUInt8(3) << 8;
      a4 = this.stream.peekUInt8(4);
      a = a0 + a1 + a2 + a3 + a4;
      a %= Math.pow(2, 40 - this.bitPosition);
      a = Math.floor(a / Math.pow(2, 40 - this.bitPosition - bits));
    } else {
      throw new Error("Too many bits!");
    }
    if (signed) {
      if (mBits < 32) {
        if (a >>> (bits - 1)) {
          a = ((1 << bits >>> 0) - a) * -1;
        }
      } else {
        if (a / Math.pow(2, bits - 1) | 0) {
          a = (Math.pow(2, bits) - a) * -1;
        }
      }
    }
    this.advance(bits);
    return a;
  };

  Bitstream.prototype.peek = function(bits, signed) {
    var a, a0, a1, a2, a3, a4, mBits;
    if (bits === 0) {
      return 0;
    }
    mBits = bits + this.bitPosition;
    if (mBits <= 8) {
      a = ((this.stream.peekUInt8() << this.bitPosition) & 0xff) >>> (8 - bits);
    } else if (mBits <= 16) {
      a = ((this.stream.peekUInt16() << this.bitPosition) & 0xffff) >>> (16 - bits);
    } else if (mBits <= 24) {
      a = ((this.stream.peekUInt24() << this.bitPosition) & 0xffffff) >>> (24 - bits);
    } else if (mBits <= 32) {
      a = (this.stream.peekUInt32() << this.bitPosition) >>> (32 - bits);
    } else if (mBits <= 40) {
      a0 = this.stream.peekUInt8(0) * 0x0100000000;
      a1 = this.stream.peekUInt8(1) << 24 >>> 0;
      a2 = this.stream.peekUInt8(2) << 16;
      a3 = this.stream.peekUInt8(3) << 8;
      a4 = this.stream.peekUInt8(4);
      a = a0 + a1 + a2 + a3 + a4;
      a %= Math.pow(2, 40 - this.bitPosition);
      a = Math.floor(a / Math.pow(2, 40 - this.bitPosition - bits));
    } else {
      throw new Error("Too many bits!");
    }
    if (signed) {
      if (mBits < 32) {
        if (a >>> (bits - 1)) {
          a = ((1 << bits >>> 0) - a) * -1;
        }
      } else {
        if (a / Math.pow(2, bits - 1) | 0) {
          a = (Math.pow(2, bits) - a) * -1;
        }
      }
    }
    return a;
  };

  Bitstream.prototype.readLSB = function(bits, signed) {
    var a, mBits;
    if (bits === 0) {
      return 0;
    }
    if (bits > 40) {
      throw new Error("Too many bits!");
    }
    mBits = bits + this.bitPosition;
    a = (this.stream.peekUInt8(0)) >>> this.bitPosition;
    if (mBits > 8) {
      a |= (this.stream.peekUInt8(1)) << (8 - this.bitPosition);
    }
    if (mBits > 16) {
      a |= (this.stream.peekUInt8(2)) << (16 - this.bitPosition);
    }
    if (mBits > 24) {
      a += (this.stream.peekUInt8(3)) << (24 - this.bitPosition) >>> 0;
    }
    if (mBits > 32) {
      a += (this.stream.peekUInt8(4)) * Math.pow(2, 32 - this.bitPosition);
    }
    if (mBits >= 32) {
      a %= Math.pow(2, bits);
    } else {
      a &= (1 << bits) - 1;
    }
    if (signed) {
      if (mBits < 32) {
        if (a >>> (bits - 1)) {
          a = ((1 << bits >>> 0) - a) * -1;
        }
      } else {
        if (a / Math.pow(2, bits - 1) | 0) {
          a = (Math.pow(2, bits) - a) * -1;
        }
      }
    }
    this.advance(bits);
    return a;
  };

  Bitstream.prototype.peekLSB = function(bits, signed) {
    var a, mBits;
    if (bits === 0) {
      return 0;
    }
    if (bits > 40) {
      throw new Error("Too many bits!");
    }
    mBits = bits + this.bitPosition;
    a = (this.stream.peekUInt8(0)) >>> this.bitPosition;
    if (mBits > 8) {
      a |= (this.stream.peekUInt8(1)) << (8 - this.bitPosition);
    }
    if (mBits > 16) {
      a |= (this.stream.peekUInt8(2)) << (16 - this.bitPosition);
    }
    if (mBits > 24) {
      a += (this.stream.peekUInt8(3)) << (24 - this.bitPosition) >>> 0;
    }
    if (mBits > 32) {
      a += (this.stream.peekUInt8(4)) * Math.pow(2, 32 - this.bitPosition);
    }
    if (mBits >= 32) {
      a %= Math.pow(2, bits);
    } else {
      a &= (1 << bits) - 1;
    }
    if (signed) {
      if (mBits < 32) {
        if (a >>> (bits - 1)) {
          a = ((1 << bits >>> 0) - a) * -1;
        }
      } else {
        if (a / Math.pow(2, bits - 1) | 0) {
          a = (Math.pow(2, bits) - a) * -1;
        }
      }
    }
    return a;
  };

  return Bitstream;

})();

module.exports = Bitstream;


},{}],7:[function(require,module,exports){
(function (global){
var AVBuffer;

AVBuffer = (function() {
  var BlobBuilder, URL;

  function AVBuffer(input) {
    var ref;
    if (input instanceof Uint8Array) {
      this.data = input;
    } else if (input instanceof ArrayBuffer || Array.isArray(input) || typeof input === 'number' || ((ref = global.Buffer) != null ? ref.isBuffer(input) : void 0)) {
      this.data = new Uint8Array(input);
    } else if (input.buffer instanceof ArrayBuffer) {
      this.data = new Uint8Array(input.buffer, input.byteOffset, input.length * input.BYTES_PER_ELEMENT);
    } else if (input instanceof AVBuffer) {
      this.data = input.data;
    } else {
      throw new Error("Constructing buffer with unknown type.");
    }
    this.length = this.data.length;
    this.next = null;
    this.prev = null;
  }

  AVBuffer.allocate = function(size) {
    return new AVBuffer(size);
  };

  AVBuffer.prototype.copy = function() {
    return new AVBuffer(new Uint8Array(this.data));
  };

  AVBuffer.prototype.slice = function(position, length) {
    if (length == null) {
      length = this.length;
    }
    if (position === 0 && length >= this.length) {
      return new AVBuffer(this.data);
    } else {
      return new AVBuffer(this.data.subarray(position, position + length));
    }
  };

  BlobBuilder = global.BlobBuilder || global.MozBlobBuilder || global.WebKitBlobBuilder;

  URL = global.URL || global.webkitURL || global.mozURL;

  AVBuffer.makeBlob = function(data, type) {
    var bb;
    if (type == null) {
      type = 'application/octet-stream';
    }
    try {
      return new Blob([data], {
        type: type
      });
    } catch (_error) {}
    if (BlobBuilder != null) {
      bb = new BlobBuilder;
      bb.append(data);
      return bb.getBlob(type);
    }
    return null;
  };

  AVBuffer.makeBlobURL = function(data, type) {
    return URL != null ? URL.createObjectURL(this.makeBlob(data, type)) : void 0;
  };

  AVBuffer.revokeBlobURL = function(url) {
    return URL != null ? URL.revokeObjectURL(url) : void 0;
  };

  AVBuffer.prototype.toBlob = function() {
    return AVBuffer.makeBlob(this.data.buffer);
  };

  AVBuffer.prototype.toBlobURL = function() {
    return AVBuffer.makeBlobURL(this.data.buffer);
  };

  return AVBuffer;

})();

module.exports = AVBuffer;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],8:[function(require,module,exports){
var BufferList;

BufferList = (function() {
  function BufferList() {
    this.first = null;
    this.last = null;
    this.numBuffers = 0;
    this.availableBytes = 0;
    this.availableBuffers = 0;
  }

  BufferList.prototype.copy = function() {
    var result;
    result = new BufferList;
    result.first = this.first;
    result.last = this.last;
    result.numBuffers = this.numBuffers;
    result.availableBytes = this.availableBytes;
    result.availableBuffers = this.availableBuffers;
    return result;
  };

  BufferList.prototype.append = function(buffer) {
    var ref;
    buffer.prev = this.last;
    if ((ref = this.last) != null) {
      ref.next = buffer;
    }
    this.last = buffer;
    if (this.first == null) {
      this.first = buffer;
    }
    this.availableBytes += buffer.length;
    this.availableBuffers++;
    return this.numBuffers++;
  };

  BufferList.prototype.advance = function() {
    if (this.first) {
      this.availableBytes -= this.first.length;
      this.availableBuffers--;
      this.first = this.first.next;
      return this.first != null;
    }
    return false;
  };

  BufferList.prototype.rewind = function() {
    var ref;
    if (this.first && !this.first.prev) {
      return false;
    }
    this.first = ((ref = this.first) != null ? ref.prev : void 0) || this.last;
    if (this.first) {
      this.availableBytes += this.first.length;
      this.availableBuffers++;
    }
    return this.first != null;
  };

  BufferList.prototype.reset = function() {
    var results;
    results = [];
    while (this.rewind()) {
      continue;
    }
    return results;
  };

  return BufferList;

})();

module.exports = BufferList;


},{}],9:[function(require,module,exports){
var Base, EventEmitter,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty,
  slice = [].slice;

Base = require('./base');

EventEmitter = (function(superClass) {
  extend(EventEmitter, superClass);

  function EventEmitter() {
    return EventEmitter.__super__.constructor.apply(this, arguments);
  }

  EventEmitter.prototype.on = function(event, fn) {
    var base;
    if (this.events == null) {
      this.events = {};
    }
    if ((base = this.events)[event] == null) {
      base[event] = [];
    }
    return this.events[event].push(fn);
  };

  EventEmitter.prototype.off = function(event, fn) {
    var index, ref;
    if (!((ref = this.events) != null ? ref[event] : void 0)) {
      return;
    }
    index = this.events[event].indexOf(fn);
    if (~index) {
      return this.events[event].splice(index, 1);
    }
  };

  EventEmitter.prototype.once = function(event, fn) {
    var cb;
    return this.on(event, cb = function() {
      this.off(event, cb);
      return fn.apply(this, arguments);
    });
  };

  EventEmitter.prototype.emit = function() {
    var args, event, fn, i, len, ref, ref1;
    event = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
    if (!((ref = this.events) != null ? ref[event] : void 0)) {
      return;
    }
    ref1 = this.events[event].slice();
    for (i = 0, len = ref1.length; i < len; i++) {
      fn = ref1[i];
      fn.apply(this, args);
    }
  };

  return EventEmitter;

})(Base);

module.exports = EventEmitter;


},{"./base":5}],10:[function(require,module,exports){
var AVBuffer, BufferList, Stream, UnderflowError;

BufferList = require('./bufferlist');

AVBuffer = require('./buffer');

UnderflowError = require('./underflow');

Stream = (function() {
  var buf, decodeString, float32, float64, float64Fallback, float80, int16, int32, int8, nativeEndian, uint16, uint32, uint8;

  buf = new ArrayBuffer(16);

  uint8 = new Uint8Array(buf);

  int8 = new Int8Array(buf);

  uint16 = new Uint16Array(buf);

  int16 = new Int16Array(buf);

  uint32 = new Uint32Array(buf);

  int32 = new Int32Array(buf);

  float32 = new Float32Array(buf);

  if (typeof Float64Array !== "undefined" && Float64Array !== null) {
    float64 = new Float64Array(buf);
  }

  nativeEndian = new Uint16Array(new Uint8Array([0x12, 0x34]).buffer)[0] === 0x3412;

  function Stream(list1) {
    this.list = list1;
    this.localOffset = 0;
    this.offset = 0;
  }

  Stream.fromBuffer = function(buffer) {
    var list;
    list = new BufferList;
    list.append(buffer);
    return new Stream(list);
  };

  Stream.prototype.copy = function() {
    var result;
    result = new Stream(this.list.copy());
    result.localOffset = this.localOffset;
    result.offset = this.offset;
    return result;
  };

  Stream.prototype.available = function(bytes) {
    return bytes <= this.list.availableBytes - this.localOffset;
  };

  Stream.prototype.remainingBytes = function() {
    return this.list.availableBytes - this.localOffset;
  };

  Stream.prototype.advance = function(bytes) {
    if (!this.available(bytes)) {
      throw new UnderflowError();
    }
    this.localOffset += bytes;
    this.offset += bytes;
    while (this.list.first && this.localOffset >= this.list.first.length) {
      this.localOffset -= this.list.first.length;
      this.list.advance();
    }
    return this;
  };

  Stream.prototype.rewind = function(bytes) {
    if (bytes > this.offset) {
      throw new UnderflowError();
    }
    if (!this.list.first) {
      this.list.rewind();
      this.localOffset = this.list.first.length;
    }
    this.localOffset -= bytes;
    this.offset -= bytes;
    while (this.list.first.prev && this.localOffset < 0) {
      this.list.rewind();
      this.localOffset += this.list.first.length;
    }
    return this;
  };

  Stream.prototype.seek = function(position) {
    if (position > this.offset) {
      return this.advance(position - this.offset);
    } else if (position < this.offset) {
      return this.rewind(this.offset - position);
    }
  };

  Stream.prototype.readUInt8 = function() {
    var a;
    if (!this.available(1)) {
      throw new UnderflowError();
    }
    a = this.list.first.data[this.localOffset];
    this.localOffset += 1;
    this.offset += 1;
    if (this.localOffset === this.list.first.length) {
      this.localOffset = 0;
      this.list.advance();
    }
    return a;
  };

  Stream.prototype.peekUInt8 = function(offset) {
    var buffer;
    if (offset == null) {
      offset = 0;
    }
    if (!this.available(offset + 1)) {
      throw new UnderflowError();
    }
    offset = this.localOffset + offset;
    buffer = this.list.first;
    while (buffer) {
      if (buffer.length > offset) {
        return buffer.data[offset];
      }
      offset -= buffer.length;
      buffer = buffer.next;
    }
    return 0;
  };

  Stream.prototype.read = function(bytes, littleEndian) {
    var i, j, k, ref, ref1;
    if (littleEndian == null) {
      littleEndian = false;
    }
    if (littleEndian === nativeEndian) {
      for (i = j = 0, ref = bytes; j < ref; i = j += 1) {
        uint8[i] = this.readUInt8();
      }
    } else {
      for (i = k = ref1 = bytes - 1; k >= 0; i = k += -1) {
        uint8[i] = this.readUInt8();
      }
    }
  };

  Stream.prototype.peek = function(bytes, offset, littleEndian) {
    var i, j, k, ref, ref1;
    if (littleEndian == null) {
      littleEndian = false;
    }
    if (littleEndian === nativeEndian) {
      for (i = j = 0, ref = bytes; j < ref; i = j += 1) {
        uint8[i] = this.peekUInt8(offset + i);
      }
    } else {
      for (i = k = 0, ref1 = bytes; k < ref1; i = k += 1) {
        uint8[bytes - i - 1] = this.peekUInt8(offset + i);
      }
    }
  };

  Stream.prototype.readInt8 = function() {
    this.read(1);
    return int8[0];
  };

  Stream.prototype.peekInt8 = function(offset) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(1, offset);
    return int8[0];
  };

  Stream.prototype.readUInt16 = function(littleEndian) {
    this.read(2, littleEndian);
    return uint16[0];
  };

  Stream.prototype.peekUInt16 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(2, offset, littleEndian);
    return uint16[0];
  };

  Stream.prototype.readInt16 = function(littleEndian) {
    this.read(2, littleEndian);
    return int16[0];
  };

  Stream.prototype.peekInt16 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(2, offset, littleEndian);
    return int16[0];
  };

  Stream.prototype.readUInt24 = function(littleEndian) {
    if (littleEndian) {
      return this.readUInt16(true) + (this.readUInt8() << 16);
    } else {
      return (this.readUInt16() << 8) + this.readUInt8();
    }
  };

  Stream.prototype.peekUInt24 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    if (littleEndian) {
      return this.peekUInt16(offset, true) + (this.peekUInt8(offset + 2) << 16);
    } else {
      return (this.peekUInt16(offset) << 8) + this.peekUInt8(offset + 2);
    }
  };

  Stream.prototype.readInt24 = function(littleEndian) {
    if (littleEndian) {
      return this.readUInt16(true) + (this.readInt8() << 16);
    } else {
      return (this.readInt16() << 8) + this.readUInt8();
    }
  };

  Stream.prototype.peekInt24 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    if (littleEndian) {
      return this.peekUInt16(offset, true) + (this.peekInt8(offset + 2) << 16);
    } else {
      return (this.peekInt16(offset) << 8) + this.peekUInt8(offset + 2);
    }
  };

  Stream.prototype.readUInt32 = function(littleEndian) {
    this.read(4, littleEndian);
    return uint32[0];
  };

  Stream.prototype.peekUInt32 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(4, offset, littleEndian);
    return uint32[0];
  };

  Stream.prototype.readInt32 = function(littleEndian) {
    this.read(4, littleEndian);
    return int32[0];
  };

  Stream.prototype.peekInt32 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(4, offset, littleEndian);
    return int32[0];
  };

  Stream.prototype.readFloat32 = function(littleEndian) {
    this.read(4, littleEndian);
    return float32[0];
  };

  Stream.prototype.peekFloat32 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(4, offset, littleEndian);
    return float32[0];
  };

  Stream.prototype.readFloat64 = function(littleEndian) {
    this.read(8, littleEndian);
    if (float64) {
      return float64[0];
    } else {
      return float64Fallback();
    }
  };

  float64Fallback = function() {
    var exp, frac, high, low, out, sign;
    low = uint32[0], high = uint32[1];
    if (!high || high === 0x80000000) {
      return 0.0;
    }
    sign = 1 - (high >>> 31) * 2;
    exp = (high >>> 20) & 0x7ff;
    frac = high & 0xfffff;
    if (exp === 0x7ff) {
      if (frac) {
        return NaN;
      }
      return sign * Infinity;
    }
    exp -= 1023;
    out = (frac | 0x100000) * Math.pow(2, exp - 20);
    out += low * Math.pow(2, exp - 52);
    return sign * out;
  };

  Stream.prototype.peekFloat64 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(8, offset, littleEndian);
    if (float64) {
      return float64[0];
    } else {
      return float64Fallback();
    }
  };

  Stream.prototype.readFloat80 = function(littleEndian) {
    this.read(10, littleEndian);
    return float80();
  };

  float80 = function() {
    var a0, a1, exp, high, low, out, sign;
    high = uint32[0], low = uint32[1];
    a0 = uint8[9];
    a1 = uint8[8];
    sign = 1 - (a0 >>> 7) * 2;
    exp = ((a0 & 0x7F) << 8) | a1;
    if (exp === 0 && low === 0 && high === 0) {
      return 0;
    }
    if (exp === 0x7fff) {
      if (low === 0 && high === 0) {
        return sign * Infinity;
      }
      return NaN;
    }
    exp -= 16383;
    out = low * Math.pow(2, exp - 31);
    out += high * Math.pow(2, exp - 63);
    return sign * out;
  };

  Stream.prototype.peekFloat80 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(10, offset, littleEndian);
    return float80();
  };

  Stream.prototype.readBuffer = function(length) {
    var i, j, ref, result, to;
    result = AVBuffer.allocate(length);
    to = result.data;
    for (i = j = 0, ref = length; j < ref; i = j += 1) {
      to[i] = this.readUInt8();
    }
    return result;
  };

  Stream.prototype.peekBuffer = function(offset, length) {
    var i, j, ref, result, to;
    if (offset == null) {
      offset = 0;
    }
    result = AVBuffer.allocate(length);
    to = result.data;
    for (i = j = 0, ref = length; j < ref; i = j += 1) {
      to[i] = this.peekUInt8(offset + i);
    }
    return result;
  };

  Stream.prototype.readSingleBuffer = function(length) {
    var result;
    result = this.list.first.slice(this.localOffset, length);
    this.advance(result.length);
    return result;
  };

  Stream.prototype.peekSingleBuffer = function(offset, length) {
    var result;
    result = this.list.first.slice(this.localOffset + offset, length);
    return result;
  };

  Stream.prototype.readString = function(length, encoding) {
    if (encoding == null) {
      encoding = 'ascii';
    }
    return decodeString.call(this, 0, length, encoding, true);
  };

  Stream.prototype.peekString = function(offset, length, encoding) {
    if (offset == null) {
      offset = 0;
    }
    if (encoding == null) {
      encoding = 'ascii';
    }
    return decodeString.call(this, offset, length, encoding, false);
  };

  decodeString = function(offset, length, encoding, advance) {
    var b1, b2, b3, b4, bom, c, end, littleEndian, nullEnd, pt, result, w1, w2;
    encoding = encoding.toLowerCase();
    nullEnd = length === null ? 0 : -1;
    if (length == null) {
      length = Infinity;
    }
    end = offset + length;
    result = '';
    switch (encoding) {
      case 'ascii':
      case 'latin1':
        while (offset < end && (c = this.peekUInt8(offset++)) !== nullEnd) {
          result += String.fromCharCode(c);
        }
        break;
      case 'utf8':
      case 'utf-8':
        while (offset < end && (b1 = this.peekUInt8(offset++)) !== nullEnd) {
          if ((b1 & 0x80) === 0) {
            result += String.fromCharCode(b1);
          } else if ((b1 & 0xe0) === 0xc0) {
            b2 = this.peekUInt8(offset++) & 0x3f;
            result += String.fromCharCode(((b1 & 0x1f) << 6) | b2);
          } else if ((b1 & 0xf0) === 0xe0) {
            b2 = this.peekUInt8(offset++) & 0x3f;
            b3 = this.peekUInt8(offset++) & 0x3f;
            result += String.fromCharCode(((b1 & 0x0f) << 12) | (b2 << 6) | b3);
          } else if ((b1 & 0xf8) === 0xf0) {
            b2 = this.peekUInt8(offset++) & 0x3f;
            b3 = this.peekUInt8(offset++) & 0x3f;
            b4 = this.peekUInt8(offset++) & 0x3f;
            pt = (((b1 & 0x0f) << 18) | (b2 << 12) | (b3 << 6) | b4) - 0x10000;
            result += String.fromCharCode(0xd800 + (pt >> 10), 0xdc00 + (pt & 0x3ff));
          }
        }
        break;
      case 'utf16-be':
      case 'utf16be':
      case 'utf16le':
      case 'utf16-le':
      case 'utf16bom':
      case 'utf16-bom':
        switch (encoding) {
          case 'utf16be':
          case 'utf16-be':
            littleEndian = false;
            break;
          case 'utf16le':
          case 'utf16-le':
            littleEndian = true;
            break;
          case 'utf16bom':
          case 'utf16-bom':
            if (length < 2 || (bom = this.peekUInt16(offset)) === nullEnd) {
              if (advance) {
                this.advance(offset += 2);
              }
              return result;
            }
            littleEndian = bom === 0xfffe;
            offset += 2;
        }
        while (offset < end && (w1 = this.peekUInt16(offset, littleEndian)) !== nullEnd) {
          offset += 2;
          if (w1 < 0xd800 || w1 > 0xdfff) {
            result += String.fromCharCode(w1);
          } else {
            if (w1 > 0xdbff) {
              throw new Error("Invalid utf16 sequence.");
            }
            w2 = this.peekUInt16(offset, littleEndian);
            if (w2 < 0xdc00 || w2 > 0xdfff) {
              throw new Error("Invalid utf16 sequence.");
            }
            result += String.fromCharCode(w1, w2);
            offset += 2;
          }
        }
        if (w1 === nullEnd) {
          offset += 2;
        }
        break;
      default:
        throw new Error("Unknown encoding: " + encoding);
    }
    if (advance) {
      this.advance(offset);
    }
    return result;
  };

  return Stream;

})();

module.exports = Stream;


},{"./buffer":7,"./bufferlist":8,"./underflow":11}],11:[function(require,module,exports){
var UnderflowError,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

UnderflowError = (function(superClass) {
  extend(UnderflowError, superClass);

  function UnderflowError() {
    UnderflowError.__super__.constructor.apply(this, arguments);
    this.name = 'UnderflowError';
    this.stack = new Error().stack;
  }

  return UnderflowError;

})(Error);

module.exports = UnderflowError;


},{}],12:[function(require,module,exports){
var Bitstream, BufferList, Decoder, EventEmitter, Stream, UnderflowError,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

EventEmitter = require('./core/events');

BufferList = require('./core/bufferlist');

Stream = require('./core/stream');

Bitstream = require('./core/bitstream');

UnderflowError = require('./core/underflow');

Decoder = (function(superClass) {
  var codecs;

  extend(Decoder, superClass);

  function Decoder(demuxer, format) {
    var list;
    this.demuxer = demuxer;
    this.format = format;
    list = new BufferList;
    this.stream = new Stream(list);
    this.bitstream = new Bitstream(this.stream);
    this.receivedFinalBuffer = false;
    this.waiting = false;
    this.demuxer.on('cookie', (function(_this) {
      return function(cookie) {
        var error;
        try {
          return _this.setCookie(cookie);
        } catch (_error) {
          error = _error;
          return _this.emit('error', error);
        }
      };
    })(this));
    this.demuxer.on('data', (function(_this) {
      return function(chunk) {
        list.append(chunk);
        if (_this.waiting) {
          return _this.decode();
        }
      };
    })(this));
    this.demuxer.on('end', (function(_this) {
      return function() {
        _this.receivedFinalBuffer = true;
        if (_this.waiting) {
          return _this.decode();
        }
      };
    })(this));
    this.init();
  }

  Decoder.prototype.init = function() {};

  Decoder.prototype.setCookie = function(cookie) {};

  Decoder.prototype.readChunk = function() {};

  Decoder.prototype.decode = function() {
    var error, offset, packet;
    this.waiting = false;
    offset = this.bitstream.offset();
    try {
      packet = this.readChunk();
    } catch (_error) {
      error = _error;
      if (!(error instanceof UnderflowError)) {
        this.emit('error', error);
        return false;
      }
    }
    if (packet) {
      this.emit('data', packet);
      return true;
    } else if (!this.receivedFinalBuffer) {
      this.bitstream.seek(offset);
      this.waiting = true;
    } else {
      this.emit('end');
    }
    return false;
  };

  Decoder.prototype.seek = function(timestamp) {
    var seekPoint;
    seekPoint = this.demuxer.seek(timestamp);
    this.stream.seek(seekPoint.offset);
    return seekPoint.timestamp;
  };

  codecs = {};

  Decoder.register = function(id, decoder) {
    return codecs[id] = decoder;
  };

  Decoder.find = function(id) {
    return codecs[id] || null;
  };

  return Decoder;

})(EventEmitter);

module.exports = Decoder;


},{"./core/bitstream":6,"./core/bufferlist":8,"./core/events":9,"./core/stream":10,"./core/underflow":11}],13:[function(require,module,exports){
var Decoder, LPCMDecoder,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

Decoder = require('../decoder');

LPCMDecoder = (function(superClass) {
  extend(LPCMDecoder, superClass);

  function LPCMDecoder() {
    this.readChunk = bind(this.readChunk, this);
    return LPCMDecoder.__super__.constructor.apply(this, arguments);
  }

  Decoder.register('lpcm', LPCMDecoder);

  LPCMDecoder.prototype.readChunk = function() {
    var chunkSize, i, j, k, l, littleEndian, m, n, o, output, ref, ref1, ref2, ref3, ref4, ref5, samples, stream;
    stream = this.stream;
    littleEndian = this.format.littleEndian;
    chunkSize = Math.min(8192, stream.remainingBytes());
    samples = chunkSize / (this.format.bitsPerChannel / 8) | 0;
    if (chunkSize < this.format.bitsPerChannel / 8) {
      return null;
    }
    if (this.format.floatingPoint) {
      switch (this.format.bitsPerChannel) {
        case 32:
          output = new Float32Array(samples);
          for (i = j = 0, ref = samples; j < ref; i = j += 1) {
            output[i] = stream.readFloat32(littleEndian);
          }
          break;
        case 64:
          output = new Float64Array(samples);
          for (i = k = 0, ref1 = samples; k < ref1; i = k += 1) {
            output[i] = stream.readFloat64(littleEndian);
          }
          break;
        default:
          throw new Error('Unsupported bit depth.');
      }
    } else {
      switch (this.format.bitsPerChannel) {
        case 8:
          output = new Int8Array(samples);
          for (i = l = 0, ref2 = samples; l < ref2; i = l += 1) {
            output[i] = stream.readInt8();
          }
          break;
        case 16:
          output = new Int16Array(samples);
          for (i = m = 0, ref3 = samples; m < ref3; i = m += 1) {
            output[i] = stream.readInt16(littleEndian);
          }
          break;
        case 24:
          output = new Int32Array(samples);
          for (i = n = 0, ref4 = samples; n < ref4; i = n += 1) {
            output[i] = stream.readInt24(littleEndian);
          }
          break;
        case 32:
          output = new Int32Array(samples);
          for (i = o = 0, ref5 = samples; o < ref5; i = o += 1) {
            output[i] = stream.readInt32(littleEndian);
          }
          break;
        default:
          throw new Error('Unsupported bit depth.');
      }
    }
    return output;
  };

  return LPCMDecoder;

})(Decoder);


},{"../decoder":12}],14:[function(require,module,exports){
var Decoder, XLAWDecoder,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

Decoder = require('../decoder');

XLAWDecoder = (function(superClass) {
  var BIAS, QUANT_MASK, SEG_MASK, SEG_SHIFT, SIGN_BIT;

  extend(XLAWDecoder, superClass);

  function XLAWDecoder() {
    this.readChunk = bind(this.readChunk, this);
    return XLAWDecoder.__super__.constructor.apply(this, arguments);
  }

  Decoder.register('ulaw', XLAWDecoder);

  Decoder.register('alaw', XLAWDecoder);

  SIGN_BIT = 0x80;

  QUANT_MASK = 0xf;

  SEG_SHIFT = 4;

  SEG_MASK = 0x70;

  BIAS = 0x84;

  XLAWDecoder.prototype.init = function() {
    var i, j, k, seg, t, table, val;
    this.format.bitsPerChannel = 16;
    this.table = table = new Int16Array(256);
    if (this.format.formatID === 'ulaw') {
      for (i = j = 0; j < 256; i = ++j) {
        val = ~i;
        t = ((val & QUANT_MASK) << 3) + BIAS;
        t <<= (val & SEG_MASK) >>> SEG_SHIFT;
        table[i] = val & SIGN_BIT ? BIAS - t : t - BIAS;
      }
    } else {
      for (i = k = 0; k < 256; i = ++k) {
        val = i ^ 0x55;
        t = val & QUANT_MASK;
        seg = (val & SEG_MASK) >>> SEG_SHIFT;
        if (seg) {
          t = (t + t + 1 + 32) << (seg + 2);
        } else {
          t = (t + t + 1) << 3;
        }
        table[i] = val & SIGN_BIT ? t : -t;
      }
    }
  };

  XLAWDecoder.prototype.readChunk = function() {
    var i, j, output, ref, samples, stream, table;
    stream = this.stream, table = this.table;
    samples = Math.min(8192, this.stream.remainingBytes());
    if (samples === 0) {
      return;
    }
    output = new Int16Array(samples);
    for (i = j = 0, ref = samples; j < ref; i = j += 1) {
      output[i] = table[stream.readUInt8()];
    }
    return output;
  };

  return XLAWDecoder;

})(Decoder);


},{"../decoder":12}],15:[function(require,module,exports){
var BufferList, Demuxer, EventEmitter, Stream,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

EventEmitter = require('./core/events');

BufferList = require('./core/bufferlist');

Stream = require('./core/stream');

Demuxer = (function(superClass) {
  var formats;

  extend(Demuxer, superClass);

  Demuxer.probe = function(buffer) {
    return false;
  };

  function Demuxer(source, chunk) {
    var list, received;
    list = new BufferList;
    list.append(chunk);
    this.stream = new Stream(list);
    received = false;
    source.on('data', (function(_this) {
      return function(chunk) {
        received = true;
        list.append(chunk);
        return _this.readChunk(chunk);
      };
    })(this));
    source.on('error', (function(_this) {
      return function(err) {
        return _this.emit('error', err);
      };
    })(this));
    source.on('end', (function(_this) {
      return function() {
        if (!received) {
          _this.readChunk(chunk);
        }
        return _this.emit('end');
      };
    })(this));
    this.seekPoints = [];
    this.init();
  }

  Demuxer.prototype.init = function() {};

  Demuxer.prototype.readChunk = function(chunk) {};

  Demuxer.prototype.addSeekPoint = function(offset, timestamp) {
    var index;
    index = this.searchTimestamp(timestamp);
    return this.seekPoints.splice(index, 0, {
      offset: offset,
      timestamp: timestamp
    });
  };

  Demuxer.prototype.searchTimestamp = function(timestamp, backward) {
    var high, low, mid, time;
    low = 0;
    high = this.seekPoints.length;
    if (high > 0 && this.seekPoints[high - 1].timestamp < timestamp) {
      return high;
    }
    while (low < high) {
      mid = (low + high) >> 1;
      time = this.seekPoints[mid].timestamp;
      if (time < timestamp) {
        low = mid + 1;
      } else if (time >= timestamp) {
        high = mid;
      }
    }
    if (high > this.seekPoints.length) {
      high = this.seekPoints.length;
    }
    return high;
  };

  Demuxer.prototype.seek = function(timestamp) {
    var index, seekPoint;
    if (this.format && this.format.framesPerPacket > 0 && this.format.bytesPerPacket > 0) {
      seekPoint = {
        timestamp: timestamp,
        offset: this.format.bytesPerPacket * timestamp / this.format.framesPerPacket
      };
      return seekPoint;
    } else {
      index = this.searchTimestamp(timestamp);
      return this.seekPoints[index];
    }
  };

  formats = [];

  Demuxer.register = function(demuxer) {
    return formats.push(demuxer);
  };

  Demuxer.find = function(buffer) {
    var e, format, i, len, offset, stream;
    stream = Stream.fromBuffer(buffer);
    for (i = 0, len = formats.length; i < len; i++) {
      format = formats[i];
      offset = stream.offset;
      try {
        if (format.probe(stream)) {
          return format;
        }
      } catch (_error) {
        e = _error;
      }
      stream.seek(offset);
    }
    return null;
  };

  return Demuxer;

})(EventEmitter);

module.exports = Demuxer;


},{"./core/bufferlist":8,"./core/events":9,"./core/stream":10}],16:[function(require,module,exports){
var AIFFDemuxer, Demuxer,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

Demuxer = require('../demuxer');

AIFFDemuxer = (function(superClass) {
  extend(AIFFDemuxer, superClass);

  function AIFFDemuxer() {
    return AIFFDemuxer.__super__.constructor.apply(this, arguments);
  }

  Demuxer.register(AIFFDemuxer);

  AIFFDemuxer.probe = function(buffer) {
    var ref;
    return buffer.peekString(0, 4) === 'FORM' && ((ref = buffer.peekString(8, 4)) === 'AIFF' || ref === 'AIFC');
  };

  AIFFDemuxer.prototype.readChunk = function() {
    var buffer, format, offset, ref;
    if (!this.readStart && this.stream.available(12)) {
      if (this.stream.readString(4) !== 'FORM') {
        return this.emit('error', 'Invalid AIFF.');
      }
      this.fileSize = this.stream.readUInt32();
      this.fileType = this.stream.readString(4);
      this.readStart = true;
      if ((ref = this.fileType) !== 'AIFF' && ref !== 'AIFC') {
        return this.emit('error', 'Invalid AIFF.');
      }
    }
    while (this.stream.available(1)) {
      if (!this.readHeaders && this.stream.available(8)) {
        this.type = this.stream.readString(4);
        this.len = this.stream.readUInt32();
      }
      switch (this.type) {
        case 'COMM':
          if (!this.stream.available(this.len)) {
            return;
          }
          this.format = {
            formatID: 'lpcm',
            channelsPerFrame: this.stream.readUInt16(),
            sampleCount: this.stream.readUInt32(),
            bitsPerChannel: this.stream.readUInt16(),
            sampleRate: this.stream.readFloat80(),
            framesPerPacket: 1,
            littleEndian: false,
            floatingPoint: false
          };
          this.format.bytesPerPacket = (this.format.bitsPerChannel / 8) * this.format.channelsPerFrame;
          if (this.fileType === 'AIFC') {
            format = this.stream.readString(4);
            this.format.littleEndian = format === 'sowt' && this.format.bitsPerChannel > 8;
            this.format.floatingPoint = format === 'fl32' || format === 'fl64';
            if (format === 'twos' || format === 'sowt' || format === 'fl32' || format === 'fl64' || format === 'NONE') {
              format = 'lpcm';
            }
            this.format.formatID = format;
            this.len -= 4;
          }
          this.stream.advance(this.len - 18);
          this.emit('format', this.format);
          this.emit('duration', this.format.sampleCount / this.format.sampleRate * 1000 | 0);
          break;
        case 'SSND':
          if (!(this.readSSNDHeader && this.stream.available(4))) {
            offset = this.stream.readUInt32();
            this.stream.advance(4);
            this.stream.advance(offset);
            this.readSSNDHeader = true;
          }
          buffer = this.stream.readSingleBuffer(this.len);
          this.len -= buffer.length;
          this.readHeaders = this.len > 0;
          this.emit('data', buffer);
          break;
        default:
          if (!this.stream.available(this.len)) {
            return;
          }
          this.stream.advance(this.len);
      }
      if (this.type !== 'SSND') {
        this.readHeaders = false;
      }
    }
  };

  return AIFFDemuxer;

})(Demuxer);


},{"../demuxer":15}],17:[function(require,module,exports){
var AUDemuxer, Demuxer,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

Demuxer = require('../demuxer');

AUDemuxer = (function(superClass) {
  var bps, formats;

  extend(AUDemuxer, superClass);

  function AUDemuxer() {
    return AUDemuxer.__super__.constructor.apply(this, arguments);
  }

  Demuxer.register(AUDemuxer);

  AUDemuxer.probe = function(buffer) {
    return buffer.peekString(0, 4) === '.snd';
  };

  bps = [8, 8, 16, 24, 32, 32, 64];

  bps[26] = 8;

  formats = {
    1: 'ulaw',
    27: 'alaw'
  };

  AUDemuxer.prototype.readChunk = function() {
    var bytes, dataSize, encoding, size;
    if (!this.readHeader && this.stream.available(24)) {
      if (this.stream.readString(4) !== '.snd') {
        return this.emit('error', 'Invalid AU file.');
      }
      size = this.stream.readUInt32();
      dataSize = this.stream.readUInt32();
      encoding = this.stream.readUInt32();
      this.format = {
        formatID: formats[encoding] || 'lpcm',
        littleEndian: false,
        floatingPoint: encoding === 6 || encoding === 7,
        bitsPerChannel: bps[encoding - 1],
        sampleRate: this.stream.readUInt32(),
        channelsPerFrame: this.stream.readUInt32(),
        framesPerPacket: 1
      };
      if (this.format.bitsPerChannel == null) {
        return this.emit('error', 'Unsupported encoding in AU file.');
      }
      this.format.bytesPerPacket = (this.format.bitsPerChannel / 8) * this.format.channelsPerFrame;
      if (dataSize !== 0xffffffff) {
        bytes = this.format.bitsPerChannel / 8;
        this.emit('duration', dataSize / bytes / this.format.channelsPerFrame / this.format.sampleRate * 1000 | 0);
      }
      this.emit('format', this.format);
      this.readHeader = true;
    }
    if (this.readHeader) {
      while (this.stream.available(1)) {
        this.emit('data', this.stream.readSingleBuffer(this.stream.remainingBytes()));
      }
    }
  };

  return AUDemuxer;

})(Demuxer);


},{"../demuxer":15}],18:[function(require,module,exports){
var CAFDemuxer, Demuxer, M4ADemuxer,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

Demuxer = require('../demuxer');

M4ADemuxer = require('./m4a');

CAFDemuxer = (function(superClass) {
  extend(CAFDemuxer, superClass);

  function CAFDemuxer() {
    return CAFDemuxer.__super__.constructor.apply(this, arguments);
  }

  Demuxer.register(CAFDemuxer);

  CAFDemuxer.probe = function(buffer) {
    return buffer.peekString(0, 4) === 'caff';
  };

  CAFDemuxer.prototype.readChunk = function() {
    var buffer, byteOffset, cookie, entries, flags, i, j, k, key, metadata, offset, ref, ref1, sampleOffset, value;
    if (!this.format && this.stream.available(64)) {
      if (this.stream.readString(4) !== 'caff') {
        return this.emit('error', "Invalid CAF, does not begin with 'caff'");
      }
      this.stream.advance(4);
      if (this.stream.readString(4) !== 'desc') {
        return this.emit('error', "Invalid CAF, 'caff' is not followed by 'desc'");
      }
      if (!(this.stream.readUInt32() === 0 && this.stream.readUInt32() === 32)) {
        return this.emit('error', "Invalid 'desc' size, should be 32");
      }
      this.format = {};
      this.format.sampleRate = this.stream.readFloat64();
      this.format.formatID = this.stream.readString(4);
      flags = this.stream.readUInt32();
      if (this.format.formatID === 'lpcm') {
        this.format.floatingPoint = Boolean(flags & 1);
        this.format.littleEndian = Boolean(flags & 2);
      }
      this.format.bytesPerPacket = this.stream.readUInt32();
      this.format.framesPerPacket = this.stream.readUInt32();
      this.format.channelsPerFrame = this.stream.readUInt32();
      this.format.bitsPerChannel = this.stream.readUInt32();
      this.emit('format', this.format);
    }
    while (this.stream.available(1)) {
      if (!this.headerCache) {
        this.headerCache = {
          type: this.stream.readString(4),
          oversize: this.stream.readUInt32() !== 0,
          size: this.stream.readUInt32()
        };
        if (this.headerCache.oversize) {
          return this.emit('error', "Holy Shit, an oversized file, not supported in JS");
        }
      }
      switch (this.headerCache.type) {
        case 'kuki':
          if (this.stream.available(this.headerCache.size)) {
            if (this.format.formatID === 'aac ') {
              offset = this.stream.offset + this.headerCache.size;
              if (cookie = M4ADemuxer.readEsds(this.stream)) {
                this.emit('cookie', cookie);
              }
              this.stream.seek(offset);
            } else {
              buffer = this.stream.readBuffer(this.headerCache.size);
              this.emit('cookie', buffer);
            }
            this.headerCache = null;
          }
          break;
        case 'pakt':
          if (this.stream.available(this.headerCache.size)) {
            if (this.stream.readUInt32() !== 0) {
              return this.emit('error', 'Sizes greater than 32 bits are not supported.');
            }
            this.numPackets = this.stream.readUInt32();
            if (this.stream.readUInt32() !== 0) {
              return this.emit('error', 'Sizes greater than 32 bits are not supported.');
            }
            this.numFrames = this.stream.readUInt32();
            this.primingFrames = this.stream.readUInt32();
            this.remainderFrames = this.stream.readUInt32();
            this.emit('duration', this.numFrames / this.format.sampleRate * 1000 | 0);
            this.sentDuration = true;
            byteOffset = 0;
            sampleOffset = 0;
            for (i = j = 0, ref = this.numPackets; j < ref; i = j += 1) {
              this.addSeekPoint(byteOffset, sampleOffset);
              byteOffset += this.format.bytesPerPacket || M4ADemuxer.readDescrLen(this.stream);
              sampleOffset += this.format.framesPerPacket || M4ADemuxer.readDescrLen(this.stream);
            }
            this.headerCache = null;
          }
          break;
        case 'info':
          entries = this.stream.readUInt32();
          metadata = {};
          for (i = k = 0, ref1 = entries; 0 <= ref1 ? k < ref1 : k > ref1; i = 0 <= ref1 ? ++k : --k) {
            key = this.stream.readString(null);
            value = this.stream.readString(null);
            metadata[key] = value;
          }
          this.emit('metadata', metadata);
          this.headerCache = null;
          break;
        case 'data':
          if (!this.sentFirstDataChunk) {
            this.stream.advance(4);
            this.headerCache.size -= 4;
            if (this.format.bytesPerPacket !== 0 && !this.sentDuration) {
              this.numFrames = this.headerCache.size / this.format.bytesPerPacket;
              this.emit('duration', this.numFrames / this.format.sampleRate * 1000 | 0);
            }
            this.sentFirstDataChunk = true;
          }
          buffer = this.stream.readSingleBuffer(this.headerCache.size);
          this.headerCache.size -= buffer.length;
          this.emit('data', buffer);
          if (this.headerCache.size <= 0) {
            this.headerCache = null;
          }
          break;
        default:
          if (this.stream.available(this.headerCache.size)) {
            this.stream.advance(this.headerCache.size);
            this.headerCache = null;
          }
      }
    }
  };

  return CAFDemuxer;

})(Demuxer);


},{"../demuxer":15,"./m4a":19}],19:[function(require,module,exports){
var Demuxer, M4ADemuxer,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

Demuxer = require('../demuxer');

M4ADemuxer = (function(superClass) {
  var BITS_PER_CHANNEL, TYPES, after, atom, atoms, bool, containers, diskTrack, genres, meta, string;

  extend(M4ADemuxer, superClass);

  function M4ADemuxer() {
    return M4ADemuxer.__super__.constructor.apply(this, arguments);
  }

  Demuxer.register(M4ADemuxer);

  TYPES = ['M4A ', 'M4P ', 'M4B ', 'M4V ', 'isom', 'mp42', 'qt  '];

  M4ADemuxer.probe = function(buffer) {
    var ref;
    return buffer.peekString(4, 4) === 'ftyp' && (ref = buffer.peekString(8, 4), indexOf.call(TYPES, ref) >= 0);
  };

  M4ADemuxer.prototype.init = function() {
    this.atoms = [];
    this.offsets = [];
    this.track = null;
    return this.tracks = [];
  };

  atoms = {};

  containers = {};

  atom = function(name, fn) {
    var c, container, k, len1, ref;
    c = [];
    ref = name.split('.').slice(0, -1);
    for (k = 0, len1 = ref.length; k < len1; k++) {
      container = ref[k];
      c.push(container);
      containers[c.join('.')] = true;
    }
    if (atoms[name] == null) {
      atoms[name] = {};
    }
    return atoms[name].fn = fn;
  };

  after = function(name, fn) {
    if (atoms[name] == null) {
      atoms[name] = {};
    }
    return atoms[name].after = fn;
  };

  M4ADemuxer.prototype.readChunk = function() {
    var handler, path, type;
    this["break"] = false;
    while (this.stream.available(1) && !this["break"]) {
      if (!this.readHeaders) {
        if (!this.stream.available(8)) {
          return;
        }
        this.len = this.stream.readUInt32() - 8;
        this.type = this.stream.readString(4);
        if (this.len === 0) {
          continue;
        }
        this.atoms.push(this.type);
        this.offsets.push(this.stream.offset + this.len);
        this.readHeaders = true;
      }
      path = this.atoms.join('.');
      handler = atoms[path];
      if (handler != null ? handler.fn : void 0) {
        if (!(this.stream.available(this.len) || path === 'mdat')) {
          return;
        }
        handler.fn.call(this);
        if (path in containers) {
          this.readHeaders = false;
        }
      } else if (path in containers) {
        this.readHeaders = false;
      } else {
        if (!this.stream.available(this.len)) {
          return;
        }
        this.stream.advance(this.len);
      }
      while (this.stream.offset >= this.offsets[this.offsets.length - 1]) {
        handler = atoms[this.atoms.join('.')];
        if (handler != null ? handler.after : void 0) {
          handler.after.call(this);
        }
        type = this.atoms.pop();
        this.offsets.pop();
        this.readHeaders = false;
      }
    }
  };

  atom('ftyp', function() {
    var ref;
    if (ref = this.stream.readString(4), indexOf.call(TYPES, ref) < 0) {
      return this.emit('error', 'Not a valid M4A file.');
    }
    return this.stream.advance(this.len - 4);
  });

  atom('moov.trak', function() {
    this.track = {};
    return this.tracks.push(this.track);
  });

  atom('moov.trak.tkhd', function() {
    this.stream.advance(4);
    this.stream.advance(8);
    this.track.id = this.stream.readUInt32();
    return this.stream.advance(this.len - 16);
  });

  atom('moov.trak.mdia.hdlr', function() {
    this.stream.advance(4);
    this.stream.advance(4);
    this.track.type = this.stream.readString(4);
    this.stream.advance(12);
    return this.stream.advance(this.len - 24);
  });

  atom('moov.trak.mdia.mdhd', function() {
    this.stream.advance(4);
    this.stream.advance(8);
    this.track.timeScale = this.stream.readUInt32();
    this.track.duration = this.stream.readUInt32();
    return this.stream.advance(4);
  });

  BITS_PER_CHANNEL = {
    ulaw: 8,
    alaw: 8,
    in24: 24,
    in32: 32,
    fl32: 32,
    fl64: 64
  };

  atom('moov.trak.mdia.minf.stbl.stsd', function() {
    var format, numEntries, ref, ref1, version;
    this.stream.advance(4);
    numEntries = this.stream.readUInt32();
    if (this.track.type !== 'soun') {
      return this.stream.advance(this.len - 8);
    }
    if (numEntries !== 1) {
      return this.emit('error', "Only expecting one entry in sample description atom!");
    }
    this.stream.advance(4);
    format = this.track.format = {};
    format.formatID = this.stream.readString(4);
    this.stream.advance(6);
    this.stream.advance(2);
    version = this.stream.readUInt16();
    this.stream.advance(6);
    format.channelsPerFrame = this.stream.readUInt16();
    format.bitsPerChannel = this.stream.readUInt16();
    this.stream.advance(4);
    format.sampleRate = this.stream.readUInt16();
    this.stream.advance(2);
    if (version === 1) {
      format.framesPerPacket = this.stream.readUInt32();
      this.stream.advance(4);
      format.bytesPerFrame = this.stream.readUInt32();
      this.stream.advance(4);
    } else if (version !== 0) {
      this.emit('error', 'Unknown version in stsd atom');
    }
    if (BITS_PER_CHANNEL[format.formatID] != null) {
      format.bitsPerChannel = BITS_PER_CHANNEL[format.formatID];
    }
    format.floatingPoint = (ref = format.formatID) === 'fl32' || ref === 'fl64';
    format.littleEndian = format.formatID === 'sowt' && format.bitsPerChannel > 8;
    if ((ref1 = format.formatID) === 'twos' || ref1 === 'sowt' || ref1 === 'in24' || ref1 === 'in32' || ref1 === 'fl32' || ref1 === 'fl64' || ref1 === 'raw ' || ref1 === 'NONE') {
      return format.formatID = 'lpcm';
    }
  });

  atom('moov.trak.mdia.minf.stbl.stsd.alac', function() {
    this.stream.advance(4);
    return this.track.cookie = this.stream.readBuffer(this.len - 4);
  });

  atom('moov.trak.mdia.minf.stbl.stsd.esds', function() {
    var offset;
    offset = this.stream.offset + this.len;
    this.track.cookie = M4ADemuxer.readEsds(this.stream);
    return this.stream.seek(offset);
  });

  atom('moov.trak.mdia.minf.stbl.stsd.wave.enda', function() {
    return this.track.format.littleEndian = !!this.stream.readUInt16();
  });

  M4ADemuxer.readDescrLen = function(stream) {
    var c, count, len;
    len = 0;
    count = 4;
    while (count--) {
      c = stream.readUInt8();
      len = (len << 7) | (c & 0x7f);
      if (!(c & 0x80)) {
        break;
      }
    }
    return len;
  };

  M4ADemuxer.readEsds = function(stream) {
    var codec_id, flags, len, tag;
    stream.advance(4);
    tag = stream.readUInt8();
    len = M4ADemuxer.readDescrLen(stream);
    if (tag === 0x03) {
      stream.advance(2);
      flags = stream.readUInt8();
      if (flags & 0x80) {
        stream.advance(2);
      }
      if (flags & 0x40) {
        stream.advance(stream.readUInt8());
      }
      if (flags & 0x20) {
        stream.advance(2);
      }
    } else {
      stream.advance(2);
    }
    tag = stream.readUInt8();
    len = M4ADemuxer.readDescrLen(stream);
    if (tag === 0x04) {
      codec_id = stream.readUInt8();
      stream.advance(1);
      stream.advance(3);
      stream.advance(4);
      stream.advance(4);
      tag = stream.readUInt8();
      len = M4ADemuxer.readDescrLen(stream);
      if (tag === 0x05) {
        return stream.readBuffer(len);
      }
    }
    return null;
  };

  atom('moov.trak.mdia.minf.stbl.stts', function() {
    var entries, i, k, ref;
    this.stream.advance(4);
    entries = this.stream.readUInt32();
    this.track.stts = [];
    for (i = k = 0, ref = entries; k < ref; i = k += 1) {
      this.track.stts[i] = {
        count: this.stream.readUInt32(),
        duration: this.stream.readUInt32()
      };
    }
    return this.setupSeekPoints();
  });

  atom('moov.trak.mdia.minf.stbl.stsc', function() {
    var entries, i, k, ref;
    this.stream.advance(4);
    entries = this.stream.readUInt32();
    this.track.stsc = [];
    for (i = k = 0, ref = entries; k < ref; i = k += 1) {
      this.track.stsc[i] = {
        first: this.stream.readUInt32(),
        count: this.stream.readUInt32(),
        id: this.stream.readUInt32()
      };
    }
    return this.setupSeekPoints();
  });

  atom('moov.trak.mdia.minf.stbl.stsz', function() {
    var entries, i, k, ref;
    this.stream.advance(4);
    this.track.sampleSize = this.stream.readUInt32();
    entries = this.stream.readUInt32();
    if (this.track.sampleSize === 0 && entries > 0) {
      this.track.sampleSizes = [];
      for (i = k = 0, ref = entries; k < ref; i = k += 1) {
        this.track.sampleSizes[i] = this.stream.readUInt32();
      }
    }
    return this.setupSeekPoints();
  });

  atom('moov.trak.mdia.minf.stbl.stco', function() {
    var entries, i, k, ref;
    this.stream.advance(4);
    entries = this.stream.readUInt32();
    this.track.chunkOffsets = [];
    for (i = k = 0, ref = entries; k < ref; i = k += 1) {
      this.track.chunkOffsets[i] = this.stream.readUInt32();
    }
    return this.setupSeekPoints();
  });

  atom('moov.trak.tref.chap', function() {
    var entries, i, k, ref;
    entries = this.len >> 2;
    this.track.chapterTracks = [];
    for (i = k = 0, ref = entries; k < ref; i = k += 1) {
      this.track.chapterTracks[i] = this.stream.readUInt32();
    }
  });

  M4ADemuxer.prototype.setupSeekPoints = function() {
    var i, j, k, l, len1, offset, position, ref, ref1, results, sampleIndex, size, stscIndex, sttsIndex, sttsSample, timestamp;
    if (!((this.track.chunkOffsets != null) && (this.track.stsc != null) && (this.track.sampleSize != null) && (this.track.stts != null))) {
      return;
    }
    stscIndex = 0;
    sttsIndex = 0;
    sttsIndex = 0;
    sttsSample = 0;
    sampleIndex = 0;
    offset = 0;
    timestamp = 0;
    this.track.seekPoints = [];
    ref = this.track.chunkOffsets;
    results = [];
    for (i = k = 0, len1 = ref.length; k < len1; i = ++k) {
      position = ref[i];
      for (j = l = 0, ref1 = this.track.stsc[stscIndex].count; l < ref1; j = l += 1) {
        this.track.seekPoints.push({
          offset: offset,
          position: position,
          timestamp: timestamp
        });
        size = this.track.sampleSize || this.track.sampleSizes[sampleIndex++];
        offset += size;
        position += size;
        timestamp += this.track.stts[sttsIndex].duration;
        if (sttsIndex + 1 < this.track.stts.length && ++sttsSample === this.track.stts[sttsIndex].count) {
          sttsSample = 0;
          sttsIndex++;
        }
      }
      if (stscIndex + 1 < this.track.stsc.length && i + 1 === this.track.stsc[stscIndex + 1].first) {
        results.push(stscIndex++);
      } else {
        results.push(void 0);
      }
    }
    return results;
  };

  after('moov', function() {
    var k, len1, ref, track;
    if (this.mdatOffset != null) {
      this.stream.seek(this.mdatOffset - 8);
    }
    ref = this.tracks;
    for (k = 0, len1 = ref.length; k < len1; k++) {
      track = ref[k];
      if (!(track.type === 'soun')) {
        continue;
      }
      this.track = track;
      break;
    }
    if (this.track.type !== 'soun') {
      this.track = null;
      return this.emit('error', 'No audio tracks in m4a file.');
    }
    this.emit('format', this.track.format);
    this.emit('duration', this.track.duration / this.track.timeScale * 1000 | 0);
    if (this.track.cookie) {
      this.emit('cookie', this.track.cookie);
    }
    return this.seekPoints = this.track.seekPoints;
  });

  atom('mdat', function() {
    var bytes, chunkSize, k, length, numSamples, offset, ref, sample, size;
    if (!this.startedData) {
      if (this.mdatOffset == null) {
        this.mdatOffset = this.stream.offset;
      }
      if (this.tracks.length === 0) {
        bytes = Math.min(this.stream.remainingBytes(), this.len);
        this.stream.advance(bytes);
        this.len -= bytes;
        return;
      }
      this.chunkIndex = 0;
      this.stscIndex = 0;
      this.sampleIndex = 0;
      this.tailOffset = 0;
      this.tailSamples = 0;
      this.startedData = true;
    }
    if (!this.readChapters) {
      this.readChapters = this.parseChapters();
      if (this["break"] = !this.readChapters) {
        return;
      }
      this.stream.seek(this.mdatOffset);
    }
    offset = this.track.chunkOffsets[this.chunkIndex] + this.tailOffset;
    length = 0;
    if (!this.stream.available(offset - this.stream.offset)) {
      this["break"] = true;
      return;
    }
    this.stream.seek(offset);
    while (this.chunkIndex < this.track.chunkOffsets.length) {
      numSamples = this.track.stsc[this.stscIndex].count - this.tailSamples;
      chunkSize = 0;
      for (sample = k = 0, ref = numSamples; k < ref; sample = k += 1) {
        size = this.track.sampleSize || this.track.sampleSizes[this.sampleIndex];
        if (!this.stream.available(length + size)) {
          break;
        }
        length += size;
        chunkSize += size;
        this.sampleIndex++;
      }
      if (sample < numSamples) {
        this.tailOffset += chunkSize;
        this.tailSamples += sample;
        break;
      } else {
        this.chunkIndex++;
        this.tailOffset = 0;
        this.tailSamples = 0;
        if (this.stscIndex + 1 < this.track.stsc.length && this.chunkIndex + 1 === this.track.stsc[this.stscIndex + 1].first) {
          this.stscIndex++;
        }
        if (offset + length !== this.track.chunkOffsets[this.chunkIndex]) {
          break;
        }
      }
    }
    if (length > 0) {
      this.emit('data', this.stream.readBuffer(length));
      return this["break"] = this.chunkIndex === this.track.chunkOffsets.length;
    } else {
      return this["break"] = true;
    }
  });

  M4ADemuxer.prototype.parseChapters = function() {
    var bom, id, k, len, len1, nextTimestamp, point, ref, ref1, ref2, ref3, title, track;
    if (!(((ref = this.track.chapterTracks) != null ? ref.length : void 0) > 0)) {
      return true;
    }
    id = this.track.chapterTracks[0];
    ref1 = this.tracks;
    for (k = 0, len1 = ref1.length; k < len1; k++) {
      track = ref1[k];
      if (track.id === id) {
        break;
      }
    }
    if (track.id !== id) {
      this.emit('error', 'Chapter track does not exist.');
    }
    if (this.chapters == null) {
      this.chapters = [];
    }
    while (this.chapters.length < track.seekPoints.length) {
      point = track.seekPoints[this.chapters.length];
      if (!this.stream.available(point.position - this.stream.offset + 32)) {
        return false;
      }
      this.stream.seek(point.position);
      len = this.stream.readUInt16();
      title = null;
      if (!this.stream.available(len)) {
        return false;
      }
      if (len > 2) {
        bom = this.stream.peekUInt16();
        if (bom === 0xfeff || bom === 0xfffe) {
          title = this.stream.readString(len, 'utf16-bom');
        }
      }
      if (title == null) {
        title = this.stream.readString(len, 'utf8');
      }
      nextTimestamp = (ref2 = (ref3 = track.seekPoints[this.chapters.length + 1]) != null ? ref3.timestamp : void 0) != null ? ref2 : track.duration;
      this.chapters.push({
        title: title,
        timestamp: point.timestamp / track.timeScale * 1000 | 0,
        duration: (nextTimestamp - point.timestamp) / track.timeScale * 1000 | 0
      });
    }
    this.emit('chapters', this.chapters);
    return true;
  };

  atom('moov.udta.meta', function() {
    this.metadata = {};
    return this.stream.advance(4);
  });

  after('moov.udta.meta', function() {
    return this.emit('metadata', this.metadata);
  });

  meta = function(field, name, fn) {
    return atom("moov.udta.meta.ilst." + field + ".data", function() {
      this.stream.advance(8);
      this.len -= 8;
      return fn.call(this, name);
    });
  };

  string = function(field) {
    return this.metadata[field] = this.stream.readString(this.len, 'utf8');
  };

  meta('©alb', 'album', string);

  meta('©arg', 'arranger', string);

  meta('©art', 'artist', string);

  meta('©ART', 'artist', string);

  meta('aART', 'albumArtist', string);

  meta('catg', 'category', string);

  meta('©com', 'composer', string);

  meta('©cpy', 'copyright', string);

  meta('cprt', 'copyright', string);

  meta('©cmt', 'comments', string);

  meta('©day', 'releaseDate', string);

  meta('desc', 'description', string);

  meta('©gen', 'genre', string);

  meta('©grp', 'grouping', string);

  meta('©isr', 'ISRC', string);

  meta('keyw', 'keywords', string);

  meta('©lab', 'recordLabel', string);

  meta('ldes', 'longDescription', string);

  meta('©lyr', 'lyrics', string);

  meta('©nam', 'title', string);

  meta('©phg', 'recordingCopyright', string);

  meta('©prd', 'producer', string);

  meta('©prf', 'performers', string);

  meta('purd', 'purchaseDate', string);

  meta('purl', 'podcastURL', string);

  meta('©swf', 'songwriter', string);

  meta('©too', 'encoder', string);

  meta('©wrt', 'composer', string);

  meta('covr', 'coverArt', function(field) {
    return this.metadata[field] = this.stream.readBuffer(this.len);
  });

  genres = ["Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B", "Rap", "Reggae", "Rock", "Techno", "Industrial", "Alternative", "Ska", "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical", "Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise", "AlternRock", "Bass", "Soul", "Punk", "Space", "Meditative", "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave", "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream", "Southern Rock", "Comedy", "Cult", "Gangsta", "Top 40", "Christian Rap", "Pop/Funk", "Jungle", "Native American", "Cabaret", "New Wave", "Psychadelic", "Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal", "Acid Punk", "Acid Jazz", "Polka", "Retro", "Musical", "Rock & Roll", "Hard Rock", "Folk", "Folk/Rock", "National Folk", "Swing", "Fast Fusion", "Bebob", "Latin", "Revival", "Celtic", "Bluegrass", "Avantgarde", "Gothic Rock", "Progressive Rock", "Psychedelic Rock", "Symphonic Rock", "Slow Rock", "Big Band", "Chorus", "Easy Listening", "Acoustic", "Humour", "Speech", "Chanson", "Opera", "Chamber Music", "Sonata", "Symphony", "Booty Bass", "Primus", "Porn Groove", "Satire", "Slow Jam", "Club", "Tango", "Samba", "Folklore", "Ballad", "Power Ballad", "Rhythmic Soul", "Freestyle", "Duet", "Punk Rock", "Drum Solo", "A Capella", "Euro-House", "Dance Hall"];

  meta('gnre', 'genre', function(field) {
    return this.metadata[field] = genres[this.stream.readUInt16() - 1];
  });

  meta('tmpo', 'tempo', function(field) {
    return this.metadata[field] = this.stream.readUInt16();
  });

  meta('rtng', 'rating', function(field) {
    var rating;
    rating = this.stream.readUInt8();
    return this.metadata[field] = rating === 2 ? 'Clean' : rating !== 0 ? 'Explicit' : 'None';
  });

  diskTrack = function(field) {
    this.stream.advance(2);
    this.metadata[field] = this.stream.readUInt16() + ' of ' + this.stream.readUInt16();
    return this.stream.advance(this.len - 6);
  };

  meta('disk', 'diskNumber', diskTrack);

  meta('trkn', 'trackNumber', diskTrack);

  bool = function(field) {
    return this.metadata[field] = this.stream.readUInt8() === 1;
  };

  meta('cpil', 'compilation', bool);

  meta('pcst', 'podcast', bool);

  meta('pgap', 'gapless', bool);

  return M4ADemuxer;

})(Demuxer);

module.exports = M4ADemuxer;


},{"../demuxer":15}],20:[function(require,module,exports){
var Demuxer, WAVEDemuxer,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

Demuxer = require('../demuxer');

WAVEDemuxer = (function(superClass) {
  var formats;

  extend(WAVEDemuxer, superClass);

  function WAVEDemuxer() {
    return WAVEDemuxer.__super__.constructor.apply(this, arguments);
  }

  Demuxer.register(WAVEDemuxer);

  WAVEDemuxer.probe = function(buffer) {
    return buffer.peekString(0, 4) === 'RIFF' && buffer.peekString(8, 4) === 'WAVE';
  };

  formats = {
    0x0001: 'lpcm',
    0x0003: 'lpcm',
    0x0006: 'alaw',
    0x0007: 'ulaw'
  };

  WAVEDemuxer.prototype.readChunk = function() {
    var buffer, bytes, encoding;
    if (!this.readStart && this.stream.available(12)) {
      if (this.stream.readString(4) !== 'RIFF') {
        return this.emit('error', 'Invalid WAV file.');
      }
      this.fileSize = this.stream.readUInt32(true);
      this.readStart = true;
      if (this.stream.readString(4) !== 'WAVE') {
        return this.emit('error', 'Invalid WAV file.');
      }
    }
    while (this.stream.available(1)) {
      if (!this.readHeaders && this.stream.available(8)) {
        this.type = this.stream.readString(4);
        this.len = this.stream.readUInt32(true);
      }
      switch (this.type) {
        case 'fmt ':
          encoding = this.stream.readUInt16(true);
          if (!(encoding in formats)) {
            return this.emit('error', 'Unsupported format in WAV file.');
          }
          this.format = {
            formatID: formats[encoding],
            floatingPoint: encoding === 0x0003,
            littleEndian: formats[encoding] === 'lpcm',
            channelsPerFrame: this.stream.readUInt16(true),
            sampleRate: this.stream.readUInt32(true),
            framesPerPacket: 1
          };
          this.stream.advance(4);
          this.stream.advance(2);
          this.format.bitsPerChannel = this.stream.readUInt16(true);
          this.format.bytesPerPacket = (this.format.bitsPerChannel / 8) * this.format.channelsPerFrame;
          this.emit('format', this.format);
          this.stream.advance(this.len - 16);
          break;
        case 'data':
          if (!this.sentDuration) {
            bytes = this.format.bitsPerChannel / 8;
            this.emit('duration', this.len / bytes / this.format.channelsPerFrame / this.format.sampleRate * 1000 | 0);
            this.sentDuration = true;
          }
          buffer = this.stream.readSingleBuffer(this.len);
          this.len -= buffer.length;
          this.readHeaders = this.len > 0;
          this.emit('data', buffer);
          break;
        default:
          if (!this.stream.available(this.len)) {
            return;
          }
          this.stream.advance(this.len);
      }
      if (this.type !== 'data') {
        this.readHeaders = false;
      }
    }
  };

  return WAVEDemuxer;

})(Demuxer);


},{"../demuxer":15}],21:[function(require,module,exports){
var AudioDevice, EventEmitter,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

EventEmitter = require('./core/events');

AudioDevice = (function(superClass) {
  var devices;

  extend(AudioDevice, superClass);

  function AudioDevice(sampleRate1, channels1) {
    this.sampleRate = sampleRate1;
    this.channels = channels1;
    this.updateTime = bind(this.updateTime, this);
    this.playing = false;
    this.currentTime = 0;
    this._lastTime = 0;
  }

  AudioDevice.prototype.start = function() {
    if (this.playing) {
      return;
    }
    this.playing = true;
    if (this.device == null) {
      this.device = AudioDevice.create(this.sampleRate, this.channels);
    }
    if (!this.device) {
      throw new Error("No supported audio device found.");
    }
    this._lastTime = this.device.getDeviceTime();
    this._timer = setInterval(this.updateTime, 200);
    return this.device.on('refill', this.refill = (function(_this) {
      return function(buffer) {
        return _this.emit('refill', buffer);
      };
    })(this));
  };

  AudioDevice.prototype.stop = function() {
    if (!this.playing) {
      return;
    }
    this.playing = false;
    this.device.off('refill', this.refill);
    return clearInterval(this._timer);
  };

  AudioDevice.prototype.destroy = function() {
    this.stop();
    return this.device.destroy();
  };

  AudioDevice.prototype.seek = function(currentTime) {
    this.currentTime = currentTime;
    if (this.playing) {
      this._lastTime = this.device.getDeviceTime();
    }
    return this.emit('timeUpdate', this.currentTime);
  };

  AudioDevice.prototype.updateTime = function() {
    var time;
    time = this.device.getDeviceTime();
    this.currentTime += (time - this._lastTime) / this.device.sampleRate * 1000 | 0;
    this._lastTime = time;
    return this.emit('timeUpdate', this.currentTime);
  };

  devices = [];

  AudioDevice.register = function(device) {
    return devices.push(device);
  };

  AudioDevice.create = function(sampleRate, channels) {
    var device, i, len;
    for (i = 0, len = devices.length; i < len; i++) {
      device = devices[i];
      if (device.supported) {
        return new device(sampleRate, channels);
      }
    }
    return null;
  };

  return AudioDevice;

})(EventEmitter);

module.exports = AudioDevice;


},{"./core/events":9}],22:[function(require,module,exports){
var AVBuffer, AudioDevice, EventEmitter, MozillaAudioDevice,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

EventEmitter = require('../core/events');

AudioDevice = require('../device');

AVBuffer = require('../core/buffer');

MozillaAudioDevice = (function(superClass) {
  var createTimer, destroyTimer;

  extend(MozillaAudioDevice, superClass);

  AudioDevice.register(MozillaAudioDevice);

  MozillaAudioDevice.supported = (typeof Audio !== "undefined" && Audio !== null) && 'mozWriteAudio' in new Audio;

  function MozillaAudioDevice(sampleRate, channels) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.refill = bind(this.refill, this);
    this.audio = new Audio;
    this.audio.mozSetup(this.channels, this.sampleRate);
    this.writePosition = 0;
    this.prebufferSize = this.sampleRate / 2;
    this.tail = null;
    this.timer = createTimer(this.refill, 100);
  }

  MozillaAudioDevice.prototype.refill = function() {
    var available, buffer, currentPosition, written;
    if (this.tail) {
      written = this.audio.mozWriteAudio(this.tail);
      this.writePosition += written;
      if (this.writePosition < this.tail.length) {
        this.tail = this.tail.subarray(written);
      } else {
        this.tail = null;
      }
    }
    currentPosition = this.audio.mozCurrentSampleOffset();
    available = currentPosition + this.prebufferSize - this.writePosition;
    if (available > 0) {
      buffer = new Float32Array(available);
      this.emit('refill', buffer);
      written = this.audio.mozWriteAudio(buffer);
      if (written < buffer.length) {
        this.tail = buffer.subarray(written);
      }
      this.writePosition += written;
    }
  };

  MozillaAudioDevice.prototype.destroy = function() {
    return destroyTimer(this.timer);
  };

  MozillaAudioDevice.prototype.getDeviceTime = function() {
    return this.audio.mozCurrentSampleOffset() / this.channels;
  };

  createTimer = function(fn, interval) {
    var url, worker;
    url = AVBuffer.makeBlobURL("setInterval(function() { postMessage('ping'); }, " + interval + ");");
    if (url == null) {
      return setInterval(fn, interval);
    }
    worker = new Worker(url);
    worker.onmessage = fn;
    worker.url = url;
    return worker;
  };

  destroyTimer = function(timer) {
    if (timer.terminate) {
      timer.terminate();
      return URL.revokeObjectURL(timer.url);
    } else {
      return clearInterval(timer);
    }
  };

  return MozillaAudioDevice;

})(EventEmitter);


},{"../core/buffer":7,"../core/events":9,"../device":21}],23:[function(require,module,exports){
/*
 * This resampler is from XAudioJS: https://github.com/grantgalitz/XAudioJS
 * Planned to be replaced with src.js, eventually: https://github.com/jussi-kalliokoski/src.js
 */

//JavaScript Audio Resampler (c) 2011 - Grant Galitz
function Resampler(fromSampleRate, toSampleRate, channels, outputBufferSize, noReturn) {
	this.fromSampleRate = fromSampleRate;
	this.toSampleRate = toSampleRate;
	this.channels = channels | 0;
	this.outputBufferSize = outputBufferSize;
	this.noReturn = !!noReturn;
	this.initialize();
}

Resampler.prototype.initialize = function () {
	//Perform some checks:
	if (this.fromSampleRate > 0 && this.toSampleRate > 0 && this.channels > 0) {
		if (this.fromSampleRate == this.toSampleRate) {
			//Setup a resampler bypass:
			this.resampler = this.bypassResampler;		//Resampler just returns what was passed through.
			this.ratioWeight = 1;
		}
		else {
			if (this.fromSampleRate < this.toSampleRate) {
				/*
					Use generic linear interpolation if upsampling,
					as linear interpolation produces a gradient that we want
					and works fine with two input sample points per output in this case.
				*/
				this.compileLinearInterpolationFunction();
				this.lastWeight = 1;
			}
			else {
				/*
					Custom resampler I wrote that doesn't skip samples
					like standard linear interpolation in high downsampling.
					This is more accurate than linear interpolation on downsampling.
				*/
				this.compileMultiTapFunction();
				this.tailExists = false;
				this.lastWeight = 0;
			}
			this.ratioWeight = this.fromSampleRate / this.toSampleRate;
			this.initializeBuffers();
		}
	}
	else {
		throw(new Error("Invalid settings specified for the resampler."));
	}
};

Resampler.prototype.compileLinearInterpolationFunction = function () {
	var toCompile = "var bufferLength = buffer.length;\
	var outLength = this.outputBufferSize;\
	if ((bufferLength % " + this.channels + ") == 0) {\
		if (bufferLength > 0) {\
			var ratioWeight = this.ratioWeight;\
			var weight = this.lastWeight;\
			var firstWeight = 0;\
			var secondWeight = 0;\
			var sourceOffset = 0;\
			var outputOffset = 0;\
			var outputBuffer = this.outputBuffer;\
			for (; weight < 1; weight += ratioWeight) {\
				secondWeight = weight % 1;\
				firstWeight = 1 - secondWeight;";
	for (var channel = 0; channel < this.channels; ++channel) {
		toCompile += "outputBuffer[outputOffset++] = (this.lastOutput[" + channel + "] * firstWeight) + (buffer[" + channel + "] * secondWeight);";
	}
	toCompile += "}\
			weight -= 1;\
			for (bufferLength -= " + this.channels + ", sourceOffset = Math.floor(weight) * " + this.channels + "; outputOffset < outLength && sourceOffset < bufferLength;) {\
				secondWeight = weight % 1;\
				firstWeight = 1 - secondWeight;";
	for (var channel = 0; channel < this.channels; ++channel) {
		toCompile += "outputBuffer[outputOffset++] = (buffer[sourceOffset" + ((channel > 0) ? (" + " + channel) : "") + "] * firstWeight) + (buffer[sourceOffset + " + (this.channels + channel) + "] * secondWeight);";
	}
	toCompile += "weight += ratioWeight;\
				sourceOffset = Math.floor(weight) * " + this.channels + ";\
			}";
	for (var channel = 0; channel < this.channels; ++channel) {
		toCompile += "this.lastOutput[" + channel + "] = buffer[sourceOffset++];";
	}
	toCompile += "this.lastWeight = weight % 1;\
			return this.bufferSlice(outputOffset);\
		}\
		else {\
			return (this.noReturn) ? 0 : [];\
		}\
	}\
	else {\
		throw(new Error(\"Buffer was of incorrect sample length.\"));\
	}";
	this.resampler = Function("buffer", toCompile);
};

Resampler.prototype.compileMultiTapFunction = function () {
	var toCompile = "var bufferLength = buffer.length;\
	var outLength = this.outputBufferSize;\
	if ((bufferLength % " + this.channels + ") == 0) {\
		if (bufferLength > 0) {\
			var ratioWeight = this.ratioWeight;\
			var weight = 0;";
	for (var channel = 0; channel < this.channels; ++channel) {
		toCompile += "var output" + channel + " = 0;"
	}
	toCompile += "var actualPosition = 0;\
			var amountToNext = 0;\
			var alreadyProcessedTail = !this.tailExists;\
			this.tailExists = false;\
			var outputBuffer = this.outputBuffer;\
			var outputOffset = 0;\
			var currentPosition = 0;\
			do {\
				if (alreadyProcessedTail) {\
					weight = ratioWeight;";
	for (channel = 0; channel < this.channels; ++channel) {
		toCompile += "output" + channel + " = 0;"
	}
	toCompile += "}\
				else {\
					weight = this.lastWeight;";
	for (channel = 0; channel < this.channels; ++channel) {
		toCompile += "output" + channel + " = this.lastOutput[" + channel + "];"
	}
	toCompile += "alreadyProcessedTail = true;\
				}\
				while (weight > 0 && actualPosition < bufferLength) {\
					amountToNext = 1 + actualPosition - currentPosition;\
					if (weight >= amountToNext) {";
	for (channel = 0; channel < this.channels; ++channel) {
		toCompile += "output" + channel + " += buffer[actualPosition++] * amountToNext;"
	}
	toCompile += "currentPosition = actualPosition;\
						weight -= amountToNext;\
					}\
					else {";
	for (channel = 0; channel < this.channels; ++channel) {
		toCompile += "output" + channel + " += buffer[actualPosition" + ((channel > 0) ? (" + " + channel) : "") + "] * weight;"
	}
	toCompile += "currentPosition += weight;\
						weight = 0;\
						break;\
					}\
				}\
				if (weight == 0) {";
	for (channel = 0; channel < this.channels; ++channel) {
		toCompile += "outputBuffer[outputOffset++] = output" + channel + " / ratioWeight;"
	}
	toCompile += "}\
				else {\
					this.lastWeight = weight;";
	for (channel = 0; channel < this.channels; ++channel) {
		toCompile += "this.lastOutput[" + channel + "] = output" + channel + ";"
	}
	toCompile += "this.tailExists = true;\
					break;\
				}\
			} while (actualPosition < bufferLength && outputOffset < outLength);\
			return this.bufferSlice(outputOffset);\
		}\
		else {\
			return (this.noReturn) ? 0 : [];\
		}\
	}\
	else {\
		throw(new Error(\"Buffer was of incorrect sample length.\"));\
	}";
	this.resampler = Function("buffer", toCompile);
};

Resampler.prototype.bypassResampler = function (buffer) {
	if (this.noReturn) {
		//Set the buffer passed as our own, as we don't need to resample it:
		this.outputBuffer = buffer;
		return buffer.length;
	}
	else {
		//Just return the buffer passsed:
		return buffer;
	}
};

Resampler.prototype.bufferSlice = function (sliceAmount) {
	if (this.noReturn) {
		//If we're going to access the properties directly from this object:
		return sliceAmount;
	}
	else {
		//Typed array and normal array buffer section referencing:
		try {
			return this.outputBuffer.subarray(0, sliceAmount);
		}
		catch (error) {
			try {
				//Regular array pass:
				this.outputBuffer.length = sliceAmount;
				return this.outputBuffer;
			}
			catch (error) {
				//Nightly Firefox 4 used to have the subarray function named as slice:
				return this.outputBuffer.slice(0, sliceAmount);
			}
		}
	}
};

Resampler.prototype.initializeBuffers = function () {
	//Initialize the internal buffer:
	try {
		this.outputBuffer = new Float32Array(this.outputBufferSize);
		this.lastOutput = new Float32Array(this.channels);
	}
	catch (error) {
		this.outputBuffer = [];
		this.lastOutput = [];
	}
};

module.exports = Resampler;

},{}],24:[function(require,module,exports){
(function (global){
var AudioDevice, EventEmitter, Resampler, WebAudioDevice,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

EventEmitter = require('../core/events');

AudioDevice = require('../device');

Resampler = require('./resampler');

WebAudioDevice = (function(superClass) {
  var AudioContext, createProcessor, sharedContext;

  extend(WebAudioDevice, superClass);

  AudioDevice.register(WebAudioDevice);

  AudioContext = global.AudioContext || global.webkitAudioContext;

  WebAudioDevice.supported = AudioContext && (typeof AudioContext.prototype[createProcessor = 'createScriptProcessor'] === 'function' || typeof AudioContext.prototype[createProcessor = 'createJavaScriptNode'] === 'function');

  sharedContext = null;

  function WebAudioDevice(sampleRate, channels1) {
    this.sampleRate = sampleRate;
    this.channels = channels1;
    this.refill = bind(this.refill, this);
    this.context = sharedContext != null ? sharedContext : sharedContext = new AudioContext;
    this.deviceSampleRate = this.context.sampleRate;
    this.bufferSize = Math.ceil(8192 / (this.deviceSampleRate / this.sampleRate) * this.channels);
    this.bufferSize += this.bufferSize % this.channels;
    if (this.deviceSampleRate !== this.sampleRate) {
      this.resampler = new Resampler(this.sampleRate, this.deviceSampleRate, this.channels, 8192 * this.channels);
    }
    this.node = this.context[createProcessor](8192, this.channels, this.channels);
    this.node.onaudioprocess = this.refill;
    this.node.connect(this.context.destination);
  }

  WebAudioDevice.prototype.refill = function(event) {
    var channelCount, channels, data, i, j, k, l, n, outputBuffer, ref, ref1, ref2;
    outputBuffer = event.outputBuffer;
    channelCount = outputBuffer.numberOfChannels;
    channels = new Array(channelCount);
    for (i = j = 0, ref = channelCount; j < ref; i = j += 1) {
      channels[i] = outputBuffer.getChannelData(i);
    }
    data = new Float32Array(this.bufferSize);
    this.emit('refill', data);
    if (this.resampler) {
      data = this.resampler.resampler(data);
    }
    for (i = k = 0, ref1 = outputBuffer.length; k < ref1; i = k += 1) {
      for (n = l = 0, ref2 = channelCount; l < ref2; n = l += 1) {
        channels[n][i] = data[i * channelCount + n];
      }
    }
  };

  WebAudioDevice.prototype.destroy = function() {
    return this.node.disconnect(0);
  };

  WebAudioDevice.prototype.getDeviceTime = function() {
    return this.context.currentTime * this.sampleRate;
  };

  return WebAudioDevice;

})(EventEmitter);


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../core/events":9,"../device":21,"./resampler":23}],25:[function(require,module,exports){
var Filter;

Filter = (function() {
  function Filter(context, key) {
    if (context && key) {
      Object.defineProperty(this, 'value', {
        get: function() {
          return context[key];
        }
      });
    }
  }

  Filter.prototype.process = function(buffer) {};

  return Filter;

})();

module.exports = Filter;


},{}],26:[function(require,module,exports){
var BalanceFilter, Filter,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

Filter = require('../filter');

BalanceFilter = (function(superClass) {
  extend(BalanceFilter, superClass);

  function BalanceFilter() {
    return BalanceFilter.__super__.constructor.apply(this, arguments);
  }

  BalanceFilter.prototype.process = function(buffer) {
    var i, j, pan, ref;
    if (this.value === 0) {
      return;
    }
    pan = Math.max(-50, Math.min(50, this.value));
    for (i = j = 0, ref = buffer.length; j < ref; i = j += 2) {
      buffer[i] *= Math.min(1, (50 - pan) / 50);
      buffer[i + 1] *= Math.min(1, (50 + pan) / 50);
    }
  };

  return BalanceFilter;

})(Filter);

module.exports = BalanceFilter;


},{"../filter":25}],27:[function(require,module,exports){
var Filter, VolumeFilter,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

Filter = require('../filter');

VolumeFilter = (function(superClass) {
  extend(VolumeFilter, superClass);

  function VolumeFilter() {
    return VolumeFilter.__super__.constructor.apply(this, arguments);
  }

  VolumeFilter.prototype.process = function(buffer) {
    var i, j, ref, vol;
    if (this.value >= 100) {
      return;
    }
    vol = Math.max(0, Math.min(100, this.value)) / 100;
    for (i = j = 0, ref = buffer.length; j < ref; i = j += 1) {
      buffer[i] *= vol;
    }
  };

  return VolumeFilter;

})(Filter);

module.exports = VolumeFilter;


},{"../filter":25}],28:[function(require,module,exports){
var Asset, AudioDevice, BalanceFilter, EventEmitter, Player, Queue, VolumeFilter,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

EventEmitter = require('./core/events');

Asset = require('./asset');

VolumeFilter = require('./filters/volume');

BalanceFilter = require('./filters/balance');

Queue = require('./queue');

AudioDevice = require('./device');

Player = (function(superClass) {
  extend(Player, superClass);

  function Player(asset) {
    this.asset = asset;
    this.startPlaying = bind(this.startPlaying, this);
    this.playing = false;
    this.buffered = 0;
    this.currentTime = 0;
    this.duration = 0;
    this.volume = 100;
    this.pan = 0;
    this.metadata = {};
    this.filters = [new VolumeFilter(this, 'volume'), new BalanceFilter(this, 'pan')];
    this.asset.on('buffer', (function(_this) {
      return function(buffered) {
        _this.buffered = buffered;
        return _this.emit('buffer', _this.buffered);
      };
    })(this));
    this.asset.on('decodeStart', (function(_this) {
      return function() {
        _this.queue = new Queue(_this.asset);
        return _this.queue.once('ready', _this.startPlaying);
      };
    })(this));
    this.asset.on('format', (function(_this) {
      return function(format) {
        _this.format = format;
        return _this.emit('format', _this.format);
      };
    })(this));
    this.asset.on('metadata', (function(_this) {
      return function(metadata) {
        _this.metadata = metadata;
        return _this.emit('metadata', _this.metadata);
      };
    })(this));
    this.asset.on('duration', (function(_this) {
      return function(duration) {
        _this.duration = duration;
        return _this.emit('duration', _this.duration);
      };
    })(this));
    this.asset.on('error', (function(_this) {
      return function(error) {
        return _this.emit('error', error);
      };
    })(this));
  }

  Player.fromURL = function(url) {
    return new Player(Asset.fromURL(url));
  };

  Player.fromFile = function(file) {
    return new Player(Asset.fromFile(file));
  };

  Player.fromBuffer = function(buffer) {
    return new Player(Asset.fromBuffer(buffer));
  };

  Player.prototype.preload = function() {
    if (!this.asset) {
      return;
    }
    this.startedPreloading = true;
    return this.asset.start(false);
  };

  Player.prototype.play = function() {
    var ref;
    if (this.playing) {
      return;
    }
    if (!this.startedPreloading) {
      this.preload();
    }
    this.playing = true;
    return (ref = this.device) != null ? ref.start() : void 0;
  };

  Player.prototype.pause = function() {
    var ref;
    if (!this.playing) {
      return;
    }
    this.playing = false;
    return (ref = this.device) != null ? ref.stop() : void 0;
  };

  Player.prototype.togglePlayback = function() {
    if (this.playing) {
      return this.pause();
    } else {
      return this.play();
    }
  };

  Player.prototype.stop = function() {
    var ref;
    this.pause();
    this.asset.stop();
    return (ref = this.device) != null ? ref.destroy() : void 0;
  };

  Player.prototype.seek = function(timestamp) {
    var ref;
    if ((ref = this.device) != null) {
      ref.stop();
    }
    this.queue.once('ready', (function(_this) {
      return function() {
        var ref1, ref2;
        if ((ref1 = _this.device) != null) {
          ref1.seek(_this.currentTime);
        }
        if (_this.playing) {
          return (ref2 = _this.device) != null ? ref2.start() : void 0;
        }
      };
    })(this));
    timestamp = (timestamp / 1000) * this.format.sampleRate;
    timestamp = this.asset.decoder.seek(timestamp);
    this.currentTime = timestamp / this.format.sampleRate * 1000 | 0;
    this.queue.reset();
    return this.currentTime;
  };

  Player.prototype.startPlaying = function() {
    var frame, frameOffset;
    frame = this.queue.read();
    frameOffset = 0;
    this.device = new AudioDevice(this.format.sampleRate, this.format.channelsPerFrame);
    this.device.on('timeUpdate', (function(_this) {
      return function(currentTime) {
        _this.currentTime = currentTime;
        return _this.emit('progress', _this.currentTime);
      };
    })(this));
    this.refill = (function(_this) {
      return function(buffer) {
        var bufferOffset, filter, i, j, k, len, max, ref, ref1;
        if (!_this.playing) {
          return;
        }
        if (!frame) {
          frame = _this.queue.read();
          frameOffset = 0;
        }
        bufferOffset = 0;
        while (frame && bufferOffset < buffer.length) {
          max = Math.min(frame.length - frameOffset, buffer.length - bufferOffset);
          for (i = j = 0, ref = max; j < ref; i = j += 1) {
            buffer[bufferOffset++] = frame[frameOffset++];
          }
          if (frameOffset === frame.length) {
            frame = _this.queue.read();
            frameOffset = 0;
          }
        }
        ref1 = _this.filters;
        for (k = 0, len = ref1.length; k < len; k++) {
          filter = ref1[k];
          filter.process(buffer);
        }
        if (!frame) {
          if (_this.queue.ended) {
            _this.currentTime = _this.duration;
            _this.emit('progress', _this.currentTime);
            _this.emit('end');
            _this.stop();
          } else {
            _this.device.stop();
          }
        }
      };
    })(this);
    this.device.on('refill', this.refill);
    if (this.playing) {
      this.device.start();
    }
    return this.emit('ready');
  };

  return Player;

})(EventEmitter);

module.exports = Player;


},{"./asset":2,"./core/events":9,"./device":21,"./filters/balance":26,"./filters/volume":27,"./queue":29}],29:[function(require,module,exports){
var EventEmitter, Queue,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

EventEmitter = require('./core/events');

Queue = (function(superClass) {
  extend(Queue, superClass);

  function Queue(asset) {
    this.asset = asset;
    this.write = bind(this.write, this);
    this.readyMark = 64;
    this.finished = false;
    this.buffering = true;
    this.ended = false;
    this.buffers = [];
    this.asset.on('data', this.write);
    this.asset.on('end', (function(_this) {
      return function() {
        return _this.ended = true;
      };
    })(this));
    this.asset.decodePacket();
  }

  Queue.prototype.write = function(buffer) {
    if (buffer) {
      this.buffers.push(buffer);
    }
    if (this.buffering) {
      if (this.buffers.length >= this.readyMark || this.ended) {
        this.buffering = false;
        return this.emit('ready');
      } else {
        return this.asset.decodePacket();
      }
    }
  };

  Queue.prototype.read = function() {
    if (this.buffers.length === 0) {
      return null;
    }
    this.asset.decodePacket();
    return this.buffers.shift();
  };

  Queue.prototype.reset = function() {
    this.buffers.length = 0;
    this.buffering = true;
    return this.asset.decodePacket();
  };

  return Queue;

})(EventEmitter);

module.exports = Queue;


},{"./core/events":9}],30:[function(require,module,exports){
var AVBuffer, EventEmitter, FileSource,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

EventEmitter = require('../../core/events');

AVBuffer = require('../../core/buffer');

FileSource = (function(superClass) {
  extend(FileSource, superClass);

  function FileSource(file) {
    this.file = file;
    if (typeof FileReader === "undefined" || FileReader === null) {
      return this.emit('error', 'This browser does not have FileReader support.');
    }
    this.offset = 0;
    this.length = this.file.size;
    this.chunkSize = 1 << 20;
    this.file[this.slice = 'slice'] || this.file[this.slice = 'webkitSlice'] || this.file[this.slice = 'mozSlice'];
  }

  FileSource.prototype.start = function() {
    if (this.reader) {
      if (!this.active) {
        return this.loop();
      }
    }
    this.reader = new FileReader;
    this.active = true;
    this.reader.onload = (function(_this) {
      return function(e) {
        var buf;
        buf = new AVBuffer(new Uint8Array(e.target.result));
        _this.offset += buf.length;
        _this.emit('data', buf);
        _this.active = false;
        if (_this.offset < _this.length) {
          return _this.loop();
        }
      };
    })(this);
    this.reader.onloadend = (function(_this) {
      return function() {
        if (_this.offset === _this.length) {
          _this.emit('end');
          return _this.reader = null;
        }
      };
    })(this);
    this.reader.onerror = (function(_this) {
      return function(e) {
        return _this.emit('error', e);
      };
    })(this);
    this.reader.onprogress = (function(_this) {
      return function(e) {
        return _this.emit('progress', (_this.offset + e.loaded) / _this.length * 100);
      };
    })(this);
    return this.loop();
  };

  FileSource.prototype.loop = function() {
    var blob, endPos;
    this.active = true;
    endPos = Math.min(this.offset + this.chunkSize, this.length);
    blob = this.file[this.slice](this.offset, endPos);
    return this.reader.readAsArrayBuffer(blob);
  };

  FileSource.prototype.pause = function() {
    var ref;
    this.active = false;
    try {
      return (ref = this.reader) != null ? ref.abort() : void 0;
    } catch (_error) {}
  };

  FileSource.prototype.reset = function() {
    this.pause();
    return this.offset = 0;
  };

  return FileSource;

})(EventEmitter);

module.exports = FileSource;


},{"../../core/buffer":7,"../../core/events":9}],31:[function(require,module,exports){
var AVBuffer, EventEmitter, HTTPSource,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

EventEmitter = require('../../core/events');

AVBuffer = require('../../core/buffer');

HTTPSource = (function(superClass) {
  extend(HTTPSource, superClass);

  function HTTPSource(url) {
    this.url = url;
    this.chunkSize = 1 << 20;
    this.inflight = false;
    this.reset();
  }

  HTTPSource.prototype.start = function() {
    if (this.length) {
      if (!this.inflight) {
        return this.loop();
      }
    }
    this.inflight = true;
    this.xhr = new XMLHttpRequest();
    this.xhr.onload = (function(_this) {
      return function(event) {
        _this.length = parseInt(_this.xhr.getResponseHeader("Content-Length"));
        _this.inflight = false;
        return _this.loop();
      };
    })(this);
    this.xhr.onerror = (function(_this) {
      return function(err) {
        _this.pause();
        return _this.emit('error', err);
      };
    })(this);
    this.xhr.onabort = (function(_this) {
      return function(event) {
        return _this.inflight = false;
      };
    })(this);
    this.xhr.open("HEAD", this.url, true);
    return this.xhr.send(null);
  };

  HTTPSource.prototype.loop = function() {
    var endPos;
    if (this.inflight || !this.length) {
      return this.emit('error', 'Something is wrong in HTTPSource.loop');
    }
    this.inflight = true;
    this.xhr = new XMLHttpRequest();
    this.xhr.onload = (function(_this) {
      return function(event) {
        var buf, buffer, i, j, ref, txt;
        if (_this.xhr.response) {
          buf = new Uint8Array(_this.xhr.response);
        } else {
          txt = _this.xhr.responseText;
          buf = new Uint8Array(txt.length);
          for (i = j = 0, ref = txt.length; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
            buf[i] = txt.charCodeAt(i) & 0xff;
          }
        }
        buffer = new AVBuffer(buf);
        _this.offset += buffer.length;
        _this.emit('data', buffer);
        if (_this.offset >= _this.length) {
          _this.emit('end');
        }
        _this.inflight = false;
        if (!(_this.offset >= _this.length)) {
          return _this.loop();
        }
      };
    })(this);
    this.xhr.onprogress = (function(_this) {
      return function(event) {
        return _this.emit('progress', (_this.offset + event.loaded) / _this.length * 100);
      };
    })(this);
    this.xhr.onerror = (function(_this) {
      return function(err) {
        _this.emit('error', err);
        return _this.pause();
      };
    })(this);
    this.xhr.onabort = (function(_this) {
      return function(event) {
        return _this.inflight = false;
      };
    })(this);
    this.xhr.open("GET", this.url, true);
    this.xhr.responseType = "arraybuffer";
    endPos = Math.min(this.offset + this.chunkSize, this.length);
    this.xhr.setRequestHeader("If-None-Match", "webkit-no-cache");
    this.xhr.setRequestHeader("Range", "bytes=" + this.offset + "-" + endPos);
    this.xhr.overrideMimeType('text/plain; charset=x-user-defined');
    return this.xhr.send(null);
  };

  HTTPSource.prototype.pause = function() {
    var ref;
    this.inflight = false;
    return (ref = this.xhr) != null ? ref.abort() : void 0;
  };

  HTTPSource.prototype.reset = function() {
    this.pause();
    return this.offset = 0;
  };

  return HTTPSource;

})(EventEmitter);

module.exports = HTTPSource;


},{"../../core/buffer":7,"../../core/events":9}],32:[function(require,module,exports){
(function (global){
var AVBuffer, BufferList, BufferSource, EventEmitter,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

EventEmitter = require('../core/events');

BufferList = require('../core/bufferlist');

AVBuffer = require('../core/buffer');

BufferSource = (function(superClass) {
  var clearImmediate, setImmediate;

  extend(BufferSource, superClass);

  function BufferSource(input) {
    this.loop = bind(this.loop, this);
    if (input instanceof BufferList) {
      this.list = input;
    } else {
      this.list = new BufferList;
      this.list.append(new AVBuffer(input));
    }
    this.paused = true;
  }

  setImmediate = global.setImmediate || function(fn) {
    return global.setTimeout(fn, 0);
  };

  clearImmediate = global.clearImmediate || function(timer) {
    return global.clearTimeout(timer);
  };

  BufferSource.prototype.start = function() {
    this.paused = false;
    return this._timer = setImmediate(this.loop);
  };

  BufferSource.prototype.loop = function() {
    this.emit('progress', (this.list.numBuffers - this.list.availableBuffers + 1) / this.list.numBuffers * 100 | 0);
    this.emit('data', this.list.first);
    if (this.list.advance()) {
      return setImmediate(this.loop);
    } else {
      return this.emit('end');
    }
  };

  BufferSource.prototype.pause = function() {
    clearImmediate(this._timer);
    return this.paused = true;
  };

  BufferSource.prototype.reset = function() {
    this.pause();
    return this.list.rewind();
  };

  return BufferSource;

})(EventEmitter);

module.exports = BufferSource;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../core/buffer":7,"../core/bufferlist":8,"../core/events":9}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9ob21lL3phbnRvci9wcm9qZWN0cy9hdXJvcmEuanMvYnJvd3Nlci5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9hc3NldC5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9hdXJvcmEuY29mZmVlIiwiL2hvbWUvemFudG9yL3Byb2plY3RzL2F1cm9yYS5qcy9zcmMvYXVyb3JhX2Jhc2UuY29mZmVlIiwiL2hvbWUvemFudG9yL3Byb2plY3RzL2F1cm9yYS5qcy9zcmMvY29yZS9iYXNlLmNvZmZlZSIsIi9ob21lL3phbnRvci9wcm9qZWN0cy9hdXJvcmEuanMvc3JjL2NvcmUvYml0c3RyZWFtLmNvZmZlZSIsIi9ob21lL3phbnRvci9wcm9qZWN0cy9hdXJvcmEuanMvc3JjL2NvcmUvYnVmZmVyLmNvZmZlZSIsIi9ob21lL3phbnRvci9wcm9qZWN0cy9hdXJvcmEuanMvc3JjL2NvcmUvYnVmZmVybGlzdC5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9jb3JlL2V2ZW50cy5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9jb3JlL3N0cmVhbS5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9jb3JlL3VuZGVyZmxvdy5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9kZWNvZGVyLmNvZmZlZSIsIi9ob21lL3phbnRvci9wcm9qZWN0cy9hdXJvcmEuanMvc3JjL2RlY29kZXJzL2xwY20uY29mZmVlIiwiL2hvbWUvemFudG9yL3Byb2plY3RzL2F1cm9yYS5qcy9zcmMvZGVjb2RlcnMveGxhdy5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9kZW11eGVyLmNvZmZlZSIsIi9ob21lL3phbnRvci9wcm9qZWN0cy9hdXJvcmEuanMvc3JjL2RlbXV4ZXJzL2FpZmYuY29mZmVlIiwiL2hvbWUvemFudG9yL3Byb2plY3RzL2F1cm9yYS5qcy9zcmMvZGVtdXhlcnMvYXUuY29mZmVlIiwiL2hvbWUvemFudG9yL3Byb2plY3RzL2F1cm9yYS5qcy9zcmMvZGVtdXhlcnMvY2FmLmNvZmZlZSIsIi9ob21lL3phbnRvci9wcm9qZWN0cy9hdXJvcmEuanMvc3JjL2RlbXV4ZXJzL200YS5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9kZW11eGVycy93YXZlLmNvZmZlZSIsIi9ob21lL3phbnRvci9wcm9qZWN0cy9hdXJvcmEuanMvc3JjL2RldmljZS5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9kZXZpY2VzL21vemlsbGEuY29mZmVlIiwic3JjL2RldmljZXMvcmVzYW1wbGVyLmpzIiwiL2hvbWUvemFudG9yL3Byb2plY3RzL2F1cm9yYS5qcy9zcmMvZGV2aWNlcy93ZWJhdWRpby5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9maWx0ZXIuY29mZmVlIiwiL2hvbWUvemFudG9yL3Byb2plY3RzL2F1cm9yYS5qcy9zcmMvZmlsdGVycy9iYWxhbmNlLmNvZmZlZSIsIi9ob21lL3phbnRvci9wcm9qZWN0cy9hdXJvcmEuanMvc3JjL2ZpbHRlcnMvdm9sdW1lLmNvZmZlZSIsIi9ob21lL3phbnRvci9wcm9qZWN0cy9hdXJvcmEuanMvc3JjL3BsYXllci5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9xdWV1ZS5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9zb3VyY2VzL2Jyb3dzZXIvZmlsZS5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9zb3VyY2VzL2Jyb3dzZXIvaHR0cC5jb2ZmZWUiLCIvaG9tZS96YW50b3IvcHJvamVjdHMvYXVyb3JhLmpzL3NyYy9zb3VyY2VzL2J1ZmZlci5jb2ZmZWUiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQSxJQUFBOztBQUFBO0FBQUEsS0FBQSxVQUFBOztFQUNFLE9BQVEsQ0FBQSxHQUFBLENBQVIsR0FBZTtBQURqQjs7QUFHQSxPQUFBLENBQVEsd0JBQVI7O0FBQ0EsT0FBQSxDQUFRLHVCQUFSOzs7O0FDSUEsSUFBQSwyRUFBQTtFQUFBOzs7O0FBQUEsWUFBQSxHQUFlLE9BQUEsQ0FBUSxlQUFSOztBQUNmLFVBQUEsR0FBZSxPQUFBLENBQVEscUJBQVI7O0FBQ2YsVUFBQSxHQUFlLE9BQUEsQ0FBUSxxQkFBUjs7QUFDZixZQUFBLEdBQWUsT0FBQSxDQUFRLGtCQUFSOztBQUNmLE9BQUEsR0FBZSxPQUFBLENBQVEsV0FBUjs7QUFDZixPQUFBLEdBQWUsT0FBQSxDQUFRLFdBQVI7O0FBRVQ7OztFQUNXLGVBQUMsTUFBRDtJQUFDLElBQUMsQ0FBQSxTQUFEOzs7O0lBQ1YsSUFBQyxDQUFBLFFBQUQsR0FBWTtJQUNaLElBQUMsQ0FBQSxRQUFELEdBQVk7SUFDWixJQUFDLENBQUEsTUFBRCxHQUFVO0lBQ1YsSUFBQyxDQUFBLFFBQUQsR0FBWTtJQUNaLElBQUMsQ0FBQSxNQUFELEdBQVU7SUFDVixJQUFDLENBQUEsT0FBRCxHQUFXO0lBQ1gsSUFBQyxDQUFBLE9BQUQsR0FBVztJQUVYLElBQUMsQ0FBQSxNQUFNLENBQUMsSUFBUixDQUFhLE1BQWIsRUFBcUIsSUFBQyxDQUFBLEtBQXRCO0lBQ0EsSUFBQyxDQUFBLE1BQU0sQ0FBQyxFQUFSLENBQVcsT0FBWCxFQUFvQixDQUFBLFNBQUEsS0FBQTthQUFBLFNBQUMsR0FBRDtRQUNoQixLQUFDLENBQUEsSUFBRCxDQUFNLE9BQU4sRUFBZSxHQUFmO2VBQ0EsS0FBQyxDQUFBLElBQUQsQ0FBQTtNQUZn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LElBQUMsQ0FBQSxJQUFELENBQU0sS0FBTixFQUhKOztFQUhFOzt5QkFRTixLQUFBLEdBQU8sU0FBQTtJQUNILGNBQUEsQ0FBZSxJQUFDLENBQUEsTUFBaEI7V0FDQSxJQUFDLENBQUEsTUFBRCxHQUFVO0VBRlA7O3lCQUlQLEtBQUEsR0FBTyxTQUFBO0lBQ0gsSUFBQyxDQUFBLEtBQUQsQ0FBQTtXQUNBLElBQUMsQ0FBQSxJQUFJLENBQUMsTUFBTixDQUFBO0VBRkc7Ozs7R0FsQ2dCOztBQXNDM0IsTUFBTSxDQUFDLE9BQVAsR0FBaUIiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiZm9yIGtleSwgdmFsIG9mIHJlcXVpcmUgJy4vc3JjL2F1cm9yYSdcbiAgZXhwb3J0c1trZXldID0gdmFsXG4gIFxucmVxdWlyZSAnLi9zcmMvZGV2aWNlcy93ZWJhdWRpbydcbnJlcXVpcmUgJy4vc3JjL2RldmljZXMvbW96aWxsYSdcbiIsIiNcbiMgVGhlIEFzc2V0IGNsYXNzIGlzIHJlc3BvbnNpYmxlIGZvciBtYW5hZ2luZyBhbGwgYXNwZWN0cyBvZiB0aGUgXG4jIGRlY29kaW5nIHBpcGVsaW5lIGZyb20gc291cmNlIHRvIGRlY29kZXIuICBZb3UgY2FuIHVzZSB0aGUgQXNzZXRcbiMgY2xhc3MgdG8gaW5zcGVjdCBpbmZvcm1hdGlvbiBhYm91dCBhbiBhdWRpbyBmaWxlLCBzdWNoIGFzIGl0cyBcbiMgZm9ybWF0LCBtZXRhZGF0YSwgYW5kIGR1cmF0aW9uLCBhcyB3ZWxsIGFzIGFjdHVhbGx5IGRlY29kZSB0aGVcbiMgZmlsZSB0byBsaW5lYXIgUENNIHJhdyBhdWRpbyBkYXRhLlxuI1xuXG5FdmVudEVtaXR0ZXIgPSByZXF1aXJlICcuL2NvcmUvZXZlbnRzJ1xuSFRUUFNvdXJjZSAgID0gcmVxdWlyZSAnLi9zb3VyY2VzL25vZGUvaHR0cCdcbkZpbGVTb3VyY2UgICA9IHJlcXVpcmUgJy4vc291cmNlcy9ub2RlL2ZpbGUnXG5CdWZmZXJTb3VyY2UgPSByZXF1aXJlICcuL3NvdXJjZXMvYnVmZmVyJ1xuRGVtdXhlciAgICAgID0gcmVxdWlyZSAnLi9kZW11eGVyJ1xuRGVjb2RlciAgICAgID0gcmVxdWlyZSAnLi9kZWNvZGVyJ1xuXG5jbGFzcyBBc3NldCBleHRlbmRzIEV2ZW50RW1pdHRlclxuICAgIGNvbnN0cnVjdG9yOiAoQHNvdXJjZSkgLT5cbiAgICAgICAgQGJ1ZmZlcmVkID0gMFxuICAgICAgICBAZHVyYXRpb24gPSBudWxsXG4gICAgICAgIEBmb3JtYXQgPSBudWxsXG4gICAgICAgIEBtZXRhZGF0YSA9IG51bGxcbiAgICAgICAgQGFjdGl2ZSA9IGZhbHNlXG4gICAgICAgIEBkZW11eGVyID0gbnVsbFxuICAgICAgICBAZGVjb2RlciA9IG51bGxcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgQHNvdXJjZS5vbmNlICdkYXRhJywgQHByb2JlXG4gICAgICAgIEBzb3VyY2Uub24gJ2Vycm9yJywgKGVycikgPT5cbiAgICAgICAgICAgIEBlbWl0ICdlcnJvcicsIGVyclxuICAgICAgICAgICAgQHN0b3AoKVxuICAgICAgICAgICAgXG4gICAgICAgIEBzb3VyY2Uub24gJ3Byb2dyZXNzJywgKEBidWZmZXJlZCkgPT5cbiAgICAgICAgICAgIEBlbWl0ICdidWZmZXInLCBAYnVmZmVyZWRcbiAgICAgICAgICAgIFxuICAgIEBmcm9tVVJMOiAodXJsKSAtPlxuICAgICAgICByZXR1cm4gbmV3IEFzc2V0IG5ldyBIVFRQU291cmNlKHVybClcblxuICAgIEBmcm9tRmlsZTogKGZpbGUpIC0+XG4gICAgICAgIHJldHVybiBuZXcgQXNzZXQgbmV3IEZpbGVTb3VyY2UoZmlsZSlcbiAgICAgICAgXG4gICAgQGZyb21CdWZmZXI6IChidWZmZXIpIC0+XG4gICAgICAgIHJldHVybiBuZXcgQXNzZXQgbmV3IEJ1ZmZlclNvdXJjZShidWZmZXIpXG4gICAgICAgIFxuICAgIHN0YXJ0OiAoZGVjb2RlKSAtPlxuICAgICAgICByZXR1cm4gaWYgQGFjdGl2ZVxuICAgICAgICBcbiAgICAgICAgQHNob3VsZERlY29kZSA9IGRlY29kZSBpZiBkZWNvZGU/XG4gICAgICAgIEBzaG91bGREZWNvZGUgPz0gdHJ1ZVxuICAgICAgICBcbiAgICAgICAgQGFjdGl2ZSA9IHRydWVcbiAgICAgICAgQHNvdXJjZS5zdGFydCgpXG4gICAgICAgIFxuICAgICAgICBpZiBAZGVjb2RlciBhbmQgQHNob3VsZERlY29kZVxuICAgICAgICAgICAgQF9kZWNvZGUoKVxuICAgICAgICBcbiAgICBzdG9wOiAtPlxuICAgICAgICByZXR1cm4gdW5sZXNzIEBhY3RpdmVcbiAgICAgICAgXG4gICAgICAgIEBhY3RpdmUgPSBmYWxzZVxuICAgICAgICBAc291cmNlLnBhdXNlKClcbiAgICAgICAgXG4gICAgZ2V0OiAoZXZlbnQsIGNhbGxiYWNrKSAtPlxuICAgICAgICByZXR1cm4gdW5sZXNzIGV2ZW50IGluIFsnZm9ybWF0JywgJ2R1cmF0aW9uJywgJ21ldGFkYXRhJ11cbiAgICAgICAgXG4gICAgICAgIGlmIHRoaXNbZXZlbnRdP1xuICAgICAgICAgICAgY2FsbGJhY2sodGhpc1tldmVudF0pXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIEBvbmNlIGV2ZW50LCAodmFsdWUpID0+XG4gICAgICAgICAgICAgICAgQHN0b3AoKVxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKHZhbHVlKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBAc3RhcnQoKVxuICAgICAgICAgICAgXG4gICAgZGVjb2RlUGFja2V0OiAtPlxuICAgICAgICBAZGVjb2Rlci5kZWNvZGUoKVxuICAgICAgICBcbiAgICBkZWNvZGVUb0J1ZmZlcjogKGNhbGxiYWNrKSAtPlxuICAgICAgICBsZW5ndGggPSAwXG4gICAgICAgIGNodW5rcyA9IFtdXG4gICAgICAgIEBvbiAnZGF0YScsIGRhdGFIYW5kbGVyID0gKGNodW5rKSAtPlxuICAgICAgICAgICAgbGVuZ3RoICs9IGNodW5rLmxlbmd0aFxuICAgICAgICAgICAgY2h1bmtzLnB1c2ggY2h1bmtcbiAgICAgICAgICAgIFxuICAgICAgICBAb25jZSAnZW5kJywgLT5cbiAgICAgICAgICAgIGJ1ZiA9IG5ldyBGbG9hdDMyQXJyYXkobGVuZ3RoKVxuICAgICAgICAgICAgb2Zmc2V0ID0gMFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IgY2h1bmsgaW4gY2h1bmtzXG4gICAgICAgICAgICAgICAgYnVmLnNldChjaHVuaywgb2Zmc2V0KVxuICAgICAgICAgICAgICAgIG9mZnNldCArPSBjaHVuay5sZW5ndGhcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIEBvZmYgJ2RhdGEnLCBkYXRhSGFuZGxlclxuICAgICAgICAgICAgY2FsbGJhY2soYnVmKVxuICAgICAgICAgICAgXG4gICAgICAgIEBzdGFydCgpXG4gICAgXG4gICAgcHJvYmU6IChjaHVuaykgPT5cbiAgICAgICAgcmV0dXJuIHVubGVzcyBAYWN0aXZlXG4gICAgICAgIFxuICAgICAgICBkZW11eGVyID0gRGVtdXhlci5maW5kKGNodW5rKVxuICAgICAgICBpZiBub3QgZGVtdXhlclxuICAgICAgICAgICAgcmV0dXJuIEBlbWl0ICdlcnJvcicsICdBIGRlbXV4ZXIgZm9yIHRoaXMgY29udGFpbmVyIHdhcyBub3QgZm91bmQuJ1xuICAgICAgICAgICAgXG4gICAgICAgIEBkZW11eGVyID0gbmV3IGRlbXV4ZXIoQHNvdXJjZSwgY2h1bmspXG4gICAgICAgIEBkZW11eGVyLm9uICdmb3JtYXQnLCBAZmluZERlY29kZXJcbiAgICAgICAgXG4gICAgICAgIEBkZW11eGVyLm9uICdkdXJhdGlvbicsIChAZHVyYXRpb24pID0+XG4gICAgICAgICAgICBAZW1pdCAnZHVyYXRpb24nLCBAZHVyYXRpb25cbiAgICAgICAgICAgIFxuICAgICAgICBAZGVtdXhlci5vbiAnbWV0YWRhdGEnLCAoQG1ldGFkYXRhKSA9PlxuICAgICAgICAgICAgQGVtaXQgJ21ldGFkYXRhJywgQG1ldGFkYXRhXG4gICAgICAgICAgICBcbiAgICAgICAgQGRlbXV4ZXIub24gJ2Vycm9yJywgKGVycikgPT5cbiAgICAgICAgICAgIEBlbWl0ICdlcnJvcicsIGVyclxuICAgICAgICAgICAgQHN0b3AoKVxuXG4gICAgZmluZERlY29kZXI6IChAZm9ybWF0KSA9PlxuICAgICAgICByZXR1cm4gdW5sZXNzIEBhY3RpdmVcbiAgICAgICAgXG4gICAgICAgIEBlbWl0ICdmb3JtYXQnLCBAZm9ybWF0XG4gICAgICAgIFxuICAgICAgICBkZWNvZGVyID0gRGVjb2Rlci5maW5kKEBmb3JtYXQuZm9ybWF0SUQpXG4gICAgICAgIGlmIG5vdCBkZWNvZGVyXG4gICAgICAgICAgICByZXR1cm4gQGVtaXQgJ2Vycm9yJywgXCJBIGRlY29kZXIgZm9yICN7QGZvcm1hdC5mb3JtYXRJRH0gd2FzIG5vdCBmb3VuZC5cIlxuXG4gICAgICAgIEBkZWNvZGVyID0gbmV3IGRlY29kZXIoQGRlbXV4ZXIsIEBmb3JtYXQpXG4gICAgICAgIFxuICAgICAgICBpZiBAZm9ybWF0LmZsb2F0aW5nUG9pbnRcbiAgICAgICAgICAgIEBkZWNvZGVyLm9uICdkYXRhJywgKGJ1ZmZlcikgPT5cbiAgICAgICAgICAgICAgICBAZW1pdCAnZGF0YScsIGJ1ZmZlclxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBkaXYgPSBNYXRoLnBvdygyLCBAZm9ybWF0LmJpdHNQZXJDaGFubmVsIC0gMSlcbiAgICAgICAgICAgIEBkZWNvZGVyLm9uICdkYXRhJywgKGJ1ZmZlcikgPT5cbiAgICAgICAgICAgICAgICBidWYgPSBuZXcgRmxvYXQzMkFycmF5KGJ1ZmZlci5sZW5ndGgpXG4gICAgICAgICAgICAgICAgZm9yIHNhbXBsZSwgaSBpbiBidWZmZXJcbiAgICAgICAgICAgICAgICAgICAgYnVmW2ldID0gc2FtcGxlIC8gZGl2XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIEBlbWl0ICdkYXRhJywgYnVmXG4gICAgICAgICAgICBcbiAgICAgICAgQGRlY29kZXIub24gJ2Vycm9yJywgKGVycikgPT5cbiAgICAgICAgICAgIEBlbWl0ICdlcnJvcicsIGVyclxuICAgICAgICAgICAgQHN0b3AoKVxuICAgICAgICAgICAgXG4gICAgICAgIEBkZWNvZGVyLm9uICdlbmQnLCA9PlxuICAgICAgICAgICAgQGVtaXQgJ2VuZCdcbiAgICAgICAgICAgIFxuICAgICAgICBAZW1pdCAnZGVjb2RlU3RhcnQnXG4gICAgICAgIEBfZGVjb2RlKCkgaWYgQHNob3VsZERlY29kZVxuICAgICAgICBcbiAgICBfZGVjb2RlOiA9PlxuICAgICAgICBjb250aW51ZSB3aGlsZSBAZGVjb2Rlci5kZWNvZGUoKSBhbmQgQGFjdGl2ZVxuICAgICAgICBAZGVjb2Rlci5vbmNlICdkYXRhJywgQF9kZWNvZGUgaWYgQGFjdGl2ZVxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gQXNzZXRcbiIsImZvciBrZXksIHZhbCBvZiByZXF1aXJlICcuL2F1cm9yYV9iYXNlJ1xuICAgIGV4cG9ydHNba2V5XSA9IHZhbFxuXG5yZXF1aXJlICcuL2RlbXV4ZXJzL2NhZidcbnJlcXVpcmUgJy4vZGVtdXhlcnMvbTRhJ1xucmVxdWlyZSAnLi9kZW11eGVycy9haWZmJ1xucmVxdWlyZSAnLi9kZW11eGVycy93YXZlJ1xucmVxdWlyZSAnLi9kZW11eGVycy9hdSdcblxucmVxdWlyZSAnLi9kZWNvZGVycy9scGNtJ1xucmVxdWlyZSAnLi9kZWNvZGVycy94bGF3JyIsImV4cG9ydHMuQmFzZSA9IHJlcXVpcmUgJy4vY29yZS9iYXNlJ1xuZXhwb3J0cy5CdWZmZXIgPSByZXF1aXJlICcuL2NvcmUvYnVmZmVyJ1xuZXhwb3J0cy5CdWZmZXJMaXN0ID0gcmVxdWlyZSAnLi9jb3JlL2J1ZmZlcmxpc3QnXG5leHBvcnRzLlN0cmVhbSA9IHJlcXVpcmUgJy4vY29yZS9zdHJlYW0nXG5leHBvcnRzLkJpdHN0cmVhbSA9IHJlcXVpcmUgJy4vY29yZS9iaXRzdHJlYW0nXG5leHBvcnRzLkV2ZW50RW1pdHRlciA9IHJlcXVpcmUgJy4vY29yZS9ldmVudHMnXG5leHBvcnRzLlVuZGVyZmxvd0Vycm9yID0gcmVxdWlyZSAnLi9jb3JlL3VuZGVyZmxvdydcblxuIyBicm93c2VyaWZ5IHdpbGwgcmVwbGFjZSB0aGVzZSB3aXRoIHRoZSBicm93c2VyIHZlcnNpb25zXG5leHBvcnRzLkhUVFBTb3VyY2UgPSByZXF1aXJlICcuL3NvdXJjZXMvbm9kZS9odHRwJ1xuZXhwb3J0cy5GaWxlU291cmNlID0gcmVxdWlyZSAnLi9zb3VyY2VzL25vZGUvZmlsZSdcbmV4cG9ydHMuQnVmZmVyU291cmNlID0gcmVxdWlyZSAnLi9zb3VyY2VzL2J1ZmZlcidcblxuZXhwb3J0cy5EZW11eGVyID0gcmVxdWlyZSAnLi9kZW11eGVyJ1xuZXhwb3J0cy5EZWNvZGVyID0gcmVxdWlyZSAnLi9kZWNvZGVyJ1xuZXhwb3J0cy5BdWRpb0RldmljZSA9IHJlcXVpcmUgJy4vZGV2aWNlJ1xuZXhwb3J0cy5Bc3NldCA9IHJlcXVpcmUgJy4vYXNzZXQnXG5leHBvcnRzLlBsYXllciA9IHJlcXVpcmUgJy4vcGxheWVyJ1xuXG5leHBvcnRzLkZpbHRlciA9IHJlcXVpcmUgJy4vZmlsdGVyJ1xuZXhwb3J0cy5Wb2x1bWVGaWx0ZXIgPSByZXF1aXJlICcuL2ZpbHRlcnMvdm9sdW1lJ1xuZXhwb3J0cy5CYWxhbmNlRmlsdGVyID0gcmVxdWlyZSAnLi9maWx0ZXJzL2JhbGFuY2UnXG4iLCIjXG4jIFRoZSBCYXNlIGNsYXNzIGRlZmluZXMgYW4gZXh0ZW5kIG1ldGhvZCBzbyB0aGF0XG4jIENvZmZlZVNjcmlwdCBjbGFzc2VzIGNhbiBiZSBleHRlbmRlZCBlYXNpbHkgYnkgXG4jIHBsYWluIEphdmFTY3JpcHQuIEJhc2VkIG9uIGh0dHA6Ly9lam9obi5vcmcvYmxvZy9zaW1wbGUtamF2YXNjcmlwdC1pbmhlcml0YW5jZS8uXG4jXG5cbmNsYXNzIEJhc2VcbiAgICBmblRlc3QgPSAvXFxiX3N1cGVyXFxiL1xuICAgIFxuICAgIEBleHRlbmQ6IChwcm9wKSAtPlxuICAgICAgICBjbGFzcyBDbGFzcyBleHRlbmRzIHRoaXNcbiAgICAgICAgICAgIFxuICAgICAgICBpZiB0eXBlb2YgcHJvcCBpcyAnZnVuY3Rpb24nXG4gICAgICAgICAgICBrZXlzID0gT2JqZWN0LmtleXMgQ2xhc3MucHJvdG90eXBlXG4gICAgICAgICAgICBwcm9wLmNhbGwoQ2xhc3MsIENsYXNzKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBwcm9wID0ge31cbiAgICAgICAgICAgIGZvciBrZXksIGZuIG9mIENsYXNzLnByb3RvdHlwZSB3aGVuIGtleSBub3QgaW4ga2V5c1xuICAgICAgICAgICAgICAgIHByb3Bba2V5XSA9IGZuXG4gICAgICAgIFxuICAgICAgICBfc3VwZXIgPSBDbGFzcy5fX3N1cGVyX19cbiAgICAgICAgXG4gICAgICAgIGZvciBrZXksIGZuIG9mIHByb3BcbiAgICAgICAgICAgICMgdGVzdCB3aGV0aGVyIHRoZSBtZXRob2QgYWN0dWFsbHkgdXNlcyBfc3VwZXIoKSBhbmQgd3JhcCBpdCBpZiBzb1xuICAgICAgICAgICAgaWYgdHlwZW9mIGZuIGlzICdmdW5jdGlvbicgYW5kIGZuVGVzdC50ZXN0KGZuKVxuICAgICAgICAgICAgICAgIGRvIChrZXksIGZuKSAtPlxuICAgICAgICAgICAgICAgICAgICBDbGFzczo6W2tleV0gPSAtPlxuICAgICAgICAgICAgICAgICAgICAgICAgdG1wID0gdGhpcy5fc3VwZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3N1cGVyID0gX3N1cGVyW2tleV1cbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0ID0gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc3VwZXIgPSB0bXBcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJldFxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgQ2xhc3M6OltrZXldID0gZm5cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuIENsYXNzXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBCYXNlXG4iLCJjbGFzcyBCaXRzdHJlYW1cbiAgICBjb25zdHJ1Y3RvcjogKEBzdHJlYW0pIC0+XG4gICAgICAgIEBiaXRQb3NpdGlvbiA9IDBcblxuICAgIGNvcHk6IC0+XG4gICAgICAgIHJlc3VsdCA9IG5ldyBCaXRzdHJlYW0gQHN0cmVhbS5jb3B5KClcbiAgICAgICAgcmVzdWx0LmJpdFBvc2l0aW9uID0gQGJpdFBvc2l0aW9uXG4gICAgICAgIHJldHVybiByZXN1bHRcblxuICAgIG9mZnNldDogLT4gIyBTaG91bGQgYmUgYSBwcm9wZXJ0eVxuICAgICAgICByZXR1cm4gOCAqIEBzdHJlYW0ub2Zmc2V0ICsgQGJpdFBvc2l0aW9uXG5cbiAgICBhdmFpbGFibGU6IChiaXRzKSAtPlxuICAgICAgICByZXR1cm4gQHN0cmVhbS5hdmFpbGFibGUoKGJpdHMgKyA4IC0gQGJpdFBvc2l0aW9uKSAvIDgpXG5cbiAgICBhZHZhbmNlOiAoYml0cykgLT5cbiAgICAgICAgcG9zID0gQGJpdFBvc2l0aW9uICsgYml0c1xuICAgICAgICBAc3RyZWFtLmFkdmFuY2UocG9zID4+IDMpXG4gICAgICAgIEBiaXRQb3NpdGlvbiA9IHBvcyAmIDdcbiAgICAgICAgXG4gICAgcmV3aW5kOiAoYml0cykgLT5cbiAgICAgICAgcG9zID0gQGJpdFBvc2l0aW9uIC0gYml0c1xuICAgICAgICBAc3RyZWFtLnJld2luZChNYXRoLmFicyhwb3MgPj4gMykpXG4gICAgICAgIEBiaXRQb3NpdGlvbiA9IHBvcyAmIDdcbiAgICAgICAgXG4gICAgc2VlazogKG9mZnNldCkgLT5cbiAgICAgICAgY3VyT2Zmc2V0ID0gQG9mZnNldCgpXG4gICAgICAgIFxuICAgICAgICBpZiBvZmZzZXQgPiBjdXJPZmZzZXRcbiAgICAgICAgICAgIEBhZHZhbmNlIG9mZnNldCAtIGN1ck9mZnNldCBcbiAgICAgICAgICAgIFxuICAgICAgICBlbHNlIGlmIG9mZnNldCA8IGN1ck9mZnNldCBcbiAgICAgICAgICAgIEByZXdpbmQgY3VyT2Zmc2V0IC0gb2Zmc2V0XG5cbiAgICBhbGlnbjogLT5cbiAgICAgICAgdW5sZXNzIEBiaXRQb3NpdGlvbiBpcyAwXG4gICAgICAgICAgICBAYml0UG9zaXRpb24gPSAwXG4gICAgICAgICAgICBAc3RyZWFtLmFkdmFuY2UoMSlcbiAgICAgICAgXG4gICAgcmVhZDogKGJpdHMsIHNpZ25lZCkgLT5cbiAgICAgICAgcmV0dXJuIDAgaWYgYml0cyBpcyAwXG4gICAgICAgIFxuICAgICAgICBtQml0cyA9IGJpdHMgKyBAYml0UG9zaXRpb25cbiAgICAgICAgaWYgbUJpdHMgPD0gOFxuICAgICAgICAgICAgYSA9ICgoQHN0cmVhbS5wZWVrVUludDgoKSA8PCBAYml0UG9zaXRpb24pICYgMHhmZikgPj4+ICg4IC0gYml0cylcblxuICAgICAgICBlbHNlIGlmIG1CaXRzIDw9IDE2XG4gICAgICAgICAgICBhID0gKChAc3RyZWFtLnBlZWtVSW50MTYoKSA8PCBAYml0UG9zaXRpb24pICYgMHhmZmZmKSA+Pj4gKDE2IC0gYml0cylcblxuICAgICAgICBlbHNlIGlmIG1CaXRzIDw9IDI0XG4gICAgICAgICAgICBhID0gKChAc3RyZWFtLnBlZWtVSW50MjQoKSA8PCBAYml0UG9zaXRpb24pICYgMHhmZmZmZmYpID4+PiAoMjQgLSBiaXRzKVxuXG4gICAgICAgIGVsc2UgaWYgbUJpdHMgPD0gMzJcbiAgICAgICAgICAgIGEgPSAoQHN0cmVhbS5wZWVrVUludDMyKCkgPDwgQGJpdFBvc2l0aW9uKSA+Pj4gKDMyIC0gYml0cylcblxuICAgICAgICBlbHNlIGlmIG1CaXRzIDw9IDQwXG4gICAgICAgICAgICBhMCA9IEBzdHJlYW0ucGVla1VJbnQ4KDApICogMHgwMTAwMDAwMDAwICMgc2FtZSBhcyBhIDw8IDMyXG4gICAgICAgICAgICBhMSA9IEBzdHJlYW0ucGVla1VJbnQ4KDEpIDw8IDI0ID4+PiAwXG4gICAgICAgICAgICBhMiA9IEBzdHJlYW0ucGVla1VJbnQ4KDIpIDw8IDE2XG4gICAgICAgICAgICBhMyA9IEBzdHJlYW0ucGVla1VJbnQ4KDMpIDw8IDhcbiAgICAgICAgICAgIGE0ID0gQHN0cmVhbS5wZWVrVUludDgoNClcblxuICAgICAgICAgICAgYSA9IGEwICsgYTEgKyBhMiArIGEzICsgYTRcbiAgICAgICAgICAgIGEgJT0gTWF0aC5wb3coMiwgNDAgLSBAYml0UG9zaXRpb24pICAgICAgICAgICAgICAgICAgICAgICAgIyAoYSA8PCBiaXRQb3NpdGlvbikgJiAweGZmZmZmZmZmZmZcbiAgICAgICAgICAgIGEgPSBNYXRoLmZsb29yKGEgLyBNYXRoLnBvdygyLCA0MCAtIEBiaXRQb3NpdGlvbiAtIGJpdHMpKSAgIyBhID4+PiAoNDAgLSBiaXRzKVxuXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciBcIlRvbyBtYW55IGJpdHMhXCJcbiAgICAgICAgICAgIFxuICAgICAgICBpZiBzaWduZWRcbiAgICAgICAgICAgICMgaWYgdGhlIHNpZ24gYml0IGlzIHR1cm5lZCBvbiwgZmxpcCB0aGUgYml0cyBhbmQgXG4gICAgICAgICAgICAjIGFkZCBvbmUgdG8gY29udmVydCB0byBhIG5lZ2F0aXZlIHZhbHVlXG4gICAgICAgICAgICBpZiBtQml0cyA8IDMyXG4gICAgICAgICAgICAgICAgaWYgYSA+Pj4gKGJpdHMgLSAxKVxuICAgICAgICAgICAgICAgICAgICBhID0gKCgxIDw8IGJpdHMgPj4+IDApIC0gYSkgKiAtMVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGlmIGEgLyBNYXRoLnBvdygyLCBiaXRzIC0gMSkgfCAwXG4gICAgICAgICAgICAgICAgICAgIGEgPSAoTWF0aC5wb3coMiwgYml0cykgLSBhKSAqIC0xXG5cbiAgICAgICAgQGFkdmFuY2UgYml0c1xuICAgICAgICByZXR1cm4gYVxuICAgICAgICBcbiAgICBwZWVrOiAoYml0cywgc2lnbmVkKSAtPlxuICAgICAgICByZXR1cm4gMCBpZiBiaXRzIGlzIDBcbiAgICAgICAgXG4gICAgICAgIG1CaXRzID0gYml0cyArIEBiaXRQb3NpdGlvblxuICAgICAgICBpZiBtQml0cyA8PSA4XG4gICAgICAgICAgICBhID0gKChAc3RyZWFtLnBlZWtVSW50OCgpIDw8IEBiaXRQb3NpdGlvbikgJiAweGZmKSA+Pj4gKDggLSBiaXRzKVxuXG4gICAgICAgIGVsc2UgaWYgbUJpdHMgPD0gMTZcbiAgICAgICAgICAgIGEgPSAoKEBzdHJlYW0ucGVla1VJbnQxNigpIDw8IEBiaXRQb3NpdGlvbikgJiAweGZmZmYpID4+PiAoMTYgLSBiaXRzKVxuXG4gICAgICAgIGVsc2UgaWYgbUJpdHMgPD0gMjRcbiAgICAgICAgICAgIGEgPSAoKEBzdHJlYW0ucGVla1VJbnQyNCgpIDw8IEBiaXRQb3NpdGlvbikgJiAweGZmZmZmZikgPj4+ICgyNCAtIGJpdHMpXG5cbiAgICAgICAgZWxzZSBpZiBtQml0cyA8PSAzMlxuICAgICAgICAgICAgYSA9IChAc3RyZWFtLnBlZWtVSW50MzIoKSA8PCBAYml0UG9zaXRpb24pID4+PiAoMzIgLSBiaXRzKVxuXG4gICAgICAgIGVsc2UgaWYgbUJpdHMgPD0gNDBcbiAgICAgICAgICAgIGEwID0gQHN0cmVhbS5wZWVrVUludDgoMCkgKiAweDAxMDAwMDAwMDAgIyBzYW1lIGFzIGEgPDwgMzJcbiAgICAgICAgICAgIGExID0gQHN0cmVhbS5wZWVrVUludDgoMSkgPDwgMjQgPj4+IDBcbiAgICAgICAgICAgIGEyID0gQHN0cmVhbS5wZWVrVUludDgoMikgPDwgMTZcbiAgICAgICAgICAgIGEzID0gQHN0cmVhbS5wZWVrVUludDgoMykgPDwgOFxuICAgICAgICAgICAgYTQgPSBAc3RyZWFtLnBlZWtVSW50OCg0KVxuXG4gICAgICAgICAgICBhID0gYTAgKyBhMSArIGEyICsgYTMgKyBhNFxuICAgICAgICAgICAgYSAlPSBNYXRoLnBvdygyLCA0MCAtIEBiaXRQb3NpdGlvbikgICAgICAgICAgICAgICAgICAgICAgICAjIChhIDw8IGJpdFBvc2l0aW9uKSAmIDB4ZmZmZmZmZmZmZlxuICAgICAgICAgICAgYSA9IE1hdGguZmxvb3IoYSAvIE1hdGgucG93KDIsIDQwIC0gQGJpdFBvc2l0aW9uIC0gYml0cykpICAjIGEgPj4+ICg0MCAtIGJpdHMpXG5cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIFwiVG9vIG1hbnkgYml0cyFcIlxuICAgICAgICAgICAgXG4gICAgICAgIGlmIHNpZ25lZFxuICAgICAgICAgICAgIyBpZiB0aGUgc2lnbiBiaXQgaXMgdHVybmVkIG9uLCBmbGlwIHRoZSBiaXRzIGFuZCBcbiAgICAgICAgICAgICMgYWRkIG9uZSB0byBjb252ZXJ0IHRvIGEgbmVnYXRpdmUgdmFsdWVcbiAgICAgICAgICAgIGlmIG1CaXRzIDwgMzJcbiAgICAgICAgICAgICAgICBpZiBhID4+PiAoYml0cyAtIDEpXG4gICAgICAgICAgICAgICAgICAgIGEgPSAoKDEgPDwgYml0cyA+Pj4gMCkgLSBhKSAqIC0xXG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgaWYgYSAvIE1hdGgucG93KDIsIGJpdHMgLSAxKSB8IDBcbiAgICAgICAgICAgICAgICAgICAgYSA9IChNYXRoLnBvdygyLCBiaXRzKSAtIGEpICogLTFcblxuICAgICAgICByZXR1cm4gYVxuXG4gICAgcmVhZExTQjogKGJpdHMsIHNpZ25lZCkgLT5cbiAgICAgICAgcmV0dXJuIDAgaWYgYml0cyBpcyAwXG4gICAgICAgIGlmIGJpdHMgPiA0MFxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIFwiVG9vIG1hbnkgYml0cyFcIlxuXG4gICAgICAgIG1CaXRzID0gYml0cyArIEBiaXRQb3NpdGlvblxuICAgICAgICBhICA9IChAc3RyZWFtLnBlZWtVSW50OCgwKSkgPj4+IEBiaXRQb3NpdGlvblxuICAgICAgICBhIHw9IChAc3RyZWFtLnBlZWtVSW50OCgxKSkgPDwgKDggIC0gQGJpdFBvc2l0aW9uKSBpZiBtQml0cyA+IDhcbiAgICAgICAgYSB8PSAoQHN0cmVhbS5wZWVrVUludDgoMikpIDw8ICgxNiAtIEBiaXRQb3NpdGlvbikgaWYgbUJpdHMgPiAxNlxuICAgICAgICBhICs9IChAc3RyZWFtLnBlZWtVSW50OCgzKSkgPDwgKDI0IC0gQGJpdFBvc2l0aW9uKSA+Pj4gMCBpZiBtQml0cyA+IDI0ICAgICAgICAgICAgXG4gICAgICAgIGEgKz0gKEBzdHJlYW0ucGVla1VJbnQ4KDQpKSAqIE1hdGgucG93KDIsIDMyIC0gQGJpdFBvc2l0aW9uKSBpZiBtQml0cyA+IDMyXG5cbiAgICAgICAgaWYgbUJpdHMgPj0gMzJcbiAgICAgICAgICAgIGEgJT0gTWF0aC5wb3coMiwgYml0cylcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgYSAmPSAoMSA8PCBiaXRzKSAtIDFcbiAgICAgICAgICAgIFxuICAgICAgICBpZiBzaWduZWRcbiAgICAgICAgICAgICMgaWYgdGhlIHNpZ24gYml0IGlzIHR1cm5lZCBvbiwgZmxpcCB0aGUgYml0cyBhbmQgXG4gICAgICAgICAgICAjIGFkZCBvbmUgdG8gY29udmVydCB0byBhIG5lZ2F0aXZlIHZhbHVlXG4gICAgICAgICAgICBpZiBtQml0cyA8IDMyXG4gICAgICAgICAgICAgICAgaWYgYSA+Pj4gKGJpdHMgLSAxKVxuICAgICAgICAgICAgICAgICAgICBhID0gKCgxIDw8IGJpdHMgPj4+IDApIC0gYSkgKiAtMVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGlmIGEgLyBNYXRoLnBvdygyLCBiaXRzIC0gMSkgfCAwXG4gICAgICAgICAgICAgICAgICAgIGEgPSAoTWF0aC5wb3coMiwgYml0cykgLSBhKSAqIC0xXG5cbiAgICAgICAgQGFkdmFuY2UgYml0c1xuICAgICAgICByZXR1cm4gYVxuICAgICAgICBcbiAgICBwZWVrTFNCOiAoYml0cywgc2lnbmVkKSAtPlxuICAgICAgICByZXR1cm4gMCBpZiBiaXRzIGlzIDBcbiAgICAgICAgaWYgYml0cyA+IDQwXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgXCJUb28gbWFueSBiaXRzIVwiXG5cbiAgICAgICAgbUJpdHMgPSBiaXRzICsgQGJpdFBvc2l0aW9uXG4gICAgICAgIGEgID0gKEBzdHJlYW0ucGVla1VJbnQ4KDApKSA+Pj4gQGJpdFBvc2l0aW9uXG4gICAgICAgIGEgfD0gKEBzdHJlYW0ucGVla1VJbnQ4KDEpKSA8PCAoOCAgLSBAYml0UG9zaXRpb24pIGlmIG1CaXRzID4gOFxuICAgICAgICBhIHw9IChAc3RyZWFtLnBlZWtVSW50OCgyKSkgPDwgKDE2IC0gQGJpdFBvc2l0aW9uKSBpZiBtQml0cyA+IDE2XG4gICAgICAgIGEgKz0gKEBzdHJlYW0ucGVla1VJbnQ4KDMpKSA8PCAoMjQgLSBAYml0UG9zaXRpb24pID4+PiAwIGlmIG1CaXRzID4gMjQgICAgICAgICAgICBcbiAgICAgICAgYSArPSAoQHN0cmVhbS5wZWVrVUludDgoNCkpICogTWF0aC5wb3coMiwgMzIgLSBAYml0UG9zaXRpb24pIGlmIG1CaXRzID4gMzJcbiAgICAgICAgXG4gICAgICAgIGlmIG1CaXRzID49IDMyXG4gICAgICAgICAgICBhICU9IE1hdGgucG93KDIsIGJpdHMpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGEgJj0gKDEgPDwgYml0cykgLSAxXG4gICAgICAgICAgICBcbiAgICAgICAgaWYgc2lnbmVkXG4gICAgICAgICAgICAjIGlmIHRoZSBzaWduIGJpdCBpcyB0dXJuZWQgb24sIGZsaXAgdGhlIGJpdHMgYW5kIFxuICAgICAgICAgICAgIyBhZGQgb25lIHRvIGNvbnZlcnQgdG8gYSBuZWdhdGl2ZSB2YWx1ZVxuICAgICAgICAgICAgaWYgbUJpdHMgPCAzMlxuICAgICAgICAgICAgICAgIGlmIGEgPj4+IChiaXRzIC0gMSlcbiAgICAgICAgICAgICAgICAgICAgYSA9ICgoMSA8PCBiaXRzID4+PiAwKSAtIGEpICogLTFcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBpZiBhIC8gTWF0aC5wb3coMiwgYml0cyAtIDEpIHwgMFxuICAgICAgICAgICAgICAgICAgICBhID0gKE1hdGgucG93KDIsIGJpdHMpIC0gYSkgKiAtMVxuXG4gICAgICAgIHJldHVybiBhXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBCaXRzdHJlYW1cbiIsImNsYXNzIEFWQnVmZmVyXG4gICAgY29uc3RydWN0b3I6IChpbnB1dCkgLT5cbiAgICAgICAgaWYgaW5wdXQgaW5zdGFuY2VvZiBVaW50OEFycmF5ICAgICAgICAgICAgICAgICAgIyBVaW50OEFycmF5XG4gICAgICAgICAgICBAZGF0YSA9IGlucHV0XG4gICAgICAgICAgICBcbiAgICAgICAgZWxzZSBpZiBpbnB1dCBpbnN0YW5jZW9mIEFycmF5QnVmZmVyIG9yICAgICAgICAgIyBBcnJheUJ1ZmZlclxuICAgICAgICAgIEFycmF5LmlzQXJyYXkoaW5wdXQpIG9yICAgICAgICAgICAgICAgICAgICAgICAjIG5vcm1hbCBKUyBBcnJheVxuICAgICAgICAgIHR5cGVvZiBpbnB1dCBpcyAnbnVtYmVyJyBvciAgICAgICAgICAgICAgICAgICAjIG51bWJlciAoaS5lLiBsZW5ndGgpXG4gICAgICAgICAgZ2xvYmFsLkJ1ZmZlcj8uaXNCdWZmZXIoaW5wdXQpICAgICAgICAgICAgICAgICMgTm9kZSBCdWZmZXJcbiAgICAgICAgICAgIEBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoaW5wdXQpXG4gICAgICAgICAgICBcbiAgICAgICAgZWxzZSBpZiBpbnB1dC5idWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlciAgICAgIyB0eXBlZCBhcnJheXMgb3RoZXIgdGhhbiBVaW50OEFycmF5XG4gICAgICAgICAgICBAZGF0YSA9IG5ldyBVaW50OEFycmF5KGlucHV0LmJ1ZmZlciwgaW5wdXQuYnl0ZU9mZnNldCwgaW5wdXQubGVuZ3RoICogaW5wdXQuQllURVNfUEVSX0VMRU1FTlQpXG4gICAgICAgICAgICBcbiAgICAgICAgZWxzZSBpZiBpbnB1dCBpbnN0YW5jZW9mIEFWQnVmZmVyICAgICAgICAgICAgICAgIyBBVkJ1ZmZlciwgbWFrZSBhIHNoYWxsb3cgY29weVxuICAgICAgICAgICAgQGRhdGEgPSBpbnB1dC5kYXRhXG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIFwiQ29uc3RydWN0aW5nIGJ1ZmZlciB3aXRoIHVua25vd24gdHlwZS5cIlxuICAgICAgICBcbiAgICAgICAgQGxlbmd0aCA9IEBkYXRhLmxlbmd0aFxuICAgICAgICBcbiAgICAgICAgIyB1c2VkIHdoZW4gdGhlIGJ1ZmZlciBpcyBwYXJ0IG9mIGEgYnVmZmVybGlzdFxuICAgICAgICBAbmV4dCA9IG51bGxcbiAgICAgICAgQHByZXYgPSBudWxsXG4gICAgXG4gICAgQGFsbG9jYXRlOiAoc2l6ZSkgLT5cbiAgICAgICAgcmV0dXJuIG5ldyBBVkJ1ZmZlcihzaXplKVxuICAgIFxuICAgIGNvcHk6IC0+XG4gICAgICAgIHJldHVybiBuZXcgQVZCdWZmZXIobmV3IFVpbnQ4QXJyYXkoQGRhdGEpKVxuICAgIFxuICAgIHNsaWNlOiAocG9zaXRpb24sIGxlbmd0aCA9IEBsZW5ndGgpIC0+XG4gICAgICAgIGlmIHBvc2l0aW9uIGlzIDAgYW5kIGxlbmd0aCA+PSBAbGVuZ3RoXG4gICAgICAgICAgICByZXR1cm4gbmV3IEFWQnVmZmVyKEBkYXRhKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gbmV3IEFWQnVmZmVyKEBkYXRhLnN1YmFycmF5KHBvc2l0aW9uLCBwb3NpdGlvbiArIGxlbmd0aCkpXG4gICAgXG4gICAgIyBwcmVmaXgtZnJlZVxuICAgIEJsb2JCdWlsZGVyID0gZ2xvYmFsLkJsb2JCdWlsZGVyIG9yIGdsb2JhbC5Nb3pCbG9iQnVpbGRlciBvciBnbG9iYWwuV2ViS2l0QmxvYkJ1aWxkZXJcbiAgICBVUkwgPSBnbG9iYWwuVVJMIG9yIGdsb2JhbC53ZWJraXRVUkwgb3IgZ2xvYmFsLm1velVSTFxuICAgIFxuICAgIEBtYWtlQmxvYjogKGRhdGEsIHR5cGUgPSAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJykgLT5cbiAgICAgICAgIyB0cnkgdGhlIEJsb2IgY29uc3RydWN0b3JcbiAgICAgICAgdHJ5IFxuICAgICAgICAgICAgcmV0dXJuIG5ldyBCbG9iIFtkYXRhXSwgdHlwZTogdHlwZVxuICAgICAgICBcbiAgICAgICAgIyB1c2UgdGhlIG9sZCBCbG9iQnVpbGRlclxuICAgICAgICBpZiBCbG9iQnVpbGRlcj9cbiAgICAgICAgICAgIGJiID0gbmV3IEJsb2JCdWlsZGVyXG4gICAgICAgICAgICBiYi5hcHBlbmQgZGF0YVxuICAgICAgICAgICAgcmV0dXJuIGJiLmdldEJsb2IodHlwZSlcbiAgICAgICAgICAgIFxuICAgICAgICAjIG9vcHMsIG5vIGJsb2JzIHN1cHBvcnRlZCA6KFxuICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgICBcbiAgICBAbWFrZUJsb2JVUkw6IChkYXRhLCB0eXBlKSAtPlxuICAgICAgICByZXR1cm4gVVJMPy5jcmVhdGVPYmplY3RVUkwgQG1ha2VCbG9iKGRhdGEsIHR5cGUpXG4gICAgICAgIFxuICAgIEByZXZva2VCbG9iVVJMOiAodXJsKSAtPlxuICAgICAgICBVUkw/LnJldm9rZU9iamVjdFVSTCB1cmxcbiAgICBcbiAgICB0b0Jsb2I6IC0+XG4gICAgICAgIHJldHVybiBBVkJ1ZmZlci5tYWtlQmxvYiBAZGF0YS5idWZmZXJcbiAgICAgICAgXG4gICAgdG9CbG9iVVJMOiAtPlxuICAgICAgICByZXR1cm4gQVZCdWZmZXIubWFrZUJsb2JVUkwgQGRhdGEuYnVmZmVyXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBBVkJ1ZmZlclxuIiwiY2xhc3MgQnVmZmVyTGlzdFxuICAgIGNvbnN0cnVjdG9yOiAtPlxuICAgICAgICBAZmlyc3QgPSBudWxsXG4gICAgICAgIEBsYXN0ID0gbnVsbFxuICAgICAgICBAbnVtQnVmZmVycyA9IDBcbiAgICAgICAgQGF2YWlsYWJsZUJ5dGVzID0gMFxuICAgICAgICBAYXZhaWxhYmxlQnVmZmVycyA9IDAgICAgICAgIFxuICAgIFxuICAgIGNvcHk6IC0+XG4gICAgICAgIHJlc3VsdCA9IG5ldyBCdWZmZXJMaXN0XG5cbiAgICAgICAgcmVzdWx0LmZpcnN0ID0gQGZpcnN0XG4gICAgICAgIHJlc3VsdC5sYXN0ID0gQGxhc3RcbiAgICAgICAgcmVzdWx0Lm51bUJ1ZmZlcnMgPSBAbnVtQnVmZmVyc1xuICAgICAgICByZXN1bHQuYXZhaWxhYmxlQnl0ZXMgPSBAYXZhaWxhYmxlQnl0ZXNcbiAgICAgICAgcmVzdWx0LmF2YWlsYWJsZUJ1ZmZlcnMgPSBAYXZhaWxhYmxlQnVmZmVyc1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICBcbiAgICBhcHBlbmQ6IChidWZmZXIpIC0+XG4gICAgICAgIGJ1ZmZlci5wcmV2ID0gQGxhc3RcbiAgICAgICAgQGxhc3Q/Lm5leHQgPSBidWZmZXJcbiAgICAgICAgQGxhc3QgPSBidWZmZXJcbiAgICAgICAgQGZpcnN0ID89IGJ1ZmZlclxuICAgICAgICBcbiAgICAgICAgQGF2YWlsYWJsZUJ5dGVzICs9IGJ1ZmZlci5sZW5ndGhcbiAgICAgICAgQGF2YWlsYWJsZUJ1ZmZlcnMrK1xuICAgICAgICBAbnVtQnVmZmVycysrXG4gICAgICAgIFxuICAgIGFkdmFuY2U6IC0+XG4gICAgICAgIGlmIEBmaXJzdFxuICAgICAgICAgICAgQGF2YWlsYWJsZUJ5dGVzIC09IEBmaXJzdC5sZW5ndGhcbiAgICAgICAgICAgIEBhdmFpbGFibGVCdWZmZXJzLS1cbiAgICAgICAgICAgIEBmaXJzdCA9IEBmaXJzdC5uZXh0XG4gICAgICAgICAgICByZXR1cm4gQGZpcnN0P1xuICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICBcbiAgICByZXdpbmQ6IC0+XG4gICAgICAgIGlmIEBmaXJzdCBhbmQgbm90IEBmaXJzdC5wcmV2XG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgXG4gICAgICAgIEBmaXJzdCA9IEBmaXJzdD8ucHJldiBvciBAbGFzdFxuICAgICAgICBpZiBAZmlyc3RcbiAgICAgICAgICAgIEBhdmFpbGFibGVCeXRlcyArPSBAZmlyc3QubGVuZ3RoXG4gICAgICAgICAgICBAYXZhaWxhYmxlQnVmZmVycysrXG4gICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuIEBmaXJzdD9cbiAgICAgICAgXG4gICAgcmVzZXQ6IC0+XG4gICAgICAgIGNvbnRpbnVlIHdoaWxlIEByZXdpbmQoKVxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gQnVmZmVyTGlzdFxuIiwiQmFzZSA9IHJlcXVpcmUgJy4vYmFzZSdcblxuY2xhc3MgRXZlbnRFbWl0dGVyIGV4dGVuZHMgQmFzZVxuICAgIG9uOiAoZXZlbnQsIGZuKSAtPlxuICAgICAgICBAZXZlbnRzID89IHt9XG4gICAgICAgIEBldmVudHNbZXZlbnRdID89IFtdXG4gICAgICAgIEBldmVudHNbZXZlbnRdLnB1c2goZm4pXG4gICAgICAgIFxuICAgIG9mZjogKGV2ZW50LCBmbikgLT5cbiAgICAgICAgcmV0dXJuIHVubGVzcyBAZXZlbnRzP1tldmVudF1cbiAgICAgICAgaW5kZXggPSBAZXZlbnRzW2V2ZW50XS5pbmRleE9mKGZuKVxuICAgICAgICBAZXZlbnRzW2V2ZW50XS5zcGxpY2UoaW5kZXgsIDEpIGlmIH5pbmRleFxuICAgICAgICBcbiAgICBvbmNlOiAoZXZlbnQsIGZuKSAtPlxuICAgICAgICBAb24gZXZlbnQsIGNiID0gLT5cbiAgICAgICAgICAgIEBvZmYgZXZlbnQsIGNiXG4gICAgICAgICAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgIFxuICAgIGVtaXQ6IChldmVudCwgYXJncy4uLikgLT5cbiAgICAgICAgcmV0dXJuIHVubGVzcyBAZXZlbnRzP1tldmVudF1cbiAgICAgICAgXG4gICAgICAgICMgc2hhbGxvdyBjbG9uZSB3aXRoIC5zbGljZSgpIHNvIHRoYXQgcmVtb3ZpbmcgYSBoYW5kbGVyXG4gICAgICAgICMgd2hpbGUgZXZlbnQgaXMgZmlyaW5nIChhcyBpbiBvbmNlKSBkb2Vzbid0IGNhdXNlIGVycm9yc1xuICAgICAgICBmb3IgZm4gaW4gQGV2ZW50c1tldmVudF0uc2xpY2UoKVxuICAgICAgICAgICAgZm4uYXBwbHkodGhpcywgYXJncylcbiAgICAgICAgICAgIFxuICAgICAgICByZXR1cm5cbiAgICAgICAgXG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlclxuIiwiQnVmZmVyTGlzdCA9IHJlcXVpcmUgJy4vYnVmZmVybGlzdCdcbkFWQnVmZmVyID0gcmVxdWlyZSAnLi9idWZmZXInXG5VbmRlcmZsb3dFcnJvciA9IHJlcXVpcmUgJy4vdW5kZXJmbG93J1xuXG5jbGFzcyBTdHJlYW1cbiAgICBidWYgPSBuZXcgQXJyYXlCdWZmZXIoMTYpXG4gICAgdWludDggPSBuZXcgVWludDhBcnJheShidWYpXG4gICAgaW50OCA9IG5ldyBJbnQ4QXJyYXkoYnVmKVxuICAgIHVpbnQxNiA9IG5ldyBVaW50MTZBcnJheShidWYpXG4gICAgaW50MTYgPSBuZXcgSW50MTZBcnJheShidWYpXG4gICAgdWludDMyID0gbmV3IFVpbnQzMkFycmF5KGJ1ZilcbiAgICBpbnQzMiA9IG5ldyBJbnQzMkFycmF5KGJ1ZilcbiAgICBmbG9hdDMyID0gbmV3IEZsb2F0MzJBcnJheShidWYpXG4gICAgZmxvYXQ2NCA9IG5ldyBGbG9hdDY0QXJyYXkoYnVmKSBpZiBGbG9hdDY0QXJyYXk/XG4gICAgXG4gICAgIyBkZXRlY3QgdGhlIG5hdGl2ZSBlbmRpYW5uZXNzIG9mIHRoZSBtYWNoaW5lXG4gICAgIyAweDM0MTIgaXMgbGl0dGxlIGVuZGlhbiwgMHgxMjM0IGlzIGJpZyBlbmRpYW5cbiAgICBuYXRpdmVFbmRpYW4gPSBuZXcgVWludDE2QXJyYXkobmV3IFVpbnQ4QXJyYXkoWzB4MTIsIDB4MzRdKS5idWZmZXIpWzBdIGlzIDB4MzQxMlxuICAgICAgICBcbiAgICBjb25zdHJ1Y3RvcjogKEBsaXN0KSAtPlxuICAgICAgICBAbG9jYWxPZmZzZXQgPSAwXG4gICAgICAgIEBvZmZzZXQgPSAwXG4gICAgICAgIFxuICAgIEBmcm9tQnVmZmVyOiAoYnVmZmVyKSAtPlxuICAgICAgICBsaXN0ID0gbmV3IEJ1ZmZlckxpc3RcbiAgICAgICAgbGlzdC5hcHBlbmQoYnVmZmVyKVxuICAgICAgICByZXR1cm4gbmV3IFN0cmVhbShsaXN0KVxuICAgIFxuICAgIGNvcHk6IC0+XG4gICAgICAgIHJlc3VsdCA9IG5ldyBTdHJlYW0oQGxpc3QuY29weSgpKVxuICAgICAgICByZXN1bHQubG9jYWxPZmZzZXQgPSBAbG9jYWxPZmZzZXRcbiAgICAgICAgcmVzdWx0Lm9mZnNldCA9IEBvZmZzZXRcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIFxuICAgIGF2YWlsYWJsZTogKGJ5dGVzKSAtPlxuICAgICAgICByZXR1cm4gYnl0ZXMgPD0gQGxpc3QuYXZhaWxhYmxlQnl0ZXMgLSBAbG9jYWxPZmZzZXRcbiAgICAgICAgXG4gICAgcmVtYWluaW5nQnl0ZXM6IC0+XG4gICAgICAgIHJldHVybiBAbGlzdC5hdmFpbGFibGVCeXRlcyAtIEBsb2NhbE9mZnNldFxuICAgIFxuICAgIGFkdmFuY2U6IChieXRlcykgLT5cbiAgICAgICAgaWYgbm90IEBhdmFpbGFibGUgYnl0ZXNcbiAgICAgICAgICAgIHRocm93IG5ldyBVbmRlcmZsb3dFcnJvcigpXG4gICAgICAgIFxuICAgICAgICBAbG9jYWxPZmZzZXQgKz0gYnl0ZXNcbiAgICAgICAgQG9mZnNldCArPSBieXRlc1xuICAgICAgICBcbiAgICAgICAgd2hpbGUgQGxpc3QuZmlyc3QgYW5kIEBsb2NhbE9mZnNldCA+PSBAbGlzdC5maXJzdC5sZW5ndGhcbiAgICAgICAgICAgIEBsb2NhbE9mZnNldCAtPSBAbGlzdC5maXJzdC5sZW5ndGhcbiAgICAgICAgICAgIEBsaXN0LmFkdmFuY2UoKVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgICAgXG4gICAgcmV3aW5kOiAoYnl0ZXMpIC0+XG4gICAgICAgIGlmIGJ5dGVzID4gQG9mZnNldFxuICAgICAgICAgICAgdGhyb3cgbmV3IFVuZGVyZmxvd0Vycm9yKClcbiAgICAgICAgXG4gICAgICAgICMgaWYgd2UncmUgYXQgdGhlIGVuZCBvZiB0aGUgYnVmZmVybGlzdCwgc2VlayBmcm9tIHRoZSBlbmRcbiAgICAgICAgaWYgbm90IEBsaXN0LmZpcnN0XG4gICAgICAgICAgICBAbGlzdC5yZXdpbmQoKVxuICAgICAgICAgICAgQGxvY2FsT2Zmc2V0ID0gQGxpc3QuZmlyc3QubGVuZ3RoXG4gICAgICAgICAgICBcbiAgICAgICAgQGxvY2FsT2Zmc2V0IC09IGJ5dGVzXG4gICAgICAgIEBvZmZzZXQgLT0gYnl0ZXNcbiAgICAgICAgXG4gICAgICAgIHdoaWxlIEBsaXN0LmZpcnN0LnByZXYgYW5kIEBsb2NhbE9mZnNldCA8IDBcbiAgICAgICAgICAgIEBsaXN0LnJld2luZCgpXG4gICAgICAgICAgICBAbG9jYWxPZmZzZXQgKz0gQGxpc3QuZmlyc3QubGVuZ3RoXG4gICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgICAgXG4gICAgc2VlazogKHBvc2l0aW9uKSAtPlxuICAgICAgICBpZiBwb3NpdGlvbiA+IEBvZmZzZXRcbiAgICAgICAgICAgIEBhZHZhbmNlIHBvc2l0aW9uIC0gQG9mZnNldFxuICAgICAgICAgICAgXG4gICAgICAgIGVsc2UgaWYgcG9zaXRpb24gPCBAb2Zmc2V0XG4gICAgICAgICAgICBAcmV3aW5kIEBvZmZzZXQgLSBwb3NpdGlvblxuICAgICAgICBcbiAgICByZWFkVUludDg6IC0+XG4gICAgICAgIGlmIG5vdCBAYXZhaWxhYmxlKDEpXG4gICAgICAgICAgICB0aHJvdyBuZXcgVW5kZXJmbG93RXJyb3IoKVxuICAgICAgICBcbiAgICAgICAgYSA9IEBsaXN0LmZpcnN0LmRhdGFbQGxvY2FsT2Zmc2V0XVxuICAgICAgICBAbG9jYWxPZmZzZXQgKz0gMVxuICAgICAgICBAb2Zmc2V0ICs9IDFcblxuICAgICAgICBpZiBAbG9jYWxPZmZzZXQgPT0gQGxpc3QuZmlyc3QubGVuZ3RoXG4gICAgICAgICAgICBAbG9jYWxPZmZzZXQgPSAwXG4gICAgICAgICAgICBAbGlzdC5hZHZhbmNlKClcblxuICAgICAgICByZXR1cm4gYVxuXG4gICAgcGVla1VJbnQ4OiAob2Zmc2V0ID0gMCkgLT5cbiAgICAgICAgaWYgbm90IEBhdmFpbGFibGUob2Zmc2V0ICsgMSlcbiAgICAgICAgICAgIHRocm93IG5ldyBVbmRlcmZsb3dFcnJvcigpXG4gICAgICAgIFxuICAgICAgICBvZmZzZXQgPSBAbG9jYWxPZmZzZXQgKyBvZmZzZXRcbiAgICAgICAgYnVmZmVyID0gQGxpc3QuZmlyc3RcblxuICAgICAgICB3aGlsZSBidWZmZXJcbiAgICAgICAgICAgIGlmIGJ1ZmZlci5sZW5ndGggPiBvZmZzZXRcbiAgICAgICAgICAgICAgICByZXR1cm4gYnVmZmVyLmRhdGFbb2Zmc2V0XVxuXG4gICAgICAgICAgICBvZmZzZXQgLT0gYnVmZmVyLmxlbmd0aFxuICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyLm5leHRcblxuICAgICAgICByZXR1cm4gMFxuICAgICAgICBcbiAgICByZWFkOiAoYnl0ZXMsIGxpdHRsZUVuZGlhbiA9IGZhbHNlKSAtPlxuICAgICAgICBpZiBsaXR0bGVFbmRpYW4gaXMgbmF0aXZlRW5kaWFuXG4gICAgICAgICAgICBmb3IgaSBpbiBbMC4uLmJ5dGVzXSBieSAxXG4gICAgICAgICAgICAgICAgdWludDhbaV0gPSBAcmVhZFVJbnQ4KClcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZm9yIGkgaW4gW2J5dGVzIC0gMS4uMF0gYnkgLTFcbiAgICAgICAgICAgICAgICB1aW50OFtpXSA9IEByZWFkVUludDgoKVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuXG4gICAgICAgIFxuICAgIHBlZWs6IChieXRlcywgb2Zmc2V0LCBsaXR0bGVFbmRpYW4gPSBmYWxzZSkgLT5cbiAgICAgICAgaWYgbGl0dGxlRW5kaWFuIGlzIG5hdGl2ZUVuZGlhblxuICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5ieXRlc10gYnkgMVxuICAgICAgICAgICAgICAgIHVpbnQ4W2ldID0gQHBlZWtVSW50OChvZmZzZXQgKyBpKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBmb3IgaSBpbiBbMC4uLmJ5dGVzXSBieSAxXG4gICAgICAgICAgICAgICAgdWludDhbYnl0ZXMgLSBpIC0gMV0gPSBAcGVla1VJbnQ4KG9mZnNldCArIGkpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgIHJldHVyblxuICAgICAgICBcbiAgICByZWFkSW50ODogLT5cbiAgICAgICAgQHJlYWQoMSlcbiAgICAgICAgcmV0dXJuIGludDhbMF1cblxuICAgIHBlZWtJbnQ4OiAob2Zmc2V0ID0gMCkgLT5cbiAgICAgICAgQHBlZWsoMSwgb2Zmc2V0KVxuICAgICAgICByZXR1cm4gaW50OFswXVxuICAgICAgICBcbiAgICByZWFkVUludDE2OiAobGl0dGxlRW5kaWFuKSAtPlxuICAgICAgICBAcmVhZCgyLCBsaXR0bGVFbmRpYW4pXG4gICAgICAgIHJldHVybiB1aW50MTZbMF1cblxuICAgIHBlZWtVSW50MTY6IChvZmZzZXQgPSAwLCBsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIEBwZWVrKDIsIG9mZnNldCwgbGl0dGxlRW5kaWFuKVxuICAgICAgICByZXR1cm4gdWludDE2WzBdXG5cbiAgICByZWFkSW50MTY6IChsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIEByZWFkKDIsIGxpdHRsZUVuZGlhbilcbiAgICAgICAgcmV0dXJuIGludDE2WzBdXG5cbiAgICBwZWVrSW50MTY6IChvZmZzZXQgPSAwLCBsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIEBwZWVrKDIsIG9mZnNldCwgbGl0dGxlRW5kaWFuKVxuICAgICAgICByZXR1cm4gaW50MTZbMF1cbiAgICAgICAgXG4gICAgcmVhZFVJbnQyNDogKGxpdHRsZUVuZGlhbikgLT5cbiAgICAgICAgaWYgbGl0dGxlRW5kaWFuXG4gICAgICAgICAgICByZXR1cm4gQHJlYWRVSW50MTYodHJ1ZSkgKyAoQHJlYWRVSW50OCgpIDw8IDE2KVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gKEByZWFkVUludDE2KCkgPDwgOCkgKyBAcmVhZFVJbnQ4KClcblxuICAgIHBlZWtVSW50MjQ6IChvZmZzZXQgPSAwLCBsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIGlmIGxpdHRsZUVuZGlhblxuICAgICAgICAgICAgcmV0dXJuIEBwZWVrVUludDE2KG9mZnNldCwgdHJ1ZSkgKyAoQHBlZWtVSW50OChvZmZzZXQgKyAyKSA8PCAxNilcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIChAcGVla1VJbnQxNihvZmZzZXQpIDw8IDgpICsgQHBlZWtVSW50OChvZmZzZXQgKyAyKVxuXG4gICAgcmVhZEludDI0OiAobGl0dGxlRW5kaWFuKSAtPlxuICAgICAgICBpZiBsaXR0bGVFbmRpYW5cbiAgICAgICAgICAgIHJldHVybiBAcmVhZFVJbnQxNih0cnVlKSArIChAcmVhZEludDgoKSA8PCAxNilcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIChAcmVhZEludDE2KCkgPDwgOCkgKyBAcmVhZFVJbnQ4KClcblxuICAgIHBlZWtJbnQyNDogKG9mZnNldCA9IDAsIGxpdHRsZUVuZGlhbikgLT5cbiAgICAgICAgaWYgbGl0dGxlRW5kaWFuXG4gICAgICAgICAgICByZXR1cm4gQHBlZWtVSW50MTYob2Zmc2V0LCB0cnVlKSArIChAcGVla0ludDgob2Zmc2V0ICsgMikgPDwgMTYpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiAoQHBlZWtJbnQxNihvZmZzZXQpIDw8IDgpICsgQHBlZWtVSW50OChvZmZzZXQgKyAyKVxuICAgIFxuICAgIHJlYWRVSW50MzI6IChsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIEByZWFkKDQsIGxpdHRsZUVuZGlhbilcbiAgICAgICAgcmV0dXJuIHVpbnQzMlswXVxuICAgIFxuICAgIHBlZWtVSW50MzI6IChvZmZzZXQgPSAwLCBsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIEBwZWVrKDQsIG9mZnNldCwgbGl0dGxlRW5kaWFuKVxuICAgICAgICByZXR1cm4gdWludDMyWzBdXG4gICAgXG4gICAgcmVhZEludDMyOiAobGl0dGxlRW5kaWFuKSAtPlxuICAgICAgICBAcmVhZCg0LCBsaXR0bGVFbmRpYW4pXG4gICAgICAgIHJldHVybiBpbnQzMlswXVxuICAgIFxuICAgIHBlZWtJbnQzMjogKG9mZnNldCA9IDAsIGxpdHRsZUVuZGlhbikgLT5cbiAgICAgICAgQHBlZWsoNCwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4pXG4gICAgICAgIHJldHVybiBpbnQzMlswXVxuICAgICAgICBcbiAgICByZWFkRmxvYXQzMjogKGxpdHRsZUVuZGlhbikgLT5cbiAgICAgICAgQHJlYWQoNCwgbGl0dGxlRW5kaWFuKVxuICAgICAgICByZXR1cm4gZmxvYXQzMlswXVxuICAgICAgICBcbiAgICBwZWVrRmxvYXQzMjogKG9mZnNldCA9IDAsIGxpdHRsZUVuZGlhbikgLT5cbiAgICAgICAgQHBlZWsoNCwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4pXG4gICAgICAgIHJldHVybiBmbG9hdDMyWzBdXG4gICAgXG4gICAgcmVhZEZsb2F0NjQ6IChsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIEByZWFkKDgsIGxpdHRsZUVuZGlhbilcbiAgICAgICAgXG4gICAgICAgICMgdXNlIEZsb2F0NjRBcnJheSBpZiBhdmFpbGFibGVcbiAgICAgICAgaWYgZmxvYXQ2NFxuICAgICAgICAgICAgcmV0dXJuIGZsb2F0NjRbMF1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIGZsb2F0NjRGYWxsYmFjaygpXG4gICAgICAgICAgICBcbiAgICBmbG9hdDY0RmFsbGJhY2sgPSAtPlxuICAgICAgICBbbG93LCBoaWdoXSA9IHVpbnQzMlxuICAgICAgICByZXR1cm4gMC4wIGlmIG5vdCBoaWdoIG9yIGhpZ2ggaXMgMHg4MDAwMDAwMFxuXG4gICAgICAgIHNpZ24gPSAxIC0gKGhpZ2ggPj4+IDMxKSAqIDIgIyArMSBvciAtMVxuICAgICAgICBleHAgPSAoaGlnaCA+Pj4gMjApICYgMHg3ZmZcbiAgICAgICAgZnJhYyA9IGhpZ2ggJiAweGZmZmZmXG5cbiAgICAgICAgIyBOYU4gb3IgSW5maW5pdHlcbiAgICAgICAgaWYgZXhwIGlzIDB4N2ZmXG4gICAgICAgICAgICByZXR1cm4gTmFOIGlmIGZyYWNcbiAgICAgICAgICAgIHJldHVybiBzaWduICogSW5maW5pdHlcblxuICAgICAgICBleHAgLT0gMTAyM1xuICAgICAgICBvdXQgPSAoZnJhYyB8IDB4MTAwMDAwKSAqIE1hdGgucG93KDIsIGV4cCAtIDIwKVxuICAgICAgICBvdXQgKz0gbG93ICogTWF0aC5wb3coMiwgZXhwIC0gNTIpXG5cbiAgICAgICAgcmV0dXJuIHNpZ24gKiBvdXRcbiAgICAgICAgICAgIFxuICAgIHBlZWtGbG9hdDY0OiAob2Zmc2V0ID0gMCwgbGl0dGxlRW5kaWFuKSAtPlxuICAgICAgICBAcGVlayg4LCBvZmZzZXQsIGxpdHRsZUVuZGlhbilcbiAgICAgICAgXG4gICAgICAgICMgdXNlIEZsb2F0NjRBcnJheSBpZiBhdmFpbGFibGVcbiAgICAgICAgaWYgZmxvYXQ2NFxuICAgICAgICAgICAgcmV0dXJuIGZsb2F0NjRbMF1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIGZsb2F0NjRGYWxsYmFjaygpXG4gICAgICAgIFxuICAgICMgSUVFRSA4MCBiaXQgZXh0ZW5kZWQgZmxvYXRcbiAgICByZWFkRmxvYXQ4MDogKGxpdHRsZUVuZGlhbikgLT5cbiAgICAgICAgQHJlYWQoMTAsIGxpdHRsZUVuZGlhbilcbiAgICAgICAgcmV0dXJuIGZsb2F0ODAoKVxuICAgICAgICBcbiAgICBmbG9hdDgwID0gLT5cbiAgICAgICAgW2hpZ2gsIGxvd10gPSB1aW50MzJcbiAgICAgICAgYTAgPSB1aW50OFs5XVxuICAgICAgICBhMSA9IHVpbnQ4WzhdXG4gICAgICAgIFxuICAgICAgICBzaWduID0gMSAtIChhMCA+Pj4gNykgKiAyICMgLTEgb3IgKzFcbiAgICAgICAgZXhwID0gKChhMCAmIDB4N0YpIDw8IDgpIHwgYTFcbiAgICAgICAgXG4gICAgICAgIGlmIGV4cCBpcyAwIGFuZCBsb3cgaXMgMCBhbmQgaGlnaCBpcyAwXG4gICAgICAgICAgICByZXR1cm4gMFxuICAgICAgICAgICAgXG4gICAgICAgIGlmIGV4cCBpcyAweDdmZmZcbiAgICAgICAgICAgIGlmIGxvdyBpcyAwIGFuZCBoaWdoIGlzIDBcbiAgICAgICAgICAgICAgICByZXR1cm4gc2lnbiAqIEluZmluaXR5XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gTmFOXG4gICAgICAgIFxuICAgICAgICBleHAgLT0gMTYzODNcbiAgICAgICAgb3V0ID0gbG93ICogTWF0aC5wb3coMiwgZXhwIC0gMzEpXG4gICAgICAgIG91dCArPSBoaWdoICogTWF0aC5wb3coMiwgZXhwIC0gNjMpXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gc2lnbiAqIG91dFxuICAgICAgICBcbiAgICBwZWVrRmxvYXQ4MDogKG9mZnNldCA9IDAsIGxpdHRsZUVuZGlhbikgLT5cbiAgICAgICAgQHBlZWsoMTAsIG9mZnNldCwgbGl0dGxlRW5kaWFuKVxuICAgICAgICByZXR1cm4gZmxvYXQ4MCgpXG4gICAgICAgIFxuICAgIHJlYWRCdWZmZXI6IChsZW5ndGgpIC0+XG4gICAgICAgIHJlc3VsdCA9IEFWQnVmZmVyLmFsbG9jYXRlKGxlbmd0aClcbiAgICAgICAgdG8gPSByZXN1bHQuZGF0YVxuXG4gICAgICAgIGZvciBpIGluIFswLi4ubGVuZ3RoXSBieSAxXG4gICAgICAgICAgICB0b1tpXSA9IEByZWFkVUludDgoKVxuXG4gICAgICAgIHJldHVybiByZXN1bHRcblxuICAgIHBlZWtCdWZmZXI6IChvZmZzZXQgPSAwLCBsZW5ndGgpIC0+XG4gICAgICAgIHJlc3VsdCA9IEFWQnVmZmVyLmFsbG9jYXRlKGxlbmd0aClcbiAgICAgICAgdG8gPSByZXN1bHQuZGF0YVxuXG4gICAgICAgIGZvciBpIGluIFswLi4ubGVuZ3RoXSBieSAxXG4gICAgICAgICAgICB0b1tpXSA9IEBwZWVrVUludDgob2Zmc2V0ICsgaSlcblxuICAgICAgICByZXR1cm4gcmVzdWx0XG5cbiAgICByZWFkU2luZ2xlQnVmZmVyOiAobGVuZ3RoKSAtPlxuICAgICAgICByZXN1bHQgPSBAbGlzdC5maXJzdC5zbGljZShAbG9jYWxPZmZzZXQsIGxlbmd0aClcbiAgICAgICAgQGFkdmFuY2UocmVzdWx0Lmxlbmd0aClcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuXG4gICAgcGVla1NpbmdsZUJ1ZmZlcjogKG9mZnNldCwgbGVuZ3RoKSAtPlxuICAgICAgICByZXN1bHQgPSBAbGlzdC5maXJzdC5zbGljZShAbG9jYWxPZmZzZXQgKyBvZmZzZXQsIGxlbmd0aClcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIFxuICAgIHJlYWRTdHJpbmc6IChsZW5ndGgsIGVuY29kaW5nID0gJ2FzY2lpJykgLT5cbiAgICAgICAgcmV0dXJuIGRlY29kZVN0cmluZy5jYWxsIHRoaXMsIDAsIGxlbmd0aCwgZW5jb2RpbmcsIHRydWVcblxuICAgIHBlZWtTdHJpbmc6IChvZmZzZXQgPSAwLCBsZW5ndGgsIGVuY29kaW5nID0gJ2FzY2lpJykgLT5cbiAgICAgICAgcmV0dXJuIGRlY29kZVN0cmluZy5jYWxsIHRoaXMsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZywgZmFsc2VcblxuICAgIGRlY29kZVN0cmluZyA9IChvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcsIGFkdmFuY2UpIC0+XG4gICAgICAgIGVuY29kaW5nID0gZW5jb2RpbmcudG9Mb3dlckNhc2UoKVxuICAgICAgICBudWxsRW5kID0gaWYgbGVuZ3RoIGlzIG51bGwgdGhlbiAwIGVsc2UgLTFcblxuICAgICAgICBsZW5ndGggPSBJbmZpbml0eSBpZiBub3QgbGVuZ3RoP1xuICAgICAgICBlbmQgPSBvZmZzZXQgKyBsZW5ndGhcbiAgICAgICAgcmVzdWx0ID0gJydcblxuICAgICAgICBzd2l0Y2ggZW5jb2RpbmdcbiAgICAgICAgICAgIHdoZW4gJ2FzY2lpJywgJ2xhdGluMSdcbiAgICAgICAgICAgICAgICB3aGlsZSBvZmZzZXQgPCBlbmQgYW5kIChjID0gQHBlZWtVSW50OChvZmZzZXQrKykpIGlzbnQgbnVsbEVuZFxuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjKVxuXG4gICAgICAgICAgICB3aGVuICd1dGY4JywgJ3V0Zi04J1xuICAgICAgICAgICAgICAgIHdoaWxlIG9mZnNldCA8IGVuZCBhbmQgKGIxID0gQHBlZWtVSW50OChvZmZzZXQrKykpIGlzbnQgbnVsbEVuZFxuICAgICAgICAgICAgICAgICAgICBpZiAoYjEgJiAweDgwKSBpcyAwXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSBiMVxuXG4gICAgICAgICAgICAgICAgICAgICMgb25lIGNvbnRpbnVhdGlvbiAoMTI4IHRvIDIwNDcpXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGIxICYgMHhlMCkgaXMgMHhjMFxuICAgICAgICAgICAgICAgICAgICAgICAgYjIgPSBAcGVla1VJbnQ4KG9mZnNldCsrKSAmIDB4M2ZcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlICgoYjEgJiAweDFmKSA8PCA2KSB8IGIyXG5cbiAgICAgICAgICAgICAgICAgICAgIyB0d28gY29udGludWF0aW9uICgyMDQ4IHRvIDU1Mjk1IGFuZCA1NzM0NCB0byA2NTUzNSlcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoYjEgJiAweGYwKSBpcyAweGUwXG4gICAgICAgICAgICAgICAgICAgICAgICBiMiA9IEBwZWVrVUludDgob2Zmc2V0KyspICYgMHgzZlxuICAgICAgICAgICAgICAgICAgICAgICAgYjMgPSBAcGVla1VJbnQ4KG9mZnNldCsrKSAmIDB4M2ZcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlICgoYjEgJiAweDBmKSA8PCAxMikgfCAoYjIgPDwgNikgfCBiM1xuXG4gICAgICAgICAgICAgICAgICAgICMgdGhyZWUgY29udGludWF0aW9uICg2NTUzNiB0byAxMTE0MTExKVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChiMSAmIDB4ZjgpIGlzIDB4ZjBcbiAgICAgICAgICAgICAgICAgICAgICAgIGIyID0gQHBlZWtVSW50OChvZmZzZXQrKykgJiAweDNmXG4gICAgICAgICAgICAgICAgICAgICAgICBiMyA9IEBwZWVrVUludDgob2Zmc2V0KyspICYgMHgzZlxuICAgICAgICAgICAgICAgICAgICAgICAgYjQgPSBAcGVla1VJbnQ4KG9mZnNldCsrKSAmIDB4M2ZcblxuICAgICAgICAgICAgICAgICAgICAgICAgIyBzcGxpdCBpbnRvIGEgc3Vycm9nYXRlIHBhaXJcbiAgICAgICAgICAgICAgICAgICAgICAgIHB0ID0gKCgoYjEgJiAweDBmKSA8PCAxOCkgfCAoYjIgPDwgMTIpIHwgKGIzIDw8IDYpIHwgYjQpIC0gMHgxMDAwMFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUgMHhkODAwICsgKHB0ID4+IDEwKSwgMHhkYzAwICsgKHB0ICYgMHgzZmYpXG5cbiAgICAgICAgICAgIHdoZW4gJ3V0ZjE2LWJlJywgJ3V0ZjE2YmUnLCAndXRmMTZsZScsICd1dGYxNi1sZScsICd1dGYxNmJvbScsICd1dGYxNi1ib20nXG4gICAgICAgICAgICAgICAgIyBmaW5kIGVuZGlhbm5lc3NcbiAgICAgICAgICAgICAgICBzd2l0Y2ggZW5jb2RpbmdcbiAgICAgICAgICAgICAgICAgICAgd2hlbiAndXRmMTZiZScsICd1dGYxNi1iZSdcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpdHRsZUVuZGlhbiA9IGZhbHNlXG5cbiAgICAgICAgICAgICAgICAgICAgd2hlbiAndXRmMTZsZScsICd1dGYxNi1sZSdcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpdHRsZUVuZGlhbiA9IHRydWVcblxuICAgICAgICAgICAgICAgICAgICB3aGVuICd1dGYxNmJvbScsICd1dGYxNi1ib20nXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiBsZW5ndGggPCAyIG9yIChib20gPSBAcGVla1VJbnQxNihvZmZzZXQpKSBpcyBudWxsRW5kXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgQGFkdmFuY2Ugb2Zmc2V0ICs9IDIgaWYgYWR2YW5jZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRcblxuICAgICAgICAgICAgICAgICAgICAgICAgbGl0dGxlRW5kaWFuID0gKGJvbSBpcyAweGZmZmUpXG4gICAgICAgICAgICAgICAgICAgICAgICBvZmZzZXQgKz0gMlxuXG4gICAgICAgICAgICAgICAgd2hpbGUgb2Zmc2V0IDwgZW5kIGFuZCAodzEgPSBAcGVla1VJbnQxNihvZmZzZXQsIGxpdHRsZUVuZGlhbikpIGlzbnQgbnVsbEVuZFxuICAgICAgICAgICAgICAgICAgICBvZmZzZXQgKz0gMlxuXG4gICAgICAgICAgICAgICAgICAgIGlmIHcxIDwgMHhkODAwIG9yIHcxID4gMHhkZmZmXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSh3MSlcblxuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiB3MSA+IDB4ZGJmZlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciBcIkludmFsaWQgdXRmMTYgc2VxdWVuY2UuXCJcblxuICAgICAgICAgICAgICAgICAgICAgICAgdzIgPSBAcGVla1VJbnQxNihvZmZzZXQsIGxpdHRsZUVuZGlhbilcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIHcyIDwgMHhkYzAwIG9yIHcyID4gMHhkZmZmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIFwiSW52YWxpZCB1dGYxNiBzZXF1ZW5jZS5cIlxuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSh3MSwgdzIpXG4gICAgICAgICAgICAgICAgICAgICAgICBvZmZzZXQgKz0gMlxuXG4gICAgICAgICAgICAgICAgaWYgdzEgaXMgbnVsbEVuZFxuICAgICAgICAgICAgICAgICAgICBvZmZzZXQgKz0gMlxuXG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIFwiVW5rbm93biBlbmNvZGluZzogI3tlbmNvZGluZ31cIlxuXG4gICAgICAgIEBhZHZhbmNlIG9mZnNldCBpZiBhZHZhbmNlXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgXG5tb2R1bGUuZXhwb3J0cyA9IFN0cmVhbVxuIiwiIyBkZWZpbmUgYW4gZXJyb3IgY2xhc3MgdG8gYmUgdGhyb3duIGlmIGFuIHVuZGVyZmxvdyBvY2N1cnNcbmNsYXNzIFVuZGVyZmxvd0Vycm9yIGV4dGVuZHMgRXJyb3JcbiAgICBjb25zdHJ1Y3RvcjogLT5cbiAgICAgICAgc3VwZXJcbiAgICAgICAgQG5hbWUgPSAnVW5kZXJmbG93RXJyb3InXG4gICAgICAgIEBzdGFjayA9IG5ldyBFcnJvcigpLnN0YWNrXG5cbm1vZHVsZS5leHBvcnRzID0gVW5kZXJmbG93RXJyb3JcbiIsIkV2ZW50RW1pdHRlciA9IHJlcXVpcmUgJy4vY29yZS9ldmVudHMnXG5CdWZmZXJMaXN0ID0gcmVxdWlyZSAnLi9jb3JlL2J1ZmZlcmxpc3QnXG5TdHJlYW0gPSByZXF1aXJlICcuL2NvcmUvc3RyZWFtJ1xuQml0c3RyZWFtID0gcmVxdWlyZSAnLi9jb3JlL2JpdHN0cmVhbSdcblVuZGVyZmxvd0Vycm9yID0gcmVxdWlyZSAnLi9jb3JlL3VuZGVyZmxvdydcblxuY2xhc3MgRGVjb2RlciBleHRlbmRzIEV2ZW50RW1pdHRlclxuICAgIGNvbnN0cnVjdG9yOiAoQGRlbXV4ZXIsIEBmb3JtYXQpIC0+XG4gICAgICAgIGxpc3QgPSBuZXcgQnVmZmVyTGlzdFxuICAgICAgICBAc3RyZWFtID0gbmV3IFN0cmVhbShsaXN0KVxuICAgICAgICBAYml0c3RyZWFtID0gbmV3IEJpdHN0cmVhbShAc3RyZWFtKVxuICAgICAgICBcbiAgICAgICAgQHJlY2VpdmVkRmluYWxCdWZmZXIgPSBmYWxzZVxuICAgICAgICBAd2FpdGluZyA9IGZhbHNlXG4gICAgICAgIFxuICAgICAgICBAZGVtdXhlci5vbiAnY29va2llJywgKGNvb2tpZSkgPT5cbiAgICAgICAgICAgIHRyeVxuICAgICAgICAgICAgICAgIEBzZXRDb29raWUgY29va2llXG4gICAgICAgICAgICBjYXRjaCBlcnJvclxuICAgICAgICAgICAgICAgIEBlbWl0ICdlcnJvcicsIGVycm9yXG4gICAgICAgICAgICBcbiAgICAgICAgQGRlbXV4ZXIub24gJ2RhdGEnLCAoY2h1bmspID0+XG4gICAgICAgICAgICBsaXN0LmFwcGVuZCBjaHVua1xuICAgICAgICAgICAgQGRlY29kZSgpIGlmIEB3YWl0aW5nXG4gICAgICAgICAgICBcbiAgICAgICAgQGRlbXV4ZXIub24gJ2VuZCcsID0+XG4gICAgICAgICAgICBAcmVjZWl2ZWRGaW5hbEJ1ZmZlciA9IHRydWVcbiAgICAgICAgICAgIEBkZWNvZGUoKSBpZiBAd2FpdGluZ1xuICAgICAgICAgICAgXG4gICAgICAgIEBpbml0KClcbiAgICAgICAgICAgIFxuICAgIGluaXQ6IC0+XG4gICAgICAgIHJldHVyblxuICAgICAgICAgICAgXG4gICAgc2V0Q29va2llOiAoY29va2llKSAtPlxuICAgICAgICByZXR1cm5cbiAgICBcbiAgICByZWFkQ2h1bms6IC0+XG4gICAgICAgIHJldHVyblxuICAgICAgICBcbiAgICBkZWNvZGU6IC0+XG4gICAgICAgIEB3YWl0aW5nID0gZmFsc2VcbiAgICAgICAgb2Zmc2V0ID0gQGJpdHN0cmVhbS5vZmZzZXQoKVxuICAgICAgICBcbiAgICAgICAgdHJ5XG4gICAgICAgICAgICBwYWNrZXQgPSBAcmVhZENodW5rKClcbiAgICAgICAgY2F0Y2ggZXJyb3JcbiAgICAgICAgICAgIGlmIGVycm9yIG5vdCBpbnN0YW5jZW9mIFVuZGVyZmxvd0Vycm9yXG4gICAgICAgICAgICAgICAgQGVtaXQgJ2Vycm9yJywgZXJyb3JcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgICAgIFxuICAgICAgICAjIGlmIGEgcGFja2V0IHdhcyBzdWNjZXNzZnVsbHkgcmVhZCwgZW1pdCBpdFxuICAgICAgICBpZiBwYWNrZXRcbiAgICAgICAgICAgIEBlbWl0ICdkYXRhJywgcGFja2V0XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICAgICAgXG4gICAgICAgICMgaWYgd2UgaGF2ZW4ndCByZWFjaGVkIHRoZSBlbmQsIGp1bXAgYmFjayBhbmQgdHJ5IGFnYWluIHdoZW4gd2UgaGF2ZSBtb3JlIGRhdGFcbiAgICAgICAgZWxzZSBpZiBub3QgQHJlY2VpdmVkRmluYWxCdWZmZXJcbiAgICAgICAgICAgIEBiaXRzdHJlYW0uc2VlayBvZmZzZXRcbiAgICAgICAgICAgIEB3YWl0aW5nID0gdHJ1ZVxuICAgICAgICAgICAgXG4gICAgICAgICMgb3RoZXJ3aXNlIHdlJ3ZlIHJlYWNoZWQgdGhlIGVuZFxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBAZW1pdCAnZW5kJ1xuICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICBcbiAgICBzZWVrOiAodGltZXN0YW1wKSAtPlxuICAgICAgICAjIHVzZSB0aGUgZGVtdXhlciB0byBnZXQgYSBzZWVrIHBvaW50XG4gICAgICAgIHNlZWtQb2ludCA9IEBkZW11eGVyLnNlZWsodGltZXN0YW1wKVxuICAgICAgICBAc3RyZWFtLnNlZWsoc2Vla1BvaW50Lm9mZnNldClcbiAgICAgICAgcmV0dXJuIHNlZWtQb2ludC50aW1lc3RhbXBcbiAgICBcbiAgICBjb2RlY3MgPSB7fVxuICAgIEByZWdpc3RlcjogKGlkLCBkZWNvZGVyKSAtPlxuICAgICAgICBjb2RlY3NbaWRdID0gZGVjb2RlclxuICAgICAgICBcbiAgICBAZmluZDogKGlkKSAtPlxuICAgICAgICByZXR1cm4gY29kZWNzW2lkXSBvciBudWxsXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBEZWNvZGVyXG4iLCJEZWNvZGVyID0gcmVxdWlyZSAnLi4vZGVjb2RlcidcblxuY2xhc3MgTFBDTURlY29kZXIgZXh0ZW5kcyBEZWNvZGVyXG4gICAgRGVjb2Rlci5yZWdpc3RlcignbHBjbScsIExQQ01EZWNvZGVyKVxuICAgIFxuICAgIHJlYWRDaHVuazogPT5cbiAgICAgICAgc3RyZWFtID0gQHN0cmVhbVxuICAgICAgICBsaXR0bGVFbmRpYW4gPSBAZm9ybWF0LmxpdHRsZUVuZGlhblxuICAgICAgICBjaHVua1NpemUgPSBNYXRoLm1pbig0MDk2LCBzdHJlYW0ucmVtYWluaW5nQnl0ZXMoKSlcbiAgICAgICAgc2FtcGxlcyA9IGNodW5rU2l6ZSAvIChAZm9ybWF0LmJpdHNQZXJDaGFubmVsIC8gOCkgfCAwXG4gICAgICAgIFxuICAgICAgICBpZiBjaHVua1NpemUgPCBAZm9ybWF0LmJpdHNQZXJDaGFubmVsIC8gOFxuICAgICAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgXG4gICAgICAgIGlmIEBmb3JtYXQuZmxvYXRpbmdQb2ludFxuICAgICAgICAgICAgc3dpdGNoIEBmb3JtYXQuYml0c1BlckNoYW5uZWxcbiAgICAgICAgICAgICAgICB3aGVuIDMyXG4gICAgICAgICAgICAgICAgICAgIG91dHB1dCA9IG5ldyBGbG9hdDMyQXJyYXkoc2FtcGxlcylcbiAgICAgICAgICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzXSBieSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRwdXRbaV0gPSBzdHJlYW0ucmVhZEZsb2F0MzIobGl0dGxlRW5kaWFuKVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgd2hlbiA2NFxuICAgICAgICAgICAgICAgICAgICBvdXRwdXQgPSBuZXcgRmxvYXQ2NEFycmF5KHNhbXBsZXMpXG4gICAgICAgICAgICAgICAgICAgIGZvciBpIGluIFswLi4uc2FtcGxlc10gYnkgMVxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0cHV0W2ldID0gc3RyZWFtLnJlYWRGbG9hdDY0KGxpdHRsZUVuZGlhbilcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yICdVbnN1cHBvcnRlZCBiaXQgZGVwdGguJ1xuICAgICAgICAgICAgXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHN3aXRjaCBAZm9ybWF0LmJpdHNQZXJDaGFubmVsXG4gICAgICAgICAgICAgICAgd2hlbiA4XG4gICAgICAgICAgICAgICAgICAgIG91dHB1dCA9IG5ldyBJbnQ4QXJyYXkoc2FtcGxlcylcbiAgICAgICAgICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzXSBieSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRwdXRbaV0gPSBzdHJlYW0ucmVhZEludDgoKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHdoZW4gMTZcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0ID0gbmV3IEludDE2QXJyYXkoc2FtcGxlcylcbiAgICAgICAgICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzXSBieSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRwdXRbaV0gPSBzdHJlYW0ucmVhZEludDE2KGxpdHRsZUVuZGlhbilcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgd2hlbiAyNFxuICAgICAgICAgICAgICAgICAgICBvdXRwdXQgPSBuZXcgSW50MzJBcnJheShzYW1wbGVzKVxuICAgICAgICAgICAgICAgICAgICBmb3IgaSBpbiBbMC4uLnNhbXBsZXNdIGJ5IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dHB1dFtpXSA9IHN0cmVhbS5yZWFkSW50MjQobGl0dGxlRW5kaWFuKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHdoZW4gMzJcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0ID0gbmV3IEludDMyQXJyYXkoc2FtcGxlcylcbiAgICAgICAgICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzXSBieSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRwdXRbaV0gPSBzdHJlYW0ucmVhZEludDMyKGxpdHRsZUVuZGlhbilcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgJ1Vuc3VwcG9ydGVkIGJpdCBkZXB0aC4nXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gb3V0cHV0IiwiRGVjb2RlciA9IHJlcXVpcmUgJy4uL2RlY29kZXInXG5cbmNsYXNzIFhMQVdEZWNvZGVyIGV4dGVuZHMgRGVjb2RlclxuICAgIERlY29kZXIucmVnaXN0ZXIoJ3VsYXcnLCBYTEFXRGVjb2RlcilcbiAgICBEZWNvZGVyLnJlZ2lzdGVyKCdhbGF3JywgWExBV0RlY29kZXIpXG4gICAgXG4gICAgU0lHTl9CSVQgICA9IDB4ODBcbiAgICBRVUFOVF9NQVNLID0gMHhmXG4gICAgU0VHX1NISUZUICA9IDRcbiAgICBTRUdfTUFTSyAgID0gMHg3MFxuICAgIEJJQVMgICAgICAgPSAweDg0XG4gICAgXG4gICAgaW5pdDogLT5cbiAgICAgICAgQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCA9IDE2XG4gICAgICAgIEB0YWJsZSA9IHRhYmxlID0gbmV3IEludDE2QXJyYXkoMjU2KVxuICAgICAgICBcbiAgICAgICAgaWYgQGZvcm1hdC5mb3JtYXRJRCBpcyAndWxhdydcbiAgICAgICAgICAgIGZvciBpIGluIFswLi4uMjU2XVxuICAgICAgICAgICAgICAgICMgQ29tcGxlbWVudCB0byBvYnRhaW4gbm9ybWFsIHUtbGF3IHZhbHVlLlxuICAgICAgICAgICAgICAgIHZhbCA9IH5pXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAjIEV4dHJhY3QgYW5kIGJpYXMgdGhlIHF1YW50aXphdGlvbiBiaXRzLiBUaGVuXG4gICAgICAgICAgICAgICAgIyBzaGlmdCB1cCBieSB0aGUgc2VnbWVudCBudW1iZXIgYW5kIHN1YnRyYWN0IG91dCB0aGUgYmlhcy5cbiAgICAgICAgICAgICAgICB0ID0gKCh2YWwgJiBRVUFOVF9NQVNLKSA8PCAzKSArIEJJQVNcbiAgICAgICAgICAgICAgICB0IDw8PSAodmFsICYgU0VHX01BU0spID4+PiBTRUdfU0hJRlRcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHRhYmxlW2ldID0gaWYgdmFsICYgU0lHTl9CSVQgdGhlbiBCSUFTIC0gdCBlbHNlIHQgLSBCSUFTXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBmb3IgaSBpbiBbMC4uLjI1Nl1cbiAgICAgICAgICAgICAgICB2YWwgPSBpIF4gMHg1NVxuICAgICAgICAgICAgICAgIHQgPSB2YWwgJiBRVUFOVF9NQVNLXG4gICAgICAgICAgICAgICAgc2VnID0gKHZhbCAmIFNFR19NQVNLKSA+Pj4gU0VHX1NISUZUXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgc2VnXG4gICAgICAgICAgICAgICAgICAgIHQgPSAodCArIHQgKyAxICsgMzIpIDw8IChzZWcgKyAyKVxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgdCA9ICh0ICsgdCArIDEpIDw8IDNcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgdGFibGVbaV0gPSBpZiB2YWwgJiBTSUdOX0JJVCB0aGVuIHQgZWxzZSAtdFxuICAgICAgICAgICAgICAgIFxuICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIFxuICAgIHJlYWRDaHVuazogPT5cbiAgICAgICAge3N0cmVhbSwgdGFibGV9ID0gdGhpc1xuICAgICAgICBcbiAgICAgICAgc2FtcGxlcyA9IE1hdGgubWluKDQwOTYsIEBzdHJlYW0ucmVtYWluaW5nQnl0ZXMoKSlcbiAgICAgICAgcmV0dXJuIGlmIHNhbXBsZXMgaXMgMFxuICAgICAgICBcbiAgICAgICAgb3V0cHV0ID0gbmV3IEludDE2QXJyYXkoc2FtcGxlcylcbiAgICAgICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzXSBieSAxXG4gICAgICAgICAgICBvdXRwdXRbaV0gPSB0YWJsZVtzdHJlYW0ucmVhZFVJbnQ4KCldXG4gICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuIG91dHB1dCIsIkV2ZW50RW1pdHRlciA9IHJlcXVpcmUgJy4vY29yZS9ldmVudHMnXG5CdWZmZXJMaXN0ID0gcmVxdWlyZSAnLi9jb3JlL2J1ZmZlcmxpc3QnXG5TdHJlYW0gPSByZXF1aXJlICcuL2NvcmUvc3RyZWFtJ1xuXG5jbGFzcyBEZW11eGVyIGV4dGVuZHMgRXZlbnRFbWl0dGVyXG4gICAgQHByb2JlOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICBcbiAgICBjb25zdHJ1Y3RvcjogKHNvdXJjZSwgY2h1bmspIC0+XG4gICAgICAgIGxpc3QgPSBuZXcgQnVmZmVyTGlzdFxuICAgICAgICBsaXN0LmFwcGVuZCBjaHVua1xuICAgICAgICBAc3RyZWFtID0gbmV3IFN0cmVhbShsaXN0KVxuICAgICAgICBcbiAgICAgICAgcmVjZWl2ZWQgPSBmYWxzZVxuICAgICAgICBzb3VyY2Uub24gJ2RhdGEnLCAoY2h1bmspID0+XG4gICAgICAgICAgICByZWNlaXZlZCA9IHRydWVcbiAgICAgICAgICAgIGxpc3QuYXBwZW5kIGNodW5rXG4gICAgICAgICAgICBAcmVhZENodW5rIGNodW5rXG4gICAgICAgICAgICBcbiAgICAgICAgc291cmNlLm9uICdlcnJvcicsIChlcnIpID0+XG4gICAgICAgICAgICBAZW1pdCAnZXJyb3InLCBlcnJcbiAgICAgICAgICAgIFxuICAgICAgICBzb3VyY2Uub24gJ2VuZCcsID0+XG4gICAgICAgICAgICAjIGlmIHRoZXJlIHdhcyBvbmx5IG9uZSBjaHVuayByZWNlaXZlZCwgcmVhZCBpdFxuICAgICAgICAgICAgQHJlYWRDaHVuayBjaHVuayB1bmxlc3MgcmVjZWl2ZWRcbiAgICAgICAgICAgIEBlbWl0ICdlbmQnXG4gICAgICAgIFxuICAgICAgICBAc2Vla1BvaW50cyA9IFtdXG4gICAgICAgIEBpbml0KClcbiAgICAgICAgICAgIFxuICAgIGluaXQ6IC0+XG4gICAgICAgIHJldHVyblxuICAgICAgICAgICAgXG4gICAgcmVhZENodW5rOiAoY2h1bmspIC0+XG4gICAgICAgIHJldHVyblxuICAgICAgICBcbiAgICBhZGRTZWVrUG9pbnQ6IChvZmZzZXQsIHRpbWVzdGFtcCkgLT5cbiAgICAgICAgaW5kZXggPSBAc2VhcmNoVGltZXN0YW1wIHRpbWVzdGFtcFxuICAgICAgICBAc2Vla1BvaW50cy5zcGxpY2UgaW5kZXgsIDAsIFxuICAgICAgICAgICAgb2Zmc2V0OiBvZmZzZXRcbiAgICAgICAgICAgIHRpbWVzdGFtcDogdGltZXN0YW1wXG4gICAgICAgIFxuICAgIHNlYXJjaFRpbWVzdGFtcDogKHRpbWVzdGFtcCwgYmFja3dhcmQpIC0+XG4gICAgICAgIGxvdyA9IDBcbiAgICAgICAgaGlnaCA9IEBzZWVrUG9pbnRzLmxlbmd0aFxuICAgICAgICBcbiAgICAgICAgIyBvcHRpbWl6ZSBhcHBlbmRpbmcgZW50cmllc1xuICAgICAgICBpZiBoaWdoID4gMCBhbmQgQHNlZWtQb2ludHNbaGlnaCAtIDFdLnRpbWVzdGFtcCA8IHRpbWVzdGFtcFxuICAgICAgICAgICAgcmV0dXJuIGhpZ2hcbiAgICAgICAgXG4gICAgICAgIHdoaWxlIGxvdyA8IGhpZ2hcbiAgICAgICAgICAgIG1pZCA9IChsb3cgKyBoaWdoKSA+PiAxXG4gICAgICAgICAgICB0aW1lID0gQHNlZWtQb2ludHNbbWlkXS50aW1lc3RhbXBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgdGltZSA8IHRpbWVzdGFtcFxuICAgICAgICAgICAgICAgIGxvdyA9IG1pZCArIDFcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGVsc2UgaWYgdGltZSA+PSB0aW1lc3RhbXBcbiAgICAgICAgICAgICAgICBoaWdoID0gbWlkXG4gICAgICAgICAgICAgICAgXG4gICAgICAgIGlmIGhpZ2ggPiBAc2Vla1BvaW50cy5sZW5ndGhcbiAgICAgICAgICAgIGhpZ2ggPSBAc2Vla1BvaW50cy5sZW5ndGhcbiAgICAgICAgICAgIFxuICAgICAgICByZXR1cm4gaGlnaFxuICAgICAgICBcbiAgICBzZWVrOiAodGltZXN0YW1wKSAtPlxuICAgICAgICBpZiBAZm9ybWF0IGFuZCBAZm9ybWF0LmZyYW1lc1BlclBhY2tldCA+IDAgYW5kIEBmb3JtYXQuYnl0ZXNQZXJQYWNrZXQgPiAwXG4gICAgICAgICAgICBzZWVrUG9pbnQgPVxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogdGltZXN0YW1wXG4gICAgICAgICAgICAgICAgb2Zmc2V0OiBAZm9ybWF0LmJ5dGVzUGVyUGFja2V0ICogdGltZXN0YW1wIC8gQGZvcm1hdC5mcmFtZXNQZXJQYWNrZXRcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBzZWVrUG9pbnRcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgaW5kZXggPSBAc2VhcmNoVGltZXN0YW1wIHRpbWVzdGFtcFxuICAgICAgICAgICAgcmV0dXJuIEBzZWVrUG9pbnRzW2luZGV4XVxuICAgICAgICBcbiAgICBmb3JtYXRzID0gW11cbiAgICBAcmVnaXN0ZXI6IChkZW11eGVyKSAtPlxuICAgICAgICBmb3JtYXRzLnB1c2ggZGVtdXhlclxuICAgICAgICAgICAgXG4gICAgQGZpbmQ6IChidWZmZXIpIC0+XG4gICAgICAgIHN0cmVhbSA9IFN0cmVhbS5mcm9tQnVmZmVyKGJ1ZmZlcikgICAgICAgIFxuICAgICAgICBmb3IgZm9ybWF0IGluIGZvcm1hdHNcbiAgICAgICAgICAgIG9mZnNldCA9IHN0cmVhbS5vZmZzZXRcbiAgICAgICAgICAgIHRyeVxuICAgICAgICAgICAgICAgICByZXR1cm4gZm9ybWF0IGlmIGZvcm1hdC5wcm9iZShzdHJlYW0pXG4gICAgICAgICAgICBjYXRjaCBlXG4gICAgICAgICAgICAgICAgIyBhbiB1bmRlcmZsb3cgb3Igb3RoZXIgZXJyb3Igb2NjdXJyZWRcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHN0cmVhbS5zZWVrKG9mZnNldClcbiAgICAgICAgICAgIFxuICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gRGVtdXhlclxuIiwiRGVtdXhlciA9IHJlcXVpcmUgJy4uL2RlbXV4ZXInXG5cbmNsYXNzIEFJRkZEZW11eGVyIGV4dGVuZHMgRGVtdXhlclxuICAgIERlbXV4ZXIucmVnaXN0ZXIoQUlGRkRlbXV4ZXIpXG4gICAgXG4gICAgQHByb2JlOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gYnVmZmVyLnBlZWtTdHJpbmcoMCwgNCkgaXMgJ0ZPUk0nICYmIFxuICAgICAgICAgICAgICAgYnVmZmVyLnBlZWtTdHJpbmcoOCwgNCkgaW4gWydBSUZGJywgJ0FJRkMnXVxuICAgICAgICBcbiAgICByZWFkQ2h1bms6IC0+XG4gICAgICAgIGlmIG5vdCBAcmVhZFN0YXJ0IGFuZCBAc3RyZWFtLmF2YWlsYWJsZSgxMilcbiAgICAgICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBpc250ICdGT1JNJ1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnSW52YWxpZCBBSUZGLidcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIEBmaWxlU2l6ZSA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICBAZmlsZVR5cGUgPSBAc3RyZWFtLnJlYWRTdHJpbmcoNClcbiAgICAgICAgICAgIEByZWFkU3RhcnQgPSB0cnVlXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIEBmaWxlVHlwZSBub3QgaW4gWydBSUZGJywgJ0FJRkMnXVxuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnSW52YWxpZCBBSUZGLidcbiAgICAgICAgXG4gICAgICAgIHdoaWxlIEBzdHJlYW0uYXZhaWxhYmxlKDEpXG4gICAgICAgICAgICBpZiBub3QgQHJlYWRIZWFkZXJzIGFuZCBAc3RyZWFtLmF2YWlsYWJsZSg4KVxuICAgICAgICAgICAgICAgIEB0eXBlID0gQHN0cmVhbS5yZWFkU3RyaW5nKDQpXG4gICAgICAgICAgICAgICAgQGxlbiA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBzd2l0Y2ggQHR5cGVcbiAgICAgICAgICAgICAgICB3aGVuICdDT01NJ1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5sZXNzIEBzdHJlYW0uYXZhaWxhYmxlKEBsZW4pXG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBAZm9ybWF0ID1cbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1hdElEOiAnbHBjbSdcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5uZWxzUGVyRnJhbWU6IEBzdHJlYW0ucmVhZFVJbnQxNigpXG4gICAgICAgICAgICAgICAgICAgICAgICBzYW1wbGVDb3VudDogQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIGJpdHNQZXJDaGFubmVsOiBAc3RyZWFtLnJlYWRVSW50MTYoKVxuICAgICAgICAgICAgICAgICAgICAgICAgc2FtcGxlUmF0ZTogQHN0cmVhbS5yZWFkRmxvYXQ4MCgpXG4gICAgICAgICAgICAgICAgICAgICAgICBmcmFtZXNQZXJQYWNrZXQ6IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpdHRsZUVuZGlhbjogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIGZsb2F0aW5nUG9pbnQ6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQGZvcm1hdC5ieXRlc1BlclBhY2tldCA9IChAZm9ybWF0LmJpdHNQZXJDaGFubmVsIC8gOCkgKiBAZm9ybWF0LmNoYW5uZWxzUGVyRnJhbWVcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGlmIEBmaWxlVHlwZSBpcyAnQUlGQydcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1hdCA9IEBzdHJlYW0ucmVhZFN0cmluZyg0KVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBAZm9ybWF0LmxpdHRsZUVuZGlhbiA9IGZvcm1hdCBpcyAnc293dCcgYW5kIEBmb3JtYXQuYml0c1BlckNoYW5uZWwgPiA4XG4gICAgICAgICAgICAgICAgICAgICAgICBAZm9ybWF0LmZsb2F0aW5nUG9pbnQgPSBmb3JtYXQgaW4gWydmbDMyJywgJ2ZsNjQnXVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JtYXQgPSAnbHBjbScgaWYgZm9ybWF0IGluIFsndHdvcycsICdzb3d0JywgJ2ZsMzInLCAnZmw2NCcsICdOT05FJ11cbiAgICAgICAgICAgICAgICAgICAgICAgIEBmb3JtYXQuZm9ybWF0SUQgPSBmb3JtYXRcbiAgICAgICAgICAgICAgICAgICAgICAgIEBsZW4gLT0gNFxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIEBzdHJlYW0uYWR2YW5jZShAbGVuIC0gMTgpXG4gICAgICAgICAgICAgICAgICAgIEBlbWl0ICdmb3JtYXQnLCBAZm9ybWF0XG4gICAgICAgICAgICAgICAgICAgIEBlbWl0ICdkdXJhdGlvbicsIEBmb3JtYXQuc2FtcGxlQ291bnQgLyBAZm9ybWF0LnNhbXBsZVJhdGUgKiAxMDAwIHwgMFxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB3aGVuICdTU05EJ1xuICAgICAgICAgICAgICAgICAgICB1bmxlc3MgQHJlYWRTU05ESGVhZGVyIGFuZCBAc3RyZWFtLmF2YWlsYWJsZSg0KVxuICAgICAgICAgICAgICAgICAgICAgICAgb2Zmc2V0ID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KSAjIHNraXAgYmxvY2sgc2l6ZVxuICAgICAgICAgICAgICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKG9mZnNldCkgIyBza2lwIHRvIGRhdGFcbiAgICAgICAgICAgICAgICAgICAgICAgIEByZWFkU1NOREhlYWRlciA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBidWZmZXIgPSBAc3RyZWFtLnJlYWRTaW5nbGVCdWZmZXIoQGxlbilcbiAgICAgICAgICAgICAgICAgICAgQGxlbiAtPSBidWZmZXIubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgIEByZWFkSGVhZGVycyA9IEBsZW4gPiAwXG4gICAgICAgICAgICAgICAgICAgIEBlbWl0ICdkYXRhJywgYnVmZmVyXG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHVubGVzcyBAc3RyZWFtLmF2YWlsYWJsZShAbGVuKVxuICAgICAgICAgICAgICAgICAgICBAc3RyZWFtLmFkdmFuY2UoQGxlbilcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgQHJlYWRIZWFkZXJzID0gZmFsc2UgdW5sZXNzIEB0eXBlIGlzICdTU05EJ1xuICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiIsIkRlbXV4ZXIgPSByZXF1aXJlICcuLi9kZW11eGVyJ1xuXG5jbGFzcyBBVURlbXV4ZXIgZXh0ZW5kcyBEZW11eGVyXG4gICAgRGVtdXhlci5yZWdpc3RlcihBVURlbXV4ZXIpXG4gICAgXG4gICAgQHByb2JlOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gYnVmZmVyLnBlZWtTdHJpbmcoMCwgNCkgaXMgJy5zbmQnXG4gICAgICAgIFxuICAgIGJwcyA9IFs4LCA4LCAxNiwgMjQsIDMyLCAzMiwgNjRdXG4gICAgYnBzWzI2XSA9IDhcbiAgICBcbiAgICBmb3JtYXRzID0gXG4gICAgICAgIDE6ICd1bGF3J1xuICAgICAgICAyNzogJ2FsYXcnXG4gICAgICAgIFxuICAgIHJlYWRDaHVuazogLT5cbiAgICAgICAgaWYgbm90IEByZWFkSGVhZGVyIGFuZCBAc3RyZWFtLmF2YWlsYWJsZSgyNClcbiAgICAgICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBpc250ICcuc25kJ1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnSW52YWxpZCBBVSBmaWxlLidcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHNpemUgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgZGF0YVNpemUgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgZW5jb2RpbmcgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBAZm9ybWF0ID0gXG4gICAgICAgICAgICAgICAgZm9ybWF0SUQ6IGZvcm1hdHNbZW5jb2RpbmddIG9yICdscGNtJ1xuICAgICAgICAgICAgICAgIGxpdHRsZUVuZGlhbjogZmFsc2VcbiAgICAgICAgICAgICAgICBmbG9hdGluZ1BvaW50OiBlbmNvZGluZyBpbiBbNiwgN11cbiAgICAgICAgICAgICAgICBiaXRzUGVyQ2hhbm5lbDogYnBzW2VuY29kaW5nIC0gMV1cbiAgICAgICAgICAgICAgICBzYW1wbGVSYXRlOiBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgICAgIGNoYW5uZWxzUGVyRnJhbWU6IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICAgICAgZnJhbWVzUGVyUGFja2V0OiAxXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIG5vdCBAZm9ybWF0LmJpdHNQZXJDaGFubmVsP1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnVW5zdXBwb3J0ZWQgZW5jb2RpbmcgaW4gQVUgZmlsZS4nXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEBmb3JtYXQuYnl0ZXNQZXJQYWNrZXQgPSAoQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCAvIDgpICogQGZvcm1hdC5jaGFubmVsc1BlckZyYW1lXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIGRhdGFTaXplIGlzbnQgMHhmZmZmZmZmZlxuICAgICAgICAgICAgICAgIGJ5dGVzID0gQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCAvIDhcbiAgICAgICAgICAgICAgICBAZW1pdCAnZHVyYXRpb24nLCBkYXRhU2l6ZSAvIGJ5dGVzIC8gQGZvcm1hdC5jaGFubmVsc1BlckZyYW1lIC8gQGZvcm1hdC5zYW1wbGVSYXRlICogMTAwMCB8IDBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgQGVtaXQgJ2Zvcm1hdCcsIEBmb3JtYXRcbiAgICAgICAgICAgIEByZWFkSGVhZGVyID0gdHJ1ZVxuICAgICAgICAgICAgXG4gICAgICAgIGlmIEByZWFkSGVhZGVyXG4gICAgICAgICAgICB3aGlsZSBAc3RyZWFtLmF2YWlsYWJsZSgxKVxuICAgICAgICAgICAgICAgIEBlbWl0ICdkYXRhJywgQHN0cmVhbS5yZWFkU2luZ2xlQnVmZmVyKEBzdHJlYW0ucmVtYWluaW5nQnl0ZXMoKSlcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuIiwiRGVtdXhlciA9IHJlcXVpcmUgJy4uL2RlbXV4ZXInXG5NNEFEZW11eGVyID0gcmVxdWlyZSAnLi9tNGEnXG5cbmNsYXNzIENBRkRlbXV4ZXIgZXh0ZW5kcyBEZW11eGVyXG4gICAgRGVtdXhlci5yZWdpc3RlcihDQUZEZW11eGVyKVxuICAgIFxuICAgIEBwcm9iZTogKGJ1ZmZlcikgLT5cbiAgICAgICAgcmV0dXJuIGJ1ZmZlci5wZWVrU3RyaW5nKDAsIDQpIGlzICdjYWZmJ1xuICAgICAgICBcbiAgICByZWFkQ2h1bms6IC0+XG4gICAgICAgIGlmIG5vdCBAZm9ybWF0IGFuZCBAc3RyZWFtLmF2YWlsYWJsZSg2NCkgIyBOdW1iZXIgb3V0IG9mIG15IGJlaGluZFxuICAgICAgICAgICAgaWYgQHN0cmVhbS5yZWFkU3RyaW5nKDQpIGlzbnQgJ2NhZmYnXG4gICAgICAgICAgICAgICAgcmV0dXJuIEBlbWl0ICdlcnJvcicsIFwiSW52YWxpZCBDQUYsIGRvZXMgbm90IGJlZ2luIHdpdGggJ2NhZmYnXCJcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICMgc2tpcCB2ZXJzaW9uIGFuZCBmbGFnc1xuICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBpc250ICdkZXNjJ1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCBcIkludmFsaWQgQ0FGLCAnY2FmZicgaXMgbm90IGZvbGxvd2VkIGJ5ICdkZXNjJ1wiXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB1bmxlc3MgQHN0cmVhbS5yZWFkVUludDMyKCkgaXMgMCBhbmQgQHN0cmVhbS5yZWFkVUludDMyKCkgaXMgMzJcbiAgICAgICAgICAgICAgICByZXR1cm4gQGVtaXQgJ2Vycm9yJywgXCJJbnZhbGlkICdkZXNjJyBzaXplLCBzaG91bGQgYmUgMzJcIlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgQGZvcm1hdCA9IHt9XG4gICAgICAgICAgICBAZm9ybWF0LnNhbXBsZVJhdGUgPSBAc3RyZWFtLnJlYWRGbG9hdDY0KClcbiAgICAgICAgICAgIEBmb3JtYXQuZm9ybWF0SUQgPSBAc3RyZWFtLnJlYWRTdHJpbmcoNClcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxhZ3MgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgaWYgQGZvcm1hdC5mb3JtYXRJRCBpcyAnbHBjbSdcbiAgICAgICAgICAgICAgICBAZm9ybWF0LmZsb2F0aW5nUG9pbnQgPSBCb29sZWFuKGZsYWdzICYgMSlcbiAgICAgICAgICAgICAgICBAZm9ybWF0LmxpdHRsZUVuZGlhbiA9IEJvb2xlYW4oZmxhZ3MgJiAyKVxuICAgICAgICAgICAgIFxuICAgICAgICAgICAgQGZvcm1hdC5ieXRlc1BlclBhY2tldCA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICBAZm9ybWF0LmZyYW1lc1BlclBhY2tldCA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICBAZm9ybWF0LmNoYW5uZWxzUGVyRnJhbWUgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBAZW1pdCAnZm9ybWF0JywgQGZvcm1hdFxuICAgICAgICAgICAgXG4gICAgICAgIHdoaWxlIEBzdHJlYW0uYXZhaWxhYmxlKDEpXG4gICAgICAgICAgICB1bmxlc3MgQGhlYWRlckNhY2hlXG4gICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID1cbiAgICAgICAgICAgICAgICAgICAgdHlwZTogQHN0cmVhbS5yZWFkU3RyaW5nKDQpXG4gICAgICAgICAgICAgICAgICAgIG92ZXJzaXplOiBAc3RyZWFtLnJlYWRVSW50MzIoKSBpc250IDBcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiBAaGVhZGVyQ2FjaGUub3ZlcnNpemVcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEBlbWl0ICdlcnJvcicsIFwiSG9seSBTaGl0LCBhbiBvdmVyc2l6ZWQgZmlsZSwgbm90IHN1cHBvcnRlZCBpbiBKU1wiXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHN3aXRjaCBAaGVhZGVyQ2FjaGUudHlwZVxuICAgICAgICAgICAgICAgIHdoZW4gJ2t1a2knXG4gICAgICAgICAgICAgICAgICAgIGlmIEBzdHJlYW0uYXZhaWxhYmxlKEBoZWFkZXJDYWNoZS5zaXplKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgQGZvcm1hdC5mb3JtYXRJRCBpcyAnYWFjICcgIyB2YXJpYXRpb25zIG5lZWRlZD9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvZmZzZXQgPSBAc3RyZWFtLm9mZnNldCArIEBoZWFkZXJDYWNoZS5zaXplXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgY29va2llID0gTTRBRGVtdXhlci5yZWFkRXNkcyhAc3RyZWFtKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBAZW1pdCAnY29va2llJywgY29va2llXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEBzdHJlYW0uc2VlayBvZmZzZXQgIyBza2lwIGV4dHJhIGdhcmJhZ2VcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnVmZmVyID0gQHN0cmVhbS5yZWFkQnVmZmVyKEBoZWFkZXJDYWNoZS5zaXplKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEBlbWl0ICdjb29raWUnLCBidWZmZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID0gbnVsbFxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgd2hlbiAncGFrdCdcbiAgICAgICAgICAgICAgICAgICAgaWYgQHN0cmVhbS5hdmFpbGFibGUoQGhlYWRlckNhY2hlLnNpemUpXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiBAc3RyZWFtLnJlYWRVSW50MzIoKSBpc250IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gQGVtaXQgJ2Vycm9yJywgJ1NpemVzIGdyZWF0ZXIgdGhhbiAzMiBiaXRzIGFyZSBub3Qgc3VwcG9ydGVkLidcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIEBudW1QYWNrZXRzID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgQHN0cmVhbS5yZWFkVUludDMyKCkgaXNudCAwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEBlbWl0ICdlcnJvcicsICdTaXplcyBncmVhdGVyIHRoYW4gMzIgYml0cyBhcmUgbm90IHN1cHBvcnRlZC4nXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBAbnVtRnJhbWVzID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIEBwcmltaW5nRnJhbWVzID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIEByZW1haW5kZXJGcmFtZXMgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBAZW1pdCAnZHVyYXRpb24nLCBAbnVtRnJhbWVzIC8gQGZvcm1hdC5zYW1wbGVSYXRlICogMTAwMCB8IDBcbiAgICAgICAgICAgICAgICAgICAgICAgIEBzZW50RHVyYXRpb24gPSB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ5dGVPZmZzZXQgPSAwXG4gICAgICAgICAgICAgICAgICAgICAgICBzYW1wbGVPZmZzZXQgPSAwXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgaSBpbiBbMC4uLkBudW1QYWNrZXRzXSBieSAxXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgQGFkZFNlZWtQb2ludCBieXRlT2Zmc2V0LCBzYW1wbGVPZmZzZXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBieXRlT2Zmc2V0ICs9IEBmb3JtYXQuYnl0ZXNQZXJQYWNrZXQgb3IgTTRBRGVtdXhlci5yZWFkRGVzY3JMZW4oQHN0cmVhbSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzYW1wbGVPZmZzZXQgKz0gQGZvcm1hdC5mcmFtZXNQZXJQYWNrZXQgb3IgTTRBRGVtdXhlci5yZWFkRGVzY3JMZW4oQHN0cmVhbSlcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID0gbnVsbFxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgd2hlbiAnaW5mbydcbiAgICAgICAgICAgICAgICAgICAgZW50cmllcyA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICAgICAgICAgIG1ldGFkYXRhID0ge31cbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGZvciBpIGluIFswLi4uZW50cmllc11cbiAgICAgICAgICAgICAgICAgICAgICAgICMgbnVsbCB0ZXJtaW5hdGVkIHN0cmluZ3NcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IEBzdHJlYW0ucmVhZFN0cmluZyhudWxsKVxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBAc3RyZWFtLnJlYWRTdHJpbmcobnVsbCkgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIG1ldGFkYXRhW2tleV0gPSB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQGVtaXQgJ21ldGFkYXRhJywgbWV0YWRhdGFcbiAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID0gbnVsbFxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB3aGVuICdkYXRhJ1xuICAgICAgICAgICAgICAgICAgICB1bmxlc3MgQHNlbnRGaXJzdERhdGFDaHVua1xuICAgICAgICAgICAgICAgICAgICAgICAgIyBza2lwIGVkaXQgY291bnRcbiAgICAgICAgICAgICAgICAgICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KVxuICAgICAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlLnNpemUgLT0gNFxuXG4gICAgICAgICAgICAgICAgICAgICAgICAjIGNhbGN1bGF0ZSB0aGUgZHVyYXRpb24gYmFzZWQgb24gYnl0ZXMgcGVyIHBhY2tldCBpZiBubyBwYWNrZXQgdGFibGVcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIEBmb3JtYXQuYnl0ZXNQZXJQYWNrZXQgaXNudCAwIGFuZCBub3QgQHNlbnREdXJhdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEBudW1GcmFtZXMgPSBAaGVhZGVyQ2FjaGUuc2l6ZSAvIEBmb3JtYXQuYnl0ZXNQZXJQYWNrZXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBAZW1pdCAnZHVyYXRpb24nLCBAbnVtRnJhbWVzIC8gQGZvcm1hdC5zYW1wbGVSYXRlICogMTAwMCB8IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIEBzZW50Rmlyc3REYXRhQ2h1bmsgPSB0cnVlXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGJ1ZmZlciA9IEBzdHJlYW0ucmVhZFNpbmdsZUJ1ZmZlcihAaGVhZGVyQ2FjaGUuc2l6ZSlcbiAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlLnNpemUgLT0gYnVmZmVyLmxlbmd0aFxuICAgICAgICAgICAgICAgICAgICBAZW1pdCAnZGF0YScsIGJ1ZmZlclxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgaWYgQGhlYWRlckNhY2hlLnNpemUgPD0gMFxuICAgICAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID0gbnVsbFxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGlmIEBzdHJlYW0uYXZhaWxhYmxlKEBoZWFkZXJDYWNoZS5zaXplKVxuICAgICAgICAgICAgICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKEBoZWFkZXJDYWNoZS5zaXplKVxuICAgICAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID0gbnVsbFxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiIsIkRlbXV4ZXIgPSByZXF1aXJlICcuLi9kZW11eGVyJ1xuXG5jbGFzcyBNNEFEZW11eGVyIGV4dGVuZHMgRGVtdXhlclxuICAgIERlbXV4ZXIucmVnaXN0ZXIoTTRBRGVtdXhlcilcbiAgICBcbiAgICAjIGNvbW1vbiBmaWxlIHR5cGUgaWRlbnRpZmllcnNcbiAgICAjIHNlZSBodHRwOi8vbXA0cmEub3JnL2ZpbGV0eXBlLmh0bWwgZm9yIGEgY29tcGxldGUgbGlzdFxuICAgIFRZUEVTID0gWydNNEEgJywgJ000UCAnLCAnTTRCICcsICdNNFYgJywgJ2lzb20nLCAnbXA0MicsICdxdCAgJ11cbiAgICBcbiAgICBAcHJvYmU6IChidWZmZXIpIC0+XG4gICAgICAgIHJldHVybiBidWZmZXIucGVla1N0cmluZyg0LCA0KSBpcyAnZnR5cCcgYW5kXG4gICAgICAgICAgICAgICBidWZmZXIucGVla1N0cmluZyg4LCA0KSBpbiBUWVBFU1xuICAgICAgICBcbiAgICBpbml0OiAtPlxuICAgICAgICAjIGN1cnJlbnQgYXRvbSBoZWlyYXJjaHkgc3RhY2tzXG4gICAgICAgIEBhdG9tcyA9IFtdXG4gICAgICAgIEBvZmZzZXRzID0gW11cbiAgICAgICAgXG4gICAgICAgICMgbTRhIGZpbGVzIGNhbiBoYXZlIG11bHRpcGxlIHRyYWNrc1xuICAgICAgICBAdHJhY2sgPSBudWxsXG4gICAgICAgIEB0cmFja3MgPSBbXVxuICAgICAgICBcbiAgICAjIGxvb2t1cCB0YWJsZSBmb3IgYXRvbSBoYW5kbGVyc1xuICAgIGF0b21zID0ge31cbiAgICBcbiAgICAjIGxvb2t1cCB0YWJsZSBvZiBjb250YWluZXIgYXRvbSBuYW1lc1xuICAgIGNvbnRhaW5lcnMgPSB7fVxuICAgIFxuICAgICMgZGVjbGFyZSBhIGZ1bmN0aW9uIHRvIGJlIHVzZWQgZm9yIHBhcnNpbmcgYSBnaXZlbiBhdG9tIG5hbWVcbiAgICBhdG9tID0gKG5hbWUsIGZuKSAtPiAgICAgICAgXG4gICAgICAgIGMgPSBbXVxuICAgICAgICBmb3IgY29udGFpbmVyIGluIG5hbWUuc3BsaXQoJy4nKS5zbGljZSgwLCAtMSlcbiAgICAgICAgICAgIGMucHVzaCBjb250YWluZXJcbiAgICAgICAgICAgIGNvbnRhaW5lcnNbYy5qb2luKCcuJyldID0gdHJ1ZVxuICAgICAgICAgICAgXG4gICAgICAgIGF0b21zW25hbWVdID89IHt9XG4gICAgICAgIGF0b21zW25hbWVdLmZuID0gZm5cbiAgICAgICAgXG4gICAgIyBkZWNsYXJlIGEgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGFmdGVyIHBhcnNpbmcgb2YgYW4gYXRvbSBhbmQgYWxsIHN1Yi1hdG9tcyBoYXMgY29tcGxldGVkXG4gICAgYWZ0ZXIgPSAobmFtZSwgZm4pIC0+XG4gICAgICAgIGF0b21zW25hbWVdID89IHt9XG4gICAgICAgIGF0b21zW25hbWVdLmFmdGVyID0gZm5cbiAgICAgICAgXG4gICAgcmVhZENodW5rOiAtPlxuICAgICAgICBAYnJlYWsgPSBmYWxzZVxuICAgICAgICBcbiAgICAgICAgd2hpbGUgQHN0cmVhbS5hdmFpbGFibGUoMSkgYW5kIG5vdCBAYnJlYWtcbiAgICAgICAgICAgICMgaWYgd2UncmUgcmVhZHkgdG8gcmVhZCBhIG5ldyBhdG9tLCBhZGQgaXQgdG8gdGhlIHN0YWNrXG4gICAgICAgICAgICBpZiBub3QgQHJlYWRIZWFkZXJzXG4gICAgICAgICAgICAgICAgcmV0dXJuIHVubGVzcyBAc3RyZWFtLmF2YWlsYWJsZSg4KVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIEBsZW4gPSBAc3RyZWFtLnJlYWRVSW50MzIoKSAtIDhcbiAgICAgICAgICAgICAgICBAdHlwZSA9IEBzdHJlYW0ucmVhZFN0cmluZyg0KVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnRpbnVlIGlmIEBsZW4gaXMgMFxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIEBhdG9tcy5wdXNoIEB0eXBlXG4gICAgICAgICAgICAgICAgQG9mZnNldHMucHVzaCBAc3RyZWFtLm9mZnNldCArIEBsZW5cbiAgICAgICAgICAgICAgICBAcmVhZEhlYWRlcnMgPSB0cnVlXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAjIGZpbmQgYSBoYW5kbGVyIGZvciB0aGUgY3VycmVudCBhdG9tIGhlaXJhcmNoeVxuICAgICAgICAgICAgcGF0aCA9IEBhdG9tcy5qb2luICcuJyAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGhhbmRsZXIgPSBhdG9tc1twYXRoXVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiBoYW5kbGVyPy5mblxuICAgICAgICAgICAgICAgICMgd2FpdCB1bnRpbCB3ZSBoYXZlIGVub3VnaCBkYXRhLCB1bmxlc3MgdGhpcyBpcyB0aGUgbWRhdCBhdG9tXG4gICAgICAgICAgICAgICAgcmV0dXJuIHVubGVzcyBAc3RyZWFtLmF2YWlsYWJsZShAbGVuKSBvciBwYXRoIGlzICdtZGF0J1xuXG4gICAgICAgICAgICAgICAgIyBjYWxsIHRoZSBwYXJzZXIgZm9yIHRoZSBhdG9tIHR5cGVcbiAgICAgICAgICAgICAgICBoYW5kbGVyLmZuLmNhbGwodGhpcylcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAjIGNoZWNrIGlmIHRoaXMgYXRvbSBjYW4gY29udGFpbiBzdWItYXRvbXNcbiAgICAgICAgICAgICAgICBpZiBwYXRoIG9mIGNvbnRhaW5lcnNcbiAgICAgICAgICAgICAgICAgICAgQHJlYWRIZWFkZXJzID0gZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAjIGhhbmRsZSBjb250YWluZXIgYXRvbXNcbiAgICAgICAgICAgIGVsc2UgaWYgcGF0aCBvZiBjb250YWluZXJzXG4gICAgICAgICAgICAgICAgQHJlYWRIZWFkZXJzID0gZmFsc2VcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICMgdW5rbm93biBhdG9tXG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgIyB3YWl0IHVudGlsIHdlIGhhdmUgZW5vdWdoIGRhdGFcbiAgICAgICAgICAgICAgICByZXR1cm4gdW5sZXNzIEBzdHJlYW0uYXZhaWxhYmxlKEBsZW4pXG4gICAgICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKEBsZW4pXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAjIHBvcCBjb21wbGV0ZWQgaXRlbXMgZnJvbSB0aGUgc3RhY2tcbiAgICAgICAgICAgIHdoaWxlIEBzdHJlYW0ub2Zmc2V0ID49IEBvZmZzZXRzW0BvZmZzZXRzLmxlbmd0aCAtIDFdXG4gICAgICAgICAgICAgICAgIyBjYWxsIGFmdGVyIGhhbmRsZXJcbiAgICAgICAgICAgICAgICBoYW5kbGVyID0gYXRvbXNbQGF0b21zLmpvaW4gJy4nXVxuICAgICAgICAgICAgICAgIGlmIGhhbmRsZXI/LmFmdGVyXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXIuYWZ0ZXIuY2FsbCh0aGlzKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHR5cGUgPSBAYXRvbXMucG9wKClcbiAgICAgICAgICAgICAgICBAb2Zmc2V0cy5wb3AoKVxuICAgICAgICAgICAgICAgIEByZWFkSGVhZGVycyA9IGZhbHNlXG4gICAgICAgICAgICAgICAgXG4gICAgYXRvbSAnZnR5cCcsIC0+XG4gICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBub3QgaW4gVFlQRVNcbiAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnTm90IGEgdmFsaWQgTTRBIGZpbGUuJ1xuICAgICAgICBcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKEBsZW4gLSA0KVxuICAgIFxuICAgIGF0b20gJ21vb3YudHJhaycsIC0+XG4gICAgICAgIEB0cmFjayA9IHt9XG4gICAgICAgIEB0cmFja3MucHVzaCBAdHJhY2tcbiAgICAgICAgXG4gICAgYXRvbSAnbW9vdi50cmFrLnRraGQnLCAtPlxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoNCkgIyB2ZXJzaW9uIGFuZCBmbGFnc1xuICAgICAgICBcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDgpICMgY3JlYXRpb24gYW5kIG1vZGlmaWNhdGlvbiB0aW1lXG4gICAgICAgIEB0cmFjay5pZCA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgIFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoQGxlbiAtIDE2KVxuICAgICAgICBcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5oZGxyJywgLT5cbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgXG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KSAjIGNvbXBvbmVudCB0eXBlXG4gICAgICAgIEB0cmFjay50eXBlID0gQHN0cmVhbS5yZWFkU3RyaW5nKDQpXG4gICAgICAgIFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoMTIpICMgY29tcG9uZW50IG1hbnVmYWN0dXJlciwgZmxhZ3MsIGFuZCBtYXNrXG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZShAbGVuIC0gMjQpICMgY29tcG9uZW50IG5hbWVcbiAgICBcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5tZGhkJywgLT5cbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDgpICMgY3JlYXRpb24gYW5kIG1vZGlmaWNhdGlvbiBkYXRlc1xuICAgICAgICBcbiAgICAgICAgQHRyYWNrLnRpbWVTY2FsZSA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgIEB0cmFjay5kdXJhdGlvbiA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgIFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoNCkgIyBsYW5ndWFnZSBhbmQgcXVhbGl0eVxuICAgICAgICBcbiAgICAjIGNvcnJlY3Rpb25zIHRvIGJpdHMgcGVyIGNoYW5uZWwsIGJhc2Ugb24gZm9ybWF0SURcbiAgICAjIChmZm1wZWcgYXBwZWFycyB0byBhbHdheXMgZW5jb2RlIHRoZSBiaXRzUGVyQ2hhbm5lbCBhcyAxNilcbiAgICBCSVRTX1BFUl9DSEFOTkVMID0gXG4gICAgICAgIHVsYXc6IDhcbiAgICAgICAgYWxhdzogOFxuICAgICAgICBpbjI0OiAyNFxuICAgICAgICBpbjMyOiAzMlxuICAgICAgICBmbDMyOiAzMlxuICAgICAgICBmbDY0OiA2NFxuICAgICAgICBcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5taW5mLnN0Ymwuc3RzZCcsIC0+XG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KSAjIHZlcnNpb24gYW5kIGZsYWdzXG4gICAgICAgIFxuICAgICAgICBudW1FbnRyaWVzID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgXG4gICAgICAgICMganVzdCBpZ25vcmUgdGhlIHJlc3Qgb2YgdGhlIGF0b20gaWYgdGhpcyBpc24ndCBhbiBhdWRpbyB0cmFja1xuICAgICAgICBpZiBAdHJhY2sudHlwZSBpc250ICdzb3VuJ1xuICAgICAgICAgICAgcmV0dXJuIEBzdHJlYW0uYWR2YW5jZShAbGVuIC0gOClcbiAgICAgICAgXG4gICAgICAgIGlmIG51bUVudHJpZXMgaXNudCAxXG4gICAgICAgICAgICByZXR1cm4gQGVtaXQgJ2Vycm9yJywgXCJPbmx5IGV4cGVjdGluZyBvbmUgZW50cnkgaW4gc2FtcGxlIGRlc2NyaXB0aW9uIGF0b20hXCJcbiAgICAgICAgICAgIFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoNCkgIyBzaXplXG4gICAgICAgIFxuICAgICAgICBmb3JtYXQgPSBAdHJhY2suZm9ybWF0ID0ge31cbiAgICAgICAgZm9ybWF0LmZvcm1hdElEID0gQHN0cmVhbS5yZWFkU3RyaW5nKDQpXG4gICAgICAgIFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoNikgIyByZXNlcnZlZFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoMikgIyBkYXRhIHJlZmVyZW5jZSBpbmRleFxuICAgICAgICBcbiAgICAgICAgdmVyc2lvbiA9IEBzdHJlYW0ucmVhZFVJbnQxNigpXG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZSg2KSAjIHNraXAgcmV2aXNpb24gbGV2ZWwgYW5kIHZlbmRvclxuICAgICAgICBcbiAgICAgICAgZm9ybWF0LmNoYW5uZWxzUGVyRnJhbWUgPSBAc3RyZWFtLnJlYWRVSW50MTYoKVxuICAgICAgICBmb3JtYXQuYml0c1BlckNoYW5uZWwgPSBAc3RyZWFtLnJlYWRVSW50MTYoKVxuICAgICAgICBcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgc2tpcCBjb21wcmVzc2lvbiBpZCBhbmQgcGFja2V0IHNpemVcbiAgICAgICAgXG4gICAgICAgIGZvcm1hdC5zYW1wbGVSYXRlID0gQHN0cmVhbS5yZWFkVUludDE2KClcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDIpXG4gICAgICAgIFxuICAgICAgICBpZiB2ZXJzaW9uIGlzIDFcbiAgICAgICAgICAgIGZvcm1hdC5mcmFtZXNQZXJQYWNrZXQgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgYnl0ZXMgcGVyIHBhY2tldFxuICAgICAgICAgICAgZm9ybWF0LmJ5dGVzUGVyRnJhbWUgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgYnl0ZXMgcGVyIHNhbXBsZVxuICAgICAgICAgICAgXG4gICAgICAgIGVsc2UgaWYgdmVyc2lvbiBpc250IDBcbiAgICAgICAgICAgIEBlbWl0ICdlcnJvcicsICdVbmtub3duIHZlcnNpb24gaW4gc3RzZCBhdG9tJ1xuICAgICAgICAgICAgXG4gICAgICAgIGlmIEJJVFNfUEVSX0NIQU5ORUxbZm9ybWF0LmZvcm1hdElEXT9cbiAgICAgICAgICAgIGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCA9IEJJVFNfUEVSX0NIQU5ORUxbZm9ybWF0LmZvcm1hdElEXVxuICAgICAgICAgICAgXG4gICAgICAgIGZvcm1hdC5mbG9hdGluZ1BvaW50ID0gZm9ybWF0LmZvcm1hdElEIGluIFsnZmwzMicsICdmbDY0J11cbiAgICAgICAgZm9ybWF0LmxpdHRsZUVuZGlhbiA9IGZvcm1hdC5mb3JtYXRJRCBpcyAnc293dCcgYW5kIGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCA+IDhcbiAgICAgICAgXG4gICAgICAgIGlmIGZvcm1hdC5mb3JtYXRJRCBpbiBbJ3R3b3MnLCAnc293dCcsICdpbjI0JywgJ2luMzInLCAnZmwzMicsICdmbDY0JywgJ3JhdyAnLCAnTk9ORSddXG4gICAgICAgICAgICBmb3JtYXQuZm9ybWF0SUQgPSAnbHBjbSdcbiAgICAgICAgXG4gICAgYXRvbSAnbW9vdi50cmFrLm1kaWEubWluZi5zdGJsLnN0c2QuYWxhYycsIC0+XG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KVxuICAgICAgICBAdHJhY2suY29va2llID0gQHN0cmVhbS5yZWFkQnVmZmVyKEBsZW4gLSA0KVxuICAgICAgICBcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5taW5mLnN0Ymwuc3RzZC5lc2RzJywgLT5cbiAgICAgICAgb2Zmc2V0ID0gQHN0cmVhbS5vZmZzZXQgKyBAbGVuXG4gICAgICAgIEB0cmFjay5jb29raWUgPSBNNEFEZW11eGVyLnJlYWRFc2RzIEBzdHJlYW1cbiAgICAgICAgQHN0cmVhbS5zZWVrIG9mZnNldCAjIHNraXAgZ2FyYmFnZSBhdCB0aGUgZW5kIFxuICAgICAgICBcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5taW5mLnN0Ymwuc3RzZC53YXZlLmVuZGEnLCAtPlxuICAgICAgICBAdHJhY2suZm9ybWF0LmxpdHRsZUVuZGlhbiA9ICEhQHN0cmVhbS5yZWFkVUludDE2KClcbiAgICAgICAgXG4gICAgIyByZWFkcyBhIHZhcmlhYmxlIGxlbmd0aCBpbnRlZ2VyXG4gICAgQHJlYWREZXNjckxlbjogKHN0cmVhbSkgLT5cbiAgICAgICAgbGVuID0gMFxuICAgICAgICBjb3VudCA9IDRcblxuICAgICAgICB3aGlsZSBjb3VudC0tXG4gICAgICAgICAgICBjID0gc3RyZWFtLnJlYWRVSW50OCgpXG4gICAgICAgICAgICBsZW4gPSAobGVuIDw8IDcpIHwgKGMgJiAweDdmKVxuICAgICAgICAgICAgYnJlYWsgdW5sZXNzIGMgJiAweDgwXG5cbiAgICAgICAgcmV0dXJuIGxlblxuICAgICAgICBcbiAgICBAcmVhZEVzZHM6IChzdHJlYW0pIC0+XG4gICAgICAgIHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgXG4gICAgICAgIHRhZyA9IHN0cmVhbS5yZWFkVUludDgoKVxuICAgICAgICBsZW4gPSBNNEFEZW11eGVyLnJlYWREZXNjckxlbihzdHJlYW0pXG5cbiAgICAgICAgaWYgdGFnIGlzIDB4MDMgIyBNUDRFU0Rlc2NyVGFnXG4gICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSgyKSAjIGlkXG4gICAgICAgICAgICBmbGFncyA9IHN0cmVhbS5yZWFkVUludDgoKVxuXG4gICAgICAgICAgICBpZiBmbGFncyAmIDB4ODAgIyBzdHJlYW1EZXBlbmRlbmNlRmxhZ1xuICAgICAgICAgICAgICAgIHN0cmVhbS5hZHZhbmNlKDIpXG5cbiAgICAgICAgICAgIGlmIGZsYWdzICYgMHg0MCAjIFVSTF9GbGFnXG4gICAgICAgICAgICAgICAgc3RyZWFtLmFkdmFuY2Ugc3RyZWFtLnJlYWRVSW50OCgpXG5cbiAgICAgICAgICAgIGlmIGZsYWdzICYgMHgyMCAjIE9DUnN0cmVhbUZsYWdcbiAgICAgICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSgyKVxuXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHN0cmVhbS5hZHZhbmNlKDIpICMgaWRcblxuICAgICAgICB0YWcgPSBzdHJlYW0ucmVhZFVJbnQ4KClcbiAgICAgICAgbGVuID0gTTRBRGVtdXhlci5yZWFkRGVzY3JMZW4oc3RyZWFtKVxuICAgICAgICAgICAgXG4gICAgICAgIGlmIHRhZyBpcyAweDA0ICMgTVA0RGVjQ29uZmlnRGVzY3JUYWdcbiAgICAgICAgICAgIGNvZGVjX2lkID0gc3RyZWFtLnJlYWRVSW50OCgpICMgbWlnaHQgd2FudCB0aGlzLi4uIChpc29tLmM6MzUpXG4gICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSgxKSAjIHN0cmVhbSB0eXBlXG4gICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSgzKSAjIGJ1ZmZlciBzaXplXG4gICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSg0KSAjIG1heCBiaXRyYXRlXG4gICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSg0KSAjIGF2ZyBiaXRyYXRlXG5cbiAgICAgICAgICAgIHRhZyA9IHN0cmVhbS5yZWFkVUludDgoKVxuICAgICAgICAgICAgbGVuID0gTTRBRGVtdXhlci5yZWFkRGVzY3JMZW4oc3RyZWFtKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiB0YWcgaXMgMHgwNSAjIE1QNERlY1NwZWNpZmljRGVzY3JUYWdcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RyZWFtLnJlYWRCdWZmZXIobGVuKVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgXG4gICAgIyB0aW1lIHRvIHNhbXBsZVxuICAgIGF0b20gJ21vb3YudHJhay5tZGlhLm1pbmYuc3RibC5zdHRzJywgLT5cbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgXG4gICAgICAgIGVudHJpZXMgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICBAdHJhY2suc3R0cyA9IFtdXG4gICAgICAgIGZvciBpIGluIFswLi4uZW50cmllc10gYnkgMVxuICAgICAgICAgICAgQHRyYWNrLnN0dHNbaV0gPVxuICAgICAgICAgICAgICAgIGNvdW50OiBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgICAgIGR1cmF0aW9uOiBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICBAc2V0dXBTZWVrUG9pbnRzKClcbiAgICBcbiAgICAjIHNhbXBsZSB0byBjaHVua1xuICAgIGF0b20gJ21vb3YudHJhay5tZGlhLm1pbmYuc3RibC5zdHNjJywgLT5cbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgXG4gICAgICAgIGVudHJpZXMgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICBAdHJhY2suc3RzYyA9IFtdXG4gICAgICAgIGZvciBpIGluIFswLi4uZW50cmllc10gYnkgMVxuICAgICAgICAgICAgQHRyYWNrLnN0c2NbaV0gPSBcbiAgICAgICAgICAgICAgICBmaXJzdDogQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICBjb3VudDogQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICBpZDogQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgQHNldHVwU2Vla1BvaW50cygpXG4gICAgICAgIFxuICAgICMgc2FtcGxlIHNpemVcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5taW5mLnN0Ymwuc3RzeicsIC0+XG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KSAjIHZlcnNpb24gYW5kIGZsYWdzXG4gICAgICAgIFxuICAgICAgICBAdHJhY2suc2FtcGxlU2l6ZSA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgIGVudHJpZXMgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICBcbiAgICAgICAgaWYgQHRyYWNrLnNhbXBsZVNpemUgaXMgMCBhbmQgZW50cmllcyA+IDBcbiAgICAgICAgICAgIEB0cmFjay5zYW1wbGVTaXplcyA9IFtdXG4gICAgICAgICAgICBmb3IgaSBpbiBbMC4uLmVudHJpZXNdIGJ5IDFcbiAgICAgICAgICAgICAgICBAdHJhY2suc2FtcGxlU2l6ZXNbaV0gPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICBAc2V0dXBTZWVrUG9pbnRzKClcbiAgICBcbiAgICAjIGNodW5rIG9mZnNldHNcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5taW5mLnN0Ymwuc3RjbycsIC0+ICMgVE9ETzogY282NFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoNCkgIyB2ZXJzaW9uIGFuZCBmbGFnc1xuICAgICAgICBcbiAgICAgICAgZW50cmllcyA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgIEB0cmFjay5jaHVua09mZnNldHMgPSBbXVxuICAgICAgICBmb3IgaSBpbiBbMC4uLmVudHJpZXNdIGJ5IDFcbiAgICAgICAgICAgIEB0cmFjay5jaHVua09mZnNldHNbaV0gPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgXG4gICAgICAgIEBzZXR1cFNlZWtQb2ludHMoKVxuICAgICAgICBcbiAgICAjIGNoYXB0ZXIgdHJhY2sgcmVmZXJlbmNlXG4gICAgYXRvbSAnbW9vdi50cmFrLnRyZWYuY2hhcCcsIC0+XG4gICAgICAgIGVudHJpZXMgPSBAbGVuID4+IDJcbiAgICAgICAgQHRyYWNrLmNoYXB0ZXJUcmFja3MgPSBbXVxuICAgICAgICBmb3IgaSBpbiBbMC4uLmVudHJpZXNdIGJ5IDFcbiAgICAgICAgICAgIEB0cmFjay5jaGFwdGVyVHJhY2tzW2ldID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgIFxuICAgICAgICByZXR1cm5cbiAgICAgICAgXG4gICAgIyBvbmNlIHdlIGhhdmUgYWxsIHRoZSBpbmZvcm1hdGlvbiB3ZSBuZWVkLCBnZW5lcmF0ZSB0aGUgc2VlayB0YWJsZSBmb3IgdGhpcyB0cmFja1xuICAgIHNldHVwU2Vla1BvaW50czogLT5cbiAgICAgICAgcmV0dXJuIHVubGVzcyBAdHJhY2suY2h1bmtPZmZzZXRzPyBhbmQgQHRyYWNrLnN0c2M/IGFuZCBAdHJhY2suc2FtcGxlU2l6ZT8gYW5kIEB0cmFjay5zdHRzP1xuICAgICAgICBcbiAgICAgICAgc3RzY0luZGV4ID0gMFxuICAgICAgICBzdHRzSW5kZXggPSAwXG4gICAgICAgIHN0dHNJbmRleCA9IDBcbiAgICAgICAgc3R0c1NhbXBsZSA9IDBcbiAgICAgICAgc2FtcGxlSW5kZXggPSAwXG4gICAgICAgIFxuICAgICAgICBvZmZzZXQgPSAwXG4gICAgICAgIHRpbWVzdGFtcCA9IDBcbiAgICAgICAgQHRyYWNrLnNlZWtQb2ludHMgPSBbXVxuICAgICAgICBcbiAgICAgICAgZm9yIHBvc2l0aW9uLCBpIGluIEB0cmFjay5jaHVua09mZnNldHNcbiAgICAgICAgICAgIGZvciBqIGluIFswLi4uQHRyYWNrLnN0c2Nbc3RzY0luZGV4XS5jb3VudF0gYnkgMVxuICAgICAgICAgICAgICAgICMgcHVzaCB0aGUgdGltZXN0YW1wIGFuZCBib3RoIHRoZSBwaHlzaWNhbCBwb3NpdGlvbiBpbiB0aGUgZmlsZVxuICAgICAgICAgICAgICAgICMgYW5kIHRoZSBvZmZzZXQgd2l0aG91dCBnYXBzIGZyb20gdGhlIHN0YXJ0IG9mIHRoZSBkYXRhXG4gICAgICAgICAgICAgICAgQHRyYWNrLnNlZWtQb2ludHMucHVzaFxuICAgICAgICAgICAgICAgICAgICBvZmZzZXQ6IG9mZnNldFxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogcG9zaXRpb25cbiAgICAgICAgICAgICAgICAgICAgdGltZXN0YW1wOiB0aW1lc3RhbXBcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBzaXplID0gQHRyYWNrLnNhbXBsZVNpemUgb3IgQHRyYWNrLnNhbXBsZVNpemVzW3NhbXBsZUluZGV4KytdXG4gICAgICAgICAgICAgICAgb2Zmc2V0ICs9IHNpemVcbiAgICAgICAgICAgICAgICBwb3NpdGlvbiArPSBzaXplXG4gICAgICAgICAgICAgICAgdGltZXN0YW1wICs9IEB0cmFjay5zdHRzW3N0dHNJbmRleF0uZHVyYXRpb25cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiBzdHRzSW5kZXggKyAxIDwgQHRyYWNrLnN0dHMubGVuZ3RoIGFuZCArK3N0dHNTYW1wbGUgaXMgQHRyYWNrLnN0dHNbc3R0c0luZGV4XS5jb3VudFxuICAgICAgICAgICAgICAgICAgICBzdHRzU2FtcGxlID0gMFxuICAgICAgICAgICAgICAgICAgICBzdHRzSW5kZXgrK1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIHN0c2NJbmRleCArIDEgPCBAdHJhY2suc3RzYy5sZW5ndGggYW5kIGkgKyAxIGlzIEB0cmFjay5zdHNjW3N0c2NJbmRleCArIDFdLmZpcnN0XG4gICAgICAgICAgICAgICAgc3RzY0luZGV4KytcbiAgICAgICAgXG4gICAgYWZ0ZXIgJ21vb3YnLCAtPiAgICAgICAgXG4gICAgICAgICMgaWYgdGhlIG1kYXQgYmxvY2sgd2FzIGF0IHRoZSBiZWdpbm5pbmcgcmF0aGVyIHRoYW4gdGhlIGVuZCwganVtcCBiYWNrIHRvIGl0XG4gICAgICAgIGlmIEBtZGF0T2Zmc2V0P1xuICAgICAgICAgICAgQHN0cmVhbS5zZWVrIEBtZGF0T2Zmc2V0IC0gOFxuICAgICAgICAgICAgXG4gICAgICAgICMgY2hvb3NlIGEgdHJhY2tcbiAgICAgICAgZm9yIHRyYWNrIGluIEB0cmFja3Mgd2hlbiB0cmFjay50eXBlIGlzICdzb3VuJ1xuICAgICAgICAgICAgQHRyYWNrID0gdHJhY2tcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBcbiAgICAgICAgaWYgQHRyYWNrLnR5cGUgaXNudCAnc291bidcbiAgICAgICAgICAgIEB0cmFjayA9IG51bGxcbiAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnTm8gYXVkaW8gdHJhY2tzIGluIG00YSBmaWxlLidcbiAgICAgICAgICAgIFxuICAgICAgICAjIGVtaXQgaW5mb1xuICAgICAgICBAZW1pdCAnZm9ybWF0JywgQHRyYWNrLmZvcm1hdFxuICAgICAgICBAZW1pdCAnZHVyYXRpb24nLCBAdHJhY2suZHVyYXRpb24gLyBAdHJhY2sudGltZVNjYWxlICogMTAwMCB8IDBcbiAgICAgICAgaWYgQHRyYWNrLmNvb2tpZVxuICAgICAgICAgICAgQGVtaXQgJ2Nvb2tpZScsIEB0cmFjay5jb29raWVcbiAgICAgICAgXG4gICAgICAgICMgdXNlIHRoZSBzZWVrIHBvaW50cyBmcm9tIHRoZSBzZWxlY3RlZCB0cmFja1xuICAgICAgICBAc2Vla1BvaW50cyA9IEB0cmFjay5zZWVrUG9pbnRzXG4gICAgICAgIFxuICAgIGF0b20gJ21kYXQnLCAtPlxuICAgICAgICBpZiBub3QgQHN0YXJ0ZWREYXRhXG4gICAgICAgICAgICBAbWRhdE9mZnNldCA/PSBAc3RyZWFtLm9mZnNldFxuICAgICAgICAgICAgXG4gICAgICAgICAgICAjIGlmIHdlIGhhdmVuJ3QgcmVhZCB0aGUgaGVhZGVycyB5ZXQsIHRoZSBtZGF0IGF0b20gd2FzIGF0IHRoZSBiZWdpbm5pbmdcbiAgICAgICAgICAgICMgcmF0aGVyIHRoYW4gdGhlIGVuZC4gU2tpcCBvdmVyIGl0IGZvciBub3cgdG8gcmVhZCB0aGUgaGVhZGVycyBmaXJzdCwgYW5kXG4gICAgICAgICAgICAjIGNvbWUgYmFjayBsYXRlci5cbiAgICAgICAgICAgIGlmIEB0cmFja3MubGVuZ3RoIGlzIDBcbiAgICAgICAgICAgICAgICBieXRlcyA9IE1hdGgubWluKEBzdHJlYW0ucmVtYWluaW5nQnl0ZXMoKSwgQGxlbilcbiAgICAgICAgICAgICAgICBAc3RyZWFtLmFkdmFuY2UgYnl0ZXNcbiAgICAgICAgICAgICAgICBAbGVuIC09IGJ5dGVzXG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEBjaHVua0luZGV4ID0gMFxuICAgICAgICAgICAgQHN0c2NJbmRleCA9IDBcbiAgICAgICAgICAgIEBzYW1wbGVJbmRleCA9IDBcbiAgICAgICAgICAgIEB0YWlsT2Zmc2V0ID0gMFxuICAgICAgICAgICAgQHRhaWxTYW1wbGVzID0gMFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBAc3RhcnRlZERhdGEgPSB0cnVlXG4gICAgICAgICAgICBcbiAgICAgICAgIyByZWFkIHRoZSBjaGFwdGVyIGluZm9ybWF0aW9uIGlmIGFueVxuICAgICAgICB1bmxlc3MgQHJlYWRDaGFwdGVyc1xuICAgICAgICAgICAgQHJlYWRDaGFwdGVycyA9IEBwYXJzZUNoYXB0ZXJzKClcbiAgICAgICAgICAgIHJldHVybiBpZiBAYnJlYWsgPSBub3QgQHJlYWRDaGFwdGVyc1xuICAgICAgICAgICAgQHN0cmVhbS5zZWVrIEBtZGF0T2Zmc2V0XG4gICAgICAgICAgICBcbiAgICAgICAgIyBnZXQgdGhlIHN0YXJ0aW5nIG9mZnNldFxuICAgICAgICBvZmZzZXQgPSBAdHJhY2suY2h1bmtPZmZzZXRzW0BjaHVua0luZGV4XSArIEB0YWlsT2Zmc2V0XG4gICAgICAgIGxlbmd0aCA9IDBcbiAgICAgICAgXG4gICAgICAgICMgbWFrZSBzdXJlIHdlIGhhdmUgZW5vdWdoIGRhdGEgdG8gZ2V0IHRvIHRoZSBvZmZzZXRcbiAgICAgICAgdW5sZXNzIEBzdHJlYW0uYXZhaWxhYmxlKG9mZnNldCAtIEBzdHJlYW0ub2Zmc2V0KVxuICAgICAgICAgICAgQGJyZWFrID0gdHJ1ZVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIFxuICAgICAgICAjIHNlZWsgdG8gdGhlIG9mZnNldFxuICAgICAgICBAc3RyZWFtLnNlZWsob2Zmc2V0KVxuICAgICAgICBcbiAgICAgICAgIyBjYWxjdWxhdGUgdGhlIG1heGltdW0gbGVuZ3RoIHdlIGNhbiByZWFkIGF0IG9uY2VcbiAgICAgICAgd2hpbGUgQGNodW5rSW5kZXggPCBAdHJhY2suY2h1bmtPZmZzZXRzLmxlbmd0aFxuICAgICAgICAgICAgIyBjYWxjdWxhdGUgdGhlIHNpemUgaW4gYnl0ZXMgb2YgdGhlIGNodW5rIHVzaW5nIHRoZSBzYW1wbGUgc2l6ZSB0YWJsZVxuICAgICAgICAgICAgbnVtU2FtcGxlcyA9IEB0cmFjay5zdHNjW0BzdHNjSW5kZXhdLmNvdW50IC0gQHRhaWxTYW1wbGVzXG4gICAgICAgICAgICBjaHVua1NpemUgPSAwXG4gICAgICAgICAgICBmb3Igc2FtcGxlIGluIFswLi4ubnVtU2FtcGxlc10gYnkgMVxuICAgICAgICAgICAgICAgIHNpemUgPSBAdHJhY2suc2FtcGxlU2l6ZSBvciBAdHJhY2suc2FtcGxlU2l6ZXNbQHNhbXBsZUluZGV4XVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICMgaWYgd2UgZG9uJ3QgaGF2ZSBlbm91Z2ggZGF0YSB0byBhZGQgdGhpcyBzYW1wbGUsIGp1bXAgb3V0XG4gICAgICAgICAgICAgICAgYnJlYWsgdW5sZXNzIEBzdHJlYW0uYXZhaWxhYmxlKGxlbmd0aCArIHNpemUpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgbGVuZ3RoICs9IHNpemVcbiAgICAgICAgICAgICAgICBjaHVua1NpemUgKz0gc2l6ZVxuICAgICAgICAgICAgICAgIEBzYW1wbGVJbmRleCsrXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICMgaWYgd2UgZGlkbid0IG1ha2UgaXQgdGhyb3VnaCB0aGUgd2hvbGUgY2h1bmssIGFkZCB3aGF0IHdlIGRpZCB1c2UgdG8gdGhlIHRhaWxcbiAgICAgICAgICAgIGlmIHNhbXBsZSA8IG51bVNhbXBsZXNcbiAgICAgICAgICAgICAgICBAdGFpbE9mZnNldCArPSBjaHVua1NpemVcbiAgICAgICAgICAgICAgICBAdGFpbFNhbXBsZXMgKz0gc2FtcGxlXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAjIG90aGVyd2lzZSwgd2UgY2FuIG1vdmUgdG8gdGhlIG5leHQgY2h1bmtcbiAgICAgICAgICAgICAgICBAY2h1bmtJbmRleCsrXG4gICAgICAgICAgICAgICAgQHRhaWxPZmZzZXQgPSAwXG4gICAgICAgICAgICAgICAgQHRhaWxTYW1wbGVzID0gMFxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICMgaWYgd2UndmUgbWFkZSBpdCB0byB0aGUgZW5kIG9mIGEgbGlzdCBvZiBzdWJzZXF1ZW50IGNodW5rcyB3aXRoIHRoZSBzYW1lIG51bWJlciBvZiBzYW1wbGVzLFxuICAgICAgICAgICAgICAgICMgZ28gdG8gdGhlIG5leHQgc2FtcGxlIHRvIGNodW5rIGVudHJ5XG4gICAgICAgICAgICAgICAgaWYgQHN0c2NJbmRleCArIDEgPCBAdHJhY2suc3RzYy5sZW5ndGggYW5kIEBjaHVua0luZGV4ICsgMSBpcyBAdHJhY2suc3RzY1tAc3RzY0luZGV4ICsgMV0uZmlyc3RcbiAgICAgICAgICAgICAgICAgICAgQHN0c2NJbmRleCsrXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgIyBpZiB0aGUgbmV4dCBjaHVuayBpc24ndCByaWdodCBhZnRlciB0aGlzIG9uZSwganVtcCBvdXRcbiAgICAgICAgICAgICAgICBpZiBvZmZzZXQgKyBsZW5ndGggaXNudCBAdHJhY2suY2h1bmtPZmZzZXRzW0BjaHVua0luZGV4XVxuICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICBcbiAgICAgICAgIyBlbWl0IHNvbWUgZGF0YSBpZiB3ZSBoYXZlIGFueSwgb3RoZXJ3aXNlIHdhaXQgZm9yIG1vcmVcbiAgICAgICAgaWYgbGVuZ3RoID4gMFxuICAgICAgICAgICAgQGVtaXQgJ2RhdGEnLCBAc3RyZWFtLnJlYWRCdWZmZXIobGVuZ3RoKVxuICAgICAgICAgICAgQGJyZWFrID0gQGNodW5rSW5kZXggaXMgQHRyYWNrLmNodW5rT2Zmc2V0cy5sZW5ndGhcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgQGJyZWFrID0gdHJ1ZVxuICAgICAgICAgICAgXG4gICAgcGFyc2VDaGFwdGVyczogLT5cbiAgICAgICAgcmV0dXJuIHRydWUgdW5sZXNzIEB0cmFjay5jaGFwdGVyVHJhY2tzPy5sZW5ndGggPiAwXG5cbiAgICAgICAgIyBmaW5kIHRoZSBjaGFwdGVyIHRyYWNrXG4gICAgICAgIGlkID0gQHRyYWNrLmNoYXB0ZXJUcmFja3NbMF1cbiAgICAgICAgZm9yIHRyYWNrIGluIEB0cmFja3NcbiAgICAgICAgICAgIGJyZWFrIGlmIHRyYWNrLmlkIGlzIGlkXG5cbiAgICAgICAgaWYgdHJhY2suaWQgaXNudCBpZFxuICAgICAgICAgICAgQGVtaXQgJ2Vycm9yJywgJ0NoYXB0ZXIgdHJhY2sgZG9lcyBub3QgZXhpc3QuJ1xuXG4gICAgICAgIEBjaGFwdGVycyA/PSBbXVxuICAgICAgICBcbiAgICAgICAgIyB1c2UgdGhlIHNlZWsgdGFibGUgb2Zmc2V0cyB0byBmaW5kIGNoYXB0ZXIgdGl0bGVzXG4gICAgICAgIHdoaWxlIEBjaGFwdGVycy5sZW5ndGggPCB0cmFjay5zZWVrUG9pbnRzLmxlbmd0aFxuICAgICAgICAgICAgcG9pbnQgPSB0cmFjay5zZWVrUG9pbnRzW0BjaGFwdGVycy5sZW5ndGhdXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICMgbWFrZSBzdXJlIHdlIGhhdmUgZW5vdWdoIGRhdGFcbiAgICAgICAgICAgIHJldHVybiBmYWxzZSB1bmxlc3MgQHN0cmVhbS5hdmFpbGFibGUocG9pbnQucG9zaXRpb24gLSBAc3RyZWFtLm9mZnNldCArIDMyKVxuXG4gICAgICAgICAgICAjIGp1bXAgdG8gdGhlIHRpdGxlIG9mZnNldFxuICAgICAgICAgICAgQHN0cmVhbS5zZWVrIHBvaW50LnBvc2l0aW9uXG5cbiAgICAgICAgICAgICMgcmVhZCB0aGUgbGVuZ3RoIG9mIHRoZSB0aXRsZSBzdHJpbmdcbiAgICAgICAgICAgIGxlbiA9IEBzdHJlYW0ucmVhZFVJbnQxNigpXG4gICAgICAgICAgICB0aXRsZSA9IG51bGxcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlIHVubGVzcyBAc3RyZWFtLmF2YWlsYWJsZShsZW4pXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICMgaWYgdGhlcmUgaXMgYSBCT00gbWFya2VyLCByZWFkIGEgdXRmMTYgc3RyaW5nXG4gICAgICAgICAgICBpZiBsZW4gPiAyXG4gICAgICAgICAgICAgICAgYm9tID0gQHN0cmVhbS5wZWVrVUludDE2KClcbiAgICAgICAgICAgICAgICBpZiBib20gaW4gWzB4ZmVmZiwgMHhmZmZlXVxuICAgICAgICAgICAgICAgICAgICB0aXRsZSA9IEBzdHJlYW0ucmVhZFN0cmluZyhsZW4sICd1dGYxNi1ib20nKVxuXG4gICAgICAgICAgICAjIG90aGVyd2lzZSwgdXNlIHV0ZjhcbiAgICAgICAgICAgIHRpdGxlID89IEBzdHJlYW0ucmVhZFN0cmluZyhsZW4sICd1dGY4JylcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgIyBhZGQgdGhlIGNoYXB0ZXIgdGl0bGUsIHRpbWVzdGFtcCwgYW5kIGR1cmF0aW9uXG4gICAgICAgICAgICBuZXh0VGltZXN0YW1wID0gdHJhY2suc2Vla1BvaW50c1tAY2hhcHRlcnMubGVuZ3RoICsgMV0/LnRpbWVzdGFtcCA/IHRyYWNrLmR1cmF0aW9uXG4gICAgICAgICAgICBAY2hhcHRlcnMucHVzaFxuICAgICAgICAgICAgICAgIHRpdGxlOiB0aXRsZVxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogcG9pbnQudGltZXN0YW1wIC8gdHJhY2sudGltZVNjYWxlICogMTAwMCB8IDBcbiAgICAgICAgICAgICAgICBkdXJhdGlvbjogKG5leHRUaW1lc3RhbXAgLSBwb2ludC50aW1lc3RhbXApIC8gdHJhY2sudGltZVNjYWxlICogMTAwMCB8IDBcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgIyB3ZSdyZSBkb25lLCBzbyBlbWl0IHRoZSBjaGFwdGVyIGRhdGFcbiAgICAgICAgQGVtaXQgJ2NoYXB0ZXJzJywgQGNoYXB0ZXJzXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIFxuICAgICMgbWV0YWRhdGEgY2h1bmtcbiAgICBhdG9tICdtb292LnVkdGEubWV0YScsIC0+XG4gICAgICAgIEBtZXRhZGF0YSA9IHt9ICAgICAgICBcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgXG4gICAgIyBlbWl0IHdoZW4gd2UncmUgZG9uZVxuICAgIGFmdGVyICdtb292LnVkdGEubWV0YScsIC0+XG4gICAgICAgIEBlbWl0ICdtZXRhZGF0YScsIEBtZXRhZGF0YVxuXG4gICAgIyBjb252aWVuaWVuY2UgZnVuY3Rpb24gdG8gZ2VuZXJhdGUgbWV0YWRhdGEgYXRvbSBoYW5kbGVyXG4gICAgbWV0YSA9IChmaWVsZCwgbmFtZSwgZm4pIC0+XG4gICAgICAgIGF0b20gXCJtb292LnVkdGEubWV0YS5pbHN0LiN7ZmllbGR9LmRhdGFcIiwgLT5cbiAgICAgICAgICAgIEBzdHJlYW0uYWR2YW5jZSg4KVxuICAgICAgICAgICAgQGxlbiAtPSA4XG4gICAgICAgICAgICBmbi5jYWxsIHRoaXMsIG5hbWVcblxuICAgICMgc3RyaW5nIGZpZWxkIHJlYWRlclxuICAgIHN0cmluZyA9IChmaWVsZCkgLT5cbiAgICAgICAgQG1ldGFkYXRhW2ZpZWxkXSA9IEBzdHJlYW0ucmVhZFN0cmluZyhAbGVuLCAndXRmOCcpXG5cbiAgICAjIGZyb20gaHR0cDovL2F0b21pY3BhcnNsZXkuc291cmNlZm9yZ2UubmV0L21wZWctNGZpbGVzLmh0bWxcbiAgICBtZXRhICfCqWFsYicsICdhbGJ1bScsIHN0cmluZ1xuICAgIG1ldGEgJ8KpYXJnJywgJ2FycmFuZ2VyJywgc3RyaW5nXG4gICAgbWV0YSAnwqlhcnQnLCAnYXJ0aXN0Jywgc3RyaW5nXG4gICAgbWV0YSAnwqlBUlQnLCAnYXJ0aXN0Jywgc3RyaW5nXG4gICAgbWV0YSAnYUFSVCcsICdhbGJ1bUFydGlzdCcsIHN0cmluZ1xuICAgIG1ldGEgJ2NhdGcnLCAnY2F0ZWdvcnknLCBzdHJpbmdcbiAgICBtZXRhICfCqWNvbScsICdjb21wb3NlcicsIHN0cmluZ1xuICAgIG1ldGEgJ8KpY3B5JywgJ2NvcHlyaWdodCcsIHN0cmluZ1xuICAgIG1ldGEgJ2NwcnQnLCAnY29weXJpZ2h0Jywgc3RyaW5nXG4gICAgbWV0YSAnwqljbXQnLCAnY29tbWVudHMnLCBzdHJpbmdcbiAgICBtZXRhICfCqWRheScsICdyZWxlYXNlRGF0ZScsIHN0cmluZ1xuICAgIG1ldGEgJ2Rlc2MnLCAnZGVzY3JpcHRpb24nLCBzdHJpbmdcbiAgICBtZXRhICfCqWdlbicsICdnZW5yZScsIHN0cmluZyAjIGN1c3RvbSBnZW5yZXNcbiAgICBtZXRhICfCqWdycCcsICdncm91cGluZycsIHN0cmluZ1xuICAgIG1ldGEgJ8KpaXNyJywgJ0lTUkMnLCBzdHJpbmdcbiAgICBtZXRhICdrZXl3JywgJ2tleXdvcmRzJywgc3RyaW5nXG4gICAgbWV0YSAnwqlsYWInLCAncmVjb3JkTGFiZWwnLCBzdHJpbmdcbiAgICBtZXRhICdsZGVzJywgJ2xvbmdEZXNjcmlwdGlvbicsIHN0cmluZ1xuICAgIG1ldGEgJ8KpbHlyJywgJ2x5cmljcycsIHN0cmluZ1xuICAgIG1ldGEgJ8KpbmFtJywgJ3RpdGxlJywgc3RyaW5nXG4gICAgbWV0YSAnwqlwaGcnLCAncmVjb3JkaW5nQ29weXJpZ2h0Jywgc3RyaW5nXG4gICAgbWV0YSAnwqlwcmQnLCAncHJvZHVjZXInLCBzdHJpbmdcbiAgICBtZXRhICfCqXByZicsICdwZXJmb3JtZXJzJywgc3RyaW5nXG4gICAgbWV0YSAncHVyZCcsICdwdXJjaGFzZURhdGUnLCBzdHJpbmdcbiAgICBtZXRhICdwdXJsJywgJ3BvZGNhc3RVUkwnLCBzdHJpbmdcbiAgICBtZXRhICfCqXN3ZicsICdzb25nd3JpdGVyJywgc3RyaW5nXG4gICAgbWV0YSAnwql0b28nLCAnZW5jb2RlcicsIHN0cmluZ1xuICAgIG1ldGEgJ8Kpd3J0JywgJ2NvbXBvc2VyJywgc3RyaW5nXG5cbiAgICBtZXRhICdjb3ZyJywgJ2NvdmVyQXJ0JywgKGZpZWxkKSAtPlxuICAgICAgICBAbWV0YWRhdGFbZmllbGRdID0gQHN0cmVhbS5yZWFkQnVmZmVyKEBsZW4pXG5cbiAgICAjIHN0YW5kYXJkIGdlbnJlc1xuICAgIGdlbnJlcyA9IFtcbiAgICAgICAgXCJCbHVlc1wiLCBcIkNsYXNzaWMgUm9ja1wiLCBcIkNvdW50cnlcIiwgXCJEYW5jZVwiLCBcIkRpc2NvXCIsIFwiRnVua1wiLCBcIkdydW5nZVwiLCBcbiAgICAgICAgXCJIaXAtSG9wXCIsIFwiSmF6elwiLCBcIk1ldGFsXCIsIFwiTmV3IEFnZVwiLCBcIk9sZGllc1wiLCBcIk90aGVyXCIsIFwiUG9wXCIsIFwiUiZCXCIsXG4gICAgICAgIFwiUmFwXCIsIFwiUmVnZ2FlXCIsIFwiUm9ja1wiLCBcIlRlY2hub1wiLCBcIkluZHVzdHJpYWxcIiwgXCJBbHRlcm5hdGl2ZVwiLCBcIlNrYVwiLCBcbiAgICAgICAgXCJEZWF0aCBNZXRhbFwiLCBcIlByYW5rc1wiLCBcIlNvdW5kdHJhY2tcIiwgXCJFdXJvLVRlY2hub1wiLCBcIkFtYmllbnRcIiwgXG4gICAgICAgIFwiVHJpcC1Ib3BcIiwgXCJWb2NhbFwiLCBcIkphenorRnVua1wiLCBcIkZ1c2lvblwiLCBcIlRyYW5jZVwiLCBcIkNsYXNzaWNhbFwiLCBcbiAgICAgICAgXCJJbnN0cnVtZW50YWxcIiwgXCJBY2lkXCIsIFwiSG91c2VcIiwgXCJHYW1lXCIsIFwiU291bmQgQ2xpcFwiLCBcIkdvc3BlbFwiLCBcIk5vaXNlXCIsXG4gICAgICAgIFwiQWx0ZXJuUm9ja1wiLCBcIkJhc3NcIiwgXCJTb3VsXCIsIFwiUHVua1wiLCBcIlNwYWNlXCIsIFwiTWVkaXRhdGl2ZVwiLCBcIkluc3RydW1lbnRhbCBQb3BcIiwgXG4gICAgICAgIFwiSW5zdHJ1bWVudGFsIFJvY2tcIiwgXCJFdGhuaWNcIiwgXCJHb3RoaWNcIiwgIFwiRGFya3dhdmVcIiwgXCJUZWNobm8tSW5kdXN0cmlhbFwiLCBcbiAgICAgICAgXCJFbGVjdHJvbmljXCIsIFwiUG9wLUZvbGtcIiwgXCJFdXJvZGFuY2VcIiwgXCJEcmVhbVwiLCBcIlNvdXRoZXJuIFJvY2tcIiwgXCJDb21lZHlcIiwgXG4gICAgICAgIFwiQ3VsdFwiLCBcIkdhbmdzdGFcIiwgXCJUb3AgNDBcIiwgXCJDaHJpc3RpYW4gUmFwXCIsIFwiUG9wL0Z1bmtcIiwgXCJKdW5nbGVcIiwgXG4gICAgICAgIFwiTmF0aXZlIEFtZXJpY2FuXCIsIFwiQ2FiYXJldFwiLCBcIk5ldyBXYXZlXCIsIFwiUHN5Y2hhZGVsaWNcIiwgXCJSYXZlXCIsIFwiU2hvd3R1bmVzXCIsXG4gICAgICAgIFwiVHJhaWxlclwiLCBcIkxvLUZpXCIsIFwiVHJpYmFsXCIsIFwiQWNpZCBQdW5rXCIsIFwiQWNpZCBKYXp6XCIsIFwiUG9sa2FcIiwgXCJSZXRyb1wiLCBcbiAgICAgICAgXCJNdXNpY2FsXCIsIFwiUm9jayAmIFJvbGxcIiwgXCJIYXJkIFJvY2tcIiwgXCJGb2xrXCIsIFwiRm9say9Sb2NrXCIsIFwiTmF0aW9uYWwgRm9sa1wiLCBcbiAgICAgICAgXCJTd2luZ1wiLCBcIkZhc3QgRnVzaW9uXCIsIFwiQmVib2JcIiwgXCJMYXRpblwiLCBcIlJldml2YWxcIiwgXCJDZWx0aWNcIiwgXCJCbHVlZ3Jhc3NcIixcbiAgICAgICAgXCJBdmFudGdhcmRlXCIsIFwiR290aGljIFJvY2tcIiwgXCJQcm9ncmVzc2l2ZSBSb2NrXCIsIFwiUHN5Y2hlZGVsaWMgUm9ja1wiLCBcIlN5bXBob25pYyBSb2NrXCIsXG4gICAgICAgIFwiU2xvdyBSb2NrXCIsIFwiQmlnIEJhbmRcIiwgXCJDaG9ydXNcIiwgXCJFYXN5IExpc3RlbmluZ1wiLCBcIkFjb3VzdGljXCIsIFwiSHVtb3VyXCIsIFwiU3BlZWNoXCIsIFxuICAgICAgICBcIkNoYW5zb25cIiwgXCJPcGVyYVwiLCBcIkNoYW1iZXIgTXVzaWNcIiwgXCJTb25hdGFcIiwgXCJTeW1waG9ueVwiLCBcIkJvb3R5IEJhc3NcIiwgXCJQcmltdXNcIiwgXG4gICAgICAgIFwiUG9ybiBHcm9vdmVcIiwgXCJTYXRpcmVcIiwgXCJTbG93IEphbVwiLCBcIkNsdWJcIiwgXCJUYW5nb1wiLCBcIlNhbWJhXCIsIFwiRm9sa2xvcmVcIiwgXCJCYWxsYWRcIiwgXG4gICAgICAgIFwiUG93ZXIgQmFsbGFkXCIsIFwiUmh5dGhtaWMgU291bFwiLCBcIkZyZWVzdHlsZVwiLCBcIkR1ZXRcIiwgXCJQdW5rIFJvY2tcIiwgXCJEcnVtIFNvbG9cIiwgXG4gICAgICAgIFwiQSBDYXBlbGxhXCIsIFwiRXVyby1Ib3VzZVwiLCBcIkRhbmNlIEhhbGxcIlxuICAgIF1cblxuICAgIG1ldGEgJ2ducmUnLCAnZ2VucmUnLCAoZmllbGQpIC0+XG4gICAgICAgIEBtZXRhZGF0YVtmaWVsZF0gPSBnZW5yZXNbQHN0cmVhbS5yZWFkVUludDE2KCkgLSAxXVxuXG4gICAgbWV0YSAndG1wbycsICd0ZW1wbycsIChmaWVsZCkgLT5cbiAgICAgICAgQG1ldGFkYXRhW2ZpZWxkXSA9IEBzdHJlYW0ucmVhZFVJbnQxNigpXG5cbiAgICBtZXRhICdydG5nJywgJ3JhdGluZycsIChmaWVsZCkgLT5cbiAgICAgICAgcmF0aW5nID0gQHN0cmVhbS5yZWFkVUludDgoKVxuICAgICAgICBAbWV0YWRhdGFbZmllbGRdID0gaWYgcmF0aW5nIGlzIDIgdGhlbiAnQ2xlYW4nIGVsc2UgaWYgcmF0aW5nIGlzbnQgMCB0aGVuICdFeHBsaWNpdCcgZWxzZSAnTm9uZSdcblxuICAgIGRpc2tUcmFjayA9IChmaWVsZCkgLT5cbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDIpXG4gICAgICAgIEBtZXRhZGF0YVtmaWVsZF0gPSBAc3RyZWFtLnJlYWRVSW50MTYoKSArICcgb2YgJyArIEBzdHJlYW0ucmVhZFVJbnQxNigpXG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZShAbGVuIC0gNilcblxuICAgIG1ldGEgJ2Rpc2snLCAnZGlza051bWJlcicsIGRpc2tUcmFja1xuICAgIG1ldGEgJ3Rya24nLCAndHJhY2tOdW1iZXInLCBkaXNrVHJhY2tcblxuICAgIGJvb2wgPSAoZmllbGQpIC0+XG4gICAgICAgIEBtZXRhZGF0YVtmaWVsZF0gPSBAc3RyZWFtLnJlYWRVSW50OCgpIGlzIDFcblxuICAgIG1ldGEgJ2NwaWwnLCAnY29tcGlsYXRpb24nLCBib29sXG4gICAgbWV0YSAncGNzdCcsICdwb2RjYXN0JywgYm9vbFxuICAgIG1ldGEgJ3BnYXAnLCAnZ2FwbGVzcycsIGJvb2xcbiAgICBcbm1vZHVsZS5leHBvcnRzID0gTTRBRGVtdXhlclxuIiwiRGVtdXhlciA9IHJlcXVpcmUgJy4uL2RlbXV4ZXInXG5cbmNsYXNzIFdBVkVEZW11eGVyIGV4dGVuZHMgRGVtdXhlclxuICAgIERlbXV4ZXIucmVnaXN0ZXIoV0FWRURlbXV4ZXIpXG4gICAgXG4gICAgQHByb2JlOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gYnVmZmVyLnBlZWtTdHJpbmcoMCwgNCkgaXMgJ1JJRkYnICYmIFxuICAgICAgICAgICAgICAgYnVmZmVyLnBlZWtTdHJpbmcoOCwgNCkgaXMgJ1dBVkUnXG4gICAgICAgICAgICAgICBcbiAgICBmb3JtYXRzID0gXG4gICAgICAgIDB4MDAwMTogJ2xwY20nXG4gICAgICAgIDB4MDAwMzogJ2xwY20nXG4gICAgICAgIDB4MDAwNjogJ2FsYXcnXG4gICAgICAgIDB4MDAwNzogJ3VsYXcnXG4gICAgICAgICAgICAgICBcbiAgICByZWFkQ2h1bms6IC0+XG4gICAgICAgIGlmIG5vdCBAcmVhZFN0YXJ0IGFuZCBAc3RyZWFtLmF2YWlsYWJsZSgxMilcbiAgICAgICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBpc250ICdSSUZGJ1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnSW52YWxpZCBXQVYgZmlsZS4nXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBAZmlsZVNpemUgPSBAc3RyZWFtLnJlYWRVSW50MzIodHJ1ZSlcbiAgICAgICAgICAgIEByZWFkU3RhcnQgPSB0cnVlXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBpc250ICdXQVZFJ1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnSW52YWxpZCBXQVYgZmlsZS4nXG4gICAgICAgICAgICAgICAgXG4gICAgICAgIHdoaWxlIEBzdHJlYW0uYXZhaWxhYmxlKDEpXG4gICAgICAgICAgICBpZiBub3QgQHJlYWRIZWFkZXJzIGFuZCBAc3RyZWFtLmF2YWlsYWJsZSg4KVxuICAgICAgICAgICAgICAgIEB0eXBlID0gQHN0cmVhbS5yZWFkU3RyaW5nKDQpXG4gICAgICAgICAgICAgICAgQGxlbiA9IEBzdHJlYW0ucmVhZFVJbnQzMih0cnVlKSAjIGxpdHRsZSBlbmRpYW5cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHN3aXRjaCBAdHlwZVxuICAgICAgICAgICAgICAgIHdoZW4gJ2ZtdCAnXG4gICAgICAgICAgICAgICAgICAgIGVuY29kaW5nID0gQHN0cmVhbS5yZWFkVUludDE2KHRydWUpXG4gICAgICAgICAgICAgICAgICAgIGlmIGVuY29kaW5nIG5vdCBvZiBmb3JtYXRzXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gQGVtaXQgJ2Vycm9yJywgJ1Vuc3VwcG9ydGVkIGZvcm1hdCBpbiBXQVYgZmlsZS4nXG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQGZvcm1hdCA9IFxuICAgICAgICAgICAgICAgICAgICAgICAgZm9ybWF0SUQ6IGZvcm1hdHNbZW5jb2RpbmddXG4gICAgICAgICAgICAgICAgICAgICAgICBmbG9hdGluZ1BvaW50OiBlbmNvZGluZyBpcyAweDAwMDNcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpdHRsZUVuZGlhbjogZm9ybWF0c1tlbmNvZGluZ10gaXMgJ2xwY20nXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFubmVsc1BlckZyYW1lOiBAc3RyZWFtLnJlYWRVSW50MTYodHJ1ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHNhbXBsZVJhdGU6IEBzdHJlYW0ucmVhZFVJbnQzMih0cnVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgZnJhbWVzUGVyUGFja2V0OiAxXG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgYnl0ZXMvc2VjLlxuICAgICAgICAgICAgICAgICAgICBAc3RyZWFtLmFkdmFuY2UoMikgIyBibG9jayBhbGlnblxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCA9IEBzdHJlYW0ucmVhZFVJbnQxNih0cnVlKVxuICAgICAgICAgICAgICAgICAgICBAZm9ybWF0LmJ5dGVzUGVyUGFja2V0ID0gKEBmb3JtYXQuYml0c1BlckNoYW5uZWwgLyA4KSAqIEBmb3JtYXQuY2hhbm5lbHNQZXJGcmFtZVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQGVtaXQgJ2Zvcm1hdCcsIEBmb3JtYXRcblxuICAgICAgICAgICAgICAgICAgICAjIEFkdmFuY2UgdG8gdGhlIG5leHQgY2h1bmtcbiAgICAgICAgICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKEBsZW4gLSAxNilcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgd2hlbiAnZGF0YSdcbiAgICAgICAgICAgICAgICAgICAgaWYgbm90IEBzZW50RHVyYXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIGJ5dGVzID0gQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCAvIDhcbiAgICAgICAgICAgICAgICAgICAgICAgIEBlbWl0ICdkdXJhdGlvbicsIEBsZW4gLyBieXRlcyAvIEBmb3JtYXQuY2hhbm5lbHNQZXJGcmFtZSAvIEBmb3JtYXQuc2FtcGxlUmF0ZSAqIDEwMDAgfCAwXG4gICAgICAgICAgICAgICAgICAgICAgICBAc2VudER1cmF0aW9uID0gdHJ1ZVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBidWZmZXIgPSBAc3RyZWFtLnJlYWRTaW5nbGVCdWZmZXIoQGxlbilcbiAgICAgICAgICAgICAgICAgICAgQGxlbiAtPSBidWZmZXIubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgIEByZWFkSGVhZGVycyA9IEBsZW4gPiAwXG4gICAgICAgICAgICAgICAgICAgIEBlbWl0ICdkYXRhJywgYnVmZmVyXG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHVubGVzcyBAc3RyZWFtLmF2YWlsYWJsZShAbGVuKVxuICAgICAgICAgICAgICAgICAgICBAc3RyZWFtLmFkdmFuY2UoQGxlbilcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgQHJlYWRIZWFkZXJzID0gZmFsc2UgdW5sZXNzIEB0eXBlIGlzICdkYXRhJ1xuICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiIsIiNcbiMgVGhlIEF1ZGlvRGV2aWNlIGNsYXNzIGlzIHJlc3BvbnNpYmxlIGZvciBpbnRlcmZhY2luZyB3aXRoIHZhcmlvdXMgYXVkaW9cbiMgQVBJcyBpbiBicm93c2VycywgYW5kIGZvciBrZWVwaW5nIHRyYWNrIG9mIHRoZSBjdXJyZW50IHBsYXliYWNrIHRpbWVcbiMgYmFzZWQgb24gdGhlIGRldmljZSBoYXJkd2FyZSB0aW1lIGFuZCB0aGUgcGxheS9wYXVzZS9zZWVrIHN0YXRlXG4jXG5cbkV2ZW50RW1pdHRlciA9IHJlcXVpcmUgJy4vY29yZS9ldmVudHMnXG5cbmNsYXNzIEF1ZGlvRGV2aWNlIGV4dGVuZHMgRXZlbnRFbWl0dGVyXG4gICAgY29uc3RydWN0b3I6IChAc2FtcGxlUmF0ZSwgQGNoYW5uZWxzKSAtPlxuICAgICAgICBAcGxheWluZyA9IGZhbHNlXG4gICAgICAgIEBjdXJyZW50VGltZSA9IDBcbiAgICAgICAgQF9sYXN0VGltZSA9IDBcbiAgICAgICAgXG4gICAgc3RhcnQ6IC0+XG4gICAgICAgIHJldHVybiBpZiBAcGxheWluZ1xuICAgICAgICBAcGxheWluZyA9IHRydWVcbiAgICAgICAgXG4gICAgICAgIEBkZXZpY2UgPz0gQXVkaW9EZXZpY2UuY3JlYXRlKEBzYW1wbGVSYXRlLCBAY2hhbm5lbHMpXG4gICAgICAgIHVubGVzcyBAZGV2aWNlXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgXCJObyBzdXBwb3J0ZWQgYXVkaW8gZGV2aWNlIGZvdW5kLlwiXG4gICAgICAgICAgICBcbiAgICAgICAgQF9sYXN0VGltZSA9IEBkZXZpY2UuZ2V0RGV2aWNlVGltZSgpXG4gICAgICAgICAgICBcbiAgICAgICAgQF90aW1lciA9IHNldEludGVydmFsIEB1cGRhdGVUaW1lLCAyMDBcbiAgICAgICAgQGRldmljZS5vbiAncmVmaWxsJywgQHJlZmlsbCA9IChidWZmZXIpID0+XG4gICAgICAgICAgICBAZW1pdCAncmVmaWxsJywgYnVmZmVyXG4gICAgICAgIFxuICAgIHN0b3A6IC0+XG4gICAgICAgIHJldHVybiB1bmxlc3MgQHBsYXlpbmdcbiAgICAgICAgQHBsYXlpbmcgPSBmYWxzZVxuICAgICAgICBcbiAgICAgICAgQGRldmljZS5vZmYgJ3JlZmlsbCcsIEByZWZpbGxcbiAgICAgICAgY2xlYXJJbnRlcnZhbCBAX3RpbWVyXG4gICAgICAgIFxuICAgIGRlc3Ryb3k6IC0+XG4gICAgICAgIEBzdG9wKClcbiAgICAgICAgQGRldmljZS5kZXN0cm95KClcbiAgICAgICAgXG4gICAgc2VlazogKEBjdXJyZW50VGltZSkgLT5cbiAgICAgICAgQF9sYXN0VGltZSA9IEBkZXZpY2UuZ2V0RGV2aWNlVGltZSgpIGlmIEBwbGF5aW5nXG4gICAgICAgIEBlbWl0ICd0aW1lVXBkYXRlJywgQGN1cnJlbnRUaW1lXG4gICAgICAgIFxuICAgIHVwZGF0ZVRpbWU6ID0+XG4gICAgICAgIHRpbWUgPSBAZGV2aWNlLmdldERldmljZVRpbWUoKVxuICAgICAgICBAY3VycmVudFRpbWUgKz0gKHRpbWUgLSBAX2xhc3RUaW1lKSAvIEBkZXZpY2Uuc2FtcGxlUmF0ZSAqIDEwMDAgfCAwXG4gICAgICAgIEBfbGFzdFRpbWUgPSB0aW1lXG4gICAgICAgIEBlbWl0ICd0aW1lVXBkYXRlJywgQGN1cnJlbnRUaW1lXG4gICAgICAgIFxuICAgIGRldmljZXMgPSBbXVxuICAgIEByZWdpc3RlcjogKGRldmljZSkgLT5cbiAgICAgICAgZGV2aWNlcy5wdXNoKGRldmljZSlcblxuICAgIEBjcmVhdGU6IChzYW1wbGVSYXRlLCBjaGFubmVscykgLT5cbiAgICAgICAgZm9yIGRldmljZSBpbiBkZXZpY2VzIHdoZW4gZGV2aWNlLnN1cHBvcnRlZFxuICAgICAgICAgICAgcmV0dXJuIG5ldyBkZXZpY2Uoc2FtcGxlUmF0ZSwgY2hhbm5lbHMpXG5cbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgXG5tb2R1bGUuZXhwb3J0cyA9IEF1ZGlvRGV2aWNlXG4iLCJFdmVudEVtaXR0ZXIgPSByZXF1aXJlICcuLi9jb3JlL2V2ZW50cydcbkF1ZGlvRGV2aWNlID0gcmVxdWlyZSAnLi4vZGV2aWNlJ1xuQVZCdWZmZXIgPSByZXF1aXJlICcuLi9jb3JlL2J1ZmZlcidcblxuY2xhc3MgTW96aWxsYUF1ZGlvRGV2aWNlIGV4dGVuZHMgRXZlbnRFbWl0dGVyXG4gICAgQXVkaW9EZXZpY2UucmVnaXN0ZXIoTW96aWxsYUF1ZGlvRGV2aWNlKVxuICAgIFxuICAgICMgZGV0ZXJtaW5lIHdoZXRoZXIgdGhpcyBkZXZpY2UgaXMgc3VwcG9ydGVkIGJ5IHRoZSBicm93c2VyXG4gICAgQHN1cHBvcnRlZDogQXVkaW8/IGFuZCAnbW96V3JpdGVBdWRpbycgb2YgbmV3IEF1ZGlvXG4gICAgXG4gICAgY29uc3RydWN0b3I6IChAc2FtcGxlUmF0ZSwgQGNoYW5uZWxzKSAtPiAgICAgICAgXG4gICAgICAgIEBhdWRpbyA9IG5ldyBBdWRpb1xuICAgICAgICBAYXVkaW8ubW96U2V0dXAoQGNoYW5uZWxzLCBAc2FtcGxlUmF0ZSlcbiAgICAgICAgXG4gICAgICAgIEB3cml0ZVBvc2l0aW9uID0gMFxuICAgICAgICBAcHJlYnVmZmVyU2l6ZSA9IEBzYW1wbGVSYXRlIC8gMlxuICAgICAgICBAdGFpbCA9IG51bGxcbiAgICAgICAgXG4gICAgICAgIEB0aW1lciA9IGNyZWF0ZVRpbWVyIEByZWZpbGwsIDEwMFxuICAgICAgICBcbiAgICByZWZpbGw6ID0+XG4gICAgICAgIGlmIEB0YWlsXG4gICAgICAgICAgICB3cml0dGVuID0gQGF1ZGlvLm1veldyaXRlQXVkaW8oQHRhaWwpXG4gICAgICAgICAgICBAd3JpdGVQb3NpdGlvbiArPSB3cml0dGVuXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIEB3cml0ZVBvc2l0aW9uIDwgQHRhaWwubGVuZ3RoXG4gICAgICAgICAgICAgICAgQHRhaWwgPSBAdGFpbC5zdWJhcnJheSh3cml0dGVuKVxuICAgICAgICAgICAgZWxzZSAgICBcbiAgICAgICAgICAgICAgICBAdGFpbCA9IG51bGxcbiAgICAgICAgICAgIFxuICAgICAgICBjdXJyZW50UG9zaXRpb24gPSBAYXVkaW8ubW96Q3VycmVudFNhbXBsZU9mZnNldCgpXG4gICAgICAgIGF2YWlsYWJsZSA9IGN1cnJlbnRQb3NpdGlvbiArIEBwcmVidWZmZXJTaXplIC0gQHdyaXRlUG9zaXRpb25cbiAgICAgICAgaWYgYXZhaWxhYmxlID4gMFxuICAgICAgICAgICAgYnVmZmVyID0gbmV3IEZsb2F0MzJBcnJheShhdmFpbGFibGUpXG4gICAgICAgICAgICBAZW1pdCAncmVmaWxsJywgYnVmZmVyXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHdyaXR0ZW4gPSBAYXVkaW8ubW96V3JpdGVBdWRpbyhidWZmZXIpXG4gICAgICAgICAgICBpZiB3cml0dGVuIDwgYnVmZmVyLmxlbmd0aFxuICAgICAgICAgICAgICAgIEB0YWlsID0gYnVmZmVyLnN1YmFycmF5KHdyaXR0ZW4pXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBAd3JpdGVQb3NpdGlvbiArPSB3cml0dGVuXG4gICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuXG4gICAgICAgIFxuICAgIGRlc3Ryb3k6IC0+XG4gICAgICAgIGRlc3Ryb3lUaW1lciBAdGltZXJcbiAgICAgICAgXG4gICAgZ2V0RGV2aWNlVGltZTogLT5cbiAgICAgICAgcmV0dXJuIEBhdWRpby5tb3pDdXJyZW50U2FtcGxlT2Zmc2V0KCkgLyBAY2hhbm5lbHNcbiAgICBcbiAgICAjIFVzZSBhbiBpbmxpbmUgd29ya2VyIHRvIGdldCBzZXRJbnRlcnZhbFxuICAgICMgd2l0aG91dCBiZWluZyBjbGFtcGVkIGluIGJhY2tncm91bmQgdGFic1xuICAgIGNyZWF0ZVRpbWVyID0gKGZuLCBpbnRlcnZhbCkgLT5cbiAgICAgICAgdXJsID0gQVZCdWZmZXIubWFrZUJsb2JVUkwoXCJzZXRJbnRlcnZhbChmdW5jdGlvbigpIHsgcG9zdE1lc3NhZ2UoJ3BpbmcnKTsgfSwgI3tpbnRlcnZhbH0pO1wiKVxuICAgICAgICByZXR1cm4gc2V0SW50ZXJ2YWwgZm4sIGludGVydmFsIHVubGVzcyB1cmw/XG4gICAgICAgICAgICAgICAgXG4gICAgICAgIHdvcmtlciA9IG5ldyBXb3JrZXIodXJsKVxuICAgICAgICB3b3JrZXIub25tZXNzYWdlID0gZm5cbiAgICAgICAgd29ya2VyLnVybCA9IHVybFxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHdvcmtlclxuICAgICAgICBcbiAgICBkZXN0cm95VGltZXIgPSAodGltZXIpIC0+XG4gICAgICAgIGlmIHRpbWVyLnRlcm1pbmF0ZVxuICAgICAgICAgICAgdGltZXIudGVybWluYXRlKClcbiAgICAgICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodGltZXIudXJsKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBjbGVhckludGVydmFsIHRpbWVyIiwiLypcbiAqIFRoaXMgcmVzYW1wbGVyIGlzIGZyb20gWEF1ZGlvSlM6IGh0dHBzOi8vZ2l0aHViLmNvbS9ncmFudGdhbGl0ei9YQXVkaW9KU1xuICogUGxhbm5lZCB0byBiZSByZXBsYWNlZCB3aXRoIHNyYy5qcywgZXZlbnR1YWxseTogaHR0cHM6Ly9naXRodWIuY29tL2p1c3NpLWthbGxpb2tvc2tpL3NyYy5qc1xuICovXG5cbi8vSmF2YVNjcmlwdCBBdWRpbyBSZXNhbXBsZXIgKGMpIDIwMTEgLSBHcmFudCBHYWxpdHpcbmZ1bmN0aW9uIFJlc2FtcGxlcihmcm9tU2FtcGxlUmF0ZSwgdG9TYW1wbGVSYXRlLCBjaGFubmVscywgb3V0cHV0QnVmZmVyU2l6ZSwgbm9SZXR1cm4pIHtcblx0dGhpcy5mcm9tU2FtcGxlUmF0ZSA9IGZyb21TYW1wbGVSYXRlO1xuXHR0aGlzLnRvU2FtcGxlUmF0ZSA9IHRvU2FtcGxlUmF0ZTtcblx0dGhpcy5jaGFubmVscyA9IGNoYW5uZWxzIHwgMDtcblx0dGhpcy5vdXRwdXRCdWZmZXJTaXplID0gb3V0cHV0QnVmZmVyU2l6ZTtcblx0dGhpcy5ub1JldHVybiA9ICEhbm9SZXR1cm47XG5cdHRoaXMuaW5pdGlhbGl6ZSgpO1xufVxuXG5SZXNhbXBsZXIucHJvdG90eXBlLmluaXRpYWxpemUgPSBmdW5jdGlvbiAoKSB7XG5cdC8vUGVyZm9ybSBzb21lIGNoZWNrczpcblx0aWYgKHRoaXMuZnJvbVNhbXBsZVJhdGUgPiAwICYmIHRoaXMudG9TYW1wbGVSYXRlID4gMCAmJiB0aGlzLmNoYW5uZWxzID4gMCkge1xuXHRcdGlmICh0aGlzLmZyb21TYW1wbGVSYXRlID09IHRoaXMudG9TYW1wbGVSYXRlKSB7XG5cdFx0XHQvL1NldHVwIGEgcmVzYW1wbGVyIGJ5cGFzczpcblx0XHRcdHRoaXMucmVzYW1wbGVyID0gdGhpcy5ieXBhc3NSZXNhbXBsZXI7XHRcdC8vUmVzYW1wbGVyIGp1c3QgcmV0dXJucyB3aGF0IHdhcyBwYXNzZWQgdGhyb3VnaC5cblx0XHRcdHRoaXMucmF0aW9XZWlnaHQgPSAxO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGlmICh0aGlzLmZyb21TYW1wbGVSYXRlIDwgdGhpcy50b1NhbXBsZVJhdGUpIHtcblx0XHRcdFx0Lypcblx0XHRcdFx0XHRVc2UgZ2VuZXJpYyBsaW5lYXIgaW50ZXJwb2xhdGlvbiBpZiB1cHNhbXBsaW5nLFxuXHRcdFx0XHRcdGFzIGxpbmVhciBpbnRlcnBvbGF0aW9uIHByb2R1Y2VzIGEgZ3JhZGllbnQgdGhhdCB3ZSB3YW50XG5cdFx0XHRcdFx0YW5kIHdvcmtzIGZpbmUgd2l0aCB0d28gaW5wdXQgc2FtcGxlIHBvaW50cyBwZXIgb3V0cHV0IGluIHRoaXMgY2FzZS5cblx0XHRcdFx0Ki9cblx0XHRcdFx0dGhpcy5jb21waWxlTGluZWFySW50ZXJwb2xhdGlvbkZ1bmN0aW9uKCk7XG5cdFx0XHRcdHRoaXMubGFzdFdlaWdodCA9IDE7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Lypcblx0XHRcdFx0XHRDdXN0b20gcmVzYW1wbGVyIEkgd3JvdGUgdGhhdCBkb2Vzbid0IHNraXAgc2FtcGxlc1xuXHRcdFx0XHRcdGxpa2Ugc3RhbmRhcmQgbGluZWFyIGludGVycG9sYXRpb24gaW4gaGlnaCBkb3duc2FtcGxpbmcuXG5cdFx0XHRcdFx0VGhpcyBpcyBtb3JlIGFjY3VyYXRlIHRoYW4gbGluZWFyIGludGVycG9sYXRpb24gb24gZG93bnNhbXBsaW5nLlxuXHRcdFx0XHQqL1xuXHRcdFx0XHR0aGlzLmNvbXBpbGVNdWx0aVRhcEZ1bmN0aW9uKCk7XG5cdFx0XHRcdHRoaXMudGFpbEV4aXN0cyA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLmxhc3RXZWlnaHQgPSAwO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yYXRpb1dlaWdodCA9IHRoaXMuZnJvbVNhbXBsZVJhdGUgLyB0aGlzLnRvU2FtcGxlUmF0ZTtcblx0XHRcdHRoaXMuaW5pdGlhbGl6ZUJ1ZmZlcnMoKTtcblx0XHR9XG5cdH1cblx0ZWxzZSB7XG5cdFx0dGhyb3cobmV3IEVycm9yKFwiSW52YWxpZCBzZXR0aW5ncyBzcGVjaWZpZWQgZm9yIHRoZSByZXNhbXBsZXIuXCIpKTtcblx0fVxufTtcblxuUmVzYW1wbGVyLnByb3RvdHlwZS5jb21waWxlTGluZWFySW50ZXJwb2xhdGlvbkZ1bmN0aW9uID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgdG9Db21waWxlID0gXCJ2YXIgYnVmZmVyTGVuZ3RoID0gYnVmZmVyLmxlbmd0aDtcXFxuXHR2YXIgb3V0TGVuZ3RoID0gdGhpcy5vdXRwdXRCdWZmZXJTaXplO1xcXG5cdGlmICgoYnVmZmVyTGVuZ3RoICUgXCIgKyB0aGlzLmNoYW5uZWxzICsgXCIpID09IDApIHtcXFxuXHRcdGlmIChidWZmZXJMZW5ndGggPiAwKSB7XFxcblx0XHRcdHZhciByYXRpb1dlaWdodCA9IHRoaXMucmF0aW9XZWlnaHQ7XFxcblx0XHRcdHZhciB3ZWlnaHQgPSB0aGlzLmxhc3RXZWlnaHQ7XFxcblx0XHRcdHZhciBmaXJzdFdlaWdodCA9IDA7XFxcblx0XHRcdHZhciBzZWNvbmRXZWlnaHQgPSAwO1xcXG5cdFx0XHR2YXIgc291cmNlT2Zmc2V0ID0gMDtcXFxuXHRcdFx0dmFyIG91dHB1dE9mZnNldCA9IDA7XFxcblx0XHRcdHZhciBvdXRwdXRCdWZmZXIgPSB0aGlzLm91dHB1dEJ1ZmZlcjtcXFxuXHRcdFx0Zm9yICg7IHdlaWdodCA8IDE7IHdlaWdodCArPSByYXRpb1dlaWdodCkge1xcXG5cdFx0XHRcdHNlY29uZFdlaWdodCA9IHdlaWdodCAlIDE7XFxcblx0XHRcdFx0Zmlyc3RXZWlnaHQgPSAxIC0gc2Vjb25kV2VpZ2h0O1wiO1xuXHRmb3IgKHZhciBjaGFubmVsID0gMDsgY2hhbm5lbCA8IHRoaXMuY2hhbm5lbHM7ICsrY2hhbm5lbCkge1xuXHRcdHRvQ29tcGlsZSArPSBcIm91dHB1dEJ1ZmZlcltvdXRwdXRPZmZzZXQrK10gPSAodGhpcy5sYXN0T3V0cHV0W1wiICsgY2hhbm5lbCArIFwiXSAqIGZpcnN0V2VpZ2h0KSArIChidWZmZXJbXCIgKyBjaGFubmVsICsgXCJdICogc2Vjb25kV2VpZ2h0KTtcIjtcblx0fVxuXHR0b0NvbXBpbGUgKz0gXCJ9XFxcblx0XHRcdHdlaWdodCAtPSAxO1xcXG5cdFx0XHRmb3IgKGJ1ZmZlckxlbmd0aCAtPSBcIiArIHRoaXMuY2hhbm5lbHMgKyBcIiwgc291cmNlT2Zmc2V0ID0gTWF0aC5mbG9vcih3ZWlnaHQpICogXCIgKyB0aGlzLmNoYW5uZWxzICsgXCI7IG91dHB1dE9mZnNldCA8IG91dExlbmd0aCAmJiBzb3VyY2VPZmZzZXQgPCBidWZmZXJMZW5ndGg7KSB7XFxcblx0XHRcdFx0c2Vjb25kV2VpZ2h0ID0gd2VpZ2h0ICUgMTtcXFxuXHRcdFx0XHRmaXJzdFdlaWdodCA9IDEgLSBzZWNvbmRXZWlnaHQ7XCI7XG5cdGZvciAodmFyIGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgdGhpcy5jaGFubmVsczsgKytjaGFubmVsKSB7XG5cdFx0dG9Db21waWxlICs9IFwib3V0cHV0QnVmZmVyW291dHB1dE9mZnNldCsrXSA9IChidWZmZXJbc291cmNlT2Zmc2V0XCIgKyAoKGNoYW5uZWwgPiAwKSA/IChcIiArIFwiICsgY2hhbm5lbCkgOiBcIlwiKSArIFwiXSAqIGZpcnN0V2VpZ2h0KSArIChidWZmZXJbc291cmNlT2Zmc2V0ICsgXCIgKyAodGhpcy5jaGFubmVscyArIGNoYW5uZWwpICsgXCJdICogc2Vjb25kV2VpZ2h0KTtcIjtcblx0fVxuXHR0b0NvbXBpbGUgKz0gXCJ3ZWlnaHQgKz0gcmF0aW9XZWlnaHQ7XFxcblx0XHRcdFx0c291cmNlT2Zmc2V0ID0gTWF0aC5mbG9vcih3ZWlnaHQpICogXCIgKyB0aGlzLmNoYW5uZWxzICsgXCI7XFxcblx0XHRcdH1cIjtcblx0Zm9yICh2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCB0aGlzLmNoYW5uZWxzOyArK2NoYW5uZWwpIHtcblx0XHR0b0NvbXBpbGUgKz0gXCJ0aGlzLmxhc3RPdXRwdXRbXCIgKyBjaGFubmVsICsgXCJdID0gYnVmZmVyW3NvdXJjZU9mZnNldCsrXTtcIjtcblx0fVxuXHR0b0NvbXBpbGUgKz0gXCJ0aGlzLmxhc3RXZWlnaHQgPSB3ZWlnaHQgJSAxO1xcXG5cdFx0XHRyZXR1cm4gdGhpcy5idWZmZXJTbGljZShvdXRwdXRPZmZzZXQpO1xcXG5cdFx0fVxcXG5cdFx0ZWxzZSB7XFxcblx0XHRcdHJldHVybiAodGhpcy5ub1JldHVybikgPyAwIDogW107XFxcblx0XHR9XFxcblx0fVxcXG5cdGVsc2Uge1xcXG5cdFx0dGhyb3cobmV3IEVycm9yKFxcXCJCdWZmZXIgd2FzIG9mIGluY29ycmVjdCBzYW1wbGUgbGVuZ3RoLlxcXCIpKTtcXFxuXHR9XCI7XG5cdHRoaXMucmVzYW1wbGVyID0gRnVuY3Rpb24oXCJidWZmZXJcIiwgdG9Db21waWxlKTtcbn07XG5cblJlc2FtcGxlci5wcm90b3R5cGUuY29tcGlsZU11bHRpVGFwRnVuY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG5cdHZhciB0b0NvbXBpbGUgPSBcInZhciBidWZmZXJMZW5ndGggPSBidWZmZXIubGVuZ3RoO1xcXG5cdHZhciBvdXRMZW5ndGggPSB0aGlzLm91dHB1dEJ1ZmZlclNpemU7XFxcblx0aWYgKChidWZmZXJMZW5ndGggJSBcIiArIHRoaXMuY2hhbm5lbHMgKyBcIikgPT0gMCkge1xcXG5cdFx0aWYgKGJ1ZmZlckxlbmd0aCA+IDApIHtcXFxuXHRcdFx0dmFyIHJhdGlvV2VpZ2h0ID0gdGhpcy5yYXRpb1dlaWdodDtcXFxuXHRcdFx0dmFyIHdlaWdodCA9IDA7XCI7XG5cdGZvciAodmFyIGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgdGhpcy5jaGFubmVsczsgKytjaGFubmVsKSB7XG5cdFx0dG9Db21waWxlICs9IFwidmFyIG91dHB1dFwiICsgY2hhbm5lbCArIFwiID0gMDtcIlxuXHR9XG5cdHRvQ29tcGlsZSArPSBcInZhciBhY3R1YWxQb3NpdGlvbiA9IDA7XFxcblx0XHRcdHZhciBhbW91bnRUb05leHQgPSAwO1xcXG5cdFx0XHR2YXIgYWxyZWFkeVByb2Nlc3NlZFRhaWwgPSAhdGhpcy50YWlsRXhpc3RzO1xcXG5cdFx0XHR0aGlzLnRhaWxFeGlzdHMgPSBmYWxzZTtcXFxuXHRcdFx0dmFyIG91dHB1dEJ1ZmZlciA9IHRoaXMub3V0cHV0QnVmZmVyO1xcXG5cdFx0XHR2YXIgb3V0cHV0T2Zmc2V0ID0gMDtcXFxuXHRcdFx0dmFyIGN1cnJlbnRQb3NpdGlvbiA9IDA7XFxcblx0XHRcdGRvIHtcXFxuXHRcdFx0XHRpZiAoYWxyZWFkeVByb2Nlc3NlZFRhaWwpIHtcXFxuXHRcdFx0XHRcdHdlaWdodCA9IHJhdGlvV2VpZ2h0O1wiO1xuXHRmb3IgKGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgdGhpcy5jaGFubmVsczsgKytjaGFubmVsKSB7XG5cdFx0dG9Db21waWxlICs9IFwib3V0cHV0XCIgKyBjaGFubmVsICsgXCIgPSAwO1wiXG5cdH1cblx0dG9Db21waWxlICs9IFwifVxcXG5cdFx0XHRcdGVsc2Uge1xcXG5cdFx0XHRcdFx0d2VpZ2h0ID0gdGhpcy5sYXN0V2VpZ2h0O1wiO1xuXHRmb3IgKGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgdGhpcy5jaGFubmVsczsgKytjaGFubmVsKSB7XG5cdFx0dG9Db21waWxlICs9IFwib3V0cHV0XCIgKyBjaGFubmVsICsgXCIgPSB0aGlzLmxhc3RPdXRwdXRbXCIgKyBjaGFubmVsICsgXCJdO1wiXG5cdH1cblx0dG9Db21waWxlICs9IFwiYWxyZWFkeVByb2Nlc3NlZFRhaWwgPSB0cnVlO1xcXG5cdFx0XHRcdH1cXFxuXHRcdFx0XHR3aGlsZSAod2VpZ2h0ID4gMCAmJiBhY3R1YWxQb3NpdGlvbiA8IGJ1ZmZlckxlbmd0aCkge1xcXG5cdFx0XHRcdFx0YW1vdW50VG9OZXh0ID0gMSArIGFjdHVhbFBvc2l0aW9uIC0gY3VycmVudFBvc2l0aW9uO1xcXG5cdFx0XHRcdFx0aWYgKHdlaWdodCA+PSBhbW91bnRUb05leHQpIHtcIjtcblx0Zm9yIChjaGFubmVsID0gMDsgY2hhbm5lbCA8IHRoaXMuY2hhbm5lbHM7ICsrY2hhbm5lbCkge1xuXHRcdHRvQ29tcGlsZSArPSBcIm91dHB1dFwiICsgY2hhbm5lbCArIFwiICs9IGJ1ZmZlclthY3R1YWxQb3NpdGlvbisrXSAqIGFtb3VudFRvTmV4dDtcIlxuXHR9XG5cdHRvQ29tcGlsZSArPSBcImN1cnJlbnRQb3NpdGlvbiA9IGFjdHVhbFBvc2l0aW9uO1xcXG5cdFx0XHRcdFx0XHR3ZWlnaHQgLT0gYW1vdW50VG9OZXh0O1xcXG5cdFx0XHRcdFx0fVxcXG5cdFx0XHRcdFx0ZWxzZSB7XCI7XG5cdGZvciAoY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCB0aGlzLmNoYW5uZWxzOyArK2NoYW5uZWwpIHtcblx0XHR0b0NvbXBpbGUgKz0gXCJvdXRwdXRcIiArIGNoYW5uZWwgKyBcIiArPSBidWZmZXJbYWN0dWFsUG9zaXRpb25cIiArICgoY2hhbm5lbCA+IDApID8gKFwiICsgXCIgKyBjaGFubmVsKSA6IFwiXCIpICsgXCJdICogd2VpZ2h0O1wiXG5cdH1cblx0dG9Db21waWxlICs9IFwiY3VycmVudFBvc2l0aW9uICs9IHdlaWdodDtcXFxuXHRcdFx0XHRcdFx0d2VpZ2h0ID0gMDtcXFxuXHRcdFx0XHRcdFx0YnJlYWs7XFxcblx0XHRcdFx0XHR9XFxcblx0XHRcdFx0fVxcXG5cdFx0XHRcdGlmICh3ZWlnaHQgPT0gMCkge1wiO1xuXHRmb3IgKGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgdGhpcy5jaGFubmVsczsgKytjaGFubmVsKSB7XG5cdFx0dG9Db21waWxlICs9IFwib3V0cHV0QnVmZmVyW291dHB1dE9mZnNldCsrXSA9IG91dHB1dFwiICsgY2hhbm5lbCArIFwiIC8gcmF0aW9XZWlnaHQ7XCJcblx0fVxuXHR0b0NvbXBpbGUgKz0gXCJ9XFxcblx0XHRcdFx0ZWxzZSB7XFxcblx0XHRcdFx0XHR0aGlzLmxhc3RXZWlnaHQgPSB3ZWlnaHQ7XCI7XG5cdGZvciAoY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCB0aGlzLmNoYW5uZWxzOyArK2NoYW5uZWwpIHtcblx0XHR0b0NvbXBpbGUgKz0gXCJ0aGlzLmxhc3RPdXRwdXRbXCIgKyBjaGFubmVsICsgXCJdID0gb3V0cHV0XCIgKyBjaGFubmVsICsgXCI7XCJcblx0fVxuXHR0b0NvbXBpbGUgKz0gXCJ0aGlzLnRhaWxFeGlzdHMgPSB0cnVlO1xcXG5cdFx0XHRcdFx0YnJlYWs7XFxcblx0XHRcdFx0fVxcXG5cdFx0XHR9IHdoaWxlIChhY3R1YWxQb3NpdGlvbiA8IGJ1ZmZlckxlbmd0aCAmJiBvdXRwdXRPZmZzZXQgPCBvdXRMZW5ndGgpO1xcXG5cdFx0XHRyZXR1cm4gdGhpcy5idWZmZXJTbGljZShvdXRwdXRPZmZzZXQpO1xcXG5cdFx0fVxcXG5cdFx0ZWxzZSB7XFxcblx0XHRcdHJldHVybiAodGhpcy5ub1JldHVybikgPyAwIDogW107XFxcblx0XHR9XFxcblx0fVxcXG5cdGVsc2Uge1xcXG5cdFx0dGhyb3cobmV3IEVycm9yKFxcXCJCdWZmZXIgd2FzIG9mIGluY29ycmVjdCBzYW1wbGUgbGVuZ3RoLlxcXCIpKTtcXFxuXHR9XCI7XG5cdHRoaXMucmVzYW1wbGVyID0gRnVuY3Rpb24oXCJidWZmZXJcIiwgdG9Db21waWxlKTtcbn07XG5cblJlc2FtcGxlci5wcm90b3R5cGUuYnlwYXNzUmVzYW1wbGVyID0gZnVuY3Rpb24gKGJ1ZmZlcikge1xuXHRpZiAodGhpcy5ub1JldHVybikge1xuXHRcdC8vU2V0IHRoZSBidWZmZXIgcGFzc2VkIGFzIG91ciBvd24sIGFzIHdlIGRvbid0IG5lZWQgdG8gcmVzYW1wbGUgaXQ6XG5cdFx0dGhpcy5vdXRwdXRCdWZmZXIgPSBidWZmZXI7XG5cdFx0cmV0dXJuIGJ1ZmZlci5sZW5ndGg7XG5cdH1cblx0ZWxzZSB7XG5cdFx0Ly9KdXN0IHJldHVybiB0aGUgYnVmZmVyIHBhc3NzZWQ6XG5cdFx0cmV0dXJuIGJ1ZmZlcjtcblx0fVxufTtcblxuUmVzYW1wbGVyLnByb3RvdHlwZS5idWZmZXJTbGljZSA9IGZ1bmN0aW9uIChzbGljZUFtb3VudCkge1xuXHRpZiAodGhpcy5ub1JldHVybikge1xuXHRcdC8vSWYgd2UncmUgZ29pbmcgdG8gYWNjZXNzIHRoZSBwcm9wZXJ0aWVzIGRpcmVjdGx5IGZyb20gdGhpcyBvYmplY3Q6XG5cdFx0cmV0dXJuIHNsaWNlQW1vdW50O1xuXHR9XG5cdGVsc2Uge1xuXHRcdC8vVHlwZWQgYXJyYXkgYW5kIG5vcm1hbCBhcnJheSBidWZmZXIgc2VjdGlvbiByZWZlcmVuY2luZzpcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3V0cHV0QnVmZmVyLnN1YmFycmF5KDAsIHNsaWNlQW1vdW50KTtcblx0XHR9XG5cdFx0Y2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvL1JlZ3VsYXIgYXJyYXkgcGFzczpcblx0XHRcdFx0dGhpcy5vdXRwdXRCdWZmZXIubGVuZ3RoID0gc2xpY2VBbW91bnQ7XG5cdFx0XHRcdHJldHVybiB0aGlzLm91dHB1dEJ1ZmZlcjtcblx0XHRcdH1cblx0XHRcdGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvL05pZ2h0bHkgRmlyZWZveCA0IHVzZWQgdG8gaGF2ZSB0aGUgc3ViYXJyYXkgZnVuY3Rpb24gbmFtZWQgYXMgc2xpY2U6XG5cdFx0XHRcdHJldHVybiB0aGlzLm91dHB1dEJ1ZmZlci5zbGljZSgwLCBzbGljZUFtb3VudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59O1xuXG5SZXNhbXBsZXIucHJvdG90eXBlLmluaXRpYWxpemVCdWZmZXJzID0gZnVuY3Rpb24gKCkge1xuXHQvL0luaXRpYWxpemUgdGhlIGludGVybmFsIGJ1ZmZlcjpcblx0dHJ5IHtcblx0XHR0aGlzLm91dHB1dEJ1ZmZlciA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5vdXRwdXRCdWZmZXJTaXplKTtcblx0XHR0aGlzLmxhc3RPdXRwdXQgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMuY2hhbm5lbHMpO1xuXHR9XG5cdGNhdGNoIChlcnJvcikge1xuXHRcdHRoaXMub3V0cHV0QnVmZmVyID0gW107XG5cdFx0dGhpcy5sYXN0T3V0cHV0ID0gW107XG5cdH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUmVzYW1wbGVyO1xuIiwiRXZlbnRFbWl0dGVyID0gcmVxdWlyZSAnLi4vY29yZS9ldmVudHMnXG5BdWRpb0RldmljZSA9IHJlcXVpcmUgJy4uL2RldmljZSdcblJlc2FtcGxlciA9IHJlcXVpcmUgJy4vcmVzYW1wbGVyJ1xuXG5jbGFzcyBXZWJBdWRpb0RldmljZSBleHRlbmRzIEV2ZW50RW1pdHRlclxuICAgIEF1ZGlvRGV2aWNlLnJlZ2lzdGVyKFdlYkF1ZGlvRGV2aWNlKVxuICAgIFxuICAgICMgZGV0ZXJtaW5lIHdoZXRoZXIgdGhpcyBkZXZpY2UgaXMgc3VwcG9ydGVkIGJ5IHRoZSBicm93c2VyXG4gICAgQXVkaW9Db250ZXh0ID0gZ2xvYmFsLkF1ZGlvQ29udGV4dCBvciBnbG9iYWwud2Via2l0QXVkaW9Db250ZXh0XG4gICAgQHN1cHBvcnRlZCA9IEF1ZGlvQ29udGV4dCBhbmQgXG4gICAgICAodHlwZW9mIEF1ZGlvQ29udGV4dDo6W2NyZWF0ZVByb2Nlc3NvciA9ICdjcmVhdGVTY3JpcHRQcm9jZXNzb3InXSBpcyAnZnVuY3Rpb24nIG9yXG4gICAgICB0eXBlb2YgQXVkaW9Db250ZXh0OjpbY3JlYXRlUHJvY2Vzc29yID0gJ2NyZWF0ZUphdmFTY3JpcHROb2RlJ10gIGlzICdmdW5jdGlvbicpXG4gICAgXG4gICAgIyBDaHJvbWUgbGltaXRzIHRoZSBudW1iZXIgb2YgQXVkaW9Db250ZXh0cyB0aGF0IG9uZSBjYW4gY3JlYXRlLFxuICAgICMgc28gdXNlIGEgbGF6aWx5IGNyZWF0ZWQgc2hhcmVkIGNvbnRleHQgZm9yIGFsbCBwbGF5YmFja1xuICAgIHNoYXJlZENvbnRleHQgPSBudWxsXG4gICAgXG4gICAgY29uc3RydWN0b3I6IChAc2FtcGxlUmF0ZSwgQGNoYW5uZWxzKSAtPlxuICAgICAgICBAY29udGV4dCA9IHNoYXJlZENvbnRleHQgPz0gbmV3IEF1ZGlvQ29udGV4dFxuICAgICAgICBAZGV2aWNlU2FtcGxlUmF0ZSA9IEBjb250ZXh0LnNhbXBsZVJhdGVcbiAgICAgICAgXG4gICAgICAgICMgY2FsY3VsYXRlIHRoZSBidWZmZXIgc2l6ZSB0byByZWFkXG4gICAgICAgIEBidWZmZXJTaXplID0gTWF0aC5jZWlsKDQwOTYgLyAoQGRldmljZVNhbXBsZVJhdGUgLyBAc2FtcGxlUmF0ZSkgKiBAY2hhbm5lbHMpXG4gICAgICAgIEBidWZmZXJTaXplICs9IEBidWZmZXJTaXplICUgQGNoYW5uZWxzXG4gICAgICAgIFxuICAgICAgICAjIGlmIHRoZSBzYW1wbGUgcmF0ZSBkb2Vzbid0IG1hdGNoIHRoZSBoYXJkd2FyZSBzYW1wbGUgcmF0ZSwgY3JlYXRlIGEgcmVzYW1wbGVyXG4gICAgICAgIGlmIEBkZXZpY2VTYW1wbGVSYXRlIGlzbnQgQHNhbXBsZVJhdGVcbiAgICAgICAgICAgIEByZXNhbXBsZXIgPSBuZXcgUmVzYW1wbGVyKEBzYW1wbGVSYXRlLCBAZGV2aWNlU2FtcGxlUmF0ZSwgQGNoYW5uZWxzLCA0MDk2ICogQGNoYW5uZWxzKVxuXG4gICAgICAgIEBub2RlID0gQGNvbnRleHRbY3JlYXRlUHJvY2Vzc29yXSg0MDk2LCBAY2hhbm5lbHMsIEBjaGFubmVscylcbiAgICAgICAgQG5vZGUub25hdWRpb3Byb2Nlc3MgPSBAcmVmaWxsXG4gICAgICAgIEBub2RlLmNvbm5lY3QoQGNvbnRleHQuZGVzdGluYXRpb24pXG4gICAgICAgIFxuICAgIHJlZmlsbDogKGV2ZW50KSA9PlxuICAgICAgICBvdXRwdXRCdWZmZXIgPSBldmVudC5vdXRwdXRCdWZmZXJcbiAgICAgICAgY2hhbm5lbENvdW50ID0gb3V0cHV0QnVmZmVyLm51bWJlck9mQ2hhbm5lbHNcbiAgICAgICAgY2hhbm5lbHMgPSBuZXcgQXJyYXkoY2hhbm5lbENvdW50KVxuICAgICAgICBcbiAgICAgICAgIyBnZXQgb3V0cHV0IGNoYW5uZWxzXG4gICAgICAgIGZvciBpIGluIFswLi4uY2hhbm5lbENvdW50XSBieSAxXG4gICAgICAgICAgICBjaGFubmVsc1tpXSA9IG91dHB1dEJ1ZmZlci5nZXRDaGFubmVsRGF0YShpKVxuICAgICAgICBcbiAgICAgICAgIyBnZXQgYXVkaW8gZGF0YSAgICBcbiAgICAgICAgZGF0YSA9IG5ldyBGbG9hdDMyQXJyYXkoQGJ1ZmZlclNpemUpXG4gICAgICAgIEBlbWl0ICdyZWZpbGwnLCBkYXRhXG4gICAgICAgIFxuICAgICAgICAjIHJlc2FtcGxlIGlmIG5lY2Vzc2FyeSAgICBcbiAgICAgICAgaWYgQHJlc2FtcGxlclxuICAgICAgICAgICAgZGF0YSA9IEByZXNhbXBsZXIucmVzYW1wbGVyKGRhdGEpXG4gICAgICAgIFxuICAgICAgICAjIHdyaXRlIGRhdGEgdG8gb3V0cHV0XG4gICAgICAgIGZvciBpIGluIFswLi4ub3V0cHV0QnVmZmVyLmxlbmd0aF0gYnkgMVxuICAgICAgICAgICAgZm9yIG4gaW4gWzAuLi5jaGFubmVsQ291bnRdIGJ5IDFcbiAgICAgICAgICAgICAgICBjaGFubmVsc1tuXVtpXSA9IGRhdGFbaSAqIGNoYW5uZWxDb3VudCArIG5dXG4gICAgICAgICAgICAgICAgXG4gICAgICAgIHJldHVyblxuICAgICAgICBcbiAgICBkZXN0cm95OiAtPlxuICAgICAgICBAbm9kZS5kaXNjb25uZWN0KDApXG4gICAgICAgIFxuICAgIGdldERldmljZVRpbWU6IC0+XG4gICAgICAgIHJldHVybiBAY29udGV4dC5jdXJyZW50VGltZSAqIEBzYW1wbGVSYXRlIiwiY2xhc3MgRmlsdGVyXG4gICAgY29uc3RydWN0b3I6IChjb250ZXh0LCBrZXkpIC0+XG4gICAgICAgICMgZGVmYXVsdCBjb25zdHJ1Y3RvciB0YWtlcyBhIHNpbmdsZSB2YWx1ZVxuICAgICAgICAjIG92ZXJyaWRlIHRvIHRha2UgbW9yZSBwYXJhbWV0ZXJzXG4gICAgICAgIGlmIGNvbnRleHQgYW5kIGtleVxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IHRoaXMsICd2YWx1ZScsIFxuICAgICAgICAgICAgICAgIGdldDogLT4gY29udGV4dFtrZXldXG4gICAgICAgIFxuICAgIHByb2Nlc3M6IChidWZmZXIpIC0+XG4gICAgICAgICMgb3ZlcnJpZGUgdGhpcyBtZXRob2RcbiAgICAgICAgcmV0dXJuXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBGaWx0ZXJcbiIsIkZpbHRlciA9IHJlcXVpcmUgJy4uL2ZpbHRlcidcblxuY2xhc3MgQmFsYW5jZUZpbHRlciBleHRlbmRzIEZpbHRlclxuICAgIHByb2Nlc3M6IChidWZmZXIpIC0+XG4gICAgICAgIHJldHVybiBpZiBAdmFsdWUgaXMgMFxuICAgICAgICBwYW4gPSBNYXRoLm1heCgtNTAsIE1hdGgubWluKDUwLCBAdmFsdWUpKVxuICAgICAgICBcbiAgICAgICAgZm9yIGkgaW4gWzAuLi5idWZmZXIubGVuZ3RoXSBieSAyXG4gICAgICAgICAgICBidWZmZXJbaV0gKj0gTWF0aC5taW4oMSwgKDUwIC0gcGFuKSAvIDUwKVxuICAgICAgICAgICAgYnVmZmVyW2kgKyAxXSAqPSBNYXRoLm1pbigxLCAoNTAgKyBwYW4pIC8gNTApXG4gICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBCYWxhbmNlRmlsdGVyXG4iLCJGaWx0ZXIgPSByZXF1aXJlICcuLi9maWx0ZXInXG5cbmNsYXNzIFZvbHVtZUZpbHRlciBleHRlbmRzIEZpbHRlclxuICAgIHByb2Nlc3M6IChidWZmZXIpIC0+XG4gICAgICAgIHJldHVybiBpZiBAdmFsdWUgPj0gMTAwXG4gICAgICAgIHZvbCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgQHZhbHVlKSkgLyAxMDBcbiAgICAgICAgXG4gICAgICAgIGZvciBpIGluIFswLi4uYnVmZmVyLmxlbmd0aF0gYnkgMVxuICAgICAgICAgICAgYnVmZmVyW2ldICo9IHZvbFxuICAgICAgICAgICAgXG4gICAgICAgIHJldHVyblxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gVm9sdW1lRmlsdGVyXG4iLCIjXG4jIFRoZSBQbGF5ZXIgY2xhc3MgcGxheXMgYmFjayBhdWRpbyBkYXRhIGZyb20gdmFyaW91cyBzb3VyY2VzXG4jIGFzIGRlY29kZWQgYnkgdGhlIEFzc2V0IGNsYXNzLiAgSW4gYWRkaXRpb24sIGl0IGhhbmRsZXNcbiMgY29tbW9uIGF1ZGlvIGZpbHRlcnMgbGlrZSBwYW5uaW5nIGFuZCB2b2x1bWUgYWRqdXN0bWVudCxcbiMgYW5kIGludGVyZmFjaW5nIHdpdGggQXVkaW9EZXZpY2VzIHRvIGtlZXAgdHJhY2sgb2YgdGhlIFxuIyBwbGF5YmFjayB0aW1lLlxuI1xuXG5FdmVudEVtaXR0ZXIgPSByZXF1aXJlICcuL2NvcmUvZXZlbnRzJ1xuQXNzZXQgPSByZXF1aXJlICcuL2Fzc2V0J1xuVm9sdW1lRmlsdGVyID0gcmVxdWlyZSAnLi9maWx0ZXJzL3ZvbHVtZSdcbkJhbGFuY2VGaWx0ZXIgPSByZXF1aXJlICcuL2ZpbHRlcnMvYmFsYW5jZSdcblF1ZXVlID0gcmVxdWlyZSAnLi9xdWV1ZSdcbkF1ZGlvRGV2aWNlID0gcmVxdWlyZSAnLi9kZXZpY2UnXG5cbmNsYXNzIFBsYXllciBleHRlbmRzIEV2ZW50RW1pdHRlclxuICAgIGNvbnN0cnVjdG9yOiAoQGFzc2V0KSAtPlxuICAgICAgICBAcGxheWluZyA9IGZhbHNlXG4gICAgICAgIEBidWZmZXJlZCA9IDBcbiAgICAgICAgQGN1cnJlbnRUaW1lID0gMFxuICAgICAgICBAZHVyYXRpb24gPSAwXG4gICAgICAgIEB2b2x1bWUgPSAxMDBcbiAgICAgICAgQHBhbiA9IDAgIyAtNTAgZm9yIGxlZnQsIDUwIGZvciByaWdodCwgMCBmb3IgY2VudGVyXG4gICAgICAgIEBtZXRhZGF0YSA9IHt9XG4gICAgICAgIFxuICAgICAgICBAZmlsdGVycyA9IFtcbiAgICAgICAgICAgIG5ldyBWb2x1bWVGaWx0ZXIodGhpcywgJ3ZvbHVtZScpXG4gICAgICAgICAgICBuZXcgQmFsYW5jZUZpbHRlcih0aGlzLCAncGFuJylcbiAgICAgICAgXVxuICAgICAgICBcbiAgICAgICAgQGFzc2V0Lm9uICdidWZmZXInLCAoQGJ1ZmZlcmVkKSA9PlxuICAgICAgICAgICAgQGVtaXQgJ2J1ZmZlcicsIEBidWZmZXJlZFxuICAgICAgICBcbiAgICAgICAgQGFzc2V0Lm9uICdkZWNvZGVTdGFydCcsID0+XG4gICAgICAgICAgICBAcXVldWUgPSBuZXcgUXVldWUoQGFzc2V0KVxuICAgICAgICAgICAgQHF1ZXVlLm9uY2UgJ3JlYWR5JywgQHN0YXJ0UGxheWluZ1xuICAgICAgICAgICAgXG4gICAgICAgIEBhc3NldC5vbiAnZm9ybWF0JywgKEBmb3JtYXQpID0+XG4gICAgICAgICAgICBAZW1pdCAnZm9ybWF0JywgQGZvcm1hdFxuICAgICAgICAgICAgXG4gICAgICAgIEBhc3NldC5vbiAnbWV0YWRhdGEnLCAoQG1ldGFkYXRhKSA9PlxuICAgICAgICAgICAgQGVtaXQgJ21ldGFkYXRhJywgQG1ldGFkYXRhXG4gICAgICAgICAgICBcbiAgICAgICAgQGFzc2V0Lm9uICdkdXJhdGlvbicsIChAZHVyYXRpb24pID0+XG4gICAgICAgICAgICBAZW1pdCAnZHVyYXRpb24nLCBAZHVyYXRpb25cbiAgICAgICAgICAgIFxuICAgICAgICBAYXNzZXQub24gJ2Vycm9yJywgKGVycm9yKSA9PlxuICAgICAgICAgICAgQGVtaXQgJ2Vycm9yJywgZXJyb3JcbiAgICAgICAgICAgICAgICBcbiAgICBAZnJvbVVSTDogKHVybCkgLT5cbiAgICAgICAgcmV0dXJuIG5ldyBQbGF5ZXIgQXNzZXQuZnJvbVVSTCh1cmwpXG4gICAgICAgIFxuICAgIEBmcm9tRmlsZTogKGZpbGUpIC0+XG4gICAgICAgIHJldHVybiBuZXcgUGxheWVyIEFzc2V0LmZyb21GaWxlKGZpbGUpXG4gICAgICAgIFxuICAgIEBmcm9tQnVmZmVyOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gbmV3IFBsYXllciBBc3NldC5mcm9tQnVmZmVyKGJ1ZmZlcilcbiAgICAgICAgXG4gICAgcHJlbG9hZDogLT5cbiAgICAgICAgcmV0dXJuIHVubGVzcyBAYXNzZXRcbiAgICAgICAgXG4gICAgICAgIEBzdGFydGVkUHJlbG9hZGluZyA9IHRydWVcbiAgICAgICAgQGFzc2V0LnN0YXJ0KGZhbHNlKVxuICAgICAgICBcbiAgICBwbGF5OiAtPlxuICAgICAgICByZXR1cm4gaWYgQHBsYXlpbmdcbiAgICAgICAgXG4gICAgICAgIHVubGVzcyBAc3RhcnRlZFByZWxvYWRpbmdcbiAgICAgICAgICAgIEBwcmVsb2FkKClcbiAgICAgICAgXG4gICAgICAgIEBwbGF5aW5nID0gdHJ1ZVxuICAgICAgICBAZGV2aWNlPy5zdGFydCgpXG4gICAgICAgIFxuICAgIHBhdXNlOiAtPlxuICAgICAgICByZXR1cm4gdW5sZXNzIEBwbGF5aW5nXG4gICAgICAgIFxuICAgICAgICBAcGxheWluZyA9IGZhbHNlXG4gICAgICAgIEBkZXZpY2U/LnN0b3AoKVxuICAgICAgICBcbiAgICB0b2dnbGVQbGF5YmFjazogLT5cbiAgICAgICAgaWYgQHBsYXlpbmdcbiAgICAgICAgICAgIEBwYXVzZSgpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIEBwbGF5KClcbiAgICAgICAgXG4gICAgc3RvcDogLT5cbiAgICAgICAgQHBhdXNlKClcbiAgICAgICAgQGFzc2V0LnN0b3AoKVxuICAgICAgICBAZGV2aWNlPy5kZXN0cm95KClcbiAgICAgICAgXG4gICAgc2VlazogKHRpbWVzdGFtcCkgLT5cbiAgICAgICAgQGRldmljZT8uc3RvcCgpXG4gICAgICAgIEBxdWV1ZS5vbmNlICdyZWFkeScsID0+XG4gICAgICAgICAgICBAZGV2aWNlPy5zZWVrIEBjdXJyZW50VGltZVxuICAgICAgICAgICAgQGRldmljZT8uc3RhcnQoKSBpZiBAcGxheWluZ1xuICAgICAgICAgICAgXG4gICAgICAgICMgY29udmVydCB0aW1lc3RhbXAgdG8gc2FtcGxlIG51bWJlclxuICAgICAgICB0aW1lc3RhbXAgPSAodGltZXN0YW1wIC8gMTAwMCkgKiBAZm9ybWF0LnNhbXBsZVJhdGVcbiAgICAgICAgICAgIFxuICAgICAgICAjIHRoZSBhY3R1YWwgdGltZXN0YW1wIHdlIHNlZWtlZCB0byBtYXkgZGlmZmVyIFxuICAgICAgICAjIGZyb20gdGhlIHJlcXVlc3RlZCB0aW1lc3RhbXAgZHVlIHRvIG9wdGltaXphdGlvbnNcbiAgICAgICAgdGltZXN0YW1wID0gQGFzc2V0LmRlY29kZXIuc2Vlayh0aW1lc3RhbXApXG4gICAgICAgIFxuICAgICAgICAjIGNvbnZlcnQgYmFjayBmcm9tIHNhbXBsZXMgdG8gbWlsbGlzZWNvbmRzXG4gICAgICAgIEBjdXJyZW50VGltZSA9IHRpbWVzdGFtcCAvIEBmb3JtYXQuc2FtcGxlUmF0ZSAqIDEwMDAgfCAwXG4gICAgICAgIFxuICAgICAgICBAcXVldWUucmVzZXQoKVxuICAgICAgICByZXR1cm4gQGN1cnJlbnRUaW1lXG4gICAgICAgIFxuICAgIHN0YXJ0UGxheWluZzogPT5cbiAgICAgICAgZnJhbWUgPSBAcXVldWUucmVhZCgpXG4gICAgICAgIGZyYW1lT2Zmc2V0ID0gMFxuICAgICAgICBcbiAgICAgICAgQGRldmljZSA9IG5ldyBBdWRpb0RldmljZShAZm9ybWF0LnNhbXBsZVJhdGUsIEBmb3JtYXQuY2hhbm5lbHNQZXJGcmFtZSlcbiAgICAgICAgQGRldmljZS5vbiAndGltZVVwZGF0ZScsIChAY3VycmVudFRpbWUpID0+XG4gICAgICAgICAgICBAZW1pdCAncHJvZ3Jlc3MnLCBAY3VycmVudFRpbWVcbiAgICAgICAgXG4gICAgICAgIEByZWZpbGwgPSAoYnVmZmVyKSA9PlxuICAgICAgICAgICAgcmV0dXJuIHVubGVzcyBAcGxheWluZ1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAjIHRyeSByZWFkaW5nIGFub3RoZXIgZnJhbWUgaWYgb25lIGlzbid0IGFscmVhZHkgYXZhaWxhYmxlXG4gICAgICAgICAgICAjIGhhcHBlbnMgd2hlbiB3ZSBwbGF5IHRvIHRoZSBlbmQgYW5kIHRoZW4gc2VlayBiYWNrXG4gICAgICAgICAgICBpZiBub3QgZnJhbWVcbiAgICAgICAgICAgICAgICBmcmFtZSA9IEBxdWV1ZS5yZWFkKClcbiAgICAgICAgICAgICAgICBmcmFtZU9mZnNldCA9IDBcblxuICAgICAgICAgICAgYnVmZmVyT2Zmc2V0ID0gMFxuICAgICAgICAgICAgd2hpbGUgZnJhbWUgYW5kIGJ1ZmZlck9mZnNldCA8IGJ1ZmZlci5sZW5ndGhcbiAgICAgICAgICAgICAgICBtYXggPSBNYXRoLm1pbihmcmFtZS5sZW5ndGggLSBmcmFtZU9mZnNldCwgYnVmZmVyLmxlbmd0aCAtIGJ1ZmZlck9mZnNldClcbiAgICAgICAgICAgICAgICBmb3IgaSBpbiBbMC4uLm1heF0gYnkgMVxuICAgICAgICAgICAgICAgICAgICBidWZmZXJbYnVmZmVyT2Zmc2V0KytdID0gZnJhbWVbZnJhbWVPZmZzZXQrK11cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiBmcmFtZU9mZnNldCBpcyBmcmFtZS5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgZnJhbWUgPSBAcXVldWUucmVhZCgpXG4gICAgICAgICAgICAgICAgICAgIGZyYW1lT2Zmc2V0ID0gMFxuICAgICAgICAgICAgXG4gICAgICAgICAgICAjIHJ1biBhbnkgYXBwbGllZCBmaWx0ZXJzXG4gICAgICAgICAgICBmb3IgZmlsdGVyIGluIEBmaWx0ZXJzXG4gICAgICAgICAgICAgICAgZmlsdGVyLnByb2Nlc3MoYnVmZmVyKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgIyBpZiB3ZSd2ZSBydW4gb3V0IG9mIGRhdGEsIHBhdXNlIHRoZSBwbGF5ZXJcbiAgICAgICAgICAgIHVubGVzcyBmcmFtZVxuICAgICAgICAgICAgICAgICMgaWYgdGhpcyB3YXMgdGhlIGVuZCBvZiB0aGUgdHJhY2ssIG1ha2VcbiAgICAgICAgICAgICAgICAjIHN1cmUgdGhlIGN1cnJlbnRUaW1lIHJlZmxlY3RzIHRoYXRcbiAgICAgICAgICAgICAgICBpZiBAcXVldWUuZW5kZWRcbiAgICAgICAgICAgICAgICAgICAgQGN1cnJlbnRUaW1lID0gQGR1cmF0aW9uXG4gICAgICAgICAgICAgICAgICAgIEBlbWl0ICdwcm9ncmVzcycsIEBjdXJyZW50VGltZVxuICAgICAgICAgICAgICAgICAgICBAZW1pdCAnZW5kJ1xuICAgICAgICAgICAgICAgICAgICBAc3RvcCgpXG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAjIGlmIHdlIHJhbiBvdXQgb2YgZGF0YSBpbiB0aGUgbWlkZGxlIG9mIFxuICAgICAgICAgICAgICAgICAgICAjIHRoZSB0cmFjaywgc3RvcCB0aGUgdGltZXIgYnV0IGRvbid0IGNoYW5nZVxuICAgICAgICAgICAgICAgICAgICAjIHRoZSBwbGF5YmFjayBzdGF0ZVxuICAgICAgICAgICAgICAgICAgICBAZGV2aWNlLnN0b3AoKVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICBcbiAgICAgICAgQGRldmljZS5vbiAncmVmaWxsJywgQHJlZmlsbFxuICAgICAgICBAZGV2aWNlLnN0YXJ0KCkgaWYgQHBsYXlpbmdcbiAgICAgICAgQGVtaXQgJ3JlYWR5J1xuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gUGxheWVyXG4iLCJFdmVudEVtaXR0ZXIgPSByZXF1aXJlICcuL2NvcmUvZXZlbnRzJ1xuXG5jbGFzcyBRdWV1ZSBleHRlbmRzIEV2ZW50RW1pdHRlclxuICAgIGNvbnN0cnVjdG9yOiAoQGFzc2V0KSAtPlxuICAgICAgICBAcmVhZHlNYXJrID0gNjRcbiAgICAgICAgQGZpbmlzaGVkID0gZmFsc2VcbiAgICAgICAgQGJ1ZmZlcmluZyA9IHRydWVcbiAgICAgICAgQGVuZGVkID0gZmFsc2VcbiAgICAgICAgXG4gICAgICAgIEBidWZmZXJzID0gW11cbiAgICAgICAgQGFzc2V0Lm9uICdkYXRhJywgQHdyaXRlXG4gICAgICAgIEBhc3NldC5vbiAnZW5kJywgPT5cbiAgICAgICAgICAgIEBlbmRlZCA9IHRydWVcbiAgICAgICAgICAgIFxuICAgICAgICBAYXNzZXQuZGVjb2RlUGFja2V0KClcbiAgICAgICAgXG4gICAgd3JpdGU6IChidWZmZXIpID0+XG4gICAgICAgIEBidWZmZXJzLnB1c2ggYnVmZmVyIGlmIGJ1ZmZlclxuICAgICAgICBcbiAgICAgICAgaWYgQGJ1ZmZlcmluZ1xuICAgICAgICAgICAgaWYgQGJ1ZmZlcnMubGVuZ3RoID49IEByZWFkeU1hcmsgb3IgQGVuZGVkXG4gICAgICAgICAgICAgICAgQGJ1ZmZlcmluZyA9IGZhbHNlXG4gICAgICAgICAgICAgICAgQGVtaXQgJ3JlYWR5J1xuICAgICAgICAgICAgZWxzZSAgICBcbiAgICAgICAgICAgICAgICBAYXNzZXQuZGVjb2RlUGFja2V0KClcbiAgICAgICAgICAgIFxuICAgIHJlYWQ6IC0+XG4gICAgICAgIHJldHVybiBudWxsIGlmIEBidWZmZXJzLmxlbmd0aCBpcyAwXG4gICAgICAgIFxuICAgICAgICBAYXNzZXQuZGVjb2RlUGFja2V0KClcbiAgICAgICAgcmV0dXJuIEBidWZmZXJzLnNoaWZ0KClcbiAgICAgICAgXG4gICAgcmVzZXQ6IC0+XG4gICAgICAgIEBidWZmZXJzLmxlbmd0aCA9IDBcbiAgICAgICAgQGJ1ZmZlcmluZyA9IHRydWVcbiAgICAgICAgQGFzc2V0LmRlY29kZVBhY2tldCgpXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBRdWV1ZVxuIiwiRXZlbnRFbWl0dGVyID0gcmVxdWlyZSAnLi4vLi4vY29yZS9ldmVudHMnXG5BVkJ1ZmZlciA9IHJlcXVpcmUgJy4uLy4uL2NvcmUvYnVmZmVyJ1xuXG5jbGFzcyBGaWxlU291cmNlIGV4dGVuZHMgRXZlbnRFbWl0dGVyXG4gICAgY29uc3RydWN0b3I6IChAZmlsZSkgLT5cbiAgICAgICAgaWYgbm90IEZpbGVSZWFkZXI/XG4gICAgICAgICAgICByZXR1cm4gQGVtaXQgJ2Vycm9yJywgJ1RoaXMgYnJvd3NlciBkb2VzIG5vdCBoYXZlIEZpbGVSZWFkZXIgc3VwcG9ydC4nXG4gICAgICAgIFxuICAgICAgICBAb2Zmc2V0ID0gMFxuICAgICAgICBAbGVuZ3RoID0gQGZpbGUuc2l6ZVxuICAgICAgICBAY2h1bmtTaXplID0gMSA8PCAyMFxuICAgICAgICBAZmlsZVtAc2xpY2UgPSAnc2xpY2UnXSBvciBAZmlsZVtAc2xpY2UgPSAnd2Via2l0U2xpY2UnXSBvciBAZmlsZVtAc2xpY2UgPSAnbW96U2xpY2UnXVxuICAgICAgICAgICAgXG4gICAgc3RhcnQ6IC0+XG4gICAgICAgIGlmIEByZWFkZXJcbiAgICAgICAgICAgIHJldHVybiBAbG9vcCgpIHVubGVzcyBAYWN0aXZlXG4gICAgICAgIFxuICAgICAgICBAcmVhZGVyID0gbmV3IEZpbGVSZWFkZXJcbiAgICAgICAgQGFjdGl2ZSA9IHRydWVcbiAgICAgICAgXG4gICAgICAgIEByZWFkZXIub25sb2FkID0gKGUpID0+XG4gICAgICAgICAgICBidWYgPSBuZXcgQVZCdWZmZXIobmV3IFVpbnQ4QXJyYXkoZS50YXJnZXQucmVzdWx0KSlcbiAgICAgICAgICAgIEBvZmZzZXQgKz0gYnVmLmxlbmd0aFxuICAgICAgICBcbiAgICAgICAgICAgIEBlbWl0ICdkYXRhJywgYnVmICAgXG4gICAgICAgICAgICBAYWN0aXZlID0gZmFsc2UgICAgIFxuICAgICAgICAgICAgQGxvb3AoKSBpZiBAb2Zmc2V0IDwgQGxlbmd0aFxuICAgICAgICBcbiAgICAgICAgQHJlYWRlci5vbmxvYWRlbmQgPSA9PlxuICAgICAgICAgICAgaWYgQG9mZnNldCBpcyBAbGVuZ3RoXG4gICAgICAgICAgICAgICAgQGVtaXQgJ2VuZCdcbiAgICAgICAgICAgICAgICBAcmVhZGVyID0gbnVsbFxuICAgICAgICBcbiAgICAgICAgQHJlYWRlci5vbmVycm9yID0gKGUpID0+XG4gICAgICAgICAgICBAZW1pdCAnZXJyb3InLCBlXG4gICAgICAgIFxuICAgICAgICBAcmVhZGVyLm9ucHJvZ3Jlc3MgPSAoZSkgPT5cbiAgICAgICAgICAgIEBlbWl0ICdwcm9ncmVzcycsIChAb2Zmc2V0ICsgZS5sb2FkZWQpIC8gQGxlbmd0aCAqIDEwMFxuICAgICAgICBcbiAgICAgICAgQGxvb3AoKVxuICAgICAgICBcbiAgICBsb29wOiAtPlxuICAgICAgICBAYWN0aXZlID0gdHJ1ZVxuICAgICAgICBlbmRQb3MgPSBNYXRoLm1pbihAb2Zmc2V0ICsgQGNodW5rU2l6ZSwgQGxlbmd0aClcbiAgICAgICAgXG4gICAgICAgIGJsb2IgPSBAZmlsZVtAc2xpY2VdKEBvZmZzZXQsIGVuZFBvcylcbiAgICAgICAgQHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihibG9iKVxuICAgICAgICBcbiAgICBwYXVzZTogLT5cbiAgICAgICAgQGFjdGl2ZSA9IGZhbHNlXG4gICAgICAgIHRyeVxuICAgICAgICAgIEByZWFkZXI/LmFib3J0KClcbiAgICAgICAgXG4gICAgcmVzZXQ6IC0+XG4gICAgICAgIEBwYXVzZSgpXG4gICAgICAgIEBvZmZzZXQgPSAwXG5cbm1vZHVsZS5leHBvcnRzID0gRmlsZVNvdXJjZVxuIiwiRXZlbnRFbWl0dGVyID0gcmVxdWlyZSAnLi4vLi4vY29yZS9ldmVudHMnXG5BVkJ1ZmZlciA9IHJlcXVpcmUgJy4uLy4uL2NvcmUvYnVmZmVyJ1xuXG5jbGFzcyBIVFRQU291cmNlIGV4dGVuZHMgRXZlbnRFbWl0dGVyXG4gICAgY29uc3RydWN0b3I6IChAdXJsKSAtPlxuICAgICAgICBAY2h1bmtTaXplID0gMSA8PCAyMFxuICAgICAgICBAaW5mbGlnaHQgPSBmYWxzZVxuICAgICAgICBAcmVzZXQoKVxuICAgICAgICBcbiAgICBzdGFydDogLT5cbiAgICAgICAgaWYgQGxlbmd0aFxuICAgICAgICAgICAgcmV0dXJuIEBsb29wKCkgdW5sZXNzIEBpbmZsaWdodFxuICAgICAgICBcbiAgICAgICAgQGluZmxpZ2h0ID0gdHJ1ZVxuICAgICAgICBAeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KClcbiAgICAgICAgXG4gICAgICAgIEB4aHIub25sb2FkID0gKGV2ZW50KSA9PlxuICAgICAgICAgICAgQGxlbmd0aCA9IHBhcnNlSW50IEB4aHIuZ2V0UmVzcG9uc2VIZWFkZXIoXCJDb250ZW50LUxlbmd0aFwiKSAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIEBpbmZsaWdodCA9IGZhbHNlXG4gICAgICAgICAgICBAbG9vcCgpXG4gICAgICAgIFxuICAgICAgICBAeGhyLm9uZXJyb3IgPSAoZXJyKSA9PlxuICAgICAgICAgICAgQHBhdXNlKClcbiAgICAgICAgICAgIEBlbWl0ICdlcnJvcicsIGVyclxuICAgICAgICAgICAgXG4gICAgICAgIEB4aHIub25hYm9ydCA9IChldmVudCkgPT5cbiAgICAgICAgICAgIEBpbmZsaWdodCA9IGZhbHNlXG4gICAgICAgIFxuICAgICAgICBAeGhyLm9wZW4oXCJIRUFEXCIsIEB1cmwsIHRydWUpXG4gICAgICAgIEB4aHIuc2VuZChudWxsKVxuICAgICAgICBcbiAgICBsb29wOiAtPlxuICAgICAgICBpZiBAaW5mbGlnaHQgb3Igbm90IEBsZW5ndGhcbiAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnU29tZXRoaW5nIGlzIHdyb25nIGluIEhUVFBTb3VyY2UubG9vcCdcbiAgICAgICAgICAgIFxuICAgICAgICBAaW5mbGlnaHQgPSB0cnVlXG4gICAgICAgIEB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKVxuICAgICAgICBcbiAgICAgICAgQHhoci5vbmxvYWQgPSAoZXZlbnQpID0+XG4gICAgICAgICAgICBpZiBAeGhyLnJlc3BvbnNlXG4gICAgICAgICAgICAgICAgYnVmID0gbmV3IFVpbnQ4QXJyYXkoQHhoci5yZXNwb25zZSlcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0eHQgPSBAeGhyLnJlc3BvbnNlVGV4dFxuICAgICAgICAgICAgICAgIGJ1ZiA9IG5ldyBVaW50OEFycmF5KHR4dC5sZW5ndGgpXG4gICAgICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi50eHQubGVuZ3RoXVxuICAgICAgICAgICAgICAgICAgICBidWZbaV0gPSB0eHQuY2hhckNvZGVBdChpKSAmIDB4ZmZcblxuICAgICAgICAgICAgYnVmZmVyID0gbmV3IEFWQnVmZmVyKGJ1ZilcbiAgICAgICAgICAgIEBvZmZzZXQgKz0gYnVmZmVyLmxlbmd0aFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBAZW1pdCAnZGF0YScsIGJ1ZmZlclxuICAgICAgICAgICAgQGVtaXQgJ2VuZCcgaWYgQG9mZnNldCA+PSBAbGVuZ3RoXG5cbiAgICAgICAgICAgIEBpbmZsaWdodCA9IGZhbHNlXG4gICAgICAgICAgICBAbG9vcCgpIHVubGVzcyBAb2Zmc2V0ID49IEBsZW5ndGhcbiAgICAgICAgICAgIFxuICAgICAgICBAeGhyLm9ucHJvZ3Jlc3MgPSAoZXZlbnQpID0+XG4gICAgICAgICAgICBAZW1pdCAncHJvZ3Jlc3MnLCAoQG9mZnNldCArIGV2ZW50LmxvYWRlZCkgLyBAbGVuZ3RoICogMTAwXG5cbiAgICAgICAgQHhoci5vbmVycm9yID0gKGVycikgPT5cbiAgICAgICAgICAgIEBlbWl0ICdlcnJvcicsIGVyclxuICAgICAgICAgICAgQHBhdXNlKClcblxuICAgICAgICBAeGhyLm9uYWJvcnQgPSAoZXZlbnQpID0+XG4gICAgICAgICAgICBAaW5mbGlnaHQgPSBmYWxzZVxuXG4gICAgICAgIEB4aHIub3BlbihcIkdFVFwiLCBAdXJsLCB0cnVlKVxuICAgICAgICBAeGhyLnJlc3BvbnNlVHlwZSA9IFwiYXJyYXlidWZmZXJcIlxuXG4gICAgICAgIGVuZFBvcyA9IE1hdGgubWluKEBvZmZzZXQgKyBAY2h1bmtTaXplLCBAbGVuZ3RoKVxuICAgICAgICBAeGhyLnNldFJlcXVlc3RIZWFkZXIoXCJJZi1Ob25lLU1hdGNoXCIsIFwid2Via2l0LW5vLWNhY2hlXCIpXG4gICAgICAgIEB4aHIuc2V0UmVxdWVzdEhlYWRlcihcIlJhbmdlXCIsIFwiYnl0ZXM9I3tAb2Zmc2V0fS0je2VuZFBvc31cIilcbiAgICAgICAgQHhoci5vdmVycmlkZU1pbWVUeXBlKCd0ZXh0L3BsYWluOyBjaGFyc2V0PXgtdXNlci1kZWZpbmVkJylcbiAgICAgICAgQHhoci5zZW5kKG51bGwpXG4gICAgICAgIFxuICAgIHBhdXNlOiAtPlxuICAgICAgICBAaW5mbGlnaHQgPSBmYWxzZVxuICAgICAgICBAeGhyPy5hYm9ydCgpXG4gICAgICAgIFxuICAgIHJlc2V0OiAtPlxuICAgICAgICBAcGF1c2UoKVxuICAgICAgICBAb2Zmc2V0ID0gMFxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gSFRUUFNvdXJjZVxuIiwiRXZlbnRFbWl0dGVyID0gcmVxdWlyZSAnLi4vY29yZS9ldmVudHMnXG5CdWZmZXJMaXN0ID0gcmVxdWlyZSAnLi4vY29yZS9idWZmZXJsaXN0J1xuQVZCdWZmZXIgPSByZXF1aXJlICcuLi9jb3JlL2J1ZmZlcidcblxuY2xhc3MgQnVmZmVyU291cmNlIGV4dGVuZHMgRXZlbnRFbWl0dGVyICAgIFxuICAgIGNvbnN0cnVjdG9yOiAoaW5wdXQpIC0+XG4gICAgICAgICMgTm93IG1ha2UgYW4gQVYuQnVmZmVyTGlzdFxuICAgICAgICBpZiBpbnB1dCBpbnN0YW5jZW9mIEJ1ZmZlckxpc3RcbiAgICAgICAgICAgIEBsaXN0ID0gaW5wdXRcbiAgICAgICAgICAgIFxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBAbGlzdCA9IG5ldyBCdWZmZXJMaXN0XG4gICAgICAgICAgICBAbGlzdC5hcHBlbmQgbmV3IEFWQnVmZmVyKGlucHV0KVxuICAgICAgICAgICAgXG4gICAgICAgIEBwYXVzZWQgPSB0cnVlXG4gICAgICAgIFxuICAgIHNldEltbWVkaWF0ZSA9IGdsb2JhbC5zZXRJbW1lZGlhdGUgb3IgKGZuKSAtPlxuICAgICAgICBnbG9iYWwuc2V0VGltZW91dCBmbiwgMFxuICAgICAgICBcbiAgICBjbGVhckltbWVkaWF0ZSA9IGdsb2JhbC5jbGVhckltbWVkaWF0ZSBvciAodGltZXIpIC0+XG4gICAgICAgIGdsb2JhbC5jbGVhclRpbWVvdXQgdGltZXJcbiAgICAgICAgXG4gICAgc3RhcnQ6IC0+XG4gICAgICAgIEBwYXVzZWQgPSBmYWxzZVxuICAgICAgICBAX3RpbWVyID0gc2V0SW1tZWRpYXRlIEBsb29wXG4gICAgICAgIFxuICAgIGxvb3A6ID0+XG4gICAgICAgIEBlbWl0ICdwcm9ncmVzcycsIChAbGlzdC5udW1CdWZmZXJzIC0gQGxpc3QuYXZhaWxhYmxlQnVmZmVycyArIDEpIC8gQGxpc3QubnVtQnVmZmVycyAqIDEwMCB8IDBcbiAgICAgICAgQGVtaXQgJ2RhdGEnLCBAbGlzdC5maXJzdFxuICAgICAgICBpZiBAbGlzdC5hZHZhbmNlKClcbiAgICAgICAgICAgIHNldEltbWVkaWF0ZSBAbG9vcFxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBAZW1pdCAnZW5kJ1xuICAgICAgICBcbiAgICBwYXVzZTogLT5cbiAgICAgICAgY2xlYXJJbW1lZGlhdGUgQF90aW1lclxuICAgICAgICBAcGF1c2VkID0gdHJ1ZVxuICAgICAgICBcbiAgICByZXNldDogLT5cbiAgICAgICAgQHBhdXNlKClcbiAgICAgICAgQGxpc3QucmV3aW5kKClcbiAgICAgICAgXG5tb2R1bGUuZXhwb3J0cyA9IEJ1ZmZlclNvdXJjZVxuIl19
