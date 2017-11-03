/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import { responsePrefix, bodyEncoder, forcesEof } from "../http/one/MessageWriter";
import RequestParser from "../http/one/RequestParser";
import Response from "../http/Response";
import Body from "../http/Body";
import { Must, SendBytes, ReceivedBytes, LocalAddress } from "../misc/Gadgets";

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
        this._bodyEncoder = null;
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
        ReceivedBytes(this.socket, virginData, "request", ">s ");
        this.parseRequest(virginData);
        this.sendResponse();
    }

    parseRequest(virginData) {
        if (!this.requestParser) {
            this.requestParser = new RequestParser(this);
            this.requestParser.logPrefix = ">s ";
        }

        this.requestParser.parse(virginData);

        if (!this.requestParser.message)
            return; // have not found the end of headers yet

        if (!this.request)
            this.request = this.requestParser.message;

        if (!this.request.body || this.request.body.innedAll) {
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
                this.endSending("sent a bodyless response");
                return;
            }
        }

        Must(this.response.body);
        if (!this._bodyEncoder)
            this._bodyEncoder = bodyEncoder(this.response);
        const out = this._bodyEncoder.encodeBody(this.response.body);
        if (out.length)
            SendBytes(this.socket, out, "response body", "<s ");

        if (this.response.body.outedAll()) {
            const bytesDescription = this._bodyEncoder.describeBytes("response body");
            this.endSending(`sent all ${bytesDescription}`);
            return;
        }
        console.log("may send more response body later");
    }

    endSending(why) {
        console.log(why);
        this.doneSending = true;

        if (forcesEof(this.request, this.response) && this.socket) {
            console.log("[half-]closing the connection to mark the end of response");
            this.socket.end(); // half-close; we might still be reading
        }

        this.checkpoint();
    }

    makeResponse() {
        if (!this.response)
            this.response = this.generateDefaultResponse();

        if (!this._finalizedResponse)
            this.finalizeResponse();

        if (this.response.body && !this.response.body.innedAll)
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

        this.response.header.addByDefault("Server", "DaftServer/1.0");
        this.response.header.addByDefault("Connection", "close");
        this.response.header.addByDefault("Date", new Date().toUTCString());
        this.response.generatorAddress(LocalAddress(this.socket));
        this.response.finalize();

        this._finalizedResponse = true;
    }

    fillResponseBody() {
        // generateDefaultResponse() fills the entire body
        Must(false);
    }

}
