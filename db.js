import { createClient } from '@supabase/supabase-js';

// Server-side only: the secret key is never sent to visitors' browsers.
export const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

export const MATCH_SELECT =
  '*, team1:teams!team1_id(name), team2:teams!team2_id(name), competitions(name, grade, show_player_names, seasons(year))';

// Players who appeared in any competition with names hidden (underage) are never shown.
export async function hiddenPlayerIds(ids) {
  if (!ids.length) return new Set();
  const { data } = await db
    .from('appearances')
    .select('player_id, matches!inner(competitions!inner(show_player_names))')
    .in('player_id', ids)
    .eq('matches.competitions.show_player_names', false);
  return new Set((data || []).map((r) => r.player_id));
}
