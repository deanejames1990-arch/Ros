'use client';

import { useEffect, useRef, useState } from 'react';
import { saveTeamSheet } from './sheet-actions';
import { parseSheet } from '../../lib/live';

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

  // Rows: the full panel of 26 (1–15 starting, 16–26 subs), then anyone else
  // listed (unnumbered or above 26), then one empty row for an extra.
  const PANEL = 26;
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
      <datalist id={`squad-${team.id}`}>{squad.map((p) => <option key={p.id} value={p.name}>{p.no ? `#${p.no} last time · ` : ''}{p.games} game{p.games === 1 ? '' : 's'}</option>)}</datalist>
      <div className="sheet-rows">
        {rows.map((r, i) => (
          <div key={`${i}-${r.no}`} className={`sheet-row ${i === 15 ? 'first-sub' : ''}`}>
            {Number(r.no) > PANEL || !r.no ? (
              <input className="sheet-no" type="number" min="1" max="40" inputMode="numeric" value={r.no || ''} aria-label="Number"
                onChange={(e) => (r.blank ? null : edit(r, { no: Number(e.target.value) || null }))} disabled={r.blank} />
            ) : <span className="sheet-no">{r.no}</span>}
            <input className={`sheet-name ${inSquad(r.name) ? '' : 'new'}`} list={`squad-${team.id}`} value={r.name} placeholder={r.blank ? 'Add another' : Number(r.no) > 15 ? 'Sub' : ''}
              onChange={(e) => edit(r, { name: e.target.value })} aria-label={`Number ${r.no} name`} />
            {showMins && !r.blank && r.name && (
              <span className="sheet-mins">
                {Number(r.no) > 15 || !r.no
                  ? <input type="number" min="0" max="120" inputMode="numeric" placeholder="on" title="Came on (minute)" aria-label={`Number ${r.no} came on`} value={r.on ?? ''} onChange={(e) => edit(r, { on: e.target.value === '' ? null : Number(e.target.value) })} />
                  : <span className="sheet-min-start">start</span>}
                <input type="number" min="0" max="120" inputMode="numeric" placeholder="off" title="Went off (minute)" aria-label={`Number ${r.no} went off`} value={r.off ?? ''} onChange={(e) => edit(r, { off: e.target.value === '' ? null : Number(e.target.value) })} />
                {spanOf(r) && <small className="muted" title="First and last minute this player was tagged in this game">tagged {spanOf(r)[0]}′–{spanOf(r)[1]}′</small>}
              </span>
            )}
          </div>
        ))}
      </div>
      {showMins && <p className="muted small">Minutes: <b>on</b> for a sub, <b>off</b> for anyone taken off (blank = played to the end). Minutes run through the game, so 10 minutes into the second half of a senior game is 45. “tagged 41′–70′” is the first and last minute they appear in the tags, as a guide.</p>}
      {!hideNote && <p className="muted small">Names in <span className="sheet-new-key">italics</span> haven’t played for {team.name} on the site before and will be added as new players.</p>}
      <details className="sheet-paste">
        <summary>Paste a list</summary>
        <textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'1 Name\n2 Name\n…'} />
        <button type="button" onClick={applyPaste} disabled={!paste.trim()}>Fill the sheet</button>
      </details>
    </div>
  );
}
