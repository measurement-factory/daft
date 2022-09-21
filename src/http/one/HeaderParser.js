/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import Header from "../Header";
import Field from "../Field";
import { Must } from "../../misc/Gadgets";

function parseField(raw) {
    let fieldRe = /^(.*?)([\t ]*:[\t ]*)(.*?)([\t \r]*\n)$/;
    const match = fieldRe.exec(raw);

    let field = new Field();

    if (match) {
        Must(match.length === 5);
        field.name = match[1]; // right-trimmed
        field.separator = match[2];
        field.value = match[3]; // trimmed
        field.terminator = match[4];
    } else {
        console.log(`Warning: Cannot parse ${raw.length}-byte header field: ${raw}`);
        field.name = raw;
        field.separator = "";
        field.value = "";
        field.terminator = "";
    }
    return field;
}

export function parseHeader(raw) {
    let header = new Header();

    Must(raw !== null && raw !== undefined);
    header._raw = raw;

    // replace obs-fold with a single space
    let rawH = raw.replace(/\r*\n\s+/, ' ');

    let rawFields = rawH.split('\n');
    Must(rawFields.length); // our caller requires CRLF at the headers end
    Must(!rawFields.pop().length); // the non-field after the last CRLF
    for (let rawField of rawFields) {
        const field = parseField(rawField + "\n");
        Must(field);
        header.fields.push(field);
    }

    if (!header.fields.length)
        console.log(`Warning: Found no headers in ${rawH}`);

    return header;
}

