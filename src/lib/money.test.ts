import { describe, expect, it } from 'vitest';
import { evalExpr, short } from './money';
import { planSplit, preset } from './split';
import { planRefill } from './rollover';
import type { Jar } from './types';

const jar = (id: string, kind: Jar['kind'] = 'spend', goal = 1_000_000): Jar => ({ id, name: id, kind, hue: 'sage', theme: 'jar', goal, created: 0 });

describe('evalExpr', () => {
  it.each([
    ['35k+15k', 50_000],
    ['1tr-200k', 800_000],
    ['50.000', 50_000],
    ['100k+', 100_000],
    ['2tr−500k', 1_500_000],
    ['', 0],
  ])('%s = %d', (raw, want) => expect(evalExpr(raw)).toBe(want));

  it('rejects anything that is not a sum', () => {
    expect(evalExpr('2*3')).toBeNull();
    expect(evalExpr('abc')).toBeNull();
  });
});

describe('short', () => {
  it('formats chips', () => {
    expect(short(35_000)).toBe('35k');
    expect(short(1_250_000)).toBe('1,3tr');
    expect(short(2_000_000)).toBe('2tr');
    expect(short(-50_000)).toBe('−50k');
  });
});

describe('planSplit', () => {
  it('rounds each share down so the dust stays in the wallet', () => {
    const jars = [jar('a'), jar('b'), jar('c')];
    const lines = planSplit(100_001, { a: 33, b: 33, c: 33 }, jars);
    expect(lines.map((l) => l.amount)).toEqual([33_000, 33_000, 33_000]);
  });

  it('skips jars with no share and does nothing without a rule', () => {
    expect(planSplit(1000, { a: 50 }, [jar('a'), jar('b')]).map((l) => l.jar.id)).toEqual(['a']);
    expect(planSplit(1000, undefined, [jar('a')])).toEqual([]);
  });
});

describe('preset', () => {
  it('503020 gives 80 to spending and 20 to saving, always summing to 100', () => {
    const r = preset('503020', [jar('a'), jar('b'), jar('c'), jar('s', 'save')]);
    expect(r.s).toBe(20);
    expect(r.a + r.b + r.c).toBe(80);
  });

  it('equal spreads the remainder over the first jars', () => {
    expect(preset('equal', [jar('a'), jar('b'), jar('c')])).toEqual({ a: 34, b: 33, c: 33 });
  });
});

describe('planRefill', () => {
  const food = jar('food', 'spend', 100);
  const fun = jar('fun', 'spend', 100);

  it('top brings a jar back to its limit, surplus returns to the wallet', () => {
    const { steps, walletAfter } = planRefill([food, fun], { food: 30, fun: 150 }, 100, {});
    expect(steps.find((s) => s.jar.id === 'food')).toMatchObject({ move: 70, after: 100, short: false });
    expect(steps.find((s) => s.jar.id === 'fun')).toMatchObject({ move: -50, after: 100 });
    expect(walletAfter).toBe(80);
  });

  it('add keeps the leftover and adds a full limit; skip leaves the jar', () => {
    const { steps } = planRefill([food, fun], { food: 30, fun: 10 }, 500, { food: 'add', fun: 'skip' });
    expect(steps[0]).toMatchObject({ move: 100, after: 130 });
    expect(steps[1]).toMatchObject({ move: 0, after: 10 });
  });

  it('refills in order and flags the shortfall when the wallet runs out', () => {
    const { steps, walletAfter } = planRefill([food, fun], { food: 0, fun: 0 }, 150, {});
    expect(steps.map((s) => [s.move, s.short])).toEqual([
      [100, false],
      [50, true],
    ]);
    expect(walletAfter).toBe(0);
  });
});
