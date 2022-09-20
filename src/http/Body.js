/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages raw (dechunked) HTTP message body buffer/pipeline. */

import { Must, RandomText } from "../misc/Gadgets";
import * as Config from "../misc/Config";

export default class Body {

    constructor(content) {
        this._buf = null; // the entire body (for now)
        this._in = 0;
        this._out = 0;

        this.innedAll = false; // whether to expect more in() calls

        if (content !== undefined)
            this.whole(content);
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
