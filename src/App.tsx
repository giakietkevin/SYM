import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JarCard, type Fx } from './components/JarCard';
import { JarDetail } from './components/JarDetail';
import { JarEditor } from './components/JarEditor';
import { IconGear, IconHome, IconList, IconPlus, Logo } from './components/icons';
import { Mascot } from './components/Mascot';
import { QuickAdd, type NewTx } from './components/QuickAdd';
import { SettingsSheet } from './components/SettingsSheet';
import { TransferSheet } from './components/TransferSheet';
import { MonthSheet } from './components/MonthSheet';
import { SplitSheet } from './components/SplitSheet';
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
import { clearCache, readCache, useSync } from './lib/sync';
import { AuthScreen } from './components/AuthScreen';
import type { Loc, Rule, State, Tx } from './lib/types';

type Sheet =
  | { k: 'quick'; jar?: string }
  | { k: 'jar'; id: string }
  | { k: 'edit'; id?: string }
  | { k: 'transfer'; from?: Loc; to?: Loc }
  | { k: 'settings' }
  | { k: 'split' }
  | { k: 'month' }
  | null;

type Screen = 'home' | 'history';
type Filter = 'all' | 'expense' | 'income' | 'transfer';

function Main({
  user,
  initial,
  initialRev,
  onLogout,
  onUnauthorized,
}: {
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

  const mood = worst ? 'nervous' : 'happy';
  const needsRefill = !!state.rolled && state.rolled < monthKey() && spendJars.length > 0;
  const ruleSum = ruleTotal(state.rule, jars);
  const total = wallet + jars.reduce((s, j) => s + (bal[j.id] ?? 0), 0);

  const now = new Date();
  const monthTx = txs.filter((t) => new Date(t.ts).getMonth() === now.getMonth() && new Date(t.ts).getFullYear() === now.getFullYear());
  const spentMonth = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const incomeMonth = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  const dateLine = now.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });

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
            <h1>{screen === 'home' ? 'Tổng quan' : 'Lịch sử'}</h1>
            <p className="num">
              {screen === 'home' ? (
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
          <button className="icon-btn top-gear" onClick={() => setSheet({ k: 'settings' })} aria-label="Cài đặt">
            <IconGear />
          </button>
        </header>

        {screen === 'home' ? (
          <div className={`home ${needsRefill ? 'has-banner' : ''}`}>
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

            <section className="recent" aria-labelledby="h-recent">
              <div className="sec-row">
                <h2 id="h-recent" className="sec">Gần đây</h2>
                <button className="btn text" onClick={() => setScreen('history')}>
                  Xem tất cả
                </button>
              </div>
              {txs.length ? (
                <ul className="txs">{txs.slice(0, 4).map((t) => <TxRow key={t.id} tx={t} jars={state.jars} />)}</ul>
              ) : (
                <p className="empty">Chưa có giao dịch. Bấm Ghi nhanh để thêm khoản đầu tiên.</p>
              )}
            </section>
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
                  <ul className="txs">{g.items.map((t) => <TxRow key={t.id} tx={t} jars={state.jars} />)}</ul>
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
  | { s: 'in'; user: string; state: State; rev: number };

const LAST_USER = 'sym.lastUser';

/** Gate: sign in or register, load that user's data, then show the app. */
export function App() {
  const [auth, setAuth] = useState<Auth>({ s: 'loading' });

  const enter = useCallback(async (user: string) => {
    const remote = await api.getData();
    try {
      localStorage.setItem(LAST_USER, user);
    } catch {
      /* blocked */
    }
    setAuth({ s: 'in', user, state: parseState(remote.state) ?? seed(), rev: remote.rev });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await enter((await api.me()).username);
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) {
          // no connection: open the copy cached on this device, if there is one
          const last = localStorage.getItem(LAST_USER);
          const cached = last ? readCache(last) : null;
          if (last && cached) return setAuth({ s: 'in', user: last, state: cached.state, rev: cached.rev });
          return setAuth({ s: 'out', notice: 'Không kết nối được máy chủ.' });
        }
        setAuth({ s: 'out' });
      }
    })();
  }, [enter]);

  if (auth.s === 'loading') return <div className="boot" aria-busy="true" aria-label="Đang tải" />;

  if (auth.s === 'out') {
    return (
      <AuthScreen
        notice={auth.notice}
        onSubmit={async (mode, username, password) => {
          const r = mode === 'login' ? await api.login(username, password) : await api.register(username, password);
          await enter(r.username);
        }}
      />
    );
  }

  const user = auth.user;
  return (
    <Main
      key={user}
      user={user}
      initial={auth.state}
      initialRev={auth.rev}
      onLogout={() => {
        api.logout().catch(() => {});
        clearCache(user); // the data lives on the server; do not leave it on a shared device
        try {
          localStorage.removeItem(LAST_USER);
        } catch {
          /* blocked */
        }
        setAuth({ s: 'out' });
      }}
      onUnauthorized={() => setAuth({ s: 'out', notice: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' })}
    />
  );
}
