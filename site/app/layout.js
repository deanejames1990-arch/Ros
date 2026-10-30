import './globals.css';
import { currentRole } from '../lib/session';
import { authEnabled } from '../lib/auth';

export const metadata = { title: 'Roscommon GAA Stats' };

export default async function RootLayout({ children }) {
  const role = await currentRole();
  return (
    <html lang="en">
      <body>
        <header>
          <a href="/" className="brand"><img src="/crest.png" alt="Roscommon GAA crest" />Roscommon GAA Stats</a>
          {role && (
            <nav className="nav-links">
              {role === 'admin' && <a className="nav" href="/admin/import">Add game</a>}
              {role === 'admin' && <a className="nav" href="/admin">Manage</a>}
              {authEnabled() && <a className="nav" href="/logout">Log out</a>}
            </nav>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
