'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// On a game being tagged live, re-fetch the numbers every so often so people
// watching on the sideline see new tags without pressing refresh.
export default function LiveRefresh({ seconds = 20 }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [at, setAt] = useState(null);
  useEffect(() => {
    setAt(new Date());
    if (!on) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') { router.refresh(); setAt(new Date()); }
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [on, seconds, router]);
  return (
    <p className="live-badge no-print no-export">
      <span className={`dot ${on ? 'on' : ''}`} />
      {on ? <>Live: updates every {seconds} seconds{at && <span className="muted"> · last {at.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}</> : 'Live updates paused'}
      <button type="button" onClick={() => setOn(!on)}>{on ? 'Pause' : 'Resume'}</button>
    </p>
  );
}
