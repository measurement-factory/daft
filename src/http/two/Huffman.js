import BinaryTokenizer from "./BinaryTokenizer";
import { Must } from "../../misc/gadgets";
import table from "./HpackHuffmanTable";

function getBit(value, length, index) {
    Must(length <= 32);
    return (value >>> (length - (index + 1))) & 1;
}

function tree(array, index) {
    function partition(data, condition) {
        let a = [];
        let b = [];
        for (const item of data) {
            if (condition(item)) {
                a.push(item);
            } else {
                b.push(item);
            }
        }

        return [a, b];
    }

    Must(array.length > 0);

    if (array.length === 1) return array[0];

    const [zero, one] = partition(array, row => {
        return getBit(row.encodedValue, row.len, index) === 0;
    });

    let ret = {};

    if (zero.length > 0) {
        ret[0] = tree(zero, index + 1);
    }
    if (one.length > 0) {
        ret[1] = tree(one, index + 1);
    }

    return ret;
}

const hTree = tree(table, 0);

export function decode(data) {
    let tok = new BinaryTokenizer(data);
    let parsed = "";

    let bitIndex = 0;
    let currentByte = tok.uint8("Huffman string byte");

    const isLeaf = node => node && node.len !== undefined;

    const nextBit = () => {
        const bit = getBit(currentByte, 8, bitIndex);
        bitIndex += 1;

        if (bitIndex === 8) {
            currentByte = null;
            if (!tok.atEnd()) {
                bitIndex = 0;
                currentByte = tok.uint8("Huffman string byte");
            } else {
                console.log("no more bits");
            }
        }

        return bit;
    };

    let current = hTree;
    while (currentByte) {
        while (!isLeaf(current) && currentByte) {
            current = current[nextBit()];
        }

        if (isLeaf(current)) {
            parsed += String.fromCodePoint(current.value);
            current = hTree;
        } else {
            // XXX: RFC 7540 Sec 5.2 asserts that the padding must be all 1s; check for this
        }
    }


    return parsed;
}

let indexedTable = {};
for (const element of table) {
    indexedTable[element.value] = element;
}

export function encode(str) {
    let space = 8;
    let result = [];

    const add = data => {
        if (space === 8) {
            result.push(data);
        } else {
            result[result.length - 1] |= data;
        }
    };

    for (let i = 0; i < str.length; i++) {
        console.log(`${i} / ${str.length}`);
        let { encodedValue: data, len: length } = indexedTable[str.charCodeAt(i)];

        while (length > 0) { // there's still something left
            console.log(length);
            if (space >= length) { // we can encode everything we have
                add(data << (space - length));
                space -= length;
                length = 0;
                data = 0;
            } else {
                // How much will be left after filling current byte
                const leftover = length - space;

                add(data >> leftover);

                // Remove what was just inserted
                data -= (data >> leftover) << leftover;

                // We inserted some data, data is now shorter.
                length -= space;
                space = 0;
            }

            if (space === 0) space = 8;
        }
    }

    // Add padding in case we didn't end on a byte boundary
    if (space !== 8) {
        add(table[256].encodedValue >> (table[256].len - space));
    }

    return Buffer.from(result).toString("binary");
}
