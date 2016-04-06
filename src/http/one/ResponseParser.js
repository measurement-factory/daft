/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import Response from "../Response";
import StatusLine from "../StatusLine";
import Body from "../Body";
import MessageParser from "./MessageParser";
import { Must } from "../../misc/Gadgets";

export default class ResponseParser extends MessageParser {

    constructor(transaction, request) {
        super(transaction);
        this._messageType = Response;

        Must(request !== undefined);
        this.request = request;
        this.expectBody = this.request.startLine.method !== "HEAD";
    }

    determineDefaultBody() {
        // responses have bodies by default
        this.message.body = new Body();
    }

    parseStartLine(statusLine, raw) {
        let match = /^(\S+)(\s+)(\d+)(\s+)(.*)(\r*\n)$/.exec(raw);
        if (!match)
            throw new Error("Unable to parse status-line: " + raw);

        statusLine.httpVersion = match[1];
        statusLine.versionDelimiter = match[2];
        statusLine.statusCode = match[3];
        statusLine.statusDelimiter = match[4];
        if (match[5] !== undefined)
            statusLine.reasonPhrase = match[5];
        statusLine.terminator = match[6];
    }
}
