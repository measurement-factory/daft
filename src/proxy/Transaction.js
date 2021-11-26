/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Transaction is a single (user agent request, origin response) tuple. */

import net from "net";
import RequestParser from "../http/one/RequestParser";
import ResponseParser from "../http/one/ResponseParser";
import { requestPrefix, responsePrefix, bodyEncoder } from "../http/one/MessageWriter";
import Context from "../misc/Context";
import * as Config from "../misc/Config";
import { Must, SendBytes, ReceivedBytes, PrettyMime, PrettyBody } from "../misc/Gadgets";
import assert from "assert";

export default class Transaction { // XXX: extends SideTransaction

    constructor(agent) {
        assert.strictEqual(arguments.length, 1);
        let myType = Object.getPrototypeOf(this).constructor.name;
        console.log(`starting ${myType} transaction`);

        assert(agent);
        this._agent = agent;

        this.context = new Context("xact");

        this._started = false;

        this.userSocket = null;
        this.originSocket = null;

        this.requestParser = null;
        this.responseParser = null;

        this.virginRequest = null;
        this.adaptedRequest = null;

        this.virginResponse = null;
        this.adaptedResponse = null;

        this.ignoreUserData = null;
        this.ignoreOriginData = null;

        this.responseHeadersSent = null;

        // a promise to (do as much as possible and) end
        this._finished = new Promise((resolve) => {
            this._finishedResolver = resolve;
        });

        this._userBodyEncoder = null;
        this._originBodyEncoder = null;
    }

    destructor() {
        let myType = Object.getPrototypeOf(this).constructor.name;
        console.log(`ending ${myType} transaction`);
        this._finishedResolver(this);
    }

    started() {
        return this._started;
    }

    async run(userSocket) {
        assert.strictEqual(arguments.length, 1);

        assert(!this._started);
        this._started = true;

        assert(userSocket);
        assert(!this.userSocket);
        this.userSocket = userSocket;

        this.startServingUser(this.userSocket);
        this.sendRequest();
        // for the case when test plot wants to simulate an "early" response
        this.sendResponse();

        await this._finished;
    }

    startServingUser() {
        /* setup event listeners for the user agent socket */

        this.userSocket.on('data', data => {
            this.onUserReceive(data);
        });

        this.userSocket.on('end', () => {
            console.log("user disconnected");
            this.userSocket = null;
            if (!this.originSocket)
                this.destructor();
        });

        this.userSocket.on('drain', () => {
            if (!this.userSocket.writeable && this.ignoreUserData !== null)
                this.destroyUserSocket();
        });

    }

    startConnectingToOrigin() {
        const destination = Config.isReverseProxy() ?
            Config.OriginAuthority :
            this.requestParser.message.startLine.uri.address;
        this.originSocket = net.connect(destination);

        /* setup event listeners for the origin socket */

        this.originSocket.on('connection', () => {
            this.originSocket.setEncoding('binary');
            let addr = `${this.originSocket.remoteAddress}:${this.originSocket.remotePort}`;
            console.log(`connected to ${addr}`);
        });

        this.originSocket.on('data', data => {
            this.onOriginReceive(data);
        });

        this.originSocket.on('end', () => {
            console.log("origin disconnected");
            this.originSocket = null;
            if (!this.userSocket)
                this.destructor();
        });
    }

    onUserReceive(virginData) {
        ReceivedBytes(this.userSocket, virginData, "request", "c> ");
        if (this.ignoreUserData !== null) {
            console.log(`ignoring ${virginData.length} received request bytes; reason: ${this.ignoreUserData}`);
            return;
        }

        try {
            this.parseRequest(virginData);
        } catch (error) {
            console.log("request parsing error:", error.message);
            this.ignoreUserData = "request parsing error";
            SendBytes(this.userSocket, this.generateErrorResponse(400), "error response");
            this.userSocket.end();
            return;
        }

        this.sendRequest();
    }

    parseRequest(virginData) {
        if (!this.requestParser) {
            this.requestParser = new RequestParser(this);
            this.requestParser.logPrefix = "c> ";
        }

        this.requestParser.parse(virginData);

        if (!this.requestParser.message)
            return; // have not found the end of headers yet

        if (!this.virginRequest)
            this.virginRequest = this.requestParser.message;
    }

    sendRequest() {
        this.adaptRequest();

        if (!this.adaptedRequest) {
            console.log("not ready to send the request");
            return;
        }

        let out = "";
        const logPrefix = ">s ";

        if (!this.originSocket) {
            this.adaptedRequest.finalize();
            this.startConnectingToOrigin();

            const hdrOut = requestPrefix(this.adaptedRequest);
            out += hdrOut;
            // when finished connecting
            console.log(`will send request header` + PrettyMime(logPrefix, hdrOut));
        }

        if (this.adaptedRequest.body) {
            if (!this._originBodyEncoder)
                this._originBodyEncoder = bodyEncoder(this.adaptedRequest);
            const bodyOut = this._originBodyEncoder.encodeBody(this.adaptedRequest.body);
            out += bodyOut;

            const madeAllNow = this.adaptedRequest.body.outedAll() &&
                bodyOut.length === this._originBodyEncoder.outputSize();
            const bodyDescription = madeAllNow ? "the entire" : "a piece of the";
            console.log(`will send ${bodyDescription} request body` + PrettyBody(logPrefix, bodyOut));
        }

        if (out.length)
            SendBytes(this.originSocket, out, "request");
    }

