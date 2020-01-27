/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Pass-through "null" or "identity" decoder. Does not modify incoming data. */

import Decoder from "./Decoder";
import { Must } from "../../misc/Gadgets";

export default class IdentityDecoder extends Decoder {

    constructor(len) {
        super("identity");
        this._leftBytes = len;
    }

    decodedAll() {
        return this._leftBytes === 0;
    }

    _decode() {
        let len = null;
        if (this._leftBytes === null) {
            len = this._raw.length;
        } else {
            len = Math.min(this._leftBytes, this._raw.length);
            this._leftBytes -= len;
        }
        const decodedData = this._raw.substring(0, len);
        this._raw = this._raw.substring(len);
        return decodedData;
    }

    _reportCompletion() {
    }

}
