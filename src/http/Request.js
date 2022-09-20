/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages an HTTP request message, including headers and body */

import { Must } from "../misc/Gadgets";
import Message from "./Message";
import RequestLine from "./RequestLine";
import * as Config from "../misc/Config";

export default class Request extends Message {

    constructor(...args) {
        super(new RequestLine(), ...args);
    }

    for(resource) {
        this.relatedResource(resource, "For");
        this.startLine.uri = resource.uri.clone();
    }

    with(resource) {
        this.relatedResource(resource, "With");
        if (resource.body)
            this.addBody(resource.body);
    }

    conditions(ifs) {
        if ('ims' in ifs)
            this.header.add("If-Modified-Since", ifs.ims.toUTCString());
    }

    prefix(messageWriter) {
        return messageWriter.requestPrefix(this);
    }

    // creates request 'Range' header field from an array of range pairs
    addRanges(ranges) {
        Must(ranges);
        Must(ranges.length);
        Must(!this.header.has('Range'));
        const value = 'bytes=' + ranges.map(v => `${v[0]}-${v[1]}`).join(', ');
        this.header.add("Range", value);
        this.ranges = ranges;
    }

    // returns an array of range pairs, extracted from the 'Range' header value
    parseRangeHeader() {
        const name = 'Range';
        if (!this.header.has(name))
            return [];

        const value = this.header.value(name);
        const pairs = value.substring(value.indexOf('=') + 1).split(',');
        return pairs.map(v => v.split('-')).map(v => [Number.parseInt(v[0]), Number.parseInt(v[1])]);
    }

}
