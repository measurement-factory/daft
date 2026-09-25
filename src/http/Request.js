/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages an HTTP request message, including headers and body */

import assert from "assert";
import Config from "../misc/Config.js";
import Message from "./Message.js";
import RequestLine from "./RequestLine.js";
import Uri from "../anyp/Uri.js";

Config.Recognize([
    {
        option: "request-prefix-size-minimum",
        type: "Number",
        default: "0",
        description: "minimum size of request start line and headers (bytes)",
    },
]);

export default class Request extends Message {

    constructor(...args) {
        super(new RequestLine(), ...args);

        this.enforceMinimumPrefixSize(Config.requestPrefixSizeMinimum());
    }

    target(uri) {
        assert(uri instanceof Uri);
        this.startLine.uri = uri.clone();
    }

    for(resource) {
        this.relatedResource(resource, "For");
        this.target(resource.uri);
    }

    with(resource) {
        this.relatedResource(resource, "With");
        // XXX: Reduce (poor) duplication with Response::from(resource)
        if (resource.body) {
            this.addBody(resource.body);
        } else if (resource.body === null) {
            assert.strictEqual(this.body, undefined); // no accidental overwrites
            this.body = null;
        }
    }

    conditions(ifs) {
        if ('ims' in ifs)
            this.header.add("If-Modified-Since", ifs.ims.toUTCString());
    }

    prefix(messageWriter) {
        return messageWriter.requestPrefix(this);
    }
}
