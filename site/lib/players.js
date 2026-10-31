// Team sheets and player names.
//
// A team sheet is the appearances for one team in one game: who wore which
// number. Tags made by number only ("#14", or a bare player_no from a file)
// are given the name of whoever wore that number for that team that day.

const lbl = (e, k) => e.labels?.[k];
const NUM = /^#?(\d{1,2})$/;

// apps: [{ team_id, jersey_no, players: { name } }]; teams: [{ id, name }]
export function nameEvents(events, apps, teams) {
  if (!apps?.length) return events;
  const byNo = new Map(apps.filter((a) => a.jersey_no && a.players?.name).map((a) => [`${a.team_id}:${a.jersey_no}`, a.players.name]));
  if (!byNo.size) return events;
  const other = (id) => teams.find((t) => t.id !== id)?.id;
  const winnerOf = (e) => {
    const o = String(e.outcome || '').toLowerCase();
    const w = teams.filter((t) => o.startsWith(t.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
    return w ? w.id : e.team_id;
  };
  const fix = (value, teamId) => String(value).split(',').map((x) => {
    const m = x.trim().match(NUM);
    return m ? byNo.get(`${teamId}:${Number(m[1])}`) || x.trim() : x.trim();
  }).join(', ');
  return events.map((e) => {
    const labels = { ...(e.labels || {}) };
    let changed = false;
    let { player_no: playerNo } = e;
    const own = e.event_type === 'Kickout' ? winnerOf(e) : e.team_id;
    // Live tags keep the number they were tagged with: the sheet decides the name.
    const jersey = Number(labels.Jersey) || null;
    const field = labels.WonBackBy ? 'WonBackBy' : labels.FreeWonBy ? 'FreeWonBy' : 'Players';
    const sheetName = jersey && byNo.get(`${field === 'Players' ? own : other(e.team_id)}:${jersey}`);
    if (sheetName && labels[field] !== sheetName) {
      labels[field] = sheetName;
      if (field === 'FreeWonBy') labels.Players = sheetName;
      changed = true;
    }
    if (labels.Players && e.event_type !== 'Foul') {
      const v = fix(labels.Players, own);
      if (v !== labels.Players) { labels.Players = v; changed = true; }
    } else if (playerNo && NUM.test(String(playerNo))) {
      const name = byNo.get(`${own}:${Number(String(playerNo).replace('#', ''))}`);
      if (name) { labels.Players = name; playerNo = null; changed = true; }
    }
    for (const k of ['WonBackBy', 'FreeWonBy']) {
      if (!labels[k]) continue;
      const v = fix(labels[k], other(e.team_id));
      if (v !== labels[k]) { labels[k] = v; changed = true; }
      if (k === 'FreeWonBy' && labels.Players !== labels[k]) { labels.Players = labels[k]; changed = true; }
    }
    if (labels.Players && playerNo && NUM.test(String(playerNo))) { playerNo = null; changed = true; }
    return changed ? { ...e, labels, player_no: playerNo } : e;
  });
}

// Goals and points per appearance from the tagged shots (for the line-out and
// season totals). Returns { appearanceId: { goals, points } }.
export function scoresFromTags(events, apps, teams) {
  const named = nameEvents(events, apps, teams);
  const out = {};
  for (const a of apps) {
    const name = (a.players?.name || '').toLowerCase();
    let goals = 0, points = 0;
    for (const e of named) {
      if (e.team_id !== a.team_id || !/^shot/i.test(e.event_type || '')) continue;
      const who = String(lbl(e, 'Players') || e.player_no || '').toLowerCase();
      if (!who || (who !== name && who !== `#${a.jersey_no}`)) continue;
      const o = String(e.outcome || '').toLowerCase();
      if (o.includes('goal')) goals += 1;
      else if (/\b2\s*(pt|point|pointer)s?\b/.test(o)) points += 2;
      else if (/\bpoint\b/.test(o)) points += 1;
    }
    out[a.id] = { goals, points };
  }
  return out;
}

// [{no, name}] sorted by number, from appearances.
export const sheetFromApps = (apps) => apps
  .filter((a) => a.players?.name)
  .map((a) => ({ no: a.jersey_no || null, name: a.players.name, id: a.player_id ?? a.players.id ?? null }))
  .sort((x, y) => (x.no || 99) - (y.no || 99));
