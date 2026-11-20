#!/usr/bin/env node
// Writes the runtime config.json (D-017) into a build output folder.
// Usage: node scripts/write-config.mjs <output-dir> <api-base-url>
// Used by both deploy jobs after `ng build`. Fails on a missing or non-https URL (http only for localhost).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, raw] = process.argv.slice(2);
if (!dir || !raw) {
  console.error('usage: write-config.mjs <output-dir> <api-base-url>');
  process.exit(1);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error(`write-config: "${raw}" is not an absolute URL`);
  process.exit(1);
}
const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
  console.error('write-config: API_BASE_URL must use https');
  process.exit(1);
}

const apiBaseUrl = raw.replace(/\/+$/, '');
writeFileSync(join(dir, 'config.json'), `${JSON.stringify({ apiBaseUrl })}\n`);
console.log(`write-config: ${join(dir, 'config.json')} → ${apiBaseUrl}`);
