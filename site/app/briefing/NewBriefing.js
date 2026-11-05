'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createBriefing } from './actions';

function Go() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Building…' : 'New briefing'}</button>;
}

export default function NewBriefing({ teams }) {
  const [state, action] = useFormState(createBriefing, null);
  return (
    <form action={action} className="card new-briefing">
      <label>Opposition
        <select name="team" required defaultValue="">
          <option value="" disabled>Pick a team…</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label>Title <input name="title" placeholder="e.g. Mayo, League Round 3" /></label>
      <Go />
      {state?.error && <p className="check warn small">{state.error}</p>}
      <p className="muted small">It starts from their last four games on the site; you can change which games are in it.</p>
    </form>
  );
}
