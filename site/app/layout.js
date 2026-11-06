import './globals.css';
import { currentAccess } from '../lib/session';
import { authEnabled } from '../lib/auth';
import AccountMenu from './account/AccountMenu';
import { getAvatar } from '../lib/avatars';
import { currentOrg, getOrgs } from '../lib/org';
import OrgSwitch from './OrgSwitch';
import Crest from './Crest';

export const metadata = { title: 'James Deane Analysis' };

export default async function RootLayout({ children }) {
  const access = await currentAccess();
  const role = access?.role;
  const avatar = access?.uid ? await getAvatar(access.uid) : null;
  const [org, { list: orgs }] = await Promise.all([currentOrg(), getOrgs()]);
  // Each organisation's own name and crest; the first one (Roscommon) keeps the original crest.
  const brandName = org.ready ? org.name : 'James Deane Analysis';
  const brandCrest = org.crest || (!org.ready || org.id === orgs[0]?.id ? '/crest.png' : null);
  return (
    <html lang="en">
      <body>
        <header>
          <a href="/" className="brand">{brandCrest ? <img src={brandCrest} alt="" /> : <Crest name={brandName} size={40} />}{brandName}</a>
          {access?.isSuper && orgs.length > 1 && <OrgSwitch orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} current={org.id} />}
          {role && (
            <nav className="nav-links">
              <a className="nav" href="/games">Games</a>
              <a className="nav" href="/teams">Teams</a>
              <a className="nav" href="/briefing">Briefings</a>
              {(role === 'admin' || role === 'tagger') && <a className="nav" href="/admin/live">Live tagger</a>}
              {role === 'admin' && <a className="nav" href="/admin/import">Add game</a>}
              {role === 'admin' && <a className="nav" href="/admin">Manage</a>}
              {authEnabled() && <AccountMenu name={access?.name || ''} avatar={avatar} role={role} personal={Boolean(access?.uid)} admin={role === 'admin'} />}
            </nav>
          )}
        </header>
        <main>{children}</main>
        {org.ready && <footer className="site-foot">Powered by James Deane Analysis</footer>}
      </body>
    </html>
  );
}
