'use client';

import { useEffect, useRef, useState } from 'react';
import { getMe } from './actions';

const ROLE = { viewer: 'Viewer — sees the stats', tagger: 'Tagger — stats, live tagger and team sheets', admin: 'Admin — everything' };

// Who you're signed in as, and sign out. Changes are made by an admin.
export default function AccountMenu({ name, role, personal, admin }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const dlg = useRef(null);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    if (open && personal && !data) getMe().then(setData).catch(() => setData({ ok: false }));
  }, [open, personal, data]);
  const first = String(name || '').trim().split(/\s+/)[0];
  const me = data?.ok ? data.me : null;
  return (
    <>
      <button type="button" className="nav acct-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="acct-avatar" aria-hidden="true">{(first || role || '?')[0].toUpperCase()}</span>{first || 'Account'}
      </button>
      <dialog ref={dlg} className="acct-dialog" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === dlg.current) setOpen(false); }}>
        <div className="acct-head">
          <b>{personal ? name : 'Shared sign-in'}</b>
          <button type="button" className="linkish" onClick={() => setOpen(false)} aria-label="Close">✕</button>
        </div>
        <dl className="acct-info">
          <dt>Access</dt><dd>{ROLE[role] || role}</dd>
          {me && <><dt>Grades</dt><dd>{me.grades?.length ? me.grades.join(', ') : 'All grades'}</dd></>}
          {me?.email && <><dt>Email</dt><dd>{me.email}</dd></>}
          {me?.last_seen && <><dt>Last signed in</dt><dd>{new Date(me.last_seen).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' })}</dd></>}
        </dl>
        <p className="small muted">
          {admin ? 'You can change anyone’s access, name or sign-in on the People page.'
            : 'To change your name, access or sign-in code, ask James.'}
        </p>
        <div className="acct-foot">
          {admin ? <a href="/admin/people">Manage people →</a> : <span />}
          <a className="button" href="/logout">Sign out</a>
        </div>
      </dialog>
    </>
  );
}
