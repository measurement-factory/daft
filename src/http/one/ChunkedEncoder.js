/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Wraps incoming data into chunked coding, one chunk per encode() call. */

import Encoder from "./Encoder";
import { Must } from "../../misc/Gadgets";

export default class ChunkedEncoder extends Encoder {
    constructor() {
        super("chunked");
    }

    encode(data) {
        Must(!this._finished);
        if (!data.length)
            return "";
        return super.encode(data);
    }

    finish(data) {
        // to ignore empty final data, we need to call our encode() but
        // to count last-chunk and trailer bytes, we need to call super.encode()
        const final =
            this.encode(data) + // last piece of data, if any
            super.encode(""); // last-chunk followed by [empty] trailer
        super.finish("");
        return final;
    }

    _encode(data) {
        return data.length.toString(16) + "\r\n" +
            data + "\r\n";
    }
}
