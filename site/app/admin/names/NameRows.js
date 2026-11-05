'use client';

import { useState } from 'react';
import { setAlias } from './actions';

function Row({ teamId, r, listId }) {
  const [val, setVal] = useState(r.alias);
  const [saved, setSaved] = useState(r.alias);
  const [msg, setMsg] = useState('');
  const save = async (v = val) => {
    setMsg('Saving…');
    const res = await setAlias(teamId, r.name, v);
    if (res.ok) { setSaved(res.cleared ? '' : res.name); setVal(res.cleared ? '' : res.name); setMsg(res.cleared ? 'Cleared' : 'Saved'); }
    else setMsg(res.error);
  };
  return (
    <tr className={saved ? 'done' : r.short ? 'todo' : ''}>
      <td><b>{r.name}</b>{r.short && !saved && <span className="badge-off"> surname only</span>}<div className="muted small">{r.games} game{r.games === 1 ? '' : 's'}{r.points ? ` · ${r.points} pts` : ''} · {r.actions} tags</div></td>
      <td>
        <div className="alias-edit">
          <input list={listId} value={val} placeholder="Full name" onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
          <button type="button" onClick={() => save()} disabled={val === saved}>Save</button>
          {saved && <button type="button" className="linkish" onClick={() => save('')}>Clear</button>}
        </div>
        {!saved && r.suggest.length > 0 && (
          <div className="alias-sugg">
            {r.suggest.map((s) => <button key={s} type="button" onClick={() => save(s)}>Use {s}</button>)}
          </div>
        )}
        {msg && <span className="muted small">{msg}</span>}
      </td>
    </tr>
  );
}

export default function NameRows({ teamId, teamName, rows, squad }) {
  const listId = `names-${teamId}`;
  const left = rows.filter((r) => !r.alias && r.short).length;
  return (
    <div className="card">
      <p className="small"><b>{rows.length}</b> names in {teamName}’s tags · <b>{left}</b> look like a surname or initial only and need a full name. Those come first, then the rest by how often they’re used.</p>
      <datalist id={listId}>{squad.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="wrap">
        <table className="alias-table">
          <thead><tr><th>In the tags</th><th>Player’s full name</th></tr></thead>
          <tbody>{rows.map((r) => <Row key={r.name} teamId={teamId} r={r} listId={listId} />)}</tbody>
        </table>
      </div>
      <p className="muted small">Leave a name blank if it’s already right. Changes show on every dashboard, report and profile straight away.</p>
    </div>
  );
}
