/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";
import * as Config from "../misc/Config";

// generates configurators after accumulating configuration-adjustment steps
// TODO: Replace with FlexibleConfigGen
export default class ConfigGen {
    constructor() {
        this._groups = []; // groups of configuration-adjusting steps
    }

    // adds a step to adjust configuration (shaped by previous steps)
    addGlobalConfigAdjustment(name, adjustor) {
        assert(adjustor);

        // skip manually-configured options
        if (Config.isExplicitlySet(name)) {
            console.log(`suppressing ${name} configuration adjustment\n` +
                `    option ${name} was explicitly set to ${Config.optionValue(name)}`);
            return;
        }

        const group = [config => adjustor(config)];
        this._groups.push(group);
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
        if (!this._groups.length) {
            // either the Test suggested no option variations or all suggested
            // variations were prohibited by explicitly configured options
            const useConfigAsIs = [ () => {} ];
            this._groups.push(useConfigAsIs);
        }

        const reducer = (total, group) => total * group.length;
        const expectedCount = this._groups.reduce(reducer, 1);
        const configurators = ConfigGen._GenerateConfigurators(this._groups);
        assert.strictEqual(configurators.length, expectedCount);
        return configurators;
    }

}

// extends value generation to also include the (defined) final/returned value
// as if that value was yielded during the extra last generation step
class YieldReturn {
    constructor(iterator) {
        assert(iterator);
        this._iterator = iterator;
    }

    // the iterable protocol
    [Symbol.iterator]() {
        return this;
    }

    // the iterator protocol
    next() {
        if (!this._iterator)
            return { value: undefined, done: true };

        const iteration = this._iterator.next();
        if (iteration.done) {
            this._iterator = null;
            if (iteration.value !== undefined)
                return { value: iteration.value, done: false }; // extra yield
        }

        return iteration;
    }
}

// Generators yield or return this value to preserve the configuration object
// given to them, so that it can be passed to the next generator. Otherwise,
// if a generator does not yield or return something, then the configuration
// object is discarded.
export const KeepConfig = {};

// Returning this value avoids consistent-return lint warnings
// when the generator already returns KeepConfig. In all other use cases,
// returning nothing (i.e. writing "return;") is perfectly fine, of course.
export const DropConfig = undefined;

// A sketch for using FlexibleConfigGen object to enumerate values for testing
// some configuration option X:
// configGen.configurationOptionX(function *(cfg) {
//     if (!cfg.compatibleWithX())
//         return KeepConfig; // cfg = cfg   (1)
//
//     yield "a"; // cfg.x = a               (2)
//
//     if (!cfg.testUsingConsonants())
//         return DropConfig; // drop this cfg; just use cfgs from (1) and (2)
//
//     yield "b";
// });

// prevents multiple AddMethods() calls
// TODO: Perhaps we should register with Configure::Finalize() instead.
let FlexibleConfigGenFinalized = false;

// For generator function detection. See https://stackoverflow.com/a/21559723
const _GeneratorFun = function *() {}.constructor;

export class ConfigurationError extends Error
{
    constructor(message) {
        super(message);
    }
}

// generates configurators after a series of configuration-yielding steps
// where each next step yields a new sequence of configurations by cloning
// configurations yielded during the previous step and adjusting the clones
// [ { a=a1, b=?, c=? } ] // start: user configuration and defaults
// [ { a=a1, b=b1, c=?}, { a=a1, b=b2, c=?}, ... ] // step adds b values
// [ { a=a1, b=b1, c=c1}, { a=a1, b=b1, c=c2}, ... ] // step adds c values
export class FlexibleConfigGen {
    // adds individual option-specific setter methods
    static AddMethods(optionNames) {
        optionNames.forEach(optionName => {
            //Object.defineProperty(FlexibleConfigGen, optionName, {
            FlexibleConfigGen.prototype[optionName] = function (genOrArray) {
                // This check prevents the generator function from _dropping_
                // configurations incompatible with this explicitly set option
                // value. Use dropInvalidConfigurations() for dropping instead
                // of DropConfig. TODO: Consider removing DropConfig.
                if (Config.isExplicitlySet(optionName))
                    return; // automated variation disabled

                // if array was given, convert it to a yield-each generator
                const gen = (genOrArray instanceof _GeneratorFun) ? genOrArray :
                    function *() { yield *genOrArray; };

                assert.notEqual(this._configs.length, 0);
                let newConfigs = [];
                for (const oldConfig of this._configs) {
                    let keptConfigs = 0;
                    for (const newValue of new YieldReturn(gen(oldConfig))) {
                        const newConfig = oldConfig.clone();
                        if (newValue === KeepConfig) {
                            if (!keptConfigs++)
                                newConfigs.push(newConfig);
                        } else {
                            newConfig.resetOption(optionName, newValue);
                            newConfigs.push(newConfig);
                        }
                    }
                }
                // If the option is not supposed to be used due to other,
                // previously set options, then gen yields nothing, and we
                // leave the configuration as it was.
                if (newConfigs.length)
                    this._configs = newConfigs;
                assert.notEqual(this._configs.length, 0);
            };
        });
    }

    constructor() {
        // configurations yielded so far
        this._configs = [ Config.clone() ];

        if (!FlexibleConfigGenFinalized) {
            FlexibleConfigGen.AddMethods(Config.RecognizedOptionNames());
            FlexibleConfigGenFinalized = true;
        }
    }

    // reports and removes configuration candidates that result in
    // ConfigurationError exceptions in the given checker function
    dropInvalidConfigurations(checker) {
        this._configs = this._configs.filter(cfg => {
            try {
                /* void */ checker(cfg);
                return true;
            } catch (error) {
                if (error instanceof ConfigurationError) {
                    console.log(`Warning: Dropping configuration candidate: ${error.message}`);
                    return false;
                }
                throw error; // re-throw all other errors/bugs
            }
        });

        if (!this._configs.length)
            throw new ConfigurationError("No valid configuration candidates left");
    }

    // reports and removes duplicate configuration candidates, using the given
    // summation function to compare candidates
    dropDuplicateConfigurations(gister) {
        assert.notEqual(this._configs.length, 0);
        let seen = new Set();
        this._configs = this._configs.filter(cfg => {
            const gist = gister(cfg);
            if (seen.has(gist)) {
                console.log(`Warning: Dropping duplicate configuration candidate: ${gist}`);
                return false;
            }
            seen.add(gist);
            return true; // keep
        });
        assert.notEqual(this._configs.length, 0);
    }

    // returns configurators that can generate all possible configurations
    generateConfigurators() {
        if (!this._configs.length) {
            // either the Test suggested no option variations or all suggested
            // variations were prohibited by explicitly configured options
            const useConfigAsIs = [ () => {} ];
            return useConfigAsIs;
        }

        // convert a sequence of configs into a sequence of config-setting functions
        return this._configs.map(cfg => [ function (C) { C.reset(cfg); } ]);
    }
}
