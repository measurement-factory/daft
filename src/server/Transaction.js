import RequestParser from "../http/RequestParser";
import Response from "../http/Response";
import Body from "../http/Body";
import * as Config from "../misc/Config";
import { Must, PrettyMime, SendBytes, UniqueId } from "../misc/Gadgets";

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

        if (this.response && this.response.callback)
            this.response.callback(this);
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
            this.requestParser = new RequestParser(this);

        this.requestParser.parse(virginData);

        if (!this.request && this.requestParser.message) {
            this.request = this.requestParser.message;
            let parsed = this.request.rawPrefix();
            console.log(`parsed ${parsed.length} request header bytes:\n` +
                PrettyMime(">s ", parsed));
        }

        if (this.request && this.request.body) {
            if (this.request.body.innedAll()) {
                console.log(`parsed all ${this.request.body.innedSize()} request body bytes`);
                this.doneReceiving = true;
                this.checkpoint();
            } else {
                console.log(`parsed first ${this.request.body.innedSize()} request body bytes so far`);
            }
        } else {
            console.log("parsed the entire bodyless request");
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
            SendBytes(this.socket, this.response.rawPrefix(), "response header", "<s ");

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
            SendBytes(this.socket, chunk, "response body");

        if (this.response.body.outedAll()) {
            console.log("sent the entire response body");
            this.doneSending = true;
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
        // XXX: Do not overwrite already set properties
        this.response.finalize();
        this.response.header.add("Server", "DaftServer/1.0");
        this.response.header.add("Connection", "close");
        this.response.header.add("Date", new Date().toUTCString());
        this.response.header.add("X-Daft-Response-ID", UniqueId("rep"));

        // XXX: do not add body to HEAD responses
        // XXX: add other bodyless status codes
        if (!this.response.body && this.response.startLine.statusCode != 304) {
            if (Config.DefaultMessageBodyContent !== null)
                this.response.addBody(new Body(Config.DefaultMessageBodyContent));
        }

        this._finalizedResponse = true;
    }

    fillResponseBody() {
        // generateDefaultResponse() fills the entire body
        Must(false);
    }

}
