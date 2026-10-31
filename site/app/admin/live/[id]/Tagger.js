'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveLiveGame } from '../actions';
import { toRow, fromRow, quarterFor, parseSheet, outsideArc, liveScore } from '../../../../lib/live';
import { GRID } from '../../../report/sections';
import { PitchLines, VIEW } from '../../../report/ShotMap';
import LiveReport from './LiveReport';

const COLORS = ['#3b4f9e', '#c4572a'];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};

const SHOT_OUT = [['Point', 'Point'], ['2 Point', '2-Pointer'], ['Goal', 'Goal'], ['Wide', 'Wide'], ['Short', 'Short'], ['Saved', 'Saved'], ['Blocked', 'Blocked'], ['Off post', 'Post']];
const KO_OUT = [[true, 'Clean', 'Won clean'], [true, 'Break', 'Won break'], [false, 'Break', 'Lost break'], [false, 'Clean', 'Lost clean']];
const THIRDS = [['Def', 'Defence'], ['Mid', 'Middle'], ['Att', 'Attack']];
const NEEDS = { shot: 'outcome', ko: 'how', card: 'outcome' }; // saved once this is chosen

function describe(e, teams) {
  const t = teams.find((x) => x.id === e.team)?.name || '';
  const who = e.player ? ` · ${e.player.name || `#${e.player.no}`}` : '';
  switch (e.kind) {
    case 'poss': return `${t} possession`;
    case 'shot': return `${t} ${e.type && e.type !== 'Play' ? `${e.type.toLowerCase()} ` : ''}shot: ${e.outcome === '2 Point' ? '2-pointer' : e.outcome}${who}`;
    case 'ko': return `${t} kick-out ${e.won ? 'won' : 'lost'} ${e.how === 'Break' ? 'on break' : 'clean'}${e.box != null ? ` · box ${e.box}` : ''}${who}`;
    case 'to': return `${t} turnover won${e.third ? ` · ${e.third.toLowerCase()}` : ''}${who}`;
    case 'foul': return `${t} free conceded${e.third ? ` · ${e.third.toLowerCase()}` : ''}`;
    case 'card': return `${t} ${String(e.outcome).toLowerCase()} card${who}`;
    default: return e.kind;
  }
}

function Players({ sheet, value, onPick, color }) {
  const [subs, setSubs] = useState(false);
  const nums = subs ? Array.from({ length: 15 }, (_, i) => i + 16) : Array.from({ length: 15 }, (_, i) => i + 1);
  return (
    <div className="lt-players">
      {nums.map((n) => {
        const name = sheet[n] || '';
        const on = value?.no === n;
        return (
          <button key={n} type="button" className={on ? 'on' : ''} style={on ? { background: color, borderColor: color } : undefined}
            onClick={() => onPick(on ? null : { no: n, name })}>
            <b>{n}</b>{name && <small>{name.split(/\s+/).slice(-1)[0]}</small>}
          </button>
        );
      })}
      <button type="button" className="lt-subs" onClick={() => setSubs(!subs)}>{subs ? '1–15' : 'Subs'}</button>
    </div>
  );
}

function Pitch({ x, y, onTap, color }) {
  const ref = useRef(null);
  const tap = (ev) => {
    const svg = ref.current;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    onTap(Math.max(0, Math.min(90, p.x)), Math.max(0, Math.min(52, p.y)));
  };
  return (
    <svg ref={ref} viewBox={VIEW} className="lt-pitch" onClick={tap} role="img" aria-label="Tap where the shot was taken">
      <PitchLines />
      {x != null && <circle cx={x} cy={y} r="2" fill={color} stroke="#fff" strokeWidth="0.5" />}
    </svg>
  );
}

