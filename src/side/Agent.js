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
        this._transaction = undefined;

        this.xCount = 0;

        this.transactionDone = new Promise((resolve) => {
            this._transactionDoneResolver = resolve;
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

    _startTransaction(socket) {
        assert.strictEqual(arguments.length, 1);

        if (this._transaction.doneCallback) { // already started one transaction
            console.log("ignoring an unexpected transaction");
            socket.destroy();
            return;
        }

        ++this.xCount;
        socket.setEncoding('binary');
        this._transaction.doneCallback = this._transactionDoneResolver;
        this._transaction.start(socket);
    }
}
