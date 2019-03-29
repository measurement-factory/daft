/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import { Must } from "../misc/Gadgets";

// a checklist: an ordered sequence of checks (a.k.a. test cases),
// usually revolving around validating some DUT feature or functionality
export default class Test {

    // promises to execute a sequence of checks
    async run() {
        Must(false, `pure virtual: kids must override`);
    }

}
