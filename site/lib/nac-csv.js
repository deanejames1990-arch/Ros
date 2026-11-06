// Nacsport CSV export: one row per action.
//   Event,Time,Period,Team Name,Name,Outcome,Player
// Time is the video time (hh:mm:ss), Period 1 / 2, Name the button, Outcome
// its descriptor, Player the player on it. Returns the same shape as
// parseNacsport so the import page treats it like any other file.
//
// How the buttons map:
//   Kickout          Team = kicking team; outcome from the kicker's side
//                    (Won clean / Break won / Break lost / Lost clean / Sideline ball);
//                    Player = who won it.
//   Shot from play   Shot (P);  Free/45 → Shot (F). Point / Goal / 2 Points / Wide / Short / Save/Block / Woodwork
//   Tackle           Ball Won → the other team's turnover, won back by Player; Contact → Tackle
//   Possession lost  Turnover by that team (outcome = how)
//   Attacks          Attack;    Free conceded → Foul by that team (outcome = third)
//   Score source     how the next shot by that team started
//   Substitution     Player = the player going off

function rowsOf(text) {
  const out = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim()));
}

const secs = (t) => {
  const p = String(t || '').trim().split(':').map(Number);
  if (p.some(Number.isNaN)) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null;
};
const norm = (s) => String(s || '').trim();
const low = (s) => norm(s).toLowerCase();

// The header row this export starts with.
export function isNacCsv(text) {
  const first = low(String(text).replace(/^﻿/, '').split(/\r?\n/)[0]);
  return /\btime\b/.test(first) && /team name/.test(first) && /\bname\b/.test(first) && /outcome/.test(first);
}

const SOURCE = {
  'opp kickout': 'Opp Kickout', 'opp ko': 'Opp Kickout',
  kickout: 'Own Kickout', 'own kickout': 'Own Kickout', 'own ko': 'Own Kickout',
  'turnover won': 'Turnover', turnover: 'Turnover',
  // The other team lost it: a turnover for this team.
  'possession lost': 'Turnover',
  'throw up': 'Throw Up', 'throw in': 'Throw Up',
  'shot short': 'Opp shot dropped short', 'free': 'Free', '45': '45', mark: 'Mark',
};

const SHOT_OUT = { point: 'Point', goal: 'Goal', '2 points': '2 Point', '2 point': '2 Point', wide: 'Wide', short: 'Short', 'save/block': 'Save/Block', woodwork: 'Woodwork' };

