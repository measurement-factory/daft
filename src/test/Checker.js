/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";
import Promise from "bluebird";

import * as Gadgets from "../misc/Gadgets";

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

    // perform all the registered checks; some of them may be asynchronous
    async run(/* arguments */) {
        const args = arguments;
        assert(!this.ran);
        this.ran = true;
        await Promise.each(this._checks, async check => {
            try {
                await check(...args);
            }
            catch (error) {
                Gadgets.KeepGoingOrThrow(error);
            }
        });
    }

}
