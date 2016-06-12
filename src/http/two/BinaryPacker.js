import { Must, RawToHex } from "../../misc/Gadgets";

export default class BinaryPacker {
    constructor() {
        this._data = new Buffer("", "binary");
    }

    raw() {
        return this._data.toString("binary");
    }

    bytes(raw, desc) {
        Must(typeof raw === "string");
        this._data = Buffer.concat([this._data, Buffer.from(raw, "binary")]);
        this._packed(raw, raw.length, desc);
    }

    _packed(value, size, desc) {
        console.log(`${desc} = ${typeof value === "number" ? value : RawToHex(value)};`, size, "bytes long");
    }

    uint(value, size, desc) {
        let buf = Buffer.alloc(size);
        buf.writeUIntBE(value, 0, size);
        this.bytes(buf.toString("binary"), desc);
    }

    uint8(value, desc) {
        this.uint(value, 1, desc);
    }

    uint1p7(headValue, tailValue, headDesc, tailDesc) {
        const headBit = headValue ? 0b1 : 0b0;
        this._packed(headBit, 0, headDesc);
        this._packed(tailValue, 1, tailDesc);
        this.uint8((headBit << 7 | tailValue) >>> 0, `Combo: ${headDesc} + ${tailDesc}`);
    }

    uint16(value, desc) {
        this.uint(value, 2, desc);
    }

    uint24(value, desc) {
        this.uint(value, 3, desc);
    }

    uint32(value, desc) {
        this.uint(value, 4, desc);
    }

    // Pack 32 bits, with the first bit passed separately.
    uint1p31(headValue, tailValue, headDesc, tailDesc) {
        const headBit = headValue ? 0b1 : 0b0;
        // Remove signedness of the number by zero-shifting it 0 bits to the right.
        this.uint32((headBit << 31 | tailValue) >>> 0, `Combo: ${headDesc} + ${tailDesc}`);
    }
}
