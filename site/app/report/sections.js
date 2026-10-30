// Report sections shared by the match page (one game) and the team page
// (several games added together). Each side is a byTeam entry from
// analyseMatch, or the result of combineSides.
import { Versus } from '../match/[id]/charts';

const pct = (v) => (v == null ? '—' : `${v}%`);
const rate = (a, b) => (b ? Math.round((100 * a) / b) : null);

// Kick-out landing boxes laid out as on the pitch: 3 columns, 5 rows.
const GRID = [['2', '3', '4'], ['5', '6', '7'], ['8', '0', '9'], ['10', '11', '12'], ['13', '14', '15']];

function ZoneGrid({ name, zones, color }) {
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
              title={z ? `Box ${b}: ${z.n} kick-outs, ${z.won} won, ${z.n - z.won} lost` : `Box ${b}: none`}>
              <span className="zone-no">{b}</span>
              {z && <b>{z.n}</b>}
              {z && <span className="zone-wl">{z.won}W {z.n - z.won}L</span>}
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
            <div className="vs-heading">Landing zone (box number, pitch layout)</div>
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
          { label: '2-pointers scored', a: da.twoScored, b: db.twoScored, aNote: `of ${da.twoTried} tried`, bNote: `of ${db.twoTried} tried` },
          { label: 'Goals', a: da.goals, b: db.goals },
          { label: 'Wides', a: da.wides, b: db.wides },
          { label: 'Saved / blocked', a: da.savedBlocked, b: db.savedBlocked },
          ...(boxes.length ? [{ heading: 'Where shots were taken (box number)' }] : []),
          ...boxes.map((z) => {
            const x = a.shotBoxes?.[z], y = b.shotBoxes?.[z];
            return { label: `Box ${z}`, a: x?.shots ?? 0, b: y?.shots ?? 0, aNote: x ? `${x.scored} scored` : '', bNote: y ? `${y.scored} scored` : '' };
          }),
        ]} />
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
