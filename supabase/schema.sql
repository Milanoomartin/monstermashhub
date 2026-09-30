-- =====================================================================
-- Monster Mash Trade Hub — Supabase schema
-- Run this whole file once in Supabase: Dashboard → SQL Editor → New query → Run.
-- Re-running it drops and recreates the app's tables, so only do that
-- before real players are using it.
--
-- Security model
--   * Every table uses Row Level Security. The browser only has the public
--     anon/publishable key; this file decides what each signed-in player
--     may read or change.
--   * Anything with rules (friend requests, tokens, joining groups, trade
--     steps, partnership invites) goes through SECURITY DEFINER functions
--     that check the caller first.
--
-- Codes & tokens (all generated from gen_random_uuid(), i.e. strong randomness)
--   MM-XXXX-XXXX        a player's friend code — sends a friend request
--   MMA-XXXX-XXXX-XXXX  one game account's token — instant friendship + view of that account
--   MMG-XXXX-XXXX-XXXX  a group invite token — join a group (can expire / have a use limit)
--   A Monopoly GO friend code or link finds a matching account and sends a request
--   for view of that account only.
-- =====================================================================

-- ---------- clean re-run ----------
drop trigger if exists mm_on_auth_user_created on auth.users;
drop table if exists public.partnership_members cascade;
drop table if exists public.partnerships cascade;
drop table if exists public.trade_requests cascade;
drop table if exists public.group_accounts cascade;
drop table if exists public.group_invites cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop table if exists public.account_access cascade;
drop table if exists public.account_keys cascade;
drop table if exists public.shared_accounts cascade;
drop table if exists public.friendships cascade;
drop table if exists public.user_state cascade;
drop table if exists public.profiles cascade;

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
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default 'Monster Masher' check (char_length(display_name) between 1 and 40),
  avatar       text not null default 'f04' check (avatar ~ '^[a-z0-9_]{1,12}$'),
  bio          text not null default '' check (char_length(bio) <= 160),
  friend_code  text not null unique,
  created_at   timestamptz not null default now()
);

-- One private cloud save per person (whole app state + sync preferences).
create table public.user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb,
  state_ms   bigint not null default 0,          -- the app's own updatedAt (ms) for conflict checks
  prefs      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (state is null or pg_column_size(state) < 3000000)
);

-- via_account: the request was made by looking up this (addressee's) account,
-- so accepting it shares that account with the requester.
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

-- A game account someone chose to put online. counts mirrors the app: 0 need, 1 have, 2+ have with spares.
--   visibility private : only friends you grant it to, and groups you add it to
--   visibility public  : any signed-in player
--   auto_share         : new friends are granted it automatically
--   findable           : others may find it by its Monopoly GO friend code or link
create table public.shared_accounts (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references public.profiles(id) on delete cascade,
  local_id    text not null check (char_length(local_id) between 1 and 64),
  name        text not null check (char_length(name) between 1 and 60),
  avatar      text not null default 'f04' check (avatar ~ '^[a-z0-9_]{1,12}$'),
  friend_link text not null default '' check (char_length(friend_link) <= 300),
  mogo_code   text not null default '' check (char_length(mogo_code) <= 40),
  visibility  text not null default 'private' check (visibility in ('private', 'public')),
  auto_share  boolean not null default true,
  findable    boolean not null default true,
  counts      int[] not null check (array_length(counts, 1) between 1 and 1000),
  prestige    int not null default 0 check (prestige between 0 and 1000),
  updated_at  timestamptz not null default now(),
  unique (owner, local_id)
);
create index shared_accounts_mogo_code on public.shared_accounts (public.mm_norm(mogo_code)) where findable;
create index shared_accounts_mogo_link on public.shared_accounts (public.mm_norm(friend_link)) where findable;

alter table public.friendships add constraint friendships_via_account
  foreign key (via_account) references public.shared_accounts(id) on delete set null;

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
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 50),
  description text not null default '' check (char_length(description) <= 300),
  visibility  text not null default 'private' check (visibility in ('private', 'public')),
  icon        text not null default 'f36' check (icon ~ '^[a-z0-9_]{1,12}$'),
  owner       uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user on public.group_members (user_id);

