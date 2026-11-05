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

// Quarter by quarter across games: averages per quarter, and (where the other
// side is known) how often the quarter was won. pairs: [{ mine, opp? }] with
// byTeam entries. Returns { quarters: [...], best, worst } or null.
export function quarterTrend(pairs) {
  const list = pairs.filter((p) => p.mine && (p.mine.shots > 0 || p.mine.possessions > 0));
  if (!list.length) return null;
  const n = list.length;
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => {
    const m = list.map((p) => p.mine.pss?.[i] || {});
    const o = list.map((p) => p.opp?.pss?.[i]).filter(Boolean);
    const avg = (arr, k) => arr.reduce((t, x) => t + (x[k] || 0), 0) / (arr.length || 1);
    const won = list.filter((p) => p.opp?.pss?.[i] && (p.mine.pss[i].points || 0) > (p.opp.pss[i].points || 0)).length;
    const lost = list.filter((p) => p.opp?.pss?.[i] && (p.mine.pss[i].points || 0) < (p.opp.pss[i].points || 0)).length;
    return {
      q, games: n, poss: avg(m, 'poss'), shots: avg(m, 'shots'), scores: avg(m, 'scores'), points: avg(m, 'points'),
      against: o.length ? avg(o, 'points') : null, won, lost, vs: o.length,
    };
  });
  // Best: the biggest winning margin a game where the other side is known,
  // otherwise the most points; ties go to more points, then more scores.
  const margin = (x) => (x.against == null ? 0 : x.points - x.against);
  const known = quarters.some((x) => x.against != null);
  const rank = (a, b) => (known ? margin(b) - margin(a) : 0) || b.points - a.points || b.scores - a.scores;
  const sorted = [...quarters].sort(rank);
  return { quarters, best: sorted[0], worst: sorted[sorted.length - 1], games: n };
}
