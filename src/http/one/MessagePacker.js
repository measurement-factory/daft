function packStatusLine(statusLine) {
    return [
        statusLine.httpVersion,
        statusLine.versionDelimiter,
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
        requestLine._rest,
        requestLine.terminator
    ].filter(item => item !== null).join("");
}

function packHeader(header) {
    if (header._raw !== null) return header._raw;

    function packField(field) {
        return field.name + field.separator +
            field.value + field.terminator;
    }

    return header.fields.map(packField).join("");
}

export function requestPrefix(message) {
    return packRequestLine(message.startLine) +
        packHeader(message.header) +
        message.headerDelimiter;
}

export function responsePrefix(message) {
    return packStatusLine(message.startLine) +
        packHeader(message.header) +
        message.headerDelimiter;
}
