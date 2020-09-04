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
    }

    stop() {
        return Promise.try(() => {
            return this._stop();
        });
    }

    transaction() {
        assert(this._transaction);
        return this._transaction;
    }

    _stop() {
        // TODO: and kill all pending transactions?
        return Promise.resolve(this);
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
}
