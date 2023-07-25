/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages an HTTP response message, including headers and body */

import assert from "assert";

import * as Config from "../misc/Config";
import * as Range from "./Range";
import Body from "./Body";
import Field from "./Field";
import Message from "./Message";
import StatusLine from "./StatusLine";
import { Must } from "../misc/Gadgets";

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

    finalize(request) {
        assert(request);
        assert(request instanceof Message);

        this.header.addByDefault("Server", "DaftServer/1.0");
        this.header.addByDefault("Connection", "close");
        this.header.addByDefault("Date", new Date().toUTCString());
        this.rememberIdOf(request);

        // XXX: do not add body to HEAD responses
        const banBody = this.startLine.codeBansBody();
        if (this.body === undefined && banBody)
            this.body = null;

        const requestedRanges = Range.Specs.FromRangeHeaderIfPresent(request.header);
        if (requestedRanges) {
            if (!this.startLine.hasCode() || this.startLine.codeInteger() === 206) {
                this._finalizeToHonorRanges(requestedRanges);
                if (!this.startLine.hasCode())
                    this.startLine.code(206);
            }
        }

        super.finalize(!banBody);
    }

    finalizeBody() {
        super.finalizeBody();
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
        assert(range instanceof Range.Spec);
        const rawLow = range.low();
        const rawHigh = range.high();

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

    // finalizes header and body aspects related to the Range: request header
    // ranges is a [ [low,high], ...] array
    _finalizeToHonorRanges(ranges) {
        const wholeBody = this.body ? this.body.clone() : new Body();
        wholeBody.finalize();
        let wholeBodyLength = wholeBody.whole().length;
        let wholeBodyBytes = wholeBody.whole();
        if (this.body) {
            // If this.body was set, then we do not know whether it represents
            // the whole resource body we should extract parts from or the
            // partial content to be sent to the requestor as-is. For now, we
            // assume the former. TODO: Make this decision configurable.
            console.log(`Harvesting Range-requested parts from a pre-configured ${wholeBodyLength}-byte response body`);
            // and overwrite existing this.body below...
        }

        if (ranges.length === 1) {
            assert(!this.header.has('Content-Range'));
            const range = this._finalizedRange(wholeBodyLength, ranges[0]);
            this.header.add(range.headerField);
            if (this.body === null)
                return; // but we still added headers above
            this.body = new Body(range.bytes(wholeBodyBytes)); // TODO: Move into _finalizedRange()
            return;
        }

        /* "multipart/byteranges" body format (RFC 7233) */

        assert(ranges.length > 1);
        assert(!this.header.has('Content-Type'));
        const value = 'multipart/byteranges; boundary=' + Config.ContentRangeBoundary;
        this.header.add('Content-Type', value);
        if (this.body === null)
            return; // but we still added headers above

        let bodyContent = "";
        const terminator = "\r\n";
        for (let rangeSpec of ranges) {
            const range = this._finalizedRange(wholeBodyLength, rangeSpec);
            range.headerField.finalize();

            bodyContent += terminator + "--" + Config.ContentRangeBoundary;
            bodyContent += terminator + 'Content-Type: text/html'; // XXX?
            bodyContent += terminator + range.headerField.raw();
            bodyContent += terminator + range.bytes(wholeBodyBytes);
        }
        bodyContent += terminator + "--" + Config.ContentRangeBoundary + "--" + terminator;
        this.body = new Body(bodyContent);
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
