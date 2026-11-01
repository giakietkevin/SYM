import { api } from './api';

export type PushSupport = 'ok' | 'dev' | 'insecure' | 'ios-install' | 'unsupported';

/**
 * Whether this device can get push notifications. iPhone and iPad only allow it for the app added to the home
 * screen (iOS 16.4+); during development there is no service worker, so no push either.
 */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!import.meta.env.PROD) return 'dev';
  if (!window.isSecureContext) return 'insecure';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return ios && !standalone ? 'ios-install' : 'unsupported';
  return 'ok';
}

const fromB64u = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function registration() {
  // ready never settles without a worker; give up after a few seconds instead of hanging the button
  return Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, no) => setTimeout(() => no(new Error('Chưa sẵn sàng, tải lại trang rồi thử lại.')), 8000))]);
}

/** This device's subscription, if notifications are on here. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  try {
    return await (await registration()).pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Asks for permission (must follow a tap), subscribes this device, and tells the server. */
export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error(perm === 'denied' ? 'Thông báo đang bị chặn. Mở cài đặt trang web của trình duyệt để cho phép.' : 'Bạn chưa cho phép thông báo.');
  }
  const { publicKey } = await api.pushKey();
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // a subscription made with another server key cannot be reused
  const key = sub?.options.applicationServerKey;
  if (sub && key && new Uint8Array(key).join() !== fromB64u(publicKey).join()) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(publicKey) });
  const json = sub.toJSON();
  await api.pushSubscribe({ endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } });
}

/** Stops notifications on this device (server first, while still signed in, then the browser). */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => false);
}
