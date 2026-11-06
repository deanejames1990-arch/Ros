import { db } from '../../lib/db';
import { currentRole } from '../../lib/session';
import { BRIEFING_SQL } from '../../lib/briefing';
import NewBriefing from './NewBriefing';
import { scoped, onlyOrgTeams, currentOrg, isOurTeam } from '../../lib/org';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Briefings · James Deane Analysis' };

export default async function Briefings() {
  const role = await currentRole();
  const org = await currentOrg();
  const admin = role === 'admin';
  const [{ data: list, error }, { data: teams }] = await Promise.all([
    scoped(db.from('briefings').select('id, title, team_id, game_ids, published, updated_at').order('updated_at', { ascending: false })),
    db.from('teams').select('id, name').order('name'),
  ]);
  const missing = error && /does not exist|could not find|schema cache/i.test(error.message);
  const name = (id) => (teams || []).find((t) => t.id === id)?.name || '';
  const shown = (list || []).filter((b) => admin || b.published);
  return (
    <>
      <h1>Opposition briefings</h1>
      <p className="muted">Everything on an opposition from their last few games: team lists, scorers and where they shoot from, kick-outs, the game picture, with the key messages and Nacsport Hub clips for each part.</p>
      {missing ? (
        admin ? (
          <div className="card">
            <h2>One-off setup</h2>
            <p>In Supabase, open <b>SQL Editor → New query</b>, paste this in and press <b>Run</b>. Then reload this page.</p>
            <pre className="sql">{BRIEFING_SQL}</pre>
          </div>
        ) : <p className="card muted">No briefings yet.</p>
      ) : (
        <>
          {admin && <NewBriefing teams={(await onlyOrgTeams(teams)).filter((t) => !isOurTeam(org, t.name))} />}
          {shown.length === 0 && <p className="card muted">No briefings yet.</p>}
          <div className="game-strip">
            {shown.map((b) => (
              <a key={b.id} href={`/briefing/${b.id}`} className="card game">
                <span className={`badge ${b.published ? 'W' : 'N'}`}>{b.published ? '✓' : '…'}</span>
                <span className="game-main"><b>{b.title}</b><span className="muted small">{name(b.team_id)} · {b.game_ids?.length || 0} games</span></span>
                <span className="muted small game-meta">{b.published ? 'Published' : 'Draft (admins only)'} · {new Date(b.updated_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}</span>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
