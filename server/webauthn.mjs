// WebAuthn (passkeys) without dependencies: just enough CBOR, COSE keys -> node:crypto, and the checks the spec asks a
// relying party to make. Attestation is "none": we trust the key the authenticator hands us at registration, which is
// what every consumer site does; the account owner proves who they are with their password at that moment.
import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';

export const b64u = {
  encode: (buf) => Buffer.from(buf).toString('base64url'),
  decode: (s) => {
    if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new WebAuthnError('Dữ liệu passkey không hợp lệ');
    return Buffer.from(s, 'base64url');
  },
};

export class WebAuthnError extends Error {}

const sha256 = (b) => createHash('sha256').update(b).digest();
const same = (a, b) => a.length === b.length && timingSafeEqual(a, b);

/** Minimal CBOR decoder: unsigned/negative ints, byte/text strings, arrays, maps, simple values. Returns [value, nextOffset]. */
export function cborDecode(buf, offset = 0, depth = 0) {
  if (depth > 16) throw new WebAuthnError('CBOR quá sâu');
  if (offset >= buf.length) throw new WebAuthnError('CBOR bị cắt');
  const first = buf[offset++];
  const major = first >> 5;
  let info = first & 31;
  let len;
  const need = (n) => {
    if (offset + n > buf.length) throw new WebAuthnError('CBOR bị cắt');
  };
  if (info < 24) len = info;
  else if (info === 24) (need(1), (len = buf[offset]), (offset += 1));
  else if (info === 25) (need(2), (len = buf.readUInt16BE(offset)), (offset += 2));
  else if (info === 26) (need(4), (len = buf.readUInt32BE(offset)), (offset += 4));
  else if (info === 27) {
    need(8);
    const big = buf.readBigUInt64BE(offset);
    offset += 8;
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new WebAuthnError('CBOR số quá lớn');
    len = Number(big);
  } else throw new WebAuthnError('CBOR không hỗ trợ độ dài không xác định');

  switch (major) {
    case 0:
      return [len, offset];
    case 1:
      return [-1 - len, offset];
    case 2:
      need(len);
      return [buf.subarray(offset, offset + len), offset + len];
    case 3:
      need(len);
      return [buf.subarray(offset, offset + len).toString('utf8'), offset + len];
    case 4: {
      if (len > 1000) throw new WebAuthnError('CBOR mảng quá lớn');
      const arr = [];
      for (let i = 0; i < len; i++) {
        let v;
        [v, offset] = cborDecode(buf, offset, depth + 1);
        arr.push(v);
      }
      return [arr, offset];
    }
    case 5: {
      if (len > 1000) throw new WebAuthnError('CBOR map quá lớn');
      const map = new Map();
      for (let i = 0; i < len; i++) {
        let k, v;
        [k, offset] = cborDecode(buf, offset, depth + 1);
        [v, offset] = cborDecode(buf, offset, depth + 1);
        map.set(k, v);
      }
      return [map, offset];
    }
    case 7:
      if (info === 20) return [false, offset];
      if (info === 21) return [true, offset];
      if (info === 22) return [null, offset];
      throw new WebAuthnError('CBOR giá trị không hỗ trợ');
    default:
      throw new WebAuthnError('CBOR kiểu không hỗ trợ');
  }
}

/** The algorithms we accept, in the order we offer them: ES256, EdDSA (Ed25519), RS256. */
export const ALGS = [-7, -8, -257];

/** A COSE public key -> { alg, spki } (SPKI DER, which node:crypto reads directly). */
export function coseToSpki(cose) {
  if (!(cose instanceof Map)) throw new WebAuthnError('Khoá passkey không hợp lệ');
  const kty = cose.get(1);
  const alg = cose.get(3);
  let jwk;
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) {
    const x = cose.get(-2);
    const y = cose.get(-3);
    if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) throw new WebAuthnError('Khoá EC không hợp lệ');
    jwk = { kty: 'EC', crv: 'P-256', x: b64u.encode(x), y: b64u.encode(y) };
  } else if (kty === 1 && alg === -8 && cose.get(-1) === 6) {
    const x = cose.get(-2);
    if (!Buffer.isBuffer(x) || x.length !== 32) throw new WebAuthnError('Khoá Ed25519 không hợp lệ');
    jwk = { kty: 'OKP', crv: 'Ed25519', x: b64u.encode(x) };
  } else if (kty === 3 && alg === -257) {
    const n = cose.get(-1);
    const e = cose.get(-2);
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e) || n.length < 256) throw new WebAuthnError('Khoá RSA không hợp lệ');
    jwk = { kty: 'RSA', n: b64u.encode(n), e: b64u.encode(e) };
  } else throw new WebAuthnError('Loại khoá passkey chưa được hỗ trợ');
  return { alg, spki: createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'der' }) };
}

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

