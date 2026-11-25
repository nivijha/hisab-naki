const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, './auth-identifier.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(output, filename);
const { normalizeLoginIdentifier } = loaded.exports;

test('normalizes common Indian phone input to the registered E.164 identifier', () => {
  assert.equal(normalizeLoginIdentifier('9876543210'), '+919876543210');
  assert.equal(normalizeLoginIdentifier('09876543210'), '+919876543210');
  assert.equal(normalizeLoginIdentifier('+91 (98765) 43210'), '+919876543210');
});

test('preserves email and unrecognized identifiers after trimming', () => {
  assert.equal(normalizeLoginIdentifier(' shop@example.in '), 'shop@example.in');
  assert.equal(normalizeLoginIdentifier('shopper-id'), 'shopper-id');
});
