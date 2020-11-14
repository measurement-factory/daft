/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages program lifetime. */

import assert from "assert";
import { PrettyTime, PrettyDate, DateSum, DateDiff } from "../misc/Gadgets";

// The default 60s delay is meant to be long enough for most single tests.
const Lifetime_ = new Date(60*1000);

let _GlobalTimeout = null;
let _ExpectedDeath = null; // _GlobalTimeout expiration Date

function _ClearTimeout() {
    assert(_GlobalTimeout);
    clearTimeout(_GlobalTimeout);
    _GlobalTimeout = null;
    _ExpectedDeath = null;
}

function _SetTimeout(/* Date */ delay) {
    assert(!_GlobalTimeout);
    _GlobalTimeout = setTimeout(function () {
        throw new Error(`Global ${PrettyTime(delay)} timeout`);
    }, delay.getTime());
    _GlobalTimeout.unref(); // ignore if there are no other events left

    const now = new Date();
    _ExpectedDeath = DateSum(now, delay);
    console.log(`Expecting death in ${PrettyTime(delay)} at ${PrettyDate(_ExpectedDeath)}`);
}

// gives the program (at least) `delay` more time to finish properly:
// death = now + max(delay, remaining) or
// death = max(old_death, now + delay)
export function Extend(/* Date */ delay) {
    assert(delay);

    assert(_ExpectedDeath);
    const now = new Date();
    const remaining = (_ExpectedDeath - now).valueOf(); // ms
    if (delay.valueOf() <= remaining) {
        console.log(`Ignoring global timeout extension by ${PrettyTime(delay)} ` +
            `because already waiting for ${PrettyTime(remaining)}`);
        return;
    }

    _ClearTimeout();
    const diff = DateDiff(delay, remaining);
    console.log(`Extending global timeout by ${PrettyTime(diff)}`);
    _SetTimeout(delay);
}

console.log(`Observing default ${PrettyTime(Lifetime_)} global timeout`);
_SetTimeout(Lifetime_);
