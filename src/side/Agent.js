/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import Promise from 'bluebird';
import Checker from "../test/Checker";
import assert from "assert";

export default class Agent {
    constructor() {
        assert.strictEqual(arguments.length, 0);

        /* kids must set this */
        this._transaction = undefined; // the very first transaction

        // transaction activity statistics
        this._xStarted = 0;
        this._xFinished = 0;

        this.transactionsDone = new Promise((resolve) => {
            this._transactionsDoneResolver = resolve;
        });

        this.checks = new Checker();

        // 1. require persistent connections
        // 2. do not close persistent connections when stopping
        // 3. save persistent connections for other.reuseConnectionsFrom(this)
        this._keepConnections = false;

        // A presumably open socket of a finish()ed transaction. Saved only if
        // requested by this._keepConnections.
        this._savedSocket = null;
    }

    async stop() {
        assert(false, `pure virtual: kids must override`);
    }

    transaction() {
        assert(this._transaction);
        return this._transaction;
    }

    keepConnections() {
        console.log("will require and reuse persistent connections");
        this._keepConnections = true; // may already be true
    }

    _startTransaction(transaction, socket) {
        assert.strictEqual(arguments.length, 2);
        assert(!transaction.started());

        ++this._xStarted;
        console.log("starting transaction number", this._xStarted);

        socket.setEncoding('binary');

        assert(!transaction.doneCallback);
        transaction.doneCallback = x => this._noteDoneTransaction(x);
        transaction.start(socket);
    }

    _noteDoneTransaction(/*transaction*/) {
        ++this._xFinished;

        const xRemaining = this._xStarted - this._xFinished;
        assert(xRemaining >= 0);
        if (!xRemaining) { // all previously started transactions are done
            // We may still come back here if another transaction starts
            // before we are stopped but there is currently no mechanism to
            // delay resolving our promise until more transactions finish.
            console.log("finished all", this._xStarted, "previously started transactions");
            this._transactionsDoneResolver(this);
        } else {
            console.log("keep waiting for the remaining", xRemaining, "transactions");
        }
    }

    // keeps or closes the socket of a finish()ing transaction
    absorbTransactionSocket(transaction, socket) {

        if (this._keepConnections) {
            // those who set this._keepConnections require a pconn
            assert(transaction.persistent());
            assert(socket);

            // no support for saving multiple sockets
            assert(!this._savedSocket);
            this._savedSocket = socket;

            transaction.context.log("saved connection instead of closing it");

            this._savedSocket.unref();

            // We are done monitoring this socket; remove our event handlers.
            // The new transaction will register its own handlers.
            // TODO: Remove just the handlers that _we_ added (explicitly)?
            // Nodejs says we should not "remove listeners added elsewhere".
            this._savedSocket.removeAllListeners();

            return;
        }

        if (socket) {
            socket.destroy();
            transaction.context.log("closed socket");
        }
    }

    // absorbs existing (presumably persistent) connection(s) from another
    // instance of (presumably) same-side agent
    reuseConnectionsFrom(agent) {
        assert(this !== agent);

        // most likely, our caller requires a pconn reuse
        assert(agent._savedSocket);

        console.log("reusing saved connection");
        this._savedSocket = agent._savedSocket;
        agent._savedSocket = null;
        this._savedSocket.ref();
        // and wait for start()
    }
}
