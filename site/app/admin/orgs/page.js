import { notFound } from 'next/navigation';
import { db } from '../../../lib/db';
import { currentAccess } from '../../../lib/session';
import { getOrgs, currentOrg, ORG_SQL } from '../../../lib/org';
import Orgs from './Orgs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Organisations · James Deane Analysis' };

export default async function OrgsPage() {
  const a = await currentAccess();
  if (!a?.isSuper) notFound();
  const [{ ready, list }, cur] = await Promise.all([getOrgs(), currentOrg()]);
  let counts = {};
  if (ready) {
    const [{ data: games }, { data: people }] = await Promise.all([
      db.from('matches').select('org_id').limit(10000),
      db.from('site_users').select('org_id, role').limit(5000),
    ]);
    for (const o of list) counts[o.id] = { games: (games || []).filter((g) => g.org_id === o.id).length, people: (people || []).filter((p) => p.org_id === o.id && p.role !== 'super').length };
  }
  return (
    <>
      <p className="muted"><a href="/admin">Manage</a></p>
      <h1>Organisations</h1>
      <p className="muted">
        Each club or county sees only its own games, people, briefings and tidied names, with its own name and crest in the header.
        Its admin can add their own people, upload games, keep team sheets, tag live and build briefings. You see every organisation: switch between them at the top of the page.
      </p>
      {!ready ? (
        <div className="card">
          <h2>One-off setup</h2>
          <p>Run this once in Supabase (<b>SQL Editor → New query</b>, paste, <b>Run</b>), then reload this page. Everything already on the site becomes <b>Roscommon GAA</b>, so nothing changes for the people using it now.</p>
          <pre className="sql">{ORG_SQL}</pre>
        </div>
      ) : (
        <Orgs orgs={list.map((o) => ({ ...o, ...counts[o.id] }))} current={cur.id} />
      )}
    </>
  );
}
