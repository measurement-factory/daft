/* Transaction is a single (user agent request, origin response) tuple. */

import net from "net";
import RequestParser from "../http//RequestParser";
import * as Config from "../Config";
import { Must, PrettyMime } from "../Gadgets";

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

        this.ignoreUserData = null;
    }

    destructor() {
        let myType = Object.getPrototypeOf(this).constructor.name;
        console.log(`ending ${myType} transaction`);
    }

    start() {
        this.startServingUser(this.userSocket);
        this.sendRequest();
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
            host: this.requestParser.message.requestLine.uri.host,
            port: this.requestParser.message.requestLine.uri.port
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
            this.userSocket.write(this.generateErrorResponse());
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
        this.adaptedRequest.requestLine.uri.makeRelative();
        this.adaptRequestHeader();
    }

    adaptRequestHeader() {
        this.adaptedRequest.header.add("Via", Config.ProxySignature);
    }

    adaptRequestBody() {
        this.adaptedRequest.body.in(this.virginRequest.body.out());
    }

    onOriginReceive(virginResponse) {
        let adaptedResponse = this.adaptResponse(virginResponse);
        this.userSocket.write(adaptedResponse);
        console.log(`sending ${adaptedResponse.length} response bytes`);
    }

    adaptResponse(virginResponse) {
        return virginResponse;
    }

    generateErrorResponse() {
        return [
            "HTTP/1.1 400 Bad Request",
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
