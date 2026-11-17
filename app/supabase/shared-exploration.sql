-- Enable Anonymous Sign-ins in Supabase Authentication settings first.
-- Private Realtime channels: possession of the random invite ID grants access.
-- This policy intentionally supports invite links, not an owner-approved membership list.
CREATE POLICY "invite exploration receive" ON realtime.messages FOR SELECT TO authenticated
USING (realtime.topic() ~ '^explore:[a-f0-9-]{36}$');
CREATE POLICY "invite exploration send" ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (realtime.topic() ~ '^explore:[a-f0-9-]{36}$');
