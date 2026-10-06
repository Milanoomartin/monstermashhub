-- =====================================================================
-- Monster Mash — account photos everyone can see (migration 001)
-- Run once in Supabase → SQL Editor. Safe to run again. KEEPS ALL DATA
-- (unlike re-running schema.sql, which starts the database over).
--
-- Adds to each shared album:
--   photo_path     its picture: a file in the owner's own folder of the
--                  existing "avatars" Storage bucket (only that folder is allowed)
--   photo_cleared  the last picture a moderator removed, so the owner's app
--                  does not upload it again
-- Plus: leaderboard() returns photo_path, and moderators get
-- mod_account_photos() / mod_clear_account_photo().
-- =====================================================================

alter table public.shared_accounts add column if not exists photo_path text;
alter table public.shared_accounts add column if not exists photo_cleared text;

alter table public.shared_accounts drop constraint if exists shared_accounts_photo_path_check;
alter table public.shared_accounts add constraint shared_accounts_photo_path_check check (
  photo_path is null or (split_part(photo_path, '/', 1) = owner::text
    and photo_path ~ '^[0-9a-f-]{36}/acct-[A-Za-z0-9_-]{1,64}-[0-9]{1,16}\.(webp|png|jpg)$'));
alter table public.shared_accounts drop constraint if exists shared_accounts_photo_cleared_check;
alter table public.shared_accounts add constraint shared_accounts_photo_cleared_check check (
  photo_cleared is null or char_length(photo_cleared) <= 200);

-- leaderboard() gains a column, and PostgreSQL can't change a return type in place.
drop function if exists public.leaderboard(int[], int);
create function public.leaderboard(stars int[] default null, lim int default 200)
returns table (account_id uuid, owner uuid, name text, avatar text, username text, display_name text, owner_avatar text, avatar_url text,
               is_public boolean, have int, sets int, star_total int, spares int, prestige int, updated_at timestamptz, photo_path text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.owner, a.name, a.avatar, p.username, p.display_name, p.avatar, p.avatar_url, a.visibility = 'public',
    (select count(*)::int from unnest(a.counts) c where c > 0),
    (select count(*)::int from (select (o - 1) / 9 as s, count(*) filter (where c > 0) as n from unnest(a.counts) with ordinality u(c, o) group by 1) q where q.n = 9),
    coalesce((select sum(case when u.c > 0 then coalesce(stars[u.o::int], 0) else 0 end)::int from unnest(a.counts) with ordinality u(c, o)), 0),
    (select coalesce(sum(greatest(c - 1, 0)), 0)::int from unnest(a.counts) c),
    a.prestige, a.updated_at, a.photo_path
  from public.shared_accounts a join public.profiles p on p.id = a.owner
  where a.on_leaderboard and p.leaderboard and auth.uid() is not null
  order by 14 desc, 10 desc, 15 asc
  limit least(greatest(coalesce(lim, 200), 1), 500);
$$;

create or replace function public.mod_account_photos(lim int default 300)
returns table (account_id uuid, owner uuid, name text, photo_path text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm(public.mm_me(), 'moderate_avatars') then raise exception 'You cannot moderate photos'; end if;
  return query select a.id, a.owner, a.name, a.photo_path, a.updated_at from public.shared_accounts a
    where a.photo_path is not null order by a.updated_at desc limit least(greatest(coalesce(lim, 300), 1), 1000);
end $$;

create or replace function public.mod_clear_account_photo(account uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); old text;
begin
  if not public.has_perm(me, 'moderate_avatars') then raise exception 'You cannot moderate photos'; end if;
  select photo_path into old from public.shared_accounts where id = account;
  if old is not null then
    update public.shared_accounts set photo_path = null, photo_cleared = old where id = account;
  end if;
  return old;
end $$;

revoke all on function public.leaderboard(int[], int), public.mod_account_photos(int), public.mod_clear_account_photo(uuid) from public, anon, authenticated;
grant execute on function public.leaderboard(int[], int), public.mod_account_photos(int), public.mod_clear_account_photo(uuid) to authenticated;
