// What winning teams do: across every tagged game (Roscommon's and scouted),
// the winner and loser compared stat by stat. For each stat, how often the
// team ahead on it won the game, the winners' and losers' averages, and
// Roscommon's own average.
//
// games: [{ a, b, pa, pb, ros }] — a / b: byTeam entries from analyseMatch;
// pa / pb: points totals; ros: 'a' | 'b' | null (which side is Roscommon).

const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const koWonAll = (s, o) => (s.kickouts.total + o.kickouts.total ? s.kickouts.retained + (o.kickouts.total - o.kickouts.retained - o.kickouts.unknown) : null);
const srcPts = (s, re) => (s.sources || []).filter((x) => re.test(x.source)).reduce((t, x) => t + x.points, 0);

export const WIN_METRICS = [
  { key: 'ko', label: 'Kick-outs won (both teams’ kick-outs)', short: 'won more kick-outs', v: koWonAll },
  { key: 'koOwn', label: 'Own kick-outs kept %', short: 'kept more of their own kick-outs', v: (s) => s.kickouts.retPct, unit: '%' },
  { key: 'poss', label: 'Possessions', short: 'had more possessions', v: (s) => s.possessions || null },
  { key: 'shots', label: 'Shots', short: 'had more shots', v: (s) => s.shots || null },
  { key: 'conv', label: 'Shot conversion %', short: 'converted a higher % of shots', v: (s) => s.conv, unit: '%' },
  { key: 'p2s', label: 'Possessions ending in a score %', short: 'turned more possessions into scores', v: (s) => (s.possessions ? pct(s.scores, s.possessions) : null), unit: '%' },
  { key: 'toWon', label: 'Turnovers won', short: 'won more turnovers', v: (s) => (s.turnoversWon || s.turnoversLost ? s.turnoversWon : null) },
  { key: 'toPts', label: 'Points from turnovers', short: 'scored more off turnovers', v: (s) => ((s.sources || []).length ? srcPts(s, /turnover/i) : null) },
  { key: 'toLost', label: 'Turnovers lost', short: 'lost the ball fewer times', v: (s) => (s.turnoversWon || s.turnoversLost ? s.turnoversLost : null), low: true },
  { key: 'wides', label: 'Wides', short: 'kicked fewer wides', v: (s) => (s.shots ? s.shotsDetail.wides : null), low: true },
  { key: 'fouls', label: 'Frees conceded', short: 'gave away fewer frees', v: (s) => (s.fouls || null), low: true },
  { key: 'two', label: 'Two-pointers tried', short: 'tried more two-pointers', v: (s) => (s.shots ? s.shotsDetail.twoTried : null) },
  { key: 'h1', label: 'Won the first half', short: 'won the first half', v: (s, o) => (s.halves?.[0] && o.halves?.[0] ? s.halves[0].points - o.halves[0].points : null), side: true },
  { key: 'q4', label: 'Won the last quarter', short: 'won the last quarter', v: (s, o) => (s.quarters?.[3] && o.quarters?.[3] ? s.quarters[3].points - o.quarters[3].points : null), side: true },
];

export function winningTrends(games) {
  const decided = games.filter((g) => g.a && g.b && g.pa !== g.pb);
  const rows = WIN_METRICS.map((mt) => {
    let ahead = 0, n = 0, wSum = 0, lSum = 0, both = 0;
    let rSum = 0, rN = 0;
    for (const g of decided) {
      const [w, l] = g.pa > g.pb ? [g.a, g.b] : [g.b, g.a];
      const vw = mt.v(w, l), vl = mt.v(l, w);
      if (vw == null || vl == null) continue;
      both += 1; wSum += vw; lSum += vl;
      // "side" stats are a margin (won the half / quarter): ahead = margin > 0.
      const d = mt.side ? vw : vw - vl;
      if (d === 0) continue;
      n += 1;
      if (mt.low ? d < 0 : d > 0) ahead += 1;
    }
    for (const g of games) {
      if (!g.ros || !g.a || !g.b) continue;
      const [s, o] = g.ros === 'a' ? [g.a, g.b] : [g.b, g.a];
      const v = mt.v(s, o);
      if (v == null) continue;
      rSum += mt.side ? (v > 0 ? 1 : 0) : v; rN += 1;
    }
    const avg = (x, k) => (k ? Math.round((10 * x) / k) / 10 : null);
    return {
      ...mt, games: n, both, winPct: pct(ahead, n),
      winners: mt.side ? null : avg(wSum, both), losers: mt.side ? null : avg(lSum, both),
      ros: mt.side ? (rN ? pct(rSum, rN) : null) : avg(rSum, rN), rosGames: rN,
    };
  }).filter((r) => r.games >= 3 && r.winPct != null);
  rows.sort((x, y) => y.winPct - x.winPct || y.games - x.games);
  return { rows, games: decided.length };
}
