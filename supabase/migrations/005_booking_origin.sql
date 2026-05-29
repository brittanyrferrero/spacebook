ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'desktop';

-- Retroactively tag existing walk-in bookings as tablet
UPDATE bookings
  SET origin = 'tablet'
  WHERE booker_email = 'walkin@local';
