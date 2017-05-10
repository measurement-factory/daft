/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import * as Config from "./Config";

/* Assorted small handy global functions. */

export function Must(condition, ...args) {
    const extraInfo = args.length ? ' ' + args.join(' ') : "";
    if (!condition)
        throw new Error(`assertion failure: ${condition}${extraInfo}`);
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

// either PrettyAddress({host, port})
// or PrettyAddress(host, port)
export function PrettyAddress(...args) {
    let host;
    let port;
    if (args.length > 1) {
        host = args[0];
        port = args[1];
    } else {
        host = args[0].host;
        port = args[0].port;
    }

    let buf = "";

    if (host !== null) {
        const ipv6 = host.indexOf(":") >= 0;
        if (ipv6)
            buf += "[";
        buf += host;
        if (ipv6)
            buf += "]";
    }

    if (port !== null)
        buf += ':' + port;

    return buf;
}

// returns msg framed by local and remote socket addresses
export function DescribeSocketIo(socket, msg) {
    let buf = "";
    buf += PrettyAddress(socket.localAddress, socket.localPort);
    buf += " ";
    buf += msg;
    buf += " ";
    buf += PrettyAddress(socket.remoteAddress, socket.remotePort);
    return buf;
}

// returns a {host,port} structure with local socket addresses
export function LocalAddress(socket) {
    return {
        host: socket.localAddress,
        port: socket.localPort,
    };
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

    let toLog = DescribeSocketIo(socket, `sending ${bytes.length} ${description} bytes to`);

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
    let toLog = DescribeSocketIo(socket, `received ${bytes.length} ${description} bytes from`);
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
