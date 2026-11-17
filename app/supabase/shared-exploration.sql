-- RETIRED: do not apply the former permissive explore:* policies.
-- Unapplied membership/RPC replacement: migrations-draft/202611170001_shared_rooms.sql
-- This file deliberately fails rather than silently authorizing broad access.
do $$ begin
  raise exception 'RETIRED_SQL: review migrations-draft/202611170001_shared_rooms.sql; not yet approved for application';
end $$;
