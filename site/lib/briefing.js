// Opposition briefings: one team's last few tagged games, worked up into team
// lists, scorers, shooting, kick-outs and the game picture, with the analyst's
// notes and Nacsport Hub links per section (stored in the briefings table).
import { db, MATCH_SELECT, loadEvents } from './db';
import { analyseMatch, combineSides, withoutNames } from './analysis';
import { nameEvents, isNumberTag, fixStarts } from './players';
import { getAliases } from './aliases';
import { gradeOk } from './session';
import { scoped, orgScope } from './org';

export const BRIEFING_SQL = `create table if not exists briefings (
  id bigint generated always as identity primary key,
  team_id bigint not null,
  title text not null,
  game_ids bigint[] not null default '{}',
  notes jsonb not null default '{}',
  links jsonb not null default '{}',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table briefings enable row level security;`;

export const SECTIONS = [
  ['summary', 'Key messages'],
  ['games', 'Their last games'],
  ['team', 'Team lists'],
  ['scorers', 'Scorers and shooting'],
  ['kickouts', 'Kick-outs'],
  ['picture', 'Possessions, shots, scores and quarters'],
  ['turnovers', 'Turnovers'],
];

// Every tagged game for a team (newest first) and the chosen ones analysed.
export async function briefingData(teamIdIn, gameIds, access, admin) {
  const teamId = Number(teamIdIn);
  const { data: t } = await db.from('teams').select('id, name').eq('id', teamId).single();
  if (!t) return null;
  const { data: all } = await (await orgScope())(db.from('matches').select(MATCH_SELECT))
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`).order('match_date', { ascending: false });
  const games = (all || []).filter((m) => (m.team1_id === teamId || m.team2_id === teamId) && gradeOk(access, m.competitions?.grade));
  const chosenIds = gameIds?.length ? gameIds.map(Number) : games.slice(0, 4).map((m) => m.id);
  const chosen = games.filter((m) => chosenIds.includes(m.id));
  const aliases = await getAliases();
  const { data: apps } = chosen.length
    ? await db.from('appearances').select('match_id, team_id, jersey_no, started, sub_on_minute, sub_off_minute, player_id, players(id, name)').in('match_id', chosen.map((m) => m.id))
    : { data: [] };
  const rows = (await Promise.all(chosen.map(async (m) => {
    const teams = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
    const raw = await loadEvents(m.id);
    let events = nameEvents(raw, (apps || []).filter((a) => a.match_id === m.id), teams, aliases);
    if (m.competitions?.show_player_names === false && !admin) events = withoutNames(events);
    const r = raw.length ? analyseMatch({ events, teams }) : null;
    const oppId = m.team1_id === teamId ? m.team2_id : m.team1_id;
    const us = m.team1_id === teamId;
    const f = us ? 3 * m.team1_goals + m.team1_points : 3 * m.team2_goals + m.team2_points;
    const a = us ? 3 * m.team2_goals + m.team2_points : 3 * m.team1_goals + m.team1_points;
    return {
      m, events: r ? r.allEvents : [], tagged: Boolean(r), mine: r?.byTeam[teamId], opp: r?.byTeam[oppId], oppId,
      oppName: us ? m.team2.name : m.team1.name, res: f > a ? 'W' : f < a ? 'L' : 'D',
      line: us ? `${m.team1_goals}-${m.team1_points} – ${m.team2_goals}-${m.team2_points}` : `${m.team2_goals}-${m.team2_points} – ${m.team1_goals}-${m.team1_points}`,
      apps: fixStarts(apps).filter((x) => x.match_id === m.id && x.team_id === teamId),
    };
  }))).sort((x, y) => y.m.match_date.localeCompare(x.m.match_date));
  const tagged = rows.filter((r) => r.tagged && r.mine && r.opp);
  return {
    team: t, candidates: games, rows, tagged,
    mine: tagged.length ? combineSides(tagged.map((r) => r.mine)) : null,
    opp: tagged.length ? combineSides(tagged.map((r) => r.opp)) : null,
    teamList: teamList(rows),
  };
}

// Who played in each game: from the team sheets where there are any, plus
// everyone named in the tags. One row per player, one cell per game.
function teamList(rows) {
  const players = new Map();
  const row = (name) => {
    const k = name.toLowerCase();
    if (!players.has(k)) players.set(k, { name, cells: {}, games: 0, starts: 0, points: 0, goals: 0, shots: 0, scores: 0, mins: 0, minsKnown: 0 });
    return players.get(k);
  };
  for (const g of rows) {
    const id = g.m.id;
    const end = 2 * (Number(String(g.m.match_code || '').match(/^LIVE-\d+-(\d+)/)?.[1]) || (g.m.competitions?.grade === 'Senior' ? 35 : 30));
    for (const a of g.apps) {
      if (!a.players?.name) continue;
      const p = row(a.players.name);
      const on = a.started ? 0 : a.sub_on_minute;
      const off = a.sub_off_minute ?? end;
      const mins = on != null ? Math.max(0, off - on) : null;
      p.cells[id] = { ...(p.cells[id] || {}), no: a.jersey_no, start: Boolean(a.started), mins };
      p.games += 1; if (a.started) p.starts += 1;
      if (mins != null) { p.mins += mins; p.minsKnown += 1; }
    }
    for (const pl of g.mine?.players || []) {
      if (isNumberTag(pl.name)) continue;
      const p = row(pl.name);
      if (!p.cells[id]) { p.cells[id] = { tagsOnly: true }; p.games += 1; }
      const c = p.cells[id];
      c.points = pl.points; c.goals = pl.goals; c.shots = pl.shots; c.scores = pl.scores;
      p.points += pl.points; p.goals += pl.goals; p.shots += pl.shots; p.scores += pl.scores;
    }
  }
  return [...players.values()].sort((a, b) => b.games - a.games || b.starts - a.starts || b.points - a.points || a.name.localeCompare(b.name));
}
