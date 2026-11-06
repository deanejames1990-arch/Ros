// Organisations: each club or county sees only its own games, people,
// briefings and name tidy-ups. Teams, players and crests are shared rows, but
// only reached through an organisation's own games.
//
// Until ORG_SQL has been run the site works as one organisation (no filtering).
import { cache } from 'react';
import { db } from './db';
import { currentAccess } from './session';
import { COUNTIES } from './nacsport';

export const ORG_SQL = `-- Organisations (clubs / counties). Your existing data becomes the first one.
create table if not exists organisations (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null default 'county' check (kind in ('club', 'county')),
  team_name text not null,
  crest text,
  created_at timestamptz not null default now()
);
alter table organisations enable row level security;
insert into organisations (name, kind, team_name)
  select 'Roscommon GAA', 'county', 'Roscommon' where not exists (select 1 from organisations);

-- Each game, person, briefing and name tidy-up belongs to one organisation.
alter table matches add column if not exists org_id bigint references organisations(id);
alter table site_users add column if not exists org_id bigint references organisations(id);
alter table briefings add column if not exists org_id bigint references organisations(id);
alter table name_aliases add column if not exists org_id bigint references organisations(id);
update matches set org_id = (select min(id) from organisations) where org_id is null;
update site_users set org_id = (select min(id) from organisations) where org_id is null;
update briefings set org_id = (select min(id) from organisations) where org_id is null;
update name_aliases set org_id = (select min(id) from organisations) where org_id is null;
create index if not exists matches_org_id on matches (org_id);

-- Two organisations can load the same Nacsport file: game codes are unique within one.
alter table matches drop constraint if exists matches_match_code_key;
drop index if exists matches_match_code_key;
create unique index if not exists matches_org_code on matches (org_id, match_code);

-- Name tidy-ups are per organisation now.
drop index if exists name_aliases_team_alias;
create unique index if not exists name_aliases_org_team_alias on name_aliases (org_id, team_id, lower(alias));

-- A site owner role that sees every organisation.
alter table site_users drop constraint if exists site_users_role_check;
alter table site_users add constraint site_users_role_check check (role in ('viewer', 'tagger', 'admin', 'super'));`;

// Every organisation (a small table), once per request. ready=false until ORG_SQL is run.
export const getOrgs = cache(async () => {
  const { data, error } = await db.from('organisations').select('id, name, kind, team_name, crest').order('id');
  if (error || !data?.length) return { ready: false, list: [] };
  return { ready: true, list: data };
});

const FALLBACK = { ready: false, id: null, name: 'James Deane Analysis', kind: 'county', team_name: 'Roscommon', crest: null };

// The organisation this request is for.
export const currentOrg = cache(async () => {
  const [a, { ready, list }] = await Promise.all([currentAccess(), getOrgs()]);
  if (!ready) return FALLBACK;
  const o = list.find((x) => x.id === a?.orgId) || list[0];
  return { ready: true, ...o };
});

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "Our team": the organisation's own team name, at the start of a team's name.
export const ourTeamRe = (org) => new RegExp(`^${esc(org?.team_name || 'Roscommon')}\\b`, 'i');
export const isOurTeam = (org, name) => ourTeamRe(org).test(String(name || ''));

// Adds the organisation filter to a query on matches / briefings / name_aliases / site_users.
export async function scoped(query) {
  const o = await currentOrg();
  return o.ready ? query.eq('org_id', o.id) : query;
}

// { org_id } to add to new rows (nothing before organisations are set up).
export async function orgStamp() {
  const o = await currentOrg();
  return o.ready ? { org_id: o.id } : {};
}

// Throws unless the game belongs to this organisation. Returns the org.
export async function assertMatch(matchId) {
  const o = await currentOrg();
  if (!o.ready) return o;
  const { data } = await db.from('matches').select('org_id').eq('id', Number(matchId)).single();
  if (!data || data.org_id !== o.id) throw new Error('That game isn’t in your organisation.');
  return o;
}

// Is this game row (with org_id) visible to this organisation?
export async function matchVisible(m) {
  const o = await currentOrg();
  return !o.ready || (m && m.org_id === o.id);
}

// The ids of this organisation's games (null = no filtering yet), once per request.
export const orgMatchIds = cache(async () => {
  const o = await currentOrg();
  if (!o.ready) return null;
  const ids = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('matches').select('id').eq('org_id', o.id).range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data || []) ids.add(r.id);
    if (!data || data.length < 1000) return ids;
  }
});

// Keeps only rows (appearances etc.) from this organisation's games.
export async function inOrg(rows, key = 'match_id') {
  const ids = await orgMatchIds();
  return ids ? (rows || []).filter((r) => ids.has(r[key])) : rows || [];
}

// Teams and competitions this organisation's games use (null = no filtering yet),
// for pickers, so one organisation never sees another's club or competition names.
export const orgUsed = cache(async () => {
  const o = await currentOrg();
  if (!o.ready) return null;
  const teams = new Set(), comps = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('matches').select('team1_id, team2_id, competition_id').eq('org_id', o.id).range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data || []) { teams.add(r.team1_id); teams.add(r.team2_id); comps.add(r.competition_id); }
    if (!data || data.length < 1000) return { teams, comps };
  }
});
export async function onlyOrgTeams(rows, key = 'id') {
  const u = await orgUsed();
  return u ? (rows || []).filter((r) => u.teams.has(r[key])) : rows || [];
}
export async function onlyOrgComps(rows, key = 'id') {
  const u = await orgUsed();
  return u ? (rows || []).filter((r) => u.comps.has(r[key])) : rows || [];
}

// Team pickers: this organisation's teams plus every county (the same for everyone),
// but never another organisation's clubs.
const COUNTY_RE = new RegExp(`^(${COUNTIES.join('|')})$`, 'i');
export async function pickerTeams(allTeams) {
  const u = await orgUsed();
  if (!u) return allTeams || [];
  const seen = new Set();
  return (allTeams || []).filter((t) => (u.teams.has(t.id) || COUNTY_RE.test(t.name)) && !seen.has(t.id) && seen.add(t.id));
}

// The same filter as a plain function, for building a query further after it:
//   (await orgScope())(db.from('matches').select('*')).order('match_date')
// (an async helper can't hand back a query: awaiting it would run the query).
export async function orgScope() {
  const o = await currentOrg();
  return (query) => (o.ready ? query.eq('org_id', o.id) : query);
}
