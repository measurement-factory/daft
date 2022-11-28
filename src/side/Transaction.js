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
    constructor(agent) {
        assert.strictEqual(arguments.length, 1);

        assert(agent);
        this._agent = agent; // transaction creator

        /* kids must set these */
        this.ownerKind = undefined;
        this.peerKind = undefined;
        this.messageOutKind = undefined;
        this.messageInKind = undefined;

        this.context = new Context("xact");

        this._startTime = null;
        this.socket = null;
        this._savedSocket = null; // post-finish() pconn

        this.messageIn = null; // e.g., Request for server transactions
        this.messageOut = null; // e.g., Request for client transactions

        // _blockSending() sets message part blocks
        this._sendingBlocks = {
            headers: null,
            body: null
        };

        // sending = producing + writing
        this._doneProducing = false;
        this._doneSending = null; // Date
        // a promise to send everything
        this._sentEverything = new Promise((resolve) => {
            this._sentEverythingResolver = resolve;
        });

        this._doneReceiving = null; // Date
        // a promise to receive headers
        this._receivedHeaders = new Promise((resolve) => {
            this._receivedHeadersResolver = resolve;
        });
        // a promise to receive everything
        this._receivedEverything = new Promise((resolve) => {
            this._receivedEverythingResolver = resolve;
        });

        // endAsync() has been called; do not close the socket until
        // endAsync() finishes -- the endAsync() sequence needs the socket
        this._halfClosing = false;

        // finish() has been called at least once
        this._ending = false;

        // a promise to (do as much as possible and) end
        this._finished = new Promise((resolve) => {
            this._finishedResolver = resolve;
        });

        // Whether this.messageOut has all the details except body content.
        // That content is expected iff this.messageOut.body is not nil.
        this._finalizedMessage = false;

        this._bodyEncoder = null;

        // (the reason to) close the socket only after our peer closes
        this._closeLast = null;
    }

    started() {
        return this._startTime !== null;
    }

    startTime() {
        assert(this._startTime);
        return this._startTime;
    }

    receivedEverythingTime() {
        assert(this._doneReceiving);
        return this._doneReceiving;
    }

    sentTime() {
        assert(this._doneSending);
        return this._doneSending;
    }

    sentEverything() {
        assert(this._sentEverything); // but may not be resolved yet
        return this._sentEverything;
    }

    finished() {
        assert(this._finished); // but may not be resolved yet
        return this._finished;
    }

    blockSendingUntil(externalEvent, waitingFor) {
        this._blockSending('headers', externalEvent, waitingFor);
    }

    blockSendingBodyUntil(externalEvent, waitingFor) {
        this._blockSending('body', externalEvent, waitingFor);
    }

    closeLast(why) {
        assert(why);
        this.context.log("will not close the connection first:", why);
        this._closeLast = why;
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

    persistent() {
        // TODO: When is it OK to ask this question?
        assert(this.messageIn);
        assert(this.messageOut);
        assert(this._finalizedMessage);
        this.context.log(`messageIn.persistent ${this.messageIn.persistent()}`);
        this.context.log(`messageOut.persistent ${this.messageOut.persistent()}`);
        return this.messageIn.persistent() && this.messageOut.persistent();
    }

    async run(socket) {
        assert.strictEqual(arguments.length, 1);
        assert(!this.started());

        assert(!this._startTime);
        this._startTime = this.context.enter(`${this.ownerKind} transaction started`);

        assert(socket);
        assert(!this.socket);
        this.socket = socket;

        /* setup event listeners */

        this.socket.once('error', error => {
            this.context.enter();
            this.context.log("aborting on I/O error:", error);
            // TODO: this.reportWhatWeAreDoing("were"); see checkpoint()
            this.socket.destroy();
            this.socket = null;
            this.finish(); // without checkpoint()
            this.context.exit();
        });

        this.socket.on('data', data => {
            this.context.enter();
            this.onReceive(data);
            this.context.exit();
        });

        this.socket.on('end', () => {
            this.context.enter(`received EOF from ${this.peerKind}`);

            // This configuration-overwriting simplification/hack feels OK for
            // now. If that changes, add/use a ._peerClosed state instead.
            if (this._closeLast) {
                this.context.log(`stop waiting for ${this.peerKind} to close first`);
                this._closeLast = false;
            }

            // assume all 'data' events always arrive before 'end'
            if (!this._doneReceiving)
                this.endReceiving(`${this.peerKind} disconnected`);
            else
                this.checkpoint(); // probably will just report what we are waiting for
            // TODO: Clear this.socket?
            this.context.exit();
        });

        // we wrote everything
        this.socket.on('drain', () => {
            this.context.enter('wrote everything produced so far');
            if (this.socket) // not finish()ed yet
                this.checkpoint();
            // else ignore post-finish() events
            this.context.exit();
        });

        this.send();

        this.context.exit();

        await this._finished;
    }

    finish() {
        if (this._ending) {
            // Can we tell when we are 100% done? May some [socket] callbacks
            // be scheduled before but fire after finish()? Such "late"
            // callbacks were observed when something else went wrong (e.g.,
            // we forgot to wait for some event and called finish()
            // prematurely). For now, assume some legitimate cases also exist.
            this.context.log(`${this.ownerKind} transaction is still ending`);
            return;
        }
        this._ending = true;

        this.context.log(`${this.ownerKind} transaction ends...`);

        if (this.socket) {
            this._agent.absorbTransactionSocket(this, this.socket);
            this.socket = null;
        }

        this._finishedResolver(this);
    }

    checkpoint() {

        let doing = [];

        // discover achievement of this._doneSending state
        if (!this._doneSending && this._doneProducing && !this._writing()) {
            this._doneSending = this.context.log("done sending");
            this._sentEverythingResolver(this);
        }


        /* HTTP layer */

        if (!this._doneReceiving)
            doing.push("receiving");

        if (!this._doneProducing)
            doing.push("expecting to send more");


        /*  socket layer */

        if (this._writing())
            doing.push(`writing ${this.socket.bufferSize} bytes`);

        if (this.socket && this._closeLast)
            doing.push(`waiting for ${this.peerKind} to close first`);

        if (this.socket && this._halfClosing)
            doing.push(`waiting for half-closing completion`);


        /* various event handlers that might fire post-finish() */

        if (this._ending)
            doing.push(`ending`);


        if (doing.length)
            this.context.log('still', doing.join(", "));
        else
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
        if (this._doneProducing)
            return;

        if (!this._allowedToSend('headers'))
            return;

        let hadHeaders = this._finalizedMessage;
        if (!hadHeaders)
            this.makeMessage();

        if (!this._finalizedMessage) {
            this.context.log(`not ready to send ${this.messageOutKind}`);
            assert(!this._doneProducing);
            return;
        }


        assert(this.messageOut);
        const out = this._makeOut(!hadHeaders);

        if (out.length)
            Gadgets.SendBytes(this.socket, out, this.messageOutKind);

        if (!this.messageOut.body) {
            this._stopProducing(`produced a bodyless ${this.messageOutKind}`);
            return;
        }

        if (this.messageOut.body.outedAll()) {
            this._stopProducing(`produced the entire ${this.messageOutKind} body`);
            return;
        }

        if (this.messageOut.body.doneOuting()) {
            this._stopProducing(`cannot produce any more ${this.messageOutKind} body bytes`);
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
            const finishedEncoding = this._bodyEncoder.finished();
            // Cases using "entire" wording below assume that the encoder may
            // not output some trailing metadata but always outputs all the
            // body.out() bytes we feed it with. Also, we use unnecessarily
            // spelled out conditions below to better document each case.
            const madeThing =
                madeAllNow && finishedEncoding ? `the entire ${this.messageOutKind} body`:
                madeAllNow && !finishedEncoding ? `an incomplete encoding of the entire resource content`:
                !madeAllNow && finishedEncoding ? `the final piece of the ${this.messageOutKind} body`:
                !madeAllNow && !finishedEncoding ? `a piece of the ${this.messageOutKind} body`:
                assert(false);
            this.context.log(`will send ${madeThing}` + Gadgets.PrettyBody(this.logPrefixForSending, bodyOut));
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
        assert(!this._doneReceiving);
        this._doneReceiving = this.context.log("done receiving:", why);
        this._receivedEverythingResolver(this);
        if (this._receivedHeadersResolver)
            this._endReceivingHeaders();
        this.checkpoint();
    }

    _stopProducing(why) {
        assert(!this._doneProducing);
        this._doneProducing = true;
        this.context.log("done producing:", why);
        this.checkpoint();
    }

    // whether we are still writing already produced content
    // more content may be produced later unless this._doneProducing
    _writing() {
        return this.socket && this.socket.bufferSize;
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
