/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";
import { parseHeader } from "./HeaderParser"
import { Must } from "../../misc/Gadgets";

// parses body in the "multipart/byteranges" format (RFC7233)
export default class MultiRangeParser {
    constructor(boundary) {
        this._boundary = boundary;
        this._remaining = null; // the remaining raw data
        this.blocks = []; // an array of parsed body blocks (excluding metadata)
        this.ranges = []; // an array of range pairs (extracted from metadata)
    }

    _separator() { return '--' + this._boundary; }

    _endSeparator() { return '--' + this._boundary + '--'; }

    parse(data) {
        this._remaining = data.trimStart();
        while (this._remaining.trim() !== this._endSeparator()) {
            if (!this._parseOneRange())
                return false;
        }
        return true;
    }

    _parseOneRange() {
        const rangeRe = /^(.*\r*\n)([\s\S]*?\n)(\r*\n)([\s\S]*)$/;
        const match = rangeRe.exec(this._remaining.toString());
        if (!match) {
            console.log(`Warning: Cannot parse multi-range body`);
            return false;
        }
        const firstLine = match[1].trimEnd();
        if (firstLine !== this._separator()) {
            console.log(`Warning: Invalid multi-range boundary: ${firstLine}`);
            return false;
        }
        const header = parseHeader(match[2]);
        const parsedRange = MultiRangeParser.ParseContentRange(header);
        this.ranges.push([parsedRange.low, parsedRange.high]);
        const rangeLength = parsedRange.high - parsedRange.low + 1;
        const bodyPartEnd = rangeLength;
        this.blocks.push(match[4].substring(0, bodyPartEnd));
        this._remaining = match[4].substring(bodyPartEnd).trimStart();
        return true;
    }

    // returns the parsed range in the format of {low, high, whole}
    static ParseContentRange(header) {
        const name = 'Content-Range';
        if (!header.has(name))
            return null;
        const stringValue = header.value(name);
        const re = /^(\S*\s)(\d+)-(\d+)\/(\d+)$/;
        const match = re.exec(stringValue);
        if (!match) {
            console.log(`Warning: cannot parse ${name} header`);
            return null;
        }
        const low = Number.parseInt(match[2], 10);
        const high = Number.parseInt(match[3], 10);
        const whole = Number.parseInt(match[4], 10);

        if (low > high)
            throw new Error(`invalid or unsupported range specs ${stringValue}: ${low} > ${high}`);

        if (high >= whole)
            throw new Error(`invalid or unsupported range specs ${stringValue}: ${high} >= ${whole}`);

        return {low: low, high: high, whole: whole};
    }
}

