import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';
import { mergeStates, parseState } from './store';
import type { State } from './types';

export type SyncStatus = 'saved' | 'saving' | 'offline';

const cacheKey = (user: string) => `sym.cache.${user}`;

export function readCache(user: string): { state: State; rev: number } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey(user)) ?? 'null');
    const state = parseState(raw?.state);
    return state ? { state, rev: Number(raw.rev) || 0 } : null;
  } catch {
    return null;
  }
}

export function clearCache(user: string) {
  try {
    localStorage.removeItem(cacheKey(user));
  } catch {
    /* blocked */
  }
}

/**
 * Local-first sync of one user's state.
 * Every change is cached on the device at once and pushed to the server shortly after.
 * The server accepts a save only if our revision is current; otherwise it returns the newer
 * version (another device saved first) and we adopt it instead of overwriting it.
 */
export function useSync({
  user,
  state,
  initialRev,
  adopt,
  onUnauthorized,
  onRemoteChange,
}: {
  user: string;
  state: State;
  initialRev: number;
  adopt: (s: State) => void;
  onUnauthorized: () => void;
  onRemoteChange: () => void;
}) {
  const [status, setStatus] = useState<SyncStatus>('saved');
  const rev = useRef(initialRev);
  const stateRef = useRef(state);
  const sent = useRef(JSON.stringify(state)); // last state the server is known to have
  const busy = useRef(false);
  const timer = useRef(0);
  const cb = useRef({ adopt, onUnauthorized, onRemoteChange });
  cb.current = { adopt, onUnauthorized, onRemoteChange };

  const take = useCallback((s: State | null, r: number) => {
    rev.current = r;
    if (s) {
      sent.current = JSON.stringify(s);
      stateRef.current = s;
      cb.current.adopt(s);
    }
  }, []);

  const push = useCallback(async (): Promise<boolean> => {
    if (busy.current) return false;
    const json = JSON.stringify(stateRef.current);
    if (json === sent.current) {
      setStatus('saved');
      return true;
    }
    busy.current = true;
    setStatus('saving');
    try {
      const res = await api.putData(stateRef.current, rev.current);
      rev.current = res.rev;
      sent.current = json;
      busy.current = false;
      // edited again while the request was in flight
      if (JSON.stringify(stateRef.current) !== sent.current) return push();
      setStatus('saved');
      return true;
    } catch (e) {
      busy.current = false;
      if (e instanceof ApiError && e.status === 401) cb.current.onUnauthorized();
      else if (e instanceof ApiError && e.status === 409) {
        const remote = parseState(e.body?.state);
        if (!remote) {
          rev.current = 0; // the server has nothing for us yet
          return push();
        }
        // keep what this device added AND what the other device saved
        const merged = mergeStates(stateRef.current, remote);
        rev.current = Number(e.body?.rev) || 0;
        sent.current = JSON.stringify(remote);
        stateRef.current = merged;
        cb.current.adopt(merged); // differs from `sent`, so the effect pushes the merged result
        cb.current.onRemoteChange();
        setStatus('saving');
      } else setStatus('offline');
      return false;
    }
  }, [take]);

  // state changed: cache on the device now, send to the server soon
  useEffect(() => {
    stateRef.current = state;
    try {
      localStorage.setItem(cacheKey(user), JSON.stringify({ state, rev: rev.current }));
    } catch {
      /* storage full or blocked */
    }
    if (JSON.stringify(state) === sent.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(push, 700);
    return () => window.clearTimeout(timer.current);
  }, [state, user, push]);

  // retry when the connection returns, and every 15 s while something is unsent
  useEffect(() => {
    const retry = () => void push();
    window.addEventListener('online', retry);
    const t = window.setInterval(() => {
      if (JSON.stringify(stateRef.current) !== sent.current) void push();
    }, 15_000);
    return () => {
      window.removeEventListener('online', retry);
      window.clearInterval(t);
    };
  }, [push]);

  // coming back to the tab: pick up what another device saved (only if we have nothing unsent)
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible' || busy.current) return;
      if (JSON.stringify(stateRef.current) !== sent.current) return;
      try {
        const remote = await api.getData();
        const s = parseState(remote.state);
        if (s && remote.rev > rev.current && JSON.stringify(stateRef.current) === sent.current) {
          take(s, remote.rev);
          cb.current.onRemoteChange();
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) cb.current.onUnauthorized();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [take]);

  return { status, flush: push, dirty: () => JSON.stringify(stateRef.current) !== sent.current };
}
