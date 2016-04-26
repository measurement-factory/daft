/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import { responsePrefix } from "../http/two/MessagePacker";
import ConnectionParser from "../http/two/ConnectionParser";
import { responsePrefix } from "../http/one/MessageWriter";
import Response from "../http/Response";
import Body from "../http/Body";
import { Must, SendBytes } from "../misc/Gadgets";

// Transaction is a single (user agent request, origin response) tuple.
export default class Transaction {

    constructor(userSocket, response) {
        let myType = Object.getPrototypeOf(this).constructor.name;
        console.log(`starting ${myType} transaction`);

        this.socket = userSocket;

        this.requestParser = null;
        this.request = null;
        this.response = response ? response.clone() : null;

        this.doneReceiving = false; // incoming message
        this.doneSending = false; // outgoing message
        this.doneCallback = null; // set by the initiator if needed
        this._finalizedResponse = false;
    }

    start() {
        /* setup event listeners */

        this.socket.on('data', data => {
            this.onReceive(data);
        });

        this.socket.on('end', () => {
            console.log("user disconnected");
            // assume all 'data' events always arrive before 'end'
            this.doneReceiving = true;
            this.checkpoint();
        });

        this.sendResponse();
    }

    finish() {
        let myType = Object.getPrototypeOf(this).constructor.name;
        console.log(`ending ${myType} transaction`);

        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }

        if (this.doneCallback)
            this.doneCallback(this);
    }

    checkpoint() {
        if (this.doneReceiving && this.doneSending && // HTTP level
            (!this.socket || !this.socket.bufferSize)) // socket level
            this.finish();
    }

    onReceive(virginData) {
        this.parseRequest(virginData);
        this.sendResponse();
    }

    parseRequest(virginData) {
        if (!this.requestParser)
            this.requestParser = new ConnectionParser(this);

        // if (!this.requestParser) {
        //     this.requestParser = new RequestParser(this);
        //     this.requestParser.logPrefix = ">s ";
        // }

        this.requestParser.parse(virginData);

        if (!this.requestParser.message)
            return; // have not found the end of headers yet

        if (!this.request)
            this.request = this.requestParser.message;

        if (!this.request.body || this.request.body.innedAll()) {
            this.doneReceiving = true;
            this.checkpoint();
        }
    }

    sendResponse() {
        if (this.doneSending)
            return;

        let hadResponse = this._finalizedResponse;
        if (!hadResponse)
            this.makeResponse();

        if (!this._finalizedResponse) {
            console.log("not ready to respond");
            Must(!this.doneSending);
            return;
        }

        Must(this.response);

        if (!hadResponse) {
            // send response headers once we got them
            SendBytes(this.socket, responsePrefix(this.response), "response header", "<s ");

            if (!this.response.body) {
                console.log("sent a bodyless response");
                this.doneSending = true;
                this.checkpoint();
                return;
            }
        }

        Must(this.response.body);
        let chunk = this.response.body.out();
        if (chunk.length)
            SendBytes(this.socket, chunk, "response body", "<s ");

        if (this.response.body.outedAll()) {
            console.log(`sent all ${this.response.body.outedSize()} response body bytes`);
            this.doneSending = true;
            // if body length is unknown to the recipient, mark its end with EOF
            if (this.response.body.length() === null && this.socket)
                this.socket.end(); // half-close; we might still be reading
            this.checkpoint();
            return;
        }
        console.log("may send more response body later");
    }

    makeResponse() {
        if (!this.response)
            this.response = this.generateDefaultResponse();

        if (!this._finalizedResponse)
            this.finalizeResponse();

        if (this.response.body && !this.response.body.innedAll())
            this.fillResponseBody();
    }

    generateDefaultResponse() {
        return new Response(); // not finalized; see finalizeResponse()
    }

    finalizeResponse() {
        if (!this.request)
            return; // no response without request by default

        Must(this.response);
        // XXX: do not add body to HEAD responses
        // XXX: add other bodyless status codes
        if (!this.response.body && this.response.startLine.statusCode !== 304)
            this.response.addBody(new Body());

        // XXX: Do not overwrite already set properties
        this.response.finalize();
        this.response.header.add("Server", "DaftServer/1.0");
        this.response.header.add("Connection", "close");
        this.response.header.add("Date", new Date().toUTCString());


        this._finalizedResponse = true;
    }

    fillResponseBody() {
        // generateDefaultResponse() fills the entire body
        Must(false);
    }

}
