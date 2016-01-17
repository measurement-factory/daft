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
export const OriginAuthority = { // TODO: Make configurable
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
