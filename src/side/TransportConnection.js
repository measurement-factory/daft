/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";

// transaction traffic carrier (e.g., a TCP connection carrying HTTP transactions)
export default class TransportConnection {
    constructor(socket) {
        this._socket = socket;
        this._transactionsStarted = 0;
    }

    socket() {
        return this._socket;
    }

    transactionsStarted() {
        assert.strictEqual(arguments.length, 0);
        return this._transactionsStarted;
    }

    noteTransactionStart() {
        assert.strictEqual(arguments.length, 0);
        ++this._transactionsStarted;
    }
}

