/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Every file under public/, as URL paths ("/icons/icon-192.png"). */
function publicFiles(dir = 'public', root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? publicFiles(path, root) : ['/' + relative(root, path).split('\\').join('/')];
  });
}

/**
 * Emits dist/sw.js from sw/sw.js with this build's file list. The version is a hash of the file names (which
 * carry content hashes) plus index.html, public/ and the worker itself, so any change installs a new worker.
 */
function serviceWorker(): Plugin {
  return {
    name: 'sym-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const template = readFileSync('sw/sw.js', 'utf8');
      const built = Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map'));
      const files = ['/', ...built.map((f) => '/' + f), ...publicFiles()].filter((f, i, all) => all.indexOf(f) === i);
      const hash = createHash('sha256').update(template).update(files.join('\n'));
      const html = bundle['index.html'];
      if (html?.type === 'asset') hash.update(String(html.source));
      for (const f of publicFiles()) hash.update(readFileSync(join('public', f)));
      const source = template.replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12))).replace('__PRECACHE__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// The API runs on 8787; Vite forwards /api so the browser sees one origin (cookies just work).
// changeOrigin must stay false: the server compares the browser's Origin with the Host header
// to refuse cross-site writes, and Vite's string shorthand would rewrite Host.
export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    host: true,
    proxy: { '/api': { target: process.env.SYM_API ?? 'http://127.0.0.1:8787', changeOrigin: false } },
    // the SQLite file changes on every save; watching it would reload the page each time
    watch: { ignored: ['**/server/data/**', '**/.taste-skill/**'] },
  },
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.mjs'],
  },
});
