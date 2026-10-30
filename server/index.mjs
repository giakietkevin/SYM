// SYM API: accounts (username + password) and one saved state per user.
// No dependencies: node:http, node:crypto, node:sqlite (Node 22.5+).
import { createServer } from 'node:http';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const DB_FILE = process.env.SYM_DB ?? join(ROOT, 'server', 'data', 'sym.db');
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const SESSION_DAYS = 30;
const MAX_BODY = 2 * 1024 * 1024;

mkdirSync(dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    salt BLOB NOT NULL,
    hash BLOB NOT NULL,
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS data (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    json TEXT NOT NULL,
    rev INTEGER NOT NULL,
    updated INTEGER NOT NULL
  );
`);

const q = {
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  insertUser: db.prepare('INSERT INTO users (username, salt, hash, created) VALUES (?, ?, ?, ?)'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)'),
  sessionUser: db.prepare(
    'SELECT users.id AS id, users.username AS username FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires > ?',
  ),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  purgeSessions: db.prepare('DELETE FROM sessions WHERE expires <= ?'),
  getData: db.prepare('SELECT json, rev FROM data WHERE user_id = ?'),
  insertData: db.prepare('INSERT INTO data (user_id, json, rev, updated) VALUES (?, ?, ?, ?)'),
  updateData: db.prepare('UPDATE data SET json = ?, rev = ?, updated = ? WHERE user_id = ? AND rev = ?'),
};

// ───────── helpers ─────────

const sha = (s) => createHash('sha256').update(s).digest('hex');
const hashPassword = (password, salt) => scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });

const USERNAME = /^[a-z0-9_.-]{3,24}$/;

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}

async function readJson(req) {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Cần gửi JSON');
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Dữ liệu quá lớn');
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'JSON không hợp lệ');
  }
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const isSecure = (req) => process.env.SYM_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';

function sessionCookie(req, token, maxAgeSec) {
  const parts = [`sym_session=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (isSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

function startSession(req, res, userId, username) {
  const token = randomBytes(32).toString('base64url');
  q.purgeSessions.run(Date.now());
  q.insertSession.run(sha(token), userId, Date.now() + SESSION_DAYS * 86400_000);
  send(res, 200, { username }, { 'Set-Cookie': sessionCookie(req, token, SESSION_DAYS * 86400) });
}

function currentUser(req) {
  const token = cookies(req).sym_session;
  if (!token) return null;
  return q.sessionUser.get(sha(token), Date.now()) ?? null;
}

function requireUser(req) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Chưa đăng nhập');
  return u;
}

/** Cross-site writes are refused: the Origin of a browser request must be this host. */
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Origin không hợp lệ');
  }
  if (host !== req.headers.host) throw new HttpError(403, 'Yêu cầu từ nguồn khác bị từ chối');
}

// Simple in-memory throttles (reset on restart, which is fine for one process).
const hits = new Map();
function throttle(key, limit, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    hits.set(key, list);
    throw new HttpError(429, 'Thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.');
  }
  return () => {
    list.push(Date.now());
    hits.set(key, list);
  };
}

const ip = (req) => req.socket.remoteAddress ?? 'unknown';

function validCredentials(body) {
  const username = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!USERNAME.test(username)) throw new HttpError(400, 'Tên đăng nhập 3–24 ký tự: chữ thường, số, dấu . _ -');
  if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Mật khẩu cần từ 8 đến 128 ký tự');
  return { username, password };
}

/** Shape check only: the client owns the meaning of the ledger. */
function validState(s) {
  return (
    s &&
    typeof s === 'object' &&
    Array.isArray(s.jars) &&
    Array.isArray(s.txs) &&
    s.jars.length <= 500 &&
    s.txs.length <= 50_000 &&
    typeof s.sound === 'boolean' &&
    typeof s.haptics === 'boolean'
  );
}

// ───────── routes ─────────

async function api(req, res, path) {
  const method = req.method;
  if (method !== 'GET') checkOrigin(req);

  if (method === 'POST' && path === '/api/register') {
    const mark = throttle(`reg|${ip(req)}`, 10, 3600_000);
    const { username, password } = validCredentials(await readJson(req));
    mark();
    if (q.userByName.get(username)) throw new HttpError(409, 'Tên đăng nhập đã có người dùng');
    const salt = randomBytes(16);
    const hash = await hashPassword(password, salt);
    const r = q.insertUser.run(username, salt, hash, Date.now());
    return startSession(req, res, Number(r.lastInsertRowid), username);
  }

  if (method === 'POST' && path === '/api/login') {
    const body = await readJson(req);
    const username = String(body.username ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const key = `login|${ip(req)}|${username}`;
    const fail = throttle(key, 5, 10 * 60_000);
    const user = q.userByName.get(username);
    // always hash, so a missing user costs the same as a wrong password
    const salt = user ? user.salt : Buffer.alloc(16);
    const hash = await hashPassword(password.slice(0, 128), salt);
    if (!user || !timingSafeEqual(hash, user.hash)) {
      fail();
      throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    hits.delete(key);
    return startSession(req, res, user.id, user.username);
  }

  if (method === 'POST' && path === '/api/logout') {
    const token = cookies(req).sym_session;
    if (token) q.deleteSession.run(sha(token));
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (method === 'GET' && path === '/api/me') {
    return send(res, 200, { username: requireUser(req).username });
  }

  if (method === 'GET' && path === '/api/data') {
    const u = requireUser(req);
    const row = q.getData.get(u.id);
    return send(res, 200, row ? { state: JSON.parse(row.json), rev: row.rev } : { state: null, rev: 0 });
  }

  if (method === 'PUT' && path === '/api/data') {
    const u = requireUser(req);
    const body = await readJson(req);
    if (!validState(body.state)) throw new HttpError(400, 'Dữ liệu không hợp lệ');
    const rev = Number(body.rev);
    if (!Number.isInteger(rev) || rev < 0) throw new HttpError(400, 'Phiên bản không hợp lệ');
    const json = JSON.stringify(body.state);
    const row = q.getData.get(u.id);

    if (!row) {
      if (rev !== 0) throw new HttpError(409, 'Xung đột dữ liệu', { state: null, rev: 0 });
      q.insertData.run(u.id, json, 1, Date.now());
      return send(res, 200, { rev: 1 });
    }
    // compare-and-swap: another device saved first -> hand back its version instead of overwriting it
    const r = q.updateData.run(json, row.rev + 1, Date.now(), u.id, rev);
    if (r.changes === 0) throw new HttpError(409, 'Dữ liệu đã được cập nhật từ thiết bị khác', { state: JSON.parse(row.json), rev: row.rev });
    return send(res, 200, { rev: row.rev + 1 });
  }

  throw new HttpError(404, 'Không tìm thấy');
}

// ───────── static (production build) ─────────

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, path) {
  if (!existsSync(DIST)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Chưa build giao diện. Chạy "npm run build" hoặc "npm run dev".');
  }
  let file = normalize(join(DIST, decodeURIComponent(path)));
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    return res.end();
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const ext = extname(file);
  res.writeHead(200, {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': file.includes(`${join(DIST, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(readFileSync(file));
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  try {
    if (path.startsWith('/api/')) return await api(req, res, path);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Không hỗ trợ');
    serveStatic(req, res, path);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra ?? {}) });
    console.error(e);
    send(res, 500, { error: 'Lỗi máy chủ' });
  }
});

server.listen(PORT, HOST, () => console.log(`SYM API on http://${HOST}:${PORT}`));
