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
import * as Lifetime from "../misc/Lifetime";
import Command from "../overlord/Command";

// This default is used only when memory caching is enabled via --dut-memory-cache=true.
const DefaultMemoryCacheSize = 100*1024*1024; // bytes (squid.conf defaults to 256 MB)

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
        option: "dut-memory-cache-size",
        type: "Number",
        default: DefaultMemoryCacheSize.toString(),
        description: "cache_mem size in bytes (when memory cache is enabled); enable memory cache with --dut-memory-cache=true",
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

        if (Config.dutMemoryCache()) {
            this._memoryCacheSize = Config.dutMemoryCacheSize();
            if (!this._memoryCacheSize)
                throw new Error("--dut-memory-cache=true is not compatible with --dut-memory-cache-size=0");
        } else {
            this._memoryCacheSize = 0; // disabled
            // XXX: We cannot detect a positive --dut-memory-cache-size value
            // conflict because that option has a positive _default_ value.
            // Ideally, it would have a default "unset" state instead, but
            // Config API cannot test for that.
            //
            // N.B. Config.isExplicitlySet() only tests whether the option was
            // set on the command line; we cannot use this API here because it
            // returns false for options set by Config generators.
        }

        this._diskCaching = Config.dutDiskCache();

        this._collapsedForwarding = false;
        this._listeningPorts = [];
        this._cachePeers = []; // CachePeer::Config objects
        this._memoryPools = true; // mimics default
        this._customDirectives = [];

        this._primaryListeningAddress = Config.proxyAuthority();
        this._rememberListeningPort(this._primaryListeningAddress.port); // usually 3128

        this.resetCachePeers(Config.dutCachePeers());
    }

    // DUT listening ports; they may be difficult for Overlord to infer
    listeningPorts() {
        return this._listeningPorts;
    }

    cachingEnabled() {
        return this._memoryCacheSize || this._diskCaching;
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

    // Replace all cache_peer configurations with the given number of freshly generated ones.
    // See also: reseCachePeersTo(newConfigs)
    resetCachePeers(count) {
        assert(count >= 0);
        let newConfigs = [];
        while (newConfigs.length < count)
            newConfigs.push(new CachePeer.Config());
        this.resetCachePeersTo(newConfigs);
    }

    // Replace all cache_peer configurations with the given ones.
    // See also: reseCachePeers(count)
    resetCachePeersTo(newConfigs) {
        this._cachePeers = [];
        this._cachePeers.push(...newConfigs);
    }

    memoryCaching(enable) {
        assert.strictEqual(arguments.length, 1);
        assert(enable !== undefined); // for now; can be used for default mode later
        this._memoryCacheSize = enable ? DefaultMemoryCacheSize : 0;
    }

    memoryCacheSize(bytes) {
        assert.strictEqual(arguments.length, 1);
        assert(bytes !== undefined);
        assert(bytes >= 0);
        this._memoryCacheSize = bytes;
    }

    diskCaching(enable) {
        assert.strictEqual(arguments.length, 1);
        assert(enable !== undefined); // for now; can be used for default mode later
        this._diskCaching = enable;
    }

    memoryPools(enable) {
        assert.strictEqual(arguments.length, 1);
        assert(enable !== undefined); // for now; can be used for default mode later
        this._memoryPools = enable;
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
        const kid = "kid${process_number}";
        const logDir = "/usr/local/squid/var/logs/overlord";
        const cfg = `
            # Daft-generated configuration
            http_port ${this._primaryListeningAddress.port}
            ${this._workersCfg()}
            ${this._cachePeersCfg()}
            ${this._collapsedForwardingCfg()}
            ${this._anyCachingCfg()}
            ${this._memoryCachingCfg()}
            ${this._diskCachingCfg()}
            ${this._memoryPoolsCfg()}
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
        const primaryAddress = this._primaryListeningAddress;
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
        const sizeToAllow = Math.min(this._memoryCacheSize, Math.max(defaultObjectSizeMax, maxResponseSize));
        if (this._memoryCacheSize && sizeToAllow > defaultObjectSizeInMemoryMax)
            cfg += `maximum_object_size_in_memory ${sizeToAllow} bytes`;

        return this._trimCfg(cfg);
    }

    _memoryCachingCfg() {
        let cfg = `
            cache_mem ${this._memoryCacheSize} bytes
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
            cfg += cachePeerCfg.directive() + "\n";
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

    _memoryPoolsCfg() {
        let cfg = '';
        if (!this._memoryPools)
            cfg = 'memory_pools off';
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
            return this._primaryListeningAddress.port;
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

        this._memoryLeakDetection = undefined; // set by detectMemoryLeaks()

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

    // Supported `how` values:
    // * undefined: detect if possible
    // * true: detect; abort if detection is not possible
    // * false: do not detect
    detectMemoryLeaks(how) {
        assert.strictEqual(arguments.length, 1);
        // To simplify triage and this function reporting code... Also flags
        // attempts to change this._memoryLeakDetection and then restarting
        // Squid: We restart() Squid with the original squid.conf that may
        // stop reflecting this._memoryLeakDetection value at restart time.
        assert(this._memoryLeakDetection == undefined);
        if (how === undefined)
            console.log("Will determine whether to detect memory leaks at proxy startup time");
        else if (how === false)
            console.log("Will not detect memory leaks");
        else if (how === true)
            console.log("Will detect memory leaks");
        else
            throw new Error(`BUG: unsupported detectMemoryLeaks() parameter: ${how}`);
        this._memoryLeakDetection = how;
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

    async _finalizeDutConfig() {

        // before we can this._dutConfig.make() below
        if (this._memoryLeakDetection === undefined && Config.dutShutdownManner() === "immediately") {
            console.log(`Cannot detect memory leaks due to proxy shutdown manner: ${Config.dutShutdownManner()}`);
            this._memoryLeakDetection = false;
        }
        if (this._memoryLeakDetection === undefined) {
            const answer = await this._remoteCall('/executionEnvironment');
            const ee = answer.executionEnvironment;
            assert(ee);
            const canDetectLeaks = ee.valgrindIsPresent;
            console.log(`Proxy execution environment ${canDetectLeaks ? "can" : "cannot"} detect memory leaks`);
            this._memoryLeakDetection = canDetectLeaks;
        }
        if (this._memoryLeakDetection) {
            // Valgrind suppressions do not work with (current) memory pools
            // because valgrind only checks original/true allocation stack
            // trace. A subsequent from-pool "allocation" from suppressed code
            // will not match its suppression and will be reported as a leak,
            // with an irrelevant/misleading original allocation stack trace!
            this._dutConfig.memoryPools(false);
        }

        return this._dutConfig.make();
    }

    async noteStartup() {
        assert(!this._start);

        // discovering proxy execution environment and launching the proxy may take a minute
        Lifetime.Extend(new Date(1*60*1000));

        // before we can start cache_peers and/or proxy below
        const finalizedConfig = await this._finalizeDutConfig();

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
        command.setOption('valgrind-use', this._memoryLeakDetection ? "1" : "0");
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
        const command = new Command("/restart");
        command.setOption('valgrind-use', this._memoryLeakDetection ? "1" : "0");
        await this._remoteCall(command);
        console.log("Proxy restarted");
    }

    async reconfigure(newConfig = undefined) {
        console.log("Reconfiguring proxy");
        // TODO: Caller(?) may need to start new peers and/or stop old ones if
        // cache_peers have changed. See also: this._startCachePeers().
        const command = new Command("/reconfigure");
        if (newConfig !== undefined)
            command.setConfig(newConfig.make());
        await this._remoteCall(command);
        console.log("Proxy reconfigured");
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
                    'Pop-Version': 12,
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
                    if (body.health)
                        this._updateHealth(body.health);
                    else
                        assert(body.minimal);

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
