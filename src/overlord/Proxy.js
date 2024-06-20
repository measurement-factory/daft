/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Proxy Overlord Protocol client for controlling a (possibly remote) proxy. */

import assert from "assert";
import http from "http";
import Promise from 'bluebird';
import util from "util";

import * as AccessRecords from "../overlord/AccessRecords";
import * as CachePeer from "../overlord/CachePeer";
import * as Config from "../misc/Config";
import * as Gadgets from "../misc/Gadgets";
import Command from "../overlord/Command";

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
    {
        option: "ignore-dut-problems",
        type: "[ RegExp{source: String} ]",
        default: "[]",
        description: "ignore DUT-reported problem(s) matching these regex(es)",
    },
    {
        option: "dut-memory-cache",
        type: "Boolean",
        default: "false",
        description: "whether to enable cache_mem",
    },
    {
        option: "dut-disk-cache",
        type: "Boolean",
        default: "false",
        description: "whether to enable cache_dir",
    },
    {
        option: "dut-cache-peers",
        type: "Number",
        default: "0",
        description: "the number of proxy cache_peers to use (if any)",
    },
]);

// TODO: Make worker port range configurable
const FirstDedicatedWorkerPort = 3131;
const DedicatedPortPrefix = Math.trunc(FirstDedicatedWorkerPort / 10);

// Configuration (i.e. the set of tuning options) for the Device Under Test.
// The current _implementation_ is Squid-specific.
export class DutConfig {
    constructor() {
        this._workers = null; // no workers directive at all
        this._dedicatedWorkerPorts = false; // one listening port per worker
        this._memoryCaching = Config.dutMemoryCache();
        this._diskCaching = Config.dutDiskCache();
        this._collapsedForwarding = false;
        this._listeningPorts = [];
        this._cachePeers = []; // CachePeer::Config objects
        this._customDirectives = [];

        this._withCachePeers(Config.dutCachePeers());
    }

    // DUT listening ports; they may be difficult for Overlord to infer
    listeningPorts() {
        return this._listeningPorts;
    }

    cachingEnabled() {
        return this._memoryCaching || this._diskCaching;
    }

    hasCachePeers() {
        return this._cachePeers.length > 0;
    }

