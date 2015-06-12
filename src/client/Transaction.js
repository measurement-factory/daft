import ResponseParser from "../http/ResponseParser";
import Request from "../http/Request";
import { Must, PrettyMime } from "../misc/Gadgets";

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

        if (this.request && this.request.callback)
            this.request.callback(this);
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
            let parsed = this.response.rawPrefix();
            console.log(`parsed ${parsed.length} response header bytes:\n` +
                PrettyMime("c< ", parsed));
        }

        if (this.response && this.response.body && this.response.body.length()) {
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
            let out = this.request.rawPrefix();
            this.socket.write(out);
            console.log(`sending ${out.length} request header bytes:\n` +
                PrettyMime("c> ", out));

            if (!this.request.body) {
                console.log("sent a bodyless request");
                this.doneSending = true;
                this.checkpoint();
                return;
            }
        }

        Must(this.request.body);
        let chunk = this.request.body.out();
        if (chunk.length) {
            this.socket.write(chunk);
            console.log(`sending ${chunk.length} request body bytes`);
        }
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
        this.request.startLine.finalize();
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
