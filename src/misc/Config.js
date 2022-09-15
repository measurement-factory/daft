/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Global configuration. */

/* all other globals are in Global.js */

import assert from "assert";
import util from "util";

/*
 * *ListeningAddresses below are used for both listening and connecting.
 * Nodejs default listening behavior is version-specific. We use an
 * explicit '::' address in hope to force the latest "undefined" behavior:
 * - When listening, "undefined" host means all local addresses
 *   (IPv6 if possible or IPv4 otherwise).
 * - When connecting, "undefined" host means "localhost".
 */

// Used to listen for proxy requests and open connections to the proxy.
export const ProxyListeningAddress = { // TODO: Make configurable
    host: '::',
    port: 3128
};

// Used to form request URLs (set via --origin-authority).
export const OriginAuthority = null;

export const HttpStatusCodes = {
    400: 'Bad Request',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
};

export const ProxyingForward = "forward";
export const ProxyingInReverse = "reverse";
export const ProxyingMode = ProxyingForward; // TODO: Make configurable

export const ProxySignature = "DaftProxy/1.0";

export function isForwardProxy() {
    return ProxyingMode === ProxyingForward;
}

export function isReverseProxy() {
    return ProxyingMode === ProxyingInReverse;
}

// TODO: Make configurable from the command-line.
export const LogBodies = undefined; // whether to log bodies on console

// smallest non-empty body that is large enough to be different from other
// default-size randomly-generated bodies (within one test)
export function DefaultBodySize() {
    return 15;
}

// smallest body that triggers DUT use of multiple I/O pages, disk slots, etc.
export function LargeBodySize() {
    // estimated largest DUT page/slot/etc. size
    const blockSize = 32*1024;
    // avoid KB-aligned sizes to make tests more "general" by default
    const extras = 100;
    return 2*blockSize + extras;
}

// whether to log overall body handling progress
export function logBodyProgress(bodySize) {
    // by default, report progress except for huge bodies
    if (LogBodies === undefined) {
        const suspectedSize = bodySize === undefined ? Config.BodySize : bodySize;
        return suspectedSize <= 1*1024*1024;
    }
    return LogBodies > 0;
}

// whether to log body contents
export function logBodyContents(bodySize) {
    // by default, log contents of small non-default bodies only
    if (LogBodies === undefined) {
        const suspectedSize = bodySize === undefined ? Config.BodySize : bodySize;
        return suspectedSize <= 100 && suspectedSize != DefaultBodySize();
    }
    return LogBodies > 0;
}

/* Command-line options handling */

function _DefaultOriginAuthorityPort()
{
    return (!process.getuid || process.getuid()) ? 8080 : 80; // 80 when root
}

// accumulates recognized CLI options
let _CliOptions = [
    {
        option: "help",
        type: "Boolean",
        overrideRequired: true,
        description: "show this help message",
    },
    {
        option: "origin-authority",
        type: "{host: String, port: Number}",
        default: `{host: localhost, port: ${_DefaultOriginAuthorityPort()}}`,
        description: "ultimate request destination",
    },
    {
        option: "body-size",
        type: "Number",
        default: DefaultBodySize().toString(),
        description: "message body size (bytes)",
    },
    {
        option: "prefix-size",
        type: "Number",
        default: 0, // unspecified
        description: "minimum message prefix size (bytes)",
    },
    {
        option: "range",
        type: "String",
        default: '', // unspecified
        description: "the range of the Range request in the 'firstByte-lastByte' format",
    },
];

// a camelName:is-explicit map configured by Finalize()
let _RecognizedOptions;

function _assertRecognition(camelName) {
    if (!(camelName in _RecognizedOptions))
        throw new Error("Unrecognized configuration option: " + camelName);
}

// accept supplied options as user-configurable via CLI
export function Recognize(options) {
    _CliOptions = _CliOptions.concat(options);
    // _RecognizedOptions update is delayed until Finalize()
}

// whether the given option was set on the command-line
export function isExplicitlySet(camelName) {
    _assertRecognition(camelName);
    return _RecognizedOptions[camelName];
}

export function RecognizedOptionNames() {
    assert(_RecognizedOptions); // Finalized() has been called
    return Object.keys(_RecognizedOptions);
}

// configuration options with dynamically-generated getters
// This class separates configurable options from the rest of Config while
// providing safe(r) by-name access to individual options. Eventually, it may
// absorb the rest of Config and become Config.
class ActiveOptions {
    // accepts a camelName:value map
    constructor(defaults) {
        assert(defaults); // but may be empty
        // we assume that shallow copy is safe for all configurable options
        this._raw = {...defaults}; // shallow
    }

    clone() {
        assert(this._raw);
        return new ActiveOptions(this._raw);
    }

    // camelNames
    names() {
        return Object.keys(this._raw);
    }

    /* safe getter methods are dynamically added by Finalize() */