-- Invite tokens. A token works until it is revoked, expires or runs out of uses.
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
--   open     : posted to a group, any member can claim it (giver unknown yet)
--   pending  : waiting for the other person to accept
--   accepted : agreed, giver still has to send in-game
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

create table public.partnership_members (
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  account_id     uuid references public.shared_accounts(id) on delete set null,
  account_name   text not null default '' check (char_length(account_name) <= 60),
  status         text not null default 'invited' check (status in ('invited', 'joined', 'declined')),
  progress       int not null default 0 check (progress >= 0),
  note           text not null default '' check (char_length(note) <= 200),
  invited_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now(),
  primary key (partnership_id, user_id)
);
create index partnership_members_user on public.partnership_members (user_id);

-- =====================================================================
-- Relationship checks (SECURITY DEFINER so policies can use them without recursion)
-- =====================================================================
create or replace function public.mm_me() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  return auth.uid();
end $$;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships f
    where f.status = 'accepted' and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)));
$$;

create or replace function public.group_role(g uuid, u uuid default auth.uid()) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.group_members m where m.group_id = g and m.user_id = u;
$$;

create or replace function public.is_group_member(g uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select g is not null and exists (select 1 from public.group_members m where m.group_id = g and m.user_id = u);
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
               where ga.account_id = a.id and m.user_id = auth.uid())));
$$;

create or replace function public.is_partnership_member(p uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partnership_members pm where pm.partnership_id = p and pm.user_id = u and pm.status <> 'declined');
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
-- Make two players friends and share each side's auto-share accounts (plus the looked-up account).
create or replace function public.mm__befriend(a uuid, b uuid, via uuid default null, b_accounts uuid[] default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.friendships (requester, addressee, status, responded_at) values (a, b, 'accepted', now())
  on conflict ((least(requester, addressee)), (greatest(requester, addressee)))
  do update set status = 'accepted', responded_at = now();
  -- a's automatic shares → b
  insert into public.account_access (account_id, viewer)
    select id, b from public.shared_accounts where owner = a and auto_share on conflict do nothing;
  -- b's shares → a: the accounts b picked, or b's automatic shares
  insert into public.account_access (account_id, viewer)
    select id, a from public.shared_accounts
    where owner = b and (case when b_accounts is null then auto_share else id = any (b_accounts) end)
    on conflict do nothing;
  -- the account that was looked up / redeemed is always shared with the person who asked for it
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
  return new;
end $$;
create trigger mm_on_auth_user_created after insert on auth.users
  for each row execute function public.mm__new_user();

-- Every shared account gets its secret friend token.
create or replace function public.mm__new_account_key() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_keys (account_id, owner, friend_token)
  values (new.id, new.owner, 'MMA-' || public.mm_code(4) || '-' || public.mm_code(4) || '-' || public.mm_code(4));
  return new;
end $$;
create trigger mm_new_account_key after insert on public.shared_accounts
  for each row execute function public.mm__new_account_key();

-- Unfriending removes every view grant between the two players.
create or replace function public.mm__unfriend_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.account_access x using public.shared_accounts a
   where x.account_id = a.id and ((a.owner = old.requester and x.viewer = old.addressee) or (a.owner = old.addressee and x.viewer = old.requester));
  return old;
end $$;
create trigger mm_unfriend_cleanup after delete on public.friendships
  for each row execute function public.mm__unfriend_cleanup();

-- Group creators become the owner.
create or replace function public.mm__group_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.group_members (group_id, user_id, role) values (new.id, new.owner, 'owner') on conflict do nothing;
  return new;
end $$;
create trigger mm_group_owner after insert on public.groups
  for each row execute function public.mm__group_owner();

create or replace function public.mm__touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger mm_touch_state before update on public.user_state for each row execute function public.mm__touch();
create trigger mm_touch_accounts before update on public.shared_accounts for each row execute function public.mm__touch();
create trigger mm_touch_trades before update on public.trade_requests for each row execute function public.mm__touch();
create trigger mm_touch_pmembers before update on public.partnership_members for each row execute function public.mm__touch();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.user_state          enable row level security;
alter table public.friendships         enable row level security;
alter table public.shared_accounts     enable row level security;
alter table public.account_keys        enable row level security;
alter table public.account_access      enable row level security;
alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.group_invites       enable row level security;
alter table public.group_accounts      enable row level security;
alter table public.trade_requests      enable row level security;
alter table public.partnerships        enable row level security;
alter table public.partnership_members enable row level security;

-- Nothing is readable while signed out.
revoke all on public.profiles, public.user_state, public.friendships, public.shared_accounts, public.account_keys,
  public.account_access, public.groups, public.group_members, public.group_invites, public.group_accounts,
  public.trade_requests, public.partnerships, public.partnership_members from anon;

-- profiles: signed-in players can look each other up; you edit only your own public bits.
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_edit on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated;
grant update (username, display_name, avatar, bio) on public.profiles to authenticated;

-- user_state: strictly private.
create policy state_own on public.user_state for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- friendships: see your own; create/answer through functions; either side may unfriend or withdraw.
create policy friends_read on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy friends_delete on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));
revoke insert, update on public.friendships from authenticated;

