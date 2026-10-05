import { db, MATCH_SELECT, hiddenPlayerIds } from '../lib/db';
import { MatchCard } from './components';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }) {
  const teamId = (searchParams.team || '').trim();

  let players = [];
  let teams = [];
  let matches = [];
  let selectedTeam = null;
  let problem = null;

  const env = `URL set: ${!!process.env.SUPABASE_URL}, key set: ${!!process.env.SUPABASE_SERVICE_KEY}`;

  try {
    // Get all teams for the dropdown
    const { data: ts, error: teamError } = await db
      .from('teams')
      .select('id,name')
      .order('name', { ascending: true });

    if (teamError) {
      problem = teamError.message;
    }

    teams = ts || [];

    // If a team has been selected
    if (teamId) {
      selectedTeam = teams.find((team) => String(team.id) === teamId);

      const { data, error } = await db
        .from('matches')
        .select(MATCH_SELECT)
        .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
        .order('match_date', { ascending: false })
        .limit(20);

      if (error) {
        problem = error.message;
      }

      matches = data || [];
    } else {
      // No team selected - show latest games
      const { data, error } = await db
        .from('matches')
        .select(MATCH_SELECT)
        .order('match_date', { ascending: false })
        .limit(20);

      if (error) {
        problem = error.message;
      }

      matches = data || [];
    }
  } catch (e) {
    problem = String(e.message || e);
  }

  return (
    <>
      <h1>The story behind every game, player, score.</h1>

      {/* TEAM DROPDOWN */}
      <form method="get">
        <select name="team" defaultValue={teamId}>
          <option value="">Select a team</option>

          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        <button type="submit">View Team</button>
      </form>

      {problem && (
        <div className="card">
          <b>Database error:</b> {problem}
          <br />
          <span className="muted">{env}</span>
        </div>
      )}

      {/* SELECTED TEAM */}
      {selectedTeam && (
        <h2>{selectedTeam.name}</h2>
      )}

      {/* MATCHES */}
      <h2>{selectedTeam ? 'Games' : 'Latest games'}</h2>

      {matches.length === 0 && (
        <p className="muted">No games found.</p>
      )}

      {matches.map((m) => (
        <MatchCard key={m.id} m={m} />
      ))}
    </>
  );
}
