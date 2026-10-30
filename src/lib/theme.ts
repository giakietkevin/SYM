import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'sym.theme';
const BAR = { light: '#f2f4f1', dark: '#0f1110' }; // browser chrome colour, matches --ground

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** A device preference, not account data: a phone and a laptop can differ. */
export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export const resolveTheme = (pref: ThemePref): Theme => (pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref);

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(readPref()));

  useEffect(() => {
    const next = resolveTheme(pref);
    setTheme(next);
    apply(next);
    if (pref !== 'system') return;
    // follow the system while the preference is "auto"
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const t = mq.matches ? 'dark' : 'light';
      setTheme(t);
      apply(t);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      if (p === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* blocked storage: the choice lasts for this visit */
    }
  }, []);

  /** The header button: flip what is on screen right now. */
  const toggle = useCallback(() => setPref(theme === 'dark' ? 'light' : 'dark'), [theme, setPref]);

  return { pref, theme, setPref, toggle };
}
