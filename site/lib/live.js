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

export const LIVE_PREFIX = 'LIVE-';
export const isLiveCode = (code) => String(code || '').startsWith(LIVE_PREFIX);

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
    case 'Poss': return { ...ev, kind: 'poss', from: l.PossFrom || null };
    case 'Kickout': {
      const winnerIsKicker = String(r.outcome || '').toLowerCase().startsWith(String(teams.find((t) => t.id === r.team_id)?.name || '?').toLowerCase());
      const box = l.Zone ? Number(String(l.Zone).replace(/\D/g, '')) : null;
      return { ...ev, kind: 'ko', won: winnerIsKicker, how: /break/i.test(r.outcome || '') ? 'Break' : 'Clean', box, player };
    }
    case 'Turnover': return { ...ev, team: other, kind: 'to', third: third(l.PitchArea) && { Def: 'Att', Mid: 'Mid', Att: 'Def' }[third(l.PitchArea)], player: l.WonBackBy ? { no: Number(l.Jersey) || Number(String(l.WonBackBy).replace('#', '')) || null, name: named(l.WonBackBy) } : null };
    case 'Foul': return { ...ev, kind: 'foul', third: third(l.PitchArea) };
    case 'Card': return { ...ev, kind: 'card', outcome: r.outcome, player };
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
