/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages raw (dechunked) HTTP message body buffer/pipeline. */

import { Must } from "../misc/Gadgets";
import * as Config from "../misc/Config";

export default class Body {

    constructor(content) {
        this._buf = null; // the entire body (for now)
        this._length = null; // unknown until setLength()
        this._in = 0;
        this._out = 0;

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
            this.whole(Config.DefaultMessageBodyContent);
    }

    whole(...args) {
        if (!args.length)
            return this._buf === null ? "" : this._buf;

        Must(args.length === 1);
        Must(this._in === 0); // do not overwrite to minimize confusion
        this.in(args[0]);
        this.setLength(this._buf.length);
    }

    // TODO: expose .length instead of providing setter and getter?
    length() {
        return this._length; // may be null
    }

    setLength(size) {
        this._length = size;
    }

    innedSize() {
        return this._in;
    }

    innedAll() {
        return this._length !== null && this._in >= this._length;
    }

    in(data) {
        if (this._buf === null)
            this._buf = data;
        else
            this._buf += data;
        this._in += data.length;
    }

    //hasOut() {
    //    return this._length === null ||
    //        this._out < this._length;
    //}

    outedSize() {
        return this._out;
    }

    outedAll() {
        return this._length !== null && this._out >= this._length;
    }

    out() {
        if (this.outedAll())
            return "";

        let piece;
        if (this._length !== null)
            piece = this.whole().substring(this._out, this._length);
        else
            piece = this.whole().substring(this._out);

        this._out += piece.length;

        return piece;
    }
}
