// Possessions – shots – scores, summed over games for one side.
// sides: byTeam entries from analyseMatch (one per game).
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
export function pssSummary(sides) {
  const list = sides.filter((s) => s && (s.possessions > 0 || s.shots > 0));
  const n = list.length;
  if (!n) return null;
  const sum = (k) => list.reduce((t, s) => t + (s[k] || 0), 0);
  const poss = sum('possessions'), shots = sum('shots'), scores = sum('scores'), points = sum('total');
  const withPoss = list.filter((s) => s.possessions > 0);
  return {
    games: n, poss, shots, scores, points, hasPoss: withPoss.length > 0,
    perGame: { poss: poss / n, shots: shots / n, scores: scores / n, points: points / n },
    // An average quarter, over games that have possessions.
    quarter: withPoss.length ? {
      poss: withPoss.reduce((t, s) => t + s.possessions, 0) / (4 * withPoss.length),
      shots: withPoss.reduce((t, s) => t + s.shots, 0) / (4 * withPoss.length),
      scores: withPoss.reduce((t, s) => t + s.scores, 0) / (4 * withPoss.length),
    } : null,
    quarters: withPoss.flatMap((s) => s.pss || []),
    possToShot: pct(shots, poss), shotToScore: pct(scores, shots), possToScore: pct(scores, poss),
  };
}
