/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages an HTTP response message, including headers and body */

import assert from "assert";
import Field from "./Field";
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
    {
        option: "response-prefix-size-minimum",
        type: "Number",
        default: "0",
        description: "minimum size of response status line and headers (bytes)",
    },
]);

export default class Response extends Message {

    constructor(...args) {
        super(new StatusLine(), ...args);

        // force the sender to close the connection to mark the end of response
        this.forceEof = null; // use Config.responseEndAtEof by default

        this.rangeBlocks = null; // array of parsed range body blocks

        this.enforceMinimumPrefixSize(Config.responsePrefixSizeMinimum());
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

    // TODO: Create a class to encapsulate these fields/logic.
    // { low, high, bytes(wholeBody), headerField }
    _finalizedRange(wholeBodyLength, range) {
        const rawLow = range[0];
        const rawHigh = range[1];

        assert(rawLow >= 0);
        assert(rawLow <= rawHigh);
        const low = rawLow;

        assert(rawHigh >= 0);
        const high = Math.min(rawHigh, wholeBodyLength-1);

        assert(low <= high);
        assert(high <= wholeBodyLength);

        // Report unsatisfiable ranges. They may be a test developer mistake.
        // TODO: Create a class to mark bad range specs known to test code!
        if (!(0 <= low && low <= high))
            console.log(`Warning: Generating an invalid or unsatisfiable range spec: ${rawLow}-${rawHigh}/${wholeBodyLength}`);

        // XXX: This field is not finalized despite our _finalizedRange() name.
        // We should not finalize because the caller might want to customize,
        // especially when the field is added to the primary response header.
        const field = new Field('Content-Range', `bytes ${low}-${high}/${wholeBodyLength}`);

        return {
            low: low,
            high: high,
            bytes: function (wholeBody) { return wholeBody.substring(low, high+1); },
            headerField: field,
        };
    }

    _applyRanges(wholeBody, ranges) {
        if (!ranges)
            return wholeBody; // the entire payload, no ranges

        if (ranges.length === 1) // a single range
            return this._finalizedRange(wholeBody.length, ranges[0]).bytes(wholeBody);

        // payload in "multipart/byteranges" format (RFC7233)

        Must(ranges.length > 1);

        const terminator = "\r\n";
        let part = "";
        for (let rangeSpec of ranges) {
            const range = this._finalizedRange(wholeBody.length, rangeSpec);
            range.headerField.finalize();

            part += terminator + "--" + Config.ContentRangeBoundary;
            part += terminator + 'Content-Type: text/html'; // XXX?
            part += terminator + range.headerField.raw();
            part += terminator + range.bytes(wholeBody);
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
            const range = this._finalizedRange(length, ranges[0]);
            this.header.add(range.headerField);
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
