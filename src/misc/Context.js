/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from 'assert';
import { UniqueId, PrettyDate } from "../misc/Gadgets";

export default class Context {
    constructor(label, counter = undefined) {
        this.id = counter === undefined ? UniqueId(label) : `${label}${counter}`;
        this._entranceStamp = null;
    }

    enter(/* console log entries */) {
        this._entranceStamp = new Date();
        console.log("{", PrettyDate(this._entranceStamp), this.id, ...arguments);
        return this._entranceStamp;
    }

    exit() {
        assert.strictEqual(arguments.length, 0);

        const now = new Date();
        let duration;
        if (!this._entranceStamp) {
            duration = "";
        } else {
            const diff = new Date(now - this._entranceStamp);
            duration = `+${diff.valueOf()}ms`;
        }
        console.log("}", PrettyDate(now), this.id, duration);

        // TODO: Remember this._entranceStamp to find contexts that do not exit?
        this._entranceStamp = null;

        return now;
    }

    // logs a message without changing the context state
    log(format, ...rest) {
        const now = new Date();
        if (arguments.length) {
            if (!this._entranceStamp) {
                const stamp = PrettyDate(now);
                console.log(`| ${stamp} ${this.id} ${format}`, ...rest);
            } else {
                console.log(`   ${format}`, ...rest);
            }
        }
        return now;
    }
}
