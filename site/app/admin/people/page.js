import { db } from '../../../lib/db';
import People from './People';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'People · James Deane Analysis' };

const SETUP_SQL = `create table if not exists site_users (
  id bigint generated always as identity primary key,
  name text not null,
  email text,
  role text not null default 'viewer' check (role in ('viewer', 'tagger', 'admin')),
  grades text[],
  code_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);
alter table site_users enable row level security;`;

export default async function PeoplePage() {
  const [{ data: people, error }, { data: comps }] = await Promise.all([
    db.from('site_users').select('id, name, email, role, grades, active, created_at, last_seen').order('name'),
    db.from('competitions').select('grade'),
  ]);
  const grades = [...new Set((comps || []).map((c) => c.grade).filter(Boolean))]
    .sort((a, b) => (['Senior', 'U20', 'Minor'].indexOf(a) + 1 || 9) - (['Senior', 'U20', 'Minor'].indexOf(b) + 1 || 9));
  const missing = error && /does not exist|could not find|schema cache/i.test(error.message);
  return (
    <>
      <p className="muted"><a href="/admin">Manage</a></p>
      <h1>People</h1>
      <p className="muted">
        Everyone gets their own access code. Switch a person off or reset their code and it takes effect straight away; nobody else is affected.
        <b> Viewers</b> see the stats, <b>taggers</b> can also use the live tagger and team sheets, <b>admins</b> can do everything.
        Limit viewers and taggers to certain grades, e.g. U20 management to U20 only.
      </p>
      {missing ? (
        <div className="card">
          <h2>One-off setup</h2>
          <p>The site needs a table to keep the list of people. In Supabase, open <b>SQL Editor → New query</b>, paste this in and press <b>Run</b>. Then reload this page.</p>
          <pre className="sql">{SETUP_SQL}</pre>
        </div>
      ) : error ? (
        <p className="card check warn">{error.message}</p>
      ) : (
        <People people={people || []} grades={grades} />
      )}
    </>
  );
}
