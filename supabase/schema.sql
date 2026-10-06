-- =====================================================================
-- Monster Mash Trade Hub — Supabase schema (v3)
-- Run this whole file in Supabase: Dashboard → SQL Editor → New query → Run.
-- Re-running it drops and recreates the app's tables (all Friends, Groups,
-- Community and cloud-save data is erased), so only do that before real
-- players are using it. Uploaded profile photos in Storage are not deleted.
--
-- Security model
--   * Every table uses Row Level Security. The browser only has the public
--     publishable/anon key; this file decides what each signed-in player
--     may read or change.
--   * Anything with rules (friend requests, tokens, joining groups, trade
--     steps, partner events, roles, moderation) goes through SECURITY
--     DEFINER functions that check the caller first.
--   * The first account ever created becomes Admin.
--
-- Codes & tokens (from gen_random_uuid(), i.e. strong randomness)
--   MM-XXXX-XXXX        a player's friend code — sends a friend request
--   MMA-XXXX-XXXX-XXXX  one game account's token — a friend request that shares that account
--   MMG-XXXX-XXXX-XXXX  a group invite token — asks to join a group
--   Monopoly GO friend code / link — finds an account (if its owner allows) and sends a request
-- =====================================================================

-- ---------- clean re-run ----------
drop trigger if exists mm_on_auth_user_created on auth.users;
drop table if exists public.posts cascade;
drop table if exists public.partnership_members cascade;
drop table if exists public.partnerships cascade;
drop table if exists public.trade_requests cascade;
drop table if exists public.group_accounts cascade;
drop table if exists public.group_invites cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop table if exists public.account_access cascade;
drop table if exists public.account_keys cascade;
drop table if exists public.account_contacts cascade;
drop table if exists public.shared_accounts cascade;
drop table if exists public.friendships cascade;
drop table if exists public.user_roles cascade;
drop table if exists public.roles cascade;
drop table if exists public.user_state cascade;
drop table if exists public.profiles cascade;
-- tables from earlier versions of this file
drop table if exists public.space_accounts cascade;
drop table if exists public.space_members cascade;
drop table if exists public.spaces cascade;

-- Functions from this file and its earlier versions are dropped first, because PostgreSQL
-- cannot change a function's return type with "create or replace".
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'mm\_%' or p.proname = any (array[
             -- current
             'has_perm', 'is_admin', 'are_friends', 'group_role', 'is_group_member', 'has_group_row', 'is_group_admin', 'owns_account',
             'can_view_account', 'is_partnership_member', 'can_see_partnership', 'partnership_size', 'partner_slots_used', 'partner_slot_cap',
             'add_friend', 'respond_friend_request', 'rotate_account_token', 'account_links', 'leaderboard', 'find_players',
             'create_group_invite', 'join_group', 'join_public_group', 'invite_to_group', 'respond_group_invite', 'approve_group_member',
             'set_group_role', 'list_public_groups', 'trade_action', 'create_partnership', 'invite_to_partnership', 'respond_partnership',
             'approve_partner', 'create_role', 'update_role', 'delete_role', 'assign_role', 'mod_clear_avatar', 'mod_update_profile',
             'mod_clear_account_photo', 'mod_account_photos',
             -- earlier versions
             'send_friend_request', 'join_space', 'join_public_space', 'rotate_space_code', 'list_public_spaces',
             'is_space_member', 'share_a_space', 'can_reach', 'account_in_my_spaces']))
  loop
    execute format('drop function if exists %s cascade', f.sig);
  end loop;
end $$;

-- ---------- helpers ----------
-- Readable random code (no 0/O/1/I/L), from cryptographically strong random bytes.
create or replace function public.mm_code(len int)
returns text language plpgsql volatile set search_path = '' as $$
declare alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; bytes bytea := ''::bytea; out text := '';
begin
  while length(bytes) < len loop
    bytes := bytes || decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  end loop;
  for i in 0 .. len - 1 loop
    out := out || substr(alphabet, 1 + get_byte(bytes, i) % 31, 1);
  end loop;
  return out;
end $$;

-- Monopoly GO codes and links compared loosely: lower case, no protocol, letters and digits only.
create or replace function public.mm_norm(t text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(regexp_replace(lower(coalesce(t, '')), '^\s*https?://(www\.)?', ''), '[^a-z0-9]', '', 'g'), '');
$$;

-- =====================================================================
-- Tables
-- =====================================================================
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  username           text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name       text not null default 'Monster Masher' check (char_length(display_name) between 1 and 40),
  avatar             text not null default 'f04' check (avatar ~ '^[a-z0-9_]{1,12}$'),
  -- an uploaded photo; must live in this player's own folder of the "avatars" storage bucket
  avatar_url         text check (avatar_url is null or position('/storage/v1/object/public/avatars/' || id::text || '/' in avatar_url) > 0),
  bio                text not null default '' check (char_length(bio) <= 160),
  friend_code        text not null unique,
  leaderboard        boolean not null default false,      -- take part in Community leaderboards
  auto_friend        text not null default 'never' check (auto_friend in ('never', 'tokens', 'always')),
  auto_group_invites boolean not null default false,       -- accept group invites automatically
  setup_done         boolean not null default false,
  created_at         timestamptz not null default now()
);

-- One private cloud save per person (whole app state + sync preferences).
create table public.user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb,
  state_ms   bigint not null default 0,
  prefs      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (state is null or pg_column_size(state) < 3000000)
);

