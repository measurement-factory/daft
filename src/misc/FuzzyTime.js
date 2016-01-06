/* imprecise moments in time frequently used for testing */

import * as Gadgets from "./Gadgets";

export let ShortRange = new Date(3*1000); // 3 seconds
export let MediumRange = new Date(24*60*60*1000); // 1 day
export let LongRange = new Date(365*24*60*60*1000); // ~1 year

export const Start = new Date();

export function DistantPast() {
    return Gadgets.DateDiff(Start, LongRange);
}

export function DistantFuture() {
    return Gadgets.DateSum(Start, LongRange);
}

export function Soon() {
    return Gadgets.DateSum(Start, MediumRange);
}

// TODO: support "freezing" current time upon test case demand
export function Now() {
    return new Date();
}