// "Allen_Gaels_2_-_15_v_1_-_12_Aughawillan" → the two teams in file order and the score.
function fromFileName(fileName) {
  const base = String(fileName || '').replace(/\.[a-z0-9_]+$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const m = base.match(/^(.*?)\s+(\d+)\s*-\s*(\d+)\s+(?:v|vs|v\.)\s+(\d+)\s*-\s*(\d+)\s+(.*)$/i);
  if (m) return { order: [m[1].trim(), m[6].trim()], score: [{ g: +m[2], p: +m[3] }, { g: +m[4], p: +m[5] }] };
  const v = base.match(/^(.*?)\s+(?:v|vs|v\.)\s+(.*)$/i);
  return v ? { order: [v[1].trim(), v[2].trim()], score: null } : { order: [], score: null };
}

export function parseNacCsv(text, { fileName = '' } = {}) {
  const rows = rowsOf(String(text).replace(/^﻿/, ''));
  if (rows.length < 2) throw new Error('This CSV has no rows.');
  const head = rows[0].map(low);
  const col = (n) => head.indexOf(n);
  const c = { time: col('time'), period: col('period'), team: col('team name'), name: col('name'), outcome: col('outcome'), player: col('player'), id: col('event') };
  if (c.time < 0 || c.team < 0 || c.name < 0) throw new Error('This CSV isn’t a Nacsport export (needs Time, Team Name and Name columns).');
  const data = rows.slice(1).map((r, i) => ({
    i, id: c.id >= 0 ? norm(r[c.id]) : String(i + 1), t: secs(r[c.time]), period: Number(r[c.period]) === 2 ? 2 : 1,
    team: norm(r[c.team]), name: low(r[c.name]), outcome: norm(r[c.outcome]), player: c.player >= 0 ? norm(r[c.player]) : '',
  })).filter((r) => r.t != null && r.team);

  // Sides: A is the team the file name puts first, else the first team in the file.
  const teams = [...new Set(data.map((r) => r.team))];
  if (teams.length !== 2) throw new Error(`Expected two teams in the Team Name column, found ${teams.length}: ${teams.join(', ')}.`);
  const fn = fromFileName(fileName);
  const same = (a, b) => low(a) === low(b);
  const aName = teams.find((t) => same(t, fn.order[0])) || teams.find((t) => !same(t, fn.order[1])) || teams[0];
  const names = { A: aName, B: teams.find((t) => t !== aName) };
  const sideOf = (team) => (team === names.A ? 'A' : 'B');
  const otherOf = (s) => (s === 'A' ? 'B' : 'A');

  // Which team's players are named (usually only the team doing the analysis).
  const namedSides = new Set(data.filter((r) => r.player && r.name !== 'kickout').map((r) => sideOf(r.team)));

  // Half starts: the first half from the video's start (or its first tag), the second from its first tag.
  const p1 = data.filter((r) => r.period === 1), p2 = data.filter((r) => r.period === 2);
  const start1 = p1.length && p1[0].t > 90 ? p1[0].t : 0;
  const start2 = p2.length ? Math.min(...p2.map((r) => r.t)) : null;
  const len1 = p1.length ? (Math.max(...p1.map((r) => r.t)) - start1) / 60 : 0;
  const qSplit = len1 && len1 <= 34 ? 15 : 17.5; // club games run 30-minute halves
  const warnings = [];

  const events = [];
  const unmapped = new Set();
  const pendingSource = { A: null, B: null };
  for (const r of data) {
    const side = sideOf(r.team);
    const minute = Math.max(0, Math.round(((r.t - (r.period === 2 ? start2 : start1)) / 60) * 10) / 10);
    const half = r.period === 2 ? '2nd Half' : '1st Half';
    const quarter = r.period === 2 ? (minute < qSplit ? 'Q3' : 'Q4') : (minute < qSplit ? 'Q1' : 'Q2');
    const ev = {
      side, event_type: null, outcome: null, half, minute, start_sec: r.t, end_sec: r.t,
      player_no: null, code: r.name, labels: { Half: half, Quarter: quarter }, nac_id: r.id,
    };
    const named = (p = r.player) => { if (p) { ev.player_no = p; ev.labels.Players = p; } };
    const o = low(r.outcome);

    if (r.name === 'kickout') {
      ev.event_type = 'Kickout';
      let winner = null, how = null;
      if (/^won clean/.test(o)) { winner = side; how = 'Clean'; }
      else if (/^break won/.test(o)) { winner = side; how = 'Break'; }
      else if (/^break lost/.test(o)) { winner = otherOf(side); how = 'Break'; }
      else if (/^lost clean/.test(o)) { winner = otherOf(side); how = 'Clean'; }
      else if (/sideline/.test(o)) { winner = otherOf(side); how = 'Sideline'; } // kicked over the sideline: their ball
      ev.outcome = winner ? `${names[winner]} ${how}` : null;
      // The player named is the one who won it; only credit them on the side whose players are named.
      if (r.player && winner && namedSides.has(winner)) named();
      if (!winner) warnings.push(`Kick-out at ${minute}′ (${half}) has no winner tagged.`);
    } else if (r.name === 'shot from play' || r.name === 'free/45' || r.name === 'free' || r.name === '45') {
      const placed = r.name !== 'shot from play';
      ev.event_type = placed ? 'Shot (F)' : 'Shot (P)';
      ev.outcome = SHOT_OUT[o] || r.outcome || 'No score';
      named();
      const src = pendingSource[side];
      pendingSource[side] = null;
      if (placed) ev.labels.Source = 'Free';
      else if (src) ev.labels.Source = src;
      // No score source: how the possession started (worked out on the site) stands.
      if (src && placed) ev.labels.RootSource = src;
    } else if (r.name === 'score source') {
      pendingSource[side] = SOURCE[o] || r.outcome || null;
      if (o === 'throw up' || o === 'throw in') {
        // The team that won the throw-in gets the first possession.
        events.push({ ...ev, event_type: 'Throw In', outcome: `${r.team} won`, code: 'Throw In' });
      }
      continue;
    } else if (r.name === 'tackle') {
      if (/ball won|won/.test(o)) {
        // Won the ball: the other team's turnover.
        ev.event_type = 'Turnover';
        ev.side = otherOf(side);
        if (r.player) ev.labels.WonBackBy = r.player;
      } else {
        ev.event_type = 'Tackle';
        named();
      }
    } else if (r.name === 'possession lost' || r.name === 'turnover') {
      ev.event_type = 'Turnover';
      if (r.outcome) ev.labels.TurnoverType = r.outcome;
      named();
    } else if (r.name === 'attacks' || r.name === 'attack') {
      ev.event_type = 'Attack';
      if (r.outcome) ev.outcome = r.outcome;
      named();
    } else if (r.name === 'free conceded' || r.name === 'foul') {
      ev.event_type = 'Foul';
      const third = /att/.test(o) ? 'Attacking Third' : /mid/.test(o) ? 'Middle Third' : /def|own/.test(o) ? 'Own Third' : null;
      if (third) ev.labels.PitchArea = third;
      named();
    } else if (r.name === 'substitution' || r.name === 'sub') {
      ev.event_type = 'Sub';
      if (r.player) ev.labels.Off = r.player;
    } else if (r.name === 'card') {
      ev.event_type = 'Card';
      ev.outcome = r.outcome || null;
      named();
    } else {
      unmapped.add(norm(rows[r.i + 1][c.name]));
      continue;
    }
    events.push(ev);
  }

  const tally = { A: { g: 0, p: 0 }, B: { g: 0, p: 0 } };
  for (const e of events) {
    if (!/^Shot/.test(e.event_type)) continue;
    if (e.outcome === 'Goal') tally[e.side].g += 1;
    else if (e.outcome === '2 Point') tally[e.side].p += 2;
    else if (e.outcome === 'Point') tally[e.side].p += 1;
  }
  const counts = {};
  for (const e of events) counts[e.event_type] = (counts[e.event_type] || 0) + 1;
  if (unmapped.size) warnings.push(`Skipped buttons it doesn’t know: ${[...unmapped].join(', ')}.`);
  if (namedSides.size === 1) warnings.push(`Only ${names[[...namedSides][0]]} players are named in this file.`);

  // Score in the file name ("Allen Gaels 2-15 v 1-12 Aughawillan"), as the full-time score.
  const finalScore = fn.score && fn.order.length === 2
    ? [{ team: fn.order[0], ...fn.score[0] }, { team: fn.order[1], ...fn.score[1] }]
      .map((x) => ({ ...x, team: teams.find((t) => same(t, x.team)) || x.team }))
    : null;

  return {
    template: 'CSV', sideNames: names, fps: 1, events, score: tally, counts, warnings, video: '', finalScore,
    guess: { code: String(fileName || '').replace(/\.[a-z0-9_]+$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim(), home: fn.order[0] ? (teams.find((t) => same(t, fn.order[0])) || fn.order[0]) : names.A, away: fn.order[1] ? (teams.find((t) => same(t, fn.order[1])) || fn.order[1]) : names.B },
  };
}
