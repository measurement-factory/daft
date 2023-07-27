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

        // When set, do not out() the very last byte. Until the body is
        // .innedAll, enabling this delays outing the current last byte as
        // well, to prevent the hypothetical situation where the body becomes
        // .innedAll after all the bytes have been out()ed already.
        this._withholdLastByte = false;

        // whether to send/receive this body where prohibited by the protocol
        this._forcePresence = false;

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

    // whether forcePresence() has been called
    forcedToBePresent() {
        return this._forcePresence;
    }

    // send/receive this body even in cases prohibited by the protocol
    forcePresence(reason) {
        Must(reason);
        this._forcePresence = true; // may already by true
        console.log("forcing body to be present despite protocol requirements: ", reason);
    }

    withholdLastByte(doIt) {
        Must(arguments.length === 1);
        this._withholdLastByte = doIt;
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
        Must(!this.innedAll);
        if (this._buf === null)
            this._buf = data;
        else
            this._buf += data;
        this._in += data.length;
    }

    outedSize() {
        return this._out;
    }

    // The entire body is known (i.e. was inned) and
    // out() has produced that entire body.
    // Implies doneOuting().
    outedAll() {
        return this.innedAll && this._out >= this._in;
    }

    // out() will not produce any more body bytes
    // cf. outedAll()
    doneOuting() {
        if (this.outedAll())
            return true;
        return this._withholdLastByte && this.innedAll && (this._out + 1) === this._in;
    }

    out() {
        if (this.doneOuting())
            return "";

        let piece = this.whole().substring(this._out);

        if (this._withholdLastByte && piece.length)
            piece = piece.substring(0, piece.length - 1);

        this._out += piece.length;
        return piece;
    }
}
