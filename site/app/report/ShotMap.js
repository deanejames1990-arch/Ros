// Half-pitch drawing in metres (goal at the top, 90 m wide) and a shot map
// drawn on it. Shots carry labels.ShotX / labels.ShotY from the live tagger.
// Plain SVG: works on server pages and in the live tagger.
import { shotValue } from '../../lib/analysis';

export const VIEW = '-3 -4 96 56';

export function PitchLines() {
  return (
    <g className="pitch-lines" fill="none" stroke="currentColor" strokeWidth="0.35">
      <rect x="0" y="0" width="90" height="52" strokeWidth="0" fill="var(--pitch, #eef5ec)" />
      <line x1="0" y1="0" x2="90" y2="0" />
      <line x1="0" y1="0" x2="0" y2="52" /><line x1="90" y1="0" x2="90" y2="52" />
      <rect x="41.75" y="-2" width="6.5" height="2" strokeWidth="0.5" />
      <rect x="38" y="0" width="14" height="4.5" />
      <rect x="35.5" y="0" width="19" height="13" />
      <line x1="0" y1="13" x2="90" y2="13" strokeDasharray="1 1" />
      <line x1="0" y1="20" x2="90" y2="20" />
      <path d="M32 20 A13 13 0 0 0 58 20" />
      <line x1="0" y1="45" x2="90" y2="45" />
      <path d="M5 0 A40 40 0 0 0 85 0" strokeDasharray="2 1" strokeWidth="0.5" />
      <text x="88" y="44" textAnchor="end" fontSize="2.4" stroke="none" fill="currentColor">45 m</text>
      <text x="88" y="19" textAnchor="end" fontSize="2.4" stroke="none" fill="currentColor">20 m</text>
      <text x="80" y="31" textAnchor="middle" fontSize="2.4" stroke="none" fill="currentColor">2-pt arc</text>
    </g>
  );
}

const lbl = (e, k) => e.labels?.[k];
export const hasShotMap = (events) => events.some((e) => lbl(e, 'ShotX') != null);

// One team's shots. Scores are filled dots (bigger for a goal, gold ring for a
// two-pointer); misses are hollow rings.
export function ShotMap({ events, teamId, name, color }) {
  const shots = events.filter((e) => e.team_id === teamId && lbl(e, 'ShotX') != null && /^shot/i.test(e.event_type || ''));
  const scored = shots.filter((e) => shotValue(e) > 0).length;
  return (
    <figure className="shotmap">
      <figcaption><b>{name}</b> <span className="muted small">{scored} scored from {shots.length} shots</span></figcaption>
      <svg viewBox={VIEW} role="img" aria-label={`${name} shot map`}>
        <PitchLines />
        {shots.map((e, i) => {
          const v = shotValue(e);
          const x = Number(lbl(e, 'ShotX')), y = Number(lbl(e, 'ShotY'));
          const who = lbl(e, 'Players') || e.player_no || '';
          const tip = `${e.outcome || 'Shot'}${/\(/.test(e.event_type) ? ` ${e.event_type.replace('Shot ', '')}` : ''}${who ? ` · ${who}` : ''} · ${Math.round(e.minute)}'`;
          return v > 0 ? (
            <circle key={i} cx={x} cy={y} r={v === 3 ? 2.1 : 1.5} fill={color} stroke={v === 2 ? '#f9a51b' : '#fff'} strokeWidth={v === 2 ? 0.7 : 0.4}><title>{tip}</title></circle>
          ) : (
            <circle key={i} cx={x} cy={y} r="1.3" fill="#fff" stroke={color} strokeWidth="0.6"><title>{tip}</title></circle>
          );
        })}
      </svg>
    </figure>
  );
}

export function ShotLegend() {
  return (
    <p className="muted small center shot-legend">
      <svg viewBox="0 0 4 4" width="12" height="12"><circle cx="2" cy="2" r="1.5" fill="#59627a" /></svg> point
      <svg viewBox="0 0 4 4" width="12" height="12"><circle cx="2" cy="2" r="1.4" fill="#59627a" stroke="#f9a51b" strokeWidth="0.7" /></svg> two-pointer
      <svg viewBox="0 0 5 5" width="14" height="14"><circle cx="2.5" cy="2.5" r="2.1" fill="#59627a" /></svg> goal
      <svg viewBox="0 0 4 4" width="12" height="12"><circle cx="2" cy="2" r="1.3" fill="#fff" stroke="#59627a" strokeWidth="0.6" /></svg> missed
    </p>
  );
}
