-- Stand-ins for the parts of Supabase that supabase/schema.sql relies on, so the schema can run
-- in PGlite (PostgreSQL in the browser) for tools/test-schema.html and tools/mock-supabase.js.
-- Never run this in a real Supabase project.
create schema if not exists auth;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to anon, authenticated;
create table if not exists auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}'::jsonb, pw text, created_at timestamptz not null default clock_timestamp());
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant execute on function auth.uid() to anon, authenticated;

create schema if not exists storage;
grant usage on schema storage to anon, authenticated;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid(), data text);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $f$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $f$;
grant execute on function storage.foldername(text) to anon, authenticated;

do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
