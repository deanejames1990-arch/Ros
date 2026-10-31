'use client';

import { useState } from 'react';
import { mergePlayers } from '../../admin/sheet-actions';

// Admin: fold a duplicate spelling into the right player.
export default function MergePlayer({ player, candidates }) {
  const [into, setInto] = useState('');
  const [msg, setMsg] = useState('');
  if (!candidates.length) return null;
  const go = async () => {
    setMsg('Merging…');
    const res = await mergePlayers(player.id, into);
    if (res.ok) window.location.href = `/player/${into}`;
    else setMsg(res.error);
  };
  return (
    <details className="card no-print merge-player">
      <summary>Same player saved twice?</summary>
      <p className="small">Move all of <b>{player.name}</b>’s games onto another player and remove this one. Use it when a name was spelled two ways.</p>
      <div className="merge-row">
        <select value={into} onChange={(e) => setInto(e.target.value)}>
          <option value="">Merge into…</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" className="danger" disabled={!into || msg === 'Merging…'} onClick={go}>Merge</button>
      </div>
      {msg && <p className="small">{msg}</p>}
    </details>
  );
}
