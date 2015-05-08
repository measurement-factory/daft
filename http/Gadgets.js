/* Assorted HTTP functions. */

export function IsHopByHop(name, header) {
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
