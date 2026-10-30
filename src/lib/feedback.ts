type Pattern = 'tap' | 'pick' | 'drop' | 'success' | 'warn';

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  pick: 16,
  drop: [10, 40, 22],
  success: [12, 50, 18],
  warn: [30, 50, 30],
};

const flags = { sound: true, haptics: true };

export function setFeedbackFlags(sound: boolean, haptics: boolean) {
  flags.sound = sound;
  flags.haptics = haptics;
}

/** Vibration API: Android browsers and installed PWAs. iOS Safari ignores it. */
export function haptic(p: Pattern) {
  if (!flags.haptics) return;
  try {
    navigator.vibrate?.(PATTERNS[p]);
  } catch {
    /* unsupported */
  }
}

let ctx: AudioContext | null = null;

function tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  if (!ctx) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function audio(): boolean {
  if (!flags.sound) return false;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

/** "chinh!" – two bright notes, used when money lands in a jar. */
export function chime() {
  if (!audio()) return;
  tone(1318.5, 0, 0.16, 0.16);
  tone(1760, 0.075, 0.38, 0.14);
}

/** Softer single note for taking money out. */
export function pop() {
  if (!audio()) return;
  tone(660, 0, 0.14, 0.14, 'triangle');
  tone(494, 0.06, 0.2, 0.1, 'triangle');
}

export function soft() {
  if (!audio()) return;
  tone(880, 0, 0.08, 0.06);
}
