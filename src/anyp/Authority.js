/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages HTTP URI Authority component and similar "addresses".

   Per RFC 3986: authority = [ userinfo "@" ] host [ ":" port ]
   but the userinfo part is deprecated and currently unsupported.

   In raw authority strings, IPv6 hosts are bracketed: [::1]:8080.
 */

import { Must } from "../misc/Gadgets";
import * as Gadgets from "../misc/Gadgets";


export default class Authority {

    constructor(fields = {}) {
        this.host = fields.host || null;
        this._port = fields.port || null;
    }

    clone() {
        let dupe = new Authority();
        dupe.host = this.host;
        dupe._port = this._port;
        return dupe;
    }

    toString() {
        return this.raw();
    }

    // returns anonymous { host, port } structure
    toHostPort(defaultPort = null) {
        Must(this.host !== null);
        Must(this._port !== null || defaultPort !== null);
        return {
            host: this.host,
            port: (this.hasPort() ? this.port : defaultPort),
        };
    }

    // creates Authority from an anonymous { host, port } structure
    static FromHostPort(hostPort) {
        Must(hostPort);
        let authority = new Authority();
        authority.host = hostPort.host;
        authority._port = hostPort.port;
        return authority;
    }

    hasPort() {
        return this._port !== null;
    }

    // Use Uri::port() if you want to get scheme-based default ports!
    // Call only if you actually need an integer port value.
    // Throws if port is unknown or malformed.
    get port() {
        Must(this.hasPort());
        // A weak check that the value is usable as a network port.
        // Or should we do what Header::contentLength() does?
        const rawPort = this._port;
        Must(rawPort >= 0, `${rawPort} >= 0`);
        Must(rawPort <= 65535, `${rawPort} <= 65535`);
        return Number.parseInt(rawPort, 10);
    }

    set port(value) {
        Must(value !== undefined);
        this._port = value; // may be null
    }

    raw() {
        return Gadgets.PrettyAddress(this.host, this._port);
    }

    static Parse(rawBytes) {
        let authority = new Authority();

        // required IPv4, domain name, or [IPv6] followed by optional :port
        const reAddress = /^(\[?[^[/?#]+?\]?)(:\d*)?$/;
        const reMatch = reAddress.exec(rawBytes);
        Must(reMatch);

        authority.host = reMatch[1];

        // optional port
        if (reMatch[2] !== undefined)
            authority._port = reMatch[2].substring(1);

        authority._checkImport(rawBytes.indexOf("[") >= 0);
        return authority;
    }

    _isIpv6() {
        return this.host.indexOf(":") >= 0;
    }

    // we use ":" in imported IPv6 addresses to detect IPv6 family
    _checkImport(wasIpv6) {
        Must(wasIpv6 === this._isIpv6());
    }
}
