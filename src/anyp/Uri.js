/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages HTTP URI. */

import assert from "assert";

import * as Config from "../misc/Config";
import * as Global from "../misc/Global";
import Authority from "./Authority";
import { Must, UniqueId } from "../misc/Gadgets";

export default class Uri {

    constructor() {
        this.scheme = null;
        this.authority = null;
        this.path = null;
        this.relative = false; // whether raw() lacks scheme://authority prefix

        // Whether the formatted URI is just the RFC 7230 section 5.3.3
        // `authority-form` (i.e. RFC 3986 section 3.2 `authority` excluding
        // any `userinfo` and its `@` delimiter).
        this._forceAuthorityForm = null;
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

    // whether the caller has restricted how the URI should be formatted
    finalizedForm() {
        assert(!arguments.length);
        return this._forceAuthorityForm !== null || this.relative;
    }

    // makes this.__authorityForm true
    forceAuthorityForm() {
        assert(!this.finalizedForm());
        this._forceAuthorityForm = true;
    }

    raw() {
        if (this._forceAuthorityForm) {
            assert(this.authority);
            assert(!this._relative);
            return this.authority.raw();
        }

        let image = "";
        if (!this.relative) {
            if (this.scheme !== null)
                image += this.scheme + "://";
            if (this.authority)
                image += this.authority.raw();
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

        const slashPos = rawBytes.indexOf('/');

        // A relative URI (i.e., relative-ref that starts with path-absolute)?
        if (slashPos === 0) {
            this.path = rawBytes;
            return;
        }

        // An authority-only URI (:port witout slashes anywhere)
        if (slashPos < 0 && rawBytes.indexOf(':') >= 0) {
            this.authority = Authority.Parse(rawBytes);
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
        if (!this.relative) {
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
