// Web Push without dependencies: message encryption (RFC 8291, aes128gcm) and VAPID (RFC 8292), with node:crypto.
import { createECDH, createPrivateKey, createCipheriv, hkdfSync, randomBytes, sign } from 'node:crypto';
import { request } from 'node:https';

const b64u = (b) => Buffer.from(b).toString('base64url');

/** A new VAPID key pair: the public key as the 65-byte uncompressed point the browser wants, the private as a JWK. */
export function generateVapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const pub = ecdh.getPublicKey();
  return {
    publicKey: b64u(pub),
    privateJwk: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: b64u(ecdh.getPrivateKey()) },
  };
}

/** The Authorization header value: a short-lived ES256 JWT for the push service's origin, plus our public key. */
export function vapidAuth(endpoint, vapid, subject, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const key = createPrivateKey({ key: vapid.privateJwk, format: 'jwk' });
  // JWS wants the raw r||s signature, not DER
  const sig = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${vapid.publicKey}`;
}

/**
 * Encrypts `payload` for one subscription (its p256dh key and auth secret, base64url). One record, as every
 * browser expects. `salt` and `ephemeral` are only passed by tests.
 */
export function encrypt(payload, keys, { salt = randomBytes(16), ephemeral } = {}) {
  const uaPublic = Buffer.from(keys.p256dh, 'base64url');
  const authSecret = Buffer.from(keys.auth, 'base64url');
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('bad p256dh');
  if (authSecret.length < 16) throw new Error('bad auth');

  const as = ephemeral ?? createECDH('prime256v1');
  if (!ephemeral) as.generateKeys();
  const asPublic = as.getPublicKey();
  const shared = as.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 0x02: last (and only) record
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** Push services we deliver to. Anything else is refused, so a subscription cannot make the server call any URL. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'];

export function allowedEndpoint(endpoint) {
  let u;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.port) return false;
  return PUSH_HOSTS.some((h) => (h.startsWith('.') ? u.hostname.endsWith(h) : u.hostname === h));
}

/**
 * Sends one message. Resolves with the push service's status: 201 delivered, 404/410 the subscription is gone
 * (the caller deletes it), anything else is logged and retried by nobody (reminders are best effort).
 * `transport` is only replaced by tests.
 */
export function sendPush(sub, payload, { vapid, subject, ttl = 24 * 3600, urgency = 'normal', transport = request } = {}) {
  const body = encrypt(JSON.stringify(payload), sub.keys);
  const u = new URL(sub.endpoint);
  return new Promise((resolve, reject) => {
    const req = transport(
      {
        method: 'POST',
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        timeout: 15_000,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          'Content-Length': body.length,
          TTL: String(ttl),
          Urgency: urgency,
          Authorization: vapidAuth(sub.endpoint, vapid, subject),
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('timeout', () => req.destroy(new Error('push timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
