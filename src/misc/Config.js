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

// Used to form request URLs.
export const OriginAuthority = {
    host: 'localhost',
    port: !process.getuid || process.getuid() ? 8080 : 80, // 80 when root
};

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

/* Command-line options handling */

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
        default: `{host: ${OriginAuthority.host}, port: ${OriginAuthority.port}}`,
        description: "ultimate request destination",
    },
    {
        option: "body-size",
        type: "Number",
        default: DefaultBodySize().toString(),
        description: "message body size (bytes)",
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

// a camelName:value map maintained by _force() and reset()
let _ActiveOptions;

// (re)sets the (parsed) option value, including defaults and generated ones
export function _force(key, value) {
    if (!(key in _RecognizedOptions))
        throw new Error("Unrecognized Config option: " + key);
    const uppedKey = key.charAt(0).toUpperCase() + key.slice(1);
    _ActiveOptions[key] = value;
    module.exports[uppedKey] = value; // legacy Config.Key access
    // TODO: module.exports[key] = function() { return _ActiveOptions[key]; }; // Config.key()
}

// Make each user-configurable option (explicitly set on the command
// line and defaults) available as Config.Option
function _Import(options, optionsWithoutDefaults) {
    assert(!_RecognizedOptions);
    _RecognizedOptions = {};
    for (const option of _CliOptions) {
        const dashName = option.option;
        const camelName = dashName.replace(/-(.)/gi, m => m[1].toUpperCase());
        _RecognizedOptions[camelName] = camelName in optionsWithoutDefaults;
    }

    assert(!_ActiveOptions);
    _ActiveOptions = {};
    for (const key of Object.keys(options))
        _force(key, options[key]);
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

// returns a copy of the given options
function _cloneOptions(options) {
    // we assume that shallow copy is safe for all configurable options
    return {...options};
}

// all global options as one opaque object suitable for feeding reset()
export function clone() {
    return _cloneOptions(_ActiveOptions);
}

// change all global options to the given ones
export function reset(newOptions) {
    _ActiveOptions = _cloneOptions(newOptions);
}

// prints (not) explicitly configured configuration options
function _sprintGroup(title, explicits) {
    const filter = key => isExplicitlySet(key) === explicits;
    const keys = Object.keys(_ActiveOptions).filter(filter).sort();
    if (!keys.length)
        return "";
    let image = util.format("    %s:\n", title);
    for (const key of keys)
        image += util.format("        %s: %O\n", key, _ActiveOptions[key]);
    return image;
}

// cannot export toString() for some reason
export function sprint() {
    let image = "";
    image += _sprintGroup("explicitly configured options", true);
    image += _sprintGroup("options with generated and default values", false);
    return image;
}

export function optionValue(camelName) {
    _assertRecognition(camelName);
    return _ActiveOptions[camelName];
}

// change a few global options, leaving the rest as is
export function use(options) {
    for (const key of Object.keys(options)) {
        assert(!isExplicitlySet(key));
        _force(key, options[key]);
    }
}
