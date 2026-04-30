-- Enable btree_gist for the exclusion constraint that prevents double-bookings
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── ROOMS ────────────────────────────────────────────────────────────────────

CREATE TABLE rooms (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,
  capacity           INTEGER     NOT NULL CHECK (capacity > 0),
  amenities          TEXT[]      NOT NULL DEFAULT '{}',
  google_calendar_id TEXT,
  display_order      INTEGER     NOT NULL DEFAULT 0,
  is_active          BOOLEAN     NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── RECURRING SERIES ─────────────────────────────────────────────────────────
-- Stores the rule for a recurring booking. Individual occurrences are rows in
-- the bookings table that reference this series.

CREATE TABLE recurring_series (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  booker_name  TEXT        NOT NULL,
  booker_email TEXT        NOT NULL,
  title        TEXT,
  -- time-of-day for each occurrence (stored as local TIME; API layer applies date)
  start_time   TIME        NOT NULL,
  end_time     TIME        NOT NULL,
  -- 'weekly' | 'biweekly' | 'monthly'
  frequency    TEXT        NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  -- ISO day numbers: 1=Mon … 7=Sun (used for weekly/biweekly; NULL for monthly)
  days_of_week INTEGER[]   CHECK (frequency = 'monthly' OR days_of_week IS NOT NULL),
  series_start DATE        NOT NULL,
  series_end   DATE        NOT NULL,
  cancelled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT series_end_after_start CHECK (series_end > series_start),
  CONSTRAINT end_time_after_start   CHECK (end_time > start_time)
);

-- ─── BOOKINGS ─────────────────────────────────────────────────────────────────

CREATE TABLE bookings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id             UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  recurring_series_id UUID        REFERENCES recurring_series(id) ON DELETE SET NULL,
  booker_name         TEXT        NOT NULL,
  booker_email        TEXT        NOT NULL,
  title               TEXT,
  start_time          TIMESTAMPTZ NOT NULL,
  end_time            TIMESTAMPTZ NOT NULL,
  cancel_token        TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  google_event_id     TEXT,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT end_after_start CHECK (end_time > start_time),

  -- Prevents overlapping active bookings for the same room.
  -- Half-open range [start, end) allows back-to-back bookings.
  CONSTRAINT no_overlapping_bookings EXCLUDE USING gist (
    room_id  WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (cancelled_at IS NULL)
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_bookings_room_window
  ON bookings (room_id, start_time, end_time)
  WHERE cancelled_at IS NULL;

CREATE INDEX idx_bookings_cancel_token
  ON bookings (cancel_token);

CREATE INDEX idx_bookings_start_date
  ON bookings (date_trunc('day', start_time AT TIME ZONE 'UTC'));

CREATE INDEX idx_bookings_series
  ON bookings (recurring_series_id)
  WHERE recurring_series_id IS NOT NULL;

-- ─── REAL-TIME ────────────────────────────────────────────────────────────────

ALTER TABLE bookings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;

-- ─── SEED DATA ────────────────────────────────────────────────────────────────

INSERT INTO rooms (name, capacity, amenities, display_order) VALUES
  ('The Nook',    4,  ARRAY['Whiteboard', 'TV'],                           1),
  ('The Loft',    8,  ARRAY['TV', 'Video conferencing'],                   2),
  ('Greenhouse',  6,  ARRAY['Natural light', 'Whiteboard'],                3),
  ('Boardroom',   12, ARRAY['TV', 'Whiteboard', 'Video conferencing'],     4),
  ('Studio A',    3,  ARRAY['Whiteboard'],                                 5),
  ('The Pod',     2,  ARRAY['TV'],                                         6);
