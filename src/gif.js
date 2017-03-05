'use strict';

const BLOCK_TERMINATOR = 0x00
  , IMAGE_SEPARATOR = 0x2c
  , EXTENSION_INTRODUCER = 0x21
  , GRAPHIC_CONTROL_LABEL = 0xf9
  , APPLICATION_EXTENSION_LABEL = 0xff
  , TRAILER = 0x3b
  ;

const log = function(){};
// const log = console.log;

const caches = new Map();

export default class Gif {
  constructor(src) {
    this.src = src;
    this.header = new Header();
    this.body = new Body();
    this.playTime = null;
  }

  /**
   * gifファイルをダウンロードし、解析する（あるいは既に解析済みのキャッシュの）Promiseを返します。
   */
  load() {
    const cachedPromise = caches.get(this.src);
    if ( cachedPromise ) return cachedPromise;

    const promise = new Promise( (resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('GET', this.src, true);
      request.setRequestHeader('Accept', '*/*');
      request.responseType = 'arraybuffer';
      request.onload = function() {
        if ( this.status == 200 ) {
          resolve(this.response);
        } else {
          reject(Error(this.statusText));
        }
      };
      request.onerror = function() {
        reject(Error('network error'));
      }
      request.send();
    }).then( buffer => this.read(buffer));

    caches.set(this.src, promise);
    return promise;
  }

  /**
   * gifファイルを解析し、画像一枚一枚をframeとしてその配列を返します。
   *
   * @see http://www.geocities.co.jp/SiliconValley/1361/gif89a.txt
   * @see http://www.tohoho-web.com/wwwgif.htm
   */
  read(buffer) {
    return new Promise( (resolve, reject) => {
      this.header.read(buffer)
        .then( buffer => {
          return this.body.read(buffer);
        })
        .then( playTime => {
          this.playTime = playTime;
          resolve(this);
        })
        .catch( e => {
          reject(e);
        });
    });
  }

  /**
   * headerとbodyで別々に作ったbufferを別のArrayBufferにコピーしているのがコストなので使っていない。
   * new Blob()はBufferの配列を引数にできる
   */
  toArrayBuffer() {
    const h = new Uint8Array(this.header.toArrayBuffer());
    const b = new Uint8Array(this.body.toArrayBuffer());
    const length = h.length + b.length;

    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    let offset = 0;

    for ( let i=0; i<h.length; i++, offset++ ) {
      view.setUint8(offset, h[i]);
    }

    for ( let i=0; i<b.length; i++, offset++ ) {
      view.setUint8(offset, b[i]);
    }

    return buffer;
  }
}

class StreamReader {
  constructor(buffer) {
    this.data = new Uint8Array(buffer);
    this.index = 0;
  }

  readByte() {
    if ( this.index < this.data.length ) {
      return this.data[this.index++];  
    } else {
      return null;
    }
  }

  readBytes(n) {
    const start = this.index;
    this.index += n;
    return this.data.slice(start, this.index)
  }

  readAscii(n) {
    var s = '';
    for ( let i = 0; i < n; i++ ) {
      s += String.fromCharCode(this.readByte());
    }
    return s;
  }

  skip(n) {
    this.index += n;
  }

  peekByte() {
    return this.data[this.index];
  }

  peekBitAt(i) {
    return !!(this.peekByte() & (1 << 8 - i));
  }
}

class Header {
  /**
   * ファイル先頭からのbufferを引数に取る
   */
  constructor() {
    this.signature = 'GIF';
    this.version = '89a';
    this.width = null;
    this.height = null;
    this.packedFields = null;
    this.hasGlobalColorTable = null;
    this.colorResolution = null;
    this.isSorted = null;
    this.globalColorTableSize = null;
    this.backgroundColorIndex = null;
    this.pixelAspectRatio = null;
    this.globalColorTable = null;
    this._originalBuffer = null;
  }

