'use server';

import { db } from '../../../lib/db';
import { requireAdmin } from '../../../lib/session';

const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');

// Set (or clear, with an empty name) what a tag name means for one team.
export async function setAlias(teamId, alias, name) {
  try {
    await requireAdmin();
    const tid = Number(teamId), a = clean(alias), n = clean(name);
    if (!tid || !a) throw new Error('Missing team or tag name.');
    const { data: found } = await db.from('name_aliases').select('id').eq('team_id', tid).ilike('alias', a).limit(1);
    if (!n || n.toLowerCase() === a.toLowerCase()) {
      if (found?.length) await db.from('name_aliases').delete().eq('id', found[0].id);
      return { ok: true, cleared: true };
    }
    const { error } = found?.length
      ? await db.from('name_aliases').update({ name: n }).eq('id', found[0].id)
      : await db.from('name_aliases').insert({ team_id: tid, alias: a, name: n });
    if (error) throw new Error(error.message);
    return { ok: true, name: n };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
