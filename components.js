export const score = (g, p) => `${g ?? 0}-${p ?? 0}`;

export function MatchCard({ m }) {
  return (
    <a className="card" href={`/match/${m.id}`}>
      <div className="muted">
        {m.competitions?.name} · {m.competitions?.seasons?.year}{m.stage ? ` · ${m.stage}` : ''}
      </div>
      <div>
        <b>{m.team1.name}</b> {score(m.team1_goals, m.team1_points)} — {score(m.team2_goals, m.team2_points)} <b>{m.team2.name}</b>
      </div>
      <div className="muted">{m.match_date}</div>
    </a>
  );
}
