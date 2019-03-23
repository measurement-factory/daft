#!/usr/bin/env node

// A main.js wrapper that enables ES6 module support in node.js

/* eslint no-native-reassign: "off" */
require = require("esm")(module);
module.exports = require("./main.js");
