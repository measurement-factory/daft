function rawStatusLine(statusLine) {
    return [
        statusLine.protocol,
        statusLine.protocolDelimiter,
        statusLine.statusCode,
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

function rawHeader(header) {
    if (header._raw !== null) return header._raw;

    function rawField(field) {
        return field.name + field.separator +
            field.value + field.terminator;
    }

    return header.fields.map(rawField).join("");
}

export function requestPrefix(message) {
    return rawRequestLine(message.startLine) +
        rawHeader(message.header) +
        message.headerDelimiter;
}

export function responsePrefix(message) {
    return rawStatusLine(message.startLine) +
        rawHeader(message.header) +
        message.headerDelimiter;
}
