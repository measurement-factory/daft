/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Base class for HTTP request or response message, including headers and body */

import Authority from "../anyp/Authority";
import Header from "./Header";
import { Must } from "../misc/Gadgets";
import * as Gadgets from "../misc/Gadgets";

export default class Message {

    constructor(startLine, ...args) {
        Must(startLine);
        Must(!args.length);

        this.startLine = startLine;

        this.header = new Header();
        this.headerDelimiter = null;

        this.body = null; // no body by default
        this.forceChunked = false; // force chunked Transfer-Encoding
    }

    // creates and returns an exact replica of this message
    clone() {
        let dupe = new this.constructor();
        dupe.reset(this);
        return dupe;
    }

    // makes us an exact replica of them
    reset(them) {
        this.startLine = them.startLine.clone();
        this.header = them.header.clone();
        this.headerDelimiter = them.headerDelimiter;
        this.body = them.body ? them.body.clone() : null;
        this.forceChunked = them.forceChunked;
        return this;
    }

    // unique ID of a _finalized_ message
    id(...args) {
        Must(!args.length); // cannot set message ID
        return this.header.value(this._daftFieldName("ID"));
    }

    // an optional human-friendly message label
    tag(...args) {
        let fieldName = this._daftFieldName('Tag');
        if (args.length) {
            Must(args.length === 1);
            Must(!this.header.has(fieldName)); // or is that unnecessary too strict?
            this.header.add(fieldName, args[0]);
        }
        return this.header.value(fieldName);
    }

    // IP address of the agent that generated the message
    generatorAddress(...args) {
        let fieldName = this._daftFieldName('Generator-Address');
        if (args.length) {
            Must(args.length === 1);
            Must(!this.header.has(fieldName)); // or is that unnecessary too strict?
            this.header.add(fieldName, Gadgets.PrettyAddress(args[0]));
        }
        const rawValue = this.header.value(fieldName);
        return Authority.Parse(rawValue).toHostPort();
    }

    finalize() {
        this.startLine.finalize();

        let idFieldName = this._daftFieldName("ID");
        if (!this.header.has(idFieldName))
            this.header.add(idFieldName, Gadgets.UniqueId("mid"));

        if (this.headerDelimiter === null)
            this.headerDelimiter = "\r\n";

        if (this.body)
            this.body.finalize();

        this.syncContentLength();

        this.header.finalize(); // after syncContentLength() adds headers
    }

    addBody(body) {
        Must(!this.body); // not a reset; we do not remove old Content-Length
        this.body = body;
    }

    syncContentLength() {
        if (this.forceChunked) {
            Must(this.body);
            if (!this.header.chunked())
                this.header.add("Transfer-Encoding", "chunked");
            this.header.prohibitNamed("Content-Length");
        }

        if (this.body === null)
            return;

        if (this.header.chunked() || this.header.has("Content-Length"))
            return;

        if (this.body.innedAll)
            this.header.add("Content-Length", this.body.innedSize());
        else
            this.header.add("Transfer-Encoding", "chunked");
    }

    relatedResource(resource, relationship) {
        this.header.add(this._daftFieldName(relationship + "-Resource"), resource.id);
    }

    _daftFieldName(suffix) {
        let kind = Object.getPrototypeOf(this).constructor.name;
        return `X-Daft-${kind}-${suffix}`;
    }
}
