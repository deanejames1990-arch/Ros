// Shot boxes from an analyst's Excel workbook (e.g. "Mayo Scoring Zone"):
// sheets "(DATA) SHOTS FROM PLAY" and "(DATA) FREES", each with the team's
// shots on the left and the shots against them on the right:
//   Event | Time | Team Name | Name | Period | Outcome | Player | Location | Competition | Year | Teams
// Time is the video time (as in the Nacsport file), Location the box (10–15 for
// shots from play, the same boxes as the site). Frees use the 35-zone pitch, so
// they only bring names, not boxes.

const norm = (v) => String(v ?? '').trim();
export const secsOf = (t) => {
  if (t == null || t === '') return null;
  if (typeof t === 'number') return t < 1 ? Math.round(t * 86400) : Math.round(t * 60); // Excel day fraction, or minutes
  if (t instanceof Date) return t.getUTCHours() * 3600 + t.getUTCMinutes() * 60 + t.getUTCSeconds();
  const p = String(t).trim().split(':').map(Number);
  if (p.some(Number.isNaN)) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null;
};
const titleName = (s) => norm(s).toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\bMc(\p{L})/gu, (m, a) => `Mc${a.toUpperCase()}`).replace(/\bO (\p{L})/gu, (m, a) => `O'${a.toUpperCase()}`);

// rows: the sheet as arrays. Returns shots: { team, opp, comp, year, secs, outcome, player, box, kind }
function blocks(rows, kind) {
  const head = (rows[0] || []).map(norm);
  const starts = head.map((h, i) => (h === 'Event' ? i : -1)).filter((i) => i >= 0);
  if (starts.length < 1) return [];
  const col = (s, name) => { const i = head.findIndex((h, j) => j >= s && j < s + 12 && h.toLowerCase().startsWith(name)); return i < 0 ? null : i; };
  const out = [];
  let mainTeam = null;
  starts.forEach((s, bi) => {
    const c = { time: col(s, 'time'), team: col(s, 'team name'), outcome: col(s, 'outcome'), player: col(s, 'player'), loc: col(s, 'location'), comp: col(s, 'competition'), year: col(s, 'year'), teams: col(s, 'teams'), period: col(s, 'period') };
    for (const r of rows.slice(1)) {
      const team = norm(r[c.team]);
      if (!team) continue;
      if (bi === 0 && !mainTeam) mainTeam = team;
      const secs = secsOf(r[c.time]);
      if (secs == null) continue;
      // Left block: the team, and its opponent in "Teams". Right block: the opponent's shots against the team.
      const opp = bi === 0 ? norm(r[c.teams]) : mainTeam;
      const loc = Number(r[c.loc]);
      out.push({
        team, opp, comp: norm(r[c.comp]), year: Number(r[c.year]) || null, secs, kind,
        period: Number(r[c.period]) || null, outcome: norm(r[c.outcome]), player: c.player != null && norm(r[c.player]) ? titleName(r[c.player]) : null,
        box: kind === 'play' && Number.isFinite(loc) && loc >= 0 && loc <= 15 ? String(loc) : null,
      });
    }
  });
  return out;
}

// sheets: [{ sheet, data }] from read-excel-file. Returns games: [{ team, opp, comp, year, shots }]
export function shotsFromWorkbook(sheets) {
  // The data sheets: the ones whose first row starts with "Event".
  const data = sheets.filter((x) => norm(x.data?.[0]?.[0]) === 'Event');
  const play = data.find((x) => /shots? from play/i.test(x.sheet));
  const frees = data.find((x) => /free/i.test(x.sheet));
  const all = [...(play ? blocks(play.data, 'play') : []), ...(frees ? blocks(frees.data, 'free') : [])];
  const games = new Map();
  for (const s of all) {
    // One game per pairing: the team's side and the opponent's side share it.
    const pair = [s.team, s.opp].map((x) => x.toLowerCase()).sort().join(' v ');
    const k = `${pair}|${s.comp.toLowerCase()}|${s.year || ''}`;
    if (!games.has(k)) games.set(k, { key: k, teams: [s.team, s.opp].sort(), comp: s.comp, year: s.year, shots: [] });
    games.get(k).shots.push(s);
  }
  return [...games.values()].filter((g) => g.teams.every(Boolean));
}
