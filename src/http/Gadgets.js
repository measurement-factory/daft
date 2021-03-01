/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Assorted HTTP functions. */

import assert from "assert";


const _HopByHopHeaderNames = [
    "Connection",
    "Keep-Alive",
    "Proxy-Authenticate",
    "Proxy-Authorization",
    "TE",
    "Trailer",
    "Transfer-Encoding",
    "Upgrade"
].map(name => name.toLowerCase());

// Headers that a proxy may remove/add to control message framing
// TODO: EOF-based framing should be sanctioned by the test case!
const _FramingHeaderNames = [
    "Content-Length",
    "Transfer-Encoding" // also in _HopByHopHeaderNames
].map(name => name.toLowerCase());

// Message headers that may differ because of legitimate proxy actions.
const _ControlledByProxyHeaderNames = [
    "Via",
    "X-Proxy-Worker-ID"
].map(name => name.toLowerCase());

// Response headers that may differ between a cache miss sent to the
// cache and the later corresponding cache hit received from the cache.
// TODO: Only enable for cases where caching is allowed/expected?
// TODO: Make configurable so that test cases that alter stored cache
// headers can exclude headers like
// "X-Daft-Response-Tag",
// "X-Daft-Response-ID",
// "Changing-Field",
// "New-Field"
const _ControlledByCacheHeaderNames = [
    "Age",
].map(name => name.toLowerCase());

export function IsHopByHop(name /*, header */) {
    // XXX: remove once request-line is supported
    if (name.match(/^\w+ +http:/))
        return true;

    // TODO: or is listed in header.values("Connection")
    return _HopByHopHeaderNames.indexOf(name.toLowerCase()) >= 0;
}

export function IsEndToEnd(name, header) {
    return !IsHopByHop(name, header);
}

function IsFraming(name) {
    return _FramingHeaderNames.indexOf(name.toLowerCase()) >= 0;
}

function IsControlledByProxy(name) {
    return _ControlledByProxyHeaderNames.indexOf(name.toLowerCase()) >= 0;
}

function IsControlledByCache(name) {
    return _ControlledByCacheHeaderNames.indexOf(name.toLowerCase()) >= 0;
}

export function DaftFieldName(suffix) {
    return `X-Daft-${suffix}`;
}

// XXX: Flip our assert*(sent, received) arguments to match "official" order in
// node::assert.equal(actual, expected). Check all node::assert*Equal() calls.

// assert if HTTP header field values differ
export function AssertForwardedHeaderFieldValue(sent, received, context) {
    assert.equal(sent.length, received.length, `same number of sent and received ${context} values`);
    for (let i = 0; i < sent.length; ++i) {
        // trim while comparing but show failed assert using raw values
        if (sent[i].trim() !== received[i].trim()) {
            assert.equal(sent[i], received[i], `same ${context} value #${i}: ${sent[i]} is not ${received[i]}`);
            assert(false, `unreachable code: ${sent[i]} is not ${received[i]}`);
        }
    }
}

// assert if the received message differs from the sent one too much
export function AssertForwardedMessage(sent, received, kind) {
    assert(sent);
    assert(received);

    assert.equal(!sent.startLine, !received.startLine);
    // TODO: When both exist, let parts compare themselves. The rest can be
    // handled by a generic comparison code.
    // XXX: If startLine is a StatusLine, then codeString_ will be defined.
    if (sent.startLine && sent.startLine.codeString_ !== undefined) {
        assert.equal(sent.startLine.hasCode(), received.startLine.hasCode());
        if (sent.startLine.hasCode()) {
            // including (undefined === undefined) for two malformed values
            // we can make this more complex if we need to check non-integer codes
            assert.equal(sent.startLine.codeInteger(), received.startLine.codeInteger(),
                "received status code matches the sent one");
        }
    }

    assert(sent.header && received.header);
    for (let field of sent.header.fields) {
        let name = field.name;
        if (!IsEndToEnd(name, sent))
            continue;
        if (IsControlledByProxy(name))
            continue;
        if (IsControlledByCache(name))
            continue;
        if (IsFraming(name) && !received.header.has(name))
            continue;
        assert(received.header.has(name), `received ${kind} has ${name}`);
        AssertForwardedHeaderFieldValue(
            sent.header.values(name),
            received.header.values(name),
            `${kind} ${name} field`);
    }

    assert.equal(!sent.body, !received.body);
    if (sent.body) {
        assert.equal(sent.body.whole().length, received.body.whole().length);
        // TODO: assert.equal() detects but does not show the suffix difference
        // of long strings (e.g., 17MB bodies with different last few bytes).
        assert.equal(sent.body.whole(), received.body.whole());
    } else {
        assert.equal(null, received.body);
    }
}
