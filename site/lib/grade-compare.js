// Two grades side by side (e.g. U20 v Senior): every tagged team performance
// in each, averaged. Counts are per 10 minutes played (U20 games are shorter),
// rates are %.
//
// sides: [{ s, o, mins }] — s / o: byTeam entries from analyseMatch (the team
// and its opponent), mins: minutes played in the game.

const pct = (a, b) => (b ? (100 * a) / b : null);
const srcPts = (s, re) => (s.sources || []).filter((x) => re.test(x.source)).reduce((t, x) => t + x.points, 0);
const srcAll = (s) => (s.sources || []).reduce((t, x) => t + x.points, 0);
const koKnown = (s) => (s.kickouts ? s.kickouts.total - s.kickouts.unknown : 0);
const dist = (s, d) => {
  const list = (s.kickouts?.byDist || []).filter((x) => x.dist !== '—');
  const all = list.reduce((t, x) => t + x.total, 0);
  return all >= 5 ? pct(list.filter((x) => x.dist === d).reduce((t, x) => t + x.total, 0), all) : null;
};

export const COMPARE_METRICS = [
  { group: 'Scoring', label: 'Points', per10: true, v: (s) => s.total },
  { group: 'Scoring', label: 'Shots', per10: true, v: (s) => s.shots || null },
  { group: 'Scoring', label: 'Shot conversion', unit: '%', v: (s) => s.conv },
  { group: 'Scoring', label: 'Goals', per10: true, v: (s) => (s.shots ? s.shotsDetail.goals : null) },
  { group: 'Scoring', label: 'Two-pointers scored', per10: true, v: (s) => (s.shots ? s.shotsDetail.twoScored : null) },
  { group: 'Scoring', label: 'Wides', per10: true, v: (s) => (s.shots ? s.shotsDetail.wides : null) },
  { group: 'Scoring', label: 'Saved, blocked or short', per10: true, v: (s) => (s.shots ? s.shotsDetail.savedBlocked : null) },
  { group: 'Possession', label: 'Possessions', per10: true, v: (s) => s.possessions || null },
  { group: 'Possession', label: 'Possessions ending in a shot', unit: '%', v: (s) => (s.possessions ? pct(s.shots, s.possessions) : null) },
  { group: 'Possession', label: 'Possessions ending in a score', unit: '%', v: (s) => (s.possessions ? pct(s.scores, s.possessions) : null) },
  { group: 'Possession', label: 'Turnovers lost', per10: true, v: (s) => (s.turnoversWon || s.turnoversLost ? s.turnoversLost : null) },
  { group: 'Possession', label: 'Frees conceded', per10: true, v: (s) => s.fouls || null },
  { group: 'Kick-outs', label: 'Own kick-outs', per10: true, v: (s) => s.kickouts?.total || null },
  { group: 'Kick-outs', label: 'Own kick-outs kept', unit: '%', v: (s) => (koKnown(s) >= 5 ? s.kickouts.retPct : null) },
  { group: 'Kick-outs', label: 'Kick-outs to a break (not won clean)', unit: '%', v: (s) => (koKnown(s) >= 5 ? pct(s.kickouts.wonBreak + s.kickouts.lostBreak, koKnown(s)) : null) },
  { group: 'Kick-outs', label: 'Short kick-outs', unit: '%', v: (s) => dist(s, 'SKO') },
  { group: 'Kick-outs', label: 'Long kick-outs', unit: '%', v: (s) => dist(s, 'LKO') },
  { group: 'Where points come from', label: 'From frees', unit: '%', v: (s) => (srcAll(s) ? pct(srcPts(s, /^free|45|mark|penalty/i), srcAll(s)) : null) },
  { group: 'Where points come from', label: 'From turnovers', unit: '%', v: (s) => (srcAll(s) ? pct(srcPts(s, /turnover/i), srcAll(s)) : null) },
  { group: 'Where points come from', label: 'From own kick-outs', unit: '%', v: (s) => (srcAll(s) ? pct(srcPts(s, /^own kick/i), srcAll(s)) : null) },
  { group: 'Where points come from', label: 'From the other side’s kick-outs', unit: '%', v: (s) => (srcAll(s) ? pct(srcPts(s, /^opp kick/i), srcAll(s)) : null) },
];

export function compareGrades(groups) {
  // groups: { [grade]: sides[] } → rows with each grade's average and n.
  const keys = Object.keys(groups);
  const rows = COMPARE_METRICS.map((mt) => {
    const cells = {};
    for (const k of keys) {
      let sum = 0, n = 0;
      for (const x of groups[k]) {
        const v = mt.v(x.s, x.o);
        if (v == null || (mt.per10 && !x.mins)) continue;
        sum += mt.per10 ? (10 * v) / x.mins : v; n += 1;
      }
      cells[k] = n ? { v: Math.round((10 * sum) / n) / 10, n } : null;
    }
    // A clear gap: a quarter or more apart (counts), or 8 points of % or more.
    const [a, b] = keys.map((k) => cells[k]?.v);
    let gap = null;
    if (a != null && b != null) {
      gap = mt.unit === '%' ? Math.abs(a - b) >= 8 : Math.max(a, b) > 0 && Math.abs(a - b) / Math.max(a, b) >= 0.2;
    }
    return { ...mt, cells, gap };
  });
  return rows;
}

// Minutes played: the length of each half from its tags (extra time included).
export function minutesPlayed(events) {
  const byHalf = {};
  for (const e of events) {
    const m = Number(e.minute);
    if (!Number.isFinite(m)) continue;
    const h = String(e.half || '');
    byHalf[h] = Math.max(byHalf[h] || 0, m);
  }
  return Object.values(byHalf).reduce((t, x) => t + x, 0) || null;
}
