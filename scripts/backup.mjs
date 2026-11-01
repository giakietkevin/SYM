// A consistent copy of the database, safe while the server is running (VACUUM INTO takes a snapshot).
//   node scripts/backup.mjs [folder]      (default: <folder of the database>/backups)
// Keeps the 14 newest copies. The copy holds everything, including the push keys: keep it private.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DB = process.env.SYM_DB ?? join(import.meta.dirname, '..', 'server', 'data', 'sym.db');
const dir = process.argv[2] ?? join(dirname(DB), 'backups');
const KEEP = 14;

if (!existsSync(DB)) {
  console.error(`No database at ${DB}`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace('.', '-').slice(0, 23);
const out = join(dir, `sym-${stamp}.db`);

const db = new DatabaseSync(DB, { readOnly: true });
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();

// the copy must open and hold the tables
const check = new DatabaseSync(out, { readOnly: true });
const users = check.prepare('SELECT COUNT(*) AS n FROM users').get().n;
check.close();

const old = readdirSync(dir)
  .filter((f) => /^sym-.*\.db$/.test(f))
  .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
  .slice(KEEP);
for (const o of old) unlinkSync(join(dir, o.f));

console.log(`${out} (${(statSync(out).size / 1024).toFixed(0)} KB, ${users} accounts)${old.length ? `, removed ${old.length} old` : ''}`);
