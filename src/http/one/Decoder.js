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

        this._reachedCompletion = false; // called _reportCompletion()
    }

    decodedAll() {
        Must(false, `pure virtual: kids must override`);
    }

    outputSize() {
        return this._outSize;
    }

    decode(data) {
        Must(!this._reachedCompletion);

        this._inSize += data.length;
        this._raw += data;
        const decoded = this._decode();
        this._outSize += decoded.length;

        if (this.decodedAll()) {
            this._reachedCompletion = true;
            this._reportCompletion();
        }

        return decoded;
    }

    remainder() {
        return this._raw;
    }

    _decode() {
        Must(false, `pure virtual: kids must override`);
    }

    _reportCompletion() {
        console.log(`decoded all ${this._inSize} ${this.codingName}-encoded bytes`);
        console.log(`produced ${this._outSize} decoded bytes`);
    }

}
