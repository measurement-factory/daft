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

export const DefaultMessageBodyContent = "THIS.is.BODY";

export const LogBodies = undefined; // whether to log bodies on console


/* Command-line options handling */

export let CliHelp; // set in Finalize()

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
        default: `{host: "localhost", port: ${OriginAuthority.port}}`,
        description: "ultimate request destination",
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
        module.exports[uppedKey] = options[key];
    }
}

// parse all recognized CLI options
export function Finalize() {
    try {
        var optionator = require('optionator')({
            prepend: "$(BIN)/babel-node <test-script> [options]",
            options: _CliOptions
        });
        CliHelp = optionator.generateHelp();
        const options = optionator.parseArgv(process.argv);
        _Import(options);
    } catch (error) {
        if (CliHelp !== undefined)
            console.log(CliHelp);
        throw error;
    }
}