  read(buffer) {
    return new Promise( (resolve, reject) => {
        const sr = new StreamReader(buffer);

        if ( sr.readAscii(6) != this.signature + this.version ) {
          reject(Error('ファイルがGIFフォーマットじゃない!'));
          return;
        }

        this.width = sr.readByte() + (sr.readByte() << 8);
        this.height = sr.readByte() + (sr.readByte() << 8);

        if ( this.hasGlobalColorTable = sr.peekBitAt(1) ) {
          // Global Color Tableが存在する
          this.packedFields = sr.readByte();
          this.colorResolution = (this.packedFields >> 4) & parseInt('0111', 2);
          this.isSorted = !!(this.packedFields & (1 << 3));
          this.globalColorTableSize = this.packedFields & parseInt('0111', 2);
            
          this.backgroundColorIndex = sr.readByte();
          this.pixelAspectRatio = sr.readByte();
          this.globalColorTable = sr.readBytes(3 * Math.pow(2, this.globalColorTableSize + 1));

        } else {
            // Global Color Tableが存在しない
        }

        this._originalBuffer = buffer.slice(0, sr.index);

        // ヘッダー分を切り捨てた bufferを返す
        resolve(buffer.slice(sr.index, buffer.lenght));
      });
  }

  /**
   * Headerのデータ長を返します。
   */
  length() {
    return this.signature.length 
      + this.version.length
      + 2 // this.width
      + 2 // this.height
      + 1 // this.packedFields
      + 1 // this.backgroundColorIndex
      + 1 // this.pixelAspectRatio
      + this.globalColorTable.length
      ;
  }

  /**
   * 値からArrayBufferを作って返します。
   */
  toArrayBuffer() {
    const _length = this.length();
    const buffer = new ArrayBuffer(_length);
    const view = new DataView(buffer);
    let offset = 0;

    for ( let i=0, l=this.signature.length; i<l; i++, offset++ ) {
      view.setUint8(offset, this.signature.charCodeAt(i));
    }
    for ( let i=0, l=this.version.length; i<l; i++, offset++ ) {
      view.setUint8(offset, this.version.charCodeAt(i));
    }
    const w = this.getLittleEndian(this.width);
    view.setUint8(offset++, w[0]);
    view.setUint8(offset++, w[1]);

    const h = this.getLittleEndian(this.height);
    view.setUint8(offset++, h[0]);
    view.setUint8(offset++, h[1]);

    view.setUint8(offset++, this.packedFields);
    view.setUint8(offset++, this.backgroundColorIndex);
    view.setUint8(offset++, this.pixelAspectRatio);

    for ( let i=0, l=this.globalColorTable.length; i<l; i++, offset++ ) {
      view.setUint8(offset, this.globalColorTable[i]);
    }

    log(`Header: ${_length}, ${offset}`);

    return buffer;
  }

  getLittleEndian(twoBytesStr) {
    const high = (twoBytesStr & 0xff00) >> 8;
    const low = twoBytesStr & 0x00ff;
    return [low, high];
  }
}

class ImageDescriptor {
  constructor() {
    this.imageSeparator = IMAGE_SEPARATOR;
    this.left = null;
    this.top = null;
    this.width = null;
    this.height = null;
    this.packedFields = null;
    this.hasLocalColorTable = null;
    this.isInterlaced = null;
    this.isSorted = null;
    this.reserved = null;
    this.localColorTableSize = null;
    this.localColorTable = null;
    this.LZWMinimumCodeSide = null;
    this.imageData = [];
  }

  /**
   * ImageDescriptorのデータ長を返します。
   */
  length() {
    return 1 // this.imageSeparator
      + 2 // this.left
      + 2 // this.top
      + 2 // this.width
      + 2 // this.height
      + 1 // this.packedFields
      + (this.hasLocalColorTable ? this.localColorTable.byteLength : 0)
      + 1 // this.LZWMinimumCodeSide
      + this.imageData.reduce(function(output, item) {
        return output 
          + 1 // BlockSize分
          + item.blockSize
          ;
        }, 0)
      + 1 // Terminator
      ;
  }
}

