'use client';

import { useMemo, useState, useTransition } from 'react';
import { unzipSync, strFromU8 } from 'fflate';
import { parseNacsport, guessFromName, fromSportscodeXml, COUNTIES } from '../../../lib/nacsport';
import { importGame } from './actions';
import { isNacCsv, parseNacCsv } from '../../../lib/nac-csv';

const GRADES = ['Senior', 'U20', 'Minor', 'Junior', 'Club'];

function readExport(bytes, name) {
  // .nac_to_import is a zip holding one JSON file; a plain .json also works.
  let text;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes);
    const entry = Object.keys(files).find((k) => k.toLowerCase().endsWith('.json'));
    if (!entry) throw new Error('No JSON file inside this export.');
    text = strFromU8(files[entry]);
    name = entry;
  } else {
    text = strFromU8(bytes);
  }
  text = text.replace(/^\uFEFF/, '');
  // Nacsport CSV export: one row per action.
  if (/\.csv$/i.test(name) || isNacCsv(text)) return { json: { csv: text }, inner: name };
  // Sportscode / Hudl XML export
  if (/^\s*</.test(text)) return { json: fromSportscodeXml(text, name), inner: name };
  return { json: JSON.parse(text), inner: name };
}

const matchName = (list, guess) =>
  list.find((t) => t.toLowerCase() === (guess || '').toLowerCase()) || guess || '';

