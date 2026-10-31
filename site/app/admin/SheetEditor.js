'use client';

import { useEffect, useRef, useState } from 'react';
import { saveTeamSheet } from './sheet-actions';
import { parseSheet } from '../../lib/live';

// One team's sheet for one game. Names come from the squad (everyone who has
// played for the team) so a player is spelled the same way every game. Saves
// to the site a few seconds after each change; also kept by the parent
// (the tagger keeps a copy on the device).
export default function SheetEditor({ matchId, team, info, value, onChange, hideNote = false }) {
  const [own, setOwn] = useState(info?.sheet || []);
  const entries = value ?? own;
  const set = onChange ?? setOwn;
  const [status, setStatus] = useState({ state: info?.sheet?.length ? 'saved' : 'idle', msg: '' });
  const [paste, setPaste] = useState('');
  const dirty = useRef(false);
  const setRef = useRef(set);
  setRef.current = set;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const squad = info?.squad || [];
  const byName = new Map(squad.map((p) => [p.name.toLowerCase(), p]));

  const change = (list) => { dirty.current = true; set(list); setStatus({ state: 'pending', msg: '' }); };

  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = setTimeout(async () => {
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
    }, status.state === 'error' ? 15000 : 2000);
    return () => clearTimeout(t);
  }, [entries, matchId, team.id, status.state]);

  // Rows: 1–15 always, then subs, then one empty sub row.
  const byNo = new Map(entries.filter((e) => e.no).map((e) => [Number(e.no), e]));
  const subs = entries.filter((e) => !e.no || Number(e.no) > 15).sort((a, b) => (a.no || 99) - (b.no || 99));
  const nextSub = Math.max(15, ...entries.map((e) => Number(e.no) || 0)) + 1;
  const rows = [
    ...Array.from({ length: 15 }, (_, i) => byNo.get(i + 1) || { no: i + 1, name: '' }),
    ...subs,
    { no: nextSub, name: '', blank: true },
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
        {entries.length > 0 && <button type="button" onClick={() => change([])}>Clear</button>}
      </div>
      <datalist id={`squad-${team.id}`}>{squad.map((p) => <option key={p.id} value={p.name}>{p.no ? `#${p.no} last time · ` : ''}{p.games} game{p.games === 1 ? '' : 's'}</option>)}</datalist>
      <div className="sheet-rows">
        {rows.map((r, i) => (
          <div key={`${i}-${r.no}`} className={`sheet-row ${i === 15 ? 'first-sub' : ''}`}>
            {Number(r.no) > 15 || !r.no ? (
              <input className="sheet-no" type="number" min="1" max="40" inputMode="numeric" value={r.no || ''} aria-label="Number"
                onChange={(e) => (r.blank ? null : edit(r, { no: Number(e.target.value) || null }))} disabled={r.blank} />
            ) : <span className="sheet-no">{r.no}</span>}
            <input className={`sheet-name ${inSquad(r.name) ? '' : 'new'}`} list={`squad-${team.id}`} value={r.name} placeholder={r.blank ? 'Add a sub' : Number(r.no) > 15 ? 'Sub' : ''}
              onChange={(e) => edit(r, { name: e.target.value })} aria-label={`Number ${r.no} name`} />
          </div>
        ))}
      </div>
      {!hideNote && <p className="muted small">Names in <span className="sheet-new-key">italics</span> haven’t played for {team.name} on the site before and will be added as new players.</p>}
      <details className="sheet-paste">
        <summary>Paste a list</summary>
        <textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'1 Name\n2 Name\n…'} />
        <button type="button" onClick={applyPaste} disabled={!paste.trim()}>Fill the sheet</button>
      </details>
    </div>
  );
}