class GraphicControlExtension {
  constructor() {
    this.extensionIntroducer = EXTENSION_INTRODUCER;
    this.graphicControlLabel = GRAPHIC_CONTROL_LABEL;
    this.blockSize = 0x04;
    this.packedFields = null;
    this.reserved = null;
    this.disposalMethod = null;
    this.userInputFlag = null;
    this.transparentColorFlag = null;
    this.delayTime = null;
    this.transparentColorIndex = null;
  }

  /**
   * GraphicControlExtensionのデータ長（固定）を返します。
   */
  length() {
    return 1 // this.extensionIntroducer
      + 1 // this.extensionLabel
      + 1 // this.blockSize
      + 1 // this.packedFields
      + 2 // this.delayTime
      + 1 // this.transparentColorIndex
      + 1 // Terminator
      ;
  }
}

class ApplicationExtension {
  constructor() {
    this.extensionIntroducer = EXTENSION_INTRODUCER;
    this.extensionLabel = APPLICATION_EXTENSION_LABEL;
    this.blockSize = 0x0b;
    this.applicationIdentifier = null;
    this.applicationAuthenticationCode = null;
    this.applicationData = [];
  }

  /**
   * ApplicationExtensionのデータ長を返します。
   */
  length() {
    return 1 // this.extensionIntroducer
      + 1 // this.extensionLabel
      + 1 // this.blockSize
      + 8 // this.applicationIdentifier
      + 3 // this.applicationAuthenticationCode
      + this.applicationData.reduce(function(output, item) {
        return output 
          + 1 // BlockSize分
          + item.blockSize
          ;
        }, 0)
      + 1 // Terminator
      ;
  }
}

class Body {
  constructor() {
    this.applicationExtension = null;
    this.frames = []; // graphicControl, imageDescriptor, offset
  }

  read(buffer) {
    return new Promise( (resolve, reject) => {
      const sr = new StreamReader(buffer);
      
      let frame, offset = 0;
      for ( let block = this.readBlock(sr)
        ; block != null
        ; block = this.readBlock(sr) ) {

        if (block instanceof ApplicationExtension) {
          this.applicationExtension = block;

        } else if ( block instanceof GraphicControlExtension ) {
          
          frame = { 
            graphicControl : block
            , imageDescriptor : null
            , offset : offset
          };
          offset += block.delayTime;

        } else {
          frame.imageDescriptor = block;
          this.frames.push(frame);
          frame = null;
        }
      }

      resolve(offset);  
    });
  }

