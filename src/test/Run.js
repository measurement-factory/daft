/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* A single test execution. */

import assert from "assert";

export default class Run {

    constructor(runId, threadId) {
        this.id = runId;
        this.thread = threadId;
        this.attempt_ = null; // optional, set by attempt()
    }

    attempt(n) {
        assert(n !== undefined);
        assert(n !== null);
        this.attempt_ = n;
    }

    toString() {
        let description = "test run#" + this.id;
        if (this.attempt_)
            description += "+" + this.attempt_;
        return description;
    }

}