    adaptRequest() {
        if (!this.adaptedRequest) {
            if (this.virginRequest)
                this.startAdaptingRequest();
            else
                this.generateRequest();
        }

        if (this.adaptedRequest && this.adaptedRequest.body)
            this.adaptRequestBody();
    }

    generateRequest() {
        Must(!this.virginRequest);
        return; // no adapted request w/o virginRequest by default
    }

    cloneRequest() {
        this.adaptedRequest = this.virginRequest.clone();
        // this.virginRequest may contain a body, and we just cloned it
        // consume virgin body here so that adaptRequestBody() does not get a
        // second copy of it
        if (this.virginRequest.body)
            this.virginRequest.body.out();
    }

    // to customize adaptations, use adaptRequestHeader() if possible
    startAdaptingRequest() {
        this.cloneRequest();
        this.adaptedRequest.startLine.uri.relative = true;
        this.adaptRequestHeader();
    }

    adaptRequestHeader() {
        this.adaptedRequest.header.add("Via", Config.ProxySignature);
    }

    adaptRequestBody() {
        this.adaptedRequest.body.in(this.virginRequest.body.out());
    }

    onOriginReceive(virginData) {
        ReceivedBytes(this.originSocket, virginData, "response", "<s ");
        if (this.ignoreOriginData !== null) {
            console.log(`ignoring ${virginData.length} received response bytes; reason: ${this.ignoreOriginData}`);
            return;
        }

        try {
            this.parseResponse(virginData);
        } catch (error) {
            // XXX: Keep in sync with request parsing code in onUserReceive()
            console.log("response parsing error:", error.message);
            this.ignoreOriginData = "response parsing error";
            // XXX: We might be writing or have written another adapted response already
            SendBytes(this.userSocket, this.generateErrorResponse(502), "error response");
            this.userSocket.end();
            return;
        }
        this.sendResponse();
    }

    parseResponse(virginData) {
        if (!this.responseParser) {
            this.responseParser = new ResponseParser(this, this.adaptedRequest);
            this.responseParser.logPrefix = "<s ";
        }

        this.responseParser.parse(virginData);

        if (!this.responseParser.message)
            return; // have not found the end of headers yet

        if (!this.virginResponse)
            this.virginResponse = this.responseParser.message;
    }

    sendResponse() {
        this.adaptResponse();

        if (!this.adaptedResponse) {
            console.log("not ready to send the response");
            return;
        }

        let out = "";
        const logPrefix = "c< ";

        if (!this.responseHeadersSent) {
            this.adaptedResponse.finalize();
            this.responseHeadersSent = true;
            const hdrOut = responsePrefix(this.adaptedResponse);
            out += hdrOut;
            console.log(`will send response header` + PrettyMime(logPrefix, hdrOut));
        }

        if (this.adaptedResponse.body) {
            if (!this._userBodyEncoder)
                this._userBodyEncoder = bodyEncoder(this.adaptedResponse);
            const bodyOut = this._userBodyEncoder.encodeBody(this.adaptedResponse.body);
            out += bodyOut;

            const madeAllNow = this.adaptedResponse.body.outedAll() &&
                bodyOut.length === this._userBodyEncoder.outputSize();
            const bodyDescription = madeAllNow ? "the entire" : "a piece of the";
            console.log(`will send ${bodyDescription} response body` + PrettyBody(logPrefix, bodyOut));
        }

        if (out.length)
            SendBytes(this.userSocket, out, "response");
    }

    adaptResponse() {
        if (!this.adaptedResponse) {
            if (this.virginResponse)
                this.startAdaptingResponse();
            else
                this.generateResponse();
        }

        if (this.adaptedResponse && this.adaptedResponse.body)
            this.adaptResponseBody();
    }

    generateResponse() {
        Must(!this.virginResponse);
        return;
    }

    cloneResponse() {
        this.adaptedResponse = this.virginResponse.clone();
        if (this.virginResponse.body)
            this.virginResponse.body.out();
    }

    startAdaptingResponse() {
        this.cloneResponse();
        this.adaptResponseHeader();
    }

    adaptResponseHeader() {
        this.adaptedResponse.header.add("Via", Config.ProxySignature);
    }

    adaptResponseBody() {
        this.adaptedResponse.body.in(this.virginResponse.body.out());
    }

    generateErrorResponse(code) {
        Must(Config.HttpStatusCodes[code]);
        const errMsg = [
            "HTTP/1.1 " + code + " " + Config.HttpStatusCodes[code],
            "Server: " + Config.ProxySignature,
            "Connection: close",
            "\r\n"
        ].join("\r\n");
        console.log(`will send error response` + PrettyMime("c< ", errMsg));
        return errMsg;
    }

    destroyUserSocket() {
        if (this.userSocket) {
            this.userSocket.destroy();
            this.userSocket = null;
        }
        if (!this.originSocket)
            this.destructor();
    }

}
