/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Proxy Overlord Protocol client for controlling a (possibly remote) proxy. */

import http from "http";
import Promise from 'bluebird';
import assert from "assert";
import * as Config from "../misc/Config";

Config.Recognize([
    {
        option: "dut-at-startup",
        type: "String",
        enum: ["reset", "as-is"],
        default: "reset",
        description: "desired DUT state before starting tests",
    },
    {
        option: "dut-at-shutdown",
        type: "String",
        enum: ["stopped", "as-is"],
        default: "stopped",
        description: "desired DUT state after all tests are done",
    },
]);

// TODO: Make worker port range configurable
const FirstWorkerPort = 3130; // for _dedicatedWorkerPorts


// Configuration (i.e. the set of tuning options) for the Device Under Test.
// The current _implementation_ is Squid-specific.
export class DutConfig {
    constructor() {
        this._workers = null; // no workers directive at all
        this._dedicatedWorkerPorts = false; // one listening port per worker
        this._memoryCaching = false;
        this._collapsedForwarding = false;
    }

    workers(count) {
        assert(count > 0);
        this._workers = count;
    }

    dedicatedWorkerPorts(enable) {
        assert.strictEqual(arguments.length, 1);
        assert(enable !== undefined); // for now; can be used for default mode later
        this._dedicatedWorkerPorts = enable;
    }

    memoryCaching(enable) {
        assert.strictEqual(arguments.length, 1);
        assert(enable !== undefined); // for now; can be used for default mode later
        this._memoryCaching = enable;
    }

    collapsedForwarding(enable) {
        assert.strictEqual(arguments.length, 1);
        assert(enable !== undefined); // for now; can be used for default mode later
        this._collapsedForwarding = enable;
    }

    // returns ready-to-use configuration text
    make() {
        const kid = "kid${process_number}";
        const cfg = `
            # Daft-generated configuration
            http_port 3128
            ${this._workersCfg()}
            http_access allow localhost
            dns_nameservers 127.0.0.1
            negative_dns_ttl 1 second
            ${this._collapsedForwardingCfg()}
            ${this._memoryCachingCfg()}
            shutdown_lifetime 1 seconds
            visible_hostname ${kid}.squid.daft.test
            coredump_dir /usr/local/squid/var/logs/overlord
            logformat xsquid %err_code/%err_detail %ts.%03tu %6tr (dns=%dt) %>A=%>a %Ss/%03>Hs %<st %rm %ru %[un %Sh/%<a %mt
            access_log stdio:access-${kid}.log xsquid
            cache_log cache-${kid}.log
        `;
        return this._trimCfg(cfg);
    }

    // result[0] (i.e. the first address) is the default port shared by all workers
    // result[k] is the http_port dedicated to SMP worker #k (k >= 1)
    workerListeningAddresses() {
        assert(this._workers > 0);
        let addresses = [{
            host: Config.ProxyListeningAddress.host,
            port: Config.ProxyListeningAddress.port
        }];
        // all workers listen on the primary port (e.g., 3128), but _dedicatedWorkerPorts
        // adds a unique listening port to each worker (e.g., 3131, 3132, ...)
        for (let worker = 1; worker <= this._workers; ++worker) {
            addresses.push({
                host: Config.ProxyListeningAddress.host,
                port: FirstWorkerPort + worker
            });
        }
        return addresses;
    }

    _memoryCachingCfg() {
        const memCacheSize = this._memoryCaching ? "100 MB" : "0";
        const cfg = `
            cache_mem ${memCacheSize}
        `;
        return this._trimCfg(cfg);
    }

    _collapsedForwardingCfg() {
        if (this._collapsedForwarding === undefined)
            return '';
        return `collapsed_forwarding ${this._collapsedForwarding ? 'on' : 'off'}`;
    }

    _workersCfg() {
        if (!this._workers)
            return '';

        let cfg = `workers ${this._workers}\n`;
        if (this._dedicatedWorkerPorts) {
            const dedicatedPortPrefix = Math.trunc(FirstWorkerPort / 10);
            const dedicatedPortSuffix = '${process_number}';
            cfg += `http_port ${dedicatedPortPrefix}${dedicatedPortSuffix}\n`;
        }
        return this._trimCfg(cfg);
    }

    // makes cfg text pretty
    _trimCfg(cfg) {
        // TODO: Support rudimentary configuration parsing instead?
        cfg = cfg.replace(/^\s+$/, ""); // remove leading empty line
        cfg = cfg.replace(/^\s+/, ""); // remove leading empty space
        cfg = cfg.replace(/\s+$/mg, ""); // remove trailing whitespace
        cfg = cfg.replace(/^\s{12}/mg, ""); // trim indentation
        return cfg + "\n";
    }
}

export class ProxyOverlord {
    constructor(cfg) {
        assert.strictEqual(arguments.length, 1);
        assert(cfg);
        this._dutConfig = cfg;
        this._start = null; // future start() promise
    }

    async noteStartup() {
        assert(!this._start);

        if (Config.DutAtStartup !== "reset") {
            assert.strictEqual(Config.DutAtStartup, "as-is");
            return;
        }

        this._start = this._remoteCall("/reset", this._dutConfig.make());

        await this._start;
        console.log("Proxy is listening");
        return;
    }

    async noteShutdown() {
        if (Config.DutAtShutdown !== "stopped") {
            assert.strictEqual(Config.DutAtShutdown, "as-is");
            return;
        }

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

            request.on('error', (err) => {
                throw new Error(err);
            });

            if (requestHasBody)
                request.write(requestBody);

            request.end();
        });
    }

}
