/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Objects shared by many modules except Config which is in Config.js */

import TypeMap from "./TypeMap";
import { Must } from "./Gadgets";

export let Types = new TypeMap();

export let ErrorsSeen = 0;

export function DefaultSchemePort(scheme) {
    Must(scheme !== null);
    let defaultPorts = {
        http: 80,
        https: 443,
        icap: 1344,
        ftp: 21
    };
    const port = defaultPorts[scheme.toLowerCase()];
    Must(port !== undefined);
    return port;
}
