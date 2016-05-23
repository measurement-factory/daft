/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Removes chunked coding from incoming data. */

import Decoder from "./Decoder";

export default class ChunkedDecoder extends Decoder {

    constructor() {
        super("chunked");

        this._leftChunkBytes = null;
        this._chunkBytes = null;
        this._decodedData = null;
        this._step = this._decodeSize;
    }

    decodedAll() {
        return this._step === null;
    }

    _decode() {
        this._decodedData = "";

        while (this._raw.length > 0 && !this.decodedAll()) {
            if (!this._step())
                break;
        }

        if (this.decodedAll()) {
            if (/^./.test(this._raw))
                console.log("Warning: Got trailers");
            // TODO: process trailers(if any)
        }

        return this._decodedData;
    }

    _decodeSize() {
        let sizeRe = /^([0-9a-fA-F]+)(.*\r*\n)/;
        let match = sizeRe.exec(this._raw);
        if (match) {
            this._chunkBytes = parseInt(match[1], 16);
            this._leftChunkBytes = this._chunkBytes;
            this._raw = this._raw.substring(match[0].length);
            this._step = this._leftChunkBytes === 0 ? this._decodeDelimiter : this._decodeData;
            return true;
        }
        return false;
    }

    _decodeData() {
        let len = Math.min(this._leftChunkBytes, this._raw.length);
        this._leftChunkBytes -= len;
        let content = this._raw.substring(0, len);
        this._raw = this._raw.substring(len);
        if (this._leftChunkBytes === 0)
            this._step = this._decodeDelimiter;
        this._decodedData += content;
        return true;
    }

    _decodeDelimiter() {
        let delimiterRe = /^\r*\n/;
        let match = delimiterRe.exec(this._raw);
        if (match) {
            this._raw = this._raw.substring(match[0].length);
            this._step = this._chunkBytes === 0 ? null : this._decodeSize;
            return true;
        }
        return false;
    }

}
