'use server';

import { redirect } from 'next/navigation';
import { db } from '../../../lib/db';
import { requireTagger } from '../../../lib/session';
import { syncAppearanceScores } from '../sheet-actions';
import { LIVE_PREFIX, isLiveCode, isFinishedCode, toRow } from '../../../lib/live';

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

async function competitionFor(form, year) {
  const id = Number(form.get('competition'));
  if (id) {
    const { data: c } = await db.from('competitions').select('id, name, grade, show_player_names, seasons(year)').eq('id', id).single();
    if (c && c.seasons?.year === year) return c.id;
    if (c) return newCompetition(c.name, c.grade, c.show_player_names, year);
  }
  const name = clean(form.get('newCompetition'));
  if (!name) throw new Error('Pick a competition or type a new one.');
  const grade = clean(form.get('grade')) || 'Senior';
  return newCompetition(name, grade, grade === 'Senior', year);
}

async function newCompetition(name, grade, showNames, year) {
  let { data: season } = await db.from('seasons').select('id').eq('year', year).maybeSingle();
  if (!season) {
    const { data, error } = await db.from('seasons').insert({ year }).select('id').single();
    if (error) throw new Error(`Adding season ${year}: ${error.message}`);
    season = data;
  }
  const { data: found } = await db.from('competitions').select('id').eq('season_id', season.id).ilike('name', name).limit(1);
  if (found?.length) return found[0].id;
  const { data, error } = await db.from('competitions')
    .insert({ season_id: season.id, name, grade, show_player_names: showNames !== false }).select('id').single();
  if (error) throw new Error(`Adding competition: ${error.message}`);
  return data.id;
}

// Some databases restrict the "source" column; fall back if 'live' is refused.
async function insertWithSource(table, rows, single) {
  const go = (src) => {
    const q = db.from(table).insert(rows.map((r) => ({ ...r, source: src })));
    return single ? q.select('id').single() : q;
  };
  let res = await go('live');
  if (res.error && /source|check|enum|invalid input/i.test(res.error.message)) res = await go('nacsport');
  return res;
}

export async function startLiveGame(_prev, form) {
  let id;
  try {
    await requireTagger();
    const date = clean(form.get('date'));
    if (!date) throw new Error('Please enter the date.');
    const year = Number(date.slice(0, 4));
    const us = clean(form.get('us')) || 'Roscommon';
    const them = clean(form.get('them'));
    if (!them) throw new Error('Who are they playing?');
    const [a, b] = await Promise.all([findOrCreateTeam(us), findOrCreateTeam(them)]);
    if (a === b) throw new Error('The two teams are the same.');
    const competition_id = await competitionFor(form, year);
    const { data: cg } = await db.from('competitions').select('grade').eq('id', competition_id).single();
    await requireTagger(cg?.grade || '');
    const home = form.get('home') === 'them';
    const halfLen = Number(form.get('halfLen')) || 35;
    const row = {
      competition_id, match_date: date,
      team1_id: home ? b : a, team2_id: home ? a : b,
      team1_goals: 0, team1_points: 0, team2_goals: 0, team2_points: 0,
      stage: clean(form.get('stage')) || null,
      match_code: `${LIVE_PREFIX}${Date.now()}-${halfLen}`,
    };
    const { data, error } = await insertWithSource('matches', [row], true);
    if (error) throw new Error(`Adding the game: ${error.message}`);
    id = data.id;
  } catch (e) {
    return { error: String(e.message || e) };
  }
  redirect(`/admin/live/${id}`);
}

// Saves the tagger's whole event list for a live game, replacing what was
// there, and updates the score from the tags. Only for games started in the
// tagger, so an imported Nacsport game can never be overwritten from here.
// opts.final = { [teamId]: { g, p } } sets the official score; opts.finish
// closes the game (no longer shown as live).
export async function saveLiveGame(matchId, events, opts = {}) {
  try {
    const { data: m, error } = await db.from('matches')
      .select('id, match_code, competitions(grade), team1_id, team2_id, team1:teams!team1_id(name), team2:teams!team2_id(name)')
      .eq('id', Number(matchId)).single();
    if (error || !m) throw new Error('Game not found.');
    await requireTagger(m.competitions?.grade || '');
    if (!isLiveCode(m.match_code)) throw new Error('This game was not started in the live tagger.');
    const teams = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
    const rows = (events || []).map((e) => ({ match_id: m.id, ...toRow(e, teams) }));

    const score = {};
    teams.forEach((t, i) => {
      let g = 0, p = 0;
      for (const e of events || []) {
        if (e.kind !== 'shot' || e.team !== t.id) continue;
        if (e.outcome === 'Goal') g += 1; else if (e.outcome === '2 Point') p += 2; else if (e.outcome === 'Point') p += 1;
      }
      score[`team${i + 1}_goals`] = g; score[`team${i + 1}_points`] = p;
    });

    const { error: de } = await db.from('events').delete().eq('match_id', m.id);
    if (de) throw new Error(`Clearing events: ${de.message}`);
    for (let i = 0; i < rows.length; i += 500) {
      const { error: ie } = await insertWithSource('events', rows.slice(i, i + 500));
      if (ie) throw new Error(`Saving events: ${ie.message}`);
    }
    const upd = {};
    if (opts.final) {
      teams.forEach((t, i) => {
        const f = opts.final[t.id] || {};
        upd[`team${i + 1}_goals`] = Math.max(0, Number(f.g) || 0);
        upd[`team${i + 1}_points`] = Math.max(0, Number(f.p) || 0);
      });
    } else if (!isFinishedCode(m.match_code)) {
      Object.assign(upd, score); // live score from the tags until the game is finished
    }
    if (opts.finish && !isFinishedCode(m.match_code)) upd.match_code = `${m.match_code}-F`;
    if (opts.reopen && isFinishedCode(m.match_code)) upd.match_code = m.match_code.replace(/-F$/, '');
    if (Object.keys(upd).length) {
      const { error: ue } = await db.from('matches').update(upd).eq('id', m.id);
      if (ue) throw new Error(`Updating the score: ${ue.message}`);
    }
    await syncAppearanceScores(m.id).catch(() => {});
    return { ok: true, count: rows.length, at: Date.now() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
