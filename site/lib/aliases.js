// Tag-name tidying: "Lundy" in a team's tags means "Ciarán Lundy". Stored per
// team in the name_aliases table and applied wherever names are shown, so it
// works for every game, including files imported later.
import { cache } from 'react';
import { db } from './db';

export const ALIAS_SQL = `create table if not exists name_aliases (
  id bigint generated always as identity primary key,
  team_id bigint not null,
  alias text not null,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists name_aliases_team_alias on name_aliases (team_id, lower(alias));
alter table name_aliases enable row level security;`;

// All aliases (a small table), once per request. [] if the table isn't set up yet.
export const getAliases = cache(async () => {
  const { data, error } = await db.from('name_aliases').select('team_id, alias, name');
  if (error) return [];
  return data || [];
});
