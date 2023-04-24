/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages HTTP URI. */

import * as Global from "../misc/Global";
import * as Config from "../misc/Config";
import Authority from "./Authority";
import { Must, UniqueId } from "../misc/Gadgets";

export default class Uri {

    constructor() {
        this.scheme = null;
        this.authority = null;
        this.path = null;
        this.relative = false; // whether raw() lacks scheme://authority prefix
    }

    clone() {
        let dupe = new Uri();
        dupe.scheme = this.scheme;
        dupe.authority = this.authority ? this.authority.clone() : null;
        dupe.path = this.path;
        dupe.relative = this.relative;
        return dupe;
    }

    toString() {
        return this.raw();
    }

    // makes a unique (XXX: rename) URN URI (RFC 8141)
    makeUrn() {
        // XXX: If we set this.scheme and keep this.relative false, then
        // finalize() will add default authority. Need empty authority?!
        this.scheme = "urn";
        this.authority = null;
        this.path = "localhost:a123,z456" + UniqueId("/");
        this.relative = true;
    }

    // call only if you actually need an integer port value;
    // throws if port is known but malformed
    // throws if port is unknown and cannot be computed using scheme
    get port() {
        return (this.authority && this.authority.hasPort()) ?
            this.authority.port :
            Global.DefaultSchemePort(this.scheme);
    }

    set port(value) {
        Must(value !== undefined);
        if (!this.authority)
            this.authority = new Authority();
        this.authority.port = value; // may be null
    }

    get address() {
        return this.authority ?
            this.authority.toHostPort(this._defaultPortOrNull()) : null;
    }

    set address(value) {
        this.authority = Authority.FromHostPort(value);
    }

    raw() {
        let image = "";
        if (this.scheme !== null)
            image += this.scheme + ":";
        if (!this.relative) {
            if (this.authority)
                image += "//" + this.authority.raw();
        }
        if (this.path !== null)
            image += this.path;
        return image;
    }

    makeUnique(prefix = "/path-") {
        let uid = UniqueId(prefix);
        if (this.hasPath())
            this.path += uid;
        else
            this.path = uid;
    }

    hasPath() {
        return this.path !== null;
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
            this.path = rawBytes;
            return;
        }

        // Assume it is an absolute-URI
        let urlRe = /^(\S+?:\/\/)([^/?#]+)(\S*)$/;
        let urlMatch = urlRe.exec(rawBytes);
        if (!urlMatch)
            throw new Error("Unsupported or malformed URI: " + rawBytes);

        this.scheme = urlMatch[1].substring(0, urlMatch[1].length - 3);
        this.authority = Authority.Parse(urlMatch[2]);

        if (urlMatch[3] !== undefined)
            this.path = urlMatch[3];
    }

    finalize() {
        // XXX: We set these fields even for relative URIs.
        // See Client::Transaction::finalizeMessage()
        if (true || !this.relative) {
            if (this.scheme === null)
                this.scheme = "http";

            if (this.authority === null)
                this.authority = Authority.FromHostPort(Config.OriginAuthority);
            else if (!this.authority.hasPort())
                this.authority.port = Config.OriginAuthority.port; // TODO: Omit default.
        }
        if (!this.hasPath()) {
            this.makeUnique();
        }
    }

    // returns default port (if we can compute one) or null (otherwise)
    _defaultPortOrNull() {
        return !this.scheme ? null : Global.DefaultSchemePort(this.scheme);
    }
}