-- Staff roles. builtin 'admin' can do everything; 'moderator' starts with moderation rights.
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 30),
  color       text not null default '#b35cff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  description text not null default '' check (char_length(description) <= 300),
  perms       text[] not null default '{}' check (perms <@ array['manage_roles', 'assign_roles', 'moderate_avatars', 'moderate_posts', 'moderate_profiles', 'pin_posts']::text[]),
  builtin     text unique check (builtin in ('admin', 'moderator')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index roles_name on public.roles (lower(name));
insert into public.roles (name, color, description, perms, builtin) values
  ('Admin', '#ff4d98', 'Runs the site: every permission, and the only role that can hand out Admin.', array['manage_roles', 'assign_roles', 'moderate_avatars', 'moderate_posts', 'moderate_profiles', 'pin_posts'], 'admin'),
  ('Moderator', '#9df03c', 'Keeps the community friendly: removes unsuitable photos and edits or deletes posts.', array['moderate_avatars', 'moderate_posts', 'moderate_profiles', 'pin_posts'], 'moderator');

create table public.user_roles (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role_id    uuid not null references public.roles(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- via_account: the request was made through this (addressee's) account, so accepting shares it.
create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester    uuid not null references public.profiles(id) on delete cascade,
  addressee    uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  via_account  uuid,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester <> addressee)
);
create unique index friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee on public.friendships (addressee);

-- A game account someone put online. counts mirrors the app: 0 need, 1 have, 2+ have with spares.
--   visibility public : the whole album can be viewed by any signed-in player (Community → Public albums)
--   on_leaderboard    : ranked on Community leaderboards (also needs the owner's profile opt-in)
--   show_code/link    : whether others may see this account's Monopoly GO code / link
--   auto_share        : new friends are granted it automatically
--   findable          : others may find it by its Monopoly GO friend code or link
create table public.shared_accounts (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null references public.profiles(id) on delete cascade,
  local_id       text not null check (char_length(local_id) between 1 and 64),
  name           text not null check (char_length(name) between 1 and 60),
  avatar         text not null default 'f04' check (avatar ~ '^[a-z0-9_]{1,12}$'),
  visibility     text not null default 'private' check (visibility in ('private', 'public')),
  auto_share     boolean not null default true,
  findable       boolean not null default true,
  on_leaderboard boolean not null default false,
  show_code      boolean not null default false,
  show_link      boolean not null default false,
  counts         int[] not null check (array_length(counts, 1) between 1 and 1000),
  prestige       int not null default 0 check (prestige between 0 and 1000),
  -- the account's own picture: a file in the owner's folder of the "avatars" storage bucket
  photo_path     text check (photo_path is null or (split_part(photo_path, '/', 1) = owner::text
                   and photo_path ~ '^[0-9a-f-]{36}/acct-[A-Za-z0-9_-]{1,64}-[0-9]{1,16}\.(webp|png|jpg)$')),
  photo_cleared  text check (photo_cleared is null or char_length(photo_cleared) <= 200), -- last photo a moderator removed
  updated_at     timestamptz not null default now(),
  unique (owner, local_id)
);

alter table public.friendships add constraint friendships_via_account
  foreign key (via_account) references public.shared_accounts(id) on delete set null;

-- Monopoly GO code / link, kept apart so they are only revealed through account_links().
create table public.account_contacts (
  account_id  uuid primary key references public.shared_accounts(id) on delete cascade,
  owner       uuid not null references public.profiles(id) on delete cascade,
  mogo_code   text not null default '' check (char_length(mogo_code) <= 40),
  friend_link text not null default '' check (char_length(friend_link) <= 300),
  updated_at  timestamptz not null default now()
);
create index account_contacts_code on public.account_contacts (public.mm_norm(mogo_code));
create index account_contacts_link on public.account_contacts (public.mm_norm(friend_link));

-- Secret per-account friend token. Only the owner can read it.
create table public.account_keys (
  account_id   uuid primary key references public.shared_accounts(id) on delete cascade,
  owner        uuid not null references public.profiles(id) on delete cascade,
  friend_token text not null unique,
  created_at   timestamptz not null default now()
);

-- Which friend may view which of your accounts.
create table public.account_access (
  account_id uuid not null references public.shared_accounts(id) on delete cascade,
  viewer     uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (account_id, viewer)
);
create index account_access_viewer on public.account_access (viewer);

create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 50),
  description  text not null default '' check (char_length(description) <= 300),
  visibility   text not null default 'private' check (visibility in ('private', 'public')),
  icon         text not null default 'f36' check (icon ~ '^[a-z0-9_]{1,12}$'),
  auto_approve boolean not null default false,   -- let join requests in without an admin
  owner        uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);

-- status: active member · requested (asked to join, waiting for an admin) · invited (waiting for the player)
create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status     text not null default 'active' check (status in ('active', 'requested', 'invited')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user on public.group_members (user_id);

create table public.group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  token      text not null unique,
  label      text not null default '' check (char_length(label) <= 40),
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  max_uses   int check (max_uses is null or max_uses > 0),
  uses       int not null default 0,
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);
create index group_invites_group on public.group_invites (group_id);

create table public.group_accounts (
  group_id   uuid not null references public.groups(id) on delete cascade,
  account_id uuid not null references public.shared_accounts(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (group_id, account_id)
);
create index group_accounts_account on public.group_accounts (account_id);

-- One request moves a list of stickers from the giver's account to the receiver's account.
--   open     : posted to a group, any member can offer to fill it (the asker then approves)
--   pending  : waiting for the other person to approve
--   accepted : approved, giver still has to send in-game
--   sent     : giver says it is sent; receiver confirms
--   done / declined / cancelled : finished
create table public.trade_requests (
  id               uuid primary key default gen_random_uuid(),
  created_by       uuid not null references public.profiles(id) on delete cascade,
  giver            uuid references public.profiles(id) on delete cascade,
  receiver         uuid not null references public.profiles(id) on delete cascade,
  giver_account    uuid references public.shared_accounts(id) on delete set null,
  receiver_account uuid references public.shared_accounts(id) on delete set null,
  giver_name       text not null default '' check (char_length(giver_name) <= 60),
  receiver_name    text not null default '' check (char_length(receiver_name) <= 60),
  stickers         int[] not null check (array_length(stickers, 1) between 1 and 60),
  status           text not null check (status in ('open', 'pending', 'accepted', 'sent', 'done', 'declined', 'cancelled')),
  group_id         uuid references public.groups(id) on delete cascade,
  message          text not null default '' check (char_length(message) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (giver is null or giver <> receiver)
);
create index trade_requests_giver on public.trade_requests (giver);
create index trade_requests_receiver on public.trade_requests (receiver);
create index trade_requests_group on public.trade_requests (group_id) where status = 'open';

-- Partner events. partner / community are pairs; racers is a team of 4; adventure a team of 5.
create table public.partnerships (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('partner', 'community', 'racers', 'adventure')),
  title         text not null check (char_length(title) between 1 and 80),
  created_by    uuid not null references public.profiles(id) on delete cascade,
  group_id      uuid references public.groups(id) on delete set null,
  open_to_group boolean not null default false,
  starts_at     timestamptz,
  ends_at       timestamptz,
  goal          int not null default 0 check (goal >= 0),
  notes         text not null default '' check (char_length(notes) <= 1000),
  created_at    timestamptz not null default now()
);

-- status: joined · invited (waiting for the player) · requested (asked to join, waiting for the creator) · declined
create table public.partnership_members (
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  account_id     uuid references public.shared_accounts(id) on delete set null,
  account_name   text not null default '' check (char_length(account_name) <= 60),
  status         text not null default 'invited' check (status in ('invited', 'requested', 'joined', 'declined')),
  progress       int not null default 0 check (progress >= 0),
  note           text not null default '' check (char_length(note) <= 200),
  invited_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now(),
  primary key (partnership_id, user_id)
);
create index partnership_members_user on public.partnership_members (user_id);

-- Community feed.
create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  author     uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'general' check (kind in ('general', 'looking', 'offering', 'event', 'tip')),
  body       text not null check (char_length(body) between 1 and 600),
  stickers   int[] check (stickers is null or (array_length(stickers, 1) <= 30 and 0 <= all (stickers) and 1000 > all (stickers))),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  edited_by  uuid references public.profiles(id) on delete set null
);
create index posts_created on public.posts (pinned desc, created_at desc);

-- =====================================================================
-- Checks used by the rules (SECURITY DEFINER so policies can use them without recursion)
-- =====================================================================
create or replace function public.mm_me() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  return auth.uid();
end $$;

create or replace function public.has_perm(u uuid, p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select u is not null and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = u and (r.builtin = 'admin' or p = any (r.perms)));
$$;

create or replace function public.is_admin(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select u is not null and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = u and r.builtin = 'admin');
$$;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships f
    where f.status = 'accepted' and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)));
