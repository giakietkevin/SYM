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

// accounts created before profiles existed get the new columns, empty until the person fills them in
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
for (const col of ['full_name', 'email', 'phone', 'recovery', 'avatar']) if (!userCols.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`);
// one email, one account (NULLs, i.e. old accounts not yet completed, do not collide)
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email)');
// sessions from before the device list existed show up as "unknown device", first seen at sign-in time unknown (0)
const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
for (const [col, type] of [['created', 'INTEGER'], ['seen', 'INTEGER'], ['agent', 'TEXT']]) {
  if (!sessionCols.includes(col)) db.exec(`ALTER TABLE sessions ADD COLUMN ${col} ${type}`);
}

const q = {
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (username, salt, hash, created, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  setPassword: db.prepare('UPDATE users SET salt = ?, hash = ? WHERE id = ?'),
  setAvatar: db.prepare('UPDATE users SET avatar = ? WHERE id = ?'),
  setRecovery: db.prepare('UPDATE users SET recovery = ? WHERE id = ?'),
  otherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?'),
  allSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  setName: db.prepare('UPDATE users SET full_name = ? WHERE id = ?'),
  // email and phone are set once: only while both are still empty
  setContact: db.prepare('UPDATE users SET email = ?, phone = ? WHERE id = ? AND email IS NULL AND phone IS NULL'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires, created, seen, agent) VALUES (?, ?, ?, ?, ?, ?)'),
  sessionUser: db.prepare(
    'SELECT users.id AS id, users.username AS username, sessions.token_hash AS token, sessions.seen AS seen FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires > ?',
  ),
  touchSession: db.prepare('UPDATE sessions SET seen = ? WHERE token_hash = ?'),
  listSessions: db.prepare('SELECT token_hash, created, seen, agent FROM sessions WHERE user_id = ? AND expires > ? ORDER BY seen DESC'),
  // the public id of a session is the first 16 hex of its stored hash: enough to pick it, useless as a login
  revokeSession: db.prepare('DELETE FROM sessions WHERE user_id = ? AND substr(token_hash, 1, 16) = ? AND token_hash <> ?'),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
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
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'JSON không hợp lệ');
  }
  // every handler reads fields off the body: null, a number or a list would throw a TypeError (a 500)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Dữ liệu không hợp lệ');
  return body;
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

function startSession(req, res, user, extra = {}) {
  const token = randomBytes(32).toString('base64url');
  q.purgeSessions.run(Date.now());
  const now = Date.now();
  q.insertSession.run(sha(token), user.id, now + SESSION_DAYS * 86400_000, now, now, String(req.headers['user-agent'] ?? '').slice(0, 300));
  send(res, 200, { ...profileOf(user), ...extra }, { 'Set-Cookie': sessionCookie(req, token, SESSION_DAYS * 86400) });
}

function currentUser(req) {
  const token = cookies(req).sym_session;
  if (!token) return null;
  const now = Date.now();
  const u = q.sessionUser.get(sha(token), now);
  if (!u) return null;
  // "last active" for the device list; written at most every 5 minutes, not on every save
  if (!u.seen || now - u.seen > 5 * 60_000) q.touchSession.run(now, u.token);
  return u;
}

const SESSION_ID = /^[0-9a-f]{16}$/;

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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanEmail(v) {
  const email = String(v ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, 'Email không hợp lệ');
  return email;
}

/** "+84 912 345 678" and "0912.345.678" are the same number: stored as 0912345678. */
function cleanPhone(v) {
  let phone = String(v ?? '').replace(/[\s.\-()]/g, '');
  if (phone.startsWith('+84')) phone = '0' + phone.slice(3);
  if (!/^\+?\d{9,15}$/.test(phone)) throw new HttpError(400, 'Số điện thoại không hợp lệ');
  return phone;
}

function cleanName(v) {
  const name = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (name.length > 80) throw new HttpError(400, 'Họ tên tối đa 80 ký tự');
  return name;
}

const profileOf = (u) => ({
  username: u.username,
  fullName: u.full_name ?? '',
  email: u.email ?? null,
  phone: u.phone ?? null,
  hasRecovery: !!u.recovery,
  avatar: u.avatar ?? null,
});

const AVATAR_MAX = 150_000; // characters of base64 (about 110 KB): the client sends ~256px JPEGs far below that

/** Only a JPEG, checked by its first bytes: nothing the browser could run is ever stored or sent back as an image. */
function cleanAvatar(v) {
  if (v === null) return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(typeof v === 'string' ? v : '');
  if (!m || m[1].length > AVATAR_MAX) throw new HttpError(400, 'Ảnh không hợp lệ hoặc quá lớn');
  const head = Buffer.from(m[1].slice(0, 8), 'base64');
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) throw new HttpError(400, 'Ảnh không hợp lệ hoặc quá lớn');
  return `data:image/jpeg;base64,${m[1]}`;
}

// ───────── recovery code ─────────
// No email service here, so a forgotten password is recovered with a code shown once, at sign-up (or when
// the person makes a new one). 16 symbols of 32 = 80 bits: stored as a plain sha256, there is nothing to brute-force.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newRecoveryCode() {
  const bytes = randomBytes(16);
  let raw = '';
  for (const b of bytes) raw += CODE_CHARS[b & 31];
  return raw.match(/.{4}/g).join('-');
}

const codeHash = (code) => sha(String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''));

/** Stores a fresh code for the user and returns it in the form to show (the only time it is readable). */
function issueRecovery(userId) {
  const code = newRecoveryCode();
  q.setRecovery.run(codeHash(code), userId);
  return code;
}

const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function newPassword(v) {
  const password = String(v ?? '');
  if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Mật khẩu cần từ 8 đến 128 ký tự');
  return password;
}

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
    const body = await readJson(req);
    const { username, password } = validCredentials(body);
    const email = cleanEmail(body.email);
    const phone = cleanPhone(body.phone);
    const fullName = cleanName(body.fullName);
    mark();
    if (q.userByName.get(username)) throw new HttpError(409, 'Tên đăng nhập đã có người dùng');
    if (q.userByEmail.get(email)) throw new HttpError(409, 'Email này đã được dùng cho một tài khoản khác');
    const salt = randomBytes(16);
    const hash = await hashPassword(password, salt);
    let id;
    try {
      id = Number(q.insertUser.run(username, salt, hash, Date.now(), fullName, email, phone).lastInsertRowid);
    } catch (e) {
      // two sign-ups racing for the same email or username: the database has the last word
      if (/UNIQUE/i.test(String(e.message))) {
        throw new HttpError(409, /email/i.test(String(e.message)) ? 'Email này đã được dùng cho một tài khoản khác' : 'Tên đăng nhập đã có người dùng');
      }
      throw e;
    }
    const created = q.userById.get(id);
    return startSession(req, res, created, { recoveryCode: issueRecovery(id), hasRecovery: true });
  }

  if (method === 'POST' && path === '/api/login') {
    const body = await readJson(req);
    const username = String(body.username ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const key = `login|${ip(req)}|${username}`;
    const fail = throttle(key, 5, 10 * 60_000);
    const user = q.userByName.get(username) ?? (username.includes('@') ? q.userByEmail.get(username) : undefined);
    // always hash, so a missing user costs the same as a wrong password
    const salt = user ? user.salt : Buffer.alloc(16);
    const hash = await hashPassword(password.slice(0, 128), salt);
    if (!user || !timingSafeEqual(hash, user.hash)) {
      fail();
      throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    hits.delete(key);
    return startSession(req, res, user);
  }

  // change the password while signed in: needs the current one; every other device is signed out
  if (method === 'POST' && path === '/api/password') {
    const session = requireUser(req);
    const body = await readJson(req);
    const key = `pw|${session.id}`;
    const fail = throttle(key, 5, 10 * 60_000);
    const user = q.userById.get(session.id);
    const ok = timingSafeEqual(await hashPassword(String(body.current ?? '').slice(0, 128), user.salt), user.hash);
    if (!ok) {
      fail();
      throw new HttpError(403, 'Mật khẩu hiện tại không đúng');
    }
    const next = newPassword(body.next);
    if (next === String(body.current)) throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu cũ');
    const salt = randomBytes(16);
    q.setPassword.run(salt, await hashPassword(next, salt), user.id);
    q.otherSessions.run(user.id, sha(cookies(req).sym_session ?? ''));
    hits.delete(key);
    return send(res, 200, { ok: true });
  }

  // profile picture: a small JPEG data URL, or null to remove it
  if (method === 'PUT' && path === '/api/avatar') {
    const session = requireUser(req);
    const body = await readJson(req);
    q.setAvatar.run(cleanAvatar(body.image === undefined ? undefined : body.image), session.id);
    return send(res, 200, profileOf(q.userById.get(session.id)));
  }

  // a new recovery code replaces the old one (accounts made before codes existed get theirs here)
  if (method === 'POST' && path === '/api/recovery-code') {
    const session = requireUser(req);
    const body = await readJson(req);
    const key = `rc|${session.id}`;
    const fail = throttle(key, 5, 10 * 60_000);
    const user = q.userById.get(session.id);
    if (!timingSafeEqual(await hashPassword(String(body.password ?? '').slice(0, 128), user.salt), user.hash)) {
      fail();
      throw new HttpError(403, 'Mật khẩu không đúng');
    }
    hits.delete(key);
    return send(res, 200, { recoveryCode: issueRecovery(user.id) });
  }

  // forgotten password: username or email + recovery code -> new password. Same answer for every kind of miss.
  if (method === 'POST' && path === '/api/reset') {
    const body = await readJson(req);
    const who = String(body.username ?? '').trim().toLowerCase();
    const fail = throttle(`reset|${ip(req)}|${who}`, 5, 10 * 60_000);
    const failAny = throttle(`reset|${ip(req)}`, 20, 3600_000);
    const password = newPassword(body.password);
    const user = q.userByName.get(who) ?? (who.includes('@') ? q.userByEmail.get(who) : undefined);
    const sent = codeHash(body.code);
    const ok = !!user?.recovery && sameHash(sent, user.recovery);
    if (!ok) {
      fail();
      failAny();
      throw new HttpError(401, 'Tên đăng nhập, email hoặc mã khôi phục không đúng');
    }
    const salt = randomBytes(16);
    q.setPassword.run(salt, await hashPassword(password, salt), user.id);
    q.allSessions.run(user.id);
    hits.delete(`reset|${ip(req)}|${who}`);
    const code = issueRecovery(user.id); // a code works once
    return startSession(req, res, q.userById.get(user.id), { recoveryCode: code, hasRecovery: true });
  }

  if (method === 'POST' && path === '/api/logout') {
    const token = cookies(req).sym_session;
    if (token) q.deleteSession.run(sha(token));
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (method === 'GET' && path === '/api/me') {
    return send(res, 200, profileOf(q.userById.get(requireUser(req).id)));
  }

  if (method === 'PUT' && path === '/api/profile') {
    const session = requireUser(req);
    const body = await readJson(req);
    const user = q.userById.get(session.id);

    if (body.fullName !== undefined) q.setName.run(cleanName(body.fullName), user.id);

    const wantsEmail = body.email !== undefined && body.email !== null;
    const wantsPhone = body.phone !== undefined && body.phone !== null;
    if (wantsEmail || wantsPhone) {
      const email = wantsEmail ? cleanEmail(body.email) : null;
      const phone = wantsPhone ? cleanPhone(body.phone) : null;
      if (user.email || user.phone) {
        // already set: they may be sent back unchanged, never changed
        if ((email && email !== user.email) || (phone && phone !== user.phone)) {
          throw new HttpError(403, 'Email và số điện thoại không thể thay đổi');
        }
      } else {
        // an account from before profiles existed completes it once, with both
        if (!email || !phone) throw new HttpError(400, 'Cần nhập cả email và số điện thoại');
        const taken = q.userByEmail.get(email);
        if (taken && taken.id !== user.id) throw new HttpError(409, 'Email này đã được dùng cho một tài khoản khác');
        try {
          q.setContact.run(email, phone, user.id);
        } catch (e) {
          if (/UNIQUE/i.test(String(e.message))) throw new HttpError(409, 'Email này đã được dùng cho một tài khoản khác');
          throw e;
        }
      }
    }
    return send(res, 200, profileOf(q.userById.get(user.id)));
  }

  // the devices signed in to this account
  if (method === 'GET' && path === '/api/sessions') {
    const u = requireUser(req);
    const list = q.listSessions.all(u.id, Date.now()).map((s) => ({
      id: s.token_hash.slice(0, 16),
      current: s.token_hash === u.token,
      created: s.created ?? null,
      seen: s.seen ?? null,
      agent: s.agent ?? '',
    }));
    return send(res, 200, { sessions: list });
  }

  // sign one other device out (this one signs out with /api/logout)
  if (method === 'POST' && path === '/api/sessions/revoke') {
    const u = requireUser(req);
    const body = await readJson(req);
    const id = String(body.id ?? '');
    if (!SESSION_ID.test(id)) throw new HttpError(400, 'Phiên không hợp lệ');
    q.revokeSession.run(u.id, id, u.token);
    return send(res, 200, { ok: true });
  }

  if (method === 'POST' && path === '/api/sessions/revoke-others') {
    const u = requireUser(req);
    q.otherSessions.run(u.id, u.token);
    return send(res, 200, { ok: true });
  }

  // delete the account and everything in it: needs the password and the username typed out
  if (method === 'POST' && path === '/api/account/delete') {
    const session = requireUser(req);
    const body = await readJson(req);
    const key = `del|${session.id}`;
    const fail = throttle(key, 5, 10 * 60_000);
    const user = q.userById.get(session.id);
    if (String(body.confirm ?? '').trim().toLowerCase() !== user.username) throw new HttpError(400, 'Tên đăng nhập nhập lại chưa đúng');
    if (!timingSafeEqual(await hashPassword(String(body.password ?? '').slice(0, 128), user.salt), user.hash)) {
      fail();
      throw new HttpError(403, 'Mật khẩu không đúng');
    }
    hits.delete(key);
    q.deleteUser.run(user.id); // sessions and data go with it (ON DELETE CASCADE)
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
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
