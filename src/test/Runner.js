/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages [concurrent] execution of tests. */

import assert from "assert";
import TestRun from "./Run";
import * as Config from "../misc/Config";

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
        description: "artificially limits or inflates the number of test runs",
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
// the number of tests we want to run for the current test configuration
let TestsForCurrentConfig = 0;
// the number of tests started (or being started) for the current test config
let TestsStartedForCurrentConfig = 0;

async function TestThread(test, threadId) {
    while (TestsStartedForCurrentConfig < TestsForCurrentConfig) {
        ++TestsStartedForCurrentConfig;
        const run = new TestRun(++TestsStarted, threadId);
        ++TestsRunning;
        console.log(`Starting ${run}. Concurrency level: ${TestsRunning}`);
        await test.run(run);
        --TestsRunning;
        console.log(`Finished ${run}. Concurrency level: ${TestsRunning}`);
    }
}

async function _Run(test) {

    TestsStartedForCurrentConfig = 0;

    await test.startup();

    try {
        let threads = [];

        if (Config.ConcurrencyLevel > 1)
            console.log(`Starting ${Config.ConcurrencyLevel} test threads`);

        for (let threadId = 1; threadId <= Config.ConcurrencyLevel; ++threadId)
            threads.push(TestThread(test, threadId));

        if (Config.ConcurrencyLevel > 1)
            console.log(`Started all ${Config.ConcurrencyLevel} test threads.`);

        await Promise.all(threads);

        if (Config.ConcurrencyLevel > 1)
            console.log(`Finished all ${Config.ConcurrencyLevel} test threads.`);
    } finally {
        console.log(`Shutting down DUT after ${TestsStartedForCurrentConfig} tests`);
        await test.shutdown();
    }
}

export default async function Run(Test) {
    const userConfig = Config.clone();
    const configurators = Test.Configurators();
    const totalConfigs = configurators.length;
    console.log("Planned test configurations:", totalConfigs);

    // by default, test each configuration once (concurrently if needed)
    const defaultTests = totalConfigs*Config.ConcurrencyLevel;
    const plannedTests = (Config.Tests === undefined) ? defaultTests : Config.Tests;

    // tests that cannot be spread across all configurations evenly
    let leftoverTests;
    if (plannedTests < defaultTests) {
        console.log(`Warning: --tests ${plannedTests} is too small; need ` +
            `${totalConfigs}*${Config.ConcurrencyLevel} = ${defaultTests}` +
            " tests to test each configuration once (concurrently if needed)");
        leftoverTests = 0;
    } else {
        leftoverTests = plannedTests % defaultTests;
    }

    // the Test module must provide at least one, possibly empty, configurator
    assert.notStrictEqual(totalConfigs, 0);
    let generatedConfigs = 0;
    for (const configurator of configurators) {
        // stop generating configurations if the test limit was reached
        if (TestsStarted >= plannedTests) {
            console.log("Warning: Reached --tests limit before testing all",
                totalConfigs, "test configurations:",
                TestsStarted, ">=", plannedTests);
            break;
        }

        configurator.forEach(step => step(Config));
        ++generatedConfigs;
        console.log(`Test configuration #${generatedConfigs}:\n${Config.sprint()}`);

        if (plannedTests < defaultTests) {
            TestsForCurrentConfig = Config.ConcurrencyLevel;
            if (TestsStarted + TestsForCurrentConfig > plannedTests)
                TestsForCurrentConfig = plannedTests - TestsStarted;
        } else {
            TestsForCurrentConfig = Math.trunc(plannedTests / totalConfigs);
            assert(TestsForCurrentConfig >= Config.ConcurrencyLevel);
            if (leftoverTests > 0) {
                ++TestsForCurrentConfig;
                --leftoverTests;
            }
        }
        console.log("Tests for this configuration:", TestsForCurrentConfig);
        assert(TestsForCurrentConfig > 0);

        const test = new Test();
        await _Run(test);

        Config.reset(userConfig);
    }
    console.log("Ran", TestsStarted, "tests.");
}
