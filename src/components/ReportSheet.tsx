import { useMemo, useState } from 'react';
import { downloadBlob } from '../lib/backup';
import { fmtD } from '../lib/money';
import { monthReport, monthsWithData } from '../lib/report';
import { renderReportPng } from '../lib/reportImage';
import type { Store } from '../lib/store';
import { dateKey } from '../lib/recurring';
import { Sheet } from './ui';

/** The month in one card: look at it here, or turn it into a picture to share. */
export function ReportSheet({ store, name, onClose, onSay }: { store: Store; name: string; onClose: () => void; onSay: (text: string) => void }) {
  const now = new Date();
  const months = useMemo(() => monthsWithData(store.state.txs, now), [store.state.txs]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ym, setYm] = useState(months[months.length - 1]);
  const [hide, setHide] = useState(false);
  const [busy, setBusy] = useState(false);
  const r = useMemo(() => monthReport(store.state.txs, store.jars, ym, now), [store.state.txs, store.jars, ym]); // eslint-disable-line react-hooks/exhaustive-deps
  const idx = months.indexOf(ym);
  const hasPrev = idx > 0;
  const hasNext = idx < months.length - 1;

  const build = () => renderReportPng({ report: r, name, hideAmounts: hide });
  const fileName = `sym-bao-cao-${r.ym}-${dateKey(now)}.png`;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      downloadBlob(fileName, await build());
      onSay('Đã tải ảnh báo cáo');
    } catch {
      onSay('Không tạo được ảnh, thử lại nhé');
    }
    setBusy(false);
  };

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = new File([await build()], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Báo cáo tháng ${r.month}/${r.year}` });
      } else {
        // no sharing on this device (a desktop, usually): hand over the picture instead
        downloadBlob(fileName, file);
        onSay('Máy này không chia sẻ trực tiếp được, đã tải ảnh về');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') onSay('Không chia sẻ được, thử tải ảnh về nhé');
    }
    setBusy(false);
  };

  return (
    <Sheet title="Báo cáo tháng" onClose={onClose}>
      <div className="month-nav">
        <button className="icon-btn" onClick={() => setYm(months[idx - 1])} disabled={!hasPrev} aria-label="Tháng trước">
          ‹
        </button>
        <b>
          Tháng {r.month}/{r.year}
        </b>
        <button className="icon-btn" onClick={() => setYm(months[idx + 1])} disabled={!hasNext} aria-label="Tháng sau">
          ›
        </button>
      </div>

      <article className="report-card" aria-label={`Báo cáo tháng ${r.month}`}>
        <p className="hint">Đã chi tiêu</p>
        <p className="report-fig num">{fmtD(r.spent)}</p>
        {r.deltaPct !== null && (
          <p className="hint num">
            {r.deltaPct > 0 ? '+' : r.deltaPct < 0 ? '−' : ''}
            {Math.abs(r.deltaPct)}% so với tháng trước
          </p>
        )}
        <p className="report-head">{r.headline}</p>
        <dl className="report-grid">
          <div>
            <dt>Thu nhập</dt>
            <dd className="num">{fmtD(r.income)}</dd>
          </div>
          <div>
            <dt>Đã tiết kiệm</dt>
            <dd className="num">{fmtD(Math.max(0, r.saved))}</dd>
          </div>
          <div>
            <dt>Ngày ghi chép</dt>
            <dd className="num">
              {r.daysLogged}/{r.daysPassed || r.daysLogged}
            </dd>
          </div>
        </dl>
        {r.top.length > 0 && (
          <>
            <h3 className="label">Chi nhiều nhất</h3>
            <ul className="report-top">
              {r.top.map((t, i) => (
                <li key={t.name}>
                  <span>{t.name}</span>
                  <span className="num">
                    {fmtD(t.amount)} · {t.pct}%
                  </span>
                  <i className={`bar b${i}`} style={{ width: `${Math.max(3, t.pct)}%` }} />
                </li>
              ))}
            </ul>
          </>
        )}
        {r.biggest && (
          <p className="hint num">
            Khoản lớn nhất: {r.biggest.note} ({fmtD(r.biggest.amount)})
          </p>
        )}
        {r.noSpendDays > 0 && <p className="hint">{r.noSpendDays} ngày không tiêu đồng nào.</p>}
      </article>

      <label className="check">
        <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
        <span>
          Ẩn số tiền trong ảnh
          <small>Ảnh chỉ hiện phần trăm, không hiện bạn tiêu bao nhiêu.</small>
        </span>
      </label>

      <div className="actions">
        <button className="btn primary" onClick={share} disabled={busy || !r.hasData}>
          {busy ? 'Đang tạo ảnh…' : 'Chia sẻ'}
        </button>
        <button className="btn" onClick={save} disabled={busy || !r.hasData}>
          Tải ảnh
        </button>
      </div>
      {!r.hasData && <p className="hint">Tháng này chưa có giao dịch để làm báo cáo.</p>}
    </Sheet>
  );
}
