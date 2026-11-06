'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addPerson, updatePerson, resetCode, setActive, removePerson, setPassword, saveAvatar } from './actions';
import Avatar from '../../Avatar';

const ROLE_TEXT = { viewer: 'Viewer', tagger: 'Tagger', admin: 'Admin', super: 'Site owner' };
const when = (t) => (t ? new Date(t).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

function Save({ label }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Saving…' : label}</button>;
}

function Fields({ grades, p = {}, owner = false }) {
  const [role, setRole] = useState(p.role || 'viewer');
  return (
    <>
      <label>Name<input name="name" defaultValue={p.name || ''} required /></label>
      <label>Email <span className="muted small">(optional, for your reference)</span><input name="email" type="email" defaultValue={p.email || ''} /></label>
      <label>Access
        <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">Viewer: sees the stats</option>
          <option value="tagger">Tagger: stats + live tagger and team sheets</option>
          <option value="admin">Admin: everything in this organisation</option>
          {(owner || p.role === 'super') && <option value="super">Site owner: every organisation</option>}
        </select>
      </label>
      {role !== 'admin' && role !== 'super' && grades.length > 1 && (
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
  const msg = `Hi ${String(name).split(' ')[0]}, here's your login for James Deane Analysis.\n${site}\nAccess code: ${code}\nPlease keep it to yourself.`;
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

// Set a password for someone (e.g. one they asked for), instead of a code.
function PasswordForm({ p }) {
  const [state, action] = useFormState(setPassword.bind(null, p.id), null);
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="pw-form">
      <label>New password <span className="muted small">(at least 8 characters; capitals count)</span><input name="password" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} required /></label>
      <label>Again<input name="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} required /></label>
      <label className="tick"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /><span>Show what I type</span></label>
      <div className="person-foot">
        <Save label="Set password" />
        {state?.ok && <span className="ok small">{state.msg}</span>}
        {state?.error && <span className="check warn small">{state.error}</span>}
      </div>
    </form>
  );
}

// Shrinks a picked photo to a 160 px square (centre crop) before saving.
async function squarePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const side = Math.min(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 160, 160);
    return c.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

function PhotoEdit({ p, src }) {
  const [img, setImg] = useState(src || null);
  const [msg, setMsg] = useState('');
  const input = useRef(null);
  const pick = async (file) => {
    if (!file) return;
    setMsg('Saving…');
    try {
      const data = await squarePhoto(file);
      const r = await saveAvatar(p.id, data);
      if (!r.ok) throw new Error(r.error);
      setImg(data); setMsg('Saved');
    } catch (e) { setMsg(e.message || 'Couldn’t save that photo'); }
  };
  return (
    <div className="photo-edit">
      <button type="button" className="crest-btn" onClick={() => input.current?.click()} title={img ? 'Change photo' : 'Add a photo'}>
        <Avatar name={p.name} src={img} size={64} />
        <span className="crest-btn-label">{img ? 'Change photo' : 'Add photo'}</span>
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {img && <button type="button" className="linkish small" onClick={async () => { const r = await saveAvatar(p.id, null); if (r.ok) { setImg(null); setMsg(''); } else setMsg(r.error); }}>Remove photo</button>}
      {msg && <span className="small muted">{msg}</span>}
    </div>
  );
}

function Person({ p, grades, onCode, avatar, owner }) {
  const [open, setOpen] = useState(false);
  const dlg = useRef(null);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const [state, action] = useFormState(updatePerson.bind(null, p.id), null);
  const [msg, setMsg] = useState('');
  const run = async (fn, okMsg) => {
    const r = await fn();
    if (!r.ok) setMsg(r.error); else { setMsg(okMsg); window.location.reload(); }
  };
  return (
    <div className={`card person ${p.active ? '' : 'off'}`}>
      <div className="person-row">
        <Avatar name={p.name} src={avatar} size={38} />
        <div className="person-who">
          <b>{p.name}</b> {!p.active && <span className="badge-off">switched off</span>}
          <div className="muted small">{ROLE_TEXT[p.role]} · {p.grades?.length ? p.grades.join(', ') : 'all grades'} · last in {when(p.last_seen)}{p.email ? ` · ${p.email}` : ''}</div>
        </div>
        <div className="person-btns">
          <button type="button" onClick={() => setOpen(true)}>Edit</button>
        </div>
      </div>
      <dialog ref={dlg} className="person-dialog" onClose={() => { setOpen(false); if (state?.ok) window.location.reload(); }} onClick={(e) => { if (e.target === dlg.current) setOpen(false); }}>
        <div className="acct-head"><b>{p.name}</b><button type="button" className="linkish" onClick={() => setOpen(false)} aria-label="Close">✕</button></div>
        <p className="muted small">Last signed in {when(p.last_seen)}{p.active ? '' : ' · switched off'}</p>
        {open && <PhotoEdit p={p} src={avatar} />}
        <h3>Details and access</h3>
        <form action={action} className="person-form">
          <Fields grades={grades} p={p} owner={owner} />
          <div className="person-foot">
            <Save label="Save changes" />
            {state?.ok && <span className="ok small">Saved</span>}
            {state?.error && <span className="check warn small">{state.error}</span>}
          </div>
        </form>
        <h3>Sign-in</h3>
        <p className="small muted">Give them a new random code, or set a password for them. Either way the old one stops working at once.</p>
        <div className="person-foot">
          <button type="button" onClick={async () => { const r = await resetCode(p.id); if (r.ok) { setOpen(false); onCode(p.name, r.code); } else setMsg(r.error); }}>New random code</button>
        </div>
        {open && <PasswordForm p={p} />}
        <div className="acct-foot">
          <button type="button" onClick={() => run(() => setActive(p.id, !p.active), '')}>{p.active ? 'Switch off access' : 'Switch access back on'}</button>
          <button type="button" className="danger" onClick={() => { if (window.confirm(`Remove ${p.name} completely?`)) run(() => removePerson(p.id), ''); }}>Remove</button>
        </div>
        {state?.ok && <p className="small muted">Close this to see the change in the list.</p>}
      </dialog>
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}

export default function People({ people, grades, avatars = {}, owner = false }) {
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
        <Fields grades={grades} owner={owner} />
        <div className="person-foot">
          <Save label="Add and create code" />
          {state?.error && <span className="check warn small">{state.error}</span>}
        </div>
      </form>
      <h2>{people.length} {people.length === 1 ? 'person' : 'people'} <span className="muted small">· {active} with access</span></h2>
      {people.length === 0 && <p className="muted">Nobody added yet.</p>}
      <div className="people-list">
        {people.map((p) => <Person key={p.id} p={p} grades={grades} owner={owner} avatar={avatars[p.id]} onCode={(name, c) => setShown({ name, code: c })} />)}
      </div>
    </>
  );
}