$$;

create or replace function public.group_role(g uuid, u uuid default auth.uid()) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.group_members m where m.group_id = g and m.user_id = u and m.status = 'active';
$$;

create or replace function public.is_group_member(g uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select g is not null and exists (select 1 from public.group_members m where m.group_id = g and m.user_id = u and m.status = 'active');
$$;

create or replace function public.has_group_row(g uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = g and m.user_id = u);
$$;

create or replace function public.is_group_admin(g uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.group_role(g, u) in ('owner', 'admin'), false);
$$;

create or replace function public.owns_account(acc uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select acc is not null and exists (select 1 from public.shared_accounts a where a.id = acc and a.owner = u);
$$;

-- Can the current player see this shared account?
create or replace function public.can_view_account(acc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shared_accounts a where a.id = acc and (
    a.owner = auth.uid()
    or a.visibility = 'public'
    or (exists (select 1 from public.account_access x where x.account_id = a.id and x.viewer = auth.uid())
        and public.are_friends(a.owner, auth.uid()))
    or exists (select 1 from public.group_accounts ga join public.group_members m on m.group_id = ga.group_id
               where ga.account_id = a.id and m.user_id = auth.uid() and m.status = 'active')));
$$;

create or replace function public.is_partnership_member(p uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partnership_members pm where pm.partnership_id = p and pm.user_id = u and pm.status = 'joined');
$$;

create or replace function public.can_see_partnership(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partnerships x where x.id = p and (
    x.created_by = auth.uid()
    or exists (select 1 from public.partnership_members pm where pm.partnership_id = x.id and pm.user_id = auth.uid())
    or (x.open_to_group and public.is_group_member(x.group_id))));
$$;

create or replace function public.partnership_size(k text) returns int
language sql immutable set search_path = '' as $$
  select case k when 'partner' then 2 when 'community' then 2 when 'racers' then 4 when 'adventure' then 5 else 2 end;
$$;

-- Live pairings an account is already in (Monopoly GO: Partner Build 4, Community Chest 3).
create or replace function public.partner_slots_used(acc uuid, k text) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.partnership_members pm join public.partnerships p on p.id = pm.partnership_id
  where pm.account_id = acc and p.kind = k and pm.status = 'joined' and (p.ends_at is null or p.ends_at > now());
$$;

create or replace function public.partner_slot_cap(k text) returns int
language sql immutable set search_path = '' as $$
  select case k when 'partner' then 4 when 'community' then 3 else 1000 end;
$$;

-- ---------- internal (not callable from the app) ----------
-- Make two players friends and share each side's auto-share accounts (plus the account the request came through).
create or replace function public.mm__befriend(a uuid, b uuid, via uuid default null, b_accounts uuid[] default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships where least(requester, addressee) = least(a, b) and greatest(requester, addressee) = greatest(a, b) and status = 'pending';
  insert into public.friendships (requester, addressee, status, responded_at) values (a, b, 'accepted', now())
  on conflict ((least(requester, addressee)), (greatest(requester, addressee)))
  do update set status = 'accepted', responded_at = now();
  insert into public.account_access (account_id, viewer)
    select id, b from public.shared_accounts where owner = a and auto_share on conflict do nothing;
  insert into public.account_access (account_id, viewer)
    select id, a from public.shared_accounts
    where owner = b and (case when b_accounts is null then auto_share else id = any (b_accounts) end)
    on conflict do nothing;
  if via is not null then
    insert into public.account_access (account_id, viewer)
      select id, a from public.shared_accounts where id = via and owner = b on conflict do nothing;
  end if;
end $$;

-- =====================================================================
-- Triggers
-- =====================================================================
create or replace function public.mm__new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  loop
    code := 'MM-' || public.mm_code(4) || '-' || public.mm_code(4);
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  insert into public.profiles (id, display_name, friend_code)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data ->> 'full_name', 40), ''),
                           nullif(left(split_part(coalesce(new.email, ''), '@', 1), 40), ''), 'Monster Masher'), code)
  on conflict (id) do nothing;
  insert into public.user_state (user_id) values (new.id) on conflict (user_id) do nothing;
  -- the very first player becomes Admin
  if not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where r.builtin = 'admin') then
    insert into public.user_roles (user_id, role_id) select new.id, id from public.roles where builtin = 'admin';
  end if;
  return new;
end $$;
create trigger mm_on_auth_user_created after insert on auth.users
  for each row execute function public.mm__new_user();

create or replace function public.mm__new_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_keys (account_id, owner, friend_token)
  values (new.id, new.owner, 'MMA-' || public.mm_code(4) || '-' || public.mm_code(4) || '-' || public.mm_code(4));
  insert into public.account_contacts (account_id, owner) values (new.id, new.owner) on conflict do nothing;
  return new;
end $$;
create trigger mm_new_account after insert on public.shared_accounts
  for each row execute function public.mm__new_account();

create or replace function public.mm__unfriend_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'accepted' then
    delete from public.account_access x using public.shared_accounts a
     where x.account_id = a.id and ((a.owner = old.requester and x.viewer = old.addressee) or (a.owner = old.addressee and x.viewer = old.requester));
  end if;
  return old;
end $$;
create trigger mm_unfriend_cleanup after delete on public.friendships
  for each row execute function public.mm__unfriend_cleanup();

create or replace function public.mm__group_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.group_members (group_id, user_id, role, status) values (new.id, new.owner, 'owner', 'active') on conflict do nothing;
  return new;
end $$;
create trigger mm_group_owner after insert on public.groups
  for each row execute function public.mm__group_owner();

-- Post edits: record who edited, and only pinners may pin.
create or replace function public.mm__post_edit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.pinned is distinct from old.pinned and not public.has_perm(auth.uid(), 'pin_posts') then
    raise exception 'You cannot pin posts';
  end if;
  if new.body is distinct from old.body or new.stickers is distinct from old.stickers or new.kind is distinct from old.kind then
    if old.author <> auth.uid() and not public.has_perm(auth.uid(), 'moderate_posts') then
      raise exception 'You can only edit your own posts';
    end if;
    new.edited_at := now(); new.edited_by := auth.uid();
  end if;
  return new;
end $$;
create trigger mm_post_edit before update on public.posts for each row execute function public.mm__post_edit();

create or replace function public.mm__touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger mm_touch_state before update on public.user_state for each row execute function public.mm__touch();
create trigger mm_touch_accounts before update on public.shared_accounts for each row execute function public.mm__touch();
create trigger mm_touch_contacts before update on public.account_contacts for each row execute function public.mm__touch();
create trigger mm_touch_trades before update on public.trade_requests for each row execute function public.mm__touch();
create trigger mm_touch_pmembers before update on public.partnership_members for each row execute function public.mm__touch();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.user_state          enable row level security;
alter table public.roles               enable row level security;
alter table public.user_roles          enable row level security;
alter table public.friendships         enable row level security;
alter table public.shared_accounts     enable row level security;
alter table public.account_contacts    enable row level security;
alter table public.account_keys        enable row level security;
alter table public.account_access      enable row level security;
alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.group_invites       enable row level security;
alter table public.group_accounts      enable row level security;
alter table public.trade_requests      enable row level security;
alter table public.partnerships        enable row level security;
alter table public.partnership_members enable row level security;
alter table public.posts               enable row level security;

