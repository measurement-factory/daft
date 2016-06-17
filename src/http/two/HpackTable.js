import { Defaults } from "./Settings";
import { Must } from "../../misc/Gadgets";
import Field from "../Field";

function FieldSize(field) {
    return field.name.length + field.value.length + 32;
}

class HpackTable {
    constructor(firstIndex, capacity) {
        this.firstIndex = firstIndex;
        this._fields = [];

        this._size = 0;

        this._capacity = capacity; // bytes
    }

    get lastIndex() {
        return this.firstIndex + this._fields.length - 1;
    }

    add(field) {
        const fieldSize = FieldSize(field);

        // Adding an entry whose size is larger than the table capacity
        // results in an empty table
        // See RFC 7541 Section 4.4
        this._fields.push(field);
        this._size += fieldSize;
        this._trimFat();
    }

    _trimFat() {
        while (this._size > this._capacity) {
            let entry = this._fields.pop();
            this._size -= FieldSize(entry);
        }
    }

    get capacity() {
        return this._capacity;
    }

    set capacity(value) {
        this._capacity = value;
        this._trimFat();
    }

    fieldAt(index) {
        Must(this.hasIndex(index), "Has field at", index);
        index -= this.firstIndex; // Internal representation starts at 0, so subtract startIndex.
        return this._fields[index];
    }

    hasIndex(index) {
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
        // XXX: Don't query default settings, query the latest settings.
        super(StaticTable.lastIndex + 1, Defaults.SETTINGS_HEADER_TABLE_SIZE);
    }
}
