import type { Jar, Rule } from './types';

/** Sum of the percentages given to jars that still exist. */
export function ruleTotal(rule: Rule | undefined, jars: Jar[]): number {
  return jars.reduce((s, j) => s + (rule?.[j.id] ?? 0), 0);
}

export interface SplitLine {
  jar: Jar;
  amount: number;
}

/**
 * Whole-đồng amounts per jar. Each share is rounded down, so the rounding dust
 * (and any percentage left unassigned) simply stays in the wallet.
 */
export function planSplit(amount: number, rule: Rule | undefined, jars: Jar[]): SplitLine[] {
  if (!rule || amount <= 0) return [];
  return jars
    .map((jar) => ({ jar, amount: Math.floor((amount * (rule[jar.id] ?? 0)) / 100) }))
    .filter((l) => l.amount > 0);
}

/** `share` percent spread over `ids`, whole numbers, the first ones take the remainder. */
function spread(ids: string[], share: number): Rule {
  const out: Rule = {};
  if (!ids.length) return out;
  const base = Math.floor(share / ids.length);
  let extra = share - base * ids.length;
  for (const id of ids) {
    out[id] = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
  }
  return out;
}

export type Preset = 'equal' | '503020';

/**
 * equal:  every jar the same.
 * 503020: needs 50 + wants 30 go to the spending jars, 20 to the saving jars.
 *         With only one kind of jar, that kind takes the whole 100.
 */
export function preset(kind: Preset, jars: Jar[]): Rule {
  const spend = jars.filter((j) => j.kind === 'spend').map((j) => j.id);
  const save = jars.filter((j) => j.kind === 'save').map((j) => j.id);
  if (kind === 'equal') return spread(jars.map((j) => j.id), 100);
  if (spend.length && save.length) return { ...spread(spend, 80), ...spread(save, 20) };
  return spread(spend.length ? spend : save, 100);
}
