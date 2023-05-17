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
        this.protocol = null;
        this.terminator = null;
    }

    clone() {
        let dupe = new RequestLine();
        dupe.method = this.method;
        dupe.methodDelimiter = this.methodDelimiter;
        dupe.uri = this.uri.clone();
        dupe.uriDelimiter = this.uriDelimiter;
        dupe.protocol = this.protocol;
        dupe.terminator = this.terminator;
        return dupe;
    }

    finalize() {
        if (this.method === null)
            this.method = "GET";
        if (this.methodDelimiter === null)
            this.methodDelimiter = " ";

        if (this.method === "CONNECT" && !this.uri.finalizedForm())
            this.uri.forceAuthorityForm();
        this.uri.finalize();

        if (this.uriDelimiter === null)
            this.uriDelimiter = " ";

        if (this.protocol === null)
            this.protocol = "HTTP/1.1";

        if (this.terminator === null)
            this.terminator = "\r\n";
    }
}
