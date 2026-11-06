'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { saveBriefing, deleteBriefing, setBriefingGames } from '../actions';

function Save() {
  const { pending } = useFormStatus();
  return <button type="submit" className="primary" disabled={pending}>{pending ? 'Saving…' : 'Save briefing'}</button>;
}

// Proposed key messages from the numbers: tap to add one to the box.
function Suggestions({ list, box, busy }) {
  const [used, setUsed] = useState(() => new Set());
  if (busy) return <p className="muted small">Working out the numbers for the games you ticked…</p>;
  if (!list?.length) return <p className="muted small">No standout numbers to suggest from these games yet.</p>;
  const add = (t) => {
    const el = box.current;
    if (!el) return;
    el.value = el.value.trim() ? `${el.value.trimEnd()}\n${t}` : t;
    setUsed((u) => new Set([...u, t]));
  };
  return (
    <div className="brief-sugg">
      <div className="small"><b>Suggested from the numbers</b> <span className="muted">· tap to add, then edit the wording</span></div>
      {list.map((s) => (
        <button key={s.text} type="button" className={used.has(s.text) ? 'used' : ''} disabled={used.has(s.text)} onClick={() => add(s.text)} title={s.why}>
          <span>{used.has(s.text) ? '✓' : '+'}</span> {s.text} <small className="muted">({s.why})</small>
        </button>
      ))}
    </div>
  );
}

export default function Editor({ b, candidates, sections, suggestions = [] }) {
  const [state, action] = useFormState(saveBriefing.bind(null, b.id), null);
  const summaryBox = useRef(null);
  const router = useRouter();
  const [busy, startGames] = useTransition();
  const [gamesMsg, setGamesMsg] = useState('');
  // A game ticked or unticked: save the games now and refresh the page, so
  // the briefing and the suggestions are from exactly these games.
  const gamesChanged = (e) => {
    const ids = [...e.currentTarget.form.querySelectorAll('input[name="games"]:checked')].map((x) => Number(x.value));
    setGamesMsg('');
    startGames(async () => {
      const res = await setBriefingGames(b.id, ids);
      if (!res.ok) { setGamesMsg(res.error); return; }
      router.refresh();
    });
  };
  return (
    <form action={action} className="card brief-editor no-print">
      <div className="brief-ed-head">
        <label className="grow">Title<input name="title" defaultValue={b.title} /></label>
        <label className="tick"><input type="checkbox" name="published" defaultChecked={b.published} /> Published (everyone with a login can see it)</label>
      </div>
      <fieldset>
        <legend>Games in this briefing</legend>
        <div className="brief-games">
          {candidates.map((m) => (
            <label key={m.id} className="tick">
              <input type="checkbox" name="games" value={m.id} defaultChecked={b.game_ids?.includes(m.id)} onChange={gamesChanged} />
              {m.team1.name} v {m.team2.name} <span className="muted small">{new Date(m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: '2-digit' })} · {m.competitions?.name}</span>
            </label>
          ))}
        </div>
        <p className="muted small">{busy ? 'Updating the briefing for these games…' : gamesMsg ? <span className="check warn">{gamesMsg}</span> : 'Ticking a game updates the briefing and the suggested key messages straight away.'}</p>
      </fieldset>
      <fieldset>
        <legend>Notes and clips, section by section</legend>
        <div className="brief-notes">
          {sections.map(([k, t]) => (
            <div key={k} className="brief-note">
              <b>{t}</b>
              <textarea ref={k === 'summary' ? summaryBox : undefined} name={`note:${k}`} rows={k === 'summary' ? 5 : 3} defaultValue={b.notes?.[k] || ''} placeholder={k === 'summary' ? 'The 3–4 things the players need to know (one per line)' : 'Key points for this part (one per line)'} />
              {k === 'summary' && <Suggestions list={suggestions} box={summaryBox} busy={busy} />}
              {k !== 'summary' && <input name={`link:${k}`} defaultValue={b.links?.[k] || ''} placeholder="Nacsport Hub link for the clips (optional)" />}
            </div>
          ))}
        </div>
      </fieldset>
      <div className="brief-ed-foot">
        <Save />
        {state?.error && <span className="check warn small">{state.error}</span>}
        <button type="button" className="danger" onClick={() => { if (window.confirm('Delete this briefing?')) deleteBriefing(b.id); }}>Delete</button>
      </div>
    </form>
  );
}
