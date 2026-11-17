-- DRAFT ONLY / NOT APPLIED / outside supabase/migrations on purpose.
-- Stage D: review and test against a disposable Supabase project first.
-- Anonymous Auth uses authenticated. Realtime membership is checked on join/refresh,
-- NOT on every broadcast. This DOES NOT prevent member flooding or spoofed payload IDs.
-- An operator must explicitly enable this draft in a reviewed session before running it.
begin;
do $$ begin
  if current_setting('shinkai.allow_draft_migration', true) is distinct from 'reviewed' then
    raise exception 'DRAFT_NOT_APPROVED';
  end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists exploration_private;
revoke all on schema exploration_private from public, anon, authenticated;

-- Remove old permissive policies: PostgreSQL permissive policies combine with OR.
drop policy if exists "invite exploration receive" on realtime.messages;
drop policy if exists "invite exploration send" on realtime.messages;

create table exploration_private.runtime_config (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  max_active_rooms int not null default 1 check(max_active_rooms between 1 and 10),
  room_minutes int not null default 20 check(room_minutes between 1 and 60),
  world_version text not null default 'numazu-2023-pose-v2'
);
insert into exploration_private.runtime_config(singleton) values(true);
-- Only operator-provisioned hosts may create rooms. Anonymous sign-in alone is not
-- an invitation and must not be able to exhaust the single test-room capacity.
create table exploration_private.room_hosts (
  user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on exploration_private.room_hosts from public,anon,authenticated;
-- Intentionally empty. Provision the identified host UID via admin tooling in stage D.
create table exploration_private.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  invite_token_hash bytea not null unique,
  world_version text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed boolean not null default false
);
create table public.exploration_members (
  room_id uuid not null references exploration_private.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  slot smallint not null check(slot between 1 and 4),
  display_name text not null check(char_length(display_name) between 1 and 16),
  lease_until timestamptz not null,
  primary key(room_id,user_id), unique(room_id,slot), unique(user_id)
);
revoke all on exploration_private.runtime_config, exploration_private.rooms from public, anon, authenticated;
revoke all on public.exploration_members from public, anon, authenticated;
alter table public.exploration_members enable row level security;
grant select on public.exploration_members to authenticated;
create policy "read own exploration membership" on public.exploration_members for select to authenticated
using (user_id=(select auth.uid()));

-- Simple indexed membership check. lease_until is bounded by room expiry by the RPCs.
create policy "member exploration receive" on realtime.messages for select to authenticated
using (extension in ('broadcast','presence') and exists (
  select 1 from public.exploration_members m
  where m.user_id=(select auth.uid()) and m.lease_until>now()
    and (select realtime.topic())='explore:'||m.room_id::text
));
create policy "member exploration send" on realtime.messages for insert to authenticated
with check (extension in ('broadcast','presence') and exists (
  select 1 from public.exploration_members m
  where m.user_id=(select auth.uid()) and m.lease_until>now()
    and (select realtime.topic())='explore:'||m.room_id::text
));

