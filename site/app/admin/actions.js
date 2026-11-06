'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '../../lib/db';
import { requireAdmin, requireSuper, currentAccess } from '../../lib/session';
import { assertMatch, currentOrg } from '../../lib/org';

const clean = (s) => String(s ?? '').trim();
const num = (v) => (v === '' || v == null ? 0 : Math.max(0, parseInt(v, 10) || 0));

async function teamId(name) {
  const n = clean(name);
  if (!n) throw new Error('Both teams need a name.');
  const { data } = await db.from('teams').select('id').ilike('name', n).limit(1);
  if (data?.length) return data[0].id;
  const { data: made, error } = await db.from('teams').insert({ name: n }).select('id').single();
  if (error) throw new Error(`Adding team ${n}: ${error.message}`);
  return made.id;
}

const friendly = (msg) =>
  /duplicate key|unique/i.test(msg)
    ? 'There’s already a game with those teams on that date in that competition.'
    : msg;

// ---- Games ---------------------------------------------------------------
export async function updateGame(_prev, form) {
  try {
    await requireAdmin();
    const id = Number(form.get('id'));
    await assertMatch(id);
    const [t1, t2] = await Promise.all([teamId(form.get('team1')), teamId(form.get('team2'))]);
    if (t1 === t2) throw new Error('The two teams are the same.');
    const oldT1 = Number(form.get('old_team1'));
    const row = {
      match_date: clean(form.get('date')),
      competition_id: Number(form.get('competition')),
      stage: clean(form.get('stage')) || null,
      team1_id: t1, team2_id: t2,
      team1_goals: num(form.get('g1')), team1_points: num(form.get('p1')),
      team2_goals: num(form.get('g2')), team2_points: num(form.get('p2')),
    };
    if (!row.match_date) throw new Error('The game needs a date.');
    const { error } = await db.from('matches').update(row).eq('id', id);
    if (error) throw new Error(friendly(error.message));
    // If a team was renamed to a different team, move its events and appearances across.
    const oldT2 = Number(form.get('old_team2'));
    for (const [from, to] of [[oldT1, t1], [oldT2, t2]]) {
      if (from && from !== to) {
        await db.from('events').update({ team_id: to }).eq('match_id', id).eq('team_id', from);
        await db.from('appearances').update({ team_id: to }).eq('match_id', id).eq('team_id', from);
      }
    }
    revalidatePath('/', 'layout');
    return { ok: 'Saved.' };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

export async function deleteGame(_prev, form) {
  try {
    await requireAdmin();
    const id = Number(form.get('id'));
    await assertMatch(id);
    if (clean(form.get('confirm')).toUpperCase() !== 'DELETE') throw new Error('Type DELETE to confirm.');
    for (const t of ['events', 'appearances', 'match_stats']) {
      const { error } = await db.from(t).delete().eq('match_id', id);
      if (error && !/does not exist|schema cache/i.test(error.message)) throw new Error(`Removing ${t}: ${error.message}`);
    }
    const { error } = await db.from('matches').delete().eq('id', id);
    if (error) throw new Error(error.message);
  } catch (e) {
    return { error: String(e.message || e) };
  }
  revalidatePath('/', 'layout');
  redirect('/admin?deleted=1');
}

// ---- Competitions --------------------------------------------------------
// Competitions are shared rows: an organisation's admin can change one only
// if every game in it is theirs (otherwise it's for the site owner).
async function compIsMine(id) {
  const a = await currentAccess();
  if (a?.isSuper) return;
  const o = await currentOrg();
  if (!o.ready) return;
  const { data } = await db.from('matches').select('org_id').eq('competition_id', id);
  if ((data || []).some((m) => m.org_id !== o.id)) throw new Error('Other organisations use this competition too, so only the site owner can change it.');
}
export async function updateCompetition(_prev, form) {
  try {
    await requireAdmin();
    const id = Number(form.get('id'));
    await compIsMine(id);
    const row = {
      name: clean(form.get('name')),
      grade: clean(form.get('grade')) || 'Senior',
      show_player_names: form.get('show_names') === 'on',
    };
    if (!row.name) throw new Error('The competition needs a name.');
    const { error } = await db.from('competitions').update(row).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
    return { ok: 'Saved.' };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// Moves every game from one competition into another, then removes the empty one.
export async function mergeCompetition(_prev, form) {
  try {
    await requireSuper();
    const from = Number(form.get('id'));
    const into = Number(form.get('into'));
    if (!into || into === from) throw new Error('Choose a different competition to merge into.');
    const { error } = await db.from('matches').update({ competition_id: into }).eq('competition_id', from);
    if (error) throw new Error(friendly(error.message));
    const { error: de } = await db.from('competitions').delete().eq('id', from);
    if (de) throw new Error(de.message);
  } catch (e) {
    return { error: String(e.message || e) };
  }
  revalidatePath('/', 'layout');
  redirect('/admin?merged=1');
}

// ---- Teams -----------------------------------------------------------------
// Kick-out results name the winning team ("York Clean"), so a team's games
// are rewritten with its new name when it's renamed or merged.
async function renameInOutcomes(matchIds, oldName, newName) {
  if (!matchIds.length || oldName.toLowerCase() === newName.toLowerCase()) return;
  const { data } = await db.from('events').select('outcome').in('match_id', matchIds).eq('event_type', 'Kickout').limit(10000);
  const outs = [...new Set((data || []).map((e) => e.outcome).filter(Boolean))];
  for (const o of outs) {
    if (!o.toLowerCase().startsWith(`${oldName.toLowerCase()} `)) continue;
    await db.from('events').update({ outcome: `${newName}${o.slice(oldName.length)}` }).in('match_id', matchIds).eq('outcome', o);
  }
}
async function gamesOf(id) {
  const { data } = await db.from('matches').select('id').or(`team1_id.eq.${id},team2_id.eq.${id}`);
  return (data || []).map((m) => m.id);
}

export async function renameTeam(_prev, form) {
  try {
    await requireSuper();
    const id = Number(form.get('id'));
    const name = clean(form.get('name'));
    if (!id || !name) throw new Error('Give the team a name.');
    const { data: t } = await db.from('teams').select('id, name').eq('id', id).single();
    if (!t) throw new Error('Team not found.');
    const { data: clash } = await db.from('teams').select('id').ilike('name', name).neq('id', id).limit(1);
    if (clash?.length) throw new Error(`There’s already a team called ${name}: use Merge instead.`);
    const { error } = await db.from('teams').update({ name }).eq('id', id);
    if (error) throw new Error(error.message);
    await renameInOutcomes(await gamesOf(id), t.name, name);
  } catch (e) {
    return { error: String(e.message || e) };
  }
  revalidatePath('/', 'layout');
  redirect('/admin?teams=renamed#teams');
}

// Moves everything from one team onto another (games, tags, team sheets, tidied
// names), then removes the first: e.g. "York" into "New York".
export async function mergeTeam(_prev, form) {
  try {
    await requireSuper();
    const from = Number(form.get('id'));
    const into = Number(form.get('into'));
    if (!into || into === from) throw new Error('Choose a different team to merge into.');
    const { data: tf } = await db.from('teams').select('id, name').eq('id', from).single();
    const { data: ti } = await db.from('teams').select('id, name').eq('id', into).single();
    if (!tf || !ti) throw new Error('Team not found.');
    const ids = await gamesOf(from);
    for (const [col] of [['team1_id'], ['team2_id']]) {
      const { error } = await db.from('matches').update({ [col]: into }).eq(col, from);
      if (error) throw new Error(friendly(error.message));
    }
    await db.from('events').update({ team_id: into }).eq('team_id', from);
    await db.from('appearances').update({ team_id: into }).eq('team_id', from);
    await db.from('name_aliases').update({ team_id: into }).eq('team_id', from); // table may not exist yet: ignored
    await renameInOutcomes(ids, tf.name, ti.name);
    const { error: de } = await db.from('teams').delete().eq('id', from);
    if (de) throw new Error(de.message);
  } catch (e) {
    return { error: String(e.message || e) };
  }
  revalidatePath('/', 'layout');
  redirect('/admin?teams=merged#teams');
}

// Removes a team with no games (e.g. a stray name from a file).
export async function deleteTeam(_prev, form) {
  try {
    await requireSuper();
    const id = Number(form.get('id'));
    const ids = await gamesOf(id);
    if (ids.length) throw new Error(`This team has ${ids.length} game${ids.length === 1 ? '' : 's'}: merge it into the right team, or delete those games first.`);
    await db.from('appearances').delete().eq('team_id', id);
    await db.from('name_aliases').delete().eq('team_id', id);
    const { error } = await db.from('teams').delete().eq('id', id);
    if (error) throw new Error(error.message);
  } catch (e) {
    return { error: String(e.message || e) };
  }
  revalidatePath('/', 'layout');
  redirect('/admin?teams=deleted#teams');
}
