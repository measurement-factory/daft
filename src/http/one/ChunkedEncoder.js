/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Wraps incoming data into chunked coding, one chunk per encode() call. */

import Encoder from "./Encoder";
import * as Config from "../../misc/Config";
import { Must } from "../../misc/Gadgets";
import assert from "assert";

Config.Recognize([
    {
        option: "withhold-last-chunk",
        type: "Boolean",
        default: "false",
        description: "when sending a chunked message, do not send last-chunk",
    },
    {
        option: "chunk-size",
        type: "Number",
        default: "0",
        description: "when sending a chunked message, limit payload bytes per chunk; " +
            "0 sends all available data in one chunk"
    },
]);

export default class ChunkedEncoder extends Encoder {
    constructor() {
        super("chunked");
        assert(Config.ChunkSize >= 0);
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
        let result = this.encode(data); // the last piece of data, if any
        if (!Config.WithholdLastChunk)
            result += super.encode(""); // last-chunk followed by [empty] trailer
        super.finish("");
        return result;
    }

    // empty data results in last-chunk
    static EncodeOneChunk(data) {
        return data.length.toString(16) + "\r\n" +
            data + "\r\n";
    }

    _encode(data) {
        if (!data.length)
            return ChunkedEncoder.EncodeOneChunk(data); // last-chunk

        if (!Config.ChunkSize)
            return ChunkedEncoder.EncodeOneChunk(data); // all-in-one

        let buf = '';
        let pos = 0;
        // configured-size chunks go first
        while (pos + Config.ChunkSize <= data.length) {
            buf += ChunkedEncoder.EncodeOneChunk(data.substring(pos, pos + Config.ChunkSize));
            pos += Config.ChunkSize;
        }
        // any leftovers are sent in a smaller chunk
        if (pos < data.length)
            buf += ChunkedEncoder.EncodeOneChunk(data.substring(pos, data.length));
        return buf;
    }
}
