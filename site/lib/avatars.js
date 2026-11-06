// A photo for each person (site_users), kept as a small data URL in user_avatars.
import { cache } from 'react';
import { db } from './db';

export const AVATAR_SQL = `create table if not exists user_avatars (
  user_id bigint primary key references site_users(id) on delete cascade,
  image text not null,
  updated_at timestamptz not null default now()
);
alter table user_avatars enable row level security;`;

// { userId: dataUrl }; ready=false until the table is set up.
export const getAvatars = cache(async () => {
  const { data, error } = await db.from('user_avatars').select('user_id, image');
  if (error) return { ready: false, byId: {} };
  return { ready: true, byId: Object.fromEntries((data || []).map((r) => [r.user_id, r.image])) };
});

export const getAvatar = cache(async (uid) => {
  if (!uid) return null;
  const { data, error } = await db.from('user_avatars').select('image').eq('user_id', Number(uid)).limit(1);
  return error ? null : data?.[0]?.image || null;
});
