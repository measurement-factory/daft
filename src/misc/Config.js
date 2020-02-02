/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Global configuration. */

/* all other globals are in Global.js */

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
        default: "15",
        description: "message body size (bytes)",
    },
];

// accept supplied options as user-configurable via CLI
export function Recognize(options) {
    _CliOptions = _CliOptions.concat(options);
}

// Make each user-configurable option (explicitly set on the command
// line and defaults) available as Config.Option
function _Import(options) {
    for (const key of Object.keys(options)) {
        const uppedKey = key.charAt(0).toUpperCase() + key.slice(1);
        console.log("Command-line option", `${key}:`, options[key]);
        module.exports[uppedKey] = options[key];
    }
}

// Import CLI options. On --help and misconfiguration errors, print usage and
// return false: Throwing in such cases would require sophisticated catchers,
// exposing the generated usage text, and/or usually useless stack trace.
export function Finalize(argv) {
    var optionator = require('optionator')({
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
    _Import(options);

    if ("help" in options) {
        console.log(optionator.generateHelp());
        return false;
    }

    return true;
}
