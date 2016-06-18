import { PrettyRaw } from "../../misc/Gadgets";

export class InsufficientInputError extends Error {}
export class WrongSkipError {
    constructor(message) {
        this.message = message;
    }
}

export default class BinaryTokenizer {
    constructor(data = "") {
        this._data = data;
        this._parsed = 0;
    }

    consumeParsed() {
        this._data = this.leftovers();
        this._parsed = 0;
    }

    context() {
        return `at ${this._parsed}.`;
    }

    in(data) {
        this._data += data;
        console.log(`Added ${data.length} bytes, now ${this._data.length} bytes.`);
    }

    _want(size, desc) {
        if (this._parsed + size > this._data.length) {
            throw new InsufficientInputError(
                `Need ${this._parsed + size - this._data.length} more ` +
                `bytes for ${desc} of size ${size} ${this.context()}`);
        }
    }

    get(size, desc) {
        this._want(size, desc);
        const value = this._data.substring(this._parsed, this._parsed + size);

        this._got(value, size, desc);
        this._parsed += size;

        return value;
    }

    _got(value, size, desc) {
        console.log(`got ${desc} = ${PrettyRaw(value).numAsNum().hex()}, occupying ${size} bytes ${this.context()}`);
    }

    area(size, desc) {
        return this.get(size, desc);
    }

    skip(size, desc) {
        this.get(size, desc);
    }

    skipExact(data, desc) {
        const result = this.area(data.length, desc);
        if (result !== data) {
            this._parsed -= data.length;
            throw new WrongSkipError(`Expected ${PrettyRaw(data).hex()}, got ${PrettyRaw(result).raw()} while skipping ${desc} ${this.context()}`);
        }
    }

    // Returns the next byte interpreted as a number.
    // Does not do bounds checking.
    octet() {
        return Buffer(this._data[this._parsed++], "binary").readUInt8(0);
    }

    uint8(desc) {
        this._want(1, desc);
        const result = this.octet();
        this._got(result, 1, desc);
        return result;
    }

    uint1p7(headDesc, tailDesc) {
        const result = this.uint8(`Combo: ${headDesc} + ${tailDesc}`);
        const head = result >>> 7;
        const tail = result & 0b01111111;

        this._got(head, 0, headDesc);
        this._got(tail, 1, tailDesc);

        return { head, tail };
    }

    _getNumber(bits) {
        let number = 0;
        for (let i = bits - 8; i >= 0; i -= 8) {
            number |= this.octet() << i;
        }
        return number;
    }

    uint16(desc) {
        this._want(2, desc);
        const result = this._getNumber(16);
        this._got(result, 2, desc);
        return result;
    }

    uint24(desc) {
        this._want(3, desc);
        const result = this._getNumber(24);
        this._got(result, 3, desc);
        return result;
    }

    uint32(desc) {
        this._want(4, desc);
        const result = this._getNumber(32);
        this._got(result, 4, desc);
        return result;
    }

    // Get 32 bits, returning first bit and the rest of the bits separately.
    uint1p31(headDesc, tailDesc) {
        const result = this.uint32(`Combo: ${headDesc} + ${tailDesc}`);
        const head = result >>> 31;
        const tail = result & ~(1 << 31);

        this._got(head, 0, headDesc);
        this._got(tail, 4, tailDesc);

        return { head, tail };
    }

    atEnd() {
        return this._parsed >= this._data.length;
    }

    leftovers() {
        return this._data.substring(this._parsed);
    }
}
