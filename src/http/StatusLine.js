/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages HTTP status-line. */

import { Must } from "../misc/Gadgets";
import * as Misc from "../misc/Gadgets";

export default class StatusLine {

    constructor() {
        this.protocol = null;
        this.protocolDelimiter = null;
        this.codeString_ = null;
        this.statusDelimiter = null;
        this.reasonPhrase = null;
        this.terminator = null;
    }

    clone() {
        let dupe = new StatusLine();
        dupe.protocol = this.protocol;
        dupe.protocolDelimiter = this.protocolDelimiter;
        dupe.codeString_ = this.codeString_;
        dupe.statusDelimiter = this.statusDelimiter;
        dupe.reasonPhrase = this.reasonPhrase;
        dupe.terminator = this.terminator;
        return dupe;
    }

    finalize() {
        if (this.protocol === null)
            this.protocol = "HTTP/1.1";
        if (this.protocolDelimiter === null)
            this.protocolDelimiter = " ";
        if (!this.hasCode())
            this.code(200);
        if (this.statusDelimiter === null)
            this.statusDelimiter = " ";
        if (this.reasonPhrase === null)
            this.reasonPhrase = this.ReasonPhrase(this.codeInteger());
        if (this.terminator === null)
            this.terminator = "\r\n";
    }

    raw() {
        return [
            this.protocol,
            this.protocolDelimiter,
            (this.hasCode() ? this.codeString() : null),
            this.statusDelimiter,
            this.reasonPhrase,
            this.terminator
        ].filter(item => item !== null).join("");
    }

    ReasonPhrase(codeInteger = undefined) {
        switch (codeInteger) {
            case 101:
                return "Switching Protocols";
            case 200:
                return "OK";
            case 206:
                return "Partial Content";
            case 304:
                return "Not Modified";
            default: // including undefined
                return "Other";
        }
    }

    hasCode() {
        return this.codeString_ !== null;
    }

    // returns status code in its raw form (or undefined)
    codeString() {
        return this.hasCode() ? this.codeString_ : undefined;
    }

    // returns status code in an unsigned integer form (or undefined)
    codeInteger() {
        return Misc.ToUnsigned(this.codeString_);
    }

    // sets status code to a given integer or (presumably) string
    code(value) {
        Must(value !== undefined);
        this.codeString_ = (value === null) ? null : `${value}`;
    }

    code1xx() {
        const scode = this.codeInteger();
        return scode !== undefined && (100 <= scode && scode <= 199);
    }

    codeMatches(...codes) {
        const scode = this.codeInteger();
        return scode !== undefined && codes.includes(scode);
    }

    // reject string, infinity, NaN, approximate, and negative values
    static IsNumericCode(value) {
        return Number.isSafeInteger(value) && value >= 0;
    }

    /* protection against removed .statusCode field users */

    get statusCode() {
        throw new Error("stale caller; use code() instead");
    }

    set statusCode(value) {
        throw new Error(`stale caller; use code(${value}) instead`);
    }

}
