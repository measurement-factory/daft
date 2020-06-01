/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";
import BaseTest from "../test/Test";
import { DutConfig, ProxyOverlord } from "./Proxy";

// tests a ProxyOverlord-controlled proxy
export default class Test extends BaseTest {
    constructor(...args) {
        super(...args);
        this.dut = null; // Device Under Test is set by startup()
    }

    // called once before any run() calls
    async startup() {
        await super.startup();
        assert(!this.dut);
        const cfg = this._createDutConfig();
        this._configureDut(cfg);
        this.dut = new ProxyOverlord(cfg);
        await this.dut.noteStartup();
    }

    // called once after all run()s complete
    async shutdown() {
        if (this.dut)
            await this.dut.noteShutdown();
        await super.shutdown();
    }

    // kids may override to customize creation of the DUT configuration
    _createDutConfig() {
        return new DutConfig();
    }

    // kids may override to customize DUT configuration
    // kids that override do not need to call this method
    _configureDut(/* cfg */) {
    }

}
