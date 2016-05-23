/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Content- or transfer-decoding logic common to all decoders. */

import { Must } from "../../misc/Gadgets";

export default class Decoder {
    constructor(codingName) {
        Must(codingName !== undefined);

        this.codingName = codingName; // encoding algorithm ID

        this._inSize = 0; // number of raw bytes we were asked to decode
        this._outSize = 0; // number of decoded bytes we gave back to the caller

        this._raw = ""; // unparsed (encoded) content
    }

    decodedAll() {
        Must(false, `pure virtual: kids must override`);
    }

    decode(data) {
        Must(!this.decodedAll());

        this._inSize += data.length;
        this._raw += data;
        const decoded = this._decode();
        this._outSize += decoded.length;
        return decoded;
    }

    remainder() {
        return this._raw;
    }

    // describes decoded bytes
    describeBytes(messagePart) {
        return `${this._inSize} ${messagePart} bytes (${this._outSize} bytes after ${this.codingName} decoding)`;
    }

    _decode() {
        Must(false, `pure virtual: kids must override`);
    }
}
