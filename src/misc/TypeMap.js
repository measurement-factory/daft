/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* TypeMap: A registry for classes (types), with filter-driven search */

class MapItem {
    constructor(key) {
        this.key = key;
        this.numbered = new Map();
        this.matchers = [];
    }

    setBase(value) {
        if (value === undefined)
            throw new Error("setBase called without a base");

        if (this.base)
            throw new Error("Cannot reset base");

        this.base = value;
    }

    addNumbered(customBase, filterNum) {
        if (this.numbered.has(filterNum))
            throw new Error(`Cannot reset type #${filterNum}`);

        this.numbered.set(filterNum, customBase);
    }

    addMatcher(customBase, matcher) {
        this.matchers.push({ func: matcher, type: customBase });
    }


    getBase() {
        return this.base ? this.base : this.key;
    }

    getNumbered(filterNum) {
        let numbered = this.numbered;
        return numbered.has(filterNum) ? numbered.get(filterNum) : this.getBase();
    }

    getMatched(matcherArgs) {
        let matchers = this.matchers;
        for (let idx = 0; idx < matchers.length; idx++) {
            let { func, type } = matchers[idx];
            if (func(...matcherArgs)) {
                return type;
            }
        }
        return this.getBase();
    }

    getNumberedOrMatched(filterNum, matcherArgs) {
        return this.numbered.has(filterNum) ?
            this.getNumbered(filterNum) :
            this.getMatched(matcherArgs);
    }
}

export default class TypeMap {
    constructor() {
        this._map = new Map();
    }

    setBase(key, base) {
        this._getItem(key).setBase(base);
    }

    setNumbered(key, customBase, filterNum) {
        this._getItem(key).addNumbered(customBase, filterNum);
    }

    setMatched(key, customBase, matcher) {
        this._getItem(key).addMatcher(customBase, matcher);
    }


    getBase(key) {
        return this._getItem(key).getBase();
    }

    getNumbered(key, filterNum) {
        return this._getItem(key).getNumbered(filterNum);
    }

    getMatched(key, ...matcherArgs) {
        return this._getItem(key).getMatched(matcherArgs);
    }

    getNumberedOrMatched(key, number, ...matcherArgs) {
        return this._getItem(key).getNumberedOrMatched(number, matcherArgs);
    }

    _getItem(key) {
        if (key === undefined || key === null)
            throw new Error("invalid TypeMap key: " + key);
        if (!this._map.has(key)) {
            this._map.set(key, new MapItem(key));
        }
        return this._map.get(key);
    }
}
