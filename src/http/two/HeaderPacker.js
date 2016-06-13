import { Must, MustFit } from "../../misc/Gadgets";
import { encode as huffmanEncode } from "./HuffmanStringParser";
import BinaryPacker from "./BinaryPacker";

export default class HeaderPacker {
    constructor() {
        this._packer = new BinaryPacker();
    }

    raw() {
        return this._packer.raw();
    }

    _string(str, huffman = false) {
        if (huffman) {
            const packed = huffmanEncode(str);
            this._number(1, packed.length, 7);
            this._packer.bytes(packed, "Huffman String");
        } else {
            this._number(0, str.length, 7);
            this._packer.bytes(str, "HPack String value");
        }
    }

    // head represents leading same-octet bits before the HPACK number
    // see "?" bits in RFC 7541 (HPACK) Section 5.1.  Integer Representation
    // prefixLength is the number of bits "N" in the same RFC section
    _number(head, number, prefixLength) {
        Must(1 <= prefixLength && prefixLength <= 8);

        const headLength = 8 - prefixLength;
        const maxPrefix = 0xFF >>> headLength;

        MustFit(head, headLength);
        Must(number >= 0);

        // XXX: Add descriptions for head and number to call signature

        if (number < maxPrefix) {
            this._packer.uint8lr(head, headLength, "Head", number, "HPACK Number");
        } else {
            this._packer.uint8lr(head, headLength, "Head", maxPrefix, "HPACK Number Prefix");

            number -= maxPrefix;

            while (number >= 128) {
                this._packer.uint1p7(1, number % 128, "HPACK Continuation", "HPACK Number Part");
                number = number >>> 7; // number / 128 without floating point division.
            }

            this._packer.uint1p7(0, number, "HPACK Continuation", "HPACK Number Part");
        }
    }

    // XXX: Add a headerField(field, addNameToIndexIfNeeded = false, addValueToIndexIfNeeded = false)
    //      method for high-level callers that just want to send a header
    //      field and do not care how it is done.

    indexedHeaderField(index) {
        this._number(0b1, index, 7);
    }

    // TODO: Update the dynamic table so that we can send dynamically indexed fields.
    literalHeaderFieldIncrementalIndexing(field, index = 0) {
        this._number(0b01, index, 6);
        if (index === 0) this._string(field.name);
        this._string(field.value);
    }

    literalHeaderFieldWithoutIndexing(field, index = 0) {
        this._number(0b0000, index, 4);
        if (index === 0) this._string(field.name);
        this._string(field.value);
    }

    literalHeaderFieldNeverIndexed(field, index = 0) {
        this._number(0b0001, index, 4);
        if (index === 0) this._string(field.name);
        this._string(field.value);
    }

    // TODO: New size must be lower than or equal to the limit set by the
    //      SETTINGS_HEADER_TABLE_SIZE parameter.
    //      See RFC 7540 Section 6.5.2 and RFC 7541 Section 6.3.
    dynamicTableSizeUpdate(size) {
        this._number(0b001, size, 5);
    }
}
