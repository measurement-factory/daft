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
    "Cache-Status",
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

// assert if HTTP header field values differ
export function AssertForwardedHeaderFieldValue(sent, received, context) {
    assert.equal(received.length, sent.length, `same number of sent and received ${context} values`);
    for (let i = 0; i < sent.length; ++i) {
        // trim while comparing but show failed assert using raw values
        // TODO: See AssertForwardedHeaderField() regarding odd reporting here.
        if (sent[i].trim() !== received[i].trim()) {
            assert.equal(received[i], sent[i], `same ${context} value #${i}: ${sent[i]} is not ${received[i]}`);
            assert(false, `unreachable code: ${sent[i]} is not ${received[i]}`);
        }
    }
}

// assert if received HTTP header field value(s) do not include the sent value
export function AssertForwardedHeaderFieldValueAmongOthers(sent, received, context) {
    const trimmedSentValue = sent.trim();
    for (let i = 0; i < received.length; ++i) {
        // trim while comparing but show raw values in assert messages
        if (trimmedSentValue === received[i].trim())
            return;
    }
    throw new Error(`cannot find sent field value '${sent}' among ${received.length} received ${context} values`);
}

function AssertForwardedHeaderField(sent, received, field, kind) {
        const name = field.name;
        if (!IsEndToEnd(name, sent))
            return;
        if (IsControlledByProxy(name))
            return;
        if (IsControlledByCache(name))
            return;
        if (IsFraming(name) && !received.header.has(name))
            return;
        assert(received.header.has(name), `received ${kind} has ${name}`);
        // Both header.values(name) calls below will split monolithic values
        // like dates using default "," delimiter. However, the result should
        // work OK because individual value components (e.g., day of the week
        // name in an If-Modified-Since header) should still match. The only
        // known problem with this approach is that current diagnostics will
        // look odd (e.g., reporting day of the week difference instead of
        // whole-date difference). TODO: Recognize common monolithic headers?
        //
        // We could prevent splitting, but then we would assert when, say, a
        // Connection header values are split differently across sent and
        // received header fields.
        AssertForwardedHeaderFieldValue(
            sent.header.values(name),
            received.header.values(name),
            `${kind} ${name} field`);
}

function AssertForwardedBody(sent, received) {
    // An HTTP message sent without a body (e.g., EOF after the header) may be
    // received as an HTTP message with an empty body (e.g., consisting of
    // nothing but last-chunk) and vice versa because the two concepts are
    // interchangeable in most HTTP contexts. We ignore this kind of change.
    const sentBody = sent.body && sent.body.whole().length ? sent.body : null;
    const receivedBody = received.body && received.body.whole().length ? received.body : null;
    assert.equal(!receivedBody, !sentBody);
    if (sentBody) {
        const sentBodyWhole = sentBody.whole();
        const receivedBodyWhole = receivedBody.whole();
        assert.equal(receivedBodyWhole.length, sentBodyWhole.length);
        // assert.equal() detects but does not show the suffix difference of
        // long strings (e.g., 17MB bodies with different last few bytes)
        if (receivedBodyWhole !== sentBodyWhole) {
            for (var pos = 0; pos < receivedBodyWhole.length; ++pos) {
                if (receivedBodyWhole[pos] !== sentBodyWhole[pos]) {
                    console.log(`${sentBodyWhole.length}-byte bodies start to differ at offset ${pos}`);
                    assert.equal(receivedBodyWhole.substr(pos), sentBodyWhole.substr(pos));
                    assert(false); // unreachable
                }
            }
            assert(false); // unreachable
        }
    } else {
        assert.equal(receivedBody, null);
    }
}

// assert if the received message differs from the sent one too much
export function AssertForwardedMessage(sent, received, kind) {
    assert(sent);
    assert(received);

    assert.equal(!received.startLine, !sent.startLine);
    // TODO: When both exist, let parts compare themselves. The rest can be
    // handled by a generic comparison code.
    // XXX: If startLine is a StatusLine, then codeString_ will be defined.
    if (sent.startLine && sent.startLine.codeString_ !== undefined) {
        assert.equal(received.startLine.hasCode(), sent.startLine.hasCode());
        if (sent.startLine.hasCode()) {
            // including (undefined === undefined) for two malformed values
            // we can make this more complex if we need to check non-integer codes
            assert.equal(
                received.startLine.codeInteger(),
                sent.startLine.codeInteger(),
                "received status code matches the sent one");
        }
    }

    assert(sent.header && received.header);
    for (let field of sent.header.fields) {
        AssertForwardedHeaderField(sent, received, field, kind);
    }

    AssertForwardedBody(sent, received);
}

// assert if the received hit response differs from the cached one too much,
// after the cached one was refreshed by a 304 server response
export function AssertRefreshHit(cachedStale, fresh304, freshReceived) {
    assert.strictEqual(fresh304.startLine.codeInteger(), 304, "server responded with 304");
    assert(freshReceived.startLine.hasCode(), "client received a response");
    assert.strictEqual(freshReceived.startLine.codeInteger(), cachedStale.startLine.codeInteger(), "received response status code matches the cached one");

    assert(cachedStale.header);
    assert(fresh304.header);
    assert(freshReceived.header);
    for (let field of fresh304.header.fields) {
        AssertForwardedHeaderField(fresh304, freshReceived, field, "response");
    }

    for (let field of cachedStale.header.fields) {
        if (fresh304.header.has(field.name))
            continue; // should be overwritten by 304 headers (that we checked above)
        AssertForwardedHeaderField(cachedStale, freshReceived, field, "response");
    }

    AssertForwardedBody(cachedStale, freshReceived, "response");
}
