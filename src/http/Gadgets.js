/* Assorted HTTP functions. */

import assert from "assert";


export function IsHopByHop(name /*, header */) {
    const hopByHops = [ "connection", "keep-alive",
        "proxy-authenticate", "proxy-authorization", "te", "trailer",
        "transfer-encoding", "upgrade" ];

    // XXX: remove once request-line is supported
    if (name.match(/^\w+ +http:/))
        return true;

    // TODO: or is listed in header.value("Connection")
    return hopByHops.indexOf(name.toLowerCase()) >= 0;
}

export function IsEndToEnd(name, header) {
    return !IsHopByHop(name, header);
}


// XXX: Flip our assert*(sent, received) arguments to match "official" order in
// node::assert.equal(actual, expected). Check all node::assert*Equal() calls.

// assert if HTTP header field values differ
export function AssertForwardedHeaderFieldValue(sent, received, context) {
    assert.equal(sent.length, received.length, `same number of sent and received ${context} values`);
    for (let i = 0; i < sent.length; ++i) {
        // trim while comparing but show failed assert using raw values
        if (sent[i].trim() !== received[i].trim()) {
            assert.equal(sent[i], received[i], `same ${context} value #${i}`);
            assert(false, `unreachable code: ${sent[i]} is not ${received[i]}`);
        }
    }
}

// assert if the received message differs from the sent one too much
export function AssertForwardedMessage(sent, received, kind) {
    assert(sent && received);

    assert(sent.header && received.header);
    for (let field of sent.header.fields) {
        let name = field.name;
        if (!IsEndToEnd(name, sent))
            continue;
        assert(received.header.has(name), `received ${kind} has ${name}`);
        AssertForwardedHeaderFieldValue(
            sent.header.values(name),
            received.header.values(name),
            `${kind} ${name} field`);
    }

    assert.equal(!sent.body, !received.body);
    if (sent.body) {
        assert.equal(sent.body.length(), received.body.length());
        assert.equal(sent.body.whole(), received.body.whole());
    } else {
        assert.equal(null, received.body);
    }
}
