/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from 'assert';
import { UniqueId } from "../misc/Gadgets";

export default class Context {
    constructor(label) {
        this.id = UniqueId(label);
        this._entranceStamp = null;
    }

    enter(/* console log entries */) {
        this._entranceStamp = new Date();
        console.log("{", this._entranceStamp.toISOString(), this.id, ...arguments);
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
        console.log("}", now.toISOString(), this.id, duration);

        // TODO: Remember this._entranceStamp to find contexts that do not exit?
        this._entranceStamp = null;

        return now;
    }

    // logs a message without changing the context state
    log(/* console log entries */) {
        const now = new Date();
        if (arguments.length) {
            if (!this._entranceStamp)
                console.log("|", now, this.id, ...arguments);
            else
                console.log("   ", ...arguments);
        }
        return now;
    }
}
