-- Migration: Fix Admin Sidebar Permissions RLS policies and add Super Admin function
-- Date: 2026-05-27

-- 1. Create is_super_admin helper function with SECURITY DEFINER to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.is_super_admin(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- Bypasses RLS to avoid infinite recursion
AS $$
BEGIN
    -- Fallback/Bootstrap super admins to prevent accidental lockout
    IF user_email IN (
        'brad@dotsandcoms.co.za', 
        'bradein@dotsandcoms.co.za', 
        'admin@4mpadel.co.za', 
        'markstillerman@gmail.com'
    ) THEN
        RETURN true;
    END IF;

    -- Look up role dynamically in the table
    RETURN EXISTS (
        SELECT 1 
        FROM public.admin_sidebar_permissions 
        WHERE email = user_email AND role = 'super_admin'
    );
END;
$$;

-- 2. Insert markstillerman@gmail.com as a super_admin if not already present
INSERT INTO public.admin_sidebar_permissions (email, role, allowed_tabs)
VALUES ('markstillerman@gmail.com', 'super_admin', '{}')
ON CONFLICT (email) DO UPDATE SET role = 'super_admin';

-- 3. Drop existing RLS policies
DROP POLICY IF EXISTS "Users can view their own permissions" ON public.admin_sidebar_permissions;
DROP POLICY IF EXISTS "Admins can view all permissions" ON public.admin_sidebar_permissions;
DROP POLICY IF EXISTS "Super admins can manage permissions" ON public.admin_sidebar_permissions;

-- 4. Recreate Select policy using is_super_admin helper
CREATE POLICY "Admins can view all permissions"
ON public.admin_sidebar_permissions
FOR SELECT
USING (
    (auth.jwt() ->> 'email' = email)
    OR 
    public.is_super_admin(auth.jwt() ->> 'email')
);

-- 5. Recreate Manage policy using is_super_admin helper
CREATE POLICY "Super admins can manage permissions"
ON public.admin_sidebar_permissions
FOR ALL
USING (
    public.is_super_admin(auth.jwt() ->> 'email')
)
WITH CHECK (
    public.is_super_admin(auth.jwt() ->> 'email')
);