-- shared_accounts: owner controls; others see them only through can_view_account.
-- (owner is checked inline so a just-inserted row can be returned to its owner)
create policy accounts_read on public.shared_accounts for select to authenticated using (
  owner = auth.uid() or visibility = 'public' or public.can_view_account(id));
create policy accounts_insert on public.shared_accounts for insert to authenticated with check (owner = auth.uid());
create policy accounts_update on public.shared_accounts for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy accounts_delete on public.shared_accounts for delete to authenticated using (owner = auth.uid());

-- account_keys: owner only (tokens are rotated through rotate_account_token).
create policy keys_read on public.account_keys for select to authenticated using (owner = auth.uid());
revoke insert, update, delete on public.account_keys from authenticated;

-- account_access: the owner grants/revokes for friends; a viewer may see and drop their own grants.
create policy access_read on public.account_access for select to authenticated using (viewer = auth.uid() or public.owns_account(account_id, auth.uid()));
create policy access_grant on public.account_access for insert to authenticated with check (
  public.owns_account(account_id, auth.uid()) and public.are_friends(auth.uid(), viewer));
create policy access_revoke on public.account_access for delete to authenticated using (viewer = auth.uid() or public.owns_account(account_id, auth.uid()));
revoke update on public.account_access from authenticated;

-- groups: public ones are visible to everyone signed in, private ones only to members.
create policy groups_read on public.groups for select to authenticated using (visibility = 'public' or owner = auth.uid() or public.is_group_member(id));
create policy groups_create on public.groups for insert to authenticated with check (owner = auth.uid());
create policy groups_edit on public.groups for update to authenticated using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy groups_delete on public.groups for delete to authenticated using (owner = auth.uid());
revoke insert, update on public.groups from authenticated;
grant insert (name, description, visibility, icon, owner) on public.groups to authenticated;
grant update (name, description, visibility, icon) on public.groups to authenticated;

-- group_members: members see each other; join through tokens; leave, or be removed by an admin (never the owner).
create policy gmembers_read on public.group_members for select to authenticated using (public.is_group_member(group_id));
create policy gmembers_remove on public.group_members for delete to authenticated using (
  role <> 'owner' and (user_id = auth.uid() or public.is_group_admin(group_id)));
revoke insert, update on public.group_members from authenticated;

-- group_invites: admins manage them; tokens are redeemed through join_group.
create policy invites_read on public.group_invites for select to authenticated using (public.is_group_admin(group_id));
create policy invites_revoke on public.group_invites for update to authenticated using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy invites_delete on public.group_invites for delete to authenticated using (public.is_group_admin(group_id));
revoke insert, update on public.group_invites from authenticated;
grant update (revoked, label) on public.group_invites to authenticated;

-- group_accounts: members see what is shared in their group; you add or remove only your own accounts
-- (admins may remove any).
create policy gaccounts_read on public.group_accounts for select to authenticated using (public.is_group_member(group_id));
create policy gaccounts_add on public.group_accounts for insert to authenticated with check (
  public.is_group_member(group_id) and public.owns_account(account_id, auth.uid()));