/** Authenticator data: rpIdHash(32) flags(1) signCount(4) [attested credential data] [extensions]. */
export function parseAuthData(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 37) throw new WebAuthnError('authenticatorData không hợp lệ');
  const out = { rpIdHash: buf.subarray(0, 32), flags: buf[32], signCount: buf.readUInt32BE(33) };
  if (out.flags & FLAG_AT) {
    if (buf.length < 55) throw new WebAuthnError('authenticatorData bị cắt');
    const idLen = buf.readUInt16BE(53);
    if (idLen < 16 || idLen > 1023 || buf.length < 55 + idLen) throw new WebAuthnError('Mã passkey không hợp lệ');
    out.credentialId = buf.subarray(55, 55 + idLen);
    const [cose] = cborDecode(buf, 55 + idLen);
    out.publicKey = cose;
  }
  return out;
}

/** Shared checks on clientDataJSON and authenticator data. */
function checkCommon({ clientDataJSON, authData, type, challenge, origin, rpId }) {
  let client;
  try {
    client = JSON.parse(clientDataJSON.toString('utf8'));
  } catch {
    throw new WebAuthnError('clientDataJSON không hợp lệ');
  }
  if (client.type !== type) throw new WebAuthnError('Sai loại yêu cầu passkey');
  if (typeof client.challenge !== 'string' || !same(Buffer.from(client.challenge), Buffer.from(challenge))) throw new WebAuthnError('Thử thách passkey không khớp');
  if (client.origin !== origin) throw new WebAuthnError('Passkey được dùng ở một trang khác');
  if (client.crossOrigin === true) throw new WebAuthnError('Passkey trong khung trang khác bị từ chối');
  if (!same(authData.rpIdHash, sha256(rpId))) throw new WebAuthnError('Passkey thuộc về một trang khác');
  if (!(authData.flags & FLAG_UP)) throw new WebAuthnError('Chưa xác nhận có người dùng');
  if (!(authData.flags & FLAG_UV)) throw new WebAuthnError('Thiết bị chưa xác minh bạn (vân tay, khuôn mặt hoặc mã PIN)');
}

/**
 * Registration. `credential` is what the browser returned, base64url-encoded by the client.
 * Returns { id, spki, alg, signCount } to store.
 */
export function verifyRegistration(credential, { challenge, origin, rpId }) {
  const r = credential?.response;
  if (!r || typeof credential.id !== 'string') throw new WebAuthnError('Dữ liệu passkey không hợp lệ');
  const clientDataJSON = b64u.decode(r.clientDataJSON);
  const [att] = cborDecode(b64u.decode(r.attestationObject));
  if (!(att instanceof Map) || !Buffer.isBuffer(att.get('authData'))) throw new WebAuthnError('attestationObject không hợp lệ');
  const authData = parseAuthData(att.get('authData'));
  checkCommon({ clientDataJSON, authData, type: 'webauthn.create', challenge, origin, rpId });
  if (!authData.credentialId || !authData.publicKey) throw new WebAuthnError('Thiếu khoá passkey');
  if (b64u.encode(authData.credentialId) !== credential.id) throw new WebAuthnError('Mã passkey không khớp');
  const { alg, spki } = coseToSpki(authData.publicKey);
  return { id: credential.id, spki, alg, signCount: authData.signCount };
}

/**
 * Sign-in. `stored` is the saved { spki, alg, signCount }. Returns the new sign count.
 * A counter that does not go up (when either side is non-zero) means a cloned authenticator: refused.
 */
export function verifyAssertion(credential, stored, { challenge, origin, rpId }) {
  const r = credential?.response;
  if (!r) throw new WebAuthnError('Dữ liệu passkey không hợp lệ');
  const clientDataJSON = b64u.decode(r.clientDataJSON);
  const authBuf = b64u.decode(r.authenticatorData);
  const signature = b64u.decode(r.signature);
  const authData = parseAuthData(authBuf);
  checkCommon({ clientDataJSON, authData, type: 'webauthn.get', challenge, origin, rpId });
  const data = Buffer.concat([authBuf, sha256(clientDataJSON)]);
  const key = createPublicKey({ key: Buffer.from(stored.spki), format: 'der', type: 'spki' });
  const ok = stored.alg === -8 ? verify(null, data, key, signature) : verify('sha256', data, key, signature);
  if (!ok) throw new WebAuthnError('Chữ ký passkey không đúng');
  if ((authData.signCount !== 0 || stored.signCount !== 0) && authData.signCount <= stored.signCount) {
    throw new WebAuthnError('Passkey có dấu hiệu bị sao chép, đã từ chối');
  }
  return authData.signCount;
}

/** The challenge from clientDataJSON, so the server can look up which one it issued. */
export function challengeOf(credential) {
  try {
    const c = JSON.parse(b64u.decode(credential?.response?.clientDataJSON).toString('utf8')).challenge;
    return typeof c === 'string' && c.length <= 128 ? c : null;
  } catch {
    return null;
  }
}
