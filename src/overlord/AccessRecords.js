/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import assert from "assert";

// a single access.log record
class AccessRecord {
    constructor(source, raw) {
        assert.strictEqual(arguments.length, 2);

        this._source = source;
        this._map = new Map();

        const reKeyValue = /(%.+?)=([^%]*)/g;
        for (const [, key, value] of raw.matchAll(reKeyValue))
            this._map.set(key, value.trimRight());
    }

    // whether this record matches the given one exactly
    sameAs(them) {
        if (this._map.size !== them._map.size)
            return false; // different number of fields

        for (const [key, value] of this._map) {
            if (!them._map.has(key))
                return false;
            if (value !== them._map.get(key))
                return false;
        }

        return true;
    }

    // the value part of the %key=value access record entry
    _getRawValue(name) {
        if (!this._map.has(name))
            throw new Error(`unknown or unused logformat code ${name}`);
        return this._map.get(name); // may be "-"
    }

    // whether the given %code was logged with a given value
    checkEqual(name, rawExpectedValue) {
        const expectedValue = rawExpectedValue.toString(); // e.g., number to string
        const actualValue = this._getRawValue(name); // always a string
        if (actualValue !== expectedValue)
            throw new Error(`expected ${name}=${expectedValue}; got ${name}=${actualValue}`);
        // success
    }

    // whether the given %code was logged with a value of '-'
    checkUnknown(name) {
        return this.checkEqual(name, '-');
    }

    // whether the given %code was logged with a value other than '-'
    checkKnown(name) {
        const actualValue = this._getRawValue(name);
        if (actualValue === '-')
            throw new Error(`expected ${name} with a value; got ${name}=${actualValue}`);
        return actualValue; // success
    }
}

// a collection of AccessRecord entries from one or more sources
class AccessRecords {
    // constructs an empty collection of records or, if a single argument is
    // given, imports records from a parsed JSON object
    constructor() {
        assert(arguments.length <= 1);

        this._records = [];

        if (arguments.length === 1)
            this._importRaw(arguments[0]);
    }

    count() {
        return this._records.length;
    }

    // returns the only available AccessRecord
    single() {
        const count = this.count();
        if (count === 1)
            return this._records[0];

        throw new Error(`expecting a single access record but got ${count}`);
    }

    // returns the first available AccessRecord
    first() {
        if (this.count())
            return this._records[0];

        throw new Error(`expecting at least one (first) access record but got zero`);
    }

    // returns the last available AccessRecord
    last() {
        const count = this.count();
        if (count)
            return this._records[count-1];

        throw new Error(`expecting at least one (last) access record but got zero`);
    }

    // returns all available AccessRecord objects
    all() {
        return this._records; // may be empty
    }

    // adds records that we have not seen before and
    // returns AccessRecords containing those added records
    addUnique(allRecords) {
        assert(allRecords instanceof AccessRecords);
        const newRecords = new AccessRecords();
        for (const record of allRecords._records) {
            if (!this._has(record)) {
                this._add(record);
                newRecords._add(record);
            }

        }
        return newRecords;
    }

    _has(theirs) {
        return this._records.some(ours => ours.sameAs(theirs));
    }

    // adds the given record
    _add(record) {
        assert(record);
        this._records.push(record);
    }

    // adds all records from a parsed JSON object extracted from a POP answer
    _importRaw(raw) {
        assert.strictEqual(this.count(), 0); // we only support a single import
        for (const [log, records] of Object.entries(raw)) {
            for (const record of records)
                this._add(new AccessRecord(log, record));
        }
    }
}

// converts JSON.parse() POP answer to AccessRecords
export function Import(rawRecords) {
    return new AccessRecords(rawRecords);
}

function _LogFormatEntry(key, format = key)
{
    return ' ' + '%' + key + '=' + format;
}

// logformat configuration (with a given format name);
// matches our Import() expectations
export function LogFormat(formatName)
{
    let format = 'logformat ' + formatName;
    format += _LogFormatEntry('%sn');
    format += _LogFormatEntry('%err_code');
    format += _LogFormatEntry('%err_detail');
    format += _LogFormatEntry('%et_', '%ts.%03tu'); // end time
    format += _LogFormatEntry('%tr');
    format += _LogFormatEntry('%dt');
    format += _LogFormatEntry('%>A');
    format += _LogFormatEntry('%>a');
    format += _LogFormatEntry('%Ss');
    format += _LogFormatEntry('%>Hs');
    format += _LogFormatEntry('%<Hs');
    format += _LogFormatEntry('%<st');
    format += _LogFormatEntry('%rm');
    format += _LogFormatEntry('%ru');
    format += _LogFormatEntry('%un', '%[un');
    format += _LogFormatEntry('%Sh');
    format += _LogFormatEntry('%<a');
    format += _LogFormatEntry('%mt');
    return format;
}