-- Nothing is readable while signed out.
revoke all on public.profiles, public.user_state, public.roles, public.user_roles, public.friendships, public.shared_accounts,
  public.account_contacts, public.account_keys, public.account_access, public.groups, public.group_members, public.group_invites,
  public.group_accounts, public.trade_requests, public.partnerships, public.partnership_members, public.posts from anon;

-- profiles: signed-in players can look each other up; you edit only your own settings.
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_edit on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated;
grant update (username, display_name, avatar, avatar_url, bio, leaderboard, auto_friend, auto_group_invites, setup_done) on public.profiles to authenticated;

-- user_state: strictly private.
create policy state_own on public.user_state for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- roles: everyone sees role badges; changes go through the role functions.
create policy roles_read on public.roles for select to authenticated using (true);
create policy user_roles_read on public.user_roles for select to authenticated using (true);
revoke insert, update, delete on public.roles, public.user_roles from authenticated;

-- friendships: see your own; create/answer through functions; either side may unfriend or withdraw.
create policy friends_read on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy friends_delete on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));
revoke insert, update on public.friendships from authenticated;

-- shared_accounts (owner checked inline so a just-inserted row can be returned to its owner)
create policy accounts_read on public.shared_accounts for select to authenticated using (
  owner = auth.uid() or visibility = 'public' or public.can_view_account(id));
create policy accounts_insert on public.shared_accounts for insert to authenticated with check (owner = auth.uid());
create policy accounts_update on public.shared_accounts for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy accounts_delete on public.shared_accounts for delete to authenticated using (owner = auth.uid());

-- account_contacts: only the owner reads or edits them directly; others use account_links().
create policy contacts_own on public.account_contacts for select to authenticated using (owner = auth.uid());
create policy contacts_edit on public.account_contacts for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
revoke insert, delete on public.account_contacts from authenticated;

-- account_keys: owner only (tokens are rotated through rotate_account_token).
create policy keys_read on public.account_keys for select to authenticated using (owner = auth.uid());
revoke insert, update, delete on public.account_keys from authenticated;

-- account_access: the owner grants/revokes for friends; a viewer may see and drop their own grants.
create policy access_read on public.account_access for select to authenticated using (viewer = auth.uid() or public.owns_account(account_id, auth.uid()));
create policy access_grant on public.account_access for insert to authenticated with check (
  public.owns_account(account_id, auth.uid()) and public.are_friends(auth.uid(), viewer));
create policy access_revoke on public.account_access for delete to authenticated using (viewer = auth.uid() or public.owns_account(account_id, auth.uid()));
revoke update on public.account_access from authenticated;

-- groups: public ones are visible to everyone signed in; private ones to members, and to people invited or asking to join.
create policy groups_read on public.groups for select to authenticated using (visibility = 'public' or owner = auth.uid() or public.has_group_row(id));
create policy groups_create on public.groups for insert to authenticated with check (owner = auth.uid());
create policy groups_edit on public.groups for update to authenticated using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy groups_delete on public.groups for delete to authenticated using (owner = auth.uid());
revoke insert, update on public.groups from authenticated;
grant insert (name, description, visibility, icon, auto_approve, owner) on public.groups to authenticated;
grant update (name, description, visibility, icon, auto_approve) on public.groups to authenticated;

-- group_members: members see everyone (incl. requests/invites); players see their own row.
-- Leave / cancel a request / decline an invite = delete your row (never the owner's).
create policy gmembers_read on public.group_members for select to authenticated using (public.is_group_member(group_id) or user_id = auth.uid());
create policy gmembers_remove on public.group_members for delete to authenticated using (
  role <> 'owner' and (user_id = auth.uid() or public.is_group_admin(group_id)));
revoke insert, update on public.group_members from authenticated;

create policy invites_read on public.group_invites for select to authenticated using (public.is_group_admin(group_id));
create policy invites_revoke on public.group_invites for update to authenticated using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy invites_delete on public.group_invites for delete to authenticated using (public.is_group_admin(group_id));
revoke insert, update on public.group_invites from authenticated;
grant update (revoked, label) on public.group_invites to authenticated;

create policy gaccounts_read on public.group_accounts for select to authenticated using (public.is_group_member(group_id));
create policy gaccounts_add on public.group_accounts for insert to authenticated with check (
  public.is_group_member(group_id) and public.owns_account(account_id, auth.uid()));
create policy gaccounts_remove on public.group_accounts for delete to authenticated using (
  public.owns_account(account_id, auth.uid()) or public.is_group_admin(group_id));
revoke update on public.group_accounts from authenticated;

-- trade_requests: every trade starts as a request the other side must approve.
create policy trades_read on public.trade_requests for select to authenticated using (
  auth.uid() in (created_by, receiver) or auth.uid() = giver
  or (status = 'open' and public.is_group_member(group_id)));
create policy trades_create on public.trade_requests for insert to authenticated with check (
  created_by = auth.uid()
  and public.owns_account(receiver_account, receiver)
  and (
    (status = 'open' and giver is null and giver_account is null and receiver = auth.uid() and public.is_group_member(group_id))
    or (status = 'pending' and giver is not null and auth.uid() in (giver, receiver)
        and public.owns_account(giver_account, giver)
        and public.can_view_account(case when auth.uid() = giver then receiver_account else giver_account end)
        and (public.are_friends(giver, receiver)
             or (group_id is not null and public.is_group_member(group_id, giver) and public.is_group_member(group_id, receiver))))
  ));
create policy trades_delete on public.trade_requests for delete to authenticated using (
  created_by = auth.uid() and status in ('open', 'pending', 'declined', 'cancelled', 'done'));
revoke update on public.trade_requests from authenticated;

-- partnerships
create policy partnerships_read on public.partnerships for select to authenticated using (public.can_see_partnership(id));
create policy partnerships_edit on public.partnerships for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy partnerships_delete on public.partnerships for delete to authenticated using (created_by = auth.uid());
revoke insert, update on public.partnerships from authenticated;
grant update (title, notes, starts_at, ends_at, goal, open_to_group) on public.partnerships to authenticated;

create policy pmembers_read on public.partnership_members for select to authenticated using (public.can_see_partnership(partnership_id));
create policy pmembers_edit on public.partnership_members for update to authenticated using (user_id = auth.uid() and status = 'joined') with check (user_id = auth.uid());
create policy pmembers_leave on public.partnership_members for delete to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.partnerships p where p.id = partnership_id and p.created_by = auth.uid()));
revoke insert, update on public.partnership_members from authenticated;
grant update (progress, note) on public.partnership_members to authenticated;

