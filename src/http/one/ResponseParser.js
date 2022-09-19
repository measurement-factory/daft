/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import Response from "../Response";
import StatusLine from "../StatusLine";
import Body from "../Body";
import MessageParser from "./MessageParser";
import assert from "assert";
import MultiRangeParser from "./MultiRangeParser";

export default class ResponseParser extends MessageParser {

    constructor(transaction, aRequest = null) {
        super(transaction);
        this._messageType = Response;
        this._messageKind = "response";

        this._request = null;
        if (aRequest)
            this.request(aRequest);
    }

    request(aRequest) {
        assert(aRequest);
        assert(!this._request);
        this._request = aRequest;
        this.expectBody = this._request.startLine.method !== "HEAD";
    }

    determineDefaultBody() {
        // responses have bodies by default
        this.message.body = new Body();
        this._log("Warning: Unknown [a priori] message length");
    }

    parseStartLine(raw) {
        assert(this._request);

        let statusLine = new StatusLine();

        let match = /^(\S+)(\s+)(\S+)(\s+)(.*)(\r*\n)$/.exec(raw);
        if (!match)
            throw new Error("Unable to parse status-line: " + raw);

        statusLine.protocol = match[1];
        statusLine.protocolDelimiter = match[2];
        statusLine.code(match[3]);
        statusLine.statusDelimiter = match[4];
        if (match[5] !== undefined)
            statusLine.reasonPhrase = match[5];
        statusLine.terminator = match[6];

        return statusLine;
    }

    parseBody() {
        super.parseBody();
        if (this.message.body.innedAll) {
            if (this.message.header.hasResponseRanges())
                this.parseBodyRanges();
        }
    }

    parseBodyRanges() {
        const multiRangeBoundary = this.message.header.multiRangeBoundary();
        const whole = this.message.body.whole();
        if (multiRangeBoundary) {
            let multiRangeParser = new MultiRangeParser(multiRangeBoundary);
            if (!multiRangeParser.parse(whole)) {
                this._log(`Warning: Cannot parse multi-range body`);
                return;
            }
            this.message.body.rangeBlocks = multiRangeParser.blocks;
            this.message.body.ranges = multiRangeParser.ranges;
        } else {
            const parsedRange = MultiRangeParser.ParseContentRange(this.message.header);
            this.message.body.rangeBlocks = [whole];
            this.message.body.ranges = [[parsedRange.low, parsedRange.high]];
        }
    }
}

