import { encode as huffmanEncode } from "./HuffmanStringParser";
import BinaryPacker from "./BinaryPacker";

export default class HeaderPacker {
    constructor() {
        this._packer = new BinaryPacker();
    }

    raw() {
        return this._packer.raw();
    }

    _HPackString(str, huffman = false) {
        if (huffman) {
            let packed = huffmanEncode(str);
            this._HPackNumber(1, 1, packed.length);
            this._packer.in(packed, "Huffman String");
        } else {
            this._HPackNumber(0, 1, str.length);
            this._packer.in(str, "HPack String value");
        }
    }

    _HPackNumber(head, headLength, number) {
        const maxPrefix = 0xFF >>> headLength;
        if (number < maxPrefix) {
            this._packer.uint8(head << (8 - headLength) | number, `HPackNumber: ${head} + ${number}`);
        } else {
            this._packer.uint8(head << (8 - headLength) | maxPrefix, `HPackNumber: ${head} + ${8 - headLength} Ones`);

            number -= maxPrefix;

            while (number >= 128) {
                this._packer.uint8((number % 128) + 128, `HPACK Head Bit + HPACK Number Part = ${number % 128} + ${128}`);
                number = Math.floor(number / 128);
            }

            this._packer.uint1p7(0, number, "HPACK Head Bit", "HPACK Number Part");
        }
    }

    // XXX: Maybe add a header packing function that will dynamically choose
    //      the best representation given current dynamic [and static] table
    //      state.

    indexedHeaderField(index) {
        this._HPackNumber(1, 1, index);
    }

    // XXX: Alter dynamic table
    literalHeaderFieldIncrementalIndexing({ index = 0, name, value }) {
        this._HPackNumber(0b01, 2, index);
        if (index !== 0) this._HPackString(name);
        this._HPackString(value);
    }

    literalHeaderFieldWithoutIndexing({ index = 0, name, value }) {
        this._HPackNumber(0, 4, index);
        if (index !== 0) this._HPackString(name);
        this._HPackString(value);
    }

    literalHeaderFieldNeverIndexed({ index = 0, name, value }) {
        this._HPackNumber(0b0001, 4, index);
        if (index !== 0) this._HPackString(name);
        this._HPackString(value);
    }

    // XXX: New size must be lower than or equal to the limit set by the
    //      SETTINGS_HEADER_TABLE_SIZE parameter.
    //      See RFC 7540 Section 6.5.2 and RFC 7541 Section 6.3.
    dynamicTableSizeUpdate(size) {
        this._HPackNumber(0b001, size);
    }
}
