import BinaryTokenizer from "./BinaryTokenizer";
import { Must, PrettyMime } from "../../misc/Gadgets";
import bigInt from "big-integer";
import { decode as decodeHuffman } from "./Huffman";
import { requestPrefix } from "../one/MessageWriter";
import DynamicHpackTable, { StaticTable } from "./HpackTable";
import Field from "../Field";

export const HeaderFlagEnd = 0x4;
export const HeaderFlagPadded = 0x8;
export const HeaderFlagPriority = 0x20;

const bigTwo = bigInt(2);

export default class HeadersParser {
    constructor(message, settings) {
        this._message = message;

        this.settings = settings;
        this.dynamicTable = new DynamicHpackTable();

        this.tok = null;

        this.fragments = "";
    }

    fieldAt(index) {
        return StaticTable.hasIndex(index) ?
            StaticTable.fieldAt(index) :
            this.dynamicTable.fieldAt(index);
    }

    parseHpackInteger(tok, value, length) {
        if (value < 2 ** length - 1)
            return value;

        Must(value === 2 ** length - 1, `Value = ${value}, expected ${2 ** length - 1}`);

        let exponent = 0;
        let next;
        value = bigInt(value);
        do {
            next = tok.uint8("HPACK integer");
            value = value.add(bigInt(next & 127).multiply(bigTwo.pow(exponent)));
            exponent += 7;
        } while ((next & 128) === 128);

        const bigValue = value;
        const unsafeValue = bigValue.toJSNumber();

        Must(Number.MIN_SAFE_INTEGER <= unsafeValue && unsafeValue <= Number.MAX_SAFE_INTEGER,
            "HPACK Integer must be within min/max bounds: " +
            `${Number.MIN_SAFE_INTEGER} <= ${unsafeValue} <= ${Number.MAX_SAFE_INTEGER}`);

        return unsafeValue;
    }

    parseHpackString(tok) {
        const head = tok.uint1p7("Huffman", "HPACK String length");
        const length = this.parseHpackInteger(tok, head.tail, 7);

        if (head.head === 0) {
            return tok.area(length, "HPACK string");
        } else {
            return decodeHuffman(tok.area(length, "HPACK string (huffman encoded)"), length);
        }
    }

    processField(field) {
        // TODO: check that all pseudo-header fields are defined exactly once

        let name = field.name;
        let value = field.value;
        if (name === ":method") {
            this._message.startLine.method = value;
        } else if (name === ":scheme") {
            this._message.startLine.uri.scheme = value;
        } else if (name === ":authority") {
            const colonIndex = value.lastIndexOf(":");
            if (colonIndex === -1) {
                this._message.startLine.uri.host = value;
            } else {
                this._message.startLine.uri.host = value.substring(0, colonIndex);
                this._message.startLine.uri.port = value.substring(colonIndex + 1);
            }
        } else if (name === ":path") {
            this._message.startLine.uri.path = value;
        } else if (name === ":status") {
            this._message.startLine.statusCode = value;
        } else {
            this._message.header.add(field);
        }
    }

    parseLiteralFieldName(head, indexBits) {
        const rightBits = (2 ** indexBits) - 1;
        const index = head & rightBits;
        const name = index === 0 ?
            this.parseHpackString(this.tok) :
            this.fieldAt(this.parseHpackInteger(this.tok, index, indexBits)).name;
        const value = this.parseHpackString(this.tok);

        return new Field(name, value);
    }

    parseHeaderPayload() {
        this.tok = new BinaryTokenizer(this.fragments);

        while (!this.tok.atEnd()) {
            const head = this.tok.uint8("HPACK head");

            // dynamic table size update
            if (head >>> 5 === 0b001) {
                // XXX: Properly handle the below MUST from RFC 7541
                // The new maximum size MUST be lower than or equal to the
                // limit determined by the protocol using HPACK.  A value that
                // exceeds this limit MUST be treated as a decoding error. In
                // HTTP/2, this limit is the last value of the
                // SETTINGS_HEADER_TABLE_SIZE parameter (see Section 6.5.2 of
                // [HTTP2]) received from the decoder and acknowledged by the
                // encoder (see Section 6.5.3 of [HTTP2]).

                let capacity = this.parseHpackInteger(this.tok, head & 0b00011111, 5);
                Must(capacity <= this.settings.get("SETTINGS_HEADER_TABLE_SIZE"));
                this.dynamicTable.capacity = capacity;
                continue;
            }

            let field;

            // indexed header field
            if (head >>> 7 === 0b1) {
                field = this.fieldAt(this.parseHpackInteger(this.tok, head & 0b01111111, 7));
            }
            // literal header field with incremental indexing
            else if (head >>> 6 === 0b01) {
                field = this.parseLiteralFieldName(head, 6);
                this.dynamicTable.add(field);
            }
            // literal header field without indexing
            else if (head >>> 4 === 0b0000) {
                field = this.parseLiteralFieldName(head, 4);
            }
            // literal header field never indexed
            // TODO: Add flag to Field which keeps track of whether
            //       it is a never-indexed field per RFC 7541 Section 6.2.3.
            else if (head >>> 4 === 0b0001) {
                field = this.parseLiteralFieldName(head, 4);
            } else {
                Must(false, "Invalid Header Field", head.toString(2));
            }

            this.processField(field);
        }
    }

    parseHeaderFrame(frame) {
        Must(frame.streamIdentifier !== 0, "PROTOCOL_ERROR"); // RFC 7540 Section 6.2

        let tok = new BinaryTokenizer(frame.payload);

        const padLength = frame.isSet(HeaderFlagPadded) ?
            tok.uint8("Pad length") : 0;


        if (frame.isSet(HeaderFlagPriority)) {
            /*let { head: exclusive, tail: streamDep } = */tok.uint1p31("E", "Stream dependency");
            /*let weight = */tok.uint8("Weight");
        }

        const leftoverLength = tok.leftovers().length;

        // RFC 7540 Section 6.1, referenced from RFC 7540 Section 6.2.
        Must(padLength <= leftoverLength, "PROTOCOL_ERROR");

        const fragmentLength = leftoverLength - padLength;
        const fragment = tok.area(fragmentLength, "Header block fragment");

        tok.skip(padLength, "Padding");
        Must(tok.atEnd());

        this.addFragment(fragment, frame);

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
            const parsed = requestPrefix(this._message);
            console.log(`parsed ${parsed.length} request header bytes:\n` +
                PrettyMime(">s ", parsed));
        }
    }
}
