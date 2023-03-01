/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";
import { Must } from "../misc/Gadgets";

// a single test attempt: a (startup, test thread run(s), shutdown) sequence
export default class Test {
    constructor() {
        assert.strictEqual(arguments.length, 0);
    }

    // called once before any run() calls
    async startup() {
    }

    // called once after all run()s complete
    async shutdown() {
    }

    // executes a single test thread
    // (concurrently) called multiple times when testing using multiple test threads
    async run(/*testRun*/) {
        Must(false, `pure virtual: kids must override`);
    }

    // Kids "override" this method to return configuration customizations.
    // A single Test will be generated for each returned configurator.
    static Configurators() {
        const customizeNothing = []; // no customization steps
        return [ customizeNothing ];
    }

}
