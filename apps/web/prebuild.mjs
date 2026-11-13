// Builds the workspace packages the web app imports from `dist/` before `next build`.
// Runs with the pnpm that started this script (`npm_execpath`), so it works both through
// `corepack pnpm build` (pnpm not on PATH) and through a global `pnpm run build` (Vercel).
import { spawnSync } from 'node:child_process';

const packages = [
  '@agronova/telemetry-schema',
  '@agronova/mortality-model',
  '@agronova/vision-schema',
];
const args = [...packages.flatMap((name) => ['--filter', name]), 'build'];

const execPath = process.env.npm_execpath;
const result = !execPath
  ? spawnSync('pnpm', args, { stdio: 'inherit', shell: process.platform === 'win32' })
  : /\.[cm]?js$/.test(execPath)
    ? spawnSync(process.execPath, [execPath, ...args], { stdio: 'inherit' })
    : spawnSync(execPath, args, { stdio: 'inherit' });

if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
