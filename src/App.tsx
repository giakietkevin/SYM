import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JarCard, type Fx } from './components/JarCard';
import { JarDetail } from './components/JarDetail';
import { JarEditor } from './components/JarEditor';
import { IconGear, IconHome, IconList, IconMoon, IconPlus, IconSun, IconUser, Logo } from './components/icons';
import { Mascot } from './components/Mascot';
import { QuickAdd, type NewTx } from './components/QuickAdd';
import { SettingsSheet } from './components/SettingsSheet';
import { TransferSheet } from './components/TransferSheet';
import { MonthSheet } from './components/MonthSheet';
import { SplitSheet } from './components/SplitSheet';
import { PulseCard, PulseSheet } from './components/Pulse';
import { computePulse } from './lib/pulse';
import { TxSheet } from './components/TxSheet';
import { TxRow, dayLabel, locName } from './components/TxRow';
import { Money } from './components/ui';
import { chime, haptic, pop, setFeedbackFlags, soft } from './lib/feedback';
import { useDrag } from './lib/drag';
import { fmtD } from './lib/money';
import { jarStatus } from './lib/jar';
import { api, ApiError } from './lib/api';
import { parseState, uid, useStore } from './lib/store';
import { seed } from './lib/seed';
import { monthKey, type RefillStep } from './lib/rollover';
import { planSplit, ruleTotal } from './lib/split';
import { clearCache, readCache, readProfileCache, useSync, writeProfileCache } from './lib/sync';
import type { Profile } from './lib/api';
import { Avatar, CompleteProfile, ProfileScreen } from './components/Profile';
import { AuthScreen } from './components/AuthScreen';
import { RecoveryScreen } from './components/Recovery';
import { useTheme, type Theme, type ThemePref } from './lib/theme';
import type { Loc, Rule, State, Tx } from './lib/types';

type Sheet =
  | { k: 'quick'; jar?: string }
  | { k: 'jar'; id: string }
  | { k: 'edit'; id?: string }
  | { k: 'transfer'; from?: Loc; to?: Loc }
  | { k: 'settings' }
  | { k: 'split' }
  | { k: 'month' }
  | { k: 'tx'; id: string }
  | { k: 'pulse' }
  | null;

type Screen = 'home' | 'history' | 'profile';
type Filter = 'all' | 'expense' | 'income' | 'transfer';

