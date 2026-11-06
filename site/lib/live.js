// Helpers for the live match-day tagger. Pure functions, shared by the tagger
// (in the browser) and the server action that saves its events.
//
// The tagger writes events in the same shape as the Nacsport import, so the
// match dashboard, team reports and player tables work on them unchanged:
//   Poss       team_id = team in possession
//   Shot…      team_id = shooting team; "Shot (F)" / "Shot (45)" / "Shot (Mark)" for placed balls
//   Kickout    team_id = kicking team; outcome "<Winner> Clean|Break"; labels.Zone "Box n"
//   Turnover   team_id = team that LOST the ball; PitchArea in their frame; WonBackBy
//   Foul       team_id = team that conceded the free
//   Card       team_id = player's team; outcome Yellow / Black / Red
//   Throw In   team_id = team that won the throw-in at the start of a half
//   Sub        team_id = team making it; labels Off / On (names or #n), OffJersey / OnJersey

export const LIVE_PREFIX = 'LIVE-';
export const isLiveCode = (code) => String(code || '').startsWith(LIVE_PREFIX);
// Finished live games carry "-F" on the end of their code.
export const isFinishedCode = (code) => isLiveCode(code) && String(code).endsWith('-F');
// Still being tagged: a live game, not finished, dated within about a day of now.
export const isLiveNow = (m) => isLiveCode(m.match_code) && !isFinishedCode(m.match_code)
  && Math.abs(Date.now() - new Date(m.match_date).getTime()) < 36 * 3600 * 1000;

// Half-pitch in metres: goal at the top centre (45, 0), 90 m wide.
export const PITCH = { w: 90, d: 50, goalX: 45, arc: 40 };
export const distToGoal = (x, y) => Math.hypot(x - PITCH.goalX, y);
export const outsideArc = (x, y) => distToGoal(x, y) > PITCH.arc;

export const quarterFor = (half, minute, halfLen) =>
  half === 2 ? (minute < halfLen / 2 ? 'Q3' : 'Q4') : (minute < halfLen / 2 ? 'Q1' : 'Q2');

// "1 Name" / "14. J Smith" lines -> { 1: 'Name', 14: 'J Smith' }
export function parseSheet(text) {
  const out = {};
  for (const line of String(text || '').split(/\n/)) {
    const m = line.trim().match(/^(\d{1,2})\s*[.\-:)]?\s*(.+)$/);
    if (m) out[Number(m[1])] = m[2].trim();
  }
  return out;
}

const THIRD = { Def: 'Own third', Mid: 'Middle third', Att: 'Attacking third' };
const MIRROR = { Def: 'Att', Mid: 'Mid', Att: 'Def' };

