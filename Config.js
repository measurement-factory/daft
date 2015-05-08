/* Global configuration. */

/* all other globals are in Global.js */

export const ListeningAddress = 3128; // TODO: Make configurable
export const OriginAddress = { // TODO: Make configurable
	host: 'localhost',
	port: 80,
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