-- posts: anyone signed in can read and post; authors and moderators can edit or delete.
create policy posts_read on public.posts for select to authenticated using (true);
create policy posts_create on public.posts for insert to authenticated with check (author = auth.uid() and not pinned);
create policy posts_edit on public.posts for update to authenticated using (author = auth.uid() or public.has_perm(auth.uid(), 'moderate_posts') or public.has_perm(auth.uid(), 'pin_posts'))
  with check (author = auth.uid() or public.has_perm(auth.uid(), 'moderate_posts') or public.has_perm(auth.uid(), 'pin_posts'));
create policy posts_delete on public.posts for delete to authenticated using (author = auth.uid() or public.has_perm(auth.uid(), 'moderate_posts'));
revoke insert, update on public.posts from authenticated;
grant insert (author, kind, body, stickers) on public.posts to authenticated;
grant update (kind, body, stickers, pinned) on public.posts to authenticated;

-- =====================================================================
-- Profile photos (Supabase Storage bucket "avatars": public to view, 512 KB, images only)
-- Each player may only write inside a folder named after their own id; moderators may delete any.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 524288, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists mm_avatars_read on storage.objects;
drop policy if exists mm_avatars_insert on storage.objects;
drop policy if exists mm_avatars_update on storage.objects;
drop policy if exists mm_avatars_delete on storage.objects;
create policy mm_avatars_read on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
create policy mm_avatars_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy mm_avatars_update on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text) with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy mm_avatars_delete on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_perm(auth.uid(), 'moderate_avatars')));

-- =====================================================================
-- Actions (called from the app with supabase.rpc)
-- =====================================================================

-- Add a friend with: username / @username, friend code (MM-…), account token (MMA-…),
-- or a Monopoly GO friend code / link. Every add is a request; the other player's
-- auto-approval setting may accept it straight away.
-- Returns { result, name }:  sent | accepted | already | pending | self | not_found | account_added
create or replace function public.add_friend(target text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.mm_me(); t text := trim(coalesce(target, '')); other uuid; f public.friendships%rowtype;
  k record; acc record; key text; n int := 0; nm text; auto text;
begin
  if t = '' then return jsonb_build_object('result', 'not_found'); end if;

  -- 1) account token
  if upper(t) ~ '^MMA-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$' then
    select k2.account_id, k2.owner, a.name into k from public.account_keys k2 join public.shared_accounts a on a.id = k2.account_id
     where k2.friend_token = upper(t);
    if not found then return jsonb_build_object('result', 'not_found'); end if;
    if k.owner = me then return jsonb_build_object('result', 'self'); end if;
    if public.are_friends(me, k.owner) then
      -- already friends: the token still shares its account
      insert into public.account_access (account_id, viewer) values (k.account_id, me) on conflict do nothing;
      return jsonb_build_object('result', 'account_added', 'name', k.name);
    end if;
    select auto_friend into auto from public.profiles where id = k.owner;
    if auto in ('tokens', 'always') then
      perform public.mm__befriend(me, k.owner, k.account_id, '{}'::uuid[]);
      return jsonb_build_object('result', 'account_added', 'name', k.name);
    end if;
    select * into f from public.friendships
     where least(requester, addressee) = least(me, k.owner) and greatest(requester, addressee) = greatest(me, k.owner);
    if found and f.requester <> me then
      perform public.mm__befriend(f.requester, me, f.via_account, case when f.via_account is not null then '{}'::uuid[] end);
      insert into public.account_access (account_id, viewer) values (k.account_id, me) on conflict do nothing;
      return jsonb_build_object('result', 'account_added', 'name', k.name);
    end if;
    delete from public.friendships where id = f.id;
    insert into public.friendships (requester, addressee, via_account) values (me, k.owner, k.account_id);
    return jsonb_build_object('result', 'sent', 'name', k.name);
  end if;

  -- 2) player: friend code or username
  select id, display_name, auto_friend into other, nm, auto from public.profiles
   where friend_code = upper(t) or username = lower(regexp_replace(t, '^@', '')) limit 1;
  if other is not null then
    if other = me then return jsonb_build_object('result', 'self'); end if;
    select * into f from public.friendships
     where least(requester, addressee) = least(me, other) and greatest(requester, addressee) = greatest(me, other);
    if found then
      if f.status = 'accepted' then return jsonb_build_object('result', 'already', 'name', nm); end if;
      if f.requester = me then return jsonb_build_object('result', 'pending', 'name', nm); end if;
      -- they already asked us: that is mutual, so accept
      perform public.mm__befriend(f.requester, me, f.via_account, case when f.via_account is not null then '{}'::uuid[] end);
      return jsonb_build_object('result', 'accepted', 'name', nm);
    end if;
    if auto = 'always' then
      perform public.mm__befriend(me, other, null);
      return jsonb_build_object('result', 'accepted', 'name', nm);
    end if;
    insert into public.friendships (requester, addressee) values (me, other);
    return jsonb_build_object('result', 'sent', 'name', nm);
  end if;

  -- 3) Monopoly GO friend code or link (only accounts whose owner allows it)
  key := public.mm_norm(t);
  if key is null or length(key) < 6 then return jsonb_build_object('result', 'not_found'); end if;
  for acc in select a.id, a.owner, a.name, p.auto_friend from public.shared_accounts a
             join public.account_contacts c on c.account_id = a.id join public.profiles p on p.id = a.owner
             where a.findable and a.owner <> me and (public.mm_norm(c.mogo_code) = key or public.mm_norm(c.friend_link) = key) loop
    n := n + 1; nm := acc.name;
    select * into f from public.friendships
     where least(requester, addressee) = least(me, acc.owner) and greatest(requester, addressee) = greatest(me, acc.owner);
    if not found then
      if acc.auto_friend = 'always' then perform public.mm__befriend(me, acc.owner, acc.id, '{}'::uuid[]);
      else insert into public.friendships (requester, addressee, via_account) values (me, acc.owner, acc.id); end if;
    elsif f.status = 'pending' and f.requester = me then
      update public.friendships set via_account = acc.id where id = f.id;
    elsif f.status = 'accepted' then
      return jsonb_build_object('result', 'already', 'name', acc.name);
    end if;
  end loop;
  if n = 0 then return jsonb_build_object('result', 'not_found'); end if;
  return jsonb_build_object('result', 'sent', 'name', nm);
end $$;

