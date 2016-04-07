/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Base class for HTTP request or response message, including headers and body */

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
        if (!args.length)
            return this.header.value(fieldName);
        Must(args.length === 1);
        Must(!this.header.has(fieldName)); // or is that unnecessary too strict?
        this.header.add(fieldName, args[0]);
    }

    finalize() {
        this.startLine.finalize();

        let idFieldName = this._daftFieldName("ID");
        if (!this.header.has(idFieldName))
            this.header.add(idFieldName, Gadgets.UniqueId("mid"));
        this.header.finalize();

        if (this.headerDelimiter === null)
            this.headerDelimiter = "\r\n";

        if (this.body)
            this.body.finalize();

        this.syncContentLength();
    }

    addBody(body) {
        Must(!this.body); // not a reset; we do not remove old Content-Length
        this.body = body;
        this.syncContentLength();
    }

    syncContentLength() {
        if (this.body !== null && this.body.length() !== null && !this.header.has("Content-Length"))
            this.header.add("Content-Length", this.body.length());
    }

    relatedResource(resource, relationship) {
        this.header.add(this._daftFieldName(relationship + "-Resource"), resource.id);
    }

    _daftFieldName(suffix) {
        let kind = Object.getPrototypeOf(this).constructor.name;
        return `X-Daft-${kind}-${suffix}`;
    }
}
