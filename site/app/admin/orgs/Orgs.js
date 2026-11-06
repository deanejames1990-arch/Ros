'use client';

import { useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addOrg, updateOrg, saveOrgCrest, switchOrg } from './actions';
import Crest from '../../Crest';

function Save({ label }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Saving…' : label}</button>;
}

function Fields({ o = {} }) {
  return (
    <>
      <label>Name<input name="name" defaultValue={o.name || ''} placeholder="Drumshanbo GAA" required /></label>
      <label>Club or county
        <select name="kind" defaultValue={o.kind || 'club'}><option value="club">Club</option><option value="county">County</option></select>
      </label>
      <label>Their own team <span className="muted small">(as in the files, e.g. “Drumshanbo”)</span><input name="team" defaultValue={o.team_name || ''} required /></label>
    </>
  );
}

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

function Org({ o, current }) {
  const [state, action] = useFormState(updateOrg.bind(null, o.id), null);
  const [crest, setCrest] = useState(o.crest);
  const [msg, setMsg] = useState('');
  const input = useRef(null);
  const pick = async (file) => {
    if (!file) return;
    setMsg('Saving…');
    try { const d = await shrink(file); const r = await saveOrgCrest(o.id, d); if (!r.ok) throw new Error(r.error); setCrest(d); setMsg(''); } catch (e) { setMsg(e.message); }
  };
  return (
    <div className={`card org ${o.id === current ? 'current' : ''}`}>
      <div className="org-head">
        <button type="button" className="crest-btn" onClick={() => input.current?.click()} title="Change crest">
          <Crest name={o.name} src={crest} size={56} /><span className="crest-btn-label">{crest ? 'Change crest' : 'Add crest'}</span>
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <div className="org-who">
          <b>{o.name}</b> {o.id === current && <span className="badge-on">you’re looking at this one</span>}
          <div className="muted small">{o.kind === 'club' ? 'Club' : 'County'} · team “{o.team_name}” · {o.games || 0} games · {o.people || 0} people</div>
          {msg && <div className="small muted">{msg}</div>}
        </div>
        <form action={switchOrg}>
          <input type="hidden" name="org" value={o.id} />
          <input type="hidden" name="next" value="/admin/people" />
          <button type="submit" className="primary">Open: add people</button>
        </form>
      </div>
      <details>
        <summary className="small">Edit name and team</summary>
        <form action={action} className="person-form">
          <Fields o={o} />
          <div className="person-foot"><Save label="Save" />{state?.ok && <span className="ok small">Saved</span>}{state?.error && <span className="check warn small">{state.error}</span>}</div>
        </form>
      </details>
    </div>
  );
}

export default function Orgs({ orgs, current }) {
  const [state, action] = useFormState(addOrg, null);
  return (
    <>
      <div className="org-list">{orgs.map((o) => <Org key={o.id} o={o} current={current} />)}</div>
      <h2>Add a club or county</h2>
      <form action={action} className="card person-form">
        <Fields />
        <div className="person-foot">
          <Save label="Add" />
          {state?.error && <span className="check warn small">{state.error}</span>}
          {state?.ok && <span className="ok small">{state.name} added. Press “Open: add people” on it to give their admin a code.</span>}
        </div>
      </form>
      <p className="small muted">To set them up: add the organisation, press <b>Open: add people</b>, and add their admin (Access: Admin). Send them the code. From then on their admin adds their own people and games, and only sees their organisation.</p>
    </>
  );
}
