/* Manages HTTP URI. */

import * as Global from "../misc/Global";
import * as Config from "../misc/Config";
import { Must, UniqueId } from "../misc/Gadgets";

export default class Uri {

    constructor() {
        this.scheme = null;
        this.host = null;
        this._port = null;
        this._rest = null;
    }

    clone() {
        let dupe = new Uri();
        dupe.scheme = this.scheme;
        dupe.host = this.host;
        dupe._port = this._port;
        dupe._rest = this._rest;
        return dupe;
    }

    toString() {
        return this.raw();
    }

    // call only if you actually need an integer port value;
    // throws if port is known but malformed
    // throws if port is unknown and cannot be computed using scheme
    get port() {
        if (this._port === null)
            return Global.DefaultSchemePort(this.scheme);

        // A weak check that the value is usable as a network port.
        // Or should we do what Header::contentLength() does?
        Must(0 <= this._port && this._port <= 65535);
        return Number.parseInt(this._port, 10);
    }

    set port(value) {
        Must(value !== undefined);
        this._port = value; // may be null
    }

    isAbsolute() {
        return this.scheme !== null;
    }

    address() {
        if (this._host === null)
            return null;

        return {
            host: this.host,
            port: this.port
        };
    }

    raw() {
        let image = "";
        if (this.scheme !== null)
            image += this.scheme + "://";
        if (this.host !== null)
            image += this.host;
        if (this._port !== null)
            image += ":" + this._port;
        if (this._rest !== null)
            image += this._rest;
        return image;
    }

    makeRelative() {
        this.scheme = null;
        this.host = null;
        this.port = null;
    }

    static Parse(rawBytes) {
        let uri = new Uri();
        uri._parse(rawBytes);
        return uri;
    }

    _parse(rawBytes) {
        // see RFC 3986 for ABNF definitions

        if (!rawBytes.length)
            throw new Error("No support for empty URIs");

        if (rawBytes === '*')
            throw new Error("No support for * URIs yet");

        // A relative URI (i.e., relative-ref that starts with path-absolute)?
        if (rawBytes[0] === "/") {
            this._rest = rawBytes;
            return;
        }

        // Assume it is an absolute-URI
        let urlRe = /^(\S+?:\/\/)([^\/\?:#]+)(:\d*)?(\S*)$/;
        let urlMatch = urlRe.exec(rawBytes);
        if (!urlMatch)
            throw new Error("Unsupported or malformed URI: " + rawBytes);

        this.scheme = urlMatch[1].substring(0, urlMatch[1].length - 3);
        this.host = urlMatch[2];
        if (urlMatch[3] !== undefined)
            this._port = urlMatch[3].substring(1);
        if (urlMatch[4] !== undefined)
            this._rest = urlMatch[4];
    }

    finalize() {
        if (this.scheme === null)
            this.scheme = "http";
        if (this.host === null)
            this.host = Config.OriginAuthority.host;
        if (this._port === null)
            this._port = Config.OriginAuthority.port; // TODO: Omit default.
        if (this._rest === null)
            this._rest = "/";
    }
}

export function Unique() {
    let uri = new Uri();
    uri._rest = UniqueId("/path");
    uri.host = Config.OriginAuthority.host;
    uri.port = Config.OriginAuthority.port;
    return uri;
}
