import { db, MATCH_SELECT } from '../../lib/db';
import { currentAccess, gradeOk } from '../../lib/session';
import { getCrests } from '../../lib/crests';
import { currentOrg, ourTeamRe, scoped, orgScope } from '../../lib/org';
import Crest from '../Crest';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Teams · James Deane Analysis' };

const ORDER = ['Senior', 'Junior', 'U21', 'U20', 'Minor', 'U17', 'Club'];
const gOrder = (g) => ORDER.indexOf(g) + 1 || 99;

// Every county with games on the site, each linking to its combined report.
export default async function Teams() {
  const access = await currentAccess();
  const { byId: crests } = await getCrests();
  const org = await currentOrg();
  const US = ourTeamRe(org);
  const { data: all } = await (await orgScope())(db.from('matches').select(MATCH_SELECT)).order('match_date', { ascending: false }).limit(2000);
  const matches = (all || []).filter((m) => gradeOk(access, m.competitions?.grade));
  const teams = {};
  for (const m of matches || []) {
    for (const t of [{ ...m.team1, id: m.team1_id }, { ...m.team2, id: m.team2_id }]) {
      const k = t.name;
      const r = (teams[k] ||= { name: k, id: t.id, games: 0, grades: {}, last: m.match_date, vsRos: 0 });
      r.games += 1;
      const g = m.competitions?.grade || 'Senior';
      const y = m.competitions?.seasons?.year;
      const gr = (r.grades[g] ||= { games: 0, years: new Set() });
      gr.games += 1;
      if (y) gr.years.add(y);
      if ((US.test(m.team1.name) || US.test(m.team2.name)) && !US.test(k)) r.vsRos += 1;
    }
  }
  const list = Object.values(teams).sort((a, b) => (US.test(b.name) - US.test(a.name)) || a.name.localeCompare(b.name));
  const href = (name, grade) => `/team/${encodeURIComponent(name)}${grade ? `?grade=${encodeURIComponent(grade)}` : ''}`;

  return (
    <>
      <h1>Teams</h1>
      <p className="muted">Pick a county for its full report: every tagged game combined, by grade and season, with kick-outs, shooting, quarters, turnovers and players.</p>
      <div className="team-grid">
        {list.map((t) => (
          <div key={t.name} className={`card team-card ${US.test(t.name) ? 'ours' : ''}`}>
            <div className="team-head"><Crest name={t.name} src={crests[t.id]} size={36} /><a className="team-name" href={href(t.name)}>{t.name} →</a></div>
            <div className="muted small">
              {t.games} game{t.games === 1 ? '' : 's'}{t.vsRos ? ` · ${t.vsRos} v ${org.team_name}` : ''} · last {new Date(t.last).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            <div className="chips">
              {Object.entries(t.grades).sort((a, b) => gOrder(a[0]) - gOrder(b[0])).map(([g, v]) => (
                <a key={g} className="chip" href={href(t.name, g)}>{g} <b>{v.games}</b> <span className="muted">{[...v.years].sort().join(', ')}</span></a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
