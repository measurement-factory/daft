/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import SideTransaction from "../side/Transaction";
import { forcesEof } from "../http/one/MessageWriter";
import RequestParser from "../http/one/RequestParser";
import Response from "../http/Response";
import Body from "../http/Body";
import { LocalAddress } from "../misc/Gadgets";
import assert from "assert";

// receives a request and sends the corresponding response
export default class Transaction extends SideTransaction {

    constructor() {
        super(...arguments);

        this.ownerKind = "server";
        this.peerKind = "client";
        this.messageOutKind = "response"; // TODO: new MessageGenerator()?
        this.messageInKind = "request";

        this.messageParser = new RequestParser(this);
        this.messageParser.logPrefix = ">s ";

        this.logPrefixForSending = "<s ";
    }

    get request() {
        return this.messageIn;
    }

    get response() {
        return this.messageOut;
    }

    endSending(why) {
        if (forcesEof(this.messageIn, this.messageOut) && this.socket) {
            console.log("[half-]closing the connection to mark the end of response");
            this.socket.end(); // half-close; we might still be reading
        }
        super.endSending(why);
    }

    generateDefaultMessage() {
        return new Response();
    }

    finalizeMessage() {
        if (!this.request)
            return; // no response without request by default

        assert(this.response);
        // XXX: do not add body to HEAD responses
        // XXX: add other bodyless status codes
        if (!this.response.body && this.response.startLine.statusCode !== 304)
            this.response.addBody(new Body());

        this.response.header.addByDefault("Server", "DaftServer/1.0");
        this.response.header.addByDefault("Connection", "close");
        this.response.header.addByDefault("Date", new Date().toUTCString());
        this.response.generatorAddress(LocalAddress(this.socket));
        this.response.finalize();

        this._finalizedMessage = true; // TODO: Move to Message::finalize()?
    }
}
