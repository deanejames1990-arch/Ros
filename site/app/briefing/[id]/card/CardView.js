'use client';

import { useEffect, useRef, useState } from 'react';

const W = 1080, H = 1920;
const GRID = [['2', '3', '4'], ['5', '6', '7'], ['8', '0', '9'], ['10', '11', '12'], ['13', '14', '15']];
const NAVY = '#1A2E4A', GOLD = '#C9A84C';
const sc = (g, p) => `${g}-${p - 3 * g}`;
const pct = (v) => (v == null ? '—' : `${v}%`);

// 15 boxes, shaded by how many; kicking goal at the top for kick-outs,
// attacking goal at the top for shots (as everywhere else on the site).
function Boxes({ zones, color, small = false, kind }) {
  const max = Math.max(1, ...Object.values(zones || {}).map((z) => z.n));
  return (
    <div className={`ig-boxes ${small ? 'sm' : ''}`}>
      {kind !== 'shot' && <div className="ig-goal">their goal</div>}
      <div className="ig-grid">
        {GRID.flat().map((b) => {
          const z = zones?.[b];
          const a = z ? 0.12 + 0.78 * (z.n / max) : 0;
          return (
            <div key={b} className="ig-box" style={z ? { background: `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, #fff)`, color: a > 0.5 ? '#fff' : NAVY } : undefined}>
              {z ? <b>{z.n}</b> : <span>·</span>}
              {z && !small && <small>{kind === 'shot' ? `${z.won} sc` : `${z.won}W`}</small>}
            </div>
          );
        })}
      </div>
      {kind === 'shot' && <div className="ig-goal bottom">goal</div>}
    </div>
  );
}

