-- Enable Row Level Security on all tables.
-- The server-side client uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS,
-- so no policies are needed. Enabling RLS here means the anon key (which is
-- public in the JS bundle) cannot directly read or write any table.
ALTER TABLE workspaces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE members          ENABLE ROW LEVEL SECURITY;
