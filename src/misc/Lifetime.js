/* Manages program lifetime. */

let _GlobalTimeout = null;

// Limits program lifetime by throwing an exception after the given delay.
export function Limit(delay /* ms */) {
    if (_GlobalTimeout !== null) {
        console.log("Re-setting active global timeout.");
        clearTimeout(_GlobalTimeout);
    }
    console.log(`Observing ${delay}ms global timeout.`);
    _GlobalTimeout = setTimeout(function() {
        throw new Error(`Global ${delay}ms timeout.`);
    }, delay);
    _GlobalTimeout.unref(); // ignore if there are no other events left
}

// The default 60s delay is meant to be long enough for most single tests.
Limit(60*1000);
