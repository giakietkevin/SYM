import { fmtD } from './money';
import type { MonthReport } from './report';

const W = 1080;
const H = 1350;
const GREEN = '#2d6a4a';
const INK = '#1b1d1f';
const MUTED = '#565b5f';
const SOFT = '#dcefe3';
const SOFT_INK = '#1d5a3a';
const BARS = ['#6db08a', '#6bb4e8', '#e9c34f'];

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrinks a text until it fits the width, so a long jar name never runs off the card. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Xu, drawn small: the same coin as in the app. */
function xu(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.fillStyle = '#f3d36a';
  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  for (const dx of [-0.32, 0.32]) {
    ctx.beginPath();
    ctx.ellipse(cx + r * dx, cy - r * 0.12, r * 0.1, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f9c3b6';
  for (const dx of [-0.58, 0.58]) {
    ctx.beginPath();
    ctx.arc(cx + r * dx, cy + r * 0.2, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.35, cy + r * 0.22);
  ctx.quadraticCurveTo(cx, cy + r * 0.62, cx + r * 0.35, cy + r * 0.22);
  ctx.stroke();
}

export interface ReportImageOpts {
  report: MonthReport;
  name: string;
  /** show percentages only, no money amounts: for sharing without giving away how much */
  hideAmounts: boolean;
}

/** The monthly report as a 1080x1350 picture, ready to post. */
export async function renderReportPng({ report: r, name, hideAmounts }: ReportImageOpts): Promise<Blob> {
  try {
    await Promise.all([document.fonts.load('700 40px Manrope'), document.fonts.load('500 30px Manrope')]);
  } catch {
    /* system font is fine */
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không vẽ được ảnh');
  const font = (w: number, px: number) => `${w} ${px}px Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif`;
  const amount = (n: number) => (hideAmounts ? '•••' : fmtD(n));

  ctx.fillStyle = '#f2f4f1';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  round(ctx, 60, 60, W - 120, H - 120, 48);
  ctx.fill();

  ctx.fillStyle = GREEN;
  round(ctx, 120, 120, 64, 64, 16);
  ctx.fill();
  ctx.fillStyle = '#dcefe3'; // the jar
  round(ctx, 142, 138, 20, 8, 3);
  ctx.fill();
  round(ctx, 136, 146, 32, 28, 8);
  ctx.fill();
  ctx.fillStyle = '#f3d36a';
  ctx.beginPath();
  ctx.arc(152, 163, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = font(700, 40);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('SYM', 204, 154);
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.font = font(600, 34);
  ctx.fillText(`Báo cáo tháng ${r.month}/${r.year}`, W - 120, 154);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 34);
  if (name) ctx.fillText(fit(ctx, name, W - 240), 120, 270);

  ctx.fillStyle = MUTED;
  ctx.font = font(600, 36);
  ctx.fillText(hideAmounts ? 'Chi tiêu tháng này' : 'Đã chi tiêu', 120, 360);
  ctx.fillStyle = INK;
  ctx.font = font(700, 128);
  const delta = r.deltaPct === null ? '' : `${r.deltaPct > 0 ? '+' : r.deltaPct < 0 ? '−' : ''}${Math.abs(r.deltaPct)}%`;
  // hiding amounts leaves only the change against last month (or the month's name when there is nothing to compare)
  ctx.fillText(hideAmounts ? (delta || `Tháng ${r.month}`) : fit(ctx, amount(r.spent), W - 240), 120, 490);
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 32);
  if (hideAmounts) ctx.fillText(delta ? 'so với tháng trước' : 'tháng đầu có số liệu', 120, 570);
  else if (r.deltaPct !== null) ctx.fillText(`${r.deltaPct > 0 ? '+' : r.deltaPct < 0 ? '−' : ''}${Math.abs(r.deltaPct)}% so với tháng trước`, 120, 545);

  // headline pill
  ctx.fillStyle = SOFT;
  round(ctx, 120, 590, W - 240, 110, 28);
  ctx.fill();
  ctx.fillStyle = SOFT_INK;
  ctx.font = font(600, 34);
  ctx.textBaseline = 'middle';
  ctx.fillText(fit(ctx, r.headline, W - 300), 150, 646);

  // three figures
  ctx.textBaseline = 'alphabetic';
  const cells: [string, string][] = [
    ['Thu nhập', amount(r.income)],
    ['Đã tiết kiệm', amount(Math.max(0, r.saved))],
    ['Ngày ghi chép', `${r.daysLogged}/${r.daysPassed || r.daysLogged}`],
  ];
  const cw = (W - 240) / 3;
  cells.forEach(([label, value], i) => {
    const x = 120 + i * cw;
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 28);
    ctx.fillText(label, x, 780);
    ctx.fillStyle = INK;
    ctx.font = font(700, 40);
    ctx.fillText(fit(ctx, value, cw - 20), x, 836);
  });

  // top jars
  ctx.fillStyle = INK;
  ctx.font = font(700, 36);
  ctx.fillText('Chi nhiều nhất', 120, 930);
  if (!r.top.length) {
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 30);
    ctx.fillText('Chưa có khoản chi nào', 120, 990);
  }
  r.top.forEach((t, i) => {
    const y = 960 + i * 92;
    ctx.fillStyle = INK;
    ctx.font = font(600, 30);
    ctx.textAlign = 'left';
    ctx.fillText(fit(ctx, t.name, 500), 120, y + 34);
    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 30);
    ctx.fillText(hideAmounts ? `${t.pct}%` : `${fmtD(t.amount)} · ${t.pct}%`, W - 120, y + 34);
    ctx.fillStyle = '#eef1ee';
    round(ctx, 120, y + 50, W - 240, 16, 8);
    ctx.fill();
    ctx.fillStyle = BARS[i % BARS.length];
    round(ctx, 120, y + 50, Math.max(16, ((W - 240) * t.pct) / 100), 16, 8);
    ctx.fill();
  });
  ctx.textAlign = 'left';

  xu(ctx, 190, H - 170, 58);
  ctx.fillStyle = INK;
  ctx.font = font(600, 30);
  const line = r.noSpendDays > 0 ? `${r.noSpendDays} ngày không tiêu đồng nào.` : 'Cứ ghi đều là thắng.';
  ctx.fillText(line, 280, H - 176);
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 26);
  ctx.fillText('Xu nhắn bạn · Save your money', 280, H - 134);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh'))), 'image/png'));
}
