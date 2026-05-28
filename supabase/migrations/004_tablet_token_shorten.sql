-- Convert tablet_token column from UUID to short 8-char hex text
ALTER TABLE rooms ALTER COLUMN tablet_token TYPE TEXT USING LEFT(REPLACE(tablet_token::text, '-', ''), 8);
ALTER TABLE rooms ALTER COLUMN tablet_token SET DEFAULT LEFT(REPLACE(gen_random_uuid()::text, '-', ''), 8);
-- Regenerate tokens for all existing rooms so they're short
UPDATE rooms SET tablet_token = LEFT(REPLACE(gen_random_uuid()::text, '-', ''), 8);
