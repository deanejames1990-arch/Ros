import { createClient } from '@supabase/supabase-js';

// Server-side only: the secret key is never sent to visitors' browsers.
// Next.js caches fetch() on the server by default; stats must always be live,
// so every database request opts out of that cache.
export const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
  global: { fetch: (url, opts = {}) => fetch(url, { ...opts, cache: 'no-store' }) },
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
