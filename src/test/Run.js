/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* A single test execution. */

export default class Run {

    constructor(runId, threadId) {
        this.id = runId;
        this.thread = threadId;
    }

    toString() {
        return "test run#" + this.id;
    }

}
