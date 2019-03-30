/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Proxy Overlord Protocol client for controlling a (possibly remote) proxy. */

import http from "http";
import Promise from 'bluebird';
import assert from "assert";

class SquidConfig {
    constructor() {
    }

    // returns ready-to-use configuration text
    make() {
        const prettyCfg = `# Daft-generated configuration
            http_port 3128
            http_access allow localhost
            dns_nameservers 127.0.0.1
            negative_dns_ttl 1 second
            cache_mem 0
            shutdown_lifetime 1 seconds
            visible_hostname squid.daft.test
            coredump_dir /usr/local/squid/var/logs/overlord
            logformat xsquid %err_code/%err_detail ... %ts.%03tu %6tr (dns=%dt) %>A=%>a %Ss/%03>Hs %<st %rm %ru %[un %Sh/%<a %mt
            access_log stdio:access.log xsquid
            cache_log cache.log
        `;
        const cfg = prettyCfg.replace(/^\s{12}/mg, ""); // trim indentation
        return cfg;
    }
}

export default class ProxyOverlord {
    constructor() {
        this._start = null; // future start() promise
    }

    async start() {
        assert(!this._start);

        const cfg = new SquidConfig().make();
        this._start = this._remoteCall("/reset", cfg);

        const result = await this._start;
        console.log("Proxy is listening");
        return result;
    }

    async stop() {
        if (this._start) {
            await this._remoteCall("/stop");
            console.log("Proxy stopped listening");
        }
    }

    _remoteCall(urlPath, requestBody = null) {
        return new Promise((resolve) => {
            const requestHasBody = requestBody !== null;
            const options = {
                method: requestHasBody ? "POST" : "GET",
                family: 4,
                host: "127.0.0.1",
                port: 13128,
                path: urlPath,
                headers: {
                }
            };

            // disable request chunking
            if (requestHasBody)
                options.headers['Content-Length'] = requestBody.length;

            const request = http.request(options, (response) => {
                const responseBody = [];
                response.on('data', chunk => responseBody.push(chunk));
                response.on('end', () => {
                    assert(response.statusCode === 200);
                    resolve(responseBody.join(''));
                });
            });

            request.on('error', (err) => { throw new Error(err); });

            if (requestHasBody)
                request.write(requestBody);

            request.end();
        });
    }

}
