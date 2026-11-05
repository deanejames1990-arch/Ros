// Team crests: one small image per team, stored as a data URL in team_crests.
import { cache } from 'react';
import { db } from './db';

export const CREST_SQL = `create table if not exists team_crests (
  team_id bigint primary key references teams(id) on delete cascade,
  image text not null,
  updated_at timestamptz not null default now()
);
alter table team_crests enable row level security;`;

// { teamId: dataUrl } for every team with a crest; ready=false if the table isn't set up yet.
export const getCrests = cache(async () => {
  const { data, error } = await db.from('team_crests').select('team_id, image');
  if (error) return { ready: false, byId: {} };
  return { ready: true, byId: Object.fromEntries((data || []).map((r) => [r.team_id, r.image])) };
});
