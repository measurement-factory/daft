/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Classes dealing with Range requests and 206 (Partial Content) responses */

import assert from "assert";

import * as Misc from "../misc/Gadgets";
import * as Http from "../http/Gadgets";
import Header from "./Header";

/* All Daft Range code is based on _byte_ ranges (at least for now) */

// a single [lo, high] range
// no support for tail/head ranges yet
export class Spec {
    constructor(low, high) {
        assert(arguments.length == 2);

        assert(low >= 0);
        this.low_ = low;

        assert(high >= 0);
        assert(low <= high);
        this.high_ = high;
    }

    low() {
        return this.low_;
    }

    high() {
        return this.high_;
    }

    length() {
        return this.high_ - this.low_ + 1;
    }

    equal(them) {
        assert(them instanceof Spec);
        return this.low_ === them.low_ && this.high_ === them.high_;
    }

    toString() {
        return this.low_ + '-' + this.high_;
    }

    // parses a "low-high" string
    static ParseLoHi(spec) {
        const offsets = spec.split('-').map(rawOffset => {
            const offset = Misc.ToUnsigned(rawOffset);
            if (offset === undefined)
                throw new Error(`cannot parse Range offset '${rawOffset}' in '${spec}' spec`);
            return offset;
        });
        if (offsets.length !== 2)
            throw new Error(`wrong number of Range offsets in '${spec}' spec: ${offsets.length}`);
        return new Spec(...offsets);
    }

    // a Content-Range header field value (if present) or null (otherwise)
    static FromContentRangeHeaderIfPresent(header) {
        const field = header.has('Content-Range');
        if (!field)
            return null;

        assert(field.value.startsWith('bytes ')); // no support for other units
        const loHi = field.value.substring(6).trim();
        return Spec.ParseLoHi(loHi);
    }
}

// a sequence of Range specs
export class Specs extends Array {

    equal(them) {
        if (this.length != them.length)
            return false;

        for (var i = 0; i < this.length; ++i) {
            if (!this[i].equal(them[i]))
                return false;
        }

        return true;
    }

    toString() {
        this.map(v => assert(v instanceof Spec)); // XXX: remove
        return 'bytes=' + this.map(v => v.toString()).join(', ');
    }

    // parses Range header field value
    // Range: bytes=0-0, 32818-32818, 65635-65635
    static FromRangeHeaderValue(rawByteSpecs) {
        assert(rawByteSpecs.startsWith('bytes=')); // no support for other units
        const rawSpecs = rawByteSpecs.substring(6);
        const specs = rawSpecs.split(/\s*,\s*/).map(spec => Spec.ParseLoHi(spec));
        assert(specs.length);
        return Specs.from(specs);
    }

    static FromRangeHeaderIfPresent(header) {
        const field = header.has('Range');
        if (!field)
            return null;
        return Specs.FromRangeHeaderValue(field.value);
    }
}

// a single byterange part: range spec and the corresponding body bytes
export class Part {
    constructor(rangeSpec, bytes) {
        assert(arguments.length == 2);
        assert(rangeSpec instanceof Spec);

        this.rangeSpec_ = rangeSpec;

        assert(rangeSpec.length() === bytes.length);
        this.bytes_ = bytes;
    }

    rangeSpec() {
        return this.rangeSpec_;
    }

    bytes() {
        return this.bytes_;
    }

    equal(them) {
        return this.rangeSpec_.equal(them.rangeSpec_) && this.bytes_ === them.bytes_;
    }
}

// a sequence of Part objects
export class Parts extends Array {

    equal(them) {
        assert(them instanceof Parts);

        if (this.length != them.length)
            return false;

        for (var i = 0; i < this.length; ++i) {
            if (!this[i].equal(them[i]))
                return false;
        }

        return true;
    }

    toSpecs() {
        return Specs.from(this.map(part => part.rangeSpec()));
    }

    matchSpecs(theirSpecs) {
        if (this.length != theirSpecs.length) {
            console.log("Warning: spec length differ: ", thisSpec, theirSpec);
            return false; // XXX: Does not account for parts merging.
        }

        for (var i = 0; i < this.length; ++i) {
            const thisSpec = this[i].rangeSpec();
            const theirSpec = theirSpecs[i];
            if (thisSpec.equal(theirSpec))
                continue;
            // XXX: Allow for one byte difference due to "shortening" of the
            // returned part when there are not enough body bytes
            if (thisSpec.low() == theirSpec.low() && thisSpec.high() + 1 === theirSpec.high())
                continue;
            console.log(`Warning: specs[${i}] differ: `, thisSpec, theirSpec);
            return false;
        }

        return true;
    }
}

