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

    encodeBody(body) {
        const data = body.out();
        return body.outedAll() ? this.finish(data) : this.encode(data);
    }

    // Returns encoded bytes. To stop encoding, call finish() instead.
    encode(data) {
        Must(!this._finished);
        this._inSize += data.length;
        const encoded = this._encode(data);
        this._outSize += encoded.length;
        return encoded;
    }

    // Stops encoding. May return encoded data even if data is empty.
    finish(data) {
        const encodedData = this.encode(data);
        this._finished = true;
        return encodedData;
    }

    // describes encoded bytes
    describeBytes(messagePart) {
        return `${this._outSize} ${messagePart} bytes (${this._inSize} bytes before ${this.codingName} encoding)`;
    }

    _encode(data) {
        Must(false, `pure virtual: kids must override to encode ${data}`);
    }
}
