#!/usr/bin/env node
// Dev server for testing on a phone over the same Wi-Fi: `npm run start:lan`.
// Writes .lan/config.json (git-ignored) pointing apiBaseUrl at http://<LAN IP>:8080 and serves it as
// config.json through the `lan` build configuration, so public/config.json stays untouched.
// LAN_HOST=192.168.1.20 overrides the detected address. Extra arguments go to `ng serve`.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function detectLanIp() {
  const found = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal && PRIVATE.test(i.address))
        found.push({ name, ip: i.address });
    }
  }
  return (found.find((f) => f.name === 'en0') ?? found[0])?.ip;
}

const host = process.env.LAN_HOST || detectLanIp();
if (!host) {
  console.error('start-lan: no LAN IPv4 address found. Connect to Wi-Fi or set LAN_HOST=<ip>.');
  process.exit(1);
}
if (!/^[A-Za-z0-9.-]+$/.test(host)) {
  console.error(`start-lan: LAN_HOST "${host}" is not a host name or IPv4 address`);
  process.exit(1);
}

const args = process.argv.slice(2);
const portArg = args.findIndex((a) => a === '--port' || a.startsWith('--port='));
const uiPort =
  portArg < 0
    ? '4200'
    : args[portArg].includes('=')
      ? args[portArg].split('=')[1]
      : args[portArg + 1];

const apiBaseUrl = `http://${host}:8080`;
mkdirSync('.lan', { recursive: true });
writeFileSync('.lan/config.json', `${JSON.stringify({ apiBaseUrl })}\n`);

console.log(`
Phone URLs (same Wi-Fi as this computer):
  http://${host}:${uiPort}/play/mde      http://${host}:${uiPort}/play/bog
  http://${host}:${uiPort}/stage/mde     http://${host}:${uiPort}/admin/mde

The UI will call the API at ${apiBaseUrl}. Run the API with:
  CORS_ALLOWED_ORIGINS=http://localhost:${uiPort},http://${host}:${uiPort}
  PUBLIC_UI_URL=http://${host}:${uiPort}
(Compose: set LAN_HOST=${host} in .env instead and run the API there.)
`);

const ng = spawn('npx', ['ng', 'serve', '-c', 'lan', '--host', '0.0.0.0', ...args], {
  stdio: 'inherit',
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => ng.kill(sig));
ng.on('exit', (code) => process.exit(code ?? 0));
