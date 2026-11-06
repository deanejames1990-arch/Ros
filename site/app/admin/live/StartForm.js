'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { startLiveGame } from './actions';

function Go() {
  const { pending } = useFormStatus();
  return <button type="submit" className="primary" disabled={pending}>{pending ? 'Starting…' : 'Start tagging'}</button>;
}

export default function StartForm({ us = 'Roscommon', teams, competitions, today }) {
  const [state, action] = useFormState(startLiveGame, null);
  const [comp, setComp] = useState(competitions[0]?.id ? String(competitions[0].id) : '');
  const [grade, setGrade] = useState(competitions[0]?.grade || 'Senior');
  const picked = competitions.find((c) => String(c.id) === comp);
  const g = picked ? picked.grade : grade;
  return (
    <form action={action} className="card live-start">
      <datalist id="live-teams">{teams.map((t) => <option key={t} value={t} />)}</datalist>
      <label>Our team<input name="us" defaultValue={us} list="live-teams" required /></label>
      <label>Opposition<input name="them" list="live-teams" placeholder="e.g. Mayo" required /></label>
      <label>Home team
        <select name="home" defaultValue="us"><option value="us">Our team</option><option value="them">Opposition</option></select>
      </label>
      <label>Date<input type="date" name="date" defaultValue={today} required /></label>
      <label>Competition
        <select name="competition" value={comp} onChange={(e) => { setComp(e.target.value); const c = competitions.find((x) => String(x.id) === e.target.value); if (c) setGrade(c.grade); }}>
          {competitions.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.grade}, {c.year})</option>)}
          <option value="">New competition…</option>
        </select>
      </label>
      {!comp && (
        <>
          <label>New competition<input name="newCompetition" placeholder="e.g. Connacht U20 Football Championship" required /></label>
          <label>Grade
            <select name="grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
              {['Senior', 'U20', 'Minor', 'Junior', 'Club'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        </>
      )}
      <label>Round / stage<input name="stage" placeholder="optional" /></label>
      <label>Half length
        <select name="halfLen" key={g} defaultValue={g === 'Senior' ? '35' : '30'}>
          <option value="35">35 minutes</option><option value="30">30 minutes</option><option value="25">25 minutes</option>
        </select>
      </label>
      {state?.error && <p className="check warn small">{state.error}</p>}
      <Go />
    </form>
  );
}
