'use server';

import { revalidatePath } from 'next/cache';
import { db, MATCH_SELECT, loadEvents } from '../../../lib/db';
import { requireAdmin } from '../../../lib/session';
import { scoped } from '../../../lib/org';

const low = (s) => String(s || '').trim().toLowerCase();
const isShot = (e) => /^shot/i.test(e.event_type || '');
const isFreeShot = (e) => /\((F|45|Mark|Pen)/i.test(e.event_type || '') || /penalty|^45$/i.test(e.labels?.Source || '');
const kindOk = (e, k) => (k === 'free' ? isFreeShot(e) : !isFreeShot(e));
const scoredExcel = (o) => /goal|point/i.test(o) && !/wide|short|save/i.test(o);
const scoredSite = (e) => /goal|point/i.test(e.outcome || '');
const TOL = 4; // seconds either side

// Finds the site game for an Excel game (both teams, same year; competition word breaks ties).
function findGame(all, g) {
  const want = g.teams.map(low);
  const hits = all.filter((m) => {
    const names = [low(m.team1?.name), low(m.team2?.name)];
    return want.every((w) => names.some((n) => n === w || n.startsWith(`${w} `) || w.startsWith(`${n} `)))
      && (!g.year || new Date(m.match_date).getFullYear() === g.year);
  });
  if (hits.length <= 1) return { m: hits[0] || null, others: 0 };
  const c = low(g.comp);
  const byComp = hits.filter((m) => (c.includes('league') ? /league|nfl/i.test(m.competitions?.name || '') : !/league|nfl/i.test(m.competitions?.name || '')));
  return { m: byComp.length === 1 ? byComp[0] : null, others: hits.length, choices: hits.map((m) => ({ id: m.id, title: `${m.team1.name} v ${m.team2.name}`, date: m.match_date, comp: m.competitions?.name })) };
}

// games: from shotsFromWorkbook. pick: { [gameKey]: matchId } to settle ties.
// apply=false: preview only. Returns a line per game.
export async function matchExcelShots(games, { apply = false, overwrite = false, pick = {} } = {}) {
  try {
    await requireAdmin();
    const { data: all, error } = await scoped(db.from('matches').select(MATCH_SELECT));
    if (error) throw new Error(error.message);
    const out = [];
    for (const g of games || []) {
      const found = pick[g.key] ? { m: all.find((m) => m.id === Number(pick[g.key])) } : findGame(all, g);
      const m = found.m;
      const line = { key: g.key, title: `${g.teams.join(' v ')} · ${g.comp} ${g.year || ''}`, shots: g.shots.length, choices: found.choices || null };
      if (!m) { out.push({ ...line, status: found.others ? 'pick' : 'missing' }); continue; }
      const teamId = (name) => [{ id: m.team1_id, n: low(m.team1.name) }, { id: m.team2_id, n: low(m.team2.name) }].find((t) => t.n === low(name) || t.n.startsWith(`${low(name)} `) || low(name).startsWith(`${t.n} `))?.id;
      const events = (await loadEvents(m.id)).filter(isShot);
      const used = new Set();
      const updates = [];
      const unmatched = [];
      let boxes = 0, names = 0, matched = 0, sameBox = 0;
      // Closest shot by the same team within a few seconds; same kind and result preferred.
      for (const s of [...g.shots].sort((a, b) => a.secs - b.secs)) {
        const tid = teamId(s.team);
        const cands = events.filter((e) => e.team_id === tid && !used.has(e.id) && e.start_sec != null && Math.abs(Number(e.start_sec) - s.secs) <= TOL);
        const score = (e) => Math.abs(Number(e.start_sec) - s.secs) + (kindOk(e, s.kind) ? 0 : 3) + (scoredSite(e) === scoredExcel(s.outcome) ? 0 : 2);
        const e = cands.sort((a, b) => score(a) - score(b))[0];
        if (!e) { unmatched.push({ team: s.team, time: `${Math.floor(s.secs / 60)}:${String(s.secs % 60).padStart(2, '0')}`, outcome: s.outcome, player: s.player, box: s.box }); continue; }
        used.add(e.id); matched += 1;
        const labels = { ...(e.labels || {}) };
        let changed = false;
        if (s.box != null) {
          const had = String(labels.Zone || '').match(/\d+/)?.[0];
          if (had === s.box) sameBox += 1;
          else if (!had || overwrite) { labels.Zone = `Box ${s.box}`; boxes += 1; changed = true; }
        }
        if (s.player && !labels.Players && !e.player_no) { labels.Players = s.player; names += 1; changed = true; }
        if (changed) updates.push({ id: e.id, labels });
      }
      if (apply) {
        for (let i = 0; i < updates.length; i += 25) {
          const res = await Promise.all(updates.slice(i, i + 25).map((u) => db.from('events').update({ labels: u.labels }).eq('id', u.id)));
          const bad = res.find((r) => r.error);
          if (bad) throw new Error(`Saving ${line.title}: ${bad.error.message}`);
        }
      }
      out.push({ ...line, status: 'ok', matchId: m.id, site: `${m.team1.name} v ${m.team2.name} · ${m.competitions?.name || ''} · ${m.match_date}`, siteShots: events.length, matched, boxes, names, sameBox, unmatched: unmatched.slice(0, 40), unmatchedCount: unmatched.length });
    }
    if (apply) revalidatePath('/', 'layout');
    return { ok: true, games: out, applied: apply };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
