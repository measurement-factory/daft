import { Must } from "../../misc/Gadgets";

export default class BinaryPacker {
    constructor() {
        this._data = new Buffer("", "binary");
    }

    binToHex(text) {
        return Buffer(text, "binary").toString("hex");
    }

    raw() {
        return this._data.toString("binary");
    }

    consume(length) {
        let buf = new Buffer("", "binary");
        Must(this._data.copy(buf, 0, 0, length) === length);
        this._data = buf;
    }

    in(data, desc) {
        this._data += data;
        this.put(data, data.length, desc);
    }

    put(value, size, desc) {
        console.log(`${desc} = ${typeof value === "number" ? value : this.binToHex(value)};`, size, "bytes long");
    }

    area(value, size, desc) {
        let buf = Buffer.alloc(size);
        buf.writeUIntBE(value, 0, size);
        this._data = Buffer.concat([this._data, buf]);
        this.put(value, size, desc);
    }

    uint8(value, desc) {
        this.area(value, 1, desc);
    }

    uint1p7(headValue, tailValue, headDesc, tailDesc) {
        let headBit = headValue ? 0b1 : 0b0;
        this.put(headBit, 0, headDesc);
        this.put(tailValue, 1, tailDesc);
        this.uint8((headBit << 7 | tailValue) >>> 0, `Combo: ${headDesc} + ${tailDesc}`);
    }

    uint16(value, desc) {
        this.area(value, 2, desc);
    }

    uint24(value, desc) {
        this.area(value, 3, desc);
    }

    uint32(value, desc) {
        this.area(value, 4, desc);
    }

    // XXX fix comment
    // We want 31 bits, but since we can only access in bytes, we need to get
    // 32 bits (4 bytes) and then set the first bit to 0.
    uint1p31(headValue, tailValue, headDesc, tailDesc) {
        const headBit = headValue ? 0b1 : 0b0;
        // Remove signedness of the number by 0-shifting it to the right.
        this.uint32((headBit << 31 | tailValue) >>> 0, `Combo: ${headDesc} + ${tailDesc}`);
    }
}
