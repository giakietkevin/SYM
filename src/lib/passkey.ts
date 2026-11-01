import { api, ApiError, type Profile } from './api';

const fromB64u = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const toB64u = (buf: ArrayBuffer | null) => {
  if (!buf) return null;
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Passkeys need a browser that has them and a secure page (https, or localhost while developing). */
export function passkeySupport(): 'ok' | 'insecure' | 'unsupported' {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  return 'ok';
}

/** The person closed the prompt or it timed out: not an error worth a red message. */
export const isCancel = (e: unknown) => e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError');

function explain(e: unknown): Error {
  if (e instanceof ApiError) return e;
  if (e instanceof DOMException) {
    if (e.name === 'InvalidStateError') return new Error('Thiết bị này đã có passkey cho tài khoản này rồi.');
    if (e.name === 'SecurityError') return new Error('Trang này chưa dùng được passkey (cần HTTPS).');
    if (e.name === 'NotSupportedError') return new Error('Thiết bị không hỗ trợ loại passkey này.');
  }
  return e instanceof Error ? e : new Error('Không tạo được passkey');
}

/** Creates a passkey on this device for the signed-in account. Needs the password again. */
export async function addPasskey(password: string, name: string) {
  const o = await api.passkeyRegisterOptions(password);
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        challenge: fromB64u(o.challenge),
        rp: o.rp,
        user: { id: fromB64u(o.user.id), name: o.user.name, displayName: o.user.displayName },
        pubKeyCredParams: o.pubKeyCredParams,
        authenticatorSelection: o.authenticatorSelection,
        excludeCredentials: o.excludeCredentials.map((c) => ({ type: 'public-key' as const, id: fromB64u(c.id) })),
        attestation: 'none',
        timeout: o.timeout,
      },
    })) as PublicKeyCredential;
  } catch (e) {
    if (isCancel(e)) throw e;
    throw explain(e);
  }
  const r = cred.response as AuthenticatorAttestationResponse;
  return api.passkeyRegister(
    {
      id: cred.id,
      response: { clientDataJSON: toB64u(r.clientDataJSON)!, attestationObject: toB64u(r.attestationObject)! },
    },
    name,
  );
}

/** Signs in with any passkey saved for this site: the browser lists them, no username needed. */
export async function signInWithPasskey(): Promise<Profile> {
  const o = await api.passkeyLoginOptions();
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.get({
      publicKey: { challenge: fromB64u(o.challenge), rpId: o.rpId, userVerification: 'required', timeout: o.timeout, allowCredentials: [] },
    })) as PublicKeyCredential;
  } catch (e) {
    if (isCancel(e)) throw e;
    throw explain(e);
  }
  const r = cred.response as AuthenticatorAssertionResponse;
  return api.passkeyLogin({
    id: cred.id,
    response: {
      clientDataJSON: toB64u(r.clientDataJSON)!,
      authenticatorData: toB64u(r.authenticatorData)!,
      signature: toB64u(r.signature)!,
      userHandle: toB64u(r.userHandle),
    },
  });
}
