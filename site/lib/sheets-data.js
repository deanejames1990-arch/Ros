// Server-side loading of team sheets: this game's sheet, the team's last sheet
// before it, and the squad (everyone who has played for the team) for picking.
import { db } from './db';
import { sheetFromApps } from './players';
import { inOrg } from './org';

export async function sheetData(matchId, teams) {
  const out = {};
  await Promise.all(teams.map(async (t) => {
    const { data } = await db.from('appearances')
      .select('match_id, jersey_no, player_id, sub_on_minute, sub_off_minute, players(id, name), matches(match_date)')
      .eq('team_id', t.id).limit(5000);
    const rows = await inOrg(data); // this organisation's sheets only
    const current = rows.filter((a) => a.match_id === Number(matchId));
    // The most recent other game with a sheet for this team.
    const others = rows.filter((a) => a.match_id !== Number(matchId) && a.matches?.match_date);
    const lastId = others.sort((a, b) => b.matches.match_date.localeCompare(a.matches.match_date))[0]?.match_id;
    const last = others.filter((a) => a.match_id === lastId);
    // Squad: each player once, with the number they wore most recently and how many games.
    const squad = new Map();
    for (const a of [...rows].sort((x, y) => (y.matches?.match_date || '').localeCompare(x.matches?.match_date || ''))) {
      if (!a.players?.name) continue;
      const s = squad.get(a.players.id);
      if (s) s.games += 1;
      else squad.set(a.players.id, { id: a.players.id, name: a.players.name, no: a.jersey_no, games: 1 });
    }
    out[t.id] = {
      sheet: sheetFromApps(current),
      last: sheetFromApps(last),
      lastDate: last[0]?.matches?.match_date || null,
      squad: [...squad.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }));
  return out;
}
