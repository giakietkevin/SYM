// Runs the API and the Vite dev server together (no extra dependency).
import { spawn } from 'node:child_process';

const run = (args, name) => {
  const p = spawn(process.execPath, args, { stdio: 'inherit' });
  p.on('exit', (code) => {
    console.log(`[${name}] exited (${code})`);
    process.exit(code ?? 0);
  });
  return p;
};

const api = run(['--no-warnings', '--watch', 'server/index.mjs'], 'api');
const web = run(['node_modules/vite/bin/vite.js'], 'web');

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    api.kill();
    web.kill();
    process.exit(0);
  });
}
