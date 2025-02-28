/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";

import * as GlobalConfig from "../misc/Config";
import * as Http from "../http/Gadgets";
import ServerAgent from "../server/Agent";
import HttpField from "../http/Field";

// TODO: Make cache_peer address(es) configurable
const FirstPort = 4130;

// e.g., cache_peer 127.0.0.1 parent 4128 0 no-query no-digest name=peer1
export class Config {
    constructor() {
        assert(!arguments.length);

        this._httpListeningHostPort = null;
        this._name = null;

        // The reason this peer has no cache_peer directives in squid.conf.
        // Managed by this.hide() and this.show().
        this._hidden = null;
    }

    httpListeningHostPort() {
        return this._httpListeningHostPort;
    }

    name() {
        assert.strictEqual(arguments.length, 0);
        // require prior finalizeWithIndex() or setName() call to simplify our callers
        assert(this._name !== null);
        return this._name;
    }

    setName(aName) {
        assert.strictEqual(arguments.length, 1);
        assert(this._name === null);
        this._name = aName;
        assert(this._name !== null);
    }

    hidden() {
        return this._hidden !== null;
    }

    // do not add a cache_peer directive to squid.conf
    hide(reason) {
        assert.strictEqual(arguments.length, 1);
        assert(reason);
        assert(!this.hidden()); // for debugging simplicity sake
        console.log(`hiding ${this}: ${reason}`);
        this._hidden = reason;
        assert(this.hidden());
    }

    // undo hide() effects
    show() {
        assert.strictEqual(arguments.length, 0);
        this._hidden = null; // may already be nil
        assert(!this.hidden());
    }

    finalizeWithIndex(idx) {
        assert(idx >= 0); // zero-based

        if (this._httpListeningHostPort === null) {
            // TODO: GlobalConfig.foo() wrappers should probably return clones to
            // avoid callers accidentally changing configuration values.
            this._httpListeningHostPort = Object.assign({}, GlobalConfig.proxyAuthority()); // shallow clone
            this._httpListeningHostPort.port = FirstPort + idx;
        }

        if (this._name === null)
            this.setName(`peer${idx+1}`);
    }

    // squid.conf configuration for this cache_peer
    directives() {
        let cfg = '';

        if (this.hidden()) {
            cfg += '# Disabled: ' + this._hidden + '\n';
            cfg += '# '; // comment-out cache_peer directive that we add below
        }

        cfg += `cache_peer` +
            ` ${this._httpListeningHostPort.host}` +
            ` parent` +
            ` ${this._httpListeningHostPort.port}` +
            ` 0` +
            ` no-query no-digest`;

        if (this._name !== null)
            cfg += ` name=${this._name}`;

        cfg += "\n";

        // Hack: To avoid changing rigid directives during smooth
        // reconfiguration tests, add these even when this.hidden().
        // See also: DutConfig::_cachePeersCfg().
        if (true) {
           const routingField = RoutingField(this);
            cfg += `
                acl targetsCachePeer_${this.name()} req_header ${routingField.name} ${routingField.value}
                cache_peer_access ${this.name()} allow targetsCachePeer_${this.name()}
            `;
        }

        return cfg;
    }

    toString() {
        if (this._name !== null)
            return `cache_peer/${this._name}`;

        if (this._httpListeningHostPort)
            return `cache_peer@${this._httpListeningHostPort.host}:${this._httpListeningHostPort.port}`;

        return "[cache_peer]";
    }

    // Help DUT to route the request to this cache peer.
    // See also: Attract()
    attract(request) {
        request.header.add(RoutingField(this));
    }
}

export class Agent extends ServerAgent {
    constructor(config) {
        assert.strictEqual(arguments.length, 1);

        super();

        assert(config);
        assert(!this._config);
        this._config = config;

        // TODO: Enhance Side::Agent.context generation to use class type name

        // expect a no-request TCP connection when the proxy is brought up and
        // at least one HTTP request after that
        this.keepListening(true);

        // TODO: This works because the first transaction ought to be a TCP
        // probe. Find a better way to supply the same header to all
        // ServerAgent transactions.
        const suffix = ` name=${this._config.name()}`;
        this.onSubsequentTransaction((x) => {
            x.response.header.add("Via", `1.1 ${this.context.id} (Daft cache_peer${suffix})`);
        });
    }

    config() {
        return this._config;
    }
}

// Squid should route a request with this header field to a cache_peer.
// Supplying cachePeerConfig routes the request to the given cache_peer.
// See also: Attract(), Config::attract(), and DutConfig::_cachePeersCfg().
export function RoutingField(cachePeerConfig = null) {
    let value = 'cache_peer';
    if (cachePeerConfig)
        value += ` name=${cachePeerConfig.name()}`;
    return new HttpField(Http.DaftFieldName("Routing"), value);
}

// help DUT to route the request to a cache peer
export function Attract(request) {
    request.header.add(RoutingField());
}
