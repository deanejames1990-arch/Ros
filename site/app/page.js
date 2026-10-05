import { db, MATCH_SELECT, hiddenPlayerIds } from '../lib/db';
import { MatchCard } from './components';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }) {
  const q = (searchParams.q || '').trim();
  let players = [];
  let matches = [];

  if (q) {
    const { data: ps } = await db.from('players').select('id,name,club').ilike('name', `%${q}%`).limit(20);
    const hidden = await hiddenPlayerIds((ps || []).map((p) => p.id));
    players = (ps || []).filter((p) => !hidden.has(p.id));
    const { data: ts } = await db.from('teams').select('id').ilike('name', `%${q}%`);
    const ids = (ts || []).map((t) => t.id).join(',');
    if (ids) {
      const { data } = await db.from('matches').select(MATCH_SELECT)
        .or(`team1_id.in.(${ids}),team2_id.in.(${ids})`)
        .order('match_date', { ascending: false }).limit(20);
      matches = data || [];
    }
  } else {
    const { data } = await db.from('matches').select(MATCH_SELECT)
      .order('match_date', { ascending: false }).limit(20);
    matches = data || [];
  }

  return (
    <>
      <h1>The story behind every game, player, score.</h1>
      <form>
        <input name="q" defaultValue={q} placeholder="Search a player or team" />
        <button>Search</button>
      </form>
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
