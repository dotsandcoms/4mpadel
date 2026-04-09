ALTER TABLE public.admin_sidebar_permissions
ADD COLUMN IF NOT EXISTS module_permissions JSONB DEFAULT '{}'::jsonb;
