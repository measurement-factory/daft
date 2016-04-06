/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Incrementally parses HTTP request messages, including headers and body */

import Uri from "../../anyp/Uri";
import RequestLine from "../RequestLine";
import Request from "../Request";
import MessageParser from "./MessageParser";

export default class RequestParser extends MessageParser {

    constructor(transaction) {
        super(transaction);
        this._messageType = Request;
    }

    determineDefaultBody() {
        // do nothing: requests do not have bodies by default
        console.log("no request body");
    }

    parseStartLine(requestLine, raw) {
        let reqRe = /^(\S+)(\s+)(.*\S)(\s+)(\S+)(\r*\n)$/;
        let match = reqRe.exec(raw);
        if (!match)
            throw new Error("Unable to parse request-line: " + raw);

        requestLine.method = match[1];
        requestLine.methodDelimiter = match[2];
        requestLine.uri = Uri.Parse(match[3]);
        requestLine.uriDelimiter = match[4];
        requestLine._rest = match[5];
        requestLine.terminator = match[6];
    }
}
