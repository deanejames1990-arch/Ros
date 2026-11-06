'use client';

import { usePathname } from 'next/navigation';
import { switchOrg } from './admin/orgs/actions';

// Site owner only: which organisation's site to look at.
export default function OrgSwitch({ orgs, current }) {
  const path = usePathname();
  return (
    <form action={switchOrg} className="org-switch">
      <input type="hidden" name="next" value={path.startsWith('/match/') || path.startsWith('/briefing/') || path.startsWith('/admin/game/') ? '/' : path} />
      <select name="org" defaultValue={current || ''} aria-label="Organisation" onChange={(e) => e.target.form.requestSubmit()}>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </form>
  );
}
