import BinaryTokenizer from "./BinaryTokenizer";
import { Must, PrettyMime } from "../../misc/Gadgets";
import bigInt from "big-integer";
import { decode as decodeHuffman } from "./HuffmanStringParser";
import { requestPrefix } from "../one/MessageWriter";

export const HeaderFlagEnd = 0x4;
export const HeaderFlagPadded = 0x8;
export const HeaderFlagPriority = 0x20;

// Static Table for Header Name:Value mappings
const staticTable = [
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
];

const bigTwo = bigInt(2);

export default class HeadersParser {
    constructor(message) {
        this._message = message;

        this.dynamicTable = [];
        this._maxDynamicSize = 4096;
        this.fragments = "";
    }

    get maxDynamicSize() {
        return this._maxDynamicSize;
    }

    set maxDynamicSize(value) {
        this._maxDynamicSize = value;
        this.maybeDropDynamicTableElements();
    }

    get _dynamicTableSize() {
        let size = 0;
        for (let [name, value] of this.dynamicTable) {
            size += name.length + value.length;
        }
        return size;
    }

    addDynamicTableEntry(name, value = "") {
        this.dynamicTable.unshift([name, value]);

        while (this._dynamicTableSize > this.maxDynamicSize) {
            this.dynamicTable.pop();
        }
    }

    getHeaderAt(index) {
        if (1 <= index && index <= staticTable.length) {
            return staticTable[index - 1];
        } else if (staticTable.length < index && index <= this.dynamicTable.length) {
            return this.dynamicTable[index - staticTable.length - 1];
        } else {
            Must(false, `HPACK Decoding Error: index ${index} out of table bounds`);
        }
    }

    parseHpackInteger(tok, value, length) {
        if (value < 2 ** length - 1) {
            return value;
        } else {
            Must(value === 2 ** length - 1, `Value = ${value}, expected ${2 ** length - 1}`);

            console.log("starting long parsing of hpack integer");

            let exponent = 0;
            let next;
            value = bigInt(value);
            do {
                next = tok.uint8("HPACK integer");
                value = value.add(bigInt(next & 127).multiply(bigTwo.pow(exponent)));
                exponent += 7;
            } while ((next & 128) === 128);

            let bigValue = value;
            let unsafeValue = bigValue.toJSNumber();

            Must(Number.MIN_SAFE_INTEGER <= unsafeValue && unsafeValue <= Number.MAX_SAFE_INTEGER,
                "HPACK Integer must be within min/max bounds: " +
                `${Number.MIN_SAFE_INTEGER} <= ${unsafeValue} <= ${Number.MAX_SAFE_INTEGER}`);

            return unsafeValue;
        }
    }

    parseHpackString(tok) {
        let head = tok.uint1p7("Huffman", "HPACK String length");
        let length = this.parseHpackInteger(tok, head.tail, 7);

        if (head.head === 0) {
            return tok.area(length, "HPACK string");
        } else {
            return decodeHuffman(tok.area(length, "HPACK string (huffman encoded)"), length);
        }
    }

    processField(name, value) {
        if (name === ":method") {
            this._message.startLine.method = value;
        } else if (name === ":scheme") {
            this._message.startLine.uri.scheme = value;
        } else if (name === ":authority") {
            let colonIndex = value.lastIndexOf(":");
            if (colonIndex === -1) {
                this._message.startLine.uri.host = value;
            } else {
                this._message.startLine.uri.host = value.substring(0, colonIndex);
                this._message.startLine.uri.port = value.substring(colonIndex + 1);
            }
        } else if (name === ":path") {
            this._message.startLine.uri.path = value;
        } else {
            this._message.header.add(name, value);
        }
    }

