export class InsufficientInputError extends Error {}
export class WrongSkipError {
    constructor(intendedSkip, actuallySkipped, ...args) {
        this.intendedSkip = intendedSkip;
        this.actuallySkipped = actuallySkipped;
        this.message = args.join(" ");
    }
}

export default class BinaryTokenizer {
    constructor(data = "") {
        this._data = data;
        this._parsed = 0;
        this._commitPoint = 0;
    }

    commit() {
        this._commitPoint = this._parsed;
    }

    rollback() {
        this._parsed = this._commitPoint;
    }

    binToHex(text) {
        return Buffer(text, "binary").toString("hex");
    }

    context() {
        return `at ${this._parsed} out of ${this._data.length}`;
    }

    in(data) {
        this._data += data;
    }

    want(size, desc) {
        if (this._parsed + size > this._data.length) {
            throw new InsufficientInputError(
                `Need ${this._parsed + size - this._data.length} more ` +
                `bytes for ${desc} of size ${size}; ${this.context()}`);
        }
    }

    get(size, desc) {
        this.want(size, desc);
        let value = this._data.substring(this._parsed, this._parsed + size);

        this.got(value, size, desc);
        this._parsed += size;

        return value;
    }

    got(value, size, desc) {
        console.log(`${desc} = ${typeof value === "number" ? value : this.binToHex(value)};`, size, "bytes long, at",
            this._parsed, "-", this._parsed + size, "out of", this._data.length);
    }

    area(size, desc) {
        return this.get(size, desc);
    }

    skip(size, desc) {
        this.want(size, desc);
        this._parsed += 1;
    }

    skipExact(data, desc) {
        const result = this.area(data.length, desc);
        if (result !== data) {
            throw new WrongSkipError(data, result, `Expected ${this.binToHex(data)} got ${this.binToHex(result)}; while parsing ${desc}; ${this.context()}`);
        }
    }

    // Returns the next byte interpreted as a number.
    // Does not do bounds checking.
    octet() {
        return Buffer(this._data[this._parsed++], "binary").readUInt8(0);
    }

    uint8(desc) {
        this.want(1, desc);
        const result = this.octet();
        this.got(result, 1, desc);
        return result;
    }

    uint1p7(headDesc, tailDesc) {
        const result = this.uint8(`Combo: ${headDesc} + ${tailDesc}`);
        const head = result >>> 7;
        const tail = result & 0b01111111;

        this.got(head, 0, headDesc);
        this.got(tail, 1, tailDesc);

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
        this.want(2, desc);
        const result = this._getNumber(16);
        this.got(result, 2, desc);
        return result;
    }

    uint24(desc) {
        this.want(3, desc);
        const result = this._getNumber(24);
        this.got(result, 3, desc);
        return result;
    }

    uint32(desc) {
        this.want(4, desc);
        const result = this._getNumber(32);
        this.got(result, 4, desc);
        return result;
    }

    // Get 32 bits, returning first bit and the rest of the bits separately.
    uint1p31(headDesc, tailDesc) {
        const result = this.uint32(`Combo: ${headDesc} + ${tailDesc}`);
        const head = result >>> 31;
        const tail = result << 1;

        this.got(head, 0, headDesc);
        this.got(tail, 4, tailDesc);

        return { head, tail };
    }

    atEnd() {
        return this._parsed >= this._data.length;
    }

    leftovers() {
        return this._data.substring(this._parsed);
    }
}
