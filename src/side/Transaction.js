/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import Promise from 'bluebird';
import * as MessageWriter from "../http/one/MessageWriter";
import * as Gadgets from "../misc/Gadgets";
import Context from "../misc/Context";
import assert from "assert";

// a process of sending and receiving a (request, response) tuple
// kids define which of those two messages is sent and which is received
export default class Transaction {
    constructor() {
        assert.strictEqual(arguments.length, 0);

        /* kids must set these */
        this.ownerKind = undefined;
        this.peerKind = undefined;
        this.messageOutKind = undefined;
        this.messageInKind = undefined;

        this.context = new Context("xact");

        this._startTime = null;
        this.socket = null;

        this.messageIn = null; // e.g., Request for server transactions
        this.messageOut = null; // e.g., Request for client transactions

        this._blockedSending = false;
        this._blockedSendingActive = false;
        this.doneSending = null; // Date
        // a promise to send everything
        this._sentEverything = new Promise((resolve) => {
            this._sentEverythingResolver = resolve;
        });

        this.doneReceiving = null; // Date
        // a promise to receive everything
        this._receivedEverything = new Promise((resolve) => {
            this._receivedEverythingResolver = resolve;
        });

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

    sentEverything() {
        assert(this._sentEverything); // but may not be resolved yet
        return this._sentEverything;
    }

    blockSendingUntil(externalEvent, waitingFor) {
        assert(!this._blockedSending); // not really needed; may simplify triage
        this._blockedSending = waitingFor;
        assert(this._blockedSending);

        externalEvent.tap(() => this.unblockSending());
        this.context.log(`will block sending ${this.messageOutKind} to ${this._blockedSending}`);
    }

    unblockSending() {
        const verb = this._blockedSendingActive ? "resumes" : "will no longer block";
        this.context.enter(`${verb} sending ${this.messageOutKind} after ${this._blockedSending}`);

        assert(this._blockedSending); // not really needed; may simplify triage
        this._blockedSending = false;
        if (this._blockedSendingActive) {
            this._blockedSendingActive = false;
            this.send();
        }

        this.context.exit();
    }

    receivedEverything() {
        assert(this._receivedEverything); // but may not be resolved yet
        return this._receivedEverything;
    }

    start(socket) {
        assert.strictEqual(arguments.length, 1);

        assert(!this._startTime);
        this._startTime = this.context.enter(`${this.ownerKind} transaction started`);

        assert(socket);
        assert(!this.socket);
        this.socket = socket;

        /* setup event listeners */

        this.socket.on('data', data => {
            this.context.enter();
            this.onReceive(data);
            this.context.exit();
        });

        this.socket.on('end', () => {
            this.context.enter();
            // assume all 'data' events always arrive before 'end'
            if (!this.doneReceiving)
                this.endReceiving(`${this.peerKind} disconnected`);
            // else ignore post-message EOF; TODO: Clear this.socket?
            this.context.exit();
        });

        this.send();

        this.context.exit();
    }

    finish() {
        this.context.log(`${this.ownerKind} transaction ended`);

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

        if (!this.messageIn.body)
            this.endReceiving(`got header-only ${this.messageInKind}`);
        else if (this.messageIn.body.innedAll)
            this.endReceiving(`got ${this.messageInKind} body`);
    }

    send() {
        if (this.doneSending)
            return;

        if (this._blockedSendingActive)
            return;

        if (this._blockedSending) {
            this._blockedSendingActive = true;
            this.context.log(`not ready to send ${this.messageOutKind}: ${this._blockedSending}`);
            return;
        }

        let hadHeaders = this._finalizedMessage;
        if (!hadHeaders)
            this.makeMessage();

        if (!this._finalizedMessage) {
            this.context.log(`not ready to send ${this.messageOutKind}`);
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
        this.context.log(`may send more ${this.messageOutKind} body later`);
    }

    endReceiving(why) {
        assert(!this.doneReceiving);
        this.doneReceiving = this.context.log("done receiving:", why);
        this._receivedEverythingResolver(this);
        this.checkpoint();
    }

    endSending(why) {
        assert(!this.doneSending);
        this.doneSending = this.context.log("done sending:", why);
        this._sentEverythingResolver(this);
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
