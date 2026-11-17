-- DRAFT ONLY / NOT APPLIED. No cron job is scheduled by this file.
-- Preliminary inventory only (admin only), NOT a deletion eligibility query.
-- last_sign_in_at does not prove last use: session refresh/room usage can be newer.
-- Before any deletion job, record server-side last activity (join/renew) and check it.
-- Confirm that these users have no future uploads/records.
select u.id,u.created_at,u.last_sign_in_at
from auth.users u where u.is_anonymous
  and coalesce(u.last_sign_in_at,u.created_at)<now()-interval '30 days'
  and not exists(select 1 from exploration_private.room_hosts h where h.user_id=u.id)
  and not exists(select 1 from public.exploration_members m where m.user_id=u.id and m.lease_until>now())
order by coalesce(u.last_sign_in_at,u.created_at) limit 100;
-- Proposed maintenance job: prune expired memberships/rooms, inventory inactive anonymous
-- users, then use server-side Auth Admin deleteUser for a bounded, reviewed batch.
-- Do not expose an auth.users deletion RPC to authenticated/anonymous clients.
-- Before automating, check room ownership/storage FK effects and account linking; dry-run
-- logs should include counts, never tokens. Threshold 30 days is a proposal, not yet applied.
