import BinaryTokenizer from "./BinaryTokenizer";
import { Must } from "../../misc/gadgets";
import table from "./HpackHuffmanTable";

function binaryStr(number, length) {
    let str = number.toString(2);
    return "0".repeat(length - str.length) + str;
}

function getBit(value, length, index) {
    return parseInt(binaryStr(value, length).charAt(index), 10);
}

function tree(table, char) {
    function partition(data, condition) {
        let a = [];
        let b = [];
        for (let i = 0; i < data.length; i++) {
            let item = data[i];
            if (condition(item)) {
                a.push(item);
            } else {
                b.push(item);
            }
        }

        return [a, b];
    }


    function nestify(row, charIndex) {
        if (charIndex === row.len) {
            return row;
        }

        return { [getBit(row.binval, row.len, charIndex)]: nestify(row, charIndex + 1) };
    }

    Must(table.length > 0);

    if (table.length === 1) {
        return nestify(table[0], char);
    }

    let [zero, one] = partition(table, row => {
        return getBit(row.binval, row.len, char) === 0;
    });

    let ret = {};

    if (zero.length > 0) {
        ret[0] = tree(zero, char + 1);
    }
    if (one.length > 0) {
        ret[1] = tree(one, char + 1);
    }

    return ret;
}

let hTree = tree(table, 0);

export default function parseString(data) {
    let tok = new BinaryTokenizer(data);
    let parsed = "";

    let atBit = 0;
    let current = hTree;
    let nextByte = tok.uint8("Huffman String Byte");

    // XXX: RFC 7540 Sec 5.2 asserts that the padding must be all 1s; check for this

    while (atBit < 8 || !tok.atEnd()) {
        while (current.len === undefined) {
            current = current[getBit(nextByte, 8, atBit)];
            atBit += 1;

            if (atBit === 8) {
                if (tok.atEnd()) {
                    break;
                } else {
                    atBit = 0;
                    nextByte = tok.uint8("Huffman String Byte");
                }
            }
        }

        if (current && current.len) {
            parsed += String.fromCodePoint(current.value);
        }
        current = hTree;
    }

    return parsed;
}
