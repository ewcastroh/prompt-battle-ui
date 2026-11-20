#!/usr/bin/env node
// Translation key parity (SPEC §14.2-2): every file in public/i18n must have exactly the same keys,
// every value must be a non-empty string, and interpolation params ({{name}}) must match per key.
// Usage: node scripts/check-i18n-keys.mjs [dir]   (exit code 1 on any mismatch)
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'public/i18n');

/** Flattens nested objects to dotted keys; records non-string leaves as problems. */
function flatten(value, prefix = '', out = new Map(), problems = []) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      flatten(child, path, out, problems);
    } else if (typeof child === 'string' && child.trim() !== '') {
      out.set(path, child);
    } else {
      problems.push(`${path}: value must be a non-empty string`);
    }
  }
  return { keys: out, problems };
}

const params = (text) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

const files = readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .sort();
if (files.length < 2) {
  console.error(`check-i18n-keys: expected at least two translation files in ${dir}`);
  process.exit(1);
}

const parsed = files.map((name) => {
  const json = JSON.parse(readFileSync(join(dir, name), 'utf8'));
  return { name, ...flatten(json) };
});

const errors = [];
for (const file of parsed) {
  for (const problem of file.problems) errors.push(`${file.name}: ${problem}`);
}

const [reference, ...others] = parsed;
for (const other of others) {
  for (const key of reference.keys.keys()) {
    if (!other.keys.has(key))
      errors.push(`${other.name}: missing key "${key}" (present in ${reference.name})`);
  }
  for (const key of other.keys.keys()) {
    if (!reference.keys.has(key))
      errors.push(`${reference.name}: missing key "${key}" (present in ${other.name})`);
  }
  for (const [key, text] of reference.keys) {
    const otherText = other.keys.get(key);
    if (otherText !== undefined && params(text).join() !== params(otherText).join()) {
      errors.push(`"${key}": params differ between ${reference.name} and ${other.name}`);
    }
  }
}

if (errors.length > 0) {
  console.error(`check-i18n-keys: ${errors.length} problem(s)`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`check-i18n-keys: ${files.join(', ')} have the same ${reference.keys.size} keys`);
