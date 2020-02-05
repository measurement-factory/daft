/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";
import * as Config from "../misc/Config";

// generates configurators after accumulating configuration-adjustment steps
export default class ConfigGen {
    constructor() {
        this._groups = []; // groups of configuration-adjusting steps
    }

    // adds a group of steps, each step adjusting the same Config option
    addGlobalConfigVariation(optionWithValues) {
        // the group has to focus on one Config option (for now)
        assert.strictEqual(Object.keys(optionWithValues).length, 1);

        const group = [];

        for (const name in optionWithValues) {
            const values = optionWithValues[name];

            // skip manually-configured options
            if (Config.isExplicitlySet(name)) {
                console.log(`suppressing ${values.length} configuration variation(s) of ${name}\n` +
                    `    option ${name} was explicitly set to ${Config.optionValue(name)}`);
                continue;
            }

            for (const value of values) {
                const optionWithValue = {};
                optionWithValue[name] = value;
                group.push(config => config.use(optionWithValue));
            }
        }

        if (group.length)
            this._groups.push(group);
    }

    // A recursive helper for generateConfigurators():
    // Given groups of configuration steps [G1, G2, ...],
    // returns configurators [c1, c2, c3, c4, ...] where
    // each configurator c contains one step from each group G.
    static _GenerateConfigurators(remainingGroups) {
        if (remainingGroups.length === 0)
            return [];

        if (remainingGroups.length === 1)
            return remainingGroups[0].map(c => [c]);

        let result = [];
        const leftGroup = remainingGroups.shift();
        const rightConfigurators = ConfigGen._GenerateConfigurators(remainingGroups);
        for (const leftStep of leftGroup) {
            for (const rightConfigurator of rightConfigurators) {
                result.push([leftStep, ...rightConfigurator]);
            }
        }

        return result;
    }

    // returns configurators that can generate all possible configurations
    generateConfigurators() {
        const reducer = (total, group) => total * Math.max(1, group.length);
        const expectedCount = this._groups.reduce(reducer, 1);
        const configurators = ConfigGen._GenerateConfigurators(this._groups);
        assert.strictEqual(configurators.length, expectedCount);
        return configurators;
    }

}
