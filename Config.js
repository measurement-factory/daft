/* Global configuration. */

/* all other globals are in Global.js */

export const ListeningAddress = { // TODO: Make configurable
    host: undefined,
    port: 3128
};

export const OriginAddress = { // TODO: Make configurable
    host: 'localhost', // required for default request URLs (XXX?)
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
