'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveLiveGame } from '../actions';
import { toRow, fromRow, quarterFor, parseSheet, outsideArc, liveScore, withPossessions } from '../../../../lib/live';
import { GRID } from '../../../report/sections';
import { PitchLines, VIEW } from '../../../report/ShotMap';
import LiveReport from './LiveReport';
import SheetEditor from '../../SheetEditor';
import { nameEvents } from '../../../../lib/players';
import Trends from '../../../report/Trends';
import { targetFor } from '../../../../lib/targets';

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
    case 'foul': return `${t} free conceded${e.third ? ` · ${e.third.toLowerCase()}` : ''}${e.player ? ` · won by ${e.player.name || `#${e.player.no}`}` : ''}`;
    case 'card': return `${t} ${String(e.outcome).toLowerCase()} card${who}`;
    case 'throw': return `${t} won the throw-in${who}`;
    default: return e.kind;
  }
}

function Players({ sheet, value, onPick, color }) {
  const [subs, setSubs] = useState(false);
  // Subs page: 16–26 (the full panel of 26), plus any higher number on the sheet.
  const extra = Object.keys(sheet).map(Number).filter((n) => n > 26).sort((a, b) => a - b);
  const nums = subs ? [...Array.from({ length: 11 }, (_, i) => i + 16), ...extra] : Array.from({ length: 15 }, (_, i) => i + 1);
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

// Team sheets are kept as { teamId: [{ no, name, id }] }; older copies on a
// device were plain text.
const asEntries = (v) => (Array.isArray(v) ? v : Object.entries(parseSheet(v || '')).map(([no, name]) => ({ no: Number(no), name, id: null })));

export default function Tagger({ match, teams, saved, sheetInfo = {} }) {
  const key = `ros-live-${match.id}`;
  const [ready, setReady] = useState(false);
  const [events, setEvents] = useState([]);
  const [clock, setClock] = useState({ half: 0, running: false, base: 0, since: 0 });
  const [sheets, setSheets] = useState({});
  const [view, setView] = useState('tag');
  const [trendMin, setTrendMin] = useState(10);
  const [edit, setEdit] = useState(null); // event being added or changed
  const [toast, setToast] = useState(null);
  const [sync, setSync] = useState({ state: 'saved', dirty: 0, msg: '' });
  const [, tick] = useState(0);
  const savingRef = useRef(false);
  const [finished, setFinished] = useState(Boolean(match.finished));
  const [finishing, setFinishing] = useState(null); // { [teamId]: { g, p } } while the finish panel is open
  const [finishMsg, setFinishMsg] = useState('');
  const [throwFor, setThrowFor] = useState(null); // { half, lid? } while asking who won the throw-in

  // Load: this device's copy if it has one, otherwise what's on the site.
  useEffect(() => {
    const local = store.get(key);
    if (local && (local.dirty || (local.events?.filter((e) => e.kind !== 'poss').length || 0) >= saved.filter((r) => !r.labels?.Auto).length)) {
      setEvents((local.events || []).filter((e) => e.kind !== 'poss'));
      setClock(local.clock || clock);
      // The site's sheet wins unless this device has one the site doesn't.
      setSheets(Object.fromEntries(teams.map((t) => {
        const site = sheetInfo[t.id]?.sheet || [];
        const mine = asEntries(local.sheets?.[t.id]);
        return [t.id, site.length ? site : mine];
      })));
      if (local.dirty) setSync({ state: 'pending', dirty: 1, msg: '' });
    } else {
      setSheets(Object.fromEntries(teams.map((t) => [t.id, sheetInfo[t.id]?.sheet || []])));
      const evs = saved.map((r) => fromRow(r, teams)).filter(Boolean)
        .sort((a, b) => a.half - b.half || a.sec - b.sec);
      setEvents(evs);
      const last = evs[evs.length - 1];
      // Opened on another device mid-game: paused at the last tag, ready to resume.
      if (last) setClock({ half: last.half, running: false, base: last.sec, since: 0, ended: Boolean(match.finished), paused: !match.finished });
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
  const halfTime = () => { setClock({ ...clock, running: false, base: secs, paused: false }); setView('report'); };
  const fullTime = () => { setClock({ ...clock, running: false, base: secs, ended: true, paused: false }); openFinish(); };
  const clockBtn = () => {
    if (clock.paused) return ['Resume', () => setClock({ ...clock, running: true, since: Date.now(), paused: false })];
    if (clock.half === 0) return ['Throw-in: start 1st half', () => { setClock({ half: 1, running: true, base: 0, since: Date.now() }); askThrow(1); }];
    if (clock.half === 1 && clock.running) return ['Half-time', halfTime];
    if (clock.half === 1) return ['Start 2nd half', () => { setClock({ half: 2, running: true, base: 0, since: Date.now() }); askThrow(2); }];
    if (clock.running) return ['Full time', fullTime];
    if (finished) return ['Finished', () => setView('report')];
    return ['Finish game', () => openFinish()];
  };
  const nudge = (d) => setClock((c) => {
    const now = c.base + (c.running ? (Date.now() - c.since) / 1000 : 0);
    return { ...c, base: Math.max(0, now + d), since: Date.now() };
  });
  const [cbLabel, cbGo] = clockBtn();
  // Pause for a break in the video (or a stoppage); set the time to match the video clock.
  const pause = () => setClock({ ...clock, running: false, base: secs, paused: true });
  const [settingTime, setSettingTime] = useState(null);
  const applyTime = () => {
    const m = String(settingTime || '').trim().match(/^(\d{1,2})(?:[:.](\d{1,2}))?$/);
    if (m) setClock((c) => ({ ...c, base: Number(m[1]) * 60 + Number(m[2] || 0), since: Date.now() }));
    setSettingTime(null);
  };

  // ---- Throw-in ------------------------------------------------------------------
  // Asked when each half starts; the winner gets the first possession of the half.
  const throwOf = (h) => events.find((e) => e.kind === 'throw' && e.half === h);
  function askThrow(h) { if (!throwOf(h)) setThrowFor({ half: h }); }
  function pickThrow(teamId) {
    const h = throwFor.half;
    const old = throwOf(h);
    const ev = { ...(old || {}), lid: old?.lid || uid(), half: h, sec: 0, quarter: h === 2 ? 'Q3' : 'Q1', kind: 'throw', team: teamId };
    commit(ev);
    setThrowFor(null);
    setToast(ev);
  }
  const missingThrow = clock.half > 0 && !throwOf(clock.half);

  // ---- Finishing -----------------------------------------------------------------
  function openFinish() {
    setFinishMsg('');
    const off = match.official || {};
    // Start from the tagged score; on a game already finished, from the score saved then.
    setFinishing(Object.fromEntries(teams.map((t) => {
      const tag = liveScore(events, t.id);
      return [t.id, finished && off[t.id] ? { g: off[t.id].g ?? 0, p: off[t.id].p ?? 0 } : { g: tag.g, p: tag.p }];
    })));
  }
  async function finish() {
    setFinishMsg('Saving…');
    try {
      const res = await saveLiveGame(match.id, events, { final: finishing, finish: true });
      if (!res?.ok) throw new Error(res?.error || 'Save failed');
      store.set(key, { events, clock: { ...clock, running: false, ended: true }, sheets, dirty: false });
      setFinished(true);
      window.location.href = `/match/${match.id}`;
    } catch (e) {
      setFinishMsg(navigator.onLine === false
        ? 'No signal. Your tags are safe on this device: try again when you have signal.'
        : `Couldn’t finish: ${e.message || e}`);
    }
  }
  async function reopen() {
    const res = await saveLiveGame(match.id, events, { reopen: true });
    if (res?.ok) { setFinished(false); setClock((c) => ({ ...c, ended: false })); }
  }

  const sheetOf = (teamId) => Object.fromEntries((sheets[teamId] || []).filter((e) => e.no).map((e) => [e.no, e.name]));
  const rows = useMemo(() => {
    const apps = teams.flatMap((t) => (sheets[t.id] || []).map((e) => ({ team_id: t.id, jersey_no: e.no, players: { name: e.name } })));
    const named = nameEvents(events.map((e) => ({ id: e.lid, ...toRow(e, teams) })), apps, teams);
    // In time order, then possessions worked out from kick-outs, turnovers, frees and shots.
    const ordered = [...named].sort((a, b) => (a.start_sec || 0) - (b.start_sec || 0));
    return withPossessions(ordered, teams);
  }, [events, teams, sheets]);
  const possCount = (teamId) => rows.filter((r) => r.event_type === 'Poss' && r.team_id === teamId).length;
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
          {settingTime != null ? (
            <input className="lt-settime num" autoFocus inputMode="numeric" value={settingTime} placeholder="mm:ss" aria-label="Set the clock (minutes:seconds)"
              onChange={(e) => setSettingTime(e.target.value)} onBlur={applyTime} onKeyDown={(e) => { if (e.key === 'Enter') applyTime(); if (e.key === 'Escape') setSettingTime(null); }} />
          ) : (
            <button type="button" className={`lt-time num ${clock.running ? 'run' : ''} ${clock.paused ? 'paused' : ''}`} disabled={!clock.half} title="Tap to set the time"
              onClick={() => setSettingTime(mmss(secs))}>
              {clock.half ? `${clock.half === 1 ? '1st' : '2nd'} ${mmss(secs)}` : 'Not started'} <small>{clock.half ? (clock.paused ? 'paused' : quarter) : ''}</small>
            </button>
          )}
          {clock.half > 0 && <><button type="button" onClick={() => nudge(-60)} aria-label="Clock back a minute">−1′</button><button type="button" onClick={() => nudge(60)} aria-label="Clock forward a minute">+1′</button></>}
          {clock.running && <button type="button" onClick={pause}>Pause</button>}
          <button type="button" className="primary" onClick={cbGo}>{cbLabel}</button>
          {clock.paused && !clock.ended && <button type="button" onClick={clock.half === 1 ? halfTime : fullTime}>{clock.half === 1 ? 'Half-time' : 'Full time'}</button>}
          {clock.half === 2 && !clock.running && !clock.paused && !finished && <button type="button" onClick={() => setClock({ ...clock, running: true, since: Date.now(), ended: false })}>Restart clock</button>}
          <span className={`lt-sync ${sync.state}`} title={sync.msg}>
            {sync.state === 'saved' ? 'Saved' : sync.state === 'saving' ? 'Saving…' : sync.state === 'offline' ? 'Not sent yet' : 'Saving soon'}
          </span>
        </div>
        <nav className="seg lt-tabs">
          {[['tag', 'Tag'], ['trends', 'Trends'], ['report', 'Report'], ['log', `Log (${events.length})`], ['sheets', 'Team sheets']].map(([k, t]) => (
            <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{t}</button>
          ))}
        </nav>
        {finished && (
          <p className="lt-done small">Game finished and saved. You can still correct tags here.{' '}
            <a href={`/match/${match.id}`}>Open dashboard</a> · <button type="button" className="linkish" onClick={openFinish}>Change final score</button> · <button type="button" className="linkish" onClick={reopen}>Reopen as live</button>
          </p>
        )}
        {sync.state === 'offline' && <p className="lt-warn small">{sync.msg || 'Not sent yet'}. Everything is kept on this device and will send when there’s signal.</p>}
      </div>

      {view === 'tag' && (
        <div className="lt-grid">
          {teams.map((t, i) => (
            <div key={t.id} className="lt-col" style={{ '--tc': COLORS[i] }}>
              <div className="lt-colhead">{t.name}<small className="lt-poss" title="Worked out from kick-outs, turnovers, frees and shots">{possCount(t.id)} possessions</small></div>
              <button type="button" className="lt-big" onClick={() => start('shot', t.id)}>Shot<small>{counts('shot', t.id)}</small></button>
              <button type="button" className="lt-big" onClick={() => start('ko', t.id)}>Kick-out<small>{counts('ko', t.id)}</small></button>
              <div className="lt-small">
                <button type="button" onClick={() => start('to', t.id)}>Turnover won</button>
                <button type="button" onClick={() => start('foul', t.id)}>Free conceded</button>
                <button type="button" onClick={() => start('card', t.id)}>Card</button>
              </div>
            </div>
          ))}
          {missingThrow && <p className="small lt-hint"><button type="button" onClick={() => setThrowFor({ half: clock.half })}>Who won the {clock.half === 2 ? '2nd-half' : ''} throw-in?</button></p>}
          {clock.half === 0 && <p className="muted small lt-hint">Start the clock at the throw-in so every tag gets its minute and quarter. You can tag before then; it counts as minute 0.</p>}
        </div>
      )}

      {view === 'trends' && (
        <Trends events={rows} teams={teams.map((t, i) => ({ ...t, color: COLORS[i] }))} halfLen={match.halfLen} windowMin={trendMin} usId={teams[0].id} target={targetFor(match.grade)}
          controls={<span className="seg trend-win">{[5, 10, 15].map((n) => <button key={n} type="button" className={trendMin === n ? 'on' : ''} onClick={() => setTrendMin(n)}>{n} min</button>)}</span>} />
      )}
      {view === 'trends' && events.length === 0 && <p className="muted">Trends appear once you start tagging.</p>}

      {view === 'report' && <LiveReport rows={rows} teams={teams} match={match} initial={reportStart} />}

      {view === 'log' && (
        <div className="lt-log">
          {events.length === 0 && <p className="muted">Nothing tagged yet.</p>}
          {[...events].sort((a, b) => b.half - a.half || b.sec - a.sec).map((e) => (
            <div key={e.lid} className="lt-logrow">
              <span className="num muted">{e.half === 2 ? '2H' : '1H'} {mmss(e.sec)}</span>
              <i className="sw" style={{ background: COLORS[T(e.team)] }} />
              <span className="lt-desc">{describe(e, teams)}</span>
              {e.kind !== 'poss' && <button type="button" onClick={() => (e.kind === 'throw' ? setThrowFor({ half: e.half }) : setEdit(e))}>Edit</button>}
              <button type="button" onClick={() => remove(e.lid)} aria-label="Delete">✕</button>
            </div>
          ))}
        </div>
      )}

      {view === 'log' && !finished && (
        <p className="center"><button type="button" onClick={openFinish}>Finish game now</button><br /><span className="muted small">For a game you’re stopping early, or if you never started the clock.</span></p>
      )}

      {view === 'sheets' && (
        <div className="lt-sheets">
          <p className="muted small lt-sheets-note">Saved to the site, so each player builds up a profile game by game. Pick names from the list so they’re spelled the same every time. Tags you made by number pick up the name from here, even ones made before you filled the sheet in.{match.hideNames && ' Names are hidden from viewers for this grade.'}</p>
          {teams.map((t, i) => (
            <SheetEditor key={t.id} matchId={match.id} team={{ ...t, color: COLORS[i] }} info={sheetInfo[t.id]}
              value={sheets[t.id] || []} onChange={(list) => setSheets((s) => ({ ...s, [t.id]: list }))} hideNote={i > 0} />
          ))}
        </div>
      )}

      {toast && !edit && (
        <div className="lt-toast" style={{ borderColor: COLORS[T(toast.team)] }}>
          <span>{describe(toast, teams)}</span>
          {events.some((x) => x.lid === toast.lid) && <button type="button" onClick={() => { remove(toast.lid); setToast(null); }}>Undo</button>}
        </div>
      )}

      {throwFor && (
        <div className="lt-sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) setThrowFor(null); }}>
          <div className="lt-panel lt-throw" style={{ '--tc': '#2b3c81' }}>
            <div className="lt-panel-head"><b>Who won the {throwFor.half === 2 ? '2nd-half ' : ''}throw-in?</b></div>
            <p className="muted small">Their first possession of the half starts here.</p>
            <div className="lt-throw-teams">
              {teams.map((t, i) => (
                <button key={t.id} type="button" className={`lt-big ${throwOf(throwFor.half)?.team === t.id ? 'on' : ''}`} style={{ '--tc': COLORS[i] }} onClick={() => pickThrow(t.id)}>{t.name}</button>
              ))}
            </div>
            <div className="lt-panel-foot">
              {throwOf(throwFor.half) && <button type="button" onClick={() => { remove(throwOf(throwFor.half).lid); setThrowFor(null); }}>Remove</button>}
              <button type="button" onClick={() => setThrowFor(null)}>Skip</button>
            </div>
          </div>
        </div>
      )}

      {finishing && (
        <div className="lt-sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) setFinishing(null); }}>
          <div className="lt-panel lt-finish" style={{ '--tc': '#2b3c81' }}>
            <div className="lt-panel-head"><b>Finish game</b><span className="muted small">{events.length} tags</span></div>
            <p className="small">Check the final score. It starts from your tags: correct it if you missed a score, and the dashboard will flag any gap.</p>
            {teams.map((t, i) => {
              const tag = liveScore(events, t.id);
              const f = finishing[t.id];
              const set = (k, v) => setFinishing({ ...finishing, [t.id]: { ...f, [k]: v } });
              return (
                <div key={t.id} className="lt-final">
                  <b style={{ color: COLORS[i] }}>{t.name}</b>
                  <input type="number" min="0" inputMode="numeric" aria-label={`${t.name} goals`} value={f.g} onChange={(e) => set('g', e.target.value)} />
                  <span>-</span>
                  <input type="number" min="0" inputMode="numeric" aria-label={`${t.name} points`} value={f.p} onChange={(e) => set('p', e.target.value)} />
                  <span className="muted small">tagged {tag.g}-{String(tag.p).padStart(2, '0')}</span>
                </div>
              );
            })}
            {finishMsg && <p className={`small ${finishMsg === 'Saving…' ? 'muted' : 'lt-warn'}`}>{finishMsg}</p>}
            <div className="lt-panel-foot">
              <button type="button" onClick={() => setFinishing(null)}>Back</button>
              <button type="button" className="primary" onClick={finish} disabled={finishMsg === 'Saving…'}>Finish and open dashboard</button>
            </div>
          </div>
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
                {edit.kind === 'foul' && (
                  <>
                    <div className="lt-label">Free won by ({teams[1 - editTeam].name})</div>
                    <Players sheet={sheetOf(teams[1 - editTeam].id)} value={edit.player} color={COLORS[1 - editTeam]} onPick={(p) => update({ player: p })} />
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
