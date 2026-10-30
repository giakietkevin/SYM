import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs on 8787; Vite forwards /api so the browser sees one origin (cookies just work).
// changeOrigin must stay false: the server compares the browser's Origin with the Host header
// to refuse cross-site writes, and Vite's string shorthand would rewrite Host.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
    // the SQLite file changes on every save; watching it would reload the page each time
    watch: { ignored: ['**/server/data/**', '**/.taste-skill/**'] },
  },
});
