'use server';

import { db } from '../../../lib/db';

const clean = (s) => String(s || '').trim();

async function findOrCreateTeam(name) {
  const n = clean(name);
  if (!n) throw new Error('Both teams need a name.');
  const { data: found, error } = await db.from('teams').select('id,name').ilike('name', n).limit(1);
  if (error) throw new Error(`Looking up team ${n}: ${error.message}`);
  if (found?.length) return found[0].id;
  const { data, error: e2 } = await db.from('teams').insert({ name: n }).select('id').single();
  if (e2) throw new Error(`Adding team ${n}: ${e2.message}`);
  return data.id;
}

async function findOrCreateCompetition(c) {
  if (c.id) return Number(c.id);
  const year = Number(c.year);
  if (!clean(c.name) || !year) throw new Error('A new competition needs a name and a year.');
  let { data: season } = await db.from('seasons').select('id').eq('year', year).maybeSingle();
  if (!season) {
    const { data, error } = await db.from('seasons').insert({ year }).select('id').single();
    if (error) throw new Error(`Adding season ${year}: ${error.message}`);
    season = data;
  }
  const { data: found } = await db.from('competitions').select('id').eq('season_id', season.id).ilike('name', clean(c.name)).limit(1);
  if (found?.length) return found[0].id;
  const { data, error } = await db.from('competitions')
    .insert({ season_id: season.id, name: clean(c.name), grade: clean(c.grade) || 'Senior', show_player_names: c.showNames !== false })
    .select('id').single();
  if (error) throw new Error(`Adding competition: ${error.message}`);
  return data.id;
}

// Saves one game and its events. Re-importing a file with the same match code
// replaces that game's events rather than creating a duplicate.
export async function importGame(p) {
  try {
    if (!p?.events?.length) throw new Error('No events to save.');
    if (!p.date) throw new Error('Please enter the match date.');
    const [t1, t2] = await Promise.all([findOrCreateTeam(p.team1), findOrCreateTeam(p.team2)]);
    if (t1 === t2) throw new Error('The two teams are the same.');
    const competitionId = await findOrCreateCompetition(p.competition);

    const row = {
      competition_id: competitionId,
      match_date: p.date,
      team1_id: t1,
      team2_id: t2,
      team1_goals: Number(p.score1.g) || 0,
      team1_points: Number(p.score1.p) || 0,
      team2_goals: Number(p.score2.g) || 0,
      team2_points: Number(p.score2.p) || 0,
      stage: clean(p.stage) || null,
      source: 'nacsport',
      match_code: clean(p.code) || null,
    };

    let matchId = null;
    if (row.match_code) {
      const { data: existing } = await db.from('matches').select('id').eq('match_code', row.match_code).limit(1);
      matchId = existing?.[0]?.id ?? null;
    }
    const existed = Boolean(matchId);
    if (matchId) {
      const { error } = await db.from('matches').update(row).eq('id', matchId);
      if (error) throw new Error(`Updating the game: ${error.message}`);
      const { error: de } = await db.from('events').delete().eq('match_id', matchId);
      if (de) throw new Error(`Clearing old events: ${de.message}`);
    } else {
      const { data, error } = await db.from('matches').insert(row).select('id').single();
      if (error) throw new Error(`Adding the game: ${error.message}`);
      matchId = data.id;
    }

    // TA / HOME side -> whichever team the user picked.
    const sideTeam = p.aIsTeam1 ? { A: t1, B: t2 } : { A: t2, B: t1 };
    const rows = p.events.map((e) => ({
      match_id: matchId,
      team_id: e.side ? sideTeam[e.side] : null,
      event_type: e.event_type,
      outcome: e.outcome,
      minute: e.minute,
      half: e.half,
      start_sec: e.start_sec,
      end_sec: e.end_sec,
      player_no: e.player_no,
      code: e.code,
      labels: e.labels,
      source: 'nacsport',
      source_id: e.nac_id ?? null,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('events').insert(rows.slice(i, i + 500));
      if (error) throw new Error(`Saving events: ${error.message}`);
    }
    return { ok: true, matchId, replaced: existed, count: rows.length };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
