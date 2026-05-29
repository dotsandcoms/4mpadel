-- Migration: Add update policy for approved organizations so owners can edit settings
-- Date: 2026-05-28

DROP POLICY IF EXISTS "Creator can update approved organization" ON public.organizations;
CREATE POLICY "Creator can update approved organization" 
ON public.organizations 
FOR UPDATE 
USING (
    auth.role() = 'authenticated' 
    AND created_by = get_player_id_by_email(auth.jwt() ->> 'email')
    AND status = 'approved'
);
