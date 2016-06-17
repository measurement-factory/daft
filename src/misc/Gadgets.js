/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import * as Config from "./Config";
import AddressPool from "./AddressPool";

/* Assorted small handy global functions. */

export function Must(condition, ...args) {
    if (!condition) {
        const message = args.length ? args.join(" ") : condition;
        throw new Error(`assertion failure: ${message}`);
    }
}

export function MustFitBits(number, bits, canBeNegative = false) {
    Must(!canBeNegative); // Implement if needed.
    Must(number >= 0);
    Must(bits <= 32); // Because bitwise operators used elsewhere convert to int32.
    const limit = 2 ** (bits + 1);
    Must(number < limit);
}

export function PrettyMime(prefix, data) {
    if (!data.length)
        return '';

    if (prefix === undefined || prefix === null)
        prefix = "";
    let text = data;
    text = text.replace(/\t/g, "\\t");
    text = text.replace(/\r/g, "\\r");
    text = text.replace(/\n/g, "\\n\n");
    text = text.replace(/[^\x20-\x7E\n]/g, '.');
    // XXX: encode non-printable and confusing characters such as \u2028
    // a bare ^ also matches the end of the string ending with \n!
    text = text.replace(/^./mg, "\t" + prefix + "$&");
    if (!text.endsWith("\n"))
        text += "\n";
    return "\n" + text;
}

// currently abusing PrettyMime() to format bodies, but that may change
export function PrettyBody(prefix, rawBody) {
    Must(Config.LogBodies); // may be relaxed later
    return rawBody.length ? PrettyMime(prefix, rawBody) : "";
}

// to avoid dumping "prettified" bytes on console, omit logPrefix
// TODO: Add our own socket wrapper to store logPrefix and ensure binary output?
export function SendBytes(socket, bytes, description, logPrefix) {
    // bytes must be a "binary" string for the binary conversion in write() to work;
    // for example, the following writes just one byte: write("\u2028", 'binary')
    Must(Buffer(bytes, "binary").toString("binary") === bytes);
    // Even though bytes are in binary format, we must specify "binary" explicitly
    // to avoid *default* conversion to utf8 (that will not work for a binary string!).
    socket.write(bytes, 'binary');

    let toLog = `sending ${bytes.length} ${description} bytes`;

    // add pretty bytes if needed
    if (bytes.length && logPrefix !== undefined && logPrefix !== null) {
        let detail = "";
        if (description.includes("header"))
            detail = PrettyMime(logPrefix, bytes);
        else if (Config.LogBodies && description.includes("body"))
            detail = PrettyBody(logPrefix, bytes);

        if (detail.length)
            toLog += ":\n" + detail;
    }
    console.log(toLog);
}

export function ReceivedBytes(socket, bytes, description /*, logPrefix*/) {
    let toLog = `received ${bytes.length} ${description} bytes`;
    if (socket) {
        const addr = socket.address();
        if (addr) {
            const ip = addr.family === "IPv6" ? `[${addr.address}]` : addr.address;
            toLog += ` from ${ip}:${addr.port}`;
        }
    }
    // difficult to prettify received bytes until the parser parses them
    console.log(toLog);
}

export function UniqueId(prefix) {
    return prefix + Math.floor(1.0 + 0xFFFFFFFF * Math.random()).toString(16);
}

export function DateSum(d1, d2) {
    return new Date(d1.valueOf() + d2.valueOf());
}

export function DateDiff(d1, d2) {
    return new Date(d1.valueOf() - d2.valueOf());
}

// Converts "public" host:port address to something we can listen on.
// Needs more work to detect IP addresses so that we can assume that everything
// else is domain name that we can serve by listening on all IPs.
export function FinalizeListeningAddress(addr) {
    return (addr.host === 'localhost') ?
        { host: '::', port: addr.port } : // listen on all available IPs
        { host: addr.host, port: addr.port };
}

let _AddressPool = new AddressPool();

export function ReserveListeningAddress(requestedAddr) {
    return requestedAddr ?
        _AddressPool.reserveGiven(requestedAddr) :
        _AddressPool.reserveAny();
}

export function ReleaseListeningAddress(addr) {
    _AddressPool.release(addr);
}

export function RawToHex(raw) {
    return Buffer(raw, "binary").toString("hex");
}
