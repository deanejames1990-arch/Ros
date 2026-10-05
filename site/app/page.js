import { db, MATCH_SELECT, hiddenPlayerIds } from '../lib/db';
import { MatchCard } from './components';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }) {
  const q = (searchParams.q || '').trim();
  let players = [];
  let matches = [];
  let problem = null;
  const env = `URL set: ${!!process.env.SUPABASE_URL}, key set: ${!!process.env.SUPABASE_SERVICE_KEY}`;

  try {
    if (q) {
      const { data: ps, error: e1 } = await db.from('players').select('id,name,club').ilike('name', `%${q}%`).limit(20);
      if (e1) problem = e1.message;
      const hidden = await hiddenPlayerIds((ps || []).map((p) => p.id));
      players = (ps || []).filter((p) => !hidden.has(p.id));
      const { data: ts, error: e2 } = await db.from('teams').select('id').ilike('name', `%${q}%`);
      if (e2) problem = e2.message;
      const ids = (ts || []).map((t) => t.id).join(',');
      if (ids) {
        const { data, error } = await db.from('matches').select(MATCH_SELECT)
          .or(`team1_id.in.(${ids}),team2_id.in.(${ids})`)
          .order('match_date', { ascending: false }).limit(20);
        if (error) problem = error.message;
        matches = data || [];
      }
    } else {
      const { data, error } = await db.from('matches').select(MATCH_SELECT)
        .order('match_date', { ascending: false }).limit(20);
      if (error) problem = error.message;
      matches = data || [];
    }
  } catch (e) {
    problem = String(e.message || e);
  }

  return (
    <>
      <h1>The story behind every game, player, score.</h1>
      <form>
        <input name="q" defaultValue={q} placeholder="Search a player or team" />
        <button>Search</button>
      </form>
      {problem && (
        <div className="card">
          <b>Database error:</b> {problem}
          <br /><span className="muted">{env}</span>
        </div>
      )}
      {q && <h2>Players</h2>}
      {q && players.length === 0 && <p className="muted">No players found.</p>}
      {players.map((p) => (
        <a key={p.id} className="card" href={`/player/${p.id}`}><b>{p.name}</b> <span className="muted">{p.club}</span></a>
      ))}
      <h2>{q ? 'Games' : 'Latest games'}</h2>
      {matches.length === 0 && <p className="muted">No games found.</p>}
      {matches.map((m) => <MatchCard key={m.id} m={m} />)}
    </>
  );
}
