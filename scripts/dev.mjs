import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
// Spawn Node entry points directly so Windows execution policy does not affect child scripts.
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], { stdio: 'inherit' }),
  spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '0.0.0.0'], { cwd: 'apps/client', stdio: 'inherit' }),
];
// Vite is hoisted at the workspace root.
let stopping = false;
function stop() { if (stopping) return; stopping = true; children.forEach(child => child.kill()); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
children.forEach(child => child.on('exit', code => { if (!stopping) { process.exitCode = code || 0; stop(); } }));