-- Shared validation stays private; clients can only invoke the public RPCs below.
create function exploration_private.check_request(p_name text,p_session_id uuid,p_world text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_session_id is null or p_name is null or char_length(trim(p_name)) not between 1 and 16 then raise exception 'INVALID_REQUEST'; end if;
  if not exists(select 1 from exploration_private.runtime_config where singleton and enabled) then raise exception 'EXPLORATION_PAUSED'; end if;
  if p_world is distinct from (select world_version from exploration_private.runtime_config where singleton) then raise exception 'WORLD_MISMATCH'; end if;
end $$;
revoke all on function exploration_private.check_request(text,uuid,text) from public,anon,authenticated;

create function public.create_exploration_room(p_name text,p_session_id uuid,p_world text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg exploration_private.runtime_config; r exploration_private.rooms; token text;
begin
  -- Global lock serializes room admission; RPCs use the same lock ordering.
  select * into cfg from exploration_private.runtime_config where singleton for update;
  perform exploration_private.check_request(p_name,p_session_id,p_world);
  if not exists(select 1 from exploration_private.room_hosts where user_id=auth.uid()) then raise exception 'HOST_REQUIRED'; end if;
  delete from public.exploration_members where lease_until<=now();
  update exploration_private.rooms rooms set closed=true
    where not rooms.closed and (rooms.expires_at<=now() or not exists(select 1 from public.exploration_members m where m.room_id=rooms.id));
  if exists(select 1 from public.exploration_members where user_id=auth.uid()) then raise exception 'ALREADY_JOINED'; end if;
  if (select count(*) from exploration_private.rooms where not closed and expires_at>now())>=cfg.max_active_rooms then raise exception 'ROOM_FULL'; end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into exploration_private.rooms(owner_user_id,invite_token_hash,world_version,expires_at)
    values(auth.uid(),extensions.digest(token,'sha256'),p_world,now()+make_interval(mins=>cfg.room_minutes)) returning * into r;
  insert into public.exploration_members values(r.id,auth.uid(),p_session_id,1,trim(p_name),least(now()+interval '120 seconds',r.expires_at));
  return jsonb_build_object('room_id',r.id,'session_id',p_session_id,'expires_at',r.expires_at,'invite_token',token);
end $$;

create function public.join_exploration_room(p_name text,p_session_id uuid,p_token text,p_world text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r exploration_private.rooms; free_slot smallint; prior public.exploration_members;
begin
  perform 1 from exploration_private.runtime_config where singleton for update;
  perform exploration_private.check_request(p_name,p_session_id,p_world);
  if p_token is null or p_token!~'^[a-f0-9]{64}$' then raise exception 'INVALID_INVITE'; end if;
  select * into r from exploration_private.rooms where invite_token_hash=extensions.digest(p_token,'sha256') for update;
  if not found or r.closed or r.expires_at<=now() then raise exception 'INVALID_INVITE'; end if;
  if r.world_version<>p_world then raise exception 'WORLD_MISMATCH'; end if;
  delete from public.exploration_members where lease_until<=now();
  select * into prior from public.exploration_members where user_id=auth.uid();
  if found then
    if prior.room_id<>r.id then raise exception 'ALREADY_JOINED'; end if;
    -- A replacement session takes this user's slot; old session cannot renew/leave it.
    update public.exploration_members set session_id=p_session_id,display_name=trim(p_name),lease_until=least(now()+interval '120 seconds',r.expires_at)
      where room_id=r.id and user_id=auth.uid();
  else
    select s::smallint into free_slot from generate_series(1,4) s
      where not exists(select 1 from public.exploration_members m where m.room_id=r.id and m.slot=s) order by s limit 1;
    if free_slot is null then raise exception 'ROOM_FULL'; end if;
    insert into public.exploration_members values(r.id,auth.uid(),p_session_id,free_slot,trim(p_name),least(now()+interval '120 seconds',r.expires_at));
  end if;
  return jsonb_build_object('room_id',r.id,'session_id',p_session_id,'expires_at',r.expires_at);
end $$;

create function public.renew_exploration_membership(p_room_id uuid,p_session_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from exploration_private.runtime_config where singleton and enabled) then raise exception 'EXPLORATION_PAUSED'; end if;
  update public.exploration_members m set lease_until=least(now()+interval '120 seconds',r.expires_at)
    from exploration_private.rooms r where r.id=p_room_id and not r.closed and r.expires_at>now()
      and m.room_id=r.id and m.user_id=auth.uid() and m.session_id=p_session_id and m.lease_until>now();
  if not found then raise exception 'ROOM_EXPIRED'; end if;
end $$;

create function public.list_exploration_members(p_room_id uuid)
returns table(user_id uuid,session_id uuid,display_name text)
language sql security definer set search_path='' as $$
  select m.user_id,m.session_id,m.display_name from public.exploration_members m
  where m.room_id=p_room_id and m.lease_until>now() and exists(
    select 1 from public.exploration_members own where own.room_id=p_room_id and own.user_id=auth.uid() and own.lease_until>now()
  ) order by m.slot;
$$;
create function public.leave_exploration_room(p_room_id uuid,p_session_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from exploration_private.runtime_config where singleton for update;
  delete from public.exploration_members where room_id=p_room_id and user_id=auth.uid() and session_id=p_session_id;
  update exploration_private.rooms set closed=true where id=p_room_id
    and not exists(select 1 from public.exploration_members where room_id=p_room_id and lease_until>now());
end $$;
revoke all on function public.create_exploration_room(text,uuid,text) from public,anon;
revoke all on function public.join_exploration_room(text,uuid,text,text) from public,anon;
revoke all on function public.renew_exploration_membership(uuid,uuid) from public,anon;
revoke all on function public.list_exploration_members(uuid) from public,anon;
revoke all on function public.leave_exploration_room(uuid,uuid) from public,anon;
grant execute on function public.create_exploration_room(text,uuid,text) to authenticated;
grant execute on function public.join_exploration_room(text,uuid,text,text) to authenticated;
grant execute on function public.renew_exploration_membership(uuid,uuid) to authenticated;
grant execute on function public.list_exploration_members(uuid) to authenticated;
grant execute on function public.leave_exploration_room(uuid,uuid) to authenticated;
commit;
-- Auth CAPTCHA (Turnstile), allowed domains and rate limits are dashboard configuration,
-- NOT SQL. Do not enable runtime_config until negative RLS tests and CAPTCHA tests pass.
