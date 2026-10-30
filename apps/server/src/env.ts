import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
const path = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(path)) loadEnvFile(path);
