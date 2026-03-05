-- Allow anyone to read approved coaches
-- This policy ensures that coaches only appear on the public site once their status is set to 'approved' by an admin.

DROP POLICY IF EXISTS "Allow public read access for approved coaches" ON coach_applications;

CREATE POLICY "Allow public read access for approved coaches"
ON coach_applications
FOR SELECT
TO public
USING (status = 'approved');
