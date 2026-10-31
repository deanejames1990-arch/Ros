// Season table: opposition players who did the damage against Roscommon,
// added up across games (scores, frees won, turnovers won, our kick-outs won).
// rows: [{ who, team, teamId, games, pts, goals, scores, shots, freesWon, toWon, koWon, hurt }]
export default function HurtUs({ rows, title, showTeam = false, links = {}, note }) {
  if (!rows.length) return null;
  return (
    <>
      <h2>{title}</h2>
      <div className="card">
        <div className="wrap">
          <table className="danger season">
            <thead>
              <tr>
                <th />{showTeam && <th>Team</th>}<th>Games</th><th>Score</th><th>Shots</th><th>Frees won</th><th>T/O won</th><th>Our KOs won</th><th title="Scores + frees won + turnovers won + kick-outs won">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 25).map((r) => {
                const id = links[`${r.teamId}:${r.who.toLowerCase()}`];
                return (
                  <tr key={`${r.teamId}-${r.who}`} style={{ '--tc': '#c4572a' }}>
                    <td>{id ? <a href={`/player/${id}`}>{r.who}</a> : r.who}</td>
                    {showTeam && <td className="muted">{r.team}</td>}
                    <td className="num">{r.games}</td>
                    <td className="num"><b>{r.pts ? `${r.goals}-${r.pts - 3 * r.goals}` : '–'}</b></td>
                    <td className="num">{r.shots ? `${r.scores}/${r.shots}` : '–'}</td>
                    <td className="num">{r.freesWon || '–'}</td>
                    <td className="num">{r.toWon || '–'}</td>
                    <td className="num">{r.koWon || '–'}</td>
                    <td className="num"><b>{r.hurt}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">{note} Frees won, turnovers won and kick-outs won only count where the tagging names who won them.</p>
      </div>
    </>
  );
}

// Adds up per-game danger rows (from trends().danger) by team and name.
export function addUpHurt(perGame) {
  const m = new Map();
  for (const { rows, teamId, team } of perGame) {
    for (const r of rows) {
      const k = `${teamId}:${r.who.toLowerCase()}`;
      const o = m.get(k) || { who: r.who, team, teamId, games: 0, pts: 0, goals: 0, scores: 0, shots: 0, freesWon: 0, toWon: 0, koWon: 0, hurt: 0 };
      o.games += 1;
      for (const f of ['pts', 'goals', 'scores', 'shots', 'freesWon', 'toWon', 'koWon', 'hurt']) o[f] += r[f] || 0;
      m.set(k, o);
    }
  }
  return [...m.values()].sort((a, b) => b.hurt - a.hurt || b.pts - a.pts || a.who.localeCompare(b.who));
}
