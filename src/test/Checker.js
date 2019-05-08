/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";

// A container of delayed function calls, each call performing some simple
// post-test validation. The calls made in their registration order.
export default class Checker {
    constructor() {
        assert.strictEqual(arguments.length, 0);
        this._ran = false;
        this._checks = [];
    }

    // Register a future check.
    add(futureCheck) {
        // All checks must be added before any checks are ran so that we do not
        // need to worry about running all checks exactly once.
        assert(!this.ran);
        this._checks.push(futureCheck);
    }

    // perform all the registered checks
    run(/* arguments */) {
        const args = arguments;
        assert(!this.ran);
        this.ran = true;
        this._checks.forEach(check => check(...args));
    }

}
