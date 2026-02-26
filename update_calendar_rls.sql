-- Enable RLS (Row Level Security) on the calendar table
ALTER TABLE calendar ENABLE ROW LEVEL SECURITY;

-- Create Policy for Public Read Access (Anon) - anyone can read calendar events
CREATE POLICY "Public can view calendar"
ON calendar FOR SELECT
TO anon, authenticated
USING (true);

-- Allow Authenticated Users (Admin) to Insert/Update/Delete calendar events
-- NOTE: If your app doesn't have proper user sessions yet, you may need to 
-- temporarily allow anon for INSERT/UPDATE/DELETE. 
-- For now, this exactly mimics the 'events' table security setup:
CREATE POLICY "Admins can manage calendar"
ON calendar FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- TEMPORARY: If your front-end admin panel relies on anon access (no login required yet), uncomment below:
-- CREATE POLICY "Anon can manage calendar"
-- ON calendar FOR ALL
-- TO anon
-- USING (true)
-- WITH CHECK (true);
