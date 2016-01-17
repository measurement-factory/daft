/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages program lifetime. */

// The default 60s delay is meant to be long enough for most single tests.
const Lifetime_ = 60*1000;

let _GlobalTimeout = null;

function _ClearTimeout() {
    clearTimeout(_GlobalTimeout);
    _GlobalTimeout = null;
}

function _SetTimeout(delay /* ms */) {
    _GlobalTimeout = setTimeout(function () {
        throw new Error(`Global ${delay}ms timeout.`);
    }, delay);
    _GlobalTimeout.unref(); // ignore if there are no other events left
}

function _ResetTimeout(delay /* ms */, reason) {
    if (_GlobalTimeout !== null) {
        _ClearTimeout();
        console.log(reason);
    } else {
        console.log(`Observing ${delay}ms global timeout.`);
    }
    _SetTimeout(delay);
}

// Limits program lifetime by throwing an exception after the given delay.
// TODO: To export this function, subtract the lifetime already spent.
// Otherwise, we are not limiting the lifetime but Extend()ing it.
function Limit(delay /* ms */) {
    _ResetTimeout(delay, `Resetting active global timeout to ${delay}ms.`);
}

// Extends previously set lifetime (or sets the first lifetime limit).
export function Extend(delay = Lifetime_ /* ms */) {
    _ResetTimeout(delay, `Extending active global timeout to ${delay}ms from now.`);
}

Limit(Lifetime_);
