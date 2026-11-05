'use client';

import { useRef, useState } from 'react';
import Crest from '../../Crest';
import { saveCrest } from './actions';

// Shrinks the picked image to fit 256 px (keeping transparency) before saving.
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, 256 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

export default function CrestUpload({ teamId, name, src, ready, sql }) {
  const [img, setImg] = useState(src || null);
  const [msg, setMsg] = useState('');
  const input = useRef(null);
  async function pick(file) {
    if (!file) return;
    setMsg('Saving…');
    try {
      const data = await shrink(file);
      const res = await saveCrest(teamId, data);
      if (res?.error) throw new Error(res.error);
      setImg(data); setMsg('');
    } catch (e) { setMsg(e.message || 'Couldn’t save that image'); }
  }
  async function remove() {
    const res = await saveCrest(teamId, null);
    if (res?.error) setMsg(res.error); else setImg(null);
  }
  return (
    <div className="crest-edit no-print">
      <button type="button" className="crest-btn" onClick={() => input.current?.click()} title={img ? 'Change crest' : 'Add a crest'}>
        <Crest name={name} src={img} size={56} />
        <span className="crest-btn-label">{img ? 'Change' : 'Add crest'}</span>
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {img && <button type="button" className="linkish small" onClick={remove}>Remove</button>}
      {msg && <span className="small muted">{msg}</span>}
      {!ready && (
        <details className="small">
          <summary>Set up crests (one-off)</summary>
          <p>Run this once in Supabase (SQL Editor → New query → Run):</p>
          <pre className="sql">{sql}</pre>
        </details>
      )}
    </div>
  );
}
