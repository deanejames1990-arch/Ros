'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../../lib/db';
import { requireAdmin } from '../../lib/session';
import { scoped, orgScope, orgStamp, currentOrg } from '../../lib/org';

// The briefing must be this organisation's.
async function assertBriefing(id) {
  const o = await currentOrg();
  if (!o.ready) return;
  const { data } = await db.from('briefings').select('org_id').eq('id', Number(id)).single();
  if (!data || data.org_id !== o.id) throw new Error('Briefing not found.');
}

export async function createBriefing(_prev, form) {
  let id;
  try {
    await requireAdmin();
    const teamId = Number(form.get('team'));
    if (!teamId) throw new Error('Pick the opposition.');
    const { data: t } = await db.from('teams').select('id, name').eq('id', teamId).single();
    if (!t) throw new Error('Team not found.');
    // Start from their last four games on the site.
    const { data: all } = await (await orgScope())(db.from('matches').select('id, match_date, team1_id, team2_id')).or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
      .order('match_date', { ascending: false });
    const games = (all || []).filter((m) => m.team1_id === teamId || m.team2_id === teamId).slice(0, 4);
    const title = String(form.get('title') || '').trim() || `${t.name} briefing`;
    const { data, error } = await db.from('briefings').insert({ ...(await orgStamp()), team_id: teamId, title, game_ids: (games || []).map((g) => g.id) }).select('id').single();
    if (error) throw new Error(error.message);
    id = data.id;
  } catch (e) {
    return { error: String(e.message || e) };
  }
  redirect(`/briefing/${id}?edit=1`);
}

export async function saveBriefing(id, _prev, form) {
  try {
    await requireAdmin();
    await assertBriefing(id);
    const notes = {}, links = {};
    for (const [k, v] of form.entries()) {
      if (k.startsWith('note:') && String(v).trim()) notes[k.slice(5)] = String(v).trim();
      if (k.startsWith('link:') && String(v).trim()) {
        const u = String(v).trim();
        if (!/^https?:\/\//i.test(u)) throw new Error('Links need to start with https://');
        links[k.slice(5)] = u;
      }
    }
    const upd = {
      title: String(form.get('title') || '').trim() || 'Briefing',
      game_ids: form.getAll('games').map(Number).filter(Boolean),
      notes, links, published: form.get('published') === 'on', updated_at: new Date().toISOString(),
    };
    const { error } = await db.from('briefings').update(upd).eq('id', Number(id));
    if (error) throw new Error(error.message);
  } catch (e) {
    return { error: String(e.message || e) };
  }
  revalidatePath(`/briefing/${id}`);
  redirect(`/briefing/${id}?saved=1`);
}

export async function deleteBriefing(id) {
  await requireAdmin();
  await assertBriefing(id);
  await db.from('briefings').delete().eq('id', Number(id));
  redirect('/briefing');
}
