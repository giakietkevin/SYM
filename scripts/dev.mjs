// Runs the API and the Vite dev server together (no extra dependency).
//
// The API is supervised here instead of with `node --watch`: the watcher is a separate process that
// stays alive after the server it started dies, so nothing noticed and the web server kept answering
// every /api request with a 500. Now a dead API is restarted, a changed server file reloads it, and if
// the web server stops everything stops.
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';

let stopping = false;
let api = null;
let reloading = false;
const crashes = [];

function startApi() {
  api = spawn(process.execPath, ['--no-warnings', 'server/index.mjs'], { stdio: 'inherit' });
  const mine = api;
  mine.on('exit', (code) => {
    if (stopping || mine !== api) return;
    if (reloading) {
      reloading = false;
      return startApi();
    }
    // a crash loop is a bug, not something to hide behind restarts
    const now = Date.now();
    crashes.push(now);
    while (crashes.length && now - crashes[0] > 30_000) crashes.shift();
    if (crashes.length >= 5) {
      console.log('[api] keeps crashing, giving up. Fix the error above and run npm run dev again.');
      return stopAll(1);
    }
    console.log(`[api] exited (${code}), restarting in 1s`);
    setTimeout(() => !stopping && startApi(), 1000);
  });
}

const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' });
web.on('exit', (code) => {
  if (!stopping) {
    console.log(`[web] exited (${code}), stopping the API too`);
    stopAll(code ?? 1);
  }
});

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const c of [api, web]) {
    try {
      c?.kill();
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}

// reload the API when its code changes (the SQLite files in server/data change on every save: ignored)
let timer = 0;
try {
  watch('server', { recursive: true }, (_event, file) => {
    if (!file || file.startsWith('data') || !/\.(mjs|js|json)$/.test(file)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (stopping || !api) return;
      console.log(`[api] ${file} changed, reloading`);
      reloading = true;
      api.kill();
    }, 200);
  });
} catch {
  console.log('[api] file watching is unavailable here; restart npm run dev after changing server code');
}

startApi();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => stopAll(0));
