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

        // _blockSending() sets message part blocks
        this._sendingBlocks = {
            headers: null,
            body: null
        };

        this.doneSending = null; // Date
        // a promise to send everything
        this._sentEverything = new Promise((resolve) => {
            this._sentEverythingResolver = resolve;
        });

        this.doneReceiving = null; // Date
        // a promise to receive headers
        this._receivedHeaders = new Promise((resolve) => {
            this._receivedHeadersResolver = resolve;
        });
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

    started() {
        return this._startTime !== null;
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
        this._blockSending('headers', externalEvent, waitingFor);
    }

    blockSendingBodyUntil(externalEvent, waitingFor) {
        this._blockSending('body', externalEvent, waitingFor);
    }

    _blockSending(part, externalEvent, waitingFor) {
        assert(part in this._sendingBlocks); // valid message part name
        assert(!this._sendingBlocks[part]); // not really needed; may simplify triage
        const block = {
            what: `${this.messageOutKind} ${part}`,
            waitingFor: waitingFor,
            active: false // nobody is waiting for this block to be removed yet
        };
        this._sendingBlocks[part] = block;
        this.context.log(`will block sending ${block.what} to ${block.waitingFor}`);
        externalEvent.tap(() => this._unblockSending(part));
    }

    _unblockSending(part) {
        assert(part in this._sendingBlocks); // valid message part name
        const block = this._sendingBlocks[part];
        assert(block);

        const verb = block.active ? "resumes" : "will no longer block";
        this.context.enter(`${verb} sending ${block.what} after ${block.waitingFor}`);
        this._sendingBlocks[part] = null;
        if (block.active) {
            block.active = false;
            this.send(); // may block again
        }
        this.context.exit();
    }

    _allowedToSend(part) {
        assert(part in this._sendingBlocks); // valid message part name
        const block = this._sendingBlocks[part];

        if (!block)
            return true; // never configured

        if (block.active)
            return false; // configured and already activated

        block.active = true;
        this.context.log(`not ready to send ${block.what}: ${block.waitingFor}`);
        return false; // configured and now activated
    }

    receivedHeaders() {
        assert(this._receivedHeaders); // but may not be resolved yet
        return this._receivedHeaders;
    }

    receivedEverything() {
        assert(this._receivedEverything); // but may not be resolved yet
        return this._receivedEverything;
    }

    start(socket) {
        assert.strictEqual(arguments.length, 1);
        assert(!this.started());

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

        // we wrote everything
        this.socket.on('drain', () => {
            this.context.enter('wrote everything');
            if (this.socket) // not finish()ed yet
                this.checkpoint();
            // else ignore post-finish() events
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

        if (!this.messageIn) {
            this.messageIn = this.messageParser.message;
            this._endReceivingHeaders();
        }

        if (!this.messageIn.body)
            this.endReceiving(`got header-only ${this.messageInKind}`);
        else if (this.messageIn.body.innedAll)
            this.endReceiving(`got ${this.messageInKind} body`);
    }

    send() {
        if (this.doneSending)
            return;

        if (!this._allowedToSend('headers'))
            return;

        let hadHeaders = this._finalizedMessage;
        if (!hadHeaders)
            this.makeMessage();

        if (!this._finalizedMessage) {
            this.context.log(`not ready to send ${this.messageOutKind}`);
            assert(!this.doneSending);
            return;
        }


        assert(this.messageOut);
        const out = this._makeOut(!hadHeaders);

        if (out.length)
            Gadgets.SendBytes(this.socket, out, this.messageOutKind);

        if (!this.messageOut.body) {
            this.endSending(`sent a bodyless ${this.messageOutKind}`);
            return;
        }

        if (this.messageOut.body.outedAll()) {
            this.endSending(`sent the entire ${this.messageOutKind} body`);
            return;
        }

        if (!this._allowedToSend('body'))
            return;

        this.context.log(`may send more ${this.messageOutKind} body later`);
    }

    _makeOut(callerWantsHeaders) {
        let out = "";

        if (callerWantsHeaders) {
            const hdrOut = this.messageOut.prefix(MessageWriter);
            console.log(`will send ${this.messageOutKind} header` +
                Gadgets.PrettyMime(this.logPrefixForSending, hdrOut));
            out += hdrOut;
        }

        if (this.messageOut.body && this._allowedToSend('body')) {
            if (!this._bodyEncoder)
                this._bodyEncoder = MessageWriter.bodyEncoder(this.messageOut);
            const bodyOut = this._bodyEncoder.encodeBody(this.messageOut.body);
            out += bodyOut;

            const madeAllNow = this.messageOut.body.outedAll() &&
                bodyOut.length === this._bodyEncoder.outputSize();
            const madeThing = madeAllNow ?
                `the entire ${this.messageOutKind} body`:
                `a piece of the ${this.messageOutKind} body`;
            console.log(`will send ${madeThing}` + Gadgets.PrettyBody(this.logPrefixForSending, bodyOut));
        }

        return out;
    }

    _endReceivingHeaders() {
        assert(this._receivedHeadersResolver);
        this._receivedHeadersResolver(this);
        this._receivedHeadersResolver = null;
        // no this.checkpoint() because it does not depend on headers
    }

    endReceiving(why) {
        assert(!this.doneReceiving);
        this.doneReceiving = this.context.log("done receiving:", why);
        this._receivedEverythingResolver(this);
        if (this._receivedHeadersResolver)
            this._endReceivingHeaders();
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