  readBlock(sr) {
    const start = sr.index;
    const initialByte = sr.readByte();
    if ( initialByte == IMAGE_SEPARATOR) {
      /* Image Descriptor */
      log('Image Descriptor');
      const block = new ImageDescriptor();

      block.left = sr.readByte() + (sr.readByte() << 8);
      block.top = sr.readByte() + (sr.readByte() << 8);
      block.width = sr.readByte() + (sr.readByte() << 8);
      block.height = sr.readByte() + (sr.readByte() << 8);

      block.hasLocalColorTable = sr.peekBitAt(1)
      block.isInterlaced = sr.peekBitAt(2);
      block.isSorted = sr.peekBitAt(3);

      block.packedFields = sr.readByte();
      block.localColorTableSize = block.packedFields & parseInt('0111', 2);

      if ( block.hasLocalColorTable ) {
        // Local Color Tableが存在する
        block.localColorTable = sr.readBytes(3 * Math.pow(2, imageBlock.localColorTableSize + 1));
      } else {
        // Local Color Tableが存在しない
      }

      block.LZWMinimumCodeSide = sr.readByte();

      for (let blockSize = sr.readByte()
        ; blockSize != BLOCK_TERMINATOR
        ; blockSize = sr.readByte()) 
      {
        // imageDataに格納する用にする
        block.imageData.push({
          blockSize : blockSize
          , imageData : sr.readBytes(blockSize)
        });
      }
      return block;

    } else if ( initialByte == EXTENSION_INTRODUCER ) {
      const extensionLabel = sr.readByte();
      if ( extensionLabel == GRAPHIC_CONTROL_LABEL ) {
        /* Graphic Control Extension */
        log('Graphic Control Extension');

        const block = new GraphicControlExtension();
        sr.skip(1); // Block Sizeは決まっているので飛ばす

        block.packedFields = sr.readByte();
        // block.userInputFlag = !!(tmp & parseInt('00000010', 2));
        // block.transparentColorFlag = !!(tmp & parseInt('00000001', 2));

        block.delayTime = sr.readByte() + (sr.readByte() << 8);
        block.transparentColorIndex = sr.readByte();

        sr.readByte(); // BLOCK_TERMINATOR
        return block;

      } else if ( extensionLabel == 0xfe ) {
        /* Comment Extension */
        log('Comment Extension');
        return null;

      } else if ( extensionLabel == 0x01 ) {
        /* Plain Text Extension */
        log('Plain Text Extension');
        return null;

      } else if ( extensionLabel == APPLICATION_EXTENSION_LABEL ) {
        /* Application Extension */
        log('Application Extension');
        const block = new ApplicationExtension();
        
        sr.skip(1); // Block Sizeは決まっているので飛ばす 

        block.applicationIdentifier = sr.readAscii(8);
        block.applicationAuthenticationCode = sr.readAscii(3);

        for (let blockSize = sr.readByte()
          ; blockSize != BLOCK_TERMINATOR
          ; blockSize = sr.readByte()) {
          // applicationDataに格納する用にする
          block.applicationData.push({ 
            blockSize : blockSize
            , applicationData : sr.readBytes(blockSize)
          });
        }

        return block;

      } else {
        log('Unknown Extension');
        return null;
      }

    } else if ( initialByte == TRAILER ) {
      log('Trailer');
      return null;

    } else {
      log('Unknown Block', initialByte);
      return null;
    }
  }

  length(start=0, end=this.frames.length) {
    let length = (this.applicationExtension ? this.applicationExtension.length() : 0);
    
    for (let i=start; i<end; i++ ) {
      const f = this.frames[i];
      length += f.graphicControl.length();
      length += f.imageDescriptor.length();
    }

    return length + 1; // Trailer分
  }

  frame2ArrayBuffer(frame) {
    const length = frame.graphicControl.length()
      + frame.imageDescriptor.length()
      + 1 // Trailer分
      ;

    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    let offset = 0;

    /* Graphic Control Extension, Image Descriptor */
    const c = frame.graphicControl
      , d = frame.imageDescriptor
      ;
    // Graphic Control Extension
    view.setUint8(offset++, c.extensionIntroducer);
    view.setUint8(offset++, c.graphicControlLabel);
    view.setUint8(offset++, c.blockSize);
    view.setUint8(offset++, c.packedFields);
    
    const t = this.getLittleEndian(c.delayTime);
    view.setUint8(offset++, t[0]);
    view.setUint8(offset++, t[1]);

    view.setUint8(offset++, c.transparentColorIndex);
    view.setUint8(offset++, BLOCK_TERMINATOR);

    // Image Descriptor
    view.setUint8(offset++, d.imageSeparator);

    const l = this.getLittleEndian(d.left);
    view.setUint8(offset++, l[0]);
    view.setUint8(offset++, l[1]);
    const to = this.getLittleEndian(d.top);
    view.setUint8(offset++, to[0]);
    view.setUint8(offset++, to[1]);
    const w = this.getLittleEndian(d.width);
    view.setUint8(offset++, w[0]);
    view.setUint8(offset++, w[1]);
    const h = this.getLittleEndian(d.height);
    view.setUint8(offset++, h[0]);
    view.setUint8(offset++, h[1]);

    view.setUint8(offset++, d.packedFields);

    if ( d.hasLocalColorTable ) {
      for ( let i=0, l=d.localColorTable.byteLength; i<l; i++, offset++ ) {
        view.setUint8(offset, d.localColorTable[i]);
      }
    }

    view.setUint8(offset++, d.LZWMinimumCodeSide);

    d.imageData.forEach( da => {
      view.setUint8(offset++, da.blockSize);
      for ( let i=0, l=da.blockSize; i<l; i++, offset++ ) {
        view.setUint8(offset, da.imageData[i]);
      }
    });

    view.setUint8(offset++, BLOCK_TERMINATOR);
  
    // Trailer
    view.setUint8(offset++, TRAILER);

    return buffer;
  }

