/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Anything addressable by a fragmentless URI. */

import Uri from "../anyp/Uri";
import Body from "../http/Body";
import Header from "../http/Header";
import * as Gadgets from "../misc/Gadgets";
import * as FuzzyTime from "../misc/FuzzyTime";
import { Must } from "../misc/Gadgets";

export default class Resource {
    constructor(description) {
        this.description = description;
        this.uri = new Uri();
        this.id = Gadgets.UniqueId("rid");
        this.lastModificationTime = null;
        this.nextModificationTime = null;
        this.mime = new Header();

        // set (e.g., to null) to disable body generation in finalize()
        this.body = undefined;
    }

    // do our best to persuade most caches to store this resource
    makeCachable() {
        this.modifiedAt(FuzzyTime.DistantPast());
        this.expireAt(FuzzyTime.DistantFuture());
        this.mime.add("Cache-Control", "public");
    }

    finalize() {
        this.uri.finalize();
        this.mime.finalize();
        if (this.body === undefined)
            this.body = new Body();
        if (this.body)
            this.body.finalize();
    }

    modifiedAt(when) {
        Must(when !== undefined);
        this.lastModificationTime = when; // may be null
        return this;
    }

    modifyNow() {
        return this.modifiedAt(FuzzyTime.Now());
    }

    expireAt(when) {
        Must(when !== undefined);
        this.nextModificationTime = when; // may be null
        return this;
    }

    expireAfter(delta) {
        return this.expireAt(Gadgets.DateSum(this.lastModificationTime, delta));
    }

    // return an IMS date suitable for triggering a 304 response
    notModifiedSince(delta = new Date(0)) {
        return Gadgets.DateSum(this.lastModificationTime, delta);
    }

    // return an IMS date suitable for triggering a 200 response
    modifiedSince(delta = new Date(24*60*60*1000) /* one day */) {
        return Gadgets.DateDiff(this.lastModificationTime, delta);
    }
}
