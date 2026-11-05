// Proposed key messages for an opposition briefing, worked out from the same
// games. Rules over the numbers, not guesses: each one only fires when the
// figure stands out, and says what it's based on. Written from Roscommon's
// side ("their", "we"), one line each, ready to drop into Key messages.

const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const one = (x) => Math.round(x * 10) / 10;
const sc = (g, p) => `${g}-${p - 3 * g}`;
const surname = (n) => String(n).trim().split(/\s+/).slice(-1)[0];

export function suggestKeyMessages(d, quarterTrendFn) {
  const { tagged, mine, opp } = d || {};
  const n = tagged?.length || 0;
  if (!n || !mine) return [];
  const out = [];
  const add = (score, text, why) => out.push({ score, text, why });
  const games = `${n} game${n === 1 ? '' : 's'}`;

  // Who scores their points.
  const scorers = (mine.players || []).filter((p) => p.points > 0 && !/^#\d+$/.test(p.name)).sort((a, b) => b.points - a.points);
  const total = mine.total || 0;
  if (scorers.length >= 2 && total) {
    const [a, b] = scorers;
    const two = pct(a.points + b.points, total);
    const first = pct(a.points, total);
    if (first >= 35) add(first + 10, `${a.name} scores ${first}% of their points (${sc(a.goals, a.points)} in ${a.games || 1}): our tightest marker on him`, `${a.name} ${a.points} of ${total} points`);
    else if (two >= 45) add(two, `${surname(a.name)} and ${surname(b.name)} score ${two}% of their points: tight marking on both`, `${a.points} + ${b.points} of ${total} points`);
  }

  // Free-taker.
  const taker = (mine.players || []).filter((p) => (p.frees || 0) >= 3).sort((a, b) => b.frees - a.frees)[0];
  if (taker) {
    const c = pct(taker.freesScored, taker.frees);
    if (c >= 70) add(55 + c / 5, `${taker.name} converts ${taker.freesScored} of ${taker.frees} frees: no fouls inside our 45`, `${c}% from frees`);
  }

  // Their own kick-outs.
  const ko = mine.kickouts;
  if (ko?.total >= 6 && ko.retPct != null) {
    if (ko.retPct <= 55) add(100 - ko.retPct, `They keep only ${ko.retPct}% of their own kick-outs: push up and press`, `${ko.retained} of ${ko.total - ko.unknown}`);
    else if (ko.retPct >= 80) add(ko.retPct - 20, `They keep ${ko.retPct}% of their own kick-outs: we have to win more of them`, `${ko.retained} of ${ko.total - ko.unknown}`);
    const zones = Object.entries(mine.kickoutZones || {});
    const placed = zones.reduce((t, [, z]) => t + z.n, 0);
    const [box, top] = zones.sort((a, b) => b[1].n - a[1].n)[0] || [];
    if (placed >= 8 && top && pct(top.n, placed) >= 25) add(45 + pct(top.n, placed) / 2, `${pct(top.n, placed)}% of their kick-outs go to ${box === '0' ? 'the middle box' : `box ${box}`}: set up there`, `${top.n} of ${placed}, ${top.won} won`);
    const short = (ko.byDist || []).find((x) => x.dist === 'SKO');
    if (short && ko.total && pct(short.total, ko.total) >= 50) add(50, `${pct(short.total, ko.total)}% of their kick-outs go short: press the short options`, `${short.total} of ${ko.total} short`);
  }

  // The other team's kick-outs (ours, on the day).
  if (opp?.kickouts?.total >= 6 && opp.kickouts.retPct != null) {
    const w = 100 - opp.kickouts.retPct;
    if (w >= 45) add(w, `They win ${w}% of the other team’s kick-outs: our kick-out needs a clear plan`, `${opp.kickouts.total - opp.kickouts.retained - opp.kickouts.unknown} of ${opp.kickouts.total - opp.kickouts.unknown}`);
  }

  // Quarters.
  const trend = quarterTrendFn ? quarterTrendFn(tagged.map((r) => ({ mine: r.mine, opp: r.opp }))) : null;
  if (trend?.best && trend.best.against != null) {
    const m = one(trend.best.points - trend.best.against);
    if (m >= 2) add(40 + 5 * m, `They win ${trend.best.q} by ${m} points a game: match them in ${trend.best.q}`, `${one(trend.best.points)} v ${one(trend.best.against)} a game`);
  }
  if (trend?.worst && trend.worst.against != null && trend.worst.q !== trend.best?.q) {
    const m = one(trend.worst.against - trend.worst.points);
    if (m >= 2) add(35 + 5 * m, `${trend.worst.q} is their weak quarter (lose it by ${m} a game): go after it`, `${one(trend.worst.points)} v ${one(trend.worst.against)} a game`);
  }

  // Where their scores come from.
  const src = (mine.sources || []).filter((s) => s.points > 0);
  const srcTotal = src.reduce((t, s) => t + s.points, 0);
  const share = (re) => { const s = src.filter((x) => re.test(x.source)); return srcTotal ? pct(s.reduce((t, x) => t + x.points, 0), srcTotal) : 0; };
  const fromTo = share(/turnover/i), fromOwnKo = share(/own k/i), fromFree = share(/^free/i);
  if (fromTo >= 30) add(fromTo + 10, `${fromTo}% of their points come from turnovers: protect the ball`, 'share of their points by possession start');
  if (fromOwnKo >= 25) add(fromOwnKo + 10, `${fromOwnKo}% of their points start from their own kick-out: press it`, 'share of their points by possession start');
  if (fromFree >= 25) add(fromFree + 10, `${fromFree}% of their points start from frees: discipline in the tackle`, 'share of their points by possession start');

  // Turnovers won high up the pitch.
  const high = mine.thirds?.wonBack?.Att || 0;
  if (high / n >= 3) add(40 + 3 * (high / n), `They win ${one(high / n)} turnovers a game in their attacking third: move it quickly out of defence`, `${high} in ${games}`);

  // Two-pointers.
  const tt = mine.shotsDetail?.twoTried || 0;
  if (tt / n >= 3) add(40 + 3 * (tt / n), `They try ${one(tt / n)} two-pointers a game (${pct(mine.shotsDetail.twoScored, tt)}% in): close down outside the arc`, `${mine.shotsDetail.twoScored} of ${tt}`);

  // Shooting.
  if (mine.shots >= 20 && mine.conv != null && mine.conv <= 45) add(45, `They convert only ${mine.conv}% of their shots: make them shoot from distance`, `${mine.scores} of ${mine.shots}`);
  if (mine.shots >= 20 && mine.conv != null && mine.conv >= 65) add(50, `They convert ${mine.conv}% of their shots: close the shooter down early`, `${mine.scores} of ${mine.shots}`);

  const seen = new Set();
  return out.sort((a, b) => b.score - a.score).filter((x) => !seen.has(x.text) && seen.add(x.text)).slice(0, 8);
}