export default function ImportForm({ teams, competitions, existingCodes, games = [], ourTeam = 'Roscommon' }) {
  const ours = (n) => new RegExp(`^${String(ourTeam).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(String(n || ''));
  const [src, setSrc] = useState(null); // { json, fileName }
  const [err, setErr] = useState(null);
  const [f, setF] = useState({});
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));

  const names = { A: f.aIsTeam1 ? f.team1 : f.team2, B: f.aIsTeam1 ? f.team2 : f.team1 };
  const parsed = useMemo(() => {
    if (!src) return null;
    try {
      if (src.json.csv != null) return parseNacCsv(src.json.csv, { fileName: src.fileName });
      return parseNacsport(src.json, { names: { A: names.A || 'Team A', B: names.B || 'Team B' }, fileName: src.fileName });
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }, [src, names.A, names.B]);

  async function onFile(file) {
    setErr(null);
    setResult(null);
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { json } = readExport(bytes, file.name);
      const csv = json.csv != null;
      const first = csv ? parseNacCsv(json.csv, { fileName: file.name }) : parseNacsport(json, { fileName: file.name });
      // CSV: the teams come from its Team Name column, in the file name's order.
      const g = csv ? { ...guessFromName('', '', ourTeam), ...first.guess } : guessFromName(file.name, first.video, ourTeam);
      const team1 = matchName(teams, g.home);
      const team2 = matchName(teams, g.away);
      // In the TA/TB template TA is our team; in HOME/AWAY the first-named team is home.
      // Team-named buttons ("GALWAY POSS"): team A is whichever team the file names first.
      const aIsTeam1 = first.sideNames
        ? (matchName(teams, first.sideNames.A) || first.sideNames.A).toLowerCase() !== String(team2 || '').toLowerCase()
        : first.template === 'TA/TB' || first.template === 'OUR/OPP' ? !ours(team2) || ours(team1) : true;
      const year = Number((g.date || '').slice(0, 4)) || new Date().getFullYear();
      // Match an existing competition on year, name and grade. A senior guess
      // never lands in an underage competition, and the reverse.
      const gGrade = g.grade || (g.competition ? 'Senior' : '');
      const sameGrade = (c) => !gGrade || (c.grade || 'Senior') === gGrade;
      const words = (g.competition || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !['sfc', 'gaa', 'the'].includes(w));
      const comp = g.competition
        ? competitions
          .filter((c) => c.year === year && sameGrade(c) && c.name.toLowerCase().includes(words[0] || '§'))
          .sort((x, y) => words.filter((w) => y.name.toLowerCase().includes(w)).length - words.filter((w) => x.name.toLowerCase().includes(w)).length)[0]
        : null;
      const tA = first.score.A, tB = first.score.B;
      const s1 = aIsTeam1 ? tA : tB, s2 = aIsTeam1 ? tB : tA;
      setF({
        team1, team2, aIsTeam1,
        date: g.date,
        stage: g.stage,
        code: g.code,
        compId: comp ? String(comp.id) : 'new',
        newName: g.competition,
        // Neither team a county: a club game.
        newGrade: g.grade || (csv && ![team1, team2].some((t) => COUNTIES.some((c) => c.toLowerCase() === String(t || '').toLowerCase())) ? 'Club' : 'Senior'),
        newYear: year,
        newShowNames: true,
        ...(() => {
          // Use a full-time score written in the file ("FT: LEITRIM 1-12 MAYO 3-21") when it names both teams.
          const fs = first.finalScore;
          const same = (x, y) => (x || '').toLowerCase() === (y || '').toLowerCase();
          const f1 = fs?.find((x) => same(x.team, team1)), f2 = fs?.find((x) => same(x.team, team2));
          return f1 && f2
            ? { g1: f1.g, p1: f1.p, g2: f2.g, p2: f2.p, scoreFrom: 'note' }
            : { g1: s1.g, p1: s1.p, g2: s2.g, p2: s2.p, scoreFrom: 'tags' };
        })(),
      });
      setSrc({ json, fileName: file.name });
    } catch (e) {
      setSrc(null);
      setErr(`Couldn’t read that file: ${e.message || e}`);
    }
  }

  const tagged = parsed && !parsed.error
    ? { t1: f.aIsTeam1 ? parsed.score.A : parsed.score.B, t2: f.aIsTeam1 ? parsed.score.B : parsed.score.A }
    : null;
  const tot = (g, p) => 3 * (Number(g) || 0) + (Number(p) || 0);
  const mismatch = tagged && (tot(tagged.t1.g, tagged.t1.p) !== tot(f.g1, f.p1) || tot(tagged.t2.g, tagged.t2.p) !== tot(f.g2, f.p2));
  const same = (x, y) => (x || '').trim().toLowerCase() === (y || '').trim().toLowerCase();
  const onSite = f.date && f.team1 && f.team2
    ? games.find((g) => g.date === f.date && ((same(g.t1, f.team1) && same(g.t2, f.team2)) || (same(g.t1, f.team2) && same(g.t2, f.team1))))
    : null;
  const dateYear = Number(String(f.date || '').slice(0, 4)) || null;
  const pickedComp = competitions.find((c) => String(c.id) === String(f.compId));
  const yearMismatch = !onSite && pickedComp && dateYear && pickedComp.year !== dateYear;
  const replacing = Boolean(onSite) || (f.code && existingCodes.includes(f.code));

  function save() {
    setResult(null);
    start(async () => {
      const res = await importGame({
        team1: f.team1, team2: f.team2, aIsTeam1: f.aIsTeam1,
        date: f.date, stage: f.stage, code: f.code,
        score1: { g: f.g1, p: f.p1 }, score2: { g: f.g2, p: f.p2 },
        competition: f.compId === 'new'
          ? { name: f.newName, grade: f.newGrade, year: f.newYear || dateYear, showNames: f.newShowNames }
          : { id: f.compId },
        events: parsed.events,
      });
      setResult(res);
    });
  }

  if (result?.ok) {
    return (
      <div className="card check ok">
        <b>✓ {result.replaced ? 'Game updated' : 'Game added'} · {result.count} events saved</b>
        <p>
          <a href={`/match/${result.matchId}?view=analyst`}>Open the match dashboard →</a>
        </p>
        <button type="button" onClick={() => { setResult(null); setSrc(null); setF({}); }}>Add another game</button>
      </div>
    );
  }

  return (
    <div className="import">
      <label className="drop">
        <input type="file" accept=".nac_to_import,.json,.zip,.xml,.csv" onChange={(e) => onFile(e.target.files?.[0])} />
        <span>{src ? src.fileName : 'Choose a Nacsport file'}</span>
      </label>
      {err && <p className="card check warn">{err}</p>}
      {parsed?.error && <p className="card check warn">{parsed.error}</p>}

      {parsed && !parsed.error && (
        <>
          <div className="card">
            <h3>Game details</h3>
            <datalist id="teamnames">{teams.map((t) => <option key={t} value={t} />)}</datalist>
            <div className="fields">
              <label>First-named team<input list="teamnames" value={f.team1 || ''} onChange={(e) => set('team1', e.target.value)} /></label>
              <label>Second-named team<input list="teamnames" value={f.team2 || ''} onChange={(e) => set('team2', e.target.value)} /></label>
              <label>
                {parsed.template === 'HOME/AWAY' ? 'HOME in the tags is' : parsed.template === 'OUR/OPP' ? 'OUR in the tags is' : parsed.template === 'CSV' ? 'First team in the file is' : 'TA in the tags is'}
                <select value={f.aIsTeam1 ? '1' : '2'} onChange={(e) => set('aIsTeam1', e.target.value === '1')}>
                  <option value="1">{f.team1 || 'First-named team'}</option>
                  <option value="2">{f.team2 || 'Second-named team'}</option>
                </select>
              </label>
              <label>Date<input type="date" value={f.date || ''} onChange={(e) => set('date', e.target.value)} /></label>
              {onSite ? (
                <label>Competition<input value={onSite.competition} disabled /></label>
              ) : (
              <label>
                Competition
                <select value={f.compId} onChange={(e) => set('compId', e.target.value)}>
                  {[...competitions].sort((x, y) => (y.year === dateYear) - (x.year === dateYear)).map((c) => (
                    <option key={c.id} value={c.id}>{c.year} · {c.name}{c.grade ? ` (${c.grade})` : ''}</option>
                  ))}
                  <option value="new">+ New competition…</option>
                </select>
              </label>
              )}
              <label>Stage / round<input value={f.stage || ''} onChange={(e) => set('stage', e.target.value)} placeholder="e.g. Round 2, Final" /></label>
            </div>
            {yearMismatch && (
              <p className="check ok small">
                {pickedComp.name} is the {pickedComp.year} competition, but this game was played in {dateYear}. It will be saved under {pickedComp.name} {dateYear} (created if it doesn’t exist yet).
              </p>
            )}
            {onSite && (
              <p className="check ok small">
                This game is already on the site ({onSite.competition}{onSite.year ? `, ${onSite.year}` : ''}). Saving attaches the tagged events to it and updates the score.
                {onSite.year && dateYear && onSite.year !== dateYear ? ` It will also move to the ${dateYear} edition of the competition, to match the date.` : ''}{' '}
                <a href={`/match/${onSite.id}`}>View it</a>
              </p>
            )}
            {!onSite && f.compId === 'new' && (
              <div className="fields">
                <label>Competition name<input value={f.newName || ''} onChange={(e) => set('newName', e.target.value)} /></label>
                <label>Year<input type="number" value={f.newYear || dateYear || ''} onChange={(e) => set('newYear', e.target.value)} /></label>
                <label>
                  Grade
                  <select value={f.newGrade} onChange={(e) => set('newGrade', e.target.value)}>
                    {GRADES.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={f.newShowNames} onChange={(e) => set('newShowNames', e.target.checked)} />
                  Show player names (untick for underage)
                </label>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Final score</h3>
            <p className="muted small">
              {f.scoreFrom === 'note'
                ? 'Pre-filled from the full-time score written in the file.'
                : 'Pre-filled from the tags. Correct it to the official result if it differs — the dashboard will flag the gap.'}
            </p>
            <div className="scores">
              {[['1', f.team1, tagged.t1], ['2', f.team2, tagged.t2]].map(([n, name, t]) => (
                <div key={n} className="score-row">
                  <span>{name || `Team ${n}`}</span>
                  <input type="number" min="0" value={f[`g${n}`] ?? ''} onChange={(e) => set(`g${n}`, e.target.value)} aria-label="Goals" />
                  <span>–</span>
                  <input type="number" min="0" value={f[`p${n}`] ?? ''} onChange={(e) => set(`p${n}`, e.target.value)} aria-label="Points" />
                  <span className="muted small">tagged {t.g}-{t.p}</span>
                </div>
              ))}
            </div>
            {mismatch && <p className="check warn small">⚠ The score you entered differs from what the tags add up to.</p>}
          </div>

          <div className="card">
            <h3>What’s in the file</h3>
            <p className="muted small">
              {parsed.template === 'CSV' ? 'Nacsport CSV' : `${parsed.template} template`} · {parsed.events.length} events{parsed.template === 'CSV' ? '' : ` · ${parsed.fps} fps video`}
            </p>
            <div className="chips">
              {Object.entries(parsed.counts).map(([k, v]) => <span key={k} className="chip">{k} <b>{v}</b></span>)}
            </div>
            {parsed.template === 'Unknown' && (
              <p className="check warn small">This tagging template isn’t recognised, so events will be stored but most dashboard sections will be empty.</p>
            )}
            {parsed.warnings.map((w) => <p key={w} className="muted small">• {w}</p>)}
          </div>

          {result && !result.ok && <p className="card check warn">Couldn’t save: {result.error}</p>}
          <button type="button" onClick={save} disabled={pending || !f.date || !f.team1 || !f.team2}>
            {pending ? 'Saving…' : replacing ? 'Update this game' : 'Save game'}
          </button>
          {replacing && <span className="muted small"> Any events already saved for this game are replaced.</span>}
        </>
      )}
    </div>
  );
}