    parseHeaderPayload() {
        let tok = new BinaryTokenizer(this.fragments);

        while (!tok.atEnd()) {
            let head = tok.uint8("HPACK head");

            // indexed header field
            if (head >>> 7 === 1) {
                let index = this.parseHpackInteger(tok, head & 0b01111111, 7);

                let [name, value] = this.getHeaderAt(index);
                this.processField(name, value);
            }
            // literal header field with incremental indexing
            else if (head >>> 6 === 1) {
                let index = head & 0b00111111;

                let name;
                if (index === 0) {
                    name = this.parseHpackString(tok);
                } else { // name is indexed
                    name = this.getHeaderAt(this.parseHpackInteger(tok, index, 6))[0];
                }

                let value = this.parseHpackString(tok);

                this.addDynamicTableEntry(name, value);
                this.processField(name, value);
            }
            // literal header field without indexing
            else if (head >>> 4 === 0) {
                let index = head & 0b00001111;

                let name;
                if (index === 0) {
                    name = this.parseHpackString(tok);
                } else { // name is indexed
                    name = this.getHeaderAt(this.parseHpackInteger(tok, index, 4))[0];
                }

                this.processField(name, this.parseHpackString(tok));
            }
            // literal header field never indexed
            // XXX: Same as w/o indexing (only entry condition different) but
            //      with need to keep it's never-indexed state around.
            //      See RFC 7541 Sec 6.2.3.
            //
            //      "Intermediaries MUST use the same representation for
            //      encoding this header field."
            else if (head >>> 4 === 1) {
                let index = head & 0b00001111;

                let name;
                if (index === 0) {
                    name = this.parseHpackString(tok);
                } else { // name is indexed
                    name = this.getHeaderAt(this.parseHpackInteger(tok, index, 4))[0];
                }

                this.processField(name, this.parseHpackString(tok));
            }
            // dynamic table size update
            else if (head >>> 5 === 1) {
                let maxSize = this.parseHpackInteger(tok, head & 0b00011111, 5);

                this.maxDynamicSize = maxSize;
                while (this._dynamicTableSize > this.maxDynamicSize) {
                    this.dynamicTable.pop();
                }

                // XXX: Properly handle the below MUST from RFC 7541
                // The new maximum size MUST be lower than or equal to the
                // limit determined by the protocol using HPACK.  A value that
                // exceeds this limit MUST be treated as a decoding error. In
                // HTTP/2, this limit is the last value of the
                // SETTINGS_HEADER_TABLE_SIZE parameter (see Section 6.5.2 of
                // [HTTP2]) received from the decoder and acknowledged by the
                // encoder (see Section 6.5.3 of [HTTP2]).
            } else {
                Must(false, "Invalid Header Field", head.toString(2));
            }
        }
    }

    parseHeaderFrame(frame) {
        Must(frame.streamIdentifier !== 0, "PROTOCOL_ERROR"); // RFC 7540 Section 6.2

        let tok = new BinaryTokenizer(frame.payload);

        let padLength = frame.isSet(HeaderFlagPadded) ?
            tok.uint8("Pad length") : 0;

        // RFC 7540 Section 6.1, referenced from RFC 7540 Section 6.2.
        Must(padLength <= frame.payload.length, "PROTOCOL_ERROR");

        if (frame.isSet(HeaderFlagPriority)) {
            /*let { head: exclusive, tail: streamDep } = */tok.uint1p31("E", "Stream dependency");
            /*let weight = */tok.uint8("Weight");
        }

        let fragmentLength = tok.leftovers().length - padLength;
        let headerBlockFragment = tok.area(fragmentLength, "Header block fragment");

        tok.skip(padLength, "Padding");
        Must(tok.atEnd());

        // 6.1 Indexed Header Field Representation
        // 1; Index: Integer: 7-bit prefix
        // 01; Index: Integer: 6-bit prefix
        // 0000; index int 4-bit prefix
        // 0001; index int 4-bit prefix
        // 001: Max size 5+

        this.addFragment(headerBlockFragment, frame);

        // RFC 7540 Section 6.1 says "A receiver is not obligated to verify
        // padding but MAY treat non-zero padding as a connection error
        // (Section 5.4.1) of type PROTOCOL_ERROR." Is this relevant for
        // header frames? Do we treat it as a PROTOCOL_ERROR?
    }

    parseContinuationFrame(frame) {
        Must(frame.streamIdentifier !== 0, "PROTOCOL_ERROR"); // RFC 7540 Section 6.10

        this.addFragment(frame.payload, frame);
    }

    addFragment(fragment, frame) {
        this.fragments += fragment;

        if (frame.isSet(HeaderFlagEnd)) {
            this.parseHeaderPayload();
            this._message.finalize();
            let parsed = requestPrefix(this._message);
            console.log(`parsed ${parsed.length} request header bytes:\n` +
                PrettyMime(">s ", parsed));
        }
    }
}