  /**
   * 値からArrayBufferを作って返します。startとendに引数を渡すことで、特定のフレーム部分を切り抜くことができます。
   */
  toArrayBuffer(start=0, end=this.frames.length) {
    log(`start: ${start}, end: ${end}`);
    const _length = this.length(start, end);
    const buffer = new ArrayBuffer(_length);
    const view = new DataView(buffer);
    let offset = 0;

    /* Application Extension */
    // GIFアニメにしないために加えないようにしている
    if ( false && this.applicationExtension ) {
      let a = this.applicationExtension;
      view.setUint8(offset++, a.extensionIntroducer);
      view.setUint8(offset++, a.extensionLabel);
      view.setUint8(offset++, a.blockSize);

      for ( let i=0, l=a.applicationIdentifier.length; i<l; i++, offset++ ) {
        view.setUint8(offset, a.applicationIdentifier.charCodeAt(i));
      }

      for ( let i=0, l=a.applicationAuthenticationCode.length; i<l; i++, offset++ ) {
        view.setUint8(offset, a.applicationAuthenticationCode.charCodeAt(i));
      }

      a.applicationData.forEach( d => {
        view.setUint8(offset++, d.blockSize);
        for ( let i=0, l=d.blockSize; i<l; i++, offset++ ) {
          view.setUint8(offset, d.applicationData[i]);
        }
      });

      view.setUint8(offset++, BLOCK_TERMINATOR);
    }

    /* Graphic Control Extension, Image Descriptor */
    for (let i=start; i<end; i++ ) {
      const f = this.frames[i]
        , c = f.graphicControl
        , d = f.imageDescriptor
        ;
      // Graphic Control Extension
      view.setUint8(offset++, c.extensionIntroducer);
      view.setUint8(offset++, c.graphicControlLabel);
      view.setUint8(offset++, c.blockSize);
      view.setUint8(offset++, c.packedFields);
      
      const t = this.getLittleEndian(c.delayTime);
      view.setUint8(offset++, t[0]);
      view.setUint8(offset++, t[1]);

      view.setUint8(offset++, c.transparentColorIndex);
      view.setUint8(offset++, BLOCK_TERMINATOR);

      // Image Descriptor
      view.setUint8(offset++, d.imageSeparator);

      const l = this.getLittleEndian(d.left);
      view.setUint8(offset++, l[0]);
      view.setUint8(offset++, l[1]);
      const to = this.getLittleEndian(d.top);
      view.setUint8(offset++, to[0]);
      view.setUint8(offset++, to[1]);
      const w = this.getLittleEndian(d.width);
      view.setUint8(offset++, w[0]);
      view.setUint8(offset++, w[1]);
      const h = this.getLittleEndian(d.height);
      view.setUint8(offset++, h[0]);
      view.setUint8(offset++, h[1]);

      view.setUint8(offset++, d.packedFields);

      if ( d.hasLocalColorTable ) {
        for ( let i=0, l=d.localColorTable.byteLength; i<l; i++, offset++ ) {
          view.setUint8(offset, d.localColorTable[i]);
        }
      }

      view.setUint8(offset++, d.LZWMinimumCodeSide);

      d.imageData.forEach( da => {
        view.setUint8(offset++, da.blockSize);
        for ( let i=0, l=da.blockSize; i<l; i++, offset++ ) {
          view.setUint8(offset, da.imageData[i]);
        }
      });

      view.setUint8(offset++, BLOCK_TERMINATOR);
    }

    // Trailer
    view.setUint8(offset++, TRAILER);

    log(`Body: ${_length}, ${offset}`);

    return buffer;
  }

  getLittleEndian(twoBytesStr) {
    const high = (twoBytesStr & 0xff00) >> 8;
    const low = twoBytesStr & 0x00ff;
    return [low, high];
  }
};