create policy gaccounts_remove on public.group_accounts for delete to authenticated using (
  public.owns_account(account_id, auth.uid()) or public.is_group_admin(group_id));
revoke update on public.group_accounts from authenticated;

-- trade_requests: visible to the people involved, and open asks to their group.
create policy trades_read on public.trade_requests for select to authenticated using (
  auth.uid() in (created_by, receiver) or auth.uid() = giver
  or (status = 'open' and public.is_group_member(group_id)));
create policy trades_create on public.trade_requests for insert to authenticated with check (
  created_by = auth.uid()
  and public.owns_account(receiver_account, receiver)
  and (
    -- open ask posted to a group
    (status = 'open' and giver is null and giver_account is null and receiver = auth.uid() and public.is_group_member(group_id))
    -- a request between two people who are friends, or both in the group it is posted in
    or (status in ('pending', 'sent') and giver is not null and auth.uid() in (giver, receiver)
        and (status = 'pending' or giver = auth.uid())
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

-- =====================================================================
-- Actions (called from the app with supabase.rpc)
-- =====================================================================

-- Add a friend with any of: username / @username, friend code (MM-…), account token (MMA-…),
-- or a Monopoly GO friend code / link.
-- Returns { result, name } where result is one of:
--   sent | accepted | already | pending | self | not_found            (players)
--   account_added                                                      (account token: friends now + that account shared)
--   mogo_sent | mogo_already                                           (Monopoly GO code / link)
create or replace function public.add_friend(target text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.mm_me(); t text := trim(coalesce(target, '')); other uuid; f public.friendships%rowtype;
  k record; acc record; key text; n int := 0; nm text;
begin
  if t = '' then return jsonb_build_object('result', 'not_found'); end if;

  -- 1) account token: instant friendship + view of that account
  if upper(t) ~ '^MMA-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$' then
    select k2.account_id, k2.owner, a.name into k from public.account_keys k2 join public.shared_accounts a on a.id = k2.account_id
     where k2.friend_token = upper(t);
    if not found then return jsonb_build_object('result', 'not_found'); end if;
    if k.owner = me then return jsonb_build_object('result', 'self'); end if;
    -- only the redeemed account is shared by its owner; the owner can share more later
    perform public.mm__befriend(me, k.owner, k.account_id, '{}'::uuid[]);
    return jsonb_build_object('result', 'account_added', 'name', k.name);
  end if;

  -- 2) player: friend code or username
  select id, display_name into other, nm from public.profiles
   where friend_code = upper(t) or username = lower(regexp_replace(t, '^@', '')) limit 1;
  if other is not null then
    if other = me then return jsonb_build_object('result', 'self'); end if;
    select * into f from public.friendships
     where least(requester, addressee) = least(me, other) and greatest(requester, addressee) = greatest(me, other);
    if found then
      if f.status = 'accepted' then return jsonb_build_object('result', 'already', 'name', nm); end if;
      if f.requester = me then return jsonb_build_object('result', 'pending', 'name', nm); end if;
      -- they already asked us: accept it (and share the account they looked up, if any)
      delete from public.friendships where id = f.id;
      perform public.mm__befriend(f.requester, me, f.via_account, case when f.via_account is not null then '{}'::uuid[] end);
      return jsonb_build_object('result', 'accepted', 'name', nm);
    end if;
    insert into public.friendships (requester, addressee) values (me, other);
    return jsonb_build_object('result', 'sent', 'name', nm);
  end if;

  -- 3) Monopoly GO friend code or link (only accounts whose owner allows it)
  key := public.mm_norm(t);
  if key is null or length(key) < 6 then return jsonb_build_object('result', 'not_found'); end if;
  for acc in select a.id, a.owner, a.name from public.shared_accounts a
             where a.findable and a.owner <> me and (public.mm_norm(a.mogo_code) = key or public.mm_norm(a.friend_link) = key) loop
    n := n + 1; nm := acc.name;
    select * into f from public.friendships
     where least(requester, addressee) = least(me, acc.owner) and greatest(requester, addressee) = greatest(me, acc.owner);
    if not found then
      insert into public.friendships (requester, addressee, via_account) values (me, acc.owner, acc.id);
    elsif f.status = 'pending' and f.requester = me then
      update public.friendships set via_account = acc.id where id = f.id;
    elsif f.status = 'accepted' then
      return jsonb_build_object('result', 'mogo_already', 'name', acc.name);
    end if;
  end loop;
  if n = 0 then return jsonb_build_object('result', 'not_found'); end if;
  return jsonb_build_object('result', 'mogo_sent', 'name', nm);
end $$;

-- Answer a friend request. share = which of your accounts they may view.
-- null = your auto-share accounts, or only the looked-up account for a Monopoly GO lookup.
create or replace function public.respond_friend_request(request uuid, accept boolean, share uuid[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); f public.friendships%rowtype;
begin
  select * into f from public.friendships where id = request and addressee = me and status = 'pending';
  if not found then raise exception 'That friend request is no longer waiting for you'; end if;
  delete from public.friendships where id = f.id;
  if accept then
    perform public.mm__befriend(f.requester, me, f.via_account,
      coalesce(share, case when f.via_account is not null then '{}'::uuid[] end));
  end if;
end $$;

-- New account token (the old one stops working).
create or replace function public.rotate_account_token(account uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); tok text;
begin
  tok := 'MMA-' || public.mm_code(4) || '-' || public.mm_code(4) || '-' || public.mm_code(4);
  update public.account_keys set friend_token = tok where account_id = account and owner = me;
  if not found then raise exception 'That is not your account'; end if;
  return tok;
end $$;

-- Group invite token. days/max_uses null = never expires / unlimited.
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

create or replace function public.join_group(token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); inv public.group_invites%rowtype;
begin
  select * into inv from public.group_invites where group_invites.token = upper(trim(join_group.token)) for update;
  if not found or inv.revoked then raise exception 'That invite token is not valid'; end if;
  if inv.expires_at is not null and inv.expires_at < now() then raise exception 'That invite token has expired'; end if;
  if public.is_group_member(inv.group_id, me) then return inv.group_id; end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then raise exception 'That invite token has been used up'; end if;
  insert into public.group_members (group_id, user_id) values (inv.group_id, me);
  update public.group_invites set uses = uses + 1 where id = inv.id;
  return inv.group_id;
end $$;

create or replace function public.join_public_group(grp uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me();
begin
  if not exists (select 1 from public.groups where id = grp and visibility = 'public') then
    raise exception 'That group is private — you need an invite token';
  end if;
  insert into public.group_members (group_id, user_id) values (grp, me) on conflict do nothing;
end $$;

create or replace function public.set_group_role(grp uuid, member uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me();
begin
  if new_role not in ('admin', 'member') then raise exception 'Role must be admin or member'; end if;
  if not exists (select 1 from public.groups where id = grp and owner = me) then raise exception 'Only the group owner can change roles'; end if;
  update public.group_members set role = new_role where group_id = grp and user_id = member and role <> 'owner';
end $$;

create or replace function public.list_public_groups(search text default '')
returns table (id uuid, name text, description text, icon text, member_count bigint, is_member boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.description, g.icon,
         (select count(*) from public.group_members m where m.group_id = g.id),
         public.is_group_member(g.id), g.created_at
  from public.groups g
  where g.visibility = 'public' and auth.uid() is not null
    and (coalesce(search, '') = '' or g.name ilike '%' || search || '%' or g.description ilike '%' || search || '%')
  order by 5 desc, g.created_at desc
  limit 60;
$$;

-- One step of a trade. action: accept | decline | cancel | sent | done | claim (claim needs your account)
create or replace function public.trade_action(request uuid, action text, account uuid default null)
returns public.trade_requests
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); r public.trade_requests%rowtype; acc_name text;
begin
  select * into r from public.trade_requests where id = request for update;
  if not found then raise exception 'That trade request no longer exists'; end if;

  if action = 'claim' then
    if r.status <> 'open' then raise exception 'Someone already picked up this request'; end if;
    if me = r.receiver or not public.is_group_member(r.group_id, me) then raise exception 'You cannot claim this request'; end if;
    select name into acc_name from public.shared_accounts where id = account and owner = me;
    if acc_name is null then raise exception 'Pick one of your shared accounts to send from'; end if;
    update public.trade_requests set giver = me, giver_account = account, giver_name = acc_name, status = 'accepted'
     where id = r.id returning * into r;
    return r;
  end if;

  if me is distinct from r.giver and me <> r.receiver and me <> r.created_by then raise exception 'This trade is not yours'; end if;

  if action = 'accept' then
    if r.status <> 'pending' or me = r.created_by then raise exception 'Only the other person can accept this'; end if;
    r.status := 'accepted';
  elsif action = 'decline' then
    if r.status <> 'pending' or me = r.created_by then raise exception 'Only the other person can decline this'; end if;
    r.status := 'declined';
  elsif action = 'cancel' then
    if r.status not in ('open', 'pending', 'accepted', 'sent') then raise exception 'This trade is already finished'; end if;
    r.status := 'cancelled';
  elsif action = 'sent' then
    if me is distinct from r.giver then raise exception 'Only the sender can mark it sent'; end if;
    if not (r.status = 'accepted' or (r.status = 'pending' and r.created_by <> me)) then raise exception 'This trade cannot be marked sent now'; end if;
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
  select count(*) into n from public.partnership_members where partnership_id = partnership and status <> 'declined';
  if n >= public.partnership_size(p.kind) then raise exception 'This % is already full', p.kind; end if;
  if not (public.are_friends(me, invitee) or (p.group_id is not null and public.is_group_member(p.group_id, invitee))) then
    raise exception 'You can invite friends, or members of the group this event belongs to';
  end if;
  insert into public.partnership_members (partnership_id, user_id, status, invited_by) values (partnership, invitee, 'invited', me)
  on conflict (partnership_id, user_id) do update set status = 'invited', invited_by = me
    where public.partnership_members.status = 'declined';
end $$;

-- Accept an invite, or join an open group event. accept=false declines.
create or replace function public.respond_partnership(partnership uuid, accept boolean, account uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mm_me(); p public.partnerships%rowtype; m public.partnership_members%rowtype; acc_name text; n int;
begin
  select * into p from public.partnerships where id = partnership;
  if not found then raise exception 'That event no longer exists'; end if;
  select * into m from public.partnership_members where partnership_id = partnership and user_id = me;
  if not accept then
    update public.partnership_members set status = 'declined' where partnership_id = partnership and user_id = me and status = 'invited';
    return;
  end if;
  if not found and not (p.open_to_group and public.is_group_member(p.group_id, me)) then raise exception 'You were not invited to this event'; end if;
  if found and m.status = 'joined' then return; end if;
  select name into acc_name from public.shared_accounts where id = account and owner = me;
  if acc_name is null then raise exception 'Pick one of your shared accounts'; end if;
  if public.partner_slots_used(account, p.kind) >= public.partner_slot_cap(p.kind) then
    raise exception '% already has the maximum % partners', acc_name, public.partner_slot_cap(p.kind);
  end if;
  select count(*) into n from public.partnership_members where partnership_id = partnership and status = 'joined';
  if n >= public.partnership_size(p.kind) then raise exception 'This event is already full'; end if;
  insert into public.partnership_members (partnership_id, user_id, account_id, account_name, status, invited_by)
  values (partnership, me, account, acc_name, 'joined', p.created_by)
  on conflict (partnership_id, user_id) do update set account_id = excluded.account_id, account_name = excluded.account_name, status = 'joined';
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
             'are_friends', 'group_role', 'is_group_member', 'is_group_admin', 'owns_account', 'can_view_account',
             'is_partnership_member', 'can_see_partnership', 'partnership_size', 'partner_slots_used', 'partner_slot_cap',
             'add_friend', 'respond_friend_request', 'rotate_account_token', 'create_group_invite', 'join_group',
             'join_public_group', 'set_group_role', 'list_public_groups', 'trade_action', 'create_partnership',
             'invite_to_partnership', 'respond_partnership')) loop
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
  foreach t in array array['friendships', 'account_access', 'shared_accounts', 'group_members', 'group_accounts',
                           'trade_requests', 'partnerships', 'partnership_members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