-- Answer a friend request. share = which of your accounts they may view
-- (null = your auto-share accounts, or only the account the request came through).
create or replace function public.respond_friend_request(request uuid, accept boolean, share uuid[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); f public.friendships%rowtype;
begin
  select * into f from public.friendships where id = request and addressee = me and status = 'pending';
  if not found then raise exception 'That friend request is no longer waiting for you'; end if;
  if accept then
    perform public.mm__befriend(f.requester, me, f.via_account, coalesce(share, case when f.via_account is not null then '{}'::uuid[] end));
  else
    delete from public.friendships where id = f.id;
  end if;
end $$;

create or replace function public.rotate_account_token(account uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); tok text;
begin
  tok := 'MMA-' || public.mm_code(4) || '-' || public.mm_code(4) || '-' || public.mm_code(4);
  update public.account_keys set friend_token = tok where account_id = account and owner = me;
  if not found then raise exception 'That is not your account'; end if;
  return tok;
end $$;

-- Monopoly GO code / link for accounts you can see, only where the owner chose to show them.
create or replace function public.account_links(ids uuid[])
returns table (account_id uuid, mogo_code text, friend_link text)
language sql stable security definer set search_path = '' as $$
  select a.id,
         case when a.show_code or a.owner = auth.uid() then c.mogo_code else '' end,
         case when a.show_link or a.owner = auth.uid() then c.friend_link else '' end
  from public.shared_accounts a join public.account_contacts c on c.account_id = a.id
  where a.id = any (ids) and auth.uid() is not null and public.can_view_account(a.id);
$$;

-- Community leaderboard: accounts whose owners opted in. stars = star value per sticker (from the app).
create or replace function public.leaderboard(stars int[] default null, lim int default 200)
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

create or replace function public.find_players(search text)
returns table (id uuid, username text, display_name text, avatar text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar, p.avatar_url from public.profiles p
  where auth.uid() is not null and length(trim(coalesce(search, ''))) >= 2
    and (p.username ilike '%' || trim(search) || '%' or p.display_name ilike '%' || trim(search) || '%')
  order by p.username nulls last limit 30;
$$;

-- ---------- groups ----------
create or replace function public.create_group_invite(grp uuid, days int default 7, max_uses int default null, label text default '')
returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); tok text;
begin
  if not public.is_group_admin(grp, me) then raise exception 'Only group admins can make invite tokens'; end if;
  tok := 'MMG-' || public.mm_code(4) || '-' || public.mm_code(4) || '-' || public.mm_code(4);
  insert into public.group_invites (group_id, token, label, created_by, expires_at, max_uses)
  values (grp, tok, left(coalesce(label, ''), 40), me,
          case when days is null or days <= 0 then null else now() + make_interval(days => days) end,
          case when max_uses is null or max_uses <= 0 then null else max_uses end);
  return tok;
end $$;

-- Ask to join with a token. Returns { group, status }: active (in) or requested (waiting for an admin).
create or replace function public.join_group(token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); inv public.group_invites%rowtype; g public.groups%rowtype; m public.group_members%rowtype;
begin
  select * into inv from public.group_invites where group_invites.token = upper(trim(join_group.token)) for update;
  if not found or inv.revoked then raise exception 'That invite token is not valid'; end if;
  if inv.expires_at is not null and inv.expires_at < now() then raise exception 'That invite token has expired'; end if;
  select * into g from public.groups where id = inv.group_id;
  select * into m from public.group_members where group_id = g.id and user_id = me;
  if found then
    if m.status = 'invited' then
      update public.group_members set status = 'active', joined_at = now() where group_id = g.id and user_id = me;
      return jsonb_build_object('group', g.id, 'status', 'active');
    end if;
    return jsonb_build_object('group', g.id, 'status', m.status);
  end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then raise exception 'That invite token has been used up'; end if;
  insert into public.group_members (group_id, user_id, status) values (g.id, me, case when g.auto_approve then 'active' else 'requested' end);
  update public.group_invites set uses = uses + 1 where id = inv.id;
  return jsonb_build_object('group', g.id, 'status', case when g.auto_approve then 'active' else 'requested' end);
end $$;

create or replace function public.join_public_group(grp uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); g public.groups%rowtype; st text;
begin
  select * into g from public.groups where id = grp and visibility = 'public';
  if not found then raise exception 'That group is private — you need an invite token'; end if;
  select status into st from public.group_members where group_id = grp and user_id = me;
  if st = 'invited' then update public.group_members set status = 'active', joined_at = now() where group_id = grp and user_id = me; return 'active'; end if;
  if st is not null then return st; end if;
  st := case when g.auto_approve then 'active' else 'requested' end;
  insert into public.group_members (group_id, user_id, status) values (grp, me, st);
  return st;
end $$;

-- Invite a friend. Returns active (their settings accept invites automatically) or invited.
create or replace function public.invite_to_group(grp uuid, invitee uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); st text; auto boolean;
begin
  if not public.is_group_admin(grp, me) then raise exception 'Only group admins can invite people'; end if;
  if not public.are_friends(me, invitee) then raise exception 'You can invite your friends'; end if;
  select status into st from public.group_members where group_id = grp and user_id = invitee;
  if st = 'requested' then update public.group_members set status = 'active', joined_at = now() where group_id = grp and user_id = invitee; return 'active'; end if;
  if st is not null then return st; end if;
  select auto_group_invites into auto from public.profiles where id = invitee;
  st := case when auto then 'active' else 'invited' end;
  insert into public.group_members (group_id, user_id, status, invited_by) values (grp, invitee, st, me);
  return st;
end $$;

create or replace function public.respond_group_invite(grp uuid, accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me();
begin
  if accept then
    update public.group_members set status = 'active', joined_at = now() where group_id = grp and user_id = me and status = 'invited';
  else
    delete from public.group_members where group_id = grp and user_id = me and status = 'invited';
  end if;
  if not found then raise exception 'That invite is no longer waiting for you'; end if;
end $$;

create or replace function public.approve_group_member(grp uuid, member uuid, approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me();
begin
  if not public.is_group_admin(grp, me) then raise exception 'Only group admins can approve members'; end if;
  if approve then
    update public.group_members set status = 'active', joined_at = now() where group_id = grp and user_id = member and status = 'requested';
  else
    delete from public.group_members where group_id = grp and user_id = member and status = 'requested';
  end if;
  if not found then raise exception 'That request is no longer waiting'; end if;
end $$;

create or replace function public.set_group_role(grp uuid, member uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me();
begin
  if new_role not in ('admin', 'member') then raise exception 'Role must be admin or member'; end if;
  if not exists (select 1 from public.groups where id = grp and owner = me) then raise exception 'Only the group owner can change roles'; end if;
  update public.group_members set role = new_role where group_id = grp and user_id = member and role <> 'owner' and status = 'active';
end $$;

create or replace function public.list_public_groups(search text default '')
returns table (id uuid, name text, description text, icon text, member_count bigint, my_status text, auto_approve boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.description, g.icon,
         (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'active'),
         (select m.status from public.group_members m where m.group_id = g.id and m.user_id = auth.uid()),
         g.auto_approve, g.created_at
  from public.groups g
  where g.visibility = 'public' and auth.uid() is not null
    and (coalesce(search, '') = '' or g.name ilike '%' || search || '%' or g.description ilike '%' || search || '%')
  order by 5 desc, g.created_at desc
  limit 60;
$$;

-- ---------- trades ----------
-- One step of a trade. action: accept | decline | cancel | sent | done | claim (offer to fill an open ask; needs your account)
create or replace function public.trade_action(request uuid, action text, account uuid default null)
returns public.trade_requests
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); r public.trade_requests%rowtype; acc_name text;
begin
  select * into r from public.trade_requests where id = request for update;
  if not found then raise exception 'That trade request no longer exists'; end if;

  if action = 'claim' then
    -- filling an open ask turns it into an offer the asker still has to approve
    if r.status <> 'open' then raise exception 'Someone already offered to fill this request'; end if;
    if me = r.receiver or not public.is_group_member(r.group_id, me) then raise exception 'You cannot fill this request'; end if;
    select name into acc_name from public.shared_accounts where id = account and owner = me;
    if acc_name is null then raise exception 'Pick one of your shared accounts to send from'; end if;
    update public.trade_requests set giver = me, giver_account = account, giver_name = acc_name, status = 'pending', created_by = me
     where id = r.id returning * into r;
    return r;
  end if;

  if me is distinct from r.giver and me <> r.receiver and me <> r.created_by then raise exception 'This trade is not yours'; end if;

  if action = 'accept' then
    if r.status <> 'pending' or me = r.created_by then raise exception 'Only the other person can approve this'; end if;
    r.status := 'accepted';
  elsif action = 'decline' then
    if r.status <> 'pending' or me = r.created_by then raise exception 'Only the other person can decline this'; end if;
    r.status := 'declined';
  elsif action = 'cancel' then
    if r.status not in ('open', 'pending', 'accepted', 'sent') then raise exception 'This trade is already finished'; end if;
    r.status := 'cancelled';
  elsif action = 'sent' then
    if me is distinct from r.giver then raise exception 'Only the sender can mark it sent'; end if;
    -- a giver answering a request may approve and send in one step; otherwise it must be approved first
    if not (r.status = 'accepted' or (r.status = 'pending' and r.created_by <> me)) then raise exception 'This trade has to be approved first'; end if;
    r.status := 'sent';
  elsif action = 'done' then
    if me <> r.receiver or r.status <> 'sent' then raise exception 'Only the receiver can confirm it arrived'; end if;
    r.status := 'done';
  else
    raise exception 'Unknown trade action %', action;
  end if;

  update public.trade_requests set status = r.status where id = r.id returning * into r;
  return r;
end $$;

-- ---------- partner events ----------
create or replace function public.create_partnership(
  kind text, title text, account uuid, grp uuid default null, open_to_group boolean default false,
  starts_at timestamptz default null, ends_at timestamptz default null, goal int default 0, notes text default '')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); pid uuid; acc_name text;
begin
  select name into acc_name from public.shared_accounts where id = account and owner = me;
  if acc_name is null then raise exception 'Pick one of your shared accounts'; end if;
  if grp is not null and not public.is_group_member(grp, me) then raise exception 'You are not in that group'; end if;
  if public.partner_slots_used(account, kind) >= public.partner_slot_cap(kind) then
    raise exception '% already has the maximum % partners', acc_name, public.partner_slot_cap(kind);
  end if;
  insert into public.partnerships (kind, title, created_by, group_id, open_to_group, starts_at, ends_at, goal, notes)
  values (kind, title, me, grp, coalesce(open_to_group, false) and grp is not null, starts_at, ends_at, greatest(coalesce(goal, 0), 0), coalesce(notes, ''))
  returning id into pid;
  insert into public.partnership_members (partnership_id, user_id, account_id, account_name, status, invited_by)
  values (pid, me, account, acc_name, 'joined', me);
  return pid;
end $$;

create or replace function public.invite_to_partnership(partnership uuid, invitee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); p public.partnerships%rowtype; n int;
begin
  select * into p from public.partnerships where id = partnership;
  if not found or not public.is_partnership_member(partnership, me) then raise exception 'Join this event before inviting others'; end if;
  select count(*) into n from public.partnership_members where partnership_id = partnership and status in ('joined', 'invited');
  if n >= public.partnership_size(p.kind) then raise exception 'This % is already full', p.kind; end if;
  if not (public.are_friends(me, invitee) or (p.group_id is not null and public.is_group_member(p.group_id, invitee))) then
    raise exception 'You can invite friends, or members of the group this event belongs to';
  end if;
  insert into public.partnership_members (partnership_id, user_id, status, invited_by) values (partnership, invitee, 'invited', me)
  on conflict (partnership_id, user_id) do update set status = 'invited', invited_by = me
    where public.partnership_members.status in ('declined', 'requested');
end $$;

-- Accept/decline an invite, or ask to join an open group event (the creator approves).
-- Returns joined | requested | declined.
create or replace function public.respond_partnership(partnership uuid, accept boolean, account uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); p public.partnerships%rowtype; m public.partnership_members%rowtype; acc_name text; n int; st text;
begin
  select * into p from public.partnerships where id = partnership;
  if not found then raise exception 'That event no longer exists'; end if;
  select * into m from public.partnership_members where partnership_id = partnership and user_id = me;
  if not accept then
    update public.partnership_members set status = 'declined' where partnership_id = partnership and user_id = me and status in ('invited', 'requested');
    return 'declined';
  end if;
  if found and m.status = 'joined' then return 'joined'; end if;
  if not (found and m.status = 'invited') and not (p.open_to_group and public.is_group_member(p.group_id, me)) then
    raise exception 'You were not invited to this event';
  end if;
  select name into acc_name from public.shared_accounts where id = account and owner = me;
  if acc_name is null then raise exception 'Pick one of your shared accounts'; end if;
  if public.partner_slots_used(account, p.kind) >= public.partner_slot_cap(p.kind) then
    raise exception '% already has the maximum % partners', acc_name, public.partner_slot_cap(p.kind);
  end if;
  select count(*) into n from public.partnership_members where partnership_id = partnership and status = 'joined';
  if n >= public.partnership_size(p.kind) then raise exception 'This event is already full'; end if;
  st := case when found and m.status = 'invited' then 'joined' else 'requested' end;
  insert into public.partnership_members (partnership_id, user_id, account_id, account_name, status, invited_by)
  values (partnership, me, account, acc_name, st, p.created_by)
  on conflict (partnership_id, user_id) do update set account_id = excluded.account_id, account_name = excluded.account_name, status = st;
  return st;
end $$;

create or replace function public.approve_partner(partnership uuid, member uuid, approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); p public.partnerships%rowtype; m public.partnership_members%rowtype; n int;
begin
  select * into p from public.partnerships where id = partnership;
  if not found or p.created_by <> me then raise exception 'Only the event creator can approve players'; end if;
  select * into m from public.partnership_members where partnership_id = partnership and user_id = member and status = 'requested';
  if not found then raise exception 'That request is no longer waiting'; end if;
  if not approve then delete from public.partnership_members where partnership_id = partnership and user_id = member; return; end if;
  select count(*) into n from public.partnership_members where partnership_id = partnership and status = 'joined';
  if n >= public.partnership_size(p.kind) then raise exception 'This event is already full'; end if;
  if m.account_id is not null and public.partner_slots_used(m.account_id, p.kind) >= public.partner_slot_cap(p.kind) then
    raise exception 'That account already has the maximum partners';
  end if;
  update public.partnership_members set status = 'joined' where partnership_id = partnership and user_id = member;
end $$;

-- ---------- roles & moderation ----------
create or replace function public.mm__perm_ok(me uuid, perms text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  -- you may only hand out permissions you have yourself (Admin has them all)
  select public.is_admin(me) or not exists (select 1 from unnest(perms) p where not public.has_perm(me, p));
$$;

create or replace function public.create_role(name text, color text, description text, perms text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); rid uuid;
begin
  if not public.has_perm(me, 'manage_roles') then raise exception 'You cannot create roles'; end if;
  if not public.mm__perm_ok(me, perms) then raise exception 'You can only give a role permissions you have yourself'; end if;
  if exists (select 1 from public.roles r where lower(r.name) = lower(trim(create_role.name))) then raise exception 'A role with that name already exists'; end if;
  insert into public.roles (name, color, description, perms, created_by) values (trim(name), color, coalesce(description, ''), coalesce(perms, '{}'), me)
  returning id into rid;
  return rid;
end $$;

create or replace function public.update_role(role uuid, name text, color text, description text, perms text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); r public.roles%rowtype;
begin
  if not public.has_perm(me, 'manage_roles') then raise exception 'You cannot edit roles'; end if;
  select * into r from public.roles where id = role;
  if not found then raise exception 'That role no longer exists'; end if;
  if r.builtin = 'admin' and not public.is_admin(me) then raise exception 'Only an Admin can edit the Admin role'; end if;
  if not public.mm__perm_ok(me, perms) or not public.mm__perm_ok(me, r.perms) then raise exception 'You can only manage permissions you have yourself'; end if;
  if exists (select 1 from public.roles x where lower(x.name) = lower(trim(update_role.name)) and x.id <> role) then raise exception 'A role with that name already exists'; end if;
  update public.roles set name = trim(update_role.name), color = update_role.color, description = coalesce(update_role.description, ''),
    perms = case when r.builtin = 'admin' then r.perms else coalesce(update_role.perms, '{}') end
  where id = role;
end $$;

create or replace function public.delete_role(role uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); r public.roles%rowtype;
begin
  if not public.has_perm(me, 'manage_roles') then raise exception 'You cannot delete roles'; end if;
  select * into r from public.roles where id = role;
  if not found then return; end if;
  if r.builtin is not null then raise exception 'The % role is built in and cannot be deleted', r.name; end if;
  if not public.mm__perm_ok(me, r.perms) then raise exception 'You can only manage permissions you have yourself'; end if;
  delete from public.roles where id = role;
end $$;

create or replace function public.assign_role(member uuid, role uuid, give boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); r public.roles%rowtype;
begin
  if not public.has_perm(me, 'assign_roles') then raise exception 'You cannot hand out roles'; end if;
  select * into r from public.roles where id = role;
  if not found then raise exception 'That role no longer exists'; end if;
  if r.builtin = 'admin' and not public.is_admin(me) then raise exception 'Only an Admin can make Admins'; end if;
  if not public.mm__perm_ok(me, r.perms) then raise exception 'You can only hand out roles whose permissions you have yourself'; end if;
  if give then
    insert into public.user_roles (user_id, role_id, granted_by) values (member, role, me) on conflict do nothing;
  else
    if r.builtin = 'admin' and (select count(*) from public.user_roles where role_id = role) <= 1 then
      raise exception 'The site needs at least one Admin';
    end if;
    delete from public.user_roles where user_id = member and role_id = role;
  end if;
end $$;

create or replace function public.mod_clear_avatar(member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me();
begin
  if not public.has_perm(me, 'moderate_avatars') then raise exception 'You cannot moderate profile photos'; end if;
  update public.profiles set avatar_url = null where id = member;
end $$;

-- Account photos: moderators can list every one (private albums included) and remove any.
create or replace function public.mod_account_photos(lim int default 300)
returns table (account_id uuid, owner uuid, name text, photo_path text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm(public.mm_me(), 'moderate_avatars') then raise exception 'You cannot moderate photos'; end if;
  return query select a.id, a.owner, a.name, a.photo_path, a.updated_at from public.shared_accounts a
    where a.photo_path is not null order by a.updated_at desc limit least(greatest(coalesce(lim, 300), 1), 1000);
end $$;

-- Returns the removed file's path so the moderator's app can delete it from Storage.
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

create or replace function public.mod_update_profile(member uuid, new_display_name text, new_bio text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me();
begin
  if not public.has_perm(me, 'moderate_profiles') then raise exception 'You cannot moderate profiles'; end if;
  update public.profiles set display_name = left(coalesce(nullif(trim(new_display_name), ''), 'Monster Masher'), 40), bio = left(coalesce(new_bio, ''), 160) where id = member;
end $$;

-- =====================================================================
-- Players who signed up before this file was (re-)run get a fresh profile,
-- and the earliest of them becomes Admin.
-- =====================================================================
do $$
declare u record; code text;
begin
  for u in select id, email, raw_user_meta_data from auth.users order by created_at loop
    if not exists (select 1 from public.profiles where id = u.id) then
      loop
        code := 'MM-' || public.mm_code(4) || '-' || public.mm_code(4);
        exit when not exists (select 1 from public.profiles where friend_code = code);
      end loop;
      insert into public.profiles (id, display_name, friend_code)
      values (u.id, coalesce(nullif(left(u.raw_user_meta_data ->> 'full_name', 40), ''), nullif(left(split_part(coalesce(u.email, ''), '@', 1), 40), ''), 'Monster Masher'), code);
      insert into public.user_state (user_id) values (u.id) on conflict (user_id) do nothing;
    end if;
  end loop;
  if not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where r.builtin = 'admin') then
    insert into public.user_roles (user_id, role_id)
    select (select id from auth.users order by created_at limit 1), r.id from public.roles r
    where r.builtin = 'admin' and exists (select 1 from auth.users);
  end if;
end $$;

-- =====================================================================
-- Function permissions: nothing for anon; policy helpers and actions for
-- signed-in players; mm__* internals for nobody (triggers still run them).
-- =====================================================================
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'mm\_%' or p.proname in (
             'has_perm', 'is_admin', 'are_friends', 'group_role', 'is_group_member', 'has_group_row', 'is_group_admin', 'owns_account',
             'can_view_account', 'is_partnership_member', 'can_see_partnership', 'partnership_size', 'partner_slots_used', 'partner_slot_cap',
             'add_friend', 'respond_friend_request', 'rotate_account_token', 'account_links', 'leaderboard', 'find_players',
             'create_group_invite', 'join_group', 'join_public_group', 'invite_to_group', 'respond_group_invite', 'approve_group_member',
             'set_group_role', 'list_public_groups', 'trade_action', 'create_partnership', 'invite_to_partnership', 'respond_partnership',
             'approve_partner', 'create_role', 'update_role', 'delete_role', 'assign_role', 'mod_clear_avatar', 'mod_update_profile',
             'mod_clear_account_photo', 'mod_account_photos')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname not like 'mm\_\_%' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- =====================================================================
-- Realtime: push changes to the app (Row Level Security still applies)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['user_state', 'profiles', 'friendships', 'account_access', 'shared_accounts', 'group_members', 'group_accounts',
                           'trade_requests', 'partnerships', 'partnership_members', 'posts', 'user_roles', 'roles'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