    cachePeers() {
        return this._cachePeers;
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

    _withCachePeers(count) {
        assert(count >= 0);
        assert(!this._cachePeers.length);
        while (this._cachePeers.length < count) {
            this._cachePeers.push(new CachePeer.Config());
        }
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
        const primaryAddress = Config.proxyAuthority();
        this._rememberListeningPort(primaryAddress.port); // usually 3128

        const kid = "kid${process_number}";
        const logDir = "/usr/local/squid/var/logs/overlord";
        const cfg = `
            # Daft-generated configuration
            http_port ${primaryAddress.port}
            ${this._workersCfg()}
            ${this._cachePeersCfg()}
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

            ${AccessRecords.LogFormat("daftFormat")}
            access_log stdio:access-${kid}.log daftFormat

            cache_log ${logDir}/cache-${kid}.log
        `;
        return this._trimCfg(cfg);
    }

    // result[0] (i.e. the first address) is the default port shared by all workers
    // result[k] is the http_port dedicated to SMP worker #k (k >= 1)
    workerListeningAddresses() {
        assert(this._workers > 0);
        const primaryAddress = Config.proxyAuthority();
        let addresses = [{
            host: primaryAddress.host,
            port: primaryAddress.port
        }];
        for (let worker = 1; worker <= this._workers; ++worker) {
            addresses.push({
                host: primaryAddress.host,
                port: this._workerPort(worker),
            });
        }
        return addresses;
    }

    // the number of configured dedicated worker processes
    workerCount() {
        // no explicit "workers N" means one worker kid
        // explicit "workers N" means N worker kids (including zero N)
        return (this._workers === null) ? 1 : this._workers;
    }

    // the number of configured dedicated disker processes
    diskerCount() {
        return this._diskCaching ? 1 : 0; // for now
    }

    _anyCachingCfg() {
        if (!this.cachingEnabled())
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

    _cachePeersCfg() {
        if (!this._cachePeers.length)
            return '';

        let cfg = '';

        // cache_peer lines (and cachePeer finalization)
        for (let idx = 0; idx < this._cachePeers.length; ++idx) {
            const cachePeerCfg = this._cachePeers[idx];
            cachePeerCfg.finalizeWithIndex(idx);
            cfg += cachePeerCfg.toString() + "\n";
        }

        // prohibit DIRECT forwarding of requests meant for a cache_peer
        const routingField = CachePeer.RoutingField();
        cfg += `
            nonhierarchical_direct off
            acl routedToCachePeer req_header ${routingField.name} ${routingField.value}
            never_direct allow routedToCachePeer
        `;

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
            return Config.proxyAuthority().port;
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

        // ignore proxy-reported problems matching any of these regexes
        this._ignoreProblems = [];
        Config.ignoreDutProblems().forEach(regex => this.ignoreProblems(regex));

        this._cachePeers = []; // started cache_peers
        this._stoppedCachePeers = false; // stopCachePeers() has been called

        // previously seen AccessRecords
        this._oldAccessRecords = null;
    }

    // "read-only" access to the DUT configuration
    config() {
        assert.strictEqual(arguments.length, 0);
        return this._dutConfig;
    }

    // Start ignoring matching DUT-reported problem(s).
    ignoreProblems(regex) {
        assert(regex);
        console.log("Will ignore proxy problem(s) matching", regex);

        // We feed each regex one problem at a time, without resetting regexes
        // after each feeding. Persistent flags are not only useless right
        // now, but they prevent matching during subsequent checks. Ban them
        // explicitly now to be able to add flag-driven features later.
        assert(!regex.global);
        assert(!regex.sticky);

        this._ignoreProblems.push(regex);
    }

    // started cache_peer at a given zero-based index
    cachePeerAt(idx) {
        assert(idx >= 0);
        assert(idx < this._cachePeers.length);
        return this._cachePeers[idx];
    }

    cachePeers() {
        return this._cachePeers;
    }

    async noteStartup() {
        assert(!this._start);

        // before we can start cache_peers and/or proxy below
        const finalizedConfig = this._dutConfig.make();

        if (this.config().hasCachePeers())
            await this._startCachePeers();

        if (Config.DutAtStartup !== "reset") {
            console.log("Checking proxy state");
            assert.strictEqual(Config.DutAtStartup, "as-is");
            await this._remoteCall("/check");
            return;
        }

        console.log("Resetting proxy");
        const command = new Command("/reset");
        command.setConfig(finalizedConfig);
        this._start = this._remoteCall(command);

        await this._start;
        console.log("Proxy is listening");
        return;
    }

    async noteShutdown() {
        if (Config.DutAtShutdown !== "stopped") {
            assert.strictEqual(Config.DutAtShutdown, "as-is");
            await this._remoteCall("/check");
        } else if (this._start) {
            await this._remoteCall("/stop");
            console.log("Proxy stopped listening");
        }

        await this.stopCachePeers();
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

    // Wait for the proxy to accumulate exactly the given number of
    // not-yet-satisfied requests (containing the given URL path). This only
    // works if the proxy can parse request (headers) but cannot satisfy those
    // requests while we are waiting! For example, Squid may forward parsed
    // requests and then wait for the server(s) to respond.
    async finishStagingRequests(path, count) {
        const options = {
            'Overlord-request-path': path,
            'Overlord-active-requests-count': count,
        };
        await this._remoteCall("/waitActiveRequests", options);
        console.log("Proxy staged " + count + " requests");
    }

    async getAllAccessRecords() {
        const result = await this._remoteCall("/getAccessRecords");
        const accessRecords = AccessRecords.Import(result.accessRecords);
        console.log(`Transactions logged by the proxy: ${accessRecords.count()}`);
        return accessRecords;
    }

    async getNewAccessRecords() {
        const allRecords = await this.getAllAccessRecords();
        let newRecords = allRecords; // may be overwritten below
        if (this._oldAccessRecords)
            newRecords = this._oldAccessRecords.addUnique(allRecords);
        else
            this._oldAccessRecords = allRecords;
        console.log(`New transactions logged by the proxy: ${newRecords.count()}`);
        return newRecords;
    }

    async _startCachePeers() {
        assert(!this._cachePeers.length);
        const cachePeerCfgs = this.config().cachePeers();
        console.log(`Starting ${cachePeerCfgs.length} cache_peers`);
        let startingCachePeers = [];
        cachePeerCfgs.forEach(peerCfg => {
            const willStart = this._startCachePeer(peerCfg);
            startingCachePeers.push(willStart);
        });
        assert(startingCachePeers.length === this._cachePeers.length);
        assert(this._cachePeers.length > 0);
        await Promise.all(startingCachePeers);
        console.log(`Started ${this._cachePeers.length} cache_peers`);
    }

    // terminate all agents representing cache_peers (if any)
    async stopCachePeers() {
        if (this._stoppedCachePeers)
            return; // already did

        this._stoppedCachePeers = true;

        if (!this._cachePeers.length)
            return; // nothing to do

        console.log(`Stopping cache_peers (${this._cachePeers.length})`);
        let stoppingCachePeers = [];
        this._cachePeers.forEach(cachePeer => {
            const willStop = cachePeer.stop();
            stoppingCachePeers.push(willStop);
        });
        assert(stoppingCachePeers.length === this._cachePeers.length);
        assert(this._cachePeers.length > 0);
        await Promise.all(stoppingCachePeers);
        console.log(`Stopped cache_peers (${this._cachePeers.length})`);
    }

    _startCachePeer(cachePeerCfg) {
        const cachePeer = new CachePeer.Agent();
        cachePeer.listenAt(cachePeerCfg.httpListeningHostPort());
        this._cachePeers.push(cachePeer);
        return cachePeer.start();
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
                    'Pop-Version': 9,
                },
            };

            if (options)
                httpOptions.headers = { ...httpOptions.headers, ...options };

            httpOptions.headers['Overlord-Listening-Ports'] =
                this._dutConfig.listeningPorts().join(",");

            httpOptions.headers['Overlord-worker-count'] = this._dutConfig.workerCount();
            httpOptions.headers['Overlord-disker-count'] = this._dutConfig.diskerCount();

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

                    const body = JSON.parse(rawBody);
                    this._updateHealth(body.health);

                    resolve(body.answer);
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

    // _remoteCall() helper for processing updated (cumulative) proxy health
    _updateHealth(health) {
        assert(health);

        // extract newProblems before updating (cumulative) this._oldHealth
        const oldProblems = this._oldHealth ? this._oldHealth.problems : [];
        const newProblems = health.problems.slice(oldProblems.length);
        this._oldHealth = health;

        if (newProblems.length && this._ignoreProblems) {
            const honorSome = newProblems.some(problem => {
                return !this._ignoreProblems.some(regex => regex.test(problem));
            });

            const newProblemsReport = `proxy-reported problem(s):\n${newProblems.join("\n\n")}`;
            if (honorSome)
                throw new Error(newProblemsReport);
            console.log(`Ignoring ${newProblemsReport}\n`);
        }
    }
}
