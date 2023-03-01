/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Content- or transfer-encoding logic common to all encoders. */

import { Must } from "../../misc/Gadgets";

export default class Encoder {
    constructor(codingName) {
        Must(codingName !== undefined);

        this._finished = false;
        this.codingName = codingName; // encoding algorithm ID

        this._inSize = 0; // number of raw bytes we were asked to encode
        this._outSize = 0; // number of encoded bytes we gave back to the caller
    }

    // no more encode() calls are expected; no more encoded output will be
    // produced, even if the already produced encoded output is incomplete
    finished() {
        return this._finished;
    }

    // Returns new encoded bytes.
    // Stops (i.e. calls finish()) automatically.
    encodeBody(body) {
        const data = body.out();
        return body.outedAll() ? this.finish(data) : this.encode(data);
    }

    // Returns new encoded bytes. To stop encoding, call finish() instead.
    encode(data) {
        Must(!this._finished);
        this._inSize += data.length;
        const encoded = this._encode(data);
        this._outSize += encoded.length;
        return encoded;
    }

    // Stops encoding. May return output bytes even if input data is empty.
    finish(data) {
        const encodedData = this.encode(data) + this._encodeTrailer();
        this._finished = true;
        this._reportCompletion();
        return encodedData;
    }

    outputSize() {
        return this._outSize;
    }

    _encode(data) {
        Must(false, `pure virtual: kids must override to encode ${data}`);
    }

    // produces post-date/termination sequence (or an empty string if none)
    _encodeTrailer() {
        Must(false, 'pure virtual: kids must override');
    }

    _reportCompletion() {
        console.log(`${this.codingName}-encoded all ${this._inSize} bytes`);
        console.log(`produced ${this._outSize} ${this.codingName}-encoded bytes`);
    }
}
