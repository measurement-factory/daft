/* TypeMap: A registry for classes (types), with filter-driven search */

export default
class TypeMap {
    constructor() {
        this._map = new Map();
    }

    setBase(key, base) {
        this._getItem(key).setBase(base);
    }

    setNumbered(key, customBase, filterNum) {
        this._getItem(key).addNumbered(customBase, filterNum);
    }

    setMatching(key, customBase, matcher) {
        this._getItem(key).addMatcher(customBase, matcher);
    }


    getBase(key) {
        let mapItem = this._map.get(key);
        return mapItem ? mapItem.getBase(key) : key;
    }

    getNumbered(key, filterNum) {
        let mapItem = this._map.get(key);
        return mapItem ? mapItem.getNumbered(filterNum, this.getBase(key)) : key;
    }

    getMatching(key, ...matcherArgs) {
        let mapItem = this._map.get(key);
        return mapItem ? mapItem.getMatched(matcherArgs, this.getBase(key)) : key;
    }

    getNumberedOrMatching(key, number, ...matcherArgs) {
        let mapItem = this._map.get(key);
        if (mapItem) {
            let numberedResult = mapItem.getNumbered(number, null);
            return numberedResult ? numberedResult : this.getMatching(key, ...matcherArgs);
        } else {
            return key;
        }
    }

    _getItem(key) {
        if (!this._map.has(key)) {
            this._map.set(key, new MapItem());
        }
        return this._map.get(key);
    }
}

class MapItem {
    constructor() {
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


    getBase(defaultValue) {
        return this.base ? this.base : defaultValue;
    }

    getNumbered(filterNum, defaultValue) {
        let numbered = this.numbered;
        return numbered.has(filterNum) ? numbered.get(filterNum) : defaultValue;
    }

    getMatched(matcherArgs, defaultValue) {
        let matchers = this.matchers;
        for (let idx = 0; idx < matchers.length; idx++) {
            let { func, type } = matchers[idx];
            if (func(...matcherArgs)) {
                return type;
            }
        }
        return defaultValue;
    }
}
