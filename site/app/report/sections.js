// Report sections shared by the match page (one game) and the team page
// (several games added together). Each side is a byTeam entry from
// analyseMatch, or the result of combineSides.
import { Versus } from '../match/[id]/charts';
import { hit, hitRates, targetText } from '../../lib/targets';

// "12-8-6" with each part marked against the quarter target (when there is one).
export function Pss({ q, t, showPoss = true }) {
  const h = hit(q, t);
  const part = (k) => <span className={h ? (h[k] ? 'pss-ok' : 'pss-miss') : ''}>{q[k]}</span>;
  return (
    <span className={`pss ${h?.all ? 'pss-all' : ''}`} title={t ? `Target ${targetText(t)}${h?.all ? ': met' : ''}` : undefined}>
      {showPoss && <>{part('poss')}-</>}{part('shots')}-{part('scores')}
    </span>
  );
}

// Possessions – shots – scores table: one row per side (team, opposition…).
// rows: [{ name, href?, color?, s: pssSummary(...), note? }]
const f1 = (v) => (v == null ? '–' : v.toFixed(1));
export function PssTable({ rows, t, caption }) {
  const shown = rows.filter((r) => r.s);
  if (!shown.length) return null;
  return (
    <div className="card">
      <div className="wrap">
        <table className="nums pss-table">
          <thead>
            <tr>
              <th />
              <th>Games</th>
              <th title="Per game: possessions-shots-scores">Per game</th>
              <th title={t ? `Average quarter, marked against the target ${targetText(t)}` : 'Average quarter'}>Avg quarter{t ? ` (${targetText(t)})` : ''}</th>
              <th title="Shots from possessions">Poss → shot</th>
              <th title="Scores from shots">Shot → score</th>
              <th title="Scores from possessions">Poss → score</th>
              <th>Pts a game</th>
              {shown.some((r) => r.trend) && <th>Best quarter</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const s = r.s, q = s.quarter, g = s.perGame;
              const h = q && t ? hit({ poss: Math.round(q.poss * 10) / 10, shots: Math.round(q.shots * 10) / 10, scores: Math.round(q.scores * 10) / 10 }, t) : null;
              const mark = (k) => (h ? (h[k] ? 'pss-ok' : 'pss-miss') : '');
              return (
                <tr key={r.name} className={r.strong ? 'strong' : ''}>
                  <td>{r.color && <i className="sw" style={{ background: r.color }} />}{r.href ? <a href={r.href}>{r.name}</a> : r.name}{r.note && <small className="muted"> {r.note}</small>}</td>
                  <td>{s.games}</td>
                  <td>{s.hasPoss ? `${f1(g.poss)}-` : ''}{f1(g.shots)}-{f1(g.scores)}</td>
                  <td>{q ? <span className={`pss ${h?.all ? 'pss-all' : ''}`}><span className={mark('poss')}>{f1(q.poss)}</span>-<span className={mark('shots')}>{f1(q.shots)}</span>-<span className={mark('scores')}>{f1(q.scores)}</span></span> : '–'}</td>
                  <td>{s.possToShot == null || !s.hasPoss ? '–' : `${s.possToShot}%`}</td>
                  <td>{s.shotToScore == null ? '–' : `${s.shotToScore}%`}</td>
                  <td>{s.possToScore == null || !s.hasPoss ? '–' : `${s.possToScore}%`}</td>
                  <td>{f1(g.points)}</td>
                  {shown.some((x) => x.trend) && <td>{r.trend ? <>{r.trend.best.q} <small className="muted">{r.trend.best.against != null ? `${r.trend.best.points - r.trend.best.against >= 0 ? '+' : '−'}${Math.abs(r.trend.best.points - r.trend.best.against).toFixed(1)}` : `${r.trend.best.points.toFixed(1)} pts`}</small></> : '–'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {caption && <p className="muted small">{caption}</p>}
    </div>
  );
}

// Call-out: a team's best and weakest quarter across games, with a strip of
// every quarter's average. trend: quarterTrend(...).
export function QuarterTrend({ name, trend, t, color = '#3b4f9e' }) {
  if (!trend || trend.games < 1) return null;
  const { best, worst, quarters, games } = trend;
  const line = (q) => `${q.poss ? `${q.poss.toFixed(1)}-` : ''}${q.shots.toFixed(1)}-${q.scores.toFixed(1)}`;
  const won = (q) => (q.vs ? `; won it in ${q.won} of ${q.vs} game${q.vs === 1 ? '' : 's'}` : '');
  const mg = (q) => (q.against == null ? '' : ` (${q.points - q.against >= 0 ? '+' : '−'}${Math.abs(q.points - q.against).toFixed(1)} a game)`);
  const max = Math.max(1, ...quarters.map((q) => Math.max(q.points, q.against || 0)));
  return (
    <div className="card q-trend">
      <p className="q-call"><b>{name}’s best quarter is {best.q}</b>{mg(best)}: {best.points.toFixed(1)} points{best.against != null ? ` v ${best.against.toFixed(1)}` : ''} from {line(best)}{won(best)}.
        {games > 1 && worst.q !== best.q && <> Weakest is <b>{worst.q}</b>{mg(worst)}: {worst.points.toFixed(1)} points{worst.against != null ? ` v ${worst.against.toFixed(1)}` : ''} from {line(worst)}{won(worst)}.</>}
      </p>
      <div className="q-strip">
        {quarters.map((q) => {
          const h = t && q.poss ? hit({ poss: Math.round(q.poss * 10) / 10, shots: Math.round(q.shots * 10) / 10, scores: Math.round(q.scores * 10) / 10 }, t) : null;
          return (
            <div key={q.q} className={`q-cell ${q.q === best.q ? 'best' : ''}`}>
              <span className="stat-k">{q.q}{q.q === best.q ? ' · best' : q.q === worst.q && games > 1 ? ' · weakest' : ''}</span>
              <div className="q-bars" title={`${q.q}: ${q.points.toFixed(1)} points a game${q.against != null ? `, conceding ${q.against.toFixed(1)}` : ''}`}>
                <i style={{ height: `${(100 * q.points) / max}%`, background: color }} />
                {q.against != null && <i style={{ height: `${(100 * q.against) / max}%`, background: '#c4572a' }} />}
              </div>
              <b className="num">{q.points.toFixed(1)}{q.against != null && <small> v {q.against.toFixed(1)}</small>}</b>
              <span className={`small ${h?.all ? 'pss-ok' : ''}`}>{line(q)}</span>
              {q.vs > 0 && <span className="muted small">won {q.won}/{q.vs}</span>}
            </div>
          );
        })}
      </div>
      <p className="muted small">Points a game in each quarter{quarters[0].against != null ? ' (bar on the right: points conceded)' : ''}, with possessions-shots-scores, over {games} game{games === 1 ? '' : 's'}.</p>
    </div>
  );
}

// Season card: how often the quarter target was hit.
export function QuarterTargets({ name, quarters, t, games }) {
  const r = hitRates(quarters, t);
  if (!r) return null;
  const pc = (n) => Math.round((100 * n) / r.n);
  return (
    <>
      <h2>Quarter targets <span className="muted">· {targetText(t)}</span></h2>
      <div className="card">
        <div className="target-grid">
          <div><b className="num">{r.all}/{r.n}</b><span>quarters hit all three</span><small>{pc(r.all)}%</small></div>
          <div><b className="num">{r.poss}/{r.n}</b><span>{t.poss}+ possessions</span><small>{pc(r.poss)}%</small></div>
          <div><b className="num">{r.shots}/{r.n}</b><span>{t.shots}+ shots</span><small>{pc(r.shots)}%</small></div>
          <div><b className="num">{r.scores}/{r.n}</b><span>{t.scores}+ scores</span><small>{pc(r.scores)}%</small></div>
        </div>
        <p className="muted small">{name}, {r.n} quarters from {games} tagged game{games === 1 ? '' : 's'}. Target: {t.poss} possessions, {t.shots} shots, {t.scores} scores a quarter.</p>
      </div>
    </>
  );
}

const pct = (v) => (v == null ? '—' : `${v}%`);
const rate = (a, b) => (b ? Math.round((100 * a) / b) : null);

// Kick-out landing boxes laid out as on the pitch: 3 columns, 5 rows.
export const GRID = [['2', '3', '4'], ['5', '6', '7'], ['8', '0', '9'], ['10', '11', '12'], ['13', '14', '15']];

// kind 'ko': kick-outs per box with won/lost; kind 'shot': shots per box with scored.
export function ZoneGrid({ name, zones, color, kind = 'ko' }) {
  const max = Math.max(1, ...Object.values(zones).map((z) => z.n));
  return (
    <div className="zone-wrap">
      <div className="zone-title">{name}</div>
      <div className="zone-grid">
        {GRID.flat().map((b) => {
          const z = zones[b];
          const shade = z ? 0.15 + 0.6 * (z.n / max) : 0;
          return (
            <div key={b} className="zone" style={z ? { background: `color-mix(in srgb, ${color} ${Math.round(shade * 100)}%, #fff)` } : undefined}
              title={z ? (kind === 'shot' ? `Box ${b}: ${z.n} shots, ${z.won} scored` : `Box ${b}: ${z.n} kick-outs, ${z.won} won, ${z.n - z.won} lost`) : `Box ${b}: none`}>
              <span className="zone-no">{b}</span>
              {z && <b>{z.n}</b>}
              {z && <span className="zone-wl">{kind === 'shot' ? `${z.won} scored` : `${z.won}W ${z.n - z.won}L`}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function KickoutSection({ A, B, a, b }) {
  const ka = a.kickouts, kb = b.kickouts;
  if (!ka.total && !kb.total) return null;
  const len = (k, d) => k.byDist.find((x) => x.dist === d);
  const dists = [...new Set([...ka.byDist, ...kb.byDist].map((d) => d.dist))].filter((d) => d !== '—').sort((x, y) => 'SML'.indexOf(x[0]) - 'SML'.indexOf(y[0]));
  const name = { SKO: 'Short', MKO: 'Medium', LKO: 'Long' };
  const hasZones = Object.keys(a.kickoutZones || {}).length || Object.keys(b.kickoutZones || {}).length;
  return (
    <>
      <h2>Own kick-outs</h2>
      <div className="card">
        <Versus a={A} b={B} rows={[
          { label: 'Taken', a: ka.total, b: kb.total },
          { label: 'Retained', a: ka.retPct, b: kb.retPct, max: 100, fmt: pct, aNote: `${ka.retained} of ${ka.total - ka.unknown}`, bNote: `${kb.retained} of ${kb.total - kb.unknown}` },
          { heading: 'How they finished' },
          { label: 'Won clean', a: ka.wonClean, b: kb.wonClean },
          { label: 'Won break', a: ka.wonBreak, b: kb.wonBreak },
          { label: 'Lost break', a: ka.lostBreak, b: kb.lostBreak },
          { label: 'Lost clean', a: ka.lostClean, b: kb.lostClean },
          ...(dists.length ? [{ heading: 'Short, medium or long' }] : []),
          ...dists.map((d) => {
            const x = len(ka, d), y = len(kb, d);
            return { label: name[d] || d, a: x?.total ?? 0, b: y?.total ?? 0, aNote: x ? `${x.won} won` : '', bNote: y ? `${y.won} won` : '' };
          }),
        ]} />
        {hasZones ? (
          <>
            <div className="vs-heading">Landing zone (box number, kicking team’s goal at the top)</div>
            <div className="zones">
              <ZoneGrid name={A.name} zones={a.kickoutZones || {}} color={A.color} />
              <ZoneGrid name={B.name} zones={b.kickoutZones || {}} color={B.color} />
            </div>
            <p className="muted small center">Kick-outs per box, with won (W) and lost (L).</p>
          </>
        ) : null}
        <p className="takeaway">{A.name} retain {pct(ka.retPct)} of their kick-outs, {B.name} {pct(kb.retPct)}.</p>
      </div>
    </>
  );
}

// "of 7 tried", or a note when missed two-point attempts aren't tagged.
function twoNote(d, games = 1) {
  const g = d.twoTrackedGames || 0;
  if (!g) return 'attempts not tagged';
  if (games > 1 && g < games) return `${d.twoScoredTracked} of ${d.twoTried} tried in ${g} of ${games} games`;
  return `of ${d.twoTried} tried`;
}

export function ShootingSection({ A, B, a, b }) {
  const da = a.shotsDetail, db = b.shotsDetail;
  const boxes = [...new Set([...Object.keys(a.shotBoxes || {}), ...Object.keys(b.shotBoxes || {})])].sort((x, y) => x - y);
  const score = (s) => `${s.goals}-${s.total - 3 * s.goals}`;
  const better = (a.ptsPerShot ?? 0) >= (b.ptsPerShot ?? 0) ? A.name : B.name;
  return (
    <>
      <h2>Shooting</h2>
      <div className="card">
        <Versus a={A} b={B} rows={[
          { label: 'Shots', a: a.shots, b: b.shots },
          { label: 'Scores', a: a.scores, b: b.scores },
          { label: 'Conversion', a: a.conv, b: b.conv, max: 100, fmt: pct },
          { label: 'Points', a: a.total, b: b.total },
          { label: 'Points per shot', a: a.ptsPerShot, b: b.ptsPerShot, max: 1.2, fmt: (v) => (v == null ? '—' : v.toFixed(2)) },
          { heading: 'What happened to the shots' },
          { label: 'Single points', a: da.singles, b: db.singles },
          { label: '2-pointers scored', a: da.twoScored, b: db.twoScored, aNote: twoNote(da, a.games), bNote: twoNote(db, b.games) },
          { label: 'Goals', a: da.goals, b: db.goals },
          { label: 'Wides', a: da.wides, b: db.wides },
          { label: 'Saved / blocked', a: da.savedBlocked, b: db.savedBlocked },
        ]} />
        {boxes.length > 0 && (
          <>
            <div className="vs-heading">Where shots were taken (box number, attacking goal at the bottom)</div>
            <div className="zones">
              <ZoneGrid name={A.name} kind="shot" color={A.color} zones={Object.fromEntries(Object.entries(a.shotBoxes || {}).map(([z, r]) => [z, { n: r.shots, won: r.scored }]))} />
              <ZoneGrid name={B.name} kind="shot" color={B.color} zones={Object.fromEntries(Object.entries(b.shotBoxes || {}).map(([z, r]) => [z, { n: r.shots, won: r.scored }]))} />
            </div>
          </>
        )}
        <p className="takeaway">
          {A.name} {score(a)} ({a.total} pts) from {a.shots} shots, {B.name} {score(b)} ({b.total} pts) from {b.shots}. {better} made more of each shot.
        </p>
        <p className="muted small center">Points counted 1 / 2 / 3 for a point, two-pointer and goal. Frees and 45s count as shots; saved / blocked includes short and post.</p>
      </div>
    </>
  );
}

export function PeriodSection({ A, B, a, b, unit = 'quarters' }) {
  const ra = unit === 'halves' ? a.halves : a.quarters;
  const rb = unit === 'halves' ? b.halves : b.quarters;
  const word = unit === 'halves' ? 'half' : 'quarter';
  const rows = (f, extra = {}) => ra.map((r, i) => ({ label: r.key, a: r[f], b: rb[i][f], ...extra(r, rb[i]) }));
  const won = ra.map((r, i) => (r.points > rb[i].points ? A.name : r.points < rb[i].points ? B.name : null));
  const aWins = won.filter((w) => w === A.name).length, bWins = won.filter((w) => w === B.name).length;
  return (
    <>
      <h2>{unit === 'halves' ? 'Half by half' : 'Quarter by quarter'}</h2>
      <div className="card">
        <Versus a={A} b={B} rows={[
          { heading: `Points scored in the ${word}` },
          ...rows('points', () => ({})),
          { heading: `Shots taken in the ${word}` },
          ...rows('shots', () => ({})),
          { heading: `Own kick-outs retained in the ${word}` },
          ...ra.map((r, i) => ({
            label: r.key, a: rate(r.koWon, r.koTotal), b: rate(rb[i].koWon, rb[i].koTotal), max: 100, fmt: pct,
            aNote: `${r.koWon} of ${r.koTotal}`, bNote: `${rb[i].koWon} of ${rb[i].koTotal}`,
          })),
        ]} />
        <p className="takeaway">
          {A.name} outscored {B.name} in {aWins} of {ra.length} {word === 'half' ? 'halves' : 'quarters'}; {B.name} won {bWins}.
        </p>
      </div>
    </>
  );
}

export function TurnoverSection({ A, B, a }) {
  const t = a.thirds;
  const tot = (o) => o.Def + o.Mid + o.Att;
  if (!tot(t.conceded) && !tot(t.wonBack)) return null;
  const cells = [['Def', 'Defensive third'], ['Mid', 'Middle third'], ['Att', 'Attacking third']];
  return (
    <>
      <h2>Where {A.name} gave it away</h2>
      <div className="card">
        <div className="thirds">
          {cells.map(([k, label]) => (
            <div key={k} className={`third ${k === 'Att' ? 'att' : ''}`}>
              <div className="third-label">{label}</div>
              <div className="third-nums">
                <div><b className="lost">{t.conceded[k]}</b><span>conceded</span></div>
                <div><b>{t.wonBack[k]}</b><span>won back</span></div>
              </div>
            </div>
          ))}
        </div>
        <p className="muted small">
          {A.name} attack left to right. Conceded = {A.name} turnovers lost; won back = {B.name} turnovers lost, shown in {A.name}’s frame.
          {t.conceded.none + t.wonBack.none > 0 && ` ${t.conceded.none} conceded and ${t.wonBack.none} won back have no third tagged.`}
        </p>
      </div>
    </>
  );
}

// Player table from the names on the tags. Columns with nothing in them are hidden.
const COLS = [
  { k: 'games', label: 'Games', only: 'multi' },
  { k: 'points', label: 'Pts' },
  { k: 'shots', label: 'Shots' },
  { k: 'scores', label: 'Scores' },
  { k: 'conv', label: 'Conv', fmt: (p) => (p.shots ? `${Math.round((100 * p.scores) / p.shots)}%` : '—'), need: 'shots' },
  { k: 'oneScored', label: '1-pt', need: 'oneTried', title: 'Single points scored' },
  { k: 'oneTried', label: '1-pt att', title: 'Single-point attempts (any shot that wasn’t a 2-point attempt or a goal)' },
  { k: 'twoScored', label: '2-pt', title: 'Two-pointers scored' },
  { k: 'twoTried', label: '2-pt att', title: 'Two-point attempts (only where missed attempts are tagged)', fmt: (p) => (p.twoTrackedGames ? p.twoTried || '—' : 'n/t'), need: 'twoTrackedGames' },
  { k: 'goals', label: 'Goals' },
  { k: 'frees', label: 'Frees', fmt: (p) => (p.frees ? `${p.freesScored}/${p.frees}` : '—') },
  { k: 'wides', label: 'Wides' },
  { k: 'poss', label: 'Poss' },
  { k: 'attacks', label: 'Attacks' },
  { k: 'koWon', label: 'KOs won' },
  { k: 'freesWon', label: 'Frees won' },
  { k: 'turnoversLost', label: 'T/O lost' },
  { k: 'tackles', label: 'Tackles' },
  { k: 'winbacks', label: 'Winbacks' },
  { k: 'assists', label: 'Assists' },
];

// A player's profile: their saved record if they're on a team sheet, otherwise
// built from the names in the team's tags. Bare numbers ("14") have no profile.
export function playerHref(team, name, links) {
  const id = links?.[String(name).toLowerCase()];
  if (id) return `/player/${id}`;
  if (!name || /^#?\d+$/.test(String(name).trim())) return null;
  return `/team/${encodeURIComponent(team)}/player/${encodeURIComponent(name)}`;
}

export function PlayerTable({ T, s, multi = false, limit = 12, hidden = false, links = null }) {
  if (hidden) {
    return (
      <div className="card">
        <h3><i className="sw" style={{ background: T.color }} />{T.name}</h3>
        <p className="muted small">Player names are hidden for this competition (underage).</p>
      </div>
    );
  }
  const list = s.players || [];
  const tagged = list.reduce((n, p) => n + p.points, 0);
  if (!list.length) {
    return (
      <div className="card">
        <h3><i className="sw" style={{ background: T.color }} />{T.name}</h3>
        <p className="muted small">No player names are tagged for {T.name} in {multi ? 'these games' : 'this game'}.</p>
      </div>
    );
  }
  const cols = COLS.filter((c) => (c.only !== 'multi' || multi) && list.some((p) => p[c.need || c.k]));
  const id = `more-${T.name.replace(/\W+/g, '-')}`;
  return (
    <div className="card player-card">
      <h3><i className="sw" style={{ background: T.color }} />{T.name} players</h3>
      {list.length > limit && <input type="checkbox" id={id} className="more-toggle" />}
      <div className="wrap">
        <table className="nums players">
          <thead><tr><th>Player</th>{cols.map((c) => <th key={c.k} title={c.title}>{c.label}</th>)}</tr></thead>
          <tbody>
            {list.map((p, i) => (
              <tr key={p.name} className={i >= limit ? 'extra' : undefined}>
                <td>{playerHref(T.name, p.name, links) ? <a href={playerHref(T.name, p.name, links)}>{p.name}</a> : p.name}</td>
                {cols.map((c) => <td key={c.k}>{c.fmt ? c.fmt(p) : p[c.k] || '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > limit && (
        <label htmlFor={id} className="more-label">
          <span className="show">Show all {list.length} players</span><span className="hide">Show fewer</span>
        </label>
      )}
      <p className="muted small">
        From the names on the tags. Pts counts 1 / 2 / 3 per point, two-pointer and goal; att = attempts (scored + missed).
        {list.some((p) => p.twoScored) && !list.some((p) => p.twoTrackedGames) && ' Missed two-point attempts aren’t tagged in this data (n/t), so they count as 1-pt attempts.'}
        {s.total > tagged && ` ${s.total - tagged} of ${T.name}’s ${s.total} points have no shooter tagged.`}
        {' '}Click a name for the player’s profile across all their games.
      </p>
    </div>
  );
}

// League v Championship side by side, per game, for one team.
export function CompareTypes({ name, rows, href }) {
  const [L, C] = rows;
  const per = (v, n) => (n ? v / n : null);
  const f1 = (v) => (v == null ? '—' : v.toFixed(1));
  const pc = (v) => (v == null ? '—' : `${Math.round(v)}%`);
  const lines = [
    ['Games', (r) => `${r.games}${r.taggedGames < r.games ? ` (${r.taggedGames} tagged)` : ''}`],
    ['Won – drawn – lost', (r) => `${r.W}–${r.D}–${r.L}`],
    ['Points for per game', (r) => f1(per(r.ptsFor, r.games)), 'hi'],
    ['Points against per game', (r) => f1(per(r.ptsAgainst, r.games)), 'lo'],
    ['Goals scored per game', (r) => f1(per(r.goalsFor, r.games)), 'hi'],
    ['Goals conceded per game', (r) => f1(per(r.goalsAgainst, r.games)), 'lo'],
    ['Shots per game', (r) => f1(per(r.us.shots, r.us.games)), 'hi'],
    ['Shot conversion', (r) => pc(r.us.conv), 'hi'],
    ['Points per shot', (r) => (r.us.ptsPerShot == null ? '—' : r.us.ptsPerShot.toFixed(2)), 'hi'],
    ['2-pointers scored per game', (r) => f1(per(r.us.shotsDetail.twoScored, r.us.games)), 'hi'],
    ['2-pointers conceded per game', (r) => f1(per(r.them.shotsDetail.twoScored, r.them.games)), 'lo'],
    ['2-point attempts per game', (r) => (r.us.shotsDetail.twoTrackedGames ? `${f1(r.us.shotsDetail.twoTried / r.us.shotsDetail.twoTrackedGames)}${r.us.shotsDetail.twoTrackedGames < r.us.games ? ` (${r.us.shotsDetail.twoTrackedGames} of ${r.us.games} games)` : ''}` : 'not tagged')],
    ['Own kick-outs retained', (r) => pc(r.us.kickouts.retPct), 'hi'],
    ['Opposition kick-outs won', (r) => pc(r.them.kickouts.total - r.them.kickouts.unknown ? 100 - r.them.kickouts.retPct : null), 'hi'],
    ['Turnovers won per game', (r) => f1(per(r.us.turnoversWon, r.us.games)), 'hi'],
    ['Turnovers lost per game', (r) => f1(per(r.us.turnoversLost, r.us.games)), 'lo'],
    ['Opposition shots per game', (r) => f1(per(r.them.shots, r.them.games)), 'lo'],
  ];
  const num = (t) => parseFloat(String(t).replace('%', ''));
  return (
    <>
      <h2>League v Championship</h2>
      <div className="card">
        <div className="wrap">
          <table className="nums compare">
            <thead><tr><th>{name}, per game</th><th><a href={href('League')}>League</a></th><th><a href={href('Championship')}><span className="long">Championship</span><span className="short">Champ</span></a></th></tr></thead>
            <tbody>
              {lines.map(([label, fn, better]) => {
                const a = fn(L), c = fn(C);
                const x = num(a), y = num(c);
                const win = better && Number.isFinite(x) && Number.isFinite(y) && x !== y
                  ? ((better === 'hi') === (x > y) ? 'a' : 'c') : null;
                return (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className={win === 'a' ? 'better' : ''}>{a}</td>
                    <td className={win === 'c' ? 'better' : ''}>{c}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">Per-game figures from the tagged games in each; results, points and goals use every game’s final score. Bold marks the better of the two. Click League or Championship to see that report on its own.</p>
      </div>
    </>
  );
}
