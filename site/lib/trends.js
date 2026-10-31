// In-game trends: what has happened in the most recent spell of play, written
// as short call-outs a coach can act on. Pure function over events-table rows.
import { isShot, shotValue, zoneOf } from './analysis';

const lbl = (e, k) => e.labels?.[k];
const second = (e) => String(e.half || lbl(e, 'Half') || '').startsWith('2');
const sc = (pts, goals) => `${goals}-${String(pts - 3 * goals).padStart(2, '0')}`;
const SHORT = new Set(['2', '3', '4', '5', '6', '7']); // nearest the kicking goal
const LONG = new Set(['10', '11', '12', '13', '14', '15']);

export function trends({ events, teams, halfLen = 35, windowMin = 10, usId = null }) {
  const at = (e) => (Number(e.minute) || 0) + (second(e) ? halfLen : 0);
  const all = [...events].sort((a, b) => at(a) - at(b) || (a.start_sec || 0) - (b.start_sec || 0));
  const now = all.length ? at(all[all.length - 1]) : 0;
  const from = Math.max(0, now - windowMin);
  const recent = all.filter((e) => at(e) >= from);
  const name = (id) => teams.find((t) => t.id === id)?.name || '';
  const other = (id) => teams.find((t) => t.id !== id)?.id;
  const clock = (m) => `${Math.floor(m > halfLen ? m - halfLen : m)}′${m > halfLen ? ' 2H' : ''}`;
  const items = [];
  const add = (team, good, text, weight = 1) => items.push({ team, good, text, weight });
  const tone = (team, good) => (usId == null ? 'info' : (team === usId) === good ? 'good' : 'bad');

  // ---- Scores: the run and the window ------------------------------------
  const scores = all.filter((e) => isShot(e) && shotValue(e) > 0);
  if (scores.length) {
    const last = scores[scores.length - 1].team_id;
    let pts = 0, goals = 0, n = 0, since = null;
    for (let i = scores.length - 1; i >= 0 && scores[i].team_id === last; i -= 1) {
      pts += shotValue(scores[i]); goals += shotValue(scores[i]) === 3 ? 1 : 0; n += 1; since = at(scores[i]);
    }
    const prev = scores.length - n - 1 >= 0 ? at(scores[scores.length - n - 1]) : 0;
    if (n >= 3 || pts >= 4) add(last, true, `${name(last)} have scored ${sc(pts, goals)} without reply (since ${clock(prev || since)})`, 3);
    // How long since the other team scored
    const otherId = other(last);
    const lastOther = [...scores].reverse().find((e) => e.team_id === otherId);
    const gap = now - (lastOther ? at(lastOther) : 0);
    if (gap >= 8 && now >= 8) add(otherId, false, `${name(otherId)} haven’t scored for ${Math.round(gap)} minutes`, 2);
  }
  const win = teams.map((t) => {
    const mine = recent.filter((e) => e.team_id === t.id);
    const shots = mine.filter(isShot);
    const scored = shots.filter((e) => shotValue(e) > 0);
    const pts = scored.reduce((n, e) => n + shotValue(e), 0);
    const goals = scored.filter((e) => shotValue(e) === 3).length;
    return {
      id: t.id, shots: shots.length, scores: scored.length, pts, goals,
      wides: shots.filter((e) => /wide/i.test(e.outcome || '')).length,
      poss: mine.filter((e) => e.event_type === 'Poss').length,
      fouls: mine.filter((e) => e.event_type === 'Foul').length,
      ownThirdLost: mine.filter((e) => e.event_type === 'Turnover' && /own|def/i.test(lbl(e, 'PitchArea') || '')).length,
    };
  });

  // ---- Shooting --------------------------------------------------------------
  for (const w of win) {
    if (w.wides >= 3) add(w.id, false, `${name(w.id)}: ${w.wides} wides in the last ${windowMin} minutes`, 2);
    if (w.shots >= 4 && w.scores / w.shots <= 0.35) add(w.id, false, `${name(w.id)}: ${w.scores} scores from ${w.shots} shots in the last ${windowMin} minutes`, 2);
    if (w.shots >= 4 && w.scores / w.shots >= 0.75) add(w.id, true, `${name(w.id)} are converting: ${w.scores} from ${w.shots} shots in the last ${windowMin} minutes`, 1);
    const twos = all.filter((e) => e.team_id === w.id && isShot(e) && lbl(e, 'Attempt') === '2 Point');
    const twoIn = twos.filter((e) => shotValue(e) === 2).length;
    if (twos.length >= 3 && twoIn / twos.length <= 0.25) add(w.id, false, `${name(w.id)} 2-point attempts: ${twoIn} from ${twos.length} this game`, 1);
    if (twos.length >= 3 && twoIn / twos.length >= 0.6) add(w.id, true, `${name(w.id)} 2-point attempts: ${twoIn} from ${twos.length} this game`, 2);
  }

  // ---- Possession --------------------------------------------------------------
  const [w0, w1] = win;
  if (w0.poss + w1.poss >= 8) {
    const big = w0.poss >= w1.poss ? w0 : w1;
    const share = big.poss / (w0.poss + w1.poss);
    if (share >= 0.62) add(big.id, true, `${name(big.id)} have had ${big.poss} of the last ${w0.poss + w1.poss} possessions`, 2);
  }

  // ---- Kick-outs ----------------------------------------------------------------
  const kos = all.filter((e) => e.event_type === 'Kickout').map((e) => {
    const o = String(e.outcome || '').toLowerCase();
    const w = teams.filter((t) => o.startsWith(t.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
    return { e, kicker: e.team_id, won: w ? w.id === e.team_id : null, box: zoneOf(e), break: /break/.test(o) };
  }).filter((k) => k.won !== null);
  for (const t of teams) {
    const own = kos.filter((k) => k.kicker === t.id);
    const last = own.slice(-6);
    const won = last.filter((k) => k.won).length;
    if (last.length >= 4 && won / last.length <= 0.5) add(t.id, false, `${name(t.id)} have won ${won} of their last ${last.length} kick-outs`, 3);
    else if (last.length >= 4 && won === last.length) add(t.id, true, `${name(t.id)} have won all of their last ${last.length} kick-outs`, 1);
    // Short v long this game
    const s = own.filter((k) => SHORT.has(k.box)), l = own.filter((k) => LONG.has(k.box) || ['8', '0', '9'].includes(k.box));
    const rs = s.length ? s.filter((k) => k.won).length / s.length : null;
    const rl = l.length ? l.filter((k) => k.won).length / l.length : null;
    if (s.length >= 2 && l.length >= 2 && Math.abs(rs - rl) >= 0.3) {
      const better = rs > rl ? 'short' : 'long';
      add(t.id, true, `${name(t.id)} kick-outs: short (boxes 2–7) won ${s.filter((k) => k.won).length}/${s.length}, longer won ${l.filter((k) => k.won).length}/${l.length}. ${better === 'short' ? 'Short' : 'Long'} is working`, 2);
    }
    // Where they keep going
    const boxed = last.filter((k) => k.box != null);
    if (boxed.length >= 4) {
      const n = {};
      for (const k of boxed) n[k.box] = (n[k.box] || 0) + 1;
      const [box, cnt] = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
      if (cnt / boxed.length >= 0.5) {
        const there = boxed.filter((k) => k.box === box);
        const w = there.filter((k) => k.won).length;
        add(t.id, w / there.length >= 0.5, `${name(t.id)} kick-outs: ${cnt} of the last ${boxed.length} to box ${box} (won ${w})`, 2);
      }
    }
    // Breaks
    const breaks = own.filter((k) => k.break);
    if (breaks.length >= 4) {
      const lost = breaks.filter((k) => !k.won).length;
      if (lost / breaks.length >= 0.7) add(other(t.id), true, `${name(other(t.id))} winning the breaks on ${name(t.id)} kick-outs: ${lost} of ${breaks.length}`, 2);
    }
  }

  // ---- Hot shooter ----------------------------------------------------------------
  for (const t of teams) {
    const by = {};
    for (const e of all.filter((x) => x.team_id === t.id && isShot(x))) {
      const who = lbl(e, 'Players') || e.player_no;
      if (!who) continue;
      const r = (by[who] ||= { who, pts: 0, goals: 0, scores: 0, shots: 0, recent: 0, frees: 0 });
      const v = shotValue(e);
      r.shots += 1; r.pts += v; if (v) r.scores += 1; if (v === 3) r.goals += 1;
      if (v && /\((F|45|Mark)\)/.test(e.event_type || '')) r.frees += 1;
      if (v && at(e) >= from) r.recent += 1;
    }
    for (const r of Object.values(by)) {
      if (r.pts - (r.frees) >= 3 || r.recent >= 2) {
        add(t.id, true, `${name(t.id)} ${r.who}: ${sc(r.pts, r.goals)} from ${r.shots} shots${r.recent >= 2 ? `, ${r.recent} scores in the last ${windowMin} minutes` : ''}`, t.id === usId ? 1 : 3);
      }
    }
  }

  // ---- Discipline and turnovers ---------------------------------------------------------
  for (const w of win) {
    if (w.fouls >= 3) add(w.id, false, `${name(w.id)} have given away ${w.fouls} frees in the last ${windowMin} minutes`, 2);
    if (w.ownThirdLost >= 2) add(w.id, false, `${name(w.id)} have lost the ball ${w.ownThirdLost} times in their own third in the last ${windowMin} minutes`, 2);
  }

  // ---- Momentum: points per 5 minutes of each half ----------------------------------------
  const nb = Math.ceil(halfLen / 5);
  const blocks = [];
  for (const h of [1, 2]) {
    const inHalf = all.filter((e) => second(e) === (h === 2));
    if (!inHalf.length) continue;
    const lastB = Math.min(nb - 1, Math.floor((Number(inHalf[inHalf.length - 1].minute) || 0) / 5));
    for (let b = 0; b <= lastB; b += 1) {
      const inB = (e) => second(e) === (h === 2) && Math.min(nb - 1, Math.floor((Number(e.minute) || 0) / 5)) === b;
      blocks.push({ label: `${b * 5}′`, half: h, pts: teams.map((t) => scores.filter((e) => e.team_id === t.id && inB(e)).reduce((n, e) => n + shotValue(e), 0)) });
    }
  }

  items.sort((a, b) => b.weight - a.weight);
  return {
    now, nowLabel: clock(now), windowMin,
    window: win.map((w) => ({ ...w, line: sc(w.pts, w.goals) })),
    items: items.map((i) => ({ ...i, tone: tone(i.team, i.good), color: i.team })),
    blocks,
  };
}
