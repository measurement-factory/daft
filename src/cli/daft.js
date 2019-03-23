#!/usr/bin/env node

// A main.js wrapper that enables ES6 module support in node.js

// eslint-disable-next-line no-native-reassign, no-global-assign
require = require("esm")(module);
module.exports = require("./main.js");
