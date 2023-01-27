/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";

// Depending on the depth of detalization (see the setter methods), identifies
// a single test, a single test attempt, or a single test thread execution.
// See test/Runner.js for terminology.
export default class Run {

    constructor(testId) {
        assert.strictEqual(arguments.length, 1);
        this._testId = testId;
        this._thread = null; // see setThread()
        this._attempt = null; // see setAttempt()
    }

    clone() {
        const copy = new Run(this._testId);
        copy._thread = this._thread; // may be null or zero
        copy._attempt = this._attempt; // may be null or zero
        return copy;
    }

    setThread(threadId, expectedThreadCount) {
        assert.strictEqual(arguments.length, 2);
        assert(threadId > 0);
        this._thread = (expectedThreadCount > 1) ? threadId : 0;
    }

    setAttempt(attemptId, retriesAllowed) {
        assert.strictEqual(arguments.length, 2);
        assert(attemptId > 0);
        this._attempt = retriesAllowed ? attemptId : 0;
    }

    toString() {
        let description = "test run#" + this._testId;
        if (this._attempt)
            description += "." + this._attempt;
        if (this._thread)
            description += "(" + this._thread + ")";
        return description;
    }

    // useful for DNS labels and other IDs with restrictive character sets
    toWord() {
        let word = this._testId;
        if (this._thread)
            word += "t" + this._thread;
        if (this._attempt)
            word += "a" + this._attempt;
        return word;
    }
}
