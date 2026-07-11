ALTER TABLE bookings ADD COLUMN IF NOT EXISTS block_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_bookings_block_group ON bookings (block_group_id) WHERE block_group_id IS NOT NULL;
