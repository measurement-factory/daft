function packStatusLine(statusLine) {
    return [
        statusLine.protocol,
        statusLine.protocolDelimiter,
        statusLine.statusCode,
        statusLine.statusDelimiter,
        statusLine.reasonPhrase,
        statusLine.terminator
    ].filter(item => item !== null).join("");
}

function packRequestLine(requestLine) {
    return [
        requestLine.method,
        requestLine.methodDelimiter,
        requestLine.uri.raw(),
        requestLine.uriDelimiter,
        requestLine.protocol,
        requestLine.terminator
    ].filter(item => item !== null).join("");
}

function packHeader(header) {
    if (header._raw !== null)
        return header._raw;

    function packField(field) {
        return field.name + field.separator +
            field.value + field.terminator;
    }

    return header.fields.map(packField).join("");
}

export function requestPrefix(message) {
    if (message.startLine.protocol === "HTTP/0.9")
        return "";

    return packRequestLine(message.startLine) +
        packHeader(message.header) +
        message.headerDelimiter;
}

export function responsePrefix(message) {
    if (message.startLine.protocol === "HTTP/0.9")
        return "";

    return packStatusLine(message.startLine) +
        packHeader(message.header) +
        message.headerDelimiter;
}
