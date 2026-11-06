'use client';

import { useEffect, useRef, useState } from 'react';
import { saveTeamSheet } from './sheet-actions';
import { parseSheet } from '../../lib/live';
import { isStarter } from '../../lib/players';

// One team's sheet for one game. Names come from the squad (everyone who has
// played for the team) so a player is spelled the same way every game. Saves
// to the site a few seconds after each change; also kept by the parent
// (the tagger keeps a copy on the device).
export default function SheetEditor({ matchId, team, info, value, onChange, hideNote = false, flushRef = null, showMins = true }) {
  const [own, setOwn] = useState(info?.sheet || []);
  const entries = value ?? own;
  const set = onChange ?? setOwn;
  const [status, setStatus] = useState({ state: info?.sheet?.length ? 'saved' : 'idle', msg: '' });
  const [paste, setPaste] = useState('');
  // A sheet on this device that the site doesn't have yet (e.g. a save that
  // never went through) is sent as soon as the editor opens.
  const dirty = useRef(!info?.sheet?.length && (value?.length || 0) > 0);
  const inFlight = useRef(null);
  const setRef = useRef(set);
  setRef.current = set;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const squad = info?.squad || [];
  const byName = new Map(squad.map((p) => [p.name.toLowerCase(), p]));

  const change = (list) => { dirty.current = true; set(list); setStatus({ state: 'pending', msg: '' }); };

  // One save at a time; used by the timer and by flush (before finishing a game).
  const saveNow = async () => {
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return true;
    const run = (async () => {
      dirty.current = false;
      setStatus({ state: 'saving', msg: '' });
      const sent = entriesRef.current;
      const res = await saveTeamSheet(matchId, team.id, sent).catch((e) => ({ ok: false, error: String(e.message || e) }));
      if (res?.ok) {
        // Keep the player ids the site gave each name.
        const ids = new Map(res.entries.map((e) => [`${e.no}:${e.name.toLowerCase()}`, e.id]));
        const now = entriesRef.current;
        const withIds = now.map((e) => ({ ...e, id: ids.get(`${Number(e.no) || null}:${String(e.name).trim().replace(/\s+/g, ' ').toLowerCase()}`) ?? e.id ?? null }));
        if (withIds.some((e, i) => e.id !== now[i].id)) setRef.current(withIds);
        if (now !== sent) dirty.current = true;
        setStatus({ state: 'saved', msg: '' });
      } else {
        dirty.current = true;
        setStatus({ state: 'error', msg: typeof navigator !== 'undefined' && navigator.onLine === false ? 'No signal: kept on this device, will save later' : res?.error || 'Not saved' });
      }
      return Boolean(res?.ok);
    })();
    inFlight.current = run;
    try { return await run; } finally { inFlight.current = null; }
  };
  if (flushRef) flushRef.current = saveNow;

  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = setTimeout(saveNow, status.state === 'error' ? 15000 : 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, matchId, team.id, status.state]);

  // Rows: the full panel of 30, then anyone else listed (unnumbered or above
  // 30), then one empty row for an extra. Who started is ticked (1–15 unless changed).
  const PANEL = 30;
  const byNo = new Map(entries.filter((e) => e.no).map((e) => [Number(e.no), e]));
  const extra = entries.filter((e) => !e.no || Number(e.no) > PANEL).sort((a, b) => (a.no || 99) - (b.no || 99));
  const nextNo = Math.max(PANEL, ...entries.map((e) => Number(e.no) || 0)) + 1;
  const rows = [
    ...Array.from({ length: PANEL }, (_, i) => byNo.get(i + 1) || { no: i + 1, name: '' }),
    ...extra,
    { no: nextNo, name: '', blank: true },
  ];

  const edit = (row, patch) => {
    const next = { ...row, ...patch };
    delete next.blank;
    if (patch.name !== undefined) {
      const p = byName.get(String(patch.name).trim().toLowerCase());
      next.id = p ? p.id : null;
    }
    const out = entries.includes(row) ? entries.map((e) => (e === row ? next : e)) : [...entries, next];
    change(out.filter((e) => String(e.name || '').trim()));
  };

  const useLast = () => change(info.last.map((e) => ({ ...e })));
  const applyPaste = () => {
    const m = parseSheet(paste);
    change(Object.entries(m).map(([no, name]) => {
      const p = byName.get(name.toLowerCase());
      return { no: Number(no), name: p ? p.name : name, id: p ? p.id : null };
    }));
    setPaste('');
  };
  // Names in this game's tags that aren't on the sheet yet (imported files).
  const onSheet = new Set(entries.map((e) => String(e.name).trim().toLowerCase()));
  const missing = (info?.tagNames || []).filter((n) => !onSheet.has(n.toLowerCase()));
  const addFromTags = () => change([...entries, ...missing.map((n) => {
    const p = byName.get(n.toLowerCase());
    return { no: null, name: p ? p.name : n, id: p ? p.id : null };
  })]);
  const spanOf = (r) => info?.tagSpan?.[String(r.name || '').trim().toLowerCase()] || (r.no ? info?.tagSpan?.[`#${r.no}`] : null) || null;
  const starters = entries.filter((e) => String(e.name || '').trim() && isStarter(e)).length;
  // The usual sheet: 1–15 started, the rest didn't.
  const defaultXV = entries.every((e) => e.start == null || Boolean(e.start) === Boolean(Number(e.no) && Number(e.no) <= 15));
  const inSquad = (name) => !name || byName.has(String(name).trim().toLowerCase());

  return (
    <div className="sheet-ed" style={{ '--tc': team.color }}>
      <div className="sheet-head">
        <b>{team.name}</b>
        <span className={`sheet-status ${status.state}`} title={status.msg}>
          {status.state === 'saved' ? 'Saved to site' : status.state === 'saving' ? 'Saving…' : status.state === 'pending' ? 'Saving soon' : status.state === 'error' ? 'Not saved yet' : 'Empty'}
        </span>
      </div>
      {status.state === 'error' && <p className="lt-warn small">{status.msg}</p>}
      <div className="sheet-tools">
        {info?.last?.length > 0 && (
          <button type="button" onClick={useLast}>Use last sheet{info.lastDate ? ` (${new Date(info.lastDate).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })})` : ''}</button>
        )}
        {missing.length > 0 && (
          <button type="button" onClick={addFromTags} title={missing.join(', ')}>Add {missing.length} name{missing.length === 1 ? '' : 's'} from the tags</button>
        )}
        {entries.length > 0 && <button type="button" onClick={() => change([])}>Clear</button>}
      </div>
      {entries.length > 0 && (
        <p className={`small ${starters === 15 ? 'muted' : 'lt-warn'}`}>{starters} starting{starters !== 15 ? ' (usually 15)' : ''}. Tap <b>Start</b> / <b>Sub</b> beside a name when the team that started isn’t 1–15.</p>
      )}
      <datalist id={`squad-${team.id}`}>{squad.map((p) => <option key={p.id} value={p.name}>{p.no ? `#${p.no} last time · ` : ''}{p.games} game{p.games === 1 ? '' : 's'}</option>)}</datalist>
      <div className="sheet-rows">
        {rows.map((r, i) => (
          <div key={`${i}-${r.no}`} className={`sheet-row ${i === 15 && defaultXV ? 'first-sub' : ''}`}>
            {Number(r.no) > PANEL || !r.no ? (
              <input className="sheet-no" type="number" min="1" max="60" inputMode="numeric" value={r.no || ''} aria-label="Number"
                onChange={(e) => (r.blank ? null : edit(r, { no: Number(e.target.value) || null }))} disabled={r.blank} />
            ) : <span className="sheet-no">{r.no}</span>}
            <input className={`sheet-name ${inSquad(r.name) ? '' : 'new'}`} list={`squad-${team.id}`} value={r.name} placeholder={r.blank ? 'Add another' : isStarter(r) ? '' : 'Sub'}
              onChange={(e) => edit(r, { name: e.target.value })} aria-label={`Number ${r.no} name`} />
            {!r.blank && r.name ? (
              <button type="button" className={`sheet-start ${isStarter(r) ? 'on' : ''}`} aria-pressed={isStarter(r)}
                title={isStarter(r) ? 'Started (tap if he came off the bench)' : 'Sub (tap if he started)'}
                onClick={() => edit(r, { start: !isStarter(r) })}>{isStarter(r) ? 'Start' : 'Sub'}</button>
            ) : <span />}
            {showMins && !r.blank && r.name && (r.on != null || r.off != null) && (
              <span className="sheet-mins">{r.on != null && <span className="sub-on">on {r.on}′</span>}{r.off != null && <span className="sub-off">off {r.off}′</span>}</span>
            )}
          </div>
        ))}
      </div>
      {showMins && <Subs entries={entries} change={change} spanOf={spanOf} gameLen={info?.gameLen || 70} />}
      {!hideNote && <p className="muted small">Names in <span className="sheet-new-key">italics</span> haven’t played for {team.name} on the site before and will be added as new players.</p>}
      <details className="sheet-paste">
        <summary>Paste a list</summary>
        <textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'1 Name\n2 Name\n…'} />
        <button type="button" onClick={applyPaste} disabled={!paste.trim()}>Fill the sheet</button>
      </details>
    </div>
  );
}