function Card({ m }) {
  const pg = m.perGame;
  return (
    <div className="ig" style={{ width: W, height: H }}>
      <div className="ig-head">
        {m.crest ? <img className="ig-crest" src={m.crest} alt="" /> : <div className="ig-crest ig-crest-empty">{m.team.slice(0, 2).toUpperCase()}</div>}
        <div>
          <div className="ig-kicker">Opposition briefing</div>
          <h1>{m.team}</h1>
          <div className="ig-sub">Last {m.n} game{m.n === 1 ? '' : 's'}{m.comp ? ` · ${m.comp}` : ''}</div>
        </div>
      </div>

      <div className="ig-results">
        {m.results.map((r, i) => (
          <div key={i} className={`ig-res ${r.res}`}>
            <span className="ig-wl">{r.res}</span>
            <span className="ig-opp">v {r.opp}</span>
            <span className="ig-line">{r.line}</span>
            <span className="ig-date">{r.date}</span>
          </div>
        ))}
      </div>

      {m.messages.length > 0 && (
        <section className="ig-msgs">
          <h2>Key messages</h2>
          <ol>{m.messages.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </section>
      )}

      {pg && (
        <section className="ig-tiles">
          <div><b>{pg.points}</b><span>points a game</span><small>conceding {pg.against}</small></div>
          <div><b>{pg.scores}</b><span>scores a game</span><small>from {pg.shots} shots</small></div>
          <div><b>{pct(pg.conv)}</b><span>shot conversion</span></div>
          {pg.poss != null
            ? <div><b>{pg.poss}</b><span>possessions a game</span><small>{pct(pg.possToScore)} end in a score</small></div>
            : <div><b>{m.ko ? pct(m.ko.retPct) : '—'}</b><span>own kick-outs kept</span></div>}
        </section>
      )}

      {m.quarters.length > 0 && (
        <section className="ig-quarters">
          <h2>Quarter by quarter <small>avg a game{m.target ? ` · poss-shots-scores v target ${m.target.poss}-${m.target.shots}-${m.target.scores}` : ''}</small></h2>
          <div className="ig-qrow">
            {m.quarters.map((q) => (
              <div key={q.q} className={`ig-q ${q.q === m.best ? 'best' : ''} ${q.q === m.worst ? 'worst' : ''}`}>
                <div className="ig-qname">{q.q}{q.q === m.best ? ' · best' : q.q === m.worst ? ' · weakest' : ''}</div>
                <div className="ig-qpts"><b>{q.points}</b>{q.against != null && <span> v {q.against}</span>}</div>
                <div className="ig-qpss">{q.poss ? `${q.poss}-${q.shots}-${q.scores}` : `${q.shots} shots · ${q.scores} scores`}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="ig-two">
        {m.ko && (
          <section className="ig-ko">
            <h2>Their kick-outs</h2>
            <div className="ig-ko-top">
              <div className="ig-big"><b>{pct(m.ko.retPct)}</b><span>kept · {m.ko.retained} of {m.ko.known}</span><span>{m.ko.perGame} a game</span>
                <div className="ig-ko-split">Won clean <b>{m.ko.wonClean}</b> · break <b>{m.ko.wonBreak}</b><br />Lost break <b>{m.ko.lostBreak}</b> · clean <b>{m.ko.lostClean}</b></div>
                {m.theirsOnOpp?.winPct != null && <p className="ig-note">They win <b>{m.theirsOnOpp.winPct}%</b> of the other team’s kick-outs</p>}
              </div>
              <Boxes zones={m.ko.zones} color={NAVY} kind="ko" />
            </div>
          </section>
        )}
        {m.sources.length > 0 && (
          <section className="ig-src">
            <h2>Where they score from</h2>
            {m.sources.map((s) => (
              <div key={s.source} className="ig-bar">
                <span className="ig-bar-l">{s.source}</span>
                <span className="ig-bar-t"><i style={{ width: `${Math.max(4, s.pct)}%` }} /></span>
                <span className="ig-bar-v">{s.pct}%</span>
              </div>
            ))}
            <p className="ig-note">Share of their points, by how the possession started</p>
          </section>
        )}
      </div>

      {m.threats.length > 0 && (
        <section className="ig-threats">
          <h2>Main threats</h2>
          <div className="ig-trow">
            {m.threats.map((p, i) => (
              <div key={p.name} className="ig-t">
                <div className="ig-tname"><span className="ig-tnum">{i + 1}</span>{p.name}</div>
                <div className="ig-tbody">
                  <div>
                    <div className="ig-tscore"><b>{sc(p.goals, p.points)}</b></div>
                    <div className="ig-tstats">in {p.games} game{p.games === 1 ? '' : 's'}<br />{p.scores}/{p.shots} shots{p.frees ? <><br />{p.frees} from frees</> : ''}{p.two ? <><br />{p.two} two-pointer{p.two === 1 ? '' : 's'}</> : ''}</div>
                  </div>
                  {p.zones ? <Boxes zones={p.zones} color={GOLD} small kind="shot" /> : <div className="ig-tnozones">No shot boxes tagged</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="ig-foot">
        <img className="ig-qr" src={m.qr} alt="" />
        <div className="ig-foot-t"><b>Full briefing and clips</b><span>Scan, or open the Briefings page on the site</span></div>
        <img className="ig-ros" src="/crest.png" alt="" />
      </div>
    </div>
  );
}

export default function CardView({ model, admin }) {
  const ref = useRef(null);
  const box = useRef(null);
  const [scale, setScale] = useState(0.4);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (box.current?.clientWidth || 432) / W));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  async function save() {
    setBusy('Making image…');
    try {
      const { toPng } = await import('html-to-image');
      const url = await toPng(ref.current.querySelector('.ig'), { width: W, height: H, pixelRatio: 1, backgroundColor: '#ffffff', cacheBust: true });
      const name = `${model.team} briefing.png`.replace(/[^\w .-]/g, '');
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${model.team} briefing` });
      else { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }
      setBusy('');
    } catch (e) {
      setBusy(e?.name === 'AbortError' ? '' : 'Couldn’t make the image');
    }
  }

  return (
    <div className="ig-page">
      <p className="muted no-print">
        <a href="/briefing">Briefings</a> · <a href={`/briefing/${model.id}`}>Full briefing</a>
        {admin && <> · <a href={`/briefing/${model.id}?edit=1`}>Edit the key messages</a></>}
      </p>
      <div className="ig-actions">
        <button type="button" className="primary" onClick={save}>Save image</button>
        <span className="muted small">{busy || '1080 × 1920 · for WhatsApp'}{!model.published ? ' · draft' : ''}</span>
      </div>
      {model.suggested && model.messages.length > 0 && <p className="card small">These key messages are <b>suggested from the numbers</b> — you haven’t written any yet. {admin ? <a href={`/briefing/${model.id}?edit=1`}>Edit them in the briefing</a> : null}</p>}
      {model.messages.length === 0 && admin && <p className="card small">No key messages yet: add 3–4 in the briefing editor (Key messages box) and they’ll lead the image.</p>}
      <div className="ig-frame" ref={box}>
        <div ref={ref} style={{ width: W * scale, height: H * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: W, height: H }}>
            <Card m={model} />
          </div>
        </div>
      </div>
    </div>
  );
}
