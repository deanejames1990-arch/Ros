'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addPerson, updatePerson, resetCode, setActive, removePerson } from './actions';

const ROLE_TEXT = { viewer: 'Viewer', tagger: 'Tagger', admin: 'Admin' };
const when = (t) => (t ? new Date(t).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

function Save({ label }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Saving…' : label}</button>;
}

function Fields({ grades, p = {} }) {
  const [role, setRole] = useState(p.role || 'viewer');
  return (
    <>
      <label>Name<input name="name" defaultValue={p.name || ''} required /></label>
      <label>Email <span className="muted small">(optional, for your reference)</span><input name="email" type="email" defaultValue={p.email || ''} /></label>
      <label>Access
        <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">Viewer: sees the stats</option>
          <option value="tagger">Tagger: stats + live tagger and team sheets</option>
          <option value="admin">Admin: everything</option>
        </select>
      </label>
      {role !== 'admin' && grades.length > 1 && (
        <fieldset className="grade-picks">
          <legend>Grades <span className="muted small">(none ticked = all grades)</span></legend>
          {grades.map((g) => (
            <label key={g} className="tick"><input type="checkbox" name="grades" value={g} defaultChecked={p.grades?.includes(g)} />{g}</label>
          ))}
        </fieldset>
      )}
    </>
  );
}

// The code is shown once, with a message ready to send.
function CodeBox({ name, code, onClose }) {
  const [copied, setCopied] = useState('');
  const site = typeof window !== 'undefined' ? window.location.origin : '';
  const msg = `Hi ${String(name).split(' ')[0]}, here's your login for the Roscommon GAA stats site.\n${site}\nAccess code: ${code}\nPlease keep it to yourself.`;
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied(''); } };
  return (
    <div className="card code-box">
      <p><b>{name}</b>’s access code. This is the only time it’s shown, so copy or send it now:</p>
      <p className="the-code num">{code}</p>
      <textarea readOnly rows={4} value={msg} />
      <div className="code-actions">
        <button type="button" onClick={() => copy(code, 'code')}>{copied === 'code' ? 'Copied' : 'Copy code'}</button>
        <button type="button" onClick={() => copy(msg, 'msg')}>{copied === 'msg' ? 'Copied' : 'Copy message'}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        <button type="button" className="linkish" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function Person({ p, grades, onCode }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(updatePerson.bind(null, p.id), null);
  const [msg, setMsg] = useState('');
  const run = async (fn, okMsg) => {
    const r = await fn();
    if (!r.ok) setMsg(r.error); else { setMsg(okMsg); window.location.reload(); }
  };
  return (
    <div className={`card person ${p.active ? '' : 'off'}`}>
      <div className="person-row">
        <div>
          <b>{p.name}</b> {!p.active && <span className="badge-off">switched off</span>}
          <div className="muted small">{ROLE_TEXT[p.role]} · {p.grades?.length ? p.grades.join(', ') : 'all grades'} · last in {when(p.last_seen)}{p.email ? ` · ${p.email}` : ''}</div>
        </div>
        <div className="person-btns">
          <button type="button" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit'}</button>
          <button type="button" onClick={async () => { const r = await resetCode(p.id); if (r.ok) onCode(p.name, r.code); else setMsg(r.error); }}>New code</button>
          <button type="button" onClick={() => run(() => setActive(p.id, !p.active), '')}>{p.active ? 'Switch off' : 'Switch on'}</button>
        </div>
      </div>
      {open && (
        <form action={action} className="person-form">
          <Fields grades={grades} p={p} />
          <div className="person-foot">
            <Save label="Save changes" />
            {state?.ok && <span className="muted small">Saved</span>}
            {state?.error && <span className="check warn small">{state.error}</span>}
            <button type="button" className="danger" onClick={() => { if (window.confirm(`Remove ${p.name} completely?`)) run(() => removePerson(p.id), ''); }}>Remove</button>
          </div>
        </form>
      )}
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}

export default function People({ people, grades }) {
  const [state, action] = useFormState(addPerson, null);
  const [shown, setShown] = useState(null);
  const [formKey, setFormKey] = useState(0);
  // A newly added person: show their code, and clear the form.
  useEffect(() => {
    if (state?.ok) { setShown({ name: state.name, code: state.code }); setFormKey((k) => k + 1); }
  }, [state]);
  const active = people.filter((p) => p.active).length;
  return (
    <>
      {shown && <CodeBox name={shown.name} code={shown.code} onClose={() => { setShown(null); window.location.reload(); }} />}
      <h2>Add a person</h2>
      <form key={formKey} action={action} className="card person-form">
        <Fields grades={grades} />
        <div className="person-foot">
          <Save label="Add and create code" />
          {state?.error && <span className="check warn small">{state.error}</span>}
        </div>
      </form>
      <h2>{people.length} {people.length === 1 ? 'person' : 'people'} <span className="muted small">· {active} with access</span></h2>
      {people.length === 0 && <p className="muted">Nobody added yet.</p>}
      <div className="people-list">
        {people.map((p) => <Person key={p.id} p={p} grades={grades} onCode={(name, c) => setShown({ name, code: c })} />)}
      </div>
    </>
  );
}
