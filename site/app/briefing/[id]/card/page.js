import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { db } from '../../../../lib/db';
import { currentAccess } from '../../../../lib/session';
import { briefingData } from '../../../../lib/briefing';
import { getCrests } from '../../../../lib/crests';
import { quarterTrend } from '../../../../lib/pss';
import { targetFor } from '../../../../lib/targets';
import CardView from './CardView';
import { playerShotZones } from '../../../report/sections';
import { suggestKeyMessages } from '../../../../lib/briefing-suggest';
import { currentOrg } from '../../../../lib/org';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Briefing infographic · James Deane Analysis' };

const lines = (t) => String(t || '').split('\n').map((x) => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
const one = (x) => (x == null ? null : Math.round(x * 10) / 10);

// One portrait image (1080 × 1920) for the WhatsApp group: the briefing's key
// messages and the headline numbers from the same games.
export default async function BriefingCard({ params }) {
  const access = await currentAccess();
  const admin = access?.role === 'admin';
  const { data: b } = await db.from('briefings').select('*').eq('id', Number(params.id)).single();
  if (!b || (!b.published && !admin)) notFound();
  { const o = await currentOrg(); if (o.ready && b.org_id !== o.id) notFound(); }
  const [d, crests] = await Promise.all([briefingData(b.team_id, b.game_ids, access, admin), getCrests()]);
  if (!d) notFound();
  const { team, rows, tagged, mine, opp } = d;
  const n = tagged.length;
  const grade = rows[0]?.m.competitions?.grade || '';
  const t = targetFor(grade);
  const trend = n ? quarterTrend(tagged.map((r) => ({ mine: r.mine, opp: r.opp }))) : null;

  // Main threats: most points over these games, with where they shoot from.
  const threats = (mine?.players || [])
    .filter((p) => p.points > 0 && !/^#\d+$/.test(p.name))
    .sort((x, y) => y.points - x.points || y.scores - x.scores)
    .slice(0, 3)
    .map((p) => ({
      name: p.name, goals: p.goals, points: p.points, games: p.games || 1, shots: p.shots, scores: p.scores,
      conv: p.shots ? Math.round((100 * p.scores) / p.shots) : null, frees: p.freesScored || 0, two: p.twoScored || 0,
      // From play only: frees are taken where the foul was, not where he chose to shoot.
      zones: (() => { const z = playerShotZones(p).play; return Object.values(z).reduce((t, r) => t + r.n, 0) >= 3 ? z : null; })(),
    }));

  const ko = mine?.kickouts;
  const sources = (mine?.sources || []).filter((s) => s.points > 0);
  const srcTotal = sources.reduce((s, x) => s + x.points, 0);

  const host = headers().get('x-forwarded-host') || headers().get('host') || '';
  const proto = headers().get('x-forwarded-proto') || 'https';
  const url = `${proto}://${host}/briefing/${b.id}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 260, color: { dark: '#1A2E4A', light: '#FFFFFF' } });

  const model = {
    id: b.id, title: b.title, team: team.name, crest: crests.byId[team.id] || null, grade,
    comp: [...new Set(rows.map((r) => r.m.competitions?.name).filter(Boolean))].slice(0, 2).join(' · '),
    n, published: b.published,
    results: rows.slice(0, 5).map((r) => ({
      date: new Date(r.m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }),
      opp: r.oppName, res: r.res, line: r.line,
    })),
    // Your key messages; until there are any, the top suggested ones (flagged on the page).
    messages: lines(b.notes?.summary).length ? lines(b.notes?.summary).slice(0, 4) : suggestKeyMessages(d, quarterTrend).slice(0, 4).map((x) => x.text),
    suggested: !lines(b.notes?.summary).length,
    perGame: n ? {
      points: one(mine.total / n), against: one(opp.total / n), scores: one(mine.scores / n), shots: one(mine.shots / n),
      poss: mine.possessions ? one(mine.possessions / n) : null, conv: mine.conv,
      possToScore: mine.possessions ? Math.round((100 * mine.scores) / mine.possessions) : null,
    } : null,
    target: t,
    quarters: trend ? trend.quarters.map((q) => ({ q: q.q, points: one(q.points), against: q.against == null ? null : one(q.against), poss: one(q.poss), shots: one(q.shots), scores: one(q.scores) })) : [],
    best: trend?.best?.q || null, worst: trend?.worst?.q || null, allBehind: Boolean(trend?.allBehind),
    ko: ko && ko.total ? {
      total: ko.total, perGame: one(ko.total / n), retPct: ko.retPct, retained: ko.retained, known: ko.total - ko.unknown,
      wonClean: ko.wonClean, wonBreak: ko.wonBreak, lostBreak: ko.lostBreak, lostClean: ko.lostClean,
      zones: mine.kickoutZones || {},
      dist: (ko.byDist || []).filter((x) => x.dist !== '—'),
    } : null,
    // Their opponents' kick-outs: how many they won.
    theirsOnOpp: opp?.kickouts?.total ? { total: opp.kickouts.total, winPct: opp.kickouts.retPct == null ? null : 100 - opp.kickouts.retPct } : null,
    sources: sources.slice(0, 5).map((s) => ({ source: s.source, points: s.points, pct: srcTotal ? Math.round((100 * s.points) / srcTotal) : 0 })),
    threats,
    url, qr,
  };
  return <CardView model={model} admin={admin} />;
}
