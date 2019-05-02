/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import * as MessageWriter from "../http/one/MessageWriter";
import * as Gadgets from "../misc/Gadgets";
import assert from "assert";

// a process of sending and receiving a (request, response) tuple
// kids define which of those two messages is sent and which is received
export default class Transaction {
    constructor(messageOut) {
        assert.strictEqual(arguments.length, 1);

        /* kids must set these */
        this.ownerKind = undefined;
        this.peerKind = undefined;
        this.messageOutKind = undefined;

        this._startTime = null;
        this.socket = null;

        this.messageIn = null; // e.g., Request for server transactions
        this.messageOut = messageOut ? messageOut.clone() : null;

        this.doneReceiving = false; // incoming message
        this.doneSending = null; // Date
        this.doneCallback = null; // set by the initiator if needed

        // Whether this.messageOut has all the details except body content.
        // That content is expected iff this.messageOut.body is not nil.
        this._finalizedMessage = false;

        this._bodyEncoder = null;
    }

    startTime() {
        assert(this._startTime);
        return this._startTime;
    }

    sentTime() {
        assert(this.doneSending);
        return this.doneSending;
    }

    start(socket) {
        assert.strictEqual(arguments.length, 1);
        assert(socket);
        assert(!this.socket);
        this.socket = socket;

        assert(!this._startTime);
        this._startTime = new Date();
        console.log(this._startTime.toISOString(),
            `${this.ownerKind} transaction started`);

        /* setup event listeners */

        this.socket.on('data', data => {
            this.onReceive(data);
        });

        this.socket.on('end', () => {
            console.log(new Date().toISOString(), `${this.peerKind} disconnected`);
            // assume all 'data' events always arrive before 'end'
            this.doneReceiving = true;
            this.checkpoint();
        });

        this.send();
    }

    finish() {
        console.log(this._startTime.toISOString(),
            `${this.ownerKind} transaction ended`);

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
        Gadgets.ReceivedBytes(this.socket, virginData, this.messageInKind, this.messageParser.logPrefix);
        this.parse(virginData);
        this.send();
    }

    parse(virginData) {
        this.messageParser.parse(virginData);

        if (!this.messageParser.message)
            return; // have not found the end of headers yet

        if (!this.messageIn)
            this.messageIn = this.messageParser.message;

        if (!this.messageIn.body || this.messageIn.body.innedAll) {
            this.doneReceiving = true;
            this.checkpoint();
        }
    }

    send() {
        if (this.doneSending)
            return;

        let hadHeaders = this._finalizedMessage;
        if (!hadHeaders)
            this.makeMessage();

        if (!this._finalizedMessage) {
            console.log(`not ready to send ${this.messageOutKind}`);
            assert(!this.doneSending);
            return;
        }

        assert(this.messageOut);

        if (!hadHeaders) {
            // send message headers once we got them
            Gadgets.SendBytes(this.socket, this.messageOut.prefix(MessageWriter), `${this.messageOutKind} header`, this.logPrefixForSending);

            if (!this.messageOut.body) {
                this.endSending(`sent a bodyless ${this.messageOutKind}`);
                return;
            }
        }

        assert(this.messageOut.body);
        if (!this._bodyEncoder)
            this._bodyEncoder = MessageWriter.bodyEncoder(this.messageOut);
        const out = this._bodyEncoder.encodeBody(this.messageOut.body);
        if (out.length)
            Gadgets.SendBytes(this.socket, out, `${this.messageOutKind} body`, this.logPrefixForSending);

        if (this.messageOut.body.outedAll()) {
            const bytesDescription = this._bodyEncoder.describeBytes(`${this.messageOutKind} body`);
            this.endSending(`sent all ${bytesDescription}`);
            return;
        }
        console.log(`may send more ${this.messageOutKind} body later`);
    }

    endSending(why) {
        this.doneSending = new Date();
        console.log(this.doneSending.toISOString(), why);
        this.checkpoint();
    }

    makeMessage() {
        if (!this.messageOut)
            this.messageOut = this.generateDefaultMessage();

        if (!this._finalizedMessage)
            this.finalizeMessage(); // may not finalize

        if (this.messageOut.body && !this.messageOut.body.innedAll)
            this.fillMessageBody();
    }

    // kids must return a non-finalized message
    generateDefaultMessage() {
        assert(false);
    }

    fillMessageBody() {
        // generateDefaultMessage() fills the entire body
        assert(false);
    }

}
