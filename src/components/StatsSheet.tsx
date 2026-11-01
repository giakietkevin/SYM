import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtD, short } from '../lib/money';
import { jarTrends, monthSeries, yearSummary, yearsWithData, type MonthPoint } from '../lib/stats';
import type { Store } from '../lib/store';
import { Seg, Sheet } from './ui';

/** Monthly spending as bars: one series, one axis, a readout line that follows hover, focus or tap. */
function SpendChart({ data }: { data: MonthPoint[] }) {
  const [pick, setPick] = useState<number | null>(null);
  // drawn at the real width, so 12px text stays 12px on a phone and on a desktop
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 200;
  const top = 12;
  const bottom = 24;
  const left = 44;
  const max = Math.max(1, ...data.map((d) => d.spent));
  // a round top value for the scale: 1, 2, 2.5 or 5 times a power of ten
  const mag = 10 ** Math.floor(Math.log10(max));
  const ceil = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= max) ?? max;
  const y = (v: number) => top + (H - top - bottom) * (1 - v / ceil);
  const slot = (W - left) / data.length;
  const bw = Math.min(36, slot * 0.6);
  const ticks = [0, ceil / 2, ceil];
  const shown = pick ?? data.length - 1;
  const d = data[shown];

  /** a bar with 4px rounded data-end, square on the baseline */
  const bar = (x: number, h: number) => {
    const r = Math.min(4, h, bw / 2);
    const b = y(0);
    return `M${x},${b}V${b - h + r}Q${x},${b - h} ${x + r},${b - h}H${x + bw - r}Q${x + bw},${b - h} ${x + bw},${b - h + r}V${b}Z`;
  };

  return (
    <figure className="chart" ref={box}>
      <p className="chart-readout num" aria-live="polite">
        <b>{d.label === 'T1' || d.label.startsWith('T1/') ? `Tháng 1/${d.ym.slice(0, 4)}` : `Tháng ${Number(d.ym.slice(5))}`}</b> · chi {fmtD(d.spent)} · thu {fmtD(d.income)}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Chi tiêu theo tháng" onPointerLeave={() => setPick(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart-base' : 'chart-grid'} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">
              {t === 0 ? '0' : short(t)}
            </text>
          </g>
        ))}
        {data.map((p, i) => {
          const x = left + i * slot + (slot - bw) / 2;
          const h = Math.max(0, y(0) - y(p.spent));
          return (
            <g
              key={p.ym}
              tabIndex={0}
              role="button"
              aria-label={`${p.label}: chi ${fmtD(p.spent)}`}
              onPointerEnter={() => setPick(i)}
              onFocus={() => setPick(i)}
              onClick={() => setPick(i)}
              className={`chart-col ${i === shown ? 'on' : ''}`}
            >
              {/* hit target: the whole column, bigger than the bar */}
              <rect x={left + i * slot} y={top} width={slot} height={H - top - bottom} fill="transparent" />
              {h > 0 && <path d={bar(x, h)} className="chart-bar" />}
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="chart-tick">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Tiny bars for a jar's months, same scale within the row. */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <svg className="spark" viewBox={`0 0 ${values.length * 8} 24`} aria-hidden="true">
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(2, (v / max) * 22) : 0;
        return <rect key={i} x={i * 8 + 1} y={24 - h} width={6} height={h} rx={1.5} className={i === values.length - 1 ? 'spark-now' : 'spark-bar'} />;
      })}
    </svg>
  );
}