// Substitutions, the way they're said: "Niall Higgins on for Paddy Gavin, 52′".
// Sets the came-on minute on one row and the went-off minute on the other.
function Subs({ entries, change, spanOf, gameLen }) {
  const half = gameLen / 2;
  const [offKey, setOff] = useState('');
  const [onKey, setOn] = useState('');
  const [min, setMin] = useState('');
  const [h, setH] = useState('2');
  const key = (e) => `${e.no || ''}:${e.name}`;
  const label = (e) => `${e.no ? `#${e.no} ` : ''}${e.name}`;
  const when = (m) => (m > half ? `${m}′ (2nd half ${m - half}′)` : `${m}′`);
  const named = entries.filter((e) => String(e.name || '').trim());
  // Pair each sub with whoever went off at the same minute.
  const used = new Set();
  const pairs = named.filter((e) => e.on != null).sort((a, b) => a.on - b.on).map((on) => {
    const off = named.find((o) => o !== on && o.off === on.on && !used.has(o));
    if (off) used.add(off);
    return { on, off, m: on.on };
  });
  const loneOff = named.filter((o) => o.off != null && !used.has(o));
  const canOff = named.filter((e) => (isStarter(e) || e.on != null) && e.off == null);
  const canOn = named.filter((e) => !isStarter(e) && e.on == null);
  const hint = (e) => { const s = spanOf(e); return s ? ` · tagged ${s[0]}′–${s[1]}′` : ''; };
  const abs = () => { const m = Number(min); if (!min || Number.isNaN(m)) return null; return h === '2' ? Math.min(gameLen, half + m) : Math.min(half, m); };
  const set = (list) => change(entries.map((e) => list.find((x) => x.e === e)?.next || e));
  const add = () => {
    const m = abs();
    const o = named.find((e) => key(e) === offKey), n = named.find((e) => key(e) === onKey);
    if (m == null || (!o && !n)) return;
    set([...(o ? [{ e: o, next: { ...o, off: m } }] : []), ...(n ? [{ e: n, next: { ...n, on: m } }] : [])]);
    setOff(''); setOn(''); setMin('');
  };
  const undo = (p) => set([{ e: p.on, next: { ...p.on, on: null } }, ...(p.off ? [{ e: p.off, next: { ...p.off, off: null } }] : [])]);
  return (
    <div className="subs-box">
      <b>Substitutions</b>
      {pairs.length === 0 && loneOff.length === 0 && <p className="muted small">None yet. Anyone not listed here played the whole game (if they started).</p>}
      <ul className="subs-list">
        {pairs.map((p) => (
          <li key={key(p.on)}>
            <span className="sub-on">{label(p.on)}</span> on for <span className="sub-off">{p.off ? label(p.off) : '—'}</span> · {when(p.m)}
            <button type="button" className="linkish" onClick={() => undo(p)} aria-label="Remove this substitution">✕</button>
          </li>
        ))}
        {loneOff.map((o) => (
          <li key={key(o)}><span className="sub-off">{label(o)}</span> off, not replaced · {when(o.off)}
            <button type="button" className="linkish" onClick={() => set([{ e: o, next: { ...o, off: null } }])} aria-label="Remove">✕</button></li>
        ))}
      </ul>
      <div className="subs-add">
        <select value={onKey} onChange={(e) => setOn(e.target.value)} aria-label="Came on">
          <option value="">Came on…</option>
          {canOn.map((e) => <option key={key(e)} value={key(e)}>{label(e)}{hint(e)}</option>)}
        </select>
        <span>for</span>
        <select value={offKey} onChange={(e) => setOff(e.target.value)} aria-label="Went off">
          <option value="">Went off…</option>
          {canOff.map((e) => <option key={key(e)} value={key(e)}>{label(e)}{hint(e)}</option>)}
        </select>
        <span>at</span>
        <input type="number" min="0" max={half} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} placeholder="min" aria-label="Minute" />
        <select value={h} onChange={(e) => setH(e.target.value)} aria-label="Half">
          <option value="1">1st half</option>
          <option value="2">2nd half</option>
        </select>
        <button type="button" onClick={add} disabled={!min || (!offKey && !onKey)}>Add</button>
      </div>
      <p className="muted small">The minute is the clock in that half (e.g. 17 in the 2nd half). Put the sub on the sheet first (marked Sub) so he’s in the “Came on” list. A player who started doesn’t need a sub at 0′: mark him Start. “tagged 41′–70′” is when the player first and last appears in the tags, as a guide.</p>
    </div>
  );
}
