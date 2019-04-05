/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";
import { Must } from "../misc/Gadgets";

// a checklist: an ordered sequence of checks (a.k.a. test cases),
// usually revolving around validating some DUT feature or functionality
export default class Test {
    constructor(dut) {
        assert.strictEqual(arguments.length, 1);
        assert.notStrictEqual(dut, undefined);
        this.dut = dut; // device under test; may be null
    }

    // called once before any run() calls
    async startup() {
        if (this.dut)
            await this.dut.noteStartup();
    }

    // called once after all run()s complete
    async shutdown() {
        if (this.dut)
            await this.dut.noteShutdown();
    }

    // executes a sequence of checks
    // may be called multiple times when repeating/parallelizing test runs
    async run(/*testRun*/) {
        Must(false, `pure virtual: kids must override`);
    }

}
