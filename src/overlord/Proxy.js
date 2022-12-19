/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Proxy Overlord Protocol client for controlling a (possibly remote) proxy. */

import http from "http";
import util from "util";
import Promise from 'bluebird';
import assert from "assert";
import Command from "../overlord/Command";
import * as Config from "../misc/Config";
import * as Gadgets from "../misc/Gadgets";

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
const FirstWorkerPort = 3130;
const DedicatedPortPrefix = Math.trunc(FirstWorkerPort / 10);

// Configuration (i.e. the set of tuning options) for the Device Under Test.
// The current _implementation_ is Squid-specific.
export class DutConfig {
    constructor() {
        this._workers = null; // no workers directive at all
        this._dedicatedWorkerPorts = false; // one listening port per worker
        this._memoryCaching = false;
        this._diskCaching = false;
        this._collapsedForwarding = false;
        this._listeningPorts = [];
        this._customDirectives = [];
    }

    // DUT listening ports; they may be difficult for Overlord to infer
    listeningPorts() {
        return this._listeningPorts;
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

    diskCaching(enable) {
        assert.strictEqual(arguments.length, 1);
        assert(enable !== undefined); // for now; can be used for default mode later
        this._diskCaching = enable;
    }

    collapsedForwarding(enable) {
        assert.strictEqual(arguments.length, 1);
        assert(enable !== undefined); // for now; can be used for default mode later
        this._collapsedForwarding = enable;
    }

    // Adds a squid.conf directive that is expected to be used by only one test
    // and, hence, is not worth supporting via a directive-specific method.
    custom(directive) {
        assert.strictEqual(arguments.length, 1);
        assert(directive !== undefined);
        this._customDirectives.push(directive);
    }

    // returns ready-to-use configuration text
    make() {
        this._rememberListeningPort(3128);
        const kid = "kid${process_number}";
        const logDir = "/usr/local/squid/var/logs/overlord";
        const cfg = `
            # Daft-generated configuration
            http_port 3128
            ${this._workersCfg()}
            ${this._collapsedForwardingCfg()}
            ${this._anyCachingCfg()}
            ${this._memoryCachingCfg()}
            ${this._diskCachingCfg()}
            ${this._customCfg()}
            http_access allow localhost
            dns_nameservers 127.0.0.1
            negative_dns_ttl 1 second
            shutdown_lifetime 1 seconds
            visible_hostname ${kid}.squid.daft.test
            coredump_dir ${logDir}
            logformat xsquid %err_code/%err_detail %ts.%03tu %6tr (dns=%dt) %>A=%>a %Ss/%03>Hs %<st %rm %ru %[un %Sh/%<a %mt
            access_log stdio:access-${kid}.log xsquid
            cache_log ${logDir}/cache-${kid}.log
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
        for (let worker = 1; worker <= this._workers; ++worker) {
            addresses.push({
                host: Config.ProxyListeningAddress.host,
                port: this._workerPort(worker),
            });
        }
        return addresses;
    }

    // the number of kidN processes Squid instance is supposed to have running
    kidsExpected() {
        let kidsExpected = 0;
        if (this._workers) {
            if (this._workers === 1) {
                kidsExpected = 1;
                // and no Coordinator or diskers
            } else {
                kidsExpected += this._workers;
                if (this._diskCaching)
                    kidsExpected += 1; // disker
                kidsExpected += 1; // SMP Coordinator process
            }
        }
        return kidsExpected;
    }

    _anyCachingCfg() {
        if (!this._memoryCaching && !this._diskCaching)
            return '';

        // allow caching of responses configured to exceed default 4MB
        // maximum_object_size but do not lower that limit below its default
        const defaultObjectSizeMax = 4*1024*1024; // 4MB default
        const maxResponseHeaderSize = 64*1024;
        const maxResponseSize = maxResponseHeaderSize + Config.bodySize();
        let cfg = ``;
        if (maxResponseSize > defaultObjectSizeMax)
            cfg += `maximum_object_size ${maxResponseSize} bytes\n`;

        // Avoid "WARNING: disk-cache maximum object size is too large for
        // mem-cache". TODO: The proxy should not warn about its own defaults!
        // Also allow caching of responses configured to exceed default 512KB
        // maximum_object_size_in_memory limit.
        const defaultObjectSizeInMemoryMax = 512*1024; // 512KB default
        const sizeToAllow = Math.max(defaultObjectSizeMax, maxResponseSize);
        if (this._memoryCaching && sizeToAllow > defaultObjectSizeInMemoryMax)
            cfg += `maximum_object_size_in_memory ${sizeToAllow} bytes`;

        return this._trimCfg(cfg);
    }

    _memoryCachingCfg() {
        const cacheSize = this._memoryCaching ? "100 MB" : "0";
        let cfg = `
            cache_mem ${cacheSize}
        `;
        return this._trimCfg(cfg);
    }

    _diskCachingCfg() {
        if (!this._diskCaching)
            return '';

        const kid = "kid${process_number}";
        const cfg = `
            cache_dir rock /usr/local/squid/var/cache/overlord/rock 100
            cache_store_log stdio:store-${kid}.log
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
            const dedicatedPortSuffix = '${process_number}';
            cfg += `http_port ${DedicatedPortPrefix}${dedicatedPortSuffix}\n`;
            for (var worker = 1; worker <= this._workers; ++worker) {
                this._rememberListeningPort(this._workerPort(worker));
            }
        }
        return this._trimCfg(cfg);
    }

