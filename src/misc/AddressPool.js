/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

// Manages a pool of unique host:port addresses.

import { Must} from "./Gadgets";
import * as Config from "./Config";

// a member of the address pool
class AddressMapItem {
    constructor(address, reusable = true) {
        this.address = address;
        this.reusable = reusable;
        this.available = false;
    }

    key() {
        return AddressMapItem.Key(this.address);
    }

    static Key(addr) {
        Must(addr);
        return addr.host + ':' + addr.port;
    }
}

export default class AddressPool {
    constructor() {
        this._map = new Map();
        this._nextPort = Config.OriginAuthority.port;
    }

    reserveGiven(addr) {
        const oldItem = this._map.get(AddressMapItem.Key(addr));
        if (oldItem) {
            Must(oldItem.available);
            oldItem.available = false;
        } else {
            let newItem = new AddressMapItem(addr, false);
            this._map.set(newItem.key(), newItem);
        }
        return addr;
    }

    reserveAny() {
        for (let oldItem of this._map.values()) {
            if (oldItem.available) {
                oldItem.available = false;
                return oldItem.address;
            }
        }

        // no old usable address; allocate a new one
        let addr = {
            host: Config.OriginAuthority.host,
            port: this._nextPort++
        };
        let newItem = new AddressMapItem(addr, true);
        this._map.set(newItem.key(), newItem);
        return addr;
    }

    // undo reserve*()
    release(addr) {
        Must(addr);
        const key = AddressMapItem.Key(addr);
        let mapItem = this._map.get(key);
        Must(mapItem);
        Must(!mapItem.available);
        if (mapItem.reusable)
            mapItem.available = true;
        else
            this._map.remove(key);
    }
}
