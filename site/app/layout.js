import './globals.css';
import { currentAccess } from '../lib/session';
import { authEnabled } from '../lib/auth';
import AccountMenu from './account/AccountMenu';

export const metadata = { title: 'James Deane Analysis' };

export default async function RootLayout({ children }) {
  const access = await currentAccess();
  const role = access?.role;
  return (
    <html lang="en">
      <body>
        <header>
          <a href="/" className="brand"><img src="/crest.png" alt="Roscommon GAA crest" />James Deane Analysis</a>
          {role && (
            <nav className="nav-links">
              <a className="nav" href="/games">Games</a>
              <a className="nav" href="/teams">Teams</a>
              <a className="nav" href="/briefing">Briefings</a>
              {(role === 'admin' || role === 'tagger') && <a className="nav" href="/admin/live">Live tagger</a>}
              {role === 'admin' && <a className="nav" href="/admin/import">Add game</a>}
              {role === 'admin' && <a className="nav" href="/admin">Manage</a>}
              {authEnabled() && <AccountMenu name={access?.name || ''} role={role} personal={Boolean(access?.uid)} admin={role === 'admin'} />}
            </nav>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
