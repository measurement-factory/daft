/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";
import * as Config from "../misc/Config";

Config.Recognize([
    {
        option: "dut-shutdown-manner",
        type: "String",
        enum: [ 'gracefully', 'urgently', 'immediately' ],
        default: 'urgently',
        description: "how to shut DUT down (if needed)",
    },
]);

// Overlord Protocol request
export default class Command {
    constructor(name) {
        assert.equal(arguments.length, 1);

        assert(name.startsWith("/"));
        assert(name.length >= 2);
        this._name = name;

        this._config = null; // DUT configuration file

        // TODO: Do not send when not needed
        this._options = {
            "shutdown-manner": Config.DutShutdownManner,
        };
    }

    hasConfig() {
        return this._config !== null;
    }

    setConfig(config) {
        assert(config !== null);
        assert(config !== undefined);
        assert(!this.hasConfig());
        this._config = config; // may be zero-length
    }

    config() {
        assert(this.hasConfig());
        return this._config;
    }

    setOption(name, value) {
        assert.strictEqual(arguments.length, 2);
        assert.notStrictEqual(value, undefined);
        assert.notStrictEqual(value, null);
        assert(!(name in this._options));
        this._options[name] = value;
    }

    // adjusts httpOptions (i.e. http.request parameters) and
    // returns HTTP request body (or null if no body should be written)
    toHttp(httpOptions) {
        httpOptions.path = this._name;

        for (const name in this._options) {
            this._setHttpOption(httpOptions, name, this._options[name]);
        }

        if (!this.hasConfig())
            return null; // no HTTP request body

        const config = this.config();
        httpOptions.method = 'POST';
        // disables request chunking, among other things
        httpOptions.headers['Content-Length'] = config.length;
        return config;
    }

    // adds a unique HTTP header field
    _setHttpOption(httpOptions, name, value) {
        assert.equal(arguments.length, 3);
        const fieldName = `Overlord-${name}`;
        assert(!(fieldName in httpOptions.headers));
        httpOptions.headers[fieldName] = value;
        assert(fieldName in httpOptions.headers);
    }
}