    _customCfg() {
        let cfg = '';
        for (let directive of this._customDirectives)
            cfg += `${directive}\n`;
        return this._trimCfg(cfg);
    }

    // all workers listen on the primary port (e.g., 3128), but
    // _dedicatedWorkerPorts also enables a unique listening port for each
    // worker by appending the worker number to DedicatedPortPrefix (e.g.,
    // 3131, 3132, ..., 31310, ...)
    _workerPort(worker) {
        if (this._dedicatedWorkerPorts) {
            assert(this._workers > 0);
            assert(worker > 0);
            const rawPort = `${DedicatedPortPrefix}${worker}`;
            const port = Gadgets.ToUnsigned(rawPort);
            return port;
        } else {
            return FirstWorkerPort;
        }

    }

    _rememberListeningPort(port) {
        assert(port > 0);
        this._listeningPorts.push(port);
    }

    // makes cfg text pretty
    _trimCfg(cfg) {
        // TODO: Support rudimentary configuration parsing instead?
        cfg = cfg.replace(/^\s+$/mg, ""); // remove whitespace-only lines
        cfg = cfg.replace(/^\s+/, ""); // remove leading empty space
        cfg = cfg.replace(/\s+$/mg, ""); // remove trailing whitespace
        cfg = cfg.replace(/^\s{12}/mg, ""); // trim indentation
        return cfg + "\n";
    }
}

// proxy instance/service manager
export class ProxyOverlord {
    constructor(cfg) {
        assert.strictEqual(arguments.length, 1);
        assert(cfg);
        this._dutConfig = cfg;
        this._start = null; // future start() promise
        this._oldHealth = null; // proxy status during the previous _remoteCall()
    }

    async noteStartup() {
        assert(!this._start);

        if (Config.DutAtStartup !== "reset") {
            assert.strictEqual(Config.DutAtStartup, "as-is");
            await this._remoteCall("/check");
            return;
        }

        const command = new Command("/reset");
        command.setConfig(this._dutConfig.make());
        this._start = this._remoteCall(command);

        await this._start;
        console.log("Proxy is listening");
        return;
    }

    async noteShutdown() {
        if (Config.DutAtShutdown !== "stopped") {
            assert.strictEqual(Config.DutAtShutdown, "as-is");
            await this._remoteCall("/check");
            return;
        }

        if (this._start) {
            await this._remoteCall("/stop");
            console.log("Proxy stopped listening");
        }
    }

    async restart() {
        console.log("Proxy restarting");
        await this._remoteCall("/restart");
        console.log("Proxy restarted");
    }

    async finishCaching() {
        await this._remoteCall("/finishCaching");
        console.log("Proxy finished any pending caching transactions");
    }

    // Wait for the proxy to parse the given number of request headers (containing the given URL path)
    // without satisfying any of those requests.
    // This only works if the received requests cannot be quickly satisfied by the proxy!
    // For example, the parsed requests may be waiting for the server(s) to respond.
    async finishStagingRequests(path, count) {
        const allRequests = count + 1; // including the parent request
        const options = {
            'Overlord-request-path': path,
            'Overlord-active-requests-count': allRequests
        };
        await this._remoteCall("/waitActiveRequests", options);
        console.log("Proxy staged " + count + " requests");
    }

    _remoteCall(commandOrString, options) {
        return new Promise((resolve) => {

            const command = ((typeof commandOrString) === 'string') ?
                new Command(commandOrString) : commandOrString;
            assert(command instanceof Command);

            const httpOptions = {
                family: 4,
                host: "127.0.0.1",
                port: 13128,
                headers: {
                    'Pop-Version': 6,
                },
            };

            if (options)
                httpOptions.headers = { ...httpOptions.headers, ...options };

            httpOptions.headers['Overlord-Listening-Ports'] =
                this._dutConfig.listeningPorts().join(",");

            httpOptions.headers['Overlord-kids-expected'] =
                this._dutConfig.kidsExpected();

            const requestBody = command.toHttp(httpOptions);

            const request = http.request(httpOptions, (response) => {
                const responseBodyChunks = [];
                response.on('data', chunk => responseBodyChunks.push(chunk));
                response.on('end', () => {
                    const rawBody = responseBodyChunks.join('');

                    if (response.statusCode !== 200) {
                        throw new Error(`Proxy Overlord communication failure (${response.statusCode}):\n` +
                            util.format('%O\n', response.headers) +
                            rawBody);
                    }

                    if (!response.complete) {
                        throw new Error(`Truncated Proxy Overlord response:\n` +
                            util.format('%O\n', response.headers) +
                            rawBody);
                    }

                    const health = JSON.parse(rawBody);
                    const oldProblems = this._oldHealth ? this._oldHealth.problems : "";
                    const newProblems = health.problems.startsWith(oldProblems) ?
                        health.problems.substring(oldProblems.length) : health.problems;
                    if (newProblems.length)
                        throw new Error(`proxy-reported problem(s):\n${newProblems}`);
                    this._oldHealth = health;

                    resolve(true);
                });
            });

            request.on('error', (err) => {
                throw new Error(err);
            });

            if (requestBody !== null)
                request.write(requestBody);

            request.end();
        });
    }

}
