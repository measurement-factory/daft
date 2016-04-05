/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import { requestPrefix, responsePrefix } from "../http1/MessageWriter";
import ResponseParser from "../http1/ResponseParser";
import Request from "../http/Request";
import { Must, PrettyMime, SendBytes } from "../misc/Gadgets";

// Transaction is a single (user agent request, peer response) tuple.
export default class Transaction {

    constructor(userSocket, request) {
        this.socket = userSocket;

        this.request = request ? request.clone() : null;
        this.responseParser = null;
        this.response = null;

        // everything in this.request except body content
        // that content is expected iff request.body is not nil
        this.finalizedRequest = false;

        this.doneReceiving = false; // incoming message
        this.doneSending = false; // outgoing message
        this.doneCallback = null; // set by the initiator if needed
    }

    start() {
        let myType = Object.getPrototypeOf(this).constructor.name;
        console.log(`starting ${myType} transaction`);

        /* setup event listeners */

        this.socket.on('data', data => {
            this.onReceive(data);
        });

        this.socket.on('end', () => {
            console.log("peer disconnected");
            // assume all 'data' events always arrive before 'end'
            this.doneReceiving = true;
            this.checkpoint();
        });

        this.sendRequest();
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
        this.parseResponse(virginData);
        this.sendRequest();
    }

    parseResponse(virginData) {
        if (!this.responseParser)
            this.responseParser = new ResponseParser(this, this.request);

        this.responseParser.parse(virginData);

        if (!this.response && this.responseParser.message) {
            this.response = this.responseParser.message;
            let parsed = responsePrefix(this.response);
            console.log(`parsed ${parsed.length} response header bytes:\n` +
                PrettyMime("c< ", parsed));
        }

        if (!this.response)
            return;

        if (this.response.body) {
            if (this.response.body.innedAll()) {
                console.log(`parsed all ${this.response.body.innedSize()} response body bytes`);
                this.doneReceiving = true;
                this.checkpoint();
            } else {
                console.log(`parsed first ${this.response.body.innedSize()} response body bytes so far`);
            }
        } else {
            console.log("parsed the entire bodyless response");
            this.doneReceiving = true;
            this.checkpoint();
        }
    }

    sendRequest() {
        if (this.doneSending)
            return;

        let hadRequest = this.finalizedRequest;
        if (!hadRequest)
            this.makeRequest();

        if (!this.finalizedRequest) {
            console.log("not ready to request something");
            Must(!this.doneSending);
            return;
        }

        Must(this.request);

        if (!hadRequest) {
            // send request headers once we got them
            SendBytes(this.socket, requestPrefix(this.request), "request header", "c> ");

            if (!this.request.body) {
                console.log("sent a bodyless request");
                this.doneSending = true;
                this.checkpoint();
                return;
            }
        }

        Must(this.request.body);
        let chunk = this.request.body.out();
        if (chunk.length)
            SendBytes(this.socket, chunk, "request body");

        if (this.request.body.outedAll()) {
            console.log("sent the entire request body");
            this.doneSending = true;
            this.checkpoint();
            return;
        }
        console.log("may send more request body later");
    }

    makeRequest() {
        if (!this.request)
            this.request = this.generateDefaultRequest();

        if (!this.finalizedRequest)
            this.finalizeRequest();

        if (this.request.body && !this.request.body.innedAll())
            this.fillRequestBody();
    }

    generateDefaultRequest() {
        let request = new Request();
        return request; // not finalized!
    }

    finalizeRequest() {
        Must(this.request);
        // XXX: Do not overwrite already set properties
        this.request.finalize();
        this.request.header.add("User-Agent", "DaftClient/1.0");
        this.request.header.add("Connection", "close");
        // no request body by default

        this.finalizedRequest = true;
    }

    fillRequestBody() {
        // generateDefaultRequest() fills the entire body, if any
        Must(false);
    }

}
