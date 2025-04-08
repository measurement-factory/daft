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

        // whether this cache peer would like to receive all or none requests
        this._wildcardAttraction = null;
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

        const visibilityMarker = '<shown_or_hidden> ';

        if (this.hidden())
            cfg += '# Disabled: ' + this._hidden + '\n';

        cfg += visibilityMarker + "cache_peer " +
            this._httpListeningHostPort.host +
            " parent " +
            this._httpListeningHostPort.port +
            " 0 no-query no-digest";

        if (this._name !== null)
            cfg += ` name=${this._name}`;

        cfg += "\n";

        const aclNameForTargetingThisPeer = `targetsCachePeer_${this.name()}`;
        // Hack: To avoid changing rigid directives during smooth
        // reconfiguration tests, add these acl directives even when
        // this.hidden(). See also: DutConfig::_cachePeersCfg().
        if (true)
            cfg += "    " + RoutingAclDirective(aclNameForTargetingThisPeer, this) + "\n";

        const rule = this._wildcardAttraction === null ? `allow ${aclNameForTargetingThisPeer}` : this._wildcardAttraction;
        cfg += visibilityMarker + "    " + "cache_peer_access " + this.name() + ' ' + rule + "\n";

        return cfg.replaceAll((visibilityMarker), (this.hidden() ? "# " : ""));
    }

    toString() {
        if (this._name !== null)
            return `cache_peer/${this._name}`;

        if (this._httpListeningHostPort)
            return `cache_peer@${this._httpListeningHostPort.host}:${this._httpListeningHostPort.port}`;

        return "[cache_peer]";
    }

    // Help DUT to route the given request to this cache peer by modifying the
    // request to match cache_peer_access rules that we always add for a
    // cache_peer. See also: becomeAttractedTo() and Attract()
    attract(request) {
        request.header.add(RoutingField(this));
    }

    // Help DUT to route all requests to this cache peer by adding a
    // cache_peer_access rule that would match any request. This method
    // "supersedes" attract() -- attract() has no routing impact if this
    // method is also called.
    becomeAttractedToAll() {
        assert.strictEqual(arguments.length, 0);
        console.log(`attempting to route all cache_peer requests to ${this}`);
        assert(!this._wildcardAttraction);
        this._wildcardAttraction = "allow all";
    }

    // Help DUT to route all requests to this cache peer by adding a
    // cache_peer_access rule that would match any request. This method
    // "supersedes" attract() -- attract() has no routing impact if this
    // method is also called.
    becomeAttractedToNone() {
        assert.strictEqual(arguments.length, 0);
        console.log(`attempting to route all cache_peer requests away from ${this}`);
        assert(!this._wildcardAttraction);
        this._wildcardAttraction = "deny all";
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
    else
        value += ` any`;
    return new HttpField(Http.DaftFieldName("Routing"), value);
}

// Help DUT to route the request to a cache peer. This method modifies the
// request to become attracted to cache_peers (rather than modifying
// cache_peers to attract the given request).
// See also: CachePeer::becomeAttractedTo()
export function Attract(request) {
    request.header.add(RoutingField());
}

// A regex matching the given header field value. Uses squid.conf syntax.
function _FieldToRegex(value) {
    // Squid ACLRegexData::parse() treats space as an ACL parameter delimiter.
    // We also need to escape regex-significant characters inside the value.
    return '^' + value.replace(/[^\w]/g, '\\$&') + '$';
}

// Returns a squid.conf acl directive that matches these received requests:
// * If cachePeer is given, matches requests targeting that specific cachePeer
//   and "route me through any cache_peer" requests.
// * If cachecPeer was not given, matches requests targeting any cache_peer.
//
// TODO: Should this ACL also match requests that do not specify any routing
// preferences (i.e. "go direct or route me through any cache_peer" requests?
//
// The return value has no trailing new line to ease integration with
// formatted `multi-line cfg strings`.
export function RoutingAclDirective(name, cachePeer = undefined) {
    const headerField = RoutingField(cachePeer);
    let cfg = `acl ${name} req_header ${headerField.name}`;
    if (cachePeer) {
        cfg += ` ${_FieldToRegex(headerField.value)}`;
        // Also match requests that are earmarked for a cache_peer but do not
        // target a specific one (e.g., this happens after calling Attract()).
        const headerFieldWildcard = RoutingField();
        cfg += ` ${_FieldToRegex(headerFieldWildcard.value)}`;
    } else {
        // headerField.value is "cache_peer any", but we also want to match
        // any request targeting a specific cache_peer
        cfg += ` ^cache_peer`; // keep in sync with RoutingField()
    }
    return cfg;
}