function Boxes({ value, onPick, color }) {
  return (
    <div className="lt-boxes">
      <div className="lt-goal">Kicking team’s goal</div>
      <div className="zone-grid">
        {GRID.flat().map((b) => {
          const on = String(value) === b;
          return (
            <button key={b} type="button" className={`zone ${on ? 'on' : ''}`} style={on ? { background: color, color: '#fff' } : undefined}
              onClick={() => onPick(on ? null : Number(b))}>
              <span className="zone-no">{b}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Tagger({ match, teams, saved }) {
  const key = `ros-live-${match.id}`;
  const [ready, setReady] = useState(false);
  const [events, setEvents] = useState([]);
  const [clock, setClock] = useState({ half: 0, running: false, base: 0, since: 0 });
  const [sheets, setSheets] = useState({});
  const [view, setView] = useState('tag');
  const [edit, setEdit] = useState(null); // event being added or changed
  const [toast, setToast] = useState(null);
  const [sync, setSync] = useState({ state: 'saved', dirty: 0, msg: '' });
  const [, tick] = useState(0);
  const savingRef = useRef(false);

  // Load: this device's copy if it has one, otherwise what's on the site.
  useEffect(() => {
    const local = store.get(key);
    if (local && (local.dirty || (local.events?.length || 0) >= saved.length)) {
      setEvents(local.events || []);
      setClock(local.clock || clock);
      setSheets(local.sheets || {});
      if (local.dirty) setSync({ state: 'pending', dirty: 1, msg: '' });
    } else {
      const evs = saved.map((r) => fromRow(r, teams)).filter(Boolean)
        .sort((a, b) => a.half - b.half || a.sec - b.sec);
      setEvents(evs);
      const last = evs[evs.length - 1];
      if (last) setClock({ half: last.half, running: false, base: last.sec, since: 0 });
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) store.set(key, { events, clock, sheets, dirty: sync.dirty > 0 });
  }, [ready, key, events, clock, sheets, sync.dirty]);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const secs = clock.base + (clock.running ? (Date.now() - clock.since) / 1000 : 0);
  const half = clock.half || 1;
  const quarter = quarterFor(half, secs / 60, match.halfLen);

  // ---- Saving to the site --------------------------------------------------
  const push = useCallback(async (list) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSync((s) => ({ ...s, state: 'saving' }));
    const sent = list;
    try {
      const res = await saveLiveGame(match.id, sent);
      if (!res?.ok) throw new Error(res?.error || 'Save failed');
      setSync((s) => ({ state: 'saved', dirty: 0, msg: '', at: res.at, sentFor: sent }));
    } catch (e) {
      setSync((s) => ({ ...s, state: 'offline', msg: navigator.onLine === false ? 'No signal: saved on this device' : String(e.message || e) }));
    } finally {
      savingRef.current = false;
    }
  }, [match.id]);

  // Re-send if anything changed while a save was in flight.
  useEffect(() => {
    if (sync.state === 'saved' && sync.sentFor && sync.sentFor !== events) setSync((s) => ({ ...s, dirty: 1, state: 'pending', sentFor: null }));
  }, [sync, events]);

  useEffect(() => {
    if (!ready || !sync.dirty || sync.state === 'saving') return;
    const wait = sync.state === 'offline' ? 15000 : 2500;
    const t = setTimeout(() => push(events), wait);
    return () => clearTimeout(t);
  }, [ready, sync, events, push]);

  useEffect(() => {
    const on = () => setSync((s) => (s.dirty ? { ...s, state: 'pending' } : s));
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, []);

  const changed = (fn) => {
    setEvents(fn);
    setSync((s) => ({ ...s, dirty: 1, state: s.state === 'saving' ? 'saving' : s.state === 'offline' ? 'offline' : 'pending', sentFor: null }));
  };

  // ---- Tagging ---------------------------------------------------------------
  const stamp = () => ({ lid: uid(), half, sec: Math.round(secs), quarter });
  const commit = (ev) => {
    changed((list) => {
      const i = list.findIndex((x) => x.lid === ev.lid);
      if (i < 0) return [...list, ev];
      const out = [...list]; out[i] = ev; return out;
    });
  };
  const remove = (lid) => changed((list) => list.filter((x) => x.lid !== lid));
  const isSaved = (ev) => events.some((x) => x.lid === ev.lid);

  const start = (kind, team) => {
    const ev = { ...stamp(), kind, team };
    if (kind === 'poss') {
      commit(ev);
      setToast(ev);
      return;
    }
    if (kind === 'to' || kind === 'foul') commit(ev); // the tap is the event; the rest is detail
    if (kind === 'shot') ev.type = 'Play';
    setEdit(ev);
  };
  const update = (patch) => {
    const ev = { ...edit, ...patch };
    // A point from outside the arc (or a 45) is worth two. Tapping Point again
    // on a 2-pointer keeps it at one, for when the spot tapped was a bit off.
    if (patch.outcome) ev.forceOne = patch.outcome === 'Point' && edit.outcome === '2 Point';
    const beyond = (ev.x != null && outsideArc(ev.x, ev.y)) || ev.type === '45';
    if (ev.kind === 'shot' && ev.outcome === 'Point' && beyond && !ev.forceOne) ev.outcome = '2 Point';
    setEdit(ev);
    const need = NEEDS[ev.kind];
    if (!need || ev[need] != null) commit(ev);
  };
  const done = () => { if (edit && isSaved(edit)) setToast(edit); setEdit(null); };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- Clock -------------------------------------------------------------------
  const clockBtn = () => {
    if (clock.half === 0) return ['Throw-in: start 1st half', () => setClock({ half: 1, running: true, base: 0, since: Date.now() })];
    if (clock.half === 1 && clock.running) return ['Half-time', () => { setClock({ ...clock, running: false, base: secs }); setView('report'); }];
    if (clock.half === 1) return ['Start 2nd half', () => setClock({ half: 2, running: true, base: 0, since: Date.now() })];
    if (clock.running) return ['Full time', () => { setClock({ ...clock, running: false, base: secs, ended: true }); setView('report'); }];
    return ['Restart clock', () => setClock({ ...clock, running: true, since: Date.now(), ended: false })];
  };
  const nudge = (d) => setClock((c) => {
    const now = c.base + (c.running ? (Date.now() - c.since) / 1000 : 0);
    return { ...c, base: Math.max(0, now + d), since: Date.now() };
  });
  const [cbLabel, cbGo] = clockBtn();

  const sheetOf = (teamId) => parseSheet(sheets[teamId]);
  const rows = useMemo(() => events.map((e) => ({ id: e.lid, ...toRow(e, teams) })), [events, teams]);
  const scores = teams.map((t) => liveScore(events, t.id));
  const counts = (kind, team) => events.filter((e) => e.kind === kind && e.team === team).length;
  const reportStart = clock.half === 1 && !clock.running ? '1st Half' : 'All';

  if (!ready) return <p className="muted">Loading…</p>;

  const T = (id) => teams.findIndex((t) => t.id === id);
  const editTeam = edit ? T(edit.team) : 0;
  const koWinner = edit?.kind === 'ko' && edit.won != null ? (edit.won ? edit.team : teams[1 - editTeam].id) : edit?.team;

  return (
    <div className="lt">
      <div className="lt-top">
        <div className="lt-score">
          <span className="lt-team" style={{ color: COLORS[0] }}>{teams[0].name}</span>
          <b className="num">{scores[0].g}-{String(scores[0].p).padStart(2, '0')}</b>
          <span className="muted">v</span>
          <b className="num">{scores[1].g}-{String(scores[1].p).padStart(2, '0')}</b>
          <span className="lt-team" style={{ color: COLORS[1] }}>{teams[1].name}</span>
        </div>
        <div className="lt-clock">
          <span className={`lt-time num ${clock.running ? 'run' : ''}`}>{clock.half ? `${clock.half === 1 ? '1st' : '2nd'} ${mmss(secs)}` : 'Not started'} <small>{clock.half ? quarter : ''}</small></span>
          {clock.half > 0 && <><button type="button" onClick={() => nudge(-60)} aria-label="Clock back a minute">−1′</button><button type="button" onClick={() => nudge(60)} aria-label="Clock forward a minute">+1′</button></>}
          <button type="button" className="primary" onClick={cbGo}>{cbLabel}</button>
          <span className={`lt-sync ${sync.state}`} title={sync.msg}>
            {sync.state === 'saved' ? 'Saved' : sync.state === 'saving' ? 'Saving…' : sync.state === 'offline' ? 'Not sent yet' : 'Saving soon'}
          </span>
        </div>
        <nav className="seg lt-tabs">
          {[['tag', 'Tag'], ['report', 'Report'], ['log', `Log (${events.length})`], ['sheets', 'Team sheets']].map(([k, t]) => (
            <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{t}</button>
          ))}
        </nav>
        {sync.state === 'offline' && <p className="lt-warn small">{sync.msg || 'Not sent yet'}. Everything is kept on this device and will send when there’s signal.</p>}
      </div>

      {view === 'tag' && (
        <div className="lt-grid">
          {teams.map((t, i) => (
            <div key={t.id} className="lt-col" style={{ '--tc': COLORS[i] }}>
              <div className="lt-colhead">{t.name}</div>
              <button type="button" className="lt-big" onClick={() => start('poss', t.id)}>Possession<small>{counts('poss', t.id)}</small></button>
              <button type="button" className="lt-big" onClick={() => start('shot', t.id)}>Shot<small>{counts('shot', t.id)}</small></button>
              <button type="button" className="lt-big" onClick={() => start('ko', t.id)}>Kick-out<small>{counts('ko', t.id)}</small></button>
              <div className="lt-small">
                <button type="button" onClick={() => start('to', t.id)}>Turnover won</button>
                <button type="button" onClick={() => start('foul', t.id)}>Free conceded</button>
                <button type="button" onClick={() => start('card', t.id)}>Card</button>
              </div>
            </div>
          ))}
          {clock.half === 0 && <p className="muted small lt-hint">Start the clock at the throw-in so every tag gets its minute and quarter. You can tag before then; it counts as minute 0.</p>}
        </div>
      )}

      {view === 'report' && <LiveReport rows={rows} teams={teams} match={match} initial={reportStart} />}

      {view === 'log' && (
        <div className="lt-log">
          {events.length === 0 && <p className="muted">Nothing tagged yet.</p>}
          {[...events].sort((a, b) => b.half - a.half || b.sec - a.sec).map((e) => (
            <div key={e.lid} className="lt-logrow">
              <span className="num muted">{e.half === 2 ? '2H' : '1H'} {mmss(e.sec)}</span>
              <i className="sw" style={{ background: COLORS[T(e.team)] }} />
              <span className="lt-desc">{describe(e, teams)}</span>
              {e.kind !== 'poss' && <button type="button" onClick={() => setEdit(e)}>Edit</button>}
              <button type="button" onClick={() => remove(e.lid)} aria-label="Delete">✕</button>
            </div>
          ))}
        </div>
      )}

      {view === 'sheets' && (
        <div className="lt-sheets">
          <p className="muted small">One player per line, number first (e.g. <code>14 Diarmuid Murtagh</code>). Names then show on the player buttons and in the scorers. Kept on this device.{match.hideNames && ' Names are hidden on the site for this grade.'}</p>
          {teams.map((t, i) => (
            <label key={t.id}><b style={{ color: COLORS[i] }}>{t.name}</b>
              <textarea rows={12} value={sheets[t.id] || ''} onChange={(e) => setSheets({ ...sheets, [t.id]: e.target.value })} placeholder={'1 Goalkeeper\n2 …'} />
            </label>
          ))}
        </div>
      )}

      {toast && !edit && (
        <div className="lt-toast" style={{ borderColor: COLORS[T(toast.team)] }}>
          <span>{describe(toast, teams)}</span>
          {events.some((x) => x.lid === toast.lid) && <button type="button" onClick={() => { remove(toast.lid); setToast(null); }}>Undo</button>}
        </div>
      )}

      {edit && (
        <div className="lt-sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) done(); }}>
          <div className="lt-panel" style={{ '--tc': COLORS[editTeam] }}>
            <div className="lt-panel-head">
              <b>{teams[editTeam].name} {{ shot: 'shot', ko: 'kick-out', to: 'turnover won', foul: 'free conceded', card: 'card' }[edit.kind]}</b>
              <span className="muted num">{edit.half === 2 ? '2H' : '1H'} {mmss(edit.sec)}</span>
            </div>

            {edit.kind === 'shot' && (
              <>
                <div className="lt-chips">
                  {['Play', 'Free', '45', 'Mark'].map((x) => <button key={x} type="button" className={edit.type === x ? 'on' : ''} onClick={() => update({ type: x })}>{x === 'Play' ? 'From play' : x}</button>)}
                </div>
                <Pitch x={edit.x} y={edit.y} color={COLORS[editTeam]} onTap={(x, y) => update({ x, y })} />
                <p className="muted small center">{edit.x == null ? 'Tap where it was taken (optional)' : outsideArc(edit.x, edit.y) ? 'Outside the arc: a score counts as a 2-pointer' : 'Inside the arc'}</p>
                <div className="lt-out">
                  {SHOT_OUT.map(([v, t]) => <button key={v} type="button" className={`${edit.outcome === v ? 'on' : ''} ${['Point', '2 Point', 'Goal'].includes(v) ? 'sc' : ''}`} onClick={() => update({ outcome: v })}>{t}</button>)}
                </div>
                <div className="lt-label">Shooter</div>
                <Players sheet={sheetOf(edit.team)} value={edit.player} color={COLORS[editTeam]} onPick={(p) => update({ player: p })} />
              </>
            )}

            {edit.kind === 'ko' && (
              <>
                <Boxes value={edit.box} color={COLORS[editTeam]} onPick={(b) => update({ box: b })} />
                <div className="lt-out ko">
                  {KO_OUT.map(([won, how, t]) => <button key={t} type="button" className={`${edit.won === won && edit.how === how ? 'on' : ''} ${won ? 'sc' : ''}`} onClick={() => update({ won, how })}>{t}</button>)}
                </div>
                <div className="lt-label">Won by {edit.won == null ? '' : teams[T(koWinner)].name}</div>
                <Players sheet={sheetOf(koWinner)} value={edit.player} color={COLORS[T(koWinner)]} onPick={(p) => update({ player: p })} />
              </>
            )}

            {(edit.kind === 'to' || edit.kind === 'foul') && (
              <>
                <div className="lt-label">Where ({edit.kind === 'to' ? `${teams[editTeam].name} won it in their` : `${teams[editTeam].name}’s`}…)</div>
                <div className="lt-chips">
                  {THIRDS.map(([k, t]) => <button key={k} type="button" className={edit.third === k ? 'on' : ''} onClick={() => update({ third: edit.third === k ? null : k })}>{t}</button>)}
                </div>
                {edit.kind === 'to' && (
                  <>
                    <div className="lt-label">Won by</div>
                    <Players sheet={sheetOf(edit.team)} value={edit.player} color={COLORS[editTeam]} onPick={(p) => update({ player: p })} />
                  </>
                )}
              </>
            )}

            {edit.kind === 'card' && (
              <>
                <div className="lt-out">
                  {['Yellow', 'Black', 'Red'].map((c) => <button key={c} type="button" className={edit.outcome === c ? 'on' : ''} onClick={() => update({ outcome: c })}>{c}</button>)}
                </div>
                <Players sheet={sheetOf(edit.team)} value={edit.player} color={COLORS[editTeam]} onPick={(p) => update({ player: p })} />
              </>
            )}

            <div className="lt-panel-foot">
              {isSaved(edit) ? (
                <>
                  <button type="button" onClick={() => { remove(edit.lid); setEdit(null); }}>Delete</button>
                  <button type="button" className="primary" onClick={done}>Done</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setEdit(null)}>Cancel</button>
                  <span className="muted small">Pick {edit.kind === 'ko' ? 'who won it' : 'the result'} to save</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