function Main({
  user,
  initial,
  initialRev,
  profile,
  onProfile,
  onLogout,
  onUnauthorized,
  themePref,
  theme,
  onTheme,
  onToggleTheme,
}: {
  profile: Profile;
  onProfile: (p: Profile) => void;
  themePref: ThemePref;
  theme: Theme;
  onTheme: (p: ThemePref) => void;
  onToggleTheme: () => void;
  user: string;
  initial: State;
  initialRev: number;
  onLogout: () => void;
  onUnauthorized: () => void;
}) {
  const store = useStore(initial);
  const { state, dispatch, jars, bal, wallet, txs } = store;

  const [screen, setScreen] = useState<Screen>('home');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const toastTimer = useRef(0);
  const fxN = useRef(0);

  useEffect(() => setFeedbackFlags(state.sound, state.haptics), [state.sound, state.haptics]);

  const say = useCallback((text: string, undo?: () => void) => {
    setToast({ text, undo });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => {
    if (state.rolled === undefined) dispatch({ t: 'setRolled', month: monthKey() });
  }, [state.rolled, dispatch]);

  const sync = useSync({
    user,
    state,
    initialRev,
    adopt: (s) => dispatch({ t: 'load', state: s }),
    onUnauthorized,
    onRemoteChange: () => say('Đã cập nhật dữ liệu từ thiết bị khác'),
  });

  const logout = async () => {
    if (sync.dirty() && !(await sync.flush())) {
      if (!window.confirm('Có thay đổi chưa lưu được lên máy chủ. Đăng xuất bây giờ sẽ mất những thay đổi đó. Vẫn đăng xuất?')) return;
    }
    onLogout();
  };

  /** Money landing in jars: coin + float on each card. */
  const showFx = useCallback((list: { id: string; kind: 'in' | 'out'; amount: number }[]) => {
    setFx(list.map((f) => ({ ...f, n: ++fxN.current })));
    window.setTimeout(() => setFx([]), 1600);
  }, []);

  /** Several ledger lines that belong together (undo removes them all). */
  const addBatch = useCallback(
    (lines: Omit<Tx, 'id' | 'ts' | 'batch'>[], batch: string) => {
      const ts = Date.now();
      lines.forEach((l, i) => dispatch({ t: 'addTx', tx: { ...l, id: i === 0 ? batch : uid(), ts: ts + i, batch } }));
    },
    [dispatch],
  );

  const commit = useCallback(
    (t: NewTx, opts?: { split?: boolean }) => {
      const name = (l?: Loc) => locName(l, state.jars);

      // income + automatic split: one batch, one undo
      if (t.type === 'income' && opts?.split && t.to === 'wallet') {
        const lines = planSplit(t.amount, state.rule, jars);
        if (lines.length) {
          const batch = uid();
          addBatch(
            [t, ...lines.map((l) => ({ type: 'transfer' as const, amount: l.amount, from: 'wallet', to: l.jar.id, note: 'Chia theo quy tắc' }))],
            batch,
          );
          chime();
          haptic('drop');
          showFx(lines.map((l) => ({ id: l.jar.id, kind: 'in' as const, amount: l.amount })));
          setSheet(null);
          const sent = lines.reduce((s, l) => s + l.amount, 0);
          say(`Đã thêm ${fmtD(t.amount)} và chia ${fmtD(sent)} vào ${lines.length} hũ`, () => dispatch({ t: 'undoTx', id: batch }));
          return;
        }
      }

      const tx = { ...t, id: uid(), ts: Date.now() };
      dispatch({ t: 'addTx', tx });
      let text: string;

      if (tx.type === 'expense') {
        pop();
        haptic('success');
        const left = (bal[tx.from!] ?? 0) - tx.amount;
        const jar = jars.find((j) => j.id === tx.from);
        const low = jar ? jarStatus(jar, left, true).low : false;
        if (low) window.setTimeout(() => haptic('warn'), 220);
        text = `Đã trừ ${fmtD(tx.amount)} khỏi hũ ${name(tx.from)}${low ? '. Hũ sắp cạn, đi chậm lại nhé' : ''}`;
        showFx([{ id: tx.from!, kind: 'out', amount: tx.amount }]);
      } else {
        chime();
        haptic('drop');
        text =
          tx.type === 'income'
            ? `Đã thêm ${fmtD(tx.amount)} vào ${name(tx.to)}`
            : `Đã chuyển ${fmtD(tx.amount)} từ ${name(tx.from)} sang ${name(tx.to)}`;
        if (tx.to && tx.to !== 'wallet') showFx([{ id: tx.to, kind: 'in', amount: tx.amount }]);
      }
      setSheet(null);
      say(text, () => dispatch({ t: 'undoTx', id: tx.id }));
    },
    [addBatch, bal, dispatch, jars, say, showFx, state.jars, state.rule],
  );

  /** Split money already in the wallet by the rule, and keep the rule. */
  const applySplit = (rule: Rule, amount: number) => {
    dispatch({ t: 'setRule', rule });
    const lines = planSplit(amount, rule, jars);
    if (!lines.length) return;
    const batch = uid();
    addBatch(lines.map((l) => ({ type: 'transfer' as const, amount: l.amount, from: 'wallet', to: l.jar.id, note: 'Chia theo quy tắc' })), batch);
    chime();
    haptic('drop');
    showFx(lines.map((l) => ({ id: l.jar.id, kind: 'in' as const, amount: l.amount })));
    setSheet(null);
    say(`Đã chia ${fmtD(lines.reduce((s, l) => s + l.amount, 0))} vào ${lines.length} hũ`, () => dispatch({ t: 'undoTx', id: batch }));
  };

  /** New month: move money between the wallet and each spending jar, then remember the month. */
  const applyRefill = (steps: RefillStep[]) => {
    const prev = state.rolled;
    const lines = steps
      .filter((s) => s.move !== 0)
      .map((s) =>
        s.move > 0
          ? { type: 'transfer' as const, amount: s.move, from: 'wallet', to: s.jar.id, note: `Tháng ${new Date().getMonth() + 1}: nạp lại hạn mức` }
          : { type: 'transfer' as const, amount: -s.move, from: s.jar.id, to: 'wallet', note: `Tháng ${new Date().getMonth() + 1}: tiền thừa về ví` },
      );
    dispatch({ t: 'setRolled', month: monthKey() });
    setSheet(null);
    if (!lines.length) return say('Đã giữ nguyên các hũ cho tháng mới');
    const batch = uid();
    addBatch(lines, batch);
    chime();
    haptic('success');
    showFx(steps.filter((s) => s.move > 0).map((s) => ({ id: s.jar.id, kind: 'in' as const, amount: s.move })));
    say(`Đã nạp lại ${steps.filter((s) => s.move > 0).length} hũ cho tháng mới`, () => {
      dispatch({ t: 'undoTx', id: batch });
      dispatch({ t: 'setRolled', month: prev });
    });
  };

  const { drag, press, guard } = useDrag(
    useCallback((from: Loc, to: Loc) => setSheet({ k: 'transfer', from, to }), []),
  );

  const spendJars = jars.filter((j) => j.kind === 'spend');
  const saveJars = jars.filter((j) => j.kind === 'save');

  // The one finding the home screen leads with
  const worst = useMemo(() => {
    let w: { name: string; pct: number; over: boolean } | null = null;
    for (const j of spendJars) {
      const st = jarStatus(j, bal[j.id] ?? 0, store.funded[j.id]);
      if (st.low && (!w || st.pct > w.pct)) w = { name: j.name, pct: st.pct, over: st.over };
    }
    return w;
  }, [spendJars, bal, store.funded]);

  const pulse = useMemo(() => computePulse(txs, jars), [txs, jars]);
  const mood = worst ? 'nervous' : 'happy';
  const needsRefill = !!state.rolled && state.rolled < monthKey() && spendJars.length > 0;
  const ruleSum = ruleTotal(state.rule, jars);
  const total = wallet + jars.reduce((s, j) => s + (bal[j.id] ?? 0), 0);

  const now = new Date();
  const monthTx = txs.filter((t) => new Date(t.ts).getMonth() === now.getMonth() && new Date(t.ts).getFullYear() === now.getFullYear());
  const spentMonth = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const incomeMonth = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  const dateLine = now.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });

  const openTx = (t: Tx) => setSheet({ k: 'tx', id: t.id });

  /** Edit a past line. The previous version is kept for one-tap undo. */
  const saveTx = (next: Tx) => {
    const prev = state.txs.find((x) => x.id === next.id);
    if (!prev) return;
    dispatch({ t: 'updateTx', tx: next });
    soft();
    haptic('success');
    setSheet(null);
    say('Đã cập nhật giao dịch', () => dispatch({ t: 'updateTx', tx: prev }));
  };

  const removeTxs = (ids: string[]) => {
    dispatch({ t: 'setDeleted', ids, deleted: true });
    pop();
    haptic('warn');
    setSheet(null);
    say(ids.length > 1 ? `Đã xóa ${ids.length} dòng giao dịch` : 'Đã xóa giao dịch', () => dispatch({ t: 'setDeleted', ids, deleted: false }));
  };

  const openJar = (id: string) => guard(() => setSheet({ k: 'jar', id }));

  const jarCard = (id: string) => {
    const j = jars.find((x) => x.id === id)!;
    return (
      <JarCard
        key={j.id}
        jar={j}
        balance={bal[j.id] ?? 0}
        funded={store.funded[j.id]}
        over={drag?.over === j.id}
        fx={fx.find((f) => f.id === j.id) ?? null}
        onOpen={openJar(j.id)}
        onPress={(e) => press(e, j.id, j.name)}
      />
    );
  };

  const newJarTile = (
    <button className="jar jar-new" onClick={() => setSheet({ k: 'edit' })}>
      <IconPlus />
      <span>Tạo hũ mới</span>
    </button>
  );

  const editTx = sheet?.k === 'tx' ? txs.find((t) => t.id === sheet.id) : undefined;
  const detailJar = sheet?.k === 'jar' ? jars.find((j) => j.id === sheet.id) : undefined;
  const editJar = sheet?.k === 'edit' && sheet.id ? jars.find((j) => j.id === sheet.id) : undefined;

  const shown = txs.filter((t) => filter === 'all' || t.type === filter);
  const groups: { label: string; items: typeof txs }[] = [];
  for (const t of shown) {
    const label = dayLabel(t.ts, now);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(t);
    else groups.push({ label, items: [t] });
  }

  return (
    <div className="app">
      <nav className="nav" aria-label="Điều hướng chính">
        <div className="brand">
          <Logo size={32} />
          <span>SYM</span>
        </div>
        <button className="nav-item" aria-current={screen === 'home' ? 'page' : undefined} onClick={() => { soft(); setScreen('home'); }}>
          <IconHome />
          <span>Tổng quan</span>
        </button>
        <button className="nav-add" onClick={() => { haptic('tap'); setSheet({ k: 'quick' }); }} aria-label="Ghi nhanh">
          <IconPlus />
          <span>Ghi nhanh</span>
        </button>
        <button className="nav-item" aria-current={screen === 'history' ? 'page' : undefined} onClick={() => { soft(); setScreen('history'); }}>
          <IconList />
          <span>Lịch sử</span>
        </button>
        <button className="nav-item nav-profile" aria-current={screen === 'profile' ? 'page' : undefined} onClick={() => { soft(); setScreen('profile'); }}>
          <IconUser />
          <span>Hồ sơ</span>
        </button>
        <button className="nav-item nav-settings" onClick={() => setSheet({ k: 'settings' })}>
          <IconGear />
          <span>Cài đặt</span>
        </button>
      </nav>

      <main className="main">
        <header className="top">
          <div className="top-brand">
            <Logo size={28} />
            <b>SYM</b>
          </div>
          <div className="top-title">
            <h1>{screen === 'home' ? 'Tổng quan' : screen === 'history' ? 'Lịch sử' : 'Hồ sơ'}</h1>
            <p className="num">
              {screen === 'profile' ? (
                <>Thông tin tài khoản của bạn</>
              ) : screen === 'home' ? (
                <>
                  {dateLine} · tổng cộng {fmtD(total)}
                </>
              ) : (
                <>
                  Tháng {now.getMonth() + 1}: chi {fmtD(spentMonth)} · thu {fmtD(incomeMonth)}
                </>
              )}
            </p>
          </div>
          <button className="icon-btn avatar-btn" onClick={() => setScreen('profile')} aria-label="Hồ sơ của bạn" aria-current={screen === 'profile' ? 'page' : undefined}>
            <Avatar profile={profile} size={36} />
          </button>
          <button className="icon-btn theme-btn" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <button className="icon-btn top-gear" onClick={() => setSheet({ k: 'settings' })} aria-label="Cài đặt">
            <IconGear />
          </button>
        </header>

        {screen === 'profile' ? (
          <ProfileScreen profile={profile} onSaved={onProfile} />
        ) : screen === 'home' ? (
          <div className="home">
            {needsRefill && (
              <section className="month" aria-label="Tháng mới">
                <div>
                  <b>Tháng {now.getMonth() + 1} đã bắt đầu</b>
                  <p>Nạp lại hạn mức cho các hũ chi tiêu để bắt đầu tháng mới.</p>
                </div>
                <button className="btn primary" onClick={() => setSheet({ k: 'month' })}>
                  Nạp lại hũ
                </button>
              </section>
            )}
            <div className="jars">
              <section aria-labelledby="h-spend">
                <h2 id="h-spend" className="sec">Hũ chi tiêu</h2>
                <div className="jar-grid">
                  {spendJars.map((j) => jarCard(j.id))}
                  {spendJars.length === 0 && newJarTile}
                </div>
              </section>
              <section aria-labelledby="h-save">
                <h2 id="h-save" className="sec">Hũ tích lũy</h2>
                <div className="jar-grid">
                  {saveJars.map((j) => jarCard(j.id))}
                  {newJarTile}
                </div>
              </section>
            </div>

            <div className="side">
            <section className={`xu ${mood}`} aria-label="Xu nhắn bạn">
              <Mascot mood={mood} />
              <div className="xu-say">
                <b>Xu</b>
                <p>
                  {worst
                    ? worst.over
                      ? `Hũ ${worst.name} đã lạm quá hạn mức. Kéo tiền từ hũ khác sang để bù nhé.`
                      : `Hũ ${worst.name} đã dùng ${worst.pct}% hạn mức. Đi chậm lại xíu nha.`
                    : jars.length === 0
                      ? 'Chào bạn! Tạo hũ đầu tiên để bắt đầu nhé.'
                      : wallet > 0
                      ? `Ví tổng còn ${fmtD(wallet)} chưa chia. Kéo thẻ ví vào một hũ nhé.`
                      : 'Mọi hũ đều ổn. Cứ thế phát huy nhé!'}
                </p>
              </div>
            </section>

            <section
              className={`wallet ${drag?.over === 'wallet' ? 'is-over' : ''}`}
              data-drop="wallet"
              onPointerDown={(e) => press(e, 'wallet', 'Ví tổng')}
            >
              <div
                className="wallet-main"
                onClick={guard(() => setSheet({ k: 'transfer', from: 'wallet' }))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSheet({ k: 'transfer', from: 'wallet' })}
                aria-label={`Ví tổng, ${fmtD(wallet)} chưa chia vào hũ nào`}
              >
                <h2>Ví tổng</h2>
                <Money value={wallet} className="wallet-fig" />
                <p className="wallet-sub">{wallet > 0
                    ? 'Chưa chia vào hũ nào. Kéo thẻ này thả vào một hũ.'
                    : jars.length
                      ? 'Đã chia hết vào các hũ.'
                      : 'Chưa có tiền. Bấm Ghi nhanh, chọn Thu nhập để thêm.'}</p>
              </div>
              {jars.length > 0 && (
                <button
                  className="btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setSheet({ k: 'split' })}
                >
                  {ruleSum > 0 ? 'Chia tiền' : 'Đặt quy tắc chia'}
                </button>
              )}
            </section>

            {pulse.hasActivity && <PulseCard pulse={pulse} onOpen={() => setSheet({ k: 'pulse' })} />}

            <section className="recent" aria-labelledby="h-recent">
              <div className="sec-row">
                <h2 id="h-recent" className="sec">Gần đây</h2>
                <button className="btn text" onClick={() => setScreen('history')}>
                  Xem tất cả
                </button>
              </div>
              {txs.length ? (
                <ul className="txs">{txs.slice(0, 4).map((t) => <TxRow key={t.id} tx={t} jars={state.jars} onOpen={openTx} />)}</ul>
              ) : (
                <p className="empty">Chưa có giao dịch. Bấm Ghi nhanh để thêm khoản đầu tiên.</p>
              )}
            </section>
            </div>
          </div>
        ) : (
          <div className="history">
            <div className="chips" role="group" aria-label="Lọc giao dịch">
              {(
                [
                  ['all', 'Tất cả'],
                  ['expense', 'Chi tiêu'],
                  ['income', 'Thu nhập'],
                  ['transfer', 'Chuyển'],
                ] as [Filter, string][]
              ).map(([k, label]) => (
                <button key={k} className={`chip ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {label}
                </button>
              ))}
            </div>
            {groups.length ? (
              groups.map((g) => (
                <section key={g.label} className="day">
                  <h2 className="sec">{g.label}</h2>
                  <ul className="txs">{g.items.map((t) => <TxRow key={t.id} tx={t} jars={state.jars} onOpen={openTx} />)}</ul>
                </section>
              ))
            ) : (
              <p className="empty">Không có giao dịch nào trong mục này.</p>
            )}
          </div>
        )}
      </main>

      {drag && (
        <div className="ghost" style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }} aria-hidden="true">
          <span className="ghost-coin" />
          {drag.label}
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                haptic('tap');
                setToast(null);
              }}
            >
              Hoàn tác
            </button>
          )}
        </div>
      )}

      {sheet?.k === 'quick' && <QuickAdd store={store} preJar={sheet.jar} onSubmit={commit} onClose={() => setSheet(null)} />}
      {sheet?.k === 'transfer' && <TransferSheet store={store} from={sheet.from} to={sheet.to} onSubmit={commit} onClose={() => setSheet(null)} />}
      {detailJar && (
        <JarDetail
          jar={detailJar}
          store={store}
          onClose={() => setSheet(null)}
          onAddMoney={() => setSheet({ k: 'transfer', from: 'wallet', to: detailJar.id })}
          onTransfer={() => setSheet({ k: 'transfer', from: detailJar.id })}
          onSpend={() => setSheet({ k: 'quick', jar: detailJar.id })}
          onEdit={() => setSheet({ k: 'edit', id: detailJar.id })}
          onOpenTx={openTx}
        />
      )}
      {sheet?.k === 'edit' && (
        <JarEditor
          jar={editJar}
          balance={editJar ? (bal[editJar.id] ?? 0) : 0}
          onClose={() => setSheet(null)}
          onSave={(j) => {
            dispatch({ t: 'saveJar', jar: j });
            chime();
            haptic('success');
            setSheet(null);
            say(editJar ? `Đã lưu hũ ${j.name}` : `Đã tạo hũ ${j.name}. Kéo tiền từ ví vào để bắt đầu`);
          }}
          onDelete={(id) => {
            dispatch({ t: 'deleteJar', id });
            haptic('warn');
            setSheet(null);
            say('Đã xóa hũ. Tiền còn lại đã về Ví tổng');
          }}
        />
      )}
      {sheet?.k === 'tx' && editTx && <TxSheet key={editTx.id} store={store} tx={editTx} onSave={saveTx} onDelete={removeTxs} onClose={() => setSheet(null)} />}
      {sheet?.k === 'pulse' && <PulseSheet pulse={pulse} onClose={() => setSheet(null)} />}
      {sheet?.k === 'split' && (
        <SplitSheet
          store={store}
          onApply={applySplit}
          onSaveRule={(rule) => {
            dispatch({ t: 'setRule', rule });
            setSheet(null);
            say('Đã lưu quy tắc chia tiền');
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.k === 'month' && (
        <MonthSheet
          store={store}
          month={now.getMonth() + 1}
          onApply={applyRefill}
          onSkip={() => {
            dispatch({ t: 'setRolled', month: monthKey() });
            setSheet(null);
            say('Đã bỏ qua tháng này');
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.k === 'settings' && (
        <SettingsSheet
          ruleSummary={
            ruleSum > 0
              ? jars
                  .filter((j) => (state.rule?.[j.id] ?? 0) > 0)
                  .map((j) => `${j.name} ${state.rule![j.id]}%`)
                  .join(', ')
              : 'Chưa đặt. Đặt tỷ lệ để lương tự chia vào các hũ.'
          }
          onSplit={() => setSheet({ k: 'split' })}
          themePref={themePref}
          onTheme={onTheme}
          username={user}
          status={sync.status}
          onLogout={logout}
          sound={state.sound}
          haptics={state.haptics}
          onSound={(v) => dispatch({ t: 'flags', sound: v })}
          onHaptics={(v) => dispatch({ t: 'flags', haptics: v })}
          onReset={() => {
            dispatch({ t: 'reset' });
            setSheet(null);
            say('Đã xóa toàn bộ dữ liệu');
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

type Auth =
  | { s: 'loading' }
  | { s: 'out'; notice?: string }
  | { s: 'code'; profile: Profile; code: string; reason: 'new' | 'reset' }
  | { s: 'in'; profile: Profile; state: State; rev: number };

const LAST_USER = 'sym.lastUser';

/** Gate: sign in or register, load that user's data, then show the app. */
export function App() {
  const [auth, setAuth] = useState<Auth>({ s: 'loading' });
  const themeCtl = useTheme();

  const enter = useCallback(async (profile: Profile) => {
    const remote = await api.getData();
    try {
      localStorage.setItem(LAST_USER, profile.username);
    } catch {
      /* blocked */
    }
    writeProfileCache(profile);
    setAuth({ s: 'in', profile, state: parseState(remote.state) ?? seed(), rev: remote.rev });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await enter(await api.me());
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) {
          // no connection: open the copy cached on this device, if there is one
          const last = localStorage.getItem(LAST_USER);
          const cached = last ? readCache(last) : null;
          const profile = last ? readProfileCache(last) : null;
          if (last && cached && profile) return setAuth({ s: 'in', profile, state: cached.state, rev: cached.rev });
          return setAuth({ s: 'out', notice: 'Không kết nối được máy chủ.' });
        }
        setAuth({ s: 'out' });
      }
    })();
  }, [enter]);

  const leave = (user: string) => {
    api.logout().catch(() => {});
    clearCache(user); // the data lives on the server; do not leave it on a shared device
    try {
      localStorage.removeItem(LAST_USER);
    } catch {
      /* blocked */
    }
    setAuth({ s: 'out' });
  };

  if (auth.s === 'loading') return <div className="boot" aria-busy="true" aria-label="Đang tải" />;

  if (auth.s === 'out') {
    return (
      <AuthScreen
        notice={auth.notice}
        onSubmit={async (mode, form) => {
          if (mode === 'login') return enter(await api.login(form.username, form.password));
          const { recoveryCode, ...profile } = await api.register(form);
          // the recovery code is shown once, before the app opens
          if (recoveryCode) setAuth({ s: 'code', profile: { ...profile, hasRecovery: true }, code: recoveryCode, reason: 'new' });
          else await enter(profile);
        }}
        onReset={async (identifier, code, password) => {
          const { recoveryCode, ...profile } = await api.reset(identifier, code, password);
          if (recoveryCode) setAuth({ s: 'code', profile: { ...profile, hasRecovery: true }, code: recoveryCode, reason: 'reset' });
          else await enter(profile);
        }}
      />
    );
  }

  if (auth.s === 'code') {
    return (
      <RecoveryScreen
        code={auth.code}
        username={auth.profile.username}
        reason={auth.reason}
        onDone={() => {
          enter(auth.profile).catch(() => setAuth({ s: 'out', notice: 'Không kết nối được máy chủ.' }));
        }}
      />
    );
  }

  const { profile } = auth;
  const user = profile.username;

  // an account made before profiles existed fills in email and phone once, then they are locked
  if (!profile.email || !profile.phone) {
    return (
      <CompleteProfile
        profile={profile}
        onDone={(p) => {
          writeProfileCache(p);
          setAuth({ ...auth, profile: p });
        }}
        onLogout={() => leave(user)}
      />
    );
  }

  return (
    <Main
      key={user}
      user={user}
      profile={profile}
      onProfile={(p) => {
        writeProfileCache(p);
        setAuth({ ...auth, profile: p });
      }}
      initial={auth.state}
      initialRev={auth.rev}
      themePref={themeCtl.pref}
      theme={themeCtl.theme}
      onTheme={themeCtl.setPref}
      onToggleTheme={themeCtl.toggle}
      onLogout={() => leave(user)}
      onUnauthorized={() => setAuth({ s: 'out', notice: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' })}
    />
  );
}
