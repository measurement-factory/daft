/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import IdentityEncoder from "./IdentityEncoder";
import ChunkedEncoder from "./ChunkedEncoder";

export function requestPrefix(message) {
    if (message.startLine.protocol === "HTTP/0.9")
        return "";

    return message.startLine.raw() +
        message.header.raw() +
        message.headerDelimiter;
}

export function responsePrefix(message) {
    if (message.startLine.protocol === "HTTP/0.9")
        return "";

    return message.startLine.raw() +
        message.header.raw() +
        message.headerDelimiter;
}

export function bodyEncoder(message) {
    return message.header.chunked() ?
        new ChunkedEncoder(message) : new IdentityEncoder();
}

// does the recipient needs EOF to tell where the response ends?
export function forcesEof(request, response) {
    return request.startLine.method !== "HEAD" &&
        response.body &&
        !response.header.chunked() &&
        !response.header.has("Content-Length");
}
