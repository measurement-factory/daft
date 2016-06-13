import { Defaults } from "./SettingsParser";
import { Must } from "../../misc/Gadgets";
import Field from "../Field";

function FieldSize(field) {
    return field.name.length + field.value.length + 32;
}

class HpackTable {
    constructor(firstIndex, tableCapacity) {
        this.firstIndex = firstIndex;
        this._table = [];

        this._size = 0;

        this._tableCapacity = tableCapacity; // bytes
    }

    get lastIndex() {
        return this.firstIndex + this._table.length - 1;
    }

    add(field) {
        let fieldSize = FieldSize(field);

        // Adding an entry whose size is larger than the table capacity
        // results in an empty table
        // See RFC 7541 Section 4.4
        if (fieldSize > this._tableCapacity) {
            this._size = 0;
            this._table = [];
        } else {
            this._size += fieldSize;
            this._resize();
            this._table.push(field);
        }
    }

    _resize() {
        while (this._size > this._tableCapacity) {
            this._remove();
        }
    }

    _remove() {
        let entry = this._table.pop();
        this._size -= FieldSize(entry);
    }

    get tableCapacity() {
        return this._tableCapacity;
    }

    set tableCapacity(value) {
        this._tableCapacity = value;
        this._resize();
    }

    fieldAt(index) {
        Must(this.hasIndex(index));
        return this._table[index];
    }

    has(index) {
        return this.firstIndex <= index && index < this.lastIndex;
    }
}

class StaticHpackTable extends HpackTable {
    constructor() {
        super(1, 2636); // capacity was computed manually from static table below

        // Static Table, see RFC 7541 Appendix A.
        [
            /* 1  */ [":authority", ""],
            /* 2  */ [":method", "GET"],
            /* 3  */ [":method", "POST"],
            /* 4  */ [":path", "/"],
            /* 5  */ [":path", "/index.html"],
            /* 6  */ [":scheme", "http"],
            /* 7  */ [":scheme", "https"],
            /* 8  */ [":status", "200"],
            /* 9  */ [":status", "204"],
            /* 10 */ [":status", "206"],
            /* 11 */ [":status", "304"],
            /* 12 */ [":status", "400"],
            /* 13 */ [":status", "404"],
            /* 14 */ [":status", "500"],
            /* 15 */ ["accept-charset", ""],
            /* 16 */ ["accept-encoding", "gzip, deflate"],
            /* 17 */ ["accept-language", ""],
            /* 18 */ ["accept-ranges", ""],
            /* 19 */ ["accept", ""],
            /* 20 */ ["access-control-allow-origin", ""],
            /* 21 */ ["age", ""],
            /* 22 */ ["allow", ""],
            /* 23 */ ["authorization", ""],
            /* 24 */ ["cache-control", ""],
            /* 25 */ ["content-disposition", ""],
            /* 26 */ ["content-encoding", ""],
            /* 27 */ ["content-language", ""],
            /* 28 */ ["content-length", ""],
            /* 29 */ ["content-location", ""],
            /* 30 */ ["content-range", ""],
            /* 31 */ ["content-type", ""],
            /* 32 */ ["cookie", ""],
            /* 33 */ ["date", ""],
            /* 34 */ ["etag", ""],
            /* 35 */ ["expect", ""],
            /* 36 */ ["expires", ""],
            /* 37 */ ["from", ""],
            /* 38 */ ["host", ""],
            /* 39 */ ["if-match", ""],
            /* 40 */ ["if-modified-since", ""],
            /* 41 */ ["if-none-match", ""],
            /* 42 */ ["if-range", ""],
            /* 43 */ ["if-unmodified-since", ""],
            /* 44 */ ["last-modified", ""],
            /* 45 */ ["link", ""],
            /* 46 */ ["location", ""],
            /* 47 */ ["max-forwards", ""],
            /* 48 */ ["proxy-authenticate", ""],
            /* 49 */ ["proxy-authorization", ""],
            /* 50 */ ["range", ""],
            /* 51 */ ["referer", ""],
            /* 52 */ ["refresh", ""],
            /* 53 */ ["retry-after", ""],
            /* 54 */ ["server", ""],
            /* 55 */ ["set-cookie", ""],
            /* 56 */ ["strict-transport-security", ""],
            /* 57 */ ["transfer-encoding", ""],
            /* 58 */ ["user-agent", ""],
            /* 59 */ ["vary", ""],
            /* 60 */ ["via", ""],
            /* 61 */ ["www-authenticate", ""]
        ].forEach(([name, value]) => this.add(new Field(name, value)));
    }
}

export const StaticTable = new StaticHpackTable();

export default class DynamicHpackTable extends HpackTable {
    constructor() {
        super(StaticTable.lastIndex + 1, Defaults.SETTINGS_HEADER_TABLE_SIZE);
    }
}
