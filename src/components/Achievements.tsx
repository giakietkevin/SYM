import type { Badge, Streak } from '../lib/streak';
import { Sheet } from './ui';

/** The streak and every badge: earned ones in colour, locked ones say what it takes. */
export function AchievementsSheet({ streak, badges, onClose }: { streak: Streak; badges: Badge[]; onClose: () => void }) {
  const got = badges.filter((b) => b.earned).length;
  return (
    <Sheet title="Thành tích của bạn" onClose={onClose}>
      <div className="streak-box">
        <div>
          <p className="streak-num num">{streak.current}</p>
          <p className="hint">ngày liên tiếp</p>
        </div>
        <div>
          <p className="streak-num num">{streak.best}</p>
          <p className="hint">dài nhất</p>
        </div>
        <div>
          <p className="streak-num num">{streak.days}</p>
          <p className="hint">ngày đã ghi</p>
        </div>
      </div>
      <p className="hint">
        {streak.current === 0
          ? 'Ghi một giao dịch hôm nay để bắt đầu chuỗi mới.'
          : streak.loggedToday
            ? 'Hôm nay bạn đã ghi chép rồi. Mai nhớ ghi tiếp để giữ chuỗi nhé.'
            : 'Hôm nay chưa ghi gì. Ghi một giao dịch trước khi hết ngày để giữ chuỗi.'}{' '}
        Các khoản SYM tự ghi (định kỳ, thanh toán nợ) không được tính.
      </p>

      <h3 className="label">
        Huy hiệu {got}/{badges.length}
      </h3>
      <ul className="badges">
        {badges.map((b) => (
          <li key={b.id} className={`badge ${b.earned ? 'on' : ''}`}>
            <span className="badge-mark" aria-hidden="true">
              {b.earned ? '★' : '·'}
            </span>
            <span>
              <b>{b.name}</b>
              <span className="hint">{b.earned ? 'Đã đạt' : b.how}</span>
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