// Tagger event -> events table row. `teams` is [{id, name}, {id, name}].
export function toRow(ev, teams) {
  const other = teams.find((t) => t.id !== ev.team)?.id;
  const winner = teams.find((t) => t.id === (ev.won ? ev.team : other));
  const labels = { Half: ev.half === 2 ? '2nd Half' : '1st Half', Quarter: ev.quarter, Live: ev.lid };
  const row = {
    team_id: ev.team, event_type: '', outcome: null, minute: Math.round(ev.sec / 6) / 10,
    half: labels.Half, start_sec: (ev.half === 2 ? 3600 : 0) + Math.round(ev.sec), player_no: null, code: 'Live', labels,
  };
  const player = (p) => {
    if (!p) return;
    // Named from the team sheet, otherwise by jersey ("#14").
    labels.Players = p.name || `#${p.no}`;
    if (p.no) labels.Jersey = p.no;
  };
  switch (ev.kind) {
    case 'poss':
      row.event_type = 'Poss';
      if (ev.from) labels.PossFrom = ev.from;
      break;
    case 'shot': {
      row.event_type = { Free: 'Shot (F)', '45': 'Shot (45)', Mark: 'Shot (Mark)' }[ev.type] || 'Shot';
      row.outcome = ev.outcome;
      if (ev.x != null) {
        labels.ShotX = Math.round(ev.x * 10) / 10; labels.ShotY = Math.round(ev.y * 10) / 10;
        if (outsideArc(ev.x, ev.y) && ev.outcome !== 'Goal') labels.Attempt = '2 Point';
      }
      if (ev.outcome === '2 Point') labels.Attempt = '2 Point';
      if (ev.type && ev.type !== 'Play') labels.Source = ev.type;
      player(ev.player);
      break;
    }
    case 'ko':
      row.event_type = 'Kickout';
      row.outcome = `${winner?.name || ''} ${ev.how || 'Clean'}`.trim();
      if (ev.box != null) labels.Zone = `Box ${ev.box}`;
      player(ev.player); // who won it
      break;
    case 'to':
      // Tagged as "won by" ev.team, stored against the team that lost it.
      row.event_type = 'Turnover';
      row.team_id = other;
      if (ev.third) labels.PitchArea = THIRD[MIRROR[ev.third]];
      if (ev.player) labels.WonBackBy = ev.player.name || `#${ev.player.no}`;
      if (ev.player?.no) labels.Jersey = ev.player.no;
      break;
    case 'foul':
      row.event_type = 'Foul';
      if (ev.third) labels.PitchArea = THIRD[ev.third];
      // Who won the free (a player on the other team).
      if (ev.player) {
        labels.FreeWonBy = ev.player.name || `#${ev.player.no}`;
        labels.Players = labels.FreeWonBy;
        if (ev.player.no) labels.Jersey = ev.player.no;
      }
      break;
    case 'throw':
      row.event_type = 'Throw In';
      row.outcome = `${teams.find((t) => t.id === ev.team)?.name || ''} won`.trim();
      player(ev.player);
      break;
    case 'sub':
      row.event_type = 'Sub';
      if (ev.off) { labels.Off = ev.off.name || `#${ev.off.no}`; if (ev.off.no) labels.OffJersey = ev.off.no; }
      if (ev.on) { labels.On = ev.on.name || `#${ev.on.no}`; if (ev.on.no) labels.OnJersey = ev.on.no; }
      break;
    case 'card':
      row.event_type = 'Card';
      row.outcome = ev.outcome;
      player(ev.player);
      break;
    default:
      row.event_type = ev.kind;
  }
  return row;
}

// Back from a saved row to a tagger event (resuming on another device).
export function fromRow(r, teams) {
  const l = r.labels || {};
  const half = String(r.half || l.Half || '').startsWith('2') ? 2 : 1;
  const other = teams.find((t) => t.id !== r.team_id)?.id;
  const sec = Math.max(0, (Number(r.start_sec) || 0) - (half === 2 ? 3600 : 0));
  const named = (n) => (n && !String(n).startsWith('#') ? n : '');
  const player = l.Players ? { no: Number(l.Jersey) || null, name: named(l.Players) } : null;
  const ev = { lid: l.Live || `r${r.id}`, team: r.team_id, half, sec, quarter: l.Quarter || quarterFor(half, sec / 60, 35) };
  const third = (a) => (/attack/i.test(a || '') ? 'Att' : /mid/i.test(a || '') ? 'Mid' : /own/i.test(a || '') ? 'Def' : null);
  switch (r.event_type) {
    case 'Poss': return l.Auto ? null : { ...ev, kind: 'poss', from: l.PossFrom || null };
    case 'Kickout': {
      const winnerIsKicker = String(r.outcome || '').toLowerCase().startsWith(String(teams.find((t) => t.id === r.team_id)?.name || '?').toLowerCase());
      const box = l.Zone ? Number(String(l.Zone).replace(/\D/g, '')) : null;
      return { ...ev, kind: 'ko', won: winnerIsKicker, how: /break/i.test(r.outcome || '') ? 'Break' : 'Clean', box, player };
    }
    case 'Turnover': return { ...ev, team: other, kind: 'to', third: third(l.PitchArea) && { Def: 'Att', Mid: 'Mid', Att: 'Def' }[third(l.PitchArea)], player: l.WonBackBy ? { no: Number(l.Jersey) || Number(String(l.WonBackBy).replace('#', '')) || null, name: named(l.WonBackBy) } : null };
    case 'Foul': return { ...ev, kind: 'foul', third: third(l.PitchArea), player: l.FreeWonBy ? { no: Number(l.Jersey) || Number(String(l.FreeWonBy).replace('#', '')) || null, name: named(l.FreeWonBy) } : null };
    case 'Card': return { ...ev, kind: 'card', outcome: r.outcome, player };
    case 'Throw In': return { ...ev, kind: 'throw', player };
    case 'Sub': {
      const side = (n, no) => (n || no ? { no: Number(no) || Number(String(n || '').replace('#', '')) || null, name: named(n) } : null);
      return { ...ev, kind: 'sub', off: side(l.Off, l.OffJersey), on: side(l.On, l.OnJersey) };
    }
    default:
      if (/^shot/i.test(r.event_type || '')) {
        const type = /\(F\)/.test(r.event_type) ? 'Free' : /\(45\)/.test(r.event_type) ? '45' : /\(Mark\)/.test(r.event_type) ? 'Mark' : 'Play';
        return { ...ev, kind: 'shot', type, outcome: r.outcome, forceOne: r.outcome === 'Point', x: l.ShotX ?? null, y: l.ShotY ?? null, player };
      }
      return null;
  }
}

