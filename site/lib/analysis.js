// Match analysis built from the Nacsport events table.
// Pure functions: no database calls, so this can be tested with plain data.
//
// Conventions read from the tagging (Connacht SFC v Mayo, 2026):
//   Poss      team_id = team gaining possession, labels.PossFrom = how they got it
//   Shot (…)  team_id = shooting team, outcome = Point / Goal / Wide / …
//   Kickout   team_id = kicking team, outcome = "<Team> Clean" / "<Team> Break"
//   Turnover  team_id = team that LOST the ball, labels.PitchArea from their view
//   Foul      team_id = team that conceded the foul

export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
export const PERIODS = ['All', '1st Half', '2nd Half', ...QUARTERS];

const lbl = (e, k) => (e.labels && typeof e.labels === 'object' ? e.labels[k] : undefined);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

export const isShot = (e) => (e.event_type || '').toLowerCase().startsWith('shot');

// Points value of a shot: 3 for a goal, 2 for a two-pointer, 1 for a point, 0 otherwise.
export function shotValue(e) {
  const o = (e.outcome || '').toLowerCase().trim();
  const t = (e.event_type || '').toLowerCase();
  if (!o) return 0;
  if (o.includes('goal')) return 3;
  if (/\b2\s*(pt|point|pointer)s?\b|two[- ]?point/.test(o)) return 2;
  if (/\bpoint\b/.test(o)) return /\(\s*2/.test(t) || /2\s*p(t|oint)/.test(t) ? 2 : 1;
  return 0;
}

export function quarterOf(e) {
  const q = lbl(e, 'Quarter');
  if (q) return q;
  const m = Number(e.minute) || 0;
  const second = (e.half || '').startsWith('2');
  return second ? (m < 17.5 || m >= 35 && m < 52.5 ? 'Q3' : 'Q4') : (m < 17.5 ? 'Q1' : 'Q2');
}

// Box number from a "Box 5" style tag, as a string ('0'..'15'), or null.
export const zoneOf = (e) => {
  const z = lbl(e, 'Zone');
  const m = z && String(z).match(/(\d+)/);
  return m ? m[1] : null;
};

// Pitch third from the point of view of the team on the event. Files tag this as
// INSIDE/MID/DEF 45, own/middle/attacking third, or Opp/Middle/Own Third.
export const thirdOf = (e) => {
  const a = String(lbl(e, 'PitchArea') || '').toLowerCase();
  if (!a) return null;
  if (/inside|opp|attack/.test(a)) return 'Att';
  if (/mid/.test(a)) return 'Mid';
  if (/def|own/.test(a)) return 'Def';
  return null;
};
const MIRROR = { Att: 'Def', Mid: 'Mid', Def: 'Att' };

export const halfOf = (e) => e.half || lbl(e, 'Half') || (['Q3', 'Q4'].includes(quarterOf(e)) ? '2nd Half' : '1st Half');

function inPeriod(e, period) {
  if (!period || period === 'All') return true;
  if (period.startsWith('Q')) return quarterOf(e) === period;
  return halfOf(e) === period;
}

// Which team a kick-out outcome names ("Mayo Break" -> Mayo).
function winnerOf(outcome, teams) {
  const o = (outcome || '').toLowerCase();
  let best = null;
  for (const t of teams) {
    const n = t.name.toLowerCase();
    const first = n.split(/\s+/)[0];
    if (o.startsWith(n) || o.startsWith(first)) {
      if (!best || n.length > best.name.length) best = t;
    }
  }
  return best;
}
const ko = (outcome) => (/clean/i.test(outcome || '') ? 'Clean' : /break/i.test(outcome || '') ? 'Break' : 'Other');

// Game-clock minute from the start of the match. If the 2nd half restarts the
// clock at 0, shift it by the length of the 1st half.
function elapsedMinutes(events) {
  const firstMax = Math.max(0, ...events.filter((e) => halfOf(e).startsWith('1')).map((e) => Number(e.minute) || 0));
  const secondMin = Math.min(Infinity, ...events.filter((e) => halfOf(e).startsWith('2')).map((e) => Number(e.minute) || 0));
  const shift = secondMin < firstMax ? Math.max(35, Math.ceil(firstMax)) : 0;
  return (e) => (Number(e.minute) || 0) + (halfOf(e).startsWith('2') ? shift : 0);
}

const order = (a, b) =>
  (Number(a.start_sec ?? a.minute) || 0) - (Number(b.start_sec ?? b.minute) || 0) || (a.id || 0) - (b.id || 0);

export function analyseMatch({ events: raw = [], teams, match = null, period = 'All' }) {
  const all = [...raw].sort(order);
  const elapsed = elapsedMinutes(all);

  // Attribute every shot to the possession it came from, using the full game
  // so that filtering by quarter doesn't lose the possession before a shot.
  const lastPoss = {};
  const shotSource = new Map();
  for (const e of all) {
    if (e.event_type === 'Poss') lastPoss[e.team_id] = e;
    else if (isShot(e)) {
      // Prefer a source tagged on the shot itself; otherwise use the possession it came from.
      const poss = lastPoss[e.team_id];
      shotSource.set(e, lbl(e, 'Source') || (poss && lbl(poss, 'PossFrom')) || 'Not tagged');
    }
  }

  const events = all.filter((e) => inPeriod(e, period));
  // Some taggers only mark a two-pointer when it's scored, so a missed attempt
  // looks like any other wide. Attempts only count where a missed one is tagged.
  const twoTracked = all.some((e) => isShot(e) && lbl(e, 'Attempt') === '2 Point');
  const other = (tid) => teams.find((t) => t.id !== tid)?.id;

  const byTeam = {};
  for (const t of teams) {
    const mine = events.filter((e) => e.team_id === t.id);
    const shots = mine.filter(isShot).map((e) => ({ e, value: shotValue(e), source: shotSource.get(e) }));
    const scored = shots.filter((s) => s.value > 0);
    const poss = mine.filter((e) => e.event_type === 'Poss');
    const turnoversLost = mine.filter((e) => e.event_type === 'Turnover');
    const turnoversWon = events.filter((e) => e.team_id === other(t.id) && e.event_type === 'Turnover');
    const fouls = mine.filter((e) => e.event_type === 'Foul');
    const attacks = mine.filter((e) => e.event_type === 'Attack');

    // PSS by quarter
    const pss = QUARTERS.map((q) => {
      const inQ = (e) => quarterOf(e) === q;
      const qs = shots.filter((s) => inQ(s.e));
      return {
        q,
        poss: poss.filter(inQ).length,
        shots: qs.length,
        scores: qs.filter((s) => s.value > 0).length,
        points: qs.reduce((n, s) => n + s.value, 0),
      };
    });

    // Own kick-outs
    const kos = mine.filter((e) => e.event_type === 'Kickout').map((e) => {
      const w = winnerOf(e.outcome, teams);
      return { e, won: w ? w.id === t.id : null, how: ko(e.outcome), dist: lbl(e, 'KickoutDistance') || '—' };
    });
    const koSplit = {
      wonClean: kos.filter((k) => k.won === true && k.how === 'Clean').length,
      wonBreak: kos.filter((k) => k.won === true && k.how !== 'Clean').length,
      lostBreak: kos.filter((k) => k.won === false && k.how !== 'Clean').length,
      lostClean: kos.filter((k) => k.won === false && k.how === 'Clean').length,
      unknown: kos.filter((k) => k.won === null).length,
    };
    const dists = [...new Set(kos.map((k) => k.dist))].sort();
    const koByDist = dists.map((d) => {
      const ks = kos.filter((k) => k.dist === d);
      const won = ks.filter((k) => k.won).length;
      return { dist: d, total: ks.length, won, pct: pct(won, ks.length) };
    });

    // Source of scores
    const sources = {};
    for (const s of shots) {
      const r = (sources[s.source] ||= { source: s.source, shots: 0, scores: 0, points: 0 });
      r.shots += 1;
      if (s.value) { r.scores += 1; r.points += s.value; }
    }
    const sourceRows = Object.values(sources)
      .map((r) => ({ ...r, conv: pct(r.scores, r.shots) }))
      .sort((a, b) => b.points - a.points || b.shots - a.shots);

    // Shots by area and by outcome
    const tally = (list, key) => {
      const m = {};
      for (const s of list) {
        const k = key(s) || '—';
        const r = (m[k] ||= { key: k, shots: 0, scores: 0, points: 0 });
        r.shots += 1;
        if (s.value) { r.scores += 1; r.points += s.value; }
      }
      return Object.values(m).sort((a, b) => b.shots - a.shots);
    };
    const count = (list, key) => {
      const m = {};
      for (const e of list) m[key(e) || '—'] = (m[key(e) || '—'] || 0) + 1;
      return Object.entries(m).map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
    };

    // Shooters (by jersey number; names come from line-outs when loaded)
    const shooters = tally(shots, (s) => s.e.player_no).map((r) => ({
      ...r,
      wides: shots.filter((s) => (s.e.player_no || '—') === r.key && /wide/i.test(s.e.outcome || '')).length,
    }));

    const goals = scored.filter((s) => s.value === 3).length;
    const pointsTotal = scored.reduce((n, s) => n + s.value, 0);

    // What happened to the shots
    const isTwo = (s) => s.value === 2 || lbl(s.e, 'Attempt') === '2 Point' || /2\s*p(oin)?t/i.test(s.e.outcome || '');
    const shotsDetail = {
      singles: scored.filter((s) => s.value === 1).length,
      twoTried: twoTracked ? shots.filter(isTwo).length : 0,
      twoScoredTracked: twoTracked ? scored.filter((s) => s.value === 2).length : 0,
      twoTrackedGames: twoTracked ? 1 : 0,
      twoScored: scored.filter((s) => s.value === 2).length,
      goals,
      wides: shots.filter((s) => !s.value && /wide/i.test(s.e.outcome || '')).length,
      savedBlocked: shots.filter((s) => !s.value && !/wide/i.test(s.e.outcome || '')).length,
    };

    // Boxes: where shots were taken and where own kick-outs landed
    const shotBoxes = {};
    for (const s of shots) {
      const z = zoneOf(s.e);
      if (z == null) continue;
      const r = (shotBoxes[z] ||= { shots: 0, scored: 0 });
      r.shots += 1;
      if (s.value) r.scored += 1;
    }
    const koZones = {};
    for (const k of kos) {
      const z = zoneOf(k.e);
      if (z == null) continue;
      const r = (koZones[z] ||= { n: 0, won: 0 });
      r.n += 1;
      if (k.won) r.won += 1;
    }

    // Halves and quarters: points, shots, own kick-outs retained
    const periodRow = (key, test) => {
      const ps = shots.filter((s) => test(s.e));
      const ks = kos.filter((k) => test(k.e) && k.won !== null);
      return { key, points: ps.reduce((n, s) => n + s.value, 0), shots: ps.length, koWon: ks.filter((k) => k.won).length, koTotal: ks.length };
    };
    const quarters = QUARTERS.map((q) => periodRow(q, (e) => quarterOf(e) === q));
    const halves = ['1st Half', '2nd Half'].map((h, i) => periodRow(`H${i + 1}`, (e) => halfOf(e) === h));

    // Turnovers by third, in this team's frame
    const thirds = { conceded: { Def: 0, Mid: 0, Att: 0, none: 0 }, wonBack: { Def: 0, Mid: 0, Att: 0, none: 0 } };
    for (const e of turnoversLost) thirds.conceded[thirdOf(e) || 'none'] += 1;
    for (const e of turnoversWon) { const th = thirdOf(e); thirds.wonBack[th ? MIRROR[th] : 'none'] += 1; }

    byTeam[t.id] = {
      team: t,
      goals,
      points: pointsTotal - 3 * goals, // points column of the scoreline (two-pointers count as 2)
      total: pointsTotal,
      possessions: poss.length,
      attacks: attacks.length,
      shotsPerAttack: attacks.length ? Math.round((100 * shots.length) / attacks.length) : null,
      shots: shots.length,
      scores: scored.length,
      conv: pct(scored.length, shots.length),
      possToScore: pct(scored.length, poss.length),
      wides: shots.filter((s) => /wide/i.test(s.e.outcome || '')).length,
      turnoversWon: turnoversWon.length,
      turnoversLost: turnoversLost.length,
      fouls: fouls.length,
      pss,
      kickouts: { total: kos.length, ...koSplit, retained: koSplit.wonClean + koSplit.wonBreak, retPct: pct(koSplit.wonClean + koSplit.wonBreak, kos.length - koSplit.unknown), byDist: koByDist },
      sources: sourceRows,
      shotsByArea: tally(shots, (s) => lbl(s.e, 'PitchArea')),
      shotsByOutcome: count(shots.map((s) => s.e), (e) => e.outcome),
      possFrom: count(poss, (e) => lbl(e, 'PossFrom')),
      turnoversLostByArea: count(turnoversLost, (e) => lbl(e, 'PitchArea')),
      turnoversLostByType: count(turnoversLost, (e) => lbl(e, 'TurnoverType')),
      goalChances: shots.filter((s) => lbl(s.e, 'GoalChance')).length,
      kickoutSetups: count(kos.map((k) => k.e), (e) => lbl(e, 'Setup')),
      foulsByArea: count(fouls, (e) => lbl(e, 'PitchArea')),
      shooters,
      shotsDetail,
      ptsPerShot: shots.length ? pointsTotal / shots.length : null,
      shotBoxes,
      kickoutZones: koZones,
      quarters,
      halves,
      thirds,
    };
  }

  // ---- Players, from the names on the tags ------------------------------
  // A name belongs to the team it acted for: the shooting / possessing team,
  // the team that won a kick-out, the team that won a free.
  const playerRows = Object.fromEntries(teams.map((t) => [t.id, {}]));
  const prow = (tid, name) => {
    if (!tid || !playerRows[tid] || !name) return null;
    const key = name.trim();
    return (playerRows[tid][key.toLowerCase()] ||= {
      name: key, games: 1, shots: 0, scores: 0, points: 0, goals: 0, twoTried: 0, twoScored: 0, oneTried: 0, oneScored: 0,
      frees: 0, freesScored: 0, wides: 0, poss: 0, attacks: 0, koWon: 0, freesWon: 0, turnoversLost: 0, cards: 0,
      tackles: 0, assists: 0, winbacks: 0, boxes: {}, twoTrackedGames: twoTracked ? 1 : 0,
    });
  };
  const namesOf = (e) => {
    const list = String(lbl(e, 'Players') || '').split(',').map((x) => x.trim()).filter(Boolean);
    return list.length ? list : e.player_no ? [String(e.player_no)] : [];
  };
  for (const e of events) {
    const wonBy = String(lbl(e, 'WonBackBy') || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (e.event_type === 'Turnover' && wonBy.length) {
      for (const n of wonBy) { const r = prow(other(e.team_id), n); if (r) r.winbacks += 1; }
    }
    const names = namesOf(e);
    if (!names.length) continue;
    if (isShot(e)) {
      const r = prow(e.team_id, e.player_no || names[0]);
      if (!r) continue;
      const v = shotValue(e);
      const placed = /\((F|45|Mark)\)/.test(e.event_type || '');
      const two = v === 2 || lbl(e, 'Attempt') === '2 Point';
      r.shots += 1; r.points += v;
      if (v) r.scores += 1;
      if (v === 3) r.goals += 1;
      if (two) { if (twoTracked) r.twoTried += 1; if (v === 2) r.twoScored += 1; }
      // A one-point attempt: any shot that wasn't a two-point attempt and didn't end in a goal.
      else if (v !== 3) { r.oneTried += 1; if (v === 1) r.oneScored += 1; }
      if (placed) { r.frees += 1; if (v) r.freesScored += 1; }
      if (!v && /wide/i.test(e.outcome || '')) r.wides += 1;
      const z = zoneOf(e);
      if (z != null) r.boxes[z] = (r.boxes[z] || 0) + 1;
    } else if (e.event_type === 'Poss' || e.event_type === 'Attack') {
      for (const n of names) { const r = prow(e.team_id, n); if (r) r[e.event_type === 'Poss' ? 'poss' : 'attacks'] += 1; }
    } else if (e.event_type === 'Kickout') {
      const w = winnerOf(e.outcome, teams);
      if (w) for (const n of names) { const r = prow(w.id, n); if (r) r.koWon += 1; }
    } else if (e.event_type === 'Foul' && lbl(e, 'FreeWonBy')) {
      for (const n of names) { const r = prow(other(e.team_id), n); if (r) r.freesWon += 1; }
    } else if (e.event_type === 'Turnover') {
      for (const n of names) { const r = prow(e.team_id, n); if (r) r.turnoversLost += 1; }
    } else if (e.event_type === 'Tackle' || e.event_type === 'Assist') {
      for (const n of names) { const r = prow(e.team_id, n); if (r) r[e.event_type === 'Tackle' ? 'tackles' : 'assists'] += 1; }
    } else if (e.event_type === 'Card') {
      for (const n of names) { const r = prow(e.team_id, n); if (r) r.cards += 1; }
    }
  }
  for (const t of teams) byTeam[t.id].players = sortPlayers(Object.values(playerRows[t.id]));

  // Scoring flow: cumulative points for each team through the game (full game only).
  const flow = teams.map((t) => {
    let run = 0;
    const pts = [{ min: 0, total: 0 }];
    for (const e of all) {
      if (e.team_id !== t.id || !isShot(e)) continue;
      const v = shotValue(e);
      if (!v) continue;
      run += v;
      pts.push({ min: elapsed(e), total: run, value: v, player: e.player_no, outcome: e.outcome });
    }
    return { team: t, points: pts };
  });
  const endMin = Math.max(70, ...all.map(elapsed));
  const halfTime = Math.max(0, ...all.filter((e) => halfOf(e).startsWith('1')).map(elapsed));

  // Data check: does the tagged data reproduce the official scoreline?
  let check = null;
  if (match && period === 'All') {
    const full = byTeam;
    check = teams.map((t, i) => {
      const officialG = i === 0 ? match.team1_goals : match.team2_goals;
      const officialP = i === 0 ? match.team1_points : match.team2_points;
      const tg = full[t.id];
      return {
        team: t.name,
        tagged: `${tg.goals}-${tg.points}`,
        official: `${officialG ?? 0}-${officialP ?? 0}`,
        ok: (officialG ?? 0) * 3 + (officialP ?? 0) === tg.total,
      };
    });
  }

  const unknownTypes = [...new Set(all.map((e) => e.event_type))].filter(
    (t) => !['Poss', 'Kickout', 'Turnover', 'Foul', 'Attack', 'Throw In', 'Tackle', 'Assist', 'Card'].includes(t) && !(t || '').toLowerCase().startsWith('shot')
  );
  const has = (type) => all.some((e) => e.event_type === type);
  const hasLabel = (k) => all.some((e) => lbl(e, k));

  return {
    period, events, byTeam, flow, endMin, halfTime, elapsed, check, otherTypes: unknownTypes, total: all.length,
    has: { poss: has('Poss'), attack: has('Attack'), turnover: has('Turnover'), foul: has('Foul'), kickout: has('Kickout'),
      area: hasLabel('PitchArea'), turnoverType: hasLabel('TurnoverType'), setup: hasLabel('Setup'), goalChance: hasLabel('GoalChance') },
  };
}

export const sortPlayers = (list) =>
  list.sort((a, b) => b.points - a.points || b.shots - a.shots || b.poss - a.poss || (b.tackles + b.winbacks) - (a.tackles + a.winbacks) || b.koWon - a.koWon || a.name.localeCompare(b.name));

// Removes player names from events (competitions where names are hidden, e.g. underage).
export const withoutNames = (events) => events.map((e) => {
  const labels = { ...(e.labels || {}) };
  delete labels.Players; delete labels.WonBackBy;
  return { ...e, player_no: null, labels };
});

// ---- Combining games ------------------------------------------------------
// Sums one side's numbers across several games (a team page: "Armagh, 5 games")
// and recomputes the rates. Each item is a byTeam entry from analyseMatch.
const add = (a = 0, b = 0) => a + b;
export function combineSides(list) {
  const out = {
    games: list.length, total: 0, goals: 0, points: 0, shots: 0, scores: 0, possessions: 0, attacks: 0, wides: 0,
    turnoversWon: 0, turnoversLost: 0, fouls: 0,
    shotsDetail: { singles: 0, twoTried: 0, twoScored: 0, twoScoredTracked: 0, twoTrackedGames: 0, goals: 0, wides: 0, savedBlocked: 0 },
    kickouts: { total: 0, wonClean: 0, wonBreak: 0, lostBreak: 0, lostClean: 0, unknown: 0, retained: 0 },
    koDist: {}, shotBoxes: {}, kickoutZones: {},
    quarters: QUARTERS.map((q) => ({ key: q, points: 0, shots: 0, koWon: 0, koTotal: 0 })),
    halves: ['H1', 'H2'].map((h) => ({ key: h, points: 0, shots: 0, koWon: 0, koTotal: 0 })),
    thirds: { conceded: { Def: 0, Mid: 0, Att: 0, none: 0 }, wonBack: { Def: 0, Mid: 0, Att: 0, none: 0 } },
    sources: {},
    players: {},
  };
  for (const s of list) {
    for (const k of ['total', 'goals', 'points', 'shots', 'scores', 'possessions', 'attacks', 'wides', 'turnoversWon', 'turnoversLost', 'fouls']) out[k] += s[k] || 0;
    for (const k in out.shotsDetail) out.shotsDetail[k] += s.shotsDetail?.[k] || 0;
    for (const k in out.kickouts) out.kickouts[k] += s.kickouts?.[k] || 0;
    for (const d of s.kickouts?.byDist || []) {
      const r = (out.koDist[d.dist] ||= { dist: d.dist, total: 0, won: 0 });
      r.total += d.total; r.won += d.won;
    }
    for (const [z, r] of Object.entries(s.shotBoxes || {})) {
      const o = (out.shotBoxes[z] ||= { shots: 0, scored: 0 }); o.shots += r.shots; o.scored += r.scored;
    }
    for (const [z, r] of Object.entries(s.kickoutZones || {})) {
      const o = (out.kickoutZones[z] ||= { n: 0, won: 0 }); o.n += r.n; o.won += r.won;
    }
    for (const key of ['quarters', 'halves']) {
      (s[key] || []).forEach((r, i) => { for (const f of ['points', 'shots', 'koWon', 'koTotal']) out[key][i][f] = add(out[key][i][f], r[f]); });
    }
    for (const side of ['conceded', 'wonBack']) for (const k in out.thirds[side]) out.thirds[side][k] += s.thirds?.[side]?.[k] || 0;
    for (const pl of s.players || []) {
      const k = pl.name.toLowerCase();
      const o = out.players[k];
      if (!o) { out.players[k] = { ...pl, boxes: { ...pl.boxes } }; continue; }
      for (const f of ['games', 'shots', 'scores', 'points', 'goals', 'twoTried', 'twoScored', 'oneTried', 'oneScored', 'twoTrackedGames', 'frees', 'freesScored', 'wides', 'poss', 'attacks', 'koWon', 'freesWon', 'turnoversLost', 'cards', 'tackles', 'assists', 'winbacks']) o[f] += pl[f] || 0;
      for (const [z, n] of Object.entries(pl.boxes)) o.boxes[z] = (o.boxes[z] || 0) + n;
    }
    for (const r of s.sources || []) {
      const o = (out.sources[r.source] ||= { source: r.source, shots: 0, scores: 0, points: 0 });
      o.shots += r.shots; o.scores += r.scores; o.points += r.points;
    }
  }
  out.conv = pct(out.scores, out.shots);
  out.ptsPerShot = out.shots ? out.total / out.shots : null;
  const k = out.kickouts;
  k.retPct = pct(k.retained, k.total - k.unknown);
  k.byDist = Object.values(out.koDist).sort((a, b) => a.dist.localeCompare(b.dist)).map((d) => ({ ...d, pct: pct(d.won, d.total) }));
  out.players = sortPlayers(Object.values(out.players));
  out.sources = Object.values(out.sources).map((r) => ({ ...r, conv: pct(r.scores, r.shots) })).sort((a, b) => b.points - a.points);
  return out;
}

// League or championship, from the competition name (NFL, FBD, O'Byrne/McKenna Cup,
// "Division 1"… are league-type; everything else is championship).
export const compType = (name = '') =>
  /league|\bnfl\b|\bfbd\b|o'?\s?byrne|mckenna|\bdiv(ision)?\.?\s?\d|\bd\d\b/i.test(name) ? 'League' : 'Championship';
