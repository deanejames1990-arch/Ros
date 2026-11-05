'use server';

import { db, loadEvents } from '../../lib/db';
import { requireAdmin, requireTagger } from '../../lib/session';
import { scoresFromTags } from '../../lib/players';

const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');

// Writes a sheet's rows. Upsert on (match, player) so two saves landing at
// the same moment (two tabs, a save and a finish) can't clash.
async function upsertApps(rows) {
  if (!rows.length) return { error: null };
  const put = (source) => db.from('appearances').upsert(rows.map((r) => ({ ...r, source })), { onConflict: 'match_id,player_id' });
  let res = await put('live');
  if (res.error && /source|check|enum|invalid input/i.test(res.error.message)) res = await put('nacsport');
  return res;
}

// Goals and points on each appearance, worked out from the game's tags.
export async function syncAppearanceScores(matchId) {
  const { data: m } = await db.from('matches').select('id, team1_id, team2_id, team1:teams!team1_id(name), team2:teams!team2_id(name)').eq('id', matchId).single();
  if (!m) return;
  const { data: apps } = await db.from('appearances').select('id, team_id, jersey_no, player_id, players(name)').eq('match_id', matchId);
  if (!apps?.length) return;
  const teams = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
  const events = await loadEvents(matchId);
  const sc = scoresFromTags(events, apps, teams);
  await Promise.all(apps.map((a) => db.from('appearances').update(sc[a.id]).eq('id', a.id)));
}

// Came-on / went-off minutes on each appearance, from the game's Sub tags
// (live tagger). Minutes run through the game: 2nd half adds the half length.
export async function syncSubMinutes(matchId) {
  const { data: m } = await db.from('matches').select('id, match_code, competitions(grade)').eq('id', matchId).single();
  if (!m) return;
  const subs = (await loadEvents(matchId)).filter((e) => e.event_type === 'Sub');
  const { data: apps } = await db.from('appearances').select('id, team_id, jersey_no, sub_on_minute, sub_off_minute').eq('match_id', matchId);
  if (!apps?.length) return;
  const halfLen = Number(String(m.match_code || '').split('-')[2]) || (m.competitions?.grade === 'Senior' ? 35 : 30);
  const at = (e) => Math.round((String(e.half || e.labels?.Half || '').startsWith('2') ? halfLen : 0) + (Number(e.minute) || 0));
  const want = new Map(apps.map((a) => [a.id, { sub_on_minute: null, sub_off_minute: null }]));
  for (const e of subs) {
    const l = e.labels || {};
    const find = (no) => no && apps.find((a) => a.team_id === e.team_id && a.jersey_no === Number(no));
    const off = find(l.OffJersey), on = find(l.OnJersey);
    if (off) want.get(off.id).sub_off_minute = at(e);
    if (on && want.get(on.id).sub_on_minute == null) want.get(on.id).sub_on_minute = at(e);
  }
  await Promise.all(apps.filter((a) => {
    const w = want.get(a.id);
    return w.sub_on_minute !== a.sub_on_minute || w.sub_off_minute !== a.sub_off_minute;
  }).map((a) => db.from('appearances').update(want.get(a.id)).eq('id', a.id)));
}

// Saves one team's sheet for one game: [{ no, name, id? }]. Each name is
// linked to one player record: the id picked from the squad, else a player of
// that name who has played for this team before, else a new player.
export async function saveTeamSheet(matchId, teamId, entries) {
  try {
    const mid = Number(matchId), tid = Number(teamId);
    const { data: gm } = await db.from('matches').select('competitions(grade)').eq('id', mid).single();
    await requireTagger(gm?.competitions?.grade || '');
    const list = (entries || []).map((e) => ({ no: Number(e.no) || null, name: clean(e.name), id: Number(e.id) || null })).filter((e) => e.name);
    const seen = new Set();
    for (const e of list) {
      if (e.no && seen.has(e.no)) throw new Error(`Number ${e.no} is on the sheet twice.`);
      if (e.no) seen.add(e.no);
    }

    // Everyone who has played for this team, by name.
    const { data: past } = await db.from('appearances').select('player_id, players(id, name)').eq('team_id', tid).limit(5000);
    const squad = new Map();
    for (const a of past || []) if (a.players?.name) squad.set(a.players.name.toLowerCase(), a.players.id);

    const out = [];
    for (const e of list) {
      let id = e.id;
      if (id) {
        const { data: p } = await db.from('players').select('id, name').eq('id', id).maybeSingle();
        if (!p) id = null;
        else if (p.name !== e.name) id = squad.get(e.name.toLowerCase()) || null; // name changed on the sheet
      }
      if (!id) id = squad.get(e.name.toLowerCase()) || null;
      if (!id) {
        const { data: p, error } = await db.from('players').insert({ name: e.name }).select('id').single();
        if (error) throw new Error(`Adding ${e.name}: ${error.message}`);
        id = p.id;
        squad.set(e.name.toLowerCase(), id);
      }
      out.push({ ...e, id });
    }
    // The same player can only be on a game once.
    const byId = new Map();
    for (const e of out) {
      const prev = byId.get(e.id);
      if (prev) throw new Error(`${e.name} is on the sheet twice (${prev.no ? `#${prev.no}` : 'no number'} and ${e.no ? `#${e.no}` : 'no number'}): clear one of them.`);
      byId.set(e.id, e);
    }

    // Drop anyone no longer on this sheet (and these players from the other
    // side's sheet for this game, if they were put there by mistake), then write.
    const keep = out.map((e) => e.id);
    let del = db.from('appearances').delete().eq('match_id', mid).eq('team_id', tid);
    if (keep.length) del = del.not('player_id', 'in', `(${keep.join(',')})`);
    const { error: de } = await del;
    if (de) throw new Error(`Clearing the old sheet: ${de.message}`);
    if (keep.length) {
      const { error: oe } = await db.from('appearances').delete().eq('match_id', mid).neq('team_id', tid).in('player_id', keep);
      if (oe) throw new Error(`Clearing the old sheet: ${oe.message}`);
    }
    const { error: ie } = await upsertApps(out.map((e) => ({
      match_id: mid, team_id: tid, player_id: e.id, jersey_no: e.no, started: e.no ? e.no <= 15 : false, goals: 0, points: 0,
    })));
    if (ie) throw new Error(`Saving the sheet: ${ie.message}`);
    await syncAppearanceScores(mid);
    await syncSubMinutes(mid).catch(() => {});
    return { ok: true, entries: out };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// Moves every appearance of one player onto another and removes the first:
// for the same player saved under two spellings.
export async function mergePlayers(fromId, intoId) {
  try {
    await requireAdmin();
    const a = Number(fromId), b = Number(intoId);
    if (!a || !b || a === b) throw new Error('Pick a different player to merge into.');
    const { error } = await db.from('appearances').update({ player_id: b }).eq('player_id', a);
    if (error) throw new Error(error.message);
    await db.from('players').delete().eq('id', a);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