// Goals and points from tagged shots, for the live score.
export function liveScore(events, teamId) {
  let g = 0, p = 0;
  for (const e of events) {
    if (e.kind !== 'shot' || e.team !== teamId) continue;
    if (e.outcome === 'Goal') g += 1;
    else if (e.outcome === '2 Point') p += 2;
    else if (e.outcome === 'Point') p += 1;
  }
  return { g, p };
}

// ---- Possessions, worked out from the play ------------------------------------
// A possession is the ball in one team's hands until they give it up:
//   kick-out    -> a possession for the kicking team; if the other team wins it,
//                  a new possession for them (opposition kick-out)
//   turnover    -> new possession for the team that won the ball
//   free won by the team without the ball -> new possession for them
//   score / wide -> possession over; the other team's possession starts at once
//     (their kick-out). The kick-out tag then keeps it, or hands it over if lost.
//     One left hanging at the end of a half is dropped (unless `open`, for a
//     game still being tagged, so the count shows straight away)
//   short, saved, blocked, off the post -> over unless the same team gets it back
//     (a 45, a mark, a rebound), which stays the same possession; if the other
//     team plays it next, that's a possession for them from the shot dropping short
//   a team losing the ball must have had it: if that possession wasn't picked
//     up, it's counted before the turnover
//   start of each half -> throw-in possession for the team that won it (when
//     tagged), otherwise for whoever plays the ball first
// Rows are events-table rows (team_id, event_type, outcome, labels…). Returns the
// rows with 'Poss' rows added just before the event that started each
// possession; any possessions already in the list are replaced.
export function withPossessions(rows, teams, { open = false } = {}) {
  const other = (id) => teams.find((t) => t.id !== id)?.id;
  const winnerOf = (e) => {
    const o = String(e.outcome || '').toLowerCase();
    const w = teams.filter((t) => o.startsWith(t.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
    return w ? w.id : null;
  };
  const isShot = (e) => /^shot/i.test(e.event_type || '');
  const ends = (e) => /goal|point|wide/i.test(e.outcome || ''); // scores and wides go to a kick-out
  const out = [];
  let current = null; // team in possession
  let loose = null;   // team whose shot was short / saved: theirs again if they get it back
  let half = null;
  let started = false; // any possession yet this half (the first one is the throw-in)
  let pending = null; // the possession started by a score / wide, until the next event
  const start = (teamId, from, e, at = 0, tag = 'p') => {
    if (!teamId) return;
    pending = null;
    out.push({
      ...(e.match_id ? { match_id: e.match_id } : {}),
      ...(e.id != null ? { id: `${e.id}${tag}` } : {}),
      team_id: teamId, event_type: 'Poss', outcome: null, minute: e.minute, half: e.half, start_sec: e.start_sec == null ? e.start_sec : Number(e.start_sec) + at,
      player_no: null, code: 'Live', labels: { Half: e.labels?.Half || e.half, Quarter: e.labels?.Quarter, PossFrom: started ? from : 'Throw Up', Auto: true },
    });
    current = teamId; loose = null; started = true; lastStart = Number(e.start_sec) || 0;
  };
  // A turnover tagged at the moment of a team's own shot (shot hits the post,
  // drops short and is gathered) is the end of that shot: put it after the shot.
  const list = [...rows];
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (e.event_type !== 'Turnover') continue;
    for (let j = i + 1; j < list.length && (Number(list[j].start_sec) || 0) - (Number(e.start_sec) || 0) <= 3; j += 1) {
      if (isShot(list[j]) && list[j].team_id === e.team_id && (list[j].half || '') === (e.half || '')) {
        list.splice(i, 1); list.splice(j, 0, e); i -= 1; break;
      }
    }
  }
  // A possession that changed in the last few seconds (a tackle tagged just
  // after the turnover it forced belongs to the old possession).
  let lastStart = null;
  const recentChange = (e) => lastStart != null && Math.abs((Number(e.start_sec) || 0) - lastStart) <= 3;
  for (const e of list) {
    if (e.event_type === 'Poss') continue; // worked out here instead
    const h = e.half || e.labels?.Half;
    if (h !== half) {
      if (pending) out.splice(out.indexOf(pending), 1); // the half ended before that kick-out
      half = h; current = null; loose = null; started = false; pending = null;
    }
    const after = pending; // possession waiting on this event, from a score / wide
    pending = null;
    if (e.event_type === 'Throw In') {
      start(e.team_id, 'Throw Up', e);
    } else if (e.event_type === 'Kickout') {
      // The kick-out is a possession for the kicking team. Winning it keeps
      // that same possession; losing it starts one for the other team.
      started = true; // a kick-out is never the throw-in
      // Started already by the score / wide before it; otherwise starts here.
      if (after && current !== e.team_id) out.splice(out.indexOf(after), 1); // kicked by the other side after all
      if (!(after && current === e.team_id)) start(e.team_id, 'Own Kickout', e);
      const w = winnerOf(e);
      if (w && w !== e.team_id) start(w, 'Opp Kickout', e);
    } else if (e.event_type === 'Turnover') {
      // team_id lost it, so they must have had it: if that possession wasn't
      // picked up (e.g. they gathered a short shot), count it first.
      // (Not after their own short shot: that ball was already loose.)
      if (current !== e.team_id && loose !== e.team_id) start(e.team_id, loose ? 'Opp shot dropped short' : 'Other', e);
      start(other(e.team_id), 'Turnover', e);
    } else if (e.event_type === 'Foul') {
      const ben = other(e.team_id);
      if (ben === loose) { current = ben; loose = null; } // their shot dropped short, then they won a free: same possession
      else if (ben !== current) start(ben, loose === e.team_id ? 'Opp shot dropped short' : 'Free', e);
    } else if (isShot(e)) {
      if (current !== e.team_id) {
        if (loose === e.team_id) current = e.team_id; // got it back after a short / save: same possession
        else start(e.team_id, loose ? 'Opp shot dropped short' : 'Other', e);
      }
      out.push(e);
      if (ends(e)) {
        loose = null;
        // The other team's kick-out: their possession starts now.
        start(other(e.team_id), 'Own Kickout', e, 0.1, 'k');
        pending = out[out.length - 1];
      } else { loose = e.team_id; current = null; }
      continue;
    } else if (e.event_type === 'Attack' && current !== e.team_id) {
      // An attack means they have the ball: a possession the tags didn't start.
      if (loose === e.team_id) current = e.team_id;
      else start(e.team_id, loose ? 'Opp shot dropped short' : 'Other', e);
    } else if (e.event_type === 'Tackle' && (loose === e.team_id || (current === e.team_id && !recentChange(e)))) {
      // A tackle is made on the team with the ball: the other team had it
      // (after this team's short / saved shot, they gathered it).
      start(other(e.team_id), loose === e.team_id ? 'Opp shot dropped short' : 'Other', e);
    }
    out.push(e);
  }
  if (pending && !open) out.splice(out.indexOf(pending), 1); // nothing after the last score
  return out;
}
