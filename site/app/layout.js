import './globals.css';

export const metadata = { title: 'Roscommon GAA Stats' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header><a href="/">Roscommon GAA Stats</a></header>
        <main>{children}</main>
      </body>
    </html>
  );
}
