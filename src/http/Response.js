/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages an HTTP response message, including headers and body */

import assert from "assert";
import Body from "./Body";
import Message from "./Message";
import StatusLine from "./StatusLine";
import { Must } from "../misc/Gadgets";
import * as Config from "../misc/Config";

Config.Recognize([
    {
        option: "response-ends-at-eof",
        type: "Boolean",
        default: "false",
        description: "send unchunked response without Content-Length",
    },
]);

export default class Response extends Message {

    constructor(...args) {
        super(new StatusLine(), ...args);

        // force the sender to close the connection to mark the end of response
        this.forceEof = null; // use Config.responseEndAtEof by default

        this.rangeBlocks = null; // array of parsed range body blocks
    }

    // makes us an exact replica of them
    reset(them) {
        super.reset(them);
        this.forceEof = them.forceEof;
        return this;
    }

    from(resource) {
        this.relatedResource(resource, "From");

        if (resource.lastModificationTime)
            this.header.add("Last-Modified", resource.lastModificationTime.toUTCString());
        if (resource.nextModificationTime)
            this.header.add("Expires", resource.nextModificationTime.toUTCString());

        resource.mime.fields.forEach(field => this.header.add(field));

        if (resource.body) {
            // XXX: We cannot support dynamic resource.body updates because
            // server transactions copy resource info at serve(resource) time,
            // each using this.body to keep track of the outedSize() progress.
            assert(resource.body.innedAll);
            assert.strictEqual(resource.body.outedSize(), 0);
            this.addBody(resource.body.clone());
        } else if (resource.body === null) {
            assert.strictEqual(this.body, undefined); // no accidental overwrites
            this.body = null;
        }
    }

    finalizeBody() {
        super.finalizeBody();
        if (this.hasRanges()) {
            Must(this.ranges.length > 0);
            // TODO: Modify body via Body::applyRanges() instead of overwriting it?
            this.body = new Body(this._applyRanges(this.body.whole(), this.ranges));
        }
    }

    hasRanges() {
        if (this.header.has('Content-Range'))
            return true;
        if (this.header.has('Content-Type')) {
            const value = this.header.value('Content-Type');
            return value.includes('multipart/byteranges');
        }
        return false;
    }

    _applyRanges(content, ranges) {
        if (!ranges)
            return content; // the entire payload, no ranges

        if (ranges.length === 1) { // a single range
            const range = ranges[0];
            const low = range[0];
            const high = range[1];
            return content.substring(low, high+1);
        }

        // payload in "multipart/byteranges" format (RFC7233)

        Must(ranges.length > 1);

        const terminator = "\r\n";
        const length = content.length;
        let part = "";
        for (let range of ranges) {
            const low = range[0];
            const high = range[1];
            Must(low !== null && low !== undefined); // TODO: support 'half-closed' ranges
            Must(high !== null && high !== undefined);
            part += terminator + "--" + Config.ContentRangeBoundary;
            part += terminator + 'Content-Type: text/html';
            part += terminator + `Content-Range: bytes ${low}-${high}/${length}`;
            part += terminator;
            const block = content.substring(low, high+1);
            part += terminator + block;
        }
        part += terminator + "--" + Config.ContentRangeBoundary + "--" + terminator;
        return part;
    }

    // Creates response header field from an array of range pairs.
    // For a single range - 'Content-Range' is created.
    // For multiple ranges - 'Content-Type' is created with 'multipart/byteranges' value.
    addRanges(ranges, length) {
        Must(ranges);
        Must(length);
        Must(ranges.length);
        this.ranges = ranges;
        if (ranges.length === 1) {
            Must(!this.header.has('Content-Range'));
            const range = ranges[0];
            const value = `bytes ${range[0]}-${range[1]}/${length}`;
            this.header.add('Content-Range', value);
        } else {
            Must(!this.header.has('Content-Type'));
            const value = 'multipart/byteranges; boundary=' + Config.ContentRangeBoundary;
            this.header.add('Content-Type', value);
        }
    }

    syncContentLength() {
        const forceEof = this.forceEof === null ? Config.responseEndsAtEof() : this.forceEof;
        if (forceEof) {
            Must(this.body);
            Must(!this.chunkingBody());
            this.header.prohibitNamed("Content-Length");
            this.header.prohibitNamed("Transfer-Encoding"); // XXX: "chunked"
        } else {
            super.syncContentLength();
        }
    }

    prefix(messageWriter) {
        return messageWriter.responsePrefix(this);
    }

    // The "corresponding Daft request" ID, as stored in response headers (or null).
    // Daft server transactions store the received Daft request ID when generating responses.
    requestId(request) {
        const idFieldName = request._daftFieldName("ID");
        if (this.header.has(idFieldName))
            return this.header.value(idFieldName);
        return null;
    }

    // Copy the Daft request ID field (if any) from the given request.
    // The requestId() method can be used to extract the copied ID.
    rememberIdOf(request) {
        const idFieldName = request._daftFieldName("ID");
        assert(!this.header.has(idFieldName)); // ban overwriting to simplify triage
        if (request.header.has(idFieldName))
            this.header.add(idFieldName, request.header.value(idFieldName));
    }
}
