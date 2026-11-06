'use client';

import { useState } from 'react';
import { ShotMap } from './ShotMap';
import { isPlacedShot } from '../../lib/analysis';

const VIEWS = [['all', 'All shots'], ['play', 'From play'], ['free', 'Frees, 45s, marks']];

// Shot maps with a switch between all shots, shots from play and frees.
// maps: [{ teamId, name, color }]
export default function ShotMapSet({ events, maps, one = false }) {
  const [view, setView] = useState('all');
  const shots = events.filter((e) => /^shot/i.test(e.event_type || ''));
  const hasFree = shots.some((e) => isPlacedShot(e) && e.labels?.ShotX != null);
  const shown = view === 'all' ? events : events.filter((e) => !/^shot/i.test(e.event_type || '') || (view === 'free' ? isPlacedShot(e) : !isPlacedShot(e)));
  return (
    <>
      {hasFree && (
        <div className="seg small shotmap-seg">
          {VIEWS.map(([k, t]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{t}</button>)}
        </div>
      )}
      <div className={`shotmaps ${one ? 'one' : ''}`}>
        {maps.map((m) => <ShotMap key={`${m.teamId}:${m.name}`} events={shown} teamId={m.teamId} name={m.name} color={m.color} />)}
      </div>
    </>
  );
}
