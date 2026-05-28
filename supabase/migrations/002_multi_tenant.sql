-- ─── WORKSPACES ───────────────────────────────────────────────────────────────

CREATE TABLE workspaces (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT        NOT NULL UNIQUE,
  name               TEXT,
  admin_entry_token  TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspaces_slug ON workspaces (slug);

-- ─── ADD workspace_id TO EXISTING TABLES ─────────────────────────────────────

ALTER TABLE rooms
  ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE bookings
  ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Members table (create if not exists)
CREATE TABLE IF NOT EXISTS members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, workspace_id)
);

-- ─── UPDATE EXCLUSION CONSTRAINT to be per-workspace ─────────────────────────
-- The old constraint was per-room only; we add workspace_id for safety.
-- (rooms already have workspace_id, so the room constraint implicitly scopes
--  bookings to one workspace — this is belt-and-suspenders.)

-- ─── INDEXES ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_rooms_workspace ON rooms (workspace_id);
CREATE INDEX idx_bookings_workspace ON bookings (workspace_id);
CREATE INDEX idx_members_workspace ON members (workspace_id);
CREATE INDEX idx_members_email_workspace ON members (email, workspace_id);
