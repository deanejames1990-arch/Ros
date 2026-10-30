'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '../../lib/db';
import { requireAdmin } from '../../lib/session';

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
export async function updateCompetition(_prev, form) {
  try {
    await requireAdmin();
    const id = Number(form.get('id'));
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
    await requireAdmin();
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
