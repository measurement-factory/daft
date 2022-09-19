/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages raw (dechunked) HTTP message body buffer/pipeline. */

import { Must, RandomText } from "../misc/Gadgets";
import * as Config from "../misc/Config";

export default class Body {

    constructor(content, responseRanges) {
        this._buf = null; // the entire body (for now)
        this._in = 0;
        this._out = 0;

        this.innedAll = false; // whether to expect more in() calls

        this.rangeBlocks = null; // array of range data blocks

        this.responseRanges = null; // array of range pairs

        if (content !== undefined)
            this.whole(this._applyResponseRanges(content, responseRanges));
    }

    clone() {
        let dupe = new Body();
        // shallow copy of POD attributes
        for (var key in this) {
            dupe[key] = this[key];
        }
        return dupe;
    }

    finalize() {
        if (this._buf === null)
            this.whole(RandomText("body-", Config.BodySize));
    }

    _applyResponseRanges(content, responseRanges) {
        if (!responseRanges)
            return content; // the entire payload, no ranges

        this.responseRanges = responseRanges;

        if (this.responseRanges.length === 1) { // a single range
            const range = this.responseRanges[0];
            const low = range[0];
            const high = range[1];
            return content.substring(low, high+1);
        }

        // payload in "multipart/byteranges" format (RFC7233)

        Must(this.responseRanges.length > 1);

        const terminator = "\r\n";
        const length = content.length;
        let part = "";
        for (let range of this.responseRanges) {
            const low = range[0];
            const high = range[1];
            Must(low !== null && low !== undefined); // TODO: support 'half-closed' ranges
            Must(high !== null && high !== undefined);
            part += terminator + "--" + Config.ContentRangeBoundary;
            part += terminator + 'Content-Type: text/html';
            part += terminator + `Content-Range: bytes ${low}-${high}/${length}`;
            part += terminator;
            const block = content.substring(low, high+1);
            if (!this.rangeBlocks)
                this.rangeBlocks = [];
            this.rangeBlocks.push(block);
            part += terminator + block;
        }
        part += terminator + "--" + Config.ContentRangeBoundary + "--" + terminator;
        return part;
    }

    whole(...args) {
        if (!args.length)
            return this._buf === null ? "" : this._buf;

        Must(args.length === 1);
        Must(this._in === 0); // do not overwrite to minimize confusion
        this.in(args[0]);
        this.innedAll = true;
        Must(this._buf !== null);
        return this._buf;
    }

    innedSize() {
        return this._in;
    }

    in(data) {
        if (this._buf === null)
            this._buf = data;
        else
            this._buf += data;
        this._in += data.length;
    }

    outedSize() {
        return this._out;
    }

    outedAll() {
        return this.innedAll && this._out >= this._in;
    }

    out() {
        if (this.outedAll())
            return "";

        const piece = this.whole().substring(this._out);
        this._out += piece.length;
        return piece;
    }
}
