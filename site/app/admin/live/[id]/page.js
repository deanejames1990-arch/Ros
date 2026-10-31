import { notFound } from 'next/navigation';
import { db, MATCH_SELECT, loadEvents } from '../../../../lib/db';
import { isLiveCode, isFinishedCode } from '../../../../lib/live';
import { sheetData } from '../../../../lib/sheets-data';
import Tagger from './Tagger';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Live tagger · Roscommon GAA Stats' };

export default async function LiveGame({ params }) {
  const { data: m } = await db.from('matches').select(MATCH_SELECT).eq('id', Number(params.id)).single();
  if (!m) notFound();
  if (!isLiveCode(m.match_code)) {
    return <p className="card">This game was imported from a file, so it can’t be tagged live. <a href={`/match/${m.id}`}>Open the dashboard</a>.</p>;
  }
  const teams = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
  // Roscommon (or whoever "our team" is) on the left.
  if (/roscommon/i.test(teams[1].name) && !/roscommon/i.test(teams[0].name)) teams.reverse();
  const [events, sheets] = await Promise.all([loadEvents(m.id), sheetData(m.id, teams)]);
  const halfLen = Number(String(m.match_code).split('-')[2]) || (m.competitions?.grade === 'Senior' ? 35 : 30);
  return (
    <Tagger
      match={{ id: m.id, title: `${m.team1.name} v ${m.team2.name}`, competition: m.competitions?.name || '', date: m.match_date, halfLen,
        hideNames: m.competitions?.show_player_names === false, finished: isFinishedCode(m.match_code),
        official: { [m.team1_id]: { g: m.team1_goals, p: m.team1_points }, [m.team2_id]: { g: m.team2_goals, p: m.team2_points } } }}
      teams={teams}
      saved={events}
      sheetInfo={sheets}
    />
  );
}
