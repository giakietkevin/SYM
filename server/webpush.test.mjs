import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from 'node:crypto';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { describe, expect, it } from 'vitest';
import { allowedEndpoint, encrypt, generateVapidKeys, sendPush, vapidAuth } from './webpush.mjs';

/** The browser's side of RFC 8291, written separately from the sender so the two check each other. */
function decrypt(body, ua, authSecret) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const data = body.subarray(21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  let end = plain.length - 1;
  while (plain[end] === 0) end--;
  expect(plain[end]).toBe(2);
  return plain.subarray(0, end).toString();
}

function browser() {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = Buffer.alloc(16, 9);
  return { ua, auth, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
}

describe('web push encryption', () => {
  it('matches the RFC 8291 appendix A test vector', () => {
    const as = createECDH('prime256v1');
    as.setPrivateKey(Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url'));
    const out = encrypt(
      'When I grow up, I want to be a watermelon',
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      { salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url'), ephemeral: as },
    );
    expect(out.toString('base64url')).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('round-trips a Vietnamese payload with a fresh key each time', () => {
    const b = browser();
    const msg = JSON.stringify({ title: 'SYM', body: 'Hôm nay chưa ghi khoản chi nào 💸' });
    const one = encrypt(msg, b.keys);
    const two = encrypt(msg, b.keys);
    expect(one.equals(two)).toBe(false);
    expect(decrypt(one, b.ua, b.auth)).toBe(msg);
    expect(decrypt(two, b.ua, b.auth)).toBe(msg);
  });

  it('refuses malformed subscription keys', () => {
    expect(() => encrypt('x', { p256dh: 'AAAA', auth: 'BTBZMqHH6r4Tts7J_aSIgg' })).toThrow();
  });
});

describe('vapid', () => {
  it('signs a JWT for the push service origin that verifies with our public key', () => {
    const v = generateVapidKeys();
    const h = vapidAuth('https://fcm.googleapis.com/fcm/send/abc', v, 'mailto:a@b.vn', 1_700_000_000_000);
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h);
    expect(k).toBe(v.publicKey);
    const [head, claims, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(claims, 'base64url'))).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_700_000_000 + 43_200, sub: 'mailto:a@b.vn' });
    const pub = Buffer.from(v.publicKey, 'base64url');
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))).toBe(true);
  });
});

describe('endpoints', () => {
  it('only the big push services, over https on the default port', () => {
    expect(allowedEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(allowedEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(allowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(allowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(allowedEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(allowedEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(allowedEndpoint('https://evil.com/?fcm.googleapis.com')).toBe(false);
    expect(allowedEndpoint('https://push.apple.com.evil.com/x')).toBe(false);
    expect(allowedEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(allowedEndpoint('nonsense')).toBe(false);
  });
});

describe('sendPush', () => {
  it('posts an encrypted body with the right headers, and reports the status', async () => {
    const b = browser();
    const got = await new Promise((resolve) => {
      const srv = createServer((req, res) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          res.writeHead(201).end();
          srv.close();
          resolve({ headers: req.headers, body: Buffer.concat(chunks) });
        });
      }).listen(0, async () => {
        const v = generateVapidKeys();
        const status = await sendPush({ endpoint: `http://127.0.0.1:${srv.address().port}/push/1`, keys: b.keys }, { title: 'SYM', body: 'chào' }, { vapid: v, subject: 'mailto:a@b.vn', transport: httpRequest });
        expect(status).toBe(201);
      });
    });
    expect(got.headers['content-encoding']).toBe('aes128gcm');
    expect(got.headers.ttl).toBe('86400');
    expect(got.headers.authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(JSON.parse(decrypt(got.body, b.ua, b.auth))).toEqual({ title: 'SYM', body: 'chào' });
  });
});
