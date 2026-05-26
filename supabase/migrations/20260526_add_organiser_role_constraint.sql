-- Migration: Add Organiser Role Constraint to Admin Sidebar Permissions
-- Date: 2026-05-26

-- 1. Drop existing role constraint if it exists
ALTER TABLE public.admin_sidebar_permissions
DROP CONSTRAINT IF EXISTS admin_sidebar_permissions_role_check;

-- 2. Add updated role constraint supporting 'organiser'
ALTER TABLE public.admin_sidebar_permissions
ADD CONSTRAINT admin_sidebar_permissions_role_check
CHECK (role IN ('super_admin', 'custom', 'organiser'));
