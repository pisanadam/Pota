// Loads POTA's browser-independent source files into this Node.js process.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
module.exports = function load(...names) {
  for (const name of names) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8'), { filename: name });
  return globalThis;
};
