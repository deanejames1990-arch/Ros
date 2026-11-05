'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { saveBriefing, deleteBriefing } from '../actions';

function Save() {
  const { pending } = useFormStatus();
  return <button type="submit" className="primary" disabled={pending}>{pending ? 'Saving…' : 'Save briefing'}</button>;
}

export default function Editor({ b, candidates, sections }) {
  const [state, action] = useFormState(saveBriefing.bind(null, b.id), null);
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
              <input type="checkbox" name="games" value={m.id} defaultChecked={b.game_ids?.includes(m.id)} />
              {m.team1.name} v {m.team2.name} <span className="muted small">{new Date(m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: '2-digit' })} · {m.competitions?.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Notes and clips, section by section</legend>
        <div className="brief-notes">
          {sections.map(([k, t]) => (
            <div key={k} className="brief-note">
              <b>{t}</b>
              <textarea name={`note:${k}`} rows={k === 'summary' ? 5 : 3} defaultValue={b.notes?.[k] || ''} placeholder={k === 'summary' ? 'The 3–4 things the players need to know (one per line)' : 'Key points for this part (one per line)'} />
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
