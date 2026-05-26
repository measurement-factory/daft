#!/usr/bin/env node

// This main.js wrapper used to enable ES6 module support in node.js v20 and
// earlier. Node.js v24 supports ES6 modules natively, but we are keeping this
// file (for now) in case we discover the need to add some other wrappers.

import "../cli/main.js";
