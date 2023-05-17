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
    }

    httpListeningHostPort() {
        return this._httpListeningHostPort;
    }

    // name() {
    //     assert(this._name !== null); // require finalizeWithIndex()
    //     return this._name;
    // }

    finalizeWithIndex(idx) {
        assert(idx >= 0); // zero-based

        if (this._httpListeningHostPort === null) {
            // TODO: GlobalConfig.foo() wrappers should probably return clones to
            // avoid callers accidentally changing configuration values.
            this._httpListeningHostPort = Object.assign({}, GlobalConfig.proxyAuthority()); // shallow clone
            this._httpListeningHostPort.port = FirstPort + idx;
        }

        if (this._name === null)
            this._name = `peer${idx+1}`;
    }

    toString() {
        let cfg = `cache_peer` +
            ` ${this._httpListeningHostPort.host}` +
            ` parent` +
            ` ${this._httpListeningHostPort.port}` +
            ` 0` +
            ` no-query no-digest`;

        if (this._name !== null)
            cfg += ` name=${this._name}`;

        return cfg;
    }
}

export class Agent extends ServerAgent {
    constructor() {
        super(...arguments);

        // TODO: Enhance Side::Agent.context generation to use class type name

        // expect a no-request TCP connection when the proxy is brought up and
        // at least one HTTP request after that
        this.keepListening(true);
    }
}

export function RoutingField() {
    return new HttpField(Http.DaftFieldName("Routing"), "cache_peer");
}

// help DUT to route the request to a cache peer
export function Attract(request) {
    request.header.add(RoutingField());
}
