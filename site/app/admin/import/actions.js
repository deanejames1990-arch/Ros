'use server';

import { db } from '../../../lib/db';
import { requireAdmin } from '../../../lib/session';
import { scoped, orgScope, orgStamp } from '../../../lib/org';

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

// A game's season is its competition's season, so the competition must belong
// to the year the game was played. Picking "Connacht U20 (2026)" for a 2025 game
// files it under the 2025 edition of that competition, created if needed.
async function findOrCreateCompetition(c, matchYear) {
  if (c.id) {
    const { data: picked, error } = await db.from('competitions')
      .select('id, name, grade, show_player_names, seasons(year)').eq('id', Number(c.id)).single();
    if (error) throw new Error(`Looking up competition: ${error.message}`);
    if (!matchYear || picked.seasons?.year === matchYear) return picked.id;
    return findOrCreateCompetition({ name: picked.name, grade: picked.grade, year: matchYear, showNames: picked.show_player_names }, matchYear);
  }
  const year = Number(matchYear || c.year);
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
    await requireAdmin();
    if (!p?.events?.length) throw new Error('No events to save.');
    if (!p.date) throw new Error('Please enter the match date.');
    const [t1, t2] = await Promise.all([findOrCreateTeam(p.team1), findOrCreateTeam(p.team2)]);
    if (t1 === t2) throw new Error('The two teams are the same.');

    const score = {
      team1_goals: Number(p.score1.g) || 0,
      team1_points: Number(p.score1.p) || 0,
      team2_goals: Number(p.score2.g) || 0,
      team2_points: Number(p.score2.p) || 0,
    };
    const code = clean(p.code) || null;

    // Is this game already on the site? Match on the file's code, then on date and
    // teams in either order, whatever competition it was filed under.
    let existing = null;
    if (code) {
      const { data } = await (await orgScope())(db.from('matches').select('id, team1_id, team2_id, competition_id')).eq('match_code', code).limit(1);
      existing = data?.[0] || null;
    }
    if (!existing) {
      const { data, error } = await (await orgScope())(db.from('matches').select('id, team1_id, team2_id, competition_id'))
        .eq('match_date', p.date)
        .or(`and(team1_id.eq.${t1},team2_id.eq.${t2}),and(team1_id.eq.${t2},team2_id.eq.${t1})`)
        .limit(1);
      if (error) throw new Error(`Checking for this game: ${error.message}`);
      existing = data?.[0] || null;
    }

    let matchId;
    if (existing) {
      // Keep the game's own competition and team order; flip the score if the
      // teams are stored the other way round.
      const flipped = existing.team1_id === t2;
      const upd = flipped
        ? { team1_goals: score.team2_goals, team1_points: score.team2_points, team2_goals: score.team1_goals, team2_points: score.team1_points }
        : { ...score };
      if (code) upd.match_code = code;
      if (clean(p.stage)) upd.stage = clean(p.stage);
      // Keep the date in step with the file, and keep the game in its
      // competition's edition for the year it was played (fixes games that
      // were filed under another season).
      upd.match_date = p.date;
      upd.competition_id = await findOrCreateCompetition({ id: existing.competition_id }, Number(String(p.date).slice(0, 4)) || null);
      const { error } = await db.from('matches').update(upd).eq('id', existing.id);
      if (error) throw new Error(`Updating the game: ${error.message}`);
      const { error: de } = await db.from('events').delete().eq('match_id', existing.id);
      if (de) throw new Error(`Clearing old events: ${de.message}`);
      matchId = existing.id;
    } else {
      const competitionId = await findOrCreateCompetition(p.competition, Number(String(p.date).slice(0, 4)) || null);
      const row = {
        ...(await orgStamp()),
        competition_id: competitionId, match_date: p.date, team1_id: t1, team2_id: t2, ...score,
        stage: clean(p.stage) || null, source: 'nacsport', match_code: code,
      };
      const { data, error } = await db.from('matches').insert(row).select('id').single();
      if (error) throw new Error(`Adding the game: ${error.message}`);
      matchId = data.id;
    }
    const existed = Boolean(existing);

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
      if (error) {
        // Don't leave a new game behind with half its events.
        await db.from('events').delete().eq('match_id', matchId);
        if (!existed) await db.from('matches').delete().eq('id', matchId);
        throw new Error(`Saving events: ${error.message}`);
      }
    }
    return { ok: true, matchId, replaced: existed, count: rows.length };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
