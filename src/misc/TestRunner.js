/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages [concurrent] execution of tests. */

import TestRun from "./TestRun";
import * as Config from "./Config";

Config.Recognize([
    {
        option: "concurrency-level",
        type: "Number",
        default: "1",
        description: "number of tests to run at the same time",
    },
    {
        option: "tests",
        type: "Number",
        default: "1",
        description: "number of tests to run",
    },
    {
        option: "origin-port",
        type: "Number",
        default: Config.OriginAuthority.port.toString(),
        description: "where origin servers listen for requests",
    },
]);

let TestsStarted = 0; // the number of tests started (or being started)
let TestsRunning = 0; // number of concurrent tests running now

async function TestThread(test, threadId) {
    while (TestsStarted < Config.Tests) {
        const run = new TestRun(++TestsStarted, threadId);
        console.log("Starting %s. Concurrency level: %d.", run, ++TestsRunning);
        await test.run(run);
        console.log("Finished %s. Concurrency level: %d.", run, --TestsRunning);
    }
}

export default function StartTests(test) {

    if (Config.ConcurrencyLevel > 1 || Config.Tests > 1)
        console.log(`Starting ${Config.ConcurrencyLevel} test threads to run ${Config.Tests} tests.`);

    for (let threadId = 1; threadId <= Config.ConcurrencyLevel; ++threadId)
        TestThread(test, threadId);

    if (Config.ConcurrencyLevel > 1)
        console.log(`Started all ${Config.ConcurrencyLevel} test threads.`);
}
