/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages [concurrent] execution of tests. */

import TestRun from "./TestRun";
import * as Config from "./Config";
import Promise from "bluebird";

Config.Recognize([
    {
        option: "concurrency-level",
        type: "Number",
        default: "1",
        description: "number of tests to run at the same time"
    },
    {
        option: "tests",
        type: "Number",
        default: "1",
        description: "number of tests to run"
    },
    {
        option: "origin-port",
        type: "Number",
        default: Config.OriginAuthority.port.toString(),
        description: "where origin servers listen for requests"
    }
]);


let TestsStarted = 0; // the number of tests started (or being started)
let TestsRunning = 0; // number of concurrent tests running now

function TestPromise(test, run) {
    return Promise.try(function () {
        let resolver;
        let promise = new Promise((resolve) => {
            resolver = resolve;
        });
        test(run, resolver);
        return promise;
    });
}

async function TestThread(test, threadId) {
    while (TestsStarted < Config.Tests) {
        const run = new TestRun(++TestsStarted, threadId);
        console.log("Starting %s. Concurrency level: %d.", run, ++TestsRunning);
        await TestPromise(test, run);
        console.log("Finished %s. Concurrency level: %d.", run, --TestsRunning);
    }
}

export default function StartTests(test) {
    // XXX: This should be done earlier because placing this call here forces
    // testing code to check/finalize its configuration inside each test.
    // TODO: Convert StartTests and friends into an TestApp class so that
    // various pre- and post-testing loop steps become [virtual] methods?
    Config.Finalize();

    if (Config.Help) {
        console.log(Config.CliHelp);
        process.exitCode = 0;
        return;
    }

    if (Config.ConcurrencyLevel > 1 || Config.Tests > 1)
        console.log(`Starting ${Config.ConcurrencyLevel} test threads to run ${Config.Tests} tests.`);

    for (let threadId = 1; threadId <= Config.ConcurrencyLevel; ++threadId)
        TestThread(test, threadId);

    if (Config.ConcurrencyLevel > 1)
        console.log(`Started all ${Config.ConcurrencyLevel} test threads.`);
}
