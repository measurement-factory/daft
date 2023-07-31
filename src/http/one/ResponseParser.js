/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import Body from "../Body";
import IdentityDecoder from "./IdentityDecoder";
import MessageParser from "./MessageParser";
import Response from "../Response";
import StatusLine from "../StatusLine";

import assert from "assert";

export default class ResponseParser extends MessageParser {

    constructor(transaction, aRequest = null) {
        super(transaction);
        this._messageType = Response;
        this._messageKind = "response";

        this._request = null;
        if (aRequest)
            this.request(aRequest);

        // whether we should ignore HTTP protocol framing signals and simply
        // expect that body bytes start after the headers and end at EOF
        this._assumeBodyPresentAndEndsAtEof = false;
    }

    request(aRequest) {
        assert(aRequest);
        assert(!this._request);
        this._request = aRequest;
    }

    // handy for hacks like receiving data after 101 (Switching Protocols)
    assumeBodyPresentAndEndsAtEof(reason) {
        assert(reason);
        assert.strictEqual(this._assumeBodyPresentAndEndsAtEof, false);
        this._assumeBodyPresentAndEndsAtEof = true;
        this._log("will assume response body is present and ends at EOF despite protocol requirements:", reason);
    }

    // MessageParser API
    determineBodyLength() {
        assert(!this.message.body);
        assert(!this._bodyDecoder);

        if (this._assumeBodyPresentAndEndsAtEof) {
            this._log("assuming response body is present and ends at EOF");
            this.message.body = new Body();
            this._bodyDecoder = new IdentityDecoder(null);
            return;
        }

        if (this._request && this._request.startLine.method === "HEAD") {
            // see RFC 9112 Section 6.3 rule #1
            this._log("no response body in HEAD responses");
            this.message.body = null;
            return;
        }

        if (this.message.startLine.codeBansBody()) {
            // see RFC 9112 Section 6.3 rule #1
            this._log("no response body due to status code");
            this.message.body = null;
            return;
        }

        super.determineBodyLength();
    }

    // MessageParser API
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
}
