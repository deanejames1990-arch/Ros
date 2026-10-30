import './globals.css';

export const metadata = { title: 'Roscommon GAA Stats' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header><a href="/" className="brand"><img src="/crest.png" alt="Roscommon GAA crest" />Roscommon GAA Stats</a><a className="nav" href="/admin/import">Add game</a></header>
        <main>{children}</main>
      </body>
    </html>
  );
}
