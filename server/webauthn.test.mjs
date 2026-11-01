import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cborDecode, challengeOf, verifyAssertion, verifyRegistration } from './webauthn.mjs';

// ── a tiny CBOR encoder, only for building test inputs ──
function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) {
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}
function cbor(v) {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === 'string') return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error('unsupported');
}

const sha = (b) => createHash('sha256').update(b).digest();
const enc = (b) => Buffer.from(b).toString('base64url');
const RP = { rpId: 'localhost', origin: 'http://localhost:5173' };

/** A fake authenticator holding one key. */
function authenticator(kind = 'ec') {
  const { publicKey, privateKey } = kind === 'ed' ? generateKeyPairSync('ed25519') : generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const cose =
    kind === 'ed'
      ? new Map([[1, 1], [3, -8], [-1, 6], [-2, Buffer.from(jwk.x, 'base64url')]])
      : new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
  const credId = Buffer.alloc(32, kind === 'ed' ? 7 : 3);
  let count = 0;
  const authData = ({ rpId = RP.rpId, flags = 0x05, attested = false, counter } = {}) => {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(counter ?? count);
    const parts = [sha(rpId), Buffer.from([flags | (attested ? 0x40 : 0)]), c];
    if (attested) {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(credId.length);
      parts.push(Buffer.alloc(16), len, credId, cbor(cose));
    }
    return Buffer.concat(parts);
  };
  const client = (type, challenge, origin = RP.origin) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  return {
    id: enc(credId),
    create(challenge, opts = {}) {
      const att = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData({ attested: true, ...opts })]]));
      return { id: enc(credId), response: { clientDataJSON: enc(client('webauthn.create', challenge, opts.origin)), attestationObject: enc(att) } };
    },
    get(challenge, opts = {}) {
      count += opts.step ?? 1;
      const ad = authData(opts);
      const cd = client(opts.type ?? 'webauthn.get', challenge, opts.origin);
      const data = Buffer.concat([ad, sha(cd)]);
      const sig = kind === 'ed' ? sign(null, data, privateKey) : sign('sha256', data, privateKey);
      return { id: enc(credId), response: { clientDataJSON: enc(cd), authenticatorData: enc(ad), signature: enc(opts.badSig ? Buffer.from(sig).reverse() : sig) } };
    },
  };
}

describe('cbor', () => {
  it('decodes what the encoder wrote', () => {
    const [v] = cborDecode(cbor(new Map([['a', [1, -7, 300, 70000]], [3, Buffer.from('hi')]])));
    expect(v.get('a')).toEqual([1, -7, 300, 70000]);
    expect(v.get(3).toString()).toBe('hi');
  });
  it('refuses truncated input', () => expect(() => cborDecode(Buffer.from([0x45, 1, 2]))).toThrow());
});

describe.each(['ec', 'ed'])('passkey (%s)', (kind) => {
  it('registers, then signs in, and the counter moves', () => {
    const a = authenticator(kind);
    const reg = verifyRegistration(a.create('chal-1'), { ...RP, challenge: 'chal-1' });
    expect(reg.id).toBe(a.id);
    const stored = { spki: reg.spki, alg: reg.alg, signCount: reg.signCount };
    const count = verifyAssertion(a.get('chal-2'), stored, { ...RP, challenge: 'chal-2' });
    expect(count).toBe(1);
  });

  it('refuses a wrong challenge, origin, rp, type, signature, or missing user verification', () => {
    const a = authenticator(kind);
    const reg = verifyRegistration(a.create('c'), { ...RP, challenge: 'c' });
    const stored = { spki: reg.spki, alg: reg.alg, signCount: 0 };
    const opts = { ...RP, challenge: 'x' };
    expect(() => verifyAssertion(a.get('y'), stored, opts)).toThrow(/Thử thách/);
    expect(() => verifyAssertion(a.get('x', { origin: 'https://evil.example' }), stored, opts)).toThrow(/trang khác/);
    expect(() => verifyAssertion(a.get('x', { rpId: 'evil.example' }), stored, opts)).toThrow(/trang khác/);
    expect(() => verifyAssertion(a.get('x', { type: 'webauthn.create' }), stored, opts)).toThrow(/Sai loại/);
    expect(() => verifyAssertion(a.get('x', { badSig: true }), stored, opts)).toThrow(/Chữ ký/);
    expect(() => verifyAssertion(a.get('x', { flags: 0x01 }), stored, opts)).toThrow(/xác minh/);
  });

  it('refuses a counter that goes backwards (a cloned key), allows always-zero counters', () => {
    const a = authenticator(kind);
    const reg = verifyRegistration(a.create('c'), { ...RP, challenge: 'c' });
    expect(() => verifyAssertion(a.get('x', { counter: 3 }), { spki: reg.spki, alg: reg.alg, signCount: 5 }, { ...RP, challenge: 'x' })).toThrow(/sao chép/);
    expect(verifyAssertion(a.get('x', { counter: 0 }), { spki: reg.spki, alg: reg.alg, signCount: 0 }, { ...RP, challenge: 'x' })).toBe(0);
  });
});

describe('registration checks', () => {
  it('refuses a registration for another site or without user verification', () => {
    const a = authenticator();
    expect(() => verifyRegistration(a.create('c', { origin: 'https://evil.example' }), { ...RP, challenge: 'c' })).toThrow(/trang khác/);
    expect(() => verifyRegistration(a.create('c', { flags: 0x01 }), { ...RP, challenge: 'c' })).toThrow(/xác minh/);
    expect(() => verifyRegistration({ ...a.create('c'), id: 'other' }, { ...RP, challenge: 'c' })).toThrow(/không khớp/);
  });

  it('reads the challenge out of the client data', () => {
    expect(challengeOf(authenticator().get('abc'))).toBe('abc');
    expect(challengeOf({ response: { clientDataJSON: '!!' } })).toBeNull();
  });
});
