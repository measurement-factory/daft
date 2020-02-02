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

// the always-present leading part of PrettyMime() and PrettyBody() output
function _PrettyIntro(data) {
    return ` [${data.length} bytes]`;
}

export function PrettyMime(prefix, data) {
    let out = _PrettyIntro(data);

    if (!data.length)
        return out;

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
    out += ":\n\n" + text;
    return out;
}

// currently abusing PrettyMime() to format bodies, but that may change
export function PrettyBody(prefix, rawBody) {
    if (!Config.LogBodies)
        return _PrettyIntro(rawBody);
    return PrettyMime(prefix, rawBody);
}

// either PrettyAddress({host, port})
// or PrettyAddress(host, port)
export function PrettyAddress(...args) {
    let host;
    let port;
    if (args.length === 1) {
        if (args[0] === null)
            return "[null address]";
        host = args[0].host;
        port = args[0].port;
    } else {
        Must(args.length === 2);
        host = args[0];
        port = args[1];
    }

    let buf = "";

    if (host !== null && host !== undefined) {
        const ipv6 = host.indexOf(":") >= 0;
        if (ipv6)
            buf += "[";
        buf += host;
        if (ipv6)
            buf += "]";
    }

    if (port !== null && port !== undefined)
        buf += ':' + port;

    return buf;
}

// returns host address "family" string comparable
// with net.socket.address().family and net.server.address().family
export function HostFamilyString(host) {
    return host.indexOf(":") >= 0 ? "IPv6" : "IPv4";
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
export function SendBytes(socket, bytes, description) {
    Must(arguments.length === 3);
    // bytes must be a "binary" string for the binary conversion in write() to work;
    // for example, the following writes just one byte: write("\u2028", 'binary')
    Must(Buffer(bytes, "binary").toString("binary") === bytes);
    // Even though bytes are in binary format, we must specify "binary" explicitly
    // to avoid *default* conversion to utf8 (that will not work for a binary string!).
    socket.write(bytes, 'binary');
    console.log(DescribeSocketIo(socket, `is sending ${bytes.length} ${description} bytes to`));
}

export function ReceivedBytes(socket, bytes, description /*, logPrefix*/) {
    let toLog = DescribeSocketIo(socket, `received ${bytes.length} ${description} bytes from`);
    // difficult to prettify received bytes until the parser parses them
    console.log(toLog);
}

// Returns a length-bytes string, including the prefix.
// Besides the given prefix, the rest of the string is base-36 encoded.
// Does not guarantee uniqueness, even within the same process.
export function RandomText(prefix, length) {
    let buf = prefix;
    while (buf.length < length) {
        if (length < 32)
            buf += Math.random().toString(36).substr(2); // remove leading "0."
        else
            buf += "TeXt".repeat((length - buf.length)/4); // a faster branch?
    }
    return buf.substr(0, length); // remove any extra trailing characters
}

// returns the prefix and a random 10-characters length string
export function UniqueId(prefix) {
    // XXX: RandomString() does not guarantee uniqueness
    // unlike RandomText(), we always return the whole namespace/prefix
    return prefix + RandomText("", 10); // fixed length for ID consistency
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
