import { db, MATCH_SELECT } from '../../../lib/db';
import { score } from '../../components';
import StartForm from './StartForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Live tagger · Roscommon GAA Stats' };

export default async function LivePage() {
  const [{ data: teams }, { data: comps }, { data: games }] = await Promise.all([
    db.from('teams').select('id,name').order('name'),
    db.from('competitions').select('id,name,grade,seasons(year)').order('id', { ascending: false }),
    db.from('matches').select(MATCH_SELECT).like('match_code', 'LIVE-%').order('match_date', { ascending: false }).limit(20),
  ]);
  const competitions = (comps || [])
    .map((c) => ({ id: c.id, name: c.name, grade: c.grade, year: c.seasons?.year }))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name));
  return (
    <>
      <h1>Live tagger</h1>
      <p className="muted">
        Tag a game as it happens on a phone or tablet: possessions, shots with where they were taken, kick-outs with the box they landed in.
        The quarter and half-time numbers are ready the moment you need them, and the game goes onto the site as you tag.
      </p>
      {games?.length > 0 && (
        <>
          <h2>Games tagged here</h2>
          <div className="live-list">
            {games.map((m) => (
              <a key={m.id} className="card game" href={`/admin/live/${m.id}`}>
                <span className="game-main"><b>{m.team1.name} v {m.team2.name}</b>
                  <span className="num">{score(m.team1_goals, m.team1_points)} – {score(m.team2_goals, m.team2_points)}</span></span>
                <span className="muted small">{m.competitions?.name} · {new Date(m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </a>
            ))}
          </div>
        </>
      )}
      <h2>Start a game</h2>
      <StartForm teams={(teams || []).map((t) => t.name)} competitions={competitions} today={new Date().toISOString().slice(0, 10)} />
    </>
  );
}
