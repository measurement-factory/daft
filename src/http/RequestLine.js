/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages HTTP request-line. */

import Uri from "../anyp/Uri";

export default class RequestLine {

    constructor() {
        this.method = null;
        this.methodDelimiter = null;
        this.uri = new Uri();
        this.uriDelimiter = null;
        this._rest = null;
        this.terminator = null;
    }

    clone() {
        let dupe = new RequestLine();
        dupe.method = this.method;
        dupe.methodDelimiter = this.methodDelimiter;
        dupe.uri = this.uri.clone();
        dupe.uriDelimiter = this.uriDelimiter;
        dupe._rest = this._rest;
        dupe.terminator = this.terminator;
        return dupe;
    }

    finalize() {
        if (this.method === null)
            this.method = "GET";
        if (this.methodDelimiter === null)
            this.methodDelimiter = " ";
        this.uri.finalize();
        if (this.uriDelimiter === null)
            this.uriDelimiter = " ";
        if (this._rest === null)
            this._rest = "HTTP/1.1";
        if (this.terminator === null)
            this.terminator = "\r\n";
    }
}
