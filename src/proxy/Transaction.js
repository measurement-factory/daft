/* Transaction is a single (user agent request, origin response) tuple. */

import net from "net";
import RequestParser from "../http//RequestParser";
import ResponseParser from "../http//ResponseParser";
import * as Config from "../misc/Config";
import { Must, PrettyMime } from "../misc/Gadgets";

export default class Transaction {

    constructor(userSocket) {
        let myType = Object.getPrototypeOf(this).constructor.name;
        console.log(`starting ${myType} transaction`);

        this.userSocket = userSocket;
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
    }

    destructor() {
        let myType = Object.getPrototypeOf(this).constructor.name;
        console.log(`ending ${myType} transaction`);
    }

    start() {
        this.startServingUser(this.userSocket);
        this.sendRequest();
        // for the case when test plot wants to simulate an "early" response
        this.sendResponse();
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

    originAddress() {
        return Config.isReverseProxy() ? Config.OriginAddress : this.forwardingAddress();
    }

    forwardingAddress() {
        return {
            host: this.requestParser.message.startLine.uri.host,
            port: this.requestParser.message.startLine.uri.port
        };
    }

    startConnectingToOrigin() {
        this.originSocket = net.connect(this.originAddress());

        /* setup event listeners for the origin socket */

        this.originSocket.on('connection', () => {
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
        if (this.ignoreUserData !== null) {
            console.log(`ignoring ${virginData.length} received request bytes; reason: ${this.ignoreUserData}`);
            return;
        }

        try
        {
            this.parseRequest(virginData);
        }
        catch (error)
        {
            console.log("request parsing error:", error.message);
            this.ignoreUserData = "request parsing error";
            this.userSocket.write(this.generateErrorResponse(400));
            this.userSocket.end();
            return;
        }

        this.sendRequest();
    }

    parseRequest(virginData) {
        if (!this.requestParser)
            this.requestParser = new RequestParser(this);

        this.requestParser.parse(virginData);

        if (!this.virginRequest && this.requestParser.message) {
            this.virginRequest = this.requestParser.message;
            let parsed = this.virginRequest.rawPrefix();
            console.log(`parsed ${parsed.length} request header bytes:\n` +
                PrettyMime("c> ", parsed));
        }
    }

    sendRequest() {
        this.adaptRequest();

        if (!this.adaptedRequest) {
            console.log("not ready to send the request");
            return;
        }

        if (!this.originSocket) {
            this.startConnectingToOrigin();

            // when finished connecting
            let out = this.adaptedRequest.rawPrefix();
            this.originSocket.write(out);
            console.log(`sending ${out.length} request header bytes:\n` +
                PrettyMime(">s ", out));
        }

        if (this.adaptedRequest.body) {
            // now or when finished connecting
            let out = this.adaptedRequest.body.out();
            this.originSocket.write(out);
            console.log(`sending ${out.length} request body bytes`);
        }
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
        this.adaptedRequest.startLine.uri.makeRelative();
        this.adaptRequestHeader();
    }

    adaptRequestHeader() {
        this.adaptedRequest.header.add("Via", Config.ProxySignature);
    }

    adaptRequestBody() {
        this.adaptedRequest.body.in(this.virginRequest.body.out());
    }

    onOriginReceive(virginData) {
        if (this.ignoreOriginData !== null) {
            console.log(`ignoring ${virginData.length} received response bytes; reason: ${this.ignoreOriginData}`);
            return;
        }

        try
        {
            this.parseResponse(virginData);
        }
        catch (error)
        {
            // XXX: Keep in sync with request parsing code in onUserReceive()
            console.log("response parsing error:", error.message);
            this.ignoreOriginData = "response parsing error";
            // XXX: We might be writing or have written another adapted response already
            this.userSocket.write(this.generateErrorResponse(502));
            this.userSocket.end();
            return;
        }
        this.sendResponse();
    }

    parseResponse(virginData) {
        if (!this.responseParser)
            this.responseParser = new ResponseParser(this, this.adaptedRequest);

        this.responseParser.parse(virginData);

        if (!this.virginResponse && this.responseParser.message) {
            this.virginResponse = this.responseParser.message;
            let parsed = this.virginResponse.rawPrefix();
            console.log(`parsed ${parsed.length} response header bytes:\n` +
                PrettyMime("<s ", parsed));
        }
    }

    sendResponse() {
        this.adaptResponse();

        if (!this.adaptedResponse) {
            console.log("not ready to send the response");
            return;
        }

        if(!this.responseHeadersSent) {
            this.responseHeadersSent = true;
            let out = this.adaptedResponse.rawPrefix();
            this.userSocket.write(out);
            console.log(`sending ${out.length} response header bytes:\n` +
                    PrettyMime("c< ", out));
        }

        if (this.adaptedResponse.body) {
            let out = this.adaptedResponse.body.out();
            this.userSocket.write(out);
            console.log(`sending ${out.length} response body bytes`);
        }
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
        return [
            "HTTP/1.1 " + code + " " + Config.HttpStatusCodes[code],
            "Server: " + Config.ProxySignature,
            "Connection: close",
            "\r\n"
        ].join("\r\n");
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
