/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Wraps incoming data into chunked coding, one chunk per encode() call. */

import Encoder from "./Encoder";
import * as Config from "../../misc/Config";
import assert from "assert";

Config.Recognize([
    {
        option: "chunk-size",
        type: "Number",
        default: "0",
        description: "when sending a chunked message, limit payload bytes per chunk; " +
            "0 sends all available data in one chunk"
    },
]);

export default class ChunkedEncoder extends Encoder {
    constructor(message) {
        assert.strictEqual(arguments.length, 1);

        super("chunked");

        assert(Config.ChunkSize >= 0);
        assert(message.chunkingBody());
        this._withholdLastChunk = message.withholdingLastChunk();
    }

    // empty data results in last-chunk
    static EncodeOneChunk(data) {
        return data.length.toString(16) + "\r\n" +
            data + "\r\n";
    }

    _encode(data) {
        if (!data.length)
            return ""; // last-chunk is handled by _encodeTrailer()

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

    // super API
    _encodeTrailer() {
        if (this._withholdLastChunk)
            return "";
        // last-chunk followed by [empty] trailer
        return ChunkedEncoder.EncodeOneChunk("");
    }
}
