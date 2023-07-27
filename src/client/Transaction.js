/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import SideTransaction from "../side/Transaction";
import ResponseParser from "../http/one/ResponseParser";
import Request from "../http/Request";
import assert from "assert";

// sends a request and receives the corresponding response
export default class Transaction extends SideTransaction {

    constructor() {
        super(...arguments);
        this.messageOut = new Request();

        this.ownerKind = "client";
        this.peerKind = "server";
        this.messageOutKind = "request"; // TODO: new MessageGenerator()?
        this.messageInKind = "response";

        this.messageParser = new ResponseParser(this);
        this.messageParser.logPrefix = "c< ";

        this.logPrefixForSending = "c> ";
    }

    get request() {
        return this.messageOut;
    }

    get response() {
        return this.messageIn;
    }

    generateDefaultMessage() {
        return new Request();
    }

    finalizeMessage() {
        assert(this.request);

        this.request.header.addByDefault("User-Agent", "DaftClient/1.0");
        this.request.header.addByDefault("Connection", "close");

        this.request.startLine.finalize();

        // no request body by default, except for POST
        // TODO: Recognize more methods that usually have body
        const method = this.request.startLine.method;
        this.request.finalize(method === 'POST');

        // A finalized start line should have uri.authority set.
        // Callers should use that for request target, even if uri.relative.
        this.request.header.addByDefault("Host", this.request.startLine.uri.authority.raw());

        this.request.finalize();

        this.messageParser.request(this.request);

        this._finalizedMessage = true; // TODO: Move to Message::finalize()?
    }
}
