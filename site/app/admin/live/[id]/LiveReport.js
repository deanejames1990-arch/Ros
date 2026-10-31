'use client';

import { useRef, useState } from 'react';
import { analyseMatch, QUARTERS } from '../../../../lib/analysis';
import { Versus } from '../../../match/[id]/charts';
import { ZoneGrid } from '../../../report/sections';
import { ShotMap, ShotLegend } from '../../../report/ShotMap';

const pct = (v) => (v == null ? '—' : `${v}%`);
const sc = (s) => `${s.goals}-${String(s.points).padStart(2, '0')}`;
const PERIODS = [['All', 'Game so far'], ['Q1', 'Q1'], ['Q2', 'Q2'], ['1st Half', '1st half'], ['Q3', 'Q3'], ['Q4', 'Q4'], ['2nd Half', '2nd half']];

function Scorers({ s, color }) {
  const list = s.players.filter((p) => p.shots > 0).sort((a, b) => b.points - a.points || b.shots - a.shots).slice(0, 8);
  if (!list.length) return <p className="muted small">No shots with a player tagged.</p>;
  return (
    <table className="live-scorers">
      <thead><tr><th /><th>Score</th><th>Shots</th></tr></thead>
      <tbody>
        {list.map((p) => (
          <tr key={p.name}>
            <td><i className="sw" style={{ background: color }} />{p.name}</td>
            <td className="num"><b>{p.goals}-{p.points - 3 * p.goals}</b>{p.freesScored ? <small> ({p.freesScored}f)</small> : ''}</td>
            <td className="num">{p.scores}/{p.shots}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LiveReport({ rows, teams, match, initial = 'All' }) {
  const [period, setPeriod] = useState(initial);
  const [busy, setBusy] = useState('');
  const ref = useRef(null);
  const colors = ['#3b4f9e', '#c4572a'];
  const A = { name: teams[0].name, color: colors[0] };
  const B = { name: teams[1].name, color: colors[1] };
  const r = analyseMatch({ events: rows, teams, period });
  const full = period === 'All' ? r : analyseMatch({ events: rows, teams });
  const a = r.byTeam[teams[0].id], b = r.byTeam[teams[1].id];
  const fa = full.byTeam[teams[0].id], fb = full.byTeam[teams[1].id];
  const inPeriod = r.events;
  const ka = a.kickouts, kb = b.kickouts;
  const label = PERIODS.find((p) => p[0] === period)[1];

  async function share() {
    setBusy('Making image…');
    try {
      const { toPng } = await import('html-to-image');
      const url = await toPng(ref.current, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const name = `${match.title} ${label}.png`.replace(/[^\w .-]/g, '');
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${match.title} · ${label}` });
      else { const l = document.createElement('a'); l.href = url; l.download = name; l.click(); }
      setBusy('');
    } catch (e) {
      setBusy(e?.name === 'AbortError' ? '' : 'Could not make the image');
    }
  }

  return (
    <div className="live-report">
      <div className="seg live-periods">
        {PERIODS.map(([k, t]) => <button key={k} type="button" className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{t}</button>)}
      </div>
      <div className="live-actions">
        <button type="button" onClick={share}>Share image</button>
        <a href={`/match/${match.id}${period !== 'All' ? `?period=${encodeURIComponent(period)}` : ''}`} target="_blank" rel="noreferrer">Full dashboard ↗</a>
        {busy && <span className="muted small">{busy}</span>}
      </div>

      <div ref={ref} className="live-sheet">
        <div className="live-sheet-head">
          <img src="/crest.png" alt="" />
          <div>
            <b>{match.title}</b> · {label}
            <div className="muted small">{match.competition}</div>
          </div>
        </div>
        <div className="live-scoreline">
          <span style={{ color: A.color }}>{A.name}</span>
          <b className="num">{sc(a)}</b><span className="muted">v</span><b className="num">{sc(b)}</b>
          <span style={{ color: B.color }}>{B.name}</span>
        </div>
        {period !== 'All' && <p className="muted small center">Game so far {sc(fa)} – {sc(fb)}</p>}

        <div className="card">
          <Versus a={A} b={B} rows={[
            { heading: 'Possession, shots and scores' },
            { label: 'Possessions', a: a.possessions, b: b.possessions },
            { label: 'Shots', a: a.shots, b: b.shots },
            { label: 'Scores', a: a.scores, b: b.scores },
            { label: 'Shot conversion', a: a.conv, b: b.conv, max: 100, fmt: pct },
            { label: 'Possessions to a score', a: a.possToScore, b: b.possToScore, max: 100, fmt: pct },
            { label: 'Wides', a: a.shotsDetail.wides, b: b.shotsDetail.wides },
            { label: 'Short, saved or blocked', a: a.shotsDetail.savedBlocked, b: b.shotsDetail.savedBlocked },
            { label: '2-pointers', a: a.shotsDetail.twoScored, b: b.shotsDetail.twoScored, aNote: `of ${a.shotsDetail.twoTried} tried`, bNote: `of ${b.shotsDetail.twoTried} tried` },
            { heading: 'Own kick-outs' },
            { label: 'Taken', a: ka.total, b: kb.total },
            { label: 'Won', a: ka.retained, b: kb.retained, aNote: pct(ka.retPct), bNote: pct(kb.retPct) },
            { label: 'Won clean', a: ka.wonClean, b: kb.wonClean },
            { label: 'Won on the break', a: ka.wonBreak, b: kb.wonBreak },
            { label: 'Lost on the break', a: ka.lostBreak, b: kb.lostBreak },
            { label: 'Lost clean', a: ka.lostClean, b: kb.lostClean },
            ...(r.has.turnover || r.has.foul ? [{ heading: 'Turnovers and frees' }] : []),
            ...(r.has.turnover ? [{ label: 'Turnovers won', a: a.turnoversWon, b: b.turnoversWon }] : []),
            ...(r.has.foul ? [{ label: 'Frees conceded', a: a.fouls, b: b.fouls }] : []),
          ]} />
        </div>

        {(ka.total > 0 || kb.total > 0) && (
          <div className="card">
            <div className="vs-heading">Where own kick-outs landed (box, kicking goal at top)</div>
            <div className="zones">
              <ZoneGrid name={A.name} zones={a.kickoutZones} color={A.color} />
              <ZoneGrid name={B.name} zones={b.kickoutZones} color={B.color} />
            </div>
          </div>
        )}

        {(a.shots > 0 || b.shots > 0) && (
          <div className="card">
            <div className="vs-heading">Shot maps (attacking the goal at the top)</div>
            <div className="shotmaps">
              <ShotMap events={inPeriod} teamId={teams[0].id} name={A.name} color={A.color} />
              <ShotMap events={inPeriod} teamId={teams[1].id} name={B.name} color={B.color} />
            </div>
            <ShotLegend />
          </div>
        )}

        <div className="card">
          <div className="vs-heading">Scorers</div>
          <div className="live-two">
            <div><div className="zone-title">{A.name}</div><Scorers s={a} color={A.color} /></div>
            <div><div className="zone-title">{B.name}</div><Scorers s={b} color={B.color} /></div>
          </div>
          {match.hideNames && <p className="muted small">Names are hidden on the site for this grade.</p>}
        </div>

        <div className="card">
          <div className="vs-heading">Quarter by quarter (possessions · shots · scores · points)</div>
          <table className="live-quarters">
            <thead><tr><th /><th>{A.name}</th><th>{B.name}</th></tr></thead>
            <tbody>
              {QUARTERS.map((q, i) => {
                const x = fa.pss[i], y = fb.pss[i];
                const kx = fa.quarters[i], ky = fb.quarters[i];
                return (
                  <tr key={q}>
                    <th>{q}</th>
                    <td className="num">{x.poss} · {x.shots} · {x.scores} · <b>{x.points}</b><small> KO {kx.koWon}/{kx.koTotal}</small></td>
                    <td className="num">{y.poss} · {y.shots} · {y.scores} · <b>{y.points}</b><small> KO {ky.koWon}/{ky.koTotal}</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
