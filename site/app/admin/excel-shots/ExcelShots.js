'use client';

import { useState } from 'react';
import { shotsFromWorkbook } from '../../../lib/excel-shots';
import { matchExcelShots } from './actions';

export default function ExcelShots() {
  const [games, setGames] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [pick, setPick] = useState({});
  const [err, setErr] = useState('');

  async function load(file) {
    setErr(''); setRes(null); setGames(null);
    if (!file) return;
    setBusy('Reading the workbook…');
    try {
      const { default: readXlsxFile } = await import('read-excel-file/browser');
      const sheets = await readXlsxFile(file);
      const g = shotsFromWorkbook(sheets);
      if (!g.length) throw new Error('No shot sheets found: it needs “(DATA) SHOTS FROM PLAY” (and optionally “(DATA) FREES”) with Event / Time / Team Name / Outcome / Player / Location columns.');
      setGames(g);
      await check(g, false);
    } catch (e) { setErr(e.message || String(e)); }
    setBusy('');
  }
  async function check(g = games, apply = false) {
    setBusy(apply ? 'Saving…' : 'Matching against the site…');
    const r = await matchExcelShots(g, { apply, overwrite, pick });
    if (!r.ok) setErr(r.error); else setRes(r);
    setBusy('');
  }
  const ready = res?.games?.filter((x) => x.status === 'ok') || [];
  const toDo = ready.reduce((t, x) => t + x.boxes + x.names, 0);
  return (
    <div className="card">
      <label className="file-pick">Workbook (.xlsx) <input type="file" accept=".xlsx" onChange={(e) => load(e.target.files?.[0])} /></label>
      {busy && <p className="muted small">{busy}</p>}
      {err && <p className="check warn small">{err}</p>}
      {games && <p className="small muted">{games.length} games in the workbook, {games.reduce((t, x) => t + x.shots.length, 0)} shots.</p>}
      {res && (
        <>
          <table className="xs-table">
            <thead><tr><th>Game in the workbook</th><th>On the site</th><th>Matched</th><th>Boxes to add</th><th>Names to add</th></tr></thead>
            <tbody>
              {res.games.map((x) => (
                <tr key={x.key} className={x.status}>
                  <td>{x.title}<div className="muted small">{x.shots} shots</div></td>
                  <td>
                    {x.status === 'ok' && <a href={`/match/${x.matchId}`} target="_blank" rel="noreferrer">{x.site}</a>}
                    {x.status === 'missing' && <span className="muted">Not on the site yet: add the game first</span>}
                    {(x.status === 'pick' || x.choices) && (
                      <select value={pick[x.key] || ''} onChange={(e) => setPick({ ...pick, [x.key]: e.target.value })}>
                        <option value="">{x.status === 'pick' ? 'Which game?' : 'Matched automatically'}</option>
                        {(x.choices || []).map((c) => <option key={c.id} value={c.id}>{c.title} · {c.comp} · {c.date}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="num">{x.status === 'ok' ? <>{x.matched} of {x.shots}{x.unmatchedCount ? <details><summary className="small">{x.unmatchedCount} not found</summary><ul className="small">{x.unmatched.map((u, i) => <li key={i}>{u.time} {u.team} {u.outcome}{u.player ? ` · ${u.player}` : ''}{u.box ? ` · box ${u.box}` : ''}</li>)}</ul></details> : null}</> : '—'}</td>
                  <td className="num">{x.status === 'ok' ? <>{x.boxes}{x.sameBox ? <small className="muted"> ({x.sameBox} already right)</small> : ''}</> : '—'}</td>
                  <td className="num">{x.status === 'ok' ? x.names : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="tick small"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Replace boxes that are already on the site (otherwise only empty ones are filled)</label>
          <div className="xs-actions">
            <button type="button" onClick={() => check(games, false)} disabled={Boolean(busy)}>Check again</button>
            {!res.applied && <button type="button" className="primary" onClick={() => check(games, true)} disabled={Boolean(busy) || !toDo}>Save {toDo} change{toDo === 1 ? '' : 's'}</button>}
            {res.applied && <span className="ok small">Saved. Shot maps, player boxes and briefings now use these boxes.</span>}
          </div>
        </>
      )}
    </div>
  );
}
