import { describe, expect, it } from 'vitest';
import { guessMapping, importTxs, parseAmount, parseCsv, parseDate, planImport } from './bankcsv';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF, BOM and the separator', () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('Ngày;Số tiền\n01/02/2026;1.000\n')).toEqual([
      ['Ngày', 'Số tiền'],
      ['01/02/2026', '1.000'],
    ]);
  });
});

describe('parseAmount', () => {
  it.each([
    ['1.234.567', 1_234_567],
    ['1,234,567.00', 1_234_567],
    ['-50.000 VND', -50_000],
    ['(1,000)', -1000],
    ['+2.000.000đ', 2_000_000],
    ['50000-', -50_000],
    ['12,5', 13],
    ['', null],
    ['abc', null],
  ])('%s', (raw, want) => expect(parseAmount(raw)).toBe(want));
});

describe('parseDate', () => {
  const day = (ts: number | null) => (ts === null ? null : new Date(ts).toDateString());
  it('reads day-first and ISO dates', () => {
    expect(day(parseDate('31/12/2026'))).toBe(new Date(2026, 11, 31).toDateString());
    expect(day(parseDate('05-01-26 14:05'))).toBe(new Date(2026, 0, 5).toDateString());
    expect(day(parseDate('2026-03-09'))).toBe(new Date(2026, 2, 9).toDateString());
  });
  it('rejects impossible dates', () => {
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('hôm qua')).toBeNull();
  });
});

const vcb = `Sao kê tài khoản
Số TK: 0123456789
STT,Ngày giao dịch,Số tham chiếu,Ghi nợ,Ghi có,Số dư,Nội dung
1,01/11/2026,FT001,"55,000",,"9,945,000",GRAB*FOOD PHO BO
2,02/11/2026,FT002,,"10,000,000","19,945,000",LUONG THANG 10
3,02/11/2026,FT003,"55,000",,"19,890,000",GRAB*FOOD PHO BO
4,03/11/2026,FT004,,,"19,890,000",PHI DUY TRI 0D
Tổng cộng,,,"110,000","10,000,000",,`;

describe('statement import', () => {
  const rows = parseCsv(vcb);

  it('finds the header under the title lines and the debit/credit columns, skipping the balance', () => {
    expect(guessMapping(rows)).toEqual({ header: 2, date: 1, desc: 6, amount: -1, debit: 3, credit: 4 });
  });

  it('a single signed amount column works too', () => {
    expect(guessMapping(parseCsv('Date,Description,Amount\n2026-11-01,Coffee,-45000\n'))).toMatchObject({ date: 0, desc: 1, amount: 2, debit: -1, credit: -1 });
  });

  it('reads the rows, skips lines with no money or no date', () => {
    const plan = planImport(rows, guessMapping(rows)!, new Set());
    expect(plan.rows.map((r) => [r.amount, r.note])).toEqual([
      [-55_000, 'GRAB*FOOD PHO BO'],
      [10_000_000, 'LUONG THANG 10'],
      [-55_000, 'GRAB*FOOD PHO BO'],
    ]);
    expect(plan.skipped).toBe(2);
  });

  it('ids are stable, and importing twice adds nothing', () => {
    const map = guessMapping(rows)!;
    const first = planImport(rows, map, new Set());
    expect(new Set(first.rows.map((r) => r.id)).size).toBe(3);
    const again = planImport(rows, map, new Set(first.rows.map((r) => r.id)));
    expect(again.rows.every((r) => r.dup)).toBe(true);
    expect(importTxs(again, 'food', 'wallet')).toEqual([]);
  });

  it('money out leaves the chosen jar, money in lands in the wallet', () => {
    const txs = importTxs(planImport(rows, guessMapping(rows)!, new Set()), 'food', 'wallet');
    expect(txs.map((t) => [t.type, t.amount, t.from ?? t.to])).toEqual([
      ['expense', 55_000, 'food'],
      ['income', 10_000_000, 'wallet'],
      ['expense', 55_000, 'food'],
    ]);
    expect(txs.every((t) => t.id.startsWith('imp:'))).toBe(true);
  });
});
