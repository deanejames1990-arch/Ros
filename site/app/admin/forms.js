'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateGame, deleteGame, updateCompetition, mergeCompetition, renameTeam, mergeTeam, deleteTeam } from './actions';

function Submit({ children, danger }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={danger ? 'danger' : undefined}>{pending ? 'Working…' : children}</button>;
}
const Result = ({ s }) => (s?.error ? <p className="check warn small">{s.error}</p> : s?.ok ? <p className="check ok small">{s.ok}</p> : null);

export function GameForm({ g, competitions, teams }) {
  const [s, action] = useFormState(updateGame, null);
  return (
    <form action={action} className="card admin-form">
      <h3>Game details</h3>
      <input type="hidden" name="id" value={g.id} />
      <input type="hidden" name="old_team1" value={g.team1_id} />
      <input type="hidden" name="old_team2" value={g.team2_id} />
      <datalist id="teamlist">{teams.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="fields">
        <label>Date<input type="date" name="date" defaultValue={g.match_date} required /></label>
        <label>
          Competition
          <select name="competition" defaultValue={g.competition_id}>
            {competitions.map((c) => <option key={c.id} value={c.id}>{c.year} · {c.name} ({c.grade || 'Senior'})</option>)}
          </select>
        </label>
        <label>Stage / round<input name="stage" defaultValue={g.stage || ''} /></label>
      </div>
      <div className="scores">
        {[['1', g.team1, g.team1_goals, g.team1_points], ['2', g.team2, g.team2_goals, g.team2_points]].map(([n, name, gl, pt]) => (
          <div key={n} className="score-row">
            <input name={`team${n}`} list="teamlist" defaultValue={name} aria-label={`Team ${n}`} required />
            <input type="number" min="0" name={`g${n}`} defaultValue={gl ?? 0} aria-label="Goals" />
            <span>–</span>
            <input type="number" min="0" name={`p${n}`} defaultValue={pt ?? 0} aria-label="Points" />
            <span />
          </div>
        ))}
      </div>
      <p className="muted small">Changing a team here moves that side’s tagged events with it.</p>
      <Result s={s} />
      <Submit>Save changes</Submit>
    </form>
  );
}

export function DeleteGame({ id, label }) {
  const [s, action] = useFormState(deleteGame, null);
  return (
    <form action={action} className="card admin-form danger-zone">
      <h3>Delete this game</h3>
      <p className="small">Removes {label} and all its tagged events for good. This can’t be undone.</p>
      <input type="hidden" name="id" value={id} />
      <label className="small">Type <b>DELETE</b> to confirm <input name="confirm" autoComplete="off" /></label>
      <Result s={s} />
      <Submit danger>Delete game</Submit>
    </form>
  );
}

export function CompetitionForm({ c, others, games }) {
  const [s, action] = useFormState(updateCompetition, null);
  const [m, merge] = useFormState(mergeCompetition, null);
  return (
    <div className="card admin-form">
      <form action={action}>
        <input type="hidden" name="id" value={c.id} />
        <div className="comp-row">
          <span className="muted small">{c.year} · {games} game{games === 1 ? '' : 's'}</span>
          <input name="name" defaultValue={c.name} aria-label="Competition name" required />
          <select name="grade" defaultValue={c.grade || 'Senior'} aria-label="Grade">
            {['Senior', 'U20', 'Minor', 'Junior', 'U21', 'Club'].map((x) => <option key={x}>{x}</option>)}
          </select>
          <label className="small check-row"><input type="checkbox" name="show_names" defaultChecked={c.show_player_names !== false} /> Show names</label>
          <Submit>Save</Submit>
        </div>
        <Result s={s} />
      </form>
      {others.length > 0 && (
        <details className="merge">
          <summary className="small">Merge into another competition…</summary>
          <form action={merge} className="comp-row">
            <input type="hidden" name="id" value={c.id} />
            <select name="into" aria-label="Merge into">
              {others.map((o) => <option key={o.id} value={o.id}>{o.year} · {o.name} ({o.grade || 'Senior'})</option>)}
            </select>
            <Submit danger>Move {games} game{games === 1 ? '' : 's'} and remove this one</Submit>
          </form>
          <Result s={m} />
        </details>
      )}
    </div>
  );
}

// One team: rename it, or merge it into another (e.g. "York" into "New York").
export function TeamForm({ t, others, games, suspect }) {
  const [rs, rename] = useFormState(renameTeam, null);
  const [ms, merge] = useFormState(mergeTeam, null);
  const [ds, del] = useFormState(deleteTeam, null);
  return (
    <div className={`team-tool ${suspect ? 'suspect' : ''}`}>
      <div><b>{t.name}</b> <span className="muted small">{games} game{games === 1 ? '' : 's'}</span>
        {suspect && <span className="badge-off"> looks like {suspect}</span>}</div>
      <form action={rename} className="inline">
        <input type="hidden" name="id" value={t.id} />
        <input name="name" defaultValue={t.name} aria-label={`Rename ${t.name}`} />
        <button type="submit">Rename</button>
      </form>
      <form action={merge} className="inline" onSubmit={(e) => { const into = e.currentTarget.into.selectedOptions[0]?.text; if (!window.confirm(`Move all of ${t.name}’s games into ${into} and remove ${t.name}?`)) e.preventDefault(); }}>
        <input type="hidden" name="id" value={t.id} />
        <select name="into" defaultValue={suspect ? others.find((o) => o.name === suspect)?.id : ''} aria-label={`Merge ${t.name} into`}>
          <option value="">Merge into…</option>
          {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <button type="submit" className="danger">Merge</button>
      </form>
      {games === 0 && (
        <form action={del} className="inline" onSubmit={(e) => { if (!window.confirm(`Delete ${t.name}? It has no games.`)) e.preventDefault(); }}>
          <input type="hidden" name="id" value={t.id} />
          <button type="submit" className="danger">Delete (no games)</button>
        </form>
      )}
      {(rs?.error || ms?.error || ds?.error) && <p className="check warn small">{rs?.error || ms?.error || ds?.error}</p>}
    </div>
  );
}
