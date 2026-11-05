import { createClient } from '@supabase/supabase-js';
import { cleanEventNames } from './players';

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

const EVENT_COLS = 'id, team_id, event_type, outcome, minute, half, start_sec, player_no, code, labels';

// Supabase returns at most 1,000 rows per request, so page through a match's events.
export async function loadEvents(matchId) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('events').select(EVENT_COLS).eq('match_id', matchId)
      .order('start_sec', { ascending: true }).order('id', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) return cleanEventNames(out);
  }
}
