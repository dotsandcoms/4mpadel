-- Create the admin_sidebar_permissions table
CREATE TABLE IF NOT EXISTS public.admin_sidebar_permissions (
    email TEXT PRIMARY KEY,
    role TEXT DEFAULT 'custom' CHECK (role IN ('super_admin', 'custom')),
    allowed_tabs TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_sidebar_permissions ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own permissions
DROP POLICY IF EXISTS "Users can view their own permissions" ON public.admin_sidebar_permissions;
CREATE POLICY "Users can view their own permissions" 
ON public.admin_sidebar_permissions 
FOR SELECT 
USING (auth.jwt() ->> 'email' = email);

-- Allow admins to view all permissions
-- Using a non-recursive check for primary super admins
DROP POLICY IF EXISTS "Admins can view all permissions" ON public.admin_sidebar_permissions;
CREATE POLICY "Admins can view all permissions"
ON public.admin_sidebar_permissions
FOR SELECT
USING (
    (auth.jwt() ->> 'email' = email) -- Can see own
    OR 
    (auth.jwt() ->> 'email' IN ('brad@dotsandcoms.co.za', 'bradein@dotsandcoms.co.za', 'admin@4mpadel.co.za')) -- Super admins can see all
);

-- Allow super admins to insert/update/delete
DROP POLICY IF EXISTS "Super admins can manage permissions" ON public.admin_sidebar_permissions;
CREATE POLICY "Super admins can manage permissions"
ON public.admin_sidebar_permissions
FOR ALL
USING (auth.jwt() ->> 'email' IN ('brad@dotsandcoms.co.za', 'bradein@dotsandcoms.co.za', 'admin@4mpadel.co.za'));



-- Insert initial super admins
INSERT INTO public.admin_sidebar_permissions (email, role, allowed_tabs) 
VALUES 
    ('brad@dotsandcoms.co.za', 'super_admin', '{}'),
    ('bradein@dotsandcoms.co.za', 'super_admin', '{}'),
    ('admin@4mpadel.co.za', 'super_admin', '{}')
ON CONFLICT (email) DO NOTHING;
