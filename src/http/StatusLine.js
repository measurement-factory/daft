/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages HTTP status-line. */

export default class StatusLine {

    constructor() {
        this.httpVersion = null;
        this.versionDelimiter = null;
        this.statusCode = null;
        this.statusDelimiter = null;
        this.reasonPhrase = null;
        this.terminator = null;
    }
    clone() {
        let dupe = new StatusLine();
        dupe.httpVersion = this.httpVersion;
        dupe.versionDelimiter = this.versionDelimiter;
        dupe.statusCode = this.statusCode;
        dupe.statusDelimiter = this.statusDelimiter;
        dupe.reasonPhrase = this.reasonPhrase;
        dupe.terminator = this.terminator;
        return dupe;
    }

    finalize() {
        if (this.httpVersion === null)
            this.httpVersion = "HTTP/1.1";
        if (this.versionDelimiter === null)
            this.versionDelimiter = " ";
        if (this.statusCode === null)
            this.statusCode = "200";
        if (this.statusDelimiter === null)
            this.statusDelimiter = " ";
        if (this.reasonPhrase === null)
            this.reasonPhrase = this.ReasonPhrase(this.statusCode);
        if (this.terminator === null)
            this.terminator = "\r\n";
    }

    ReasonPhrase(statusCode) {
        switch (statusCode) {
            case 200:
                return "OK";
            case 304:
                return "Not Modified";
            default:
                return "Other";
        }
    }
}