    // dangerous access using a string-based camelName; meant for meta-code
    // such as configuration generators (that do not use hard-coded strings)
    value(camelName) {
        _assertRecognition(camelName);
        assert(camelName in this._raw);
        return this._raw[camelName];
    }

    // dangerous access using a string-based camelName; meant for meta-code
    // such as configuration generators (that do not use hard-coded strings)
    resetOption(name, value) {
        _assertRecognition(name);
        assert.notStrictEqual(value, undefined);
        // name is in ActiveOptions.prototype iff the option has a default value
        // name may or may not be in this._raw, depending on defaults, history
        this._raw[name] = value;
    }

    // prints (not) explicitly configured configuration options
    _sprintGroup(title, explicits) {
        const filter = key => isExplicitlySet(key) === explicits;
        const keys = Object.keys(this._raw).filter(filter).sort();
        if (!keys.length)
            return "";
        let image = util.format("    %s:\n", title);
        for (const key of keys)
            image += util.format("        %s: %O\n", key, this._raw[key]);
        return image;
    }

    toString() {
        let image = "";
        image += this._sprintGroup("explicitly configured options", true);
        image += this._sprintGroup("options with generated and default values", false);
        return image;
    }
}

// current configuration options
let _ActiveOptions = null;

// (re)sets the legacy Config.Key value, including defaults and generated ones
function _force(key, value) {
    _assertRecognition(key);
    const uppedKey = key.charAt(0).toUpperCase() + key.slice(1);
    module.exports[uppedKey] = value; // legacy Config.Key access
}

// change a few global options, leaving the rest as is
// Options are a camelName:value map. TODO: Replace with (camelName, value).
export function use(options) {
    assert(options instanceof Object);
    assert(!(options instanceof ActiveOptions));
    assert(_ActiveOptions);
    for (const key of Object.keys(options)) {
        _force(key, options[key]);
        _ActiveOptions.resetOption(key, options[key]);
    }
}

// change all global options to the given ones
export function reset(newOptions) {
    assert(newOptions instanceof ActiveOptions);
    _ActiveOptions = newOptions;
    for (const key of newOptions.names()) {
        _force(key, newOptions.value(key));
    }
}

// Make all explicitly set on the command line options and all option defaults
// available as Config.option() (and legacy Config.Option). Also records which
// options were configured explicitly (so that config generators skip them).
function _Import(options, optionsWithoutDefaults) {
    assert(!_RecognizedOptions);
    _RecognizedOptions = {};
    for (const option of _CliOptions) {
        const dashName = option.option;
        const camelName = dashName.replace(/-(.)/gi, m => m[1].toUpperCase());
        _RecognizedOptions[camelName] = camelName in optionsWithoutDefaults;

        // create ActiveOptions.camelName()
        ActiveOptions.prototype[camelName] = function () {
            assert(camelName in this._raw);
            const result = this._raw[camelName];
            assert.notStrictEqual(result, undefined);
            return result;
        };

        // create Config.camelName()
        module.exports[camelName] = function () {
            assert(_ActiveOptions);
            assert(_ActiveOptions instanceof ActiveOptions);
            return ActiveOptions.prototype[camelName].call(_ActiveOptions);
        };
    }

    assert(!_ActiveOptions);
    reset(new ActiveOptions(options));
}

// Import CLI options. On --help and misconfiguration errors, print usage and
// return false: Throwing in such cases would require sophisticated catchers,
// exposing the generated usage text, and/or usually useless stack trace.
export function Finalize(argv) {
    const optionatorMaker = require('optionator');

    const optionator = optionatorMaker({
        prepend: "usage: daft.js run <test.js> [options]",
        options: _CliOptions
    });

    let options = null;
    try {
        options = optionator.parseArgv(argv);
        if (options._.length)
            throw Error(`unsupported anonymous option(s): ${options._}`);
    } catch (error) {
        process.exitCode = 1;
        console.log(optionator.generateHelp());
        console.log("Error:", error.message);
        return false;
    }
    delete options._; // we do not use anonymous options

    const optionatorWithoutDefaults = optionatorMaker({
        options: _CliOptions.map(option => { delete option.default; return option; })
    });
    const optionsWithoutDefaults = optionatorWithoutDefaults.parseArgv(argv);

    _Import(options, optionsWithoutDefaults);

    if ("help" in options) {
        console.log(optionator.generateHelp());
        return false;
    }

    console.log("Explicit configuration: ", argv.slice(2));
    return true;
}

// all global options as one object suitable for feeding reset()
export function clone() {
    return _ActiveOptions.clone();
}

// cannot export toString() for some reason
export function sprint() {
    return _ActiveOptions.toString();
}

// TODO: Refactor using key() getters?
export function optionValue(camelName) {
    assert(_ActiveOptions);
    return _ActiveOptions.value(camelName);
}