export function StatsSheet({ store, onClose }: { store: Store; onClose: () => void }) {
  const [range, setRange] = useState<'6' | '12'>('6');
  const [table, setTable] = useState(false);
  const txs = store.state.txs;
  const jars = store.state.jars;
  const series = useMemo(() => monthSeries(txs, jars, Number(range)), [txs, jars, range]);
  const trends = useMemo(() => jarTrends(txs, jars, series), [txs, jars, series]);
  const years = useMemo(() => yearsWithData(txs), [txs]);
  const [year, setYear] = useState(years[0]);
  const ys = useMemo(() => yearSummary(txs, jars, year), [txs, jars, year]);

  const spent = series.reduce((s, p) => s + p.spent, 0);
  const income = series.reduce((s, p) => s + p.income, 0);
  const saved = series.reduce((s, p) => s + p.saved, 0);
  const active = series.filter((p) => p.spent > 0 || p.income > 0).length;

  return (
    <Sheet title="Thống kê" onClose={onClose} wide>
      <Seg
        label="Khoảng thời gian"
        value={range}
        onChange={setRange}
        options={[
          { value: '6', label: '6 tháng' },
          { value: '12', label: '12 tháng' },
        ]}
      />

      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="hint">Chi trung bình / tháng</span>
          <b className="num">{fmtD(active ? Math.round(spent / active) : 0)}</b>
        </div>
        <div className="stat-tile">
          <span className="hint">Tổng thu</span>
          <b className="num">{fmtD(income)}</b>
        </div>
        <div className="stat-tile">
          <span className="hint">Đã tích lũy</span>
          <b className="num">{fmtD(saved)}</b>
        </div>
      </div>

      <section className="field">
        <div className="sec-row">
          <h3 className="label">Chi tiêu theo tháng</h3>
          <button className="btn text" onClick={() => setTable(!table)} aria-expanded={table}>
            {table ? 'Ẩn bảng' : 'Xem bảng'}
          </button>
        </div>
        <SpendChart data={series} />
        {table && (
          <table className="stat-table num">
            <thead>
              <tr>
                <th>Tháng</th>
                <th>Chi</th>
                <th>Thu</th>
                <th>Tích lũy</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.ym}>
                  <td>{p.ym.split('-').reverse().join('/')}</td>
                  <td>{fmtD(p.spent)}</td>
                  <td>{fmtD(p.income)}</td>
                  <td>{fmtD(p.saved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="field">
        <h3 className="label">Theo hũ</h3>
        {trends.length ? (
          <ul className="trend-list">
            {trends.map((t) => (
              <li key={t.id}>
                <span className="trend-name">
                  <b>{t.name}</b>
                  <span className="hint num">
                    Tháng này {short(t.months[t.months.length - 1])}
                    {t.avg !== null && ` · TB ${short(t.avg)}`}
                  </span>
                </span>
                <Spark values={t.months} />
                <span className={`trend-delta num ${t.deltaPct !== null && t.deltaPct > 10 ? 'up' : t.deltaPct !== null && t.deltaPct < -10 ? 'down' : ''}`}>
                  {t.deltaPct === null ? '—' : `${t.deltaPct > 0 ? '+' : ''}${t.deltaPct}%`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Chưa có khoản chi nào trong khoảng này.</p>
        )}
        <p className="hint">% so với trung bình các tháng trước có chi tiêu trong hũ đó.</p>
      </section>

      <section className="field">
        <div className="sec-row">
          <h3 className="label">Tổng kết năm {year}</h3>
          {years.length > 1 && (
            <div className="chips" role="radiogroup" aria-label="Chọn năm">
              {years.map((y) => (
                <button key={y} type="button" role="radio" aria-checked={y === year} className={`chip tag-chip ${y === year ? 'on' : ''}`} onClick={() => setYear(y)}>
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
        {ys.hasData ? (
          <div className="year-box">
            <div className="stat-tiles">
              <div className="stat-tile">
                <span className="hint">Tổng chi</span>
                <b className="num">{fmtD(ys.spent)}</b>
              </div>
              <div className="stat-tile">
                <span className="hint">Tổng thu</span>
                <b className="num">{fmtD(ys.income)}</b>
              </div>
              <div className="stat-tile">
                <span className="hint">Tích lũy</span>
                <b className="num">{fmtD(ys.saved)}</b>
              </div>
            </div>
            <p className="hint num">
              Trung bình {fmtD(ys.avgSpent)} mỗi tháng trong {ys.months} tháng
              {ys.biggestMonth && ys.biggestMonth.spent > 0 && `. Chi nhiều nhất: ${ys.biggestMonth.label} (${fmtD(ys.biggestMonth.spent)})`}.
            </p>
            {ys.topJars.length > 0 && (
              <ol className="rank num">
                {ys.topJars.map((j) => (
                  <li key={j.name}>
                    <span>{j.name}</span>
                    <span>{fmtD(j.amount)}</span>
                  </li>
                ))}
              </ol>
            )}
            {ys.topTags.length > 0 && (
              <>
                <h4 className="label">Thẻ chi nhiều nhất</h4>
                <ol className="rank num">
                  {ys.topTags.map((t) => (
                    <li key={t.tag}>
                      <span>#{t.tag}</span>
                      <span>{fmtD(t.amount)}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        ) : (
          <p className="empty">Năm {year} chưa có giao dịch nào.</p>
        )}
      </section>
    </Sheet>
  );
}
