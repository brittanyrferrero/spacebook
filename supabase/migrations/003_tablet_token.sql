ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS tablet_token TEXT NOT NULL
  DEFAULT LEFT(REPLACE(gen_random_uuid()::text, '-', ''), 8);
