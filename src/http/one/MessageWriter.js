/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import IdentityEncoder from "./IdentityEncoder";
import ChunkedEncoder from "./ChunkedEncoder";

function rawStatusLine(statusLine) {
    return [
        statusLine.protocol,
        statusLine.protocolDelimiter,
        (statusLine.hasCode() ? statusLine.codeString() : null),
        statusLine.statusDelimiter,
        statusLine.reasonPhrase,
        statusLine.terminator
    ].filter(item => item !== null).join("");
}

function rawRequestLine(requestLine) {
    return [
        requestLine.method,
        requestLine.methodDelimiter,
        requestLine.uri.raw(),
        requestLine.uriDelimiter,
        requestLine.protocol,
        requestLine.terminator
    ].filter(item => item !== null).join("");
}

export function requestPrefix(message) {
    if (message.startLine.protocol === "HTTP/0.9")
        return "";

    return rawRequestLine(message.startLine) +
        message.header.raw() +
        message.headerDelimiter;
}

export function responsePrefix(message) {
    if (message.startLine.protocol === "HTTP/0.9")
        return "";

    return rawStatusLine(message.startLine) +
        message.header.raw() +
        message.headerDelimiter;
}

export function bodyEncoder(message) {
    return message.header.chunked() ?
        new ChunkedEncoder() : new IdentityEncoder();
}

// does the recipient needs EOF to tell where the response ends?
export function forcesEof(request, response) {
    return request.startLine.method !== "HEAD" &&
        response.body &&
        !response.header.chunked() &&
        !response.header.has("Content-Length");
}
