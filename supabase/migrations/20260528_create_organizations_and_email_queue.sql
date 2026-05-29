-- Migration: Create Organizations, Email Queue, and calendar link columns
-- Date: 2026-05-28

-- 1. Helper function to resolve player_id from authenticated email
CREATE OR REPLACE FUNCTION get_player_id_by_email(p_email TEXT)
RETURNS BIGINT AS $$
    SELECT id FROM public.players 
    WHERE email ILIKE p_email 
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Create Organizations Table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    logo_url TEXT,
    website_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_by BIGINT REFERENCES public.players(id) ON DELETE SET NULL,
    approved_by BIGINT REFERENCES public.players(id) ON DELETE SET NULL,
    rejection_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    approved_at TIMESTAMPTZ
);

-- 3. Add link columns to calendar (events) and organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS website_url TEXT;

ALTER TABLE public.calendar 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rejection_notes TEXT,
ADD COLUMN IF NOT EXISTS sanction_status TEXT DEFAULT 'approved' CHECK (sanction_status IN ('pending', 'approved', 'rejected'));

-- 4. Create Email Queue Table
CREATE TABLE IF NOT EXISTS public.email_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) & POLICIES
-- ==========================================

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

-- A. Organizations Policies
DROP POLICY IF EXISTS "Public read approved organizations" ON public.organizations;
CREATE POLICY "Public read approved organizations" 
ON public.organizations 
FOR SELECT 
USING (status = 'approved');

DROP POLICY IF EXISTS "Creator read own organization" ON public.organizations;
CREATE POLICY "Creator read own organization" 
ON public.organizations 
FOR SELECT 
USING (
    auth.role() = 'authenticated' 
    AND created_by = get_player_id_by_email(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Super admins read all organizations" ON public.organizations;
CREATE POLICY "Super admins read all organizations" 
ON public.organizations 
FOR SELECT 
USING (
    auth.jwt() ->> 'email' IN ('brad@dotsandcoms.co.za', 'bradein@dotsandcoms.co.za', 'admin@4mpadel.co.za')
);

DROP POLICY IF EXISTS "Authenticated users can apply as organization" ON public.organizations;
CREATE POLICY "Authenticated users can apply as organization" 
ON public.organizations 
FOR INSERT 
WITH CHECK (
    auth.role() = 'authenticated' 
    AND created_by = get_player_id_by_email(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Creator can update pending organization" ON public.organizations;
CREATE POLICY "Creator can update pending organization" 
ON public.organizations 
FOR UPDATE 
USING (
    auth.role() = 'authenticated' 
    AND created_by = get_player_id_by_email(auth.jwt() ->> 'email')
    AND status = 'pending'
);

DROP POLICY IF EXISTS "Super admins manage all organizations" ON public.organizations;
CREATE POLICY "Super admins manage all organizations" 
ON public.organizations 
FOR ALL 
USING (
    auth.jwt() ->> 'email' IN ('brad@dotsandcoms.co.za', 'bradein@dotsandcoms.co.za', 'admin@4mpadel.co.za')
);

-- B. Email Queue Policies
DROP POLICY IF EXISTS "Super admins can manage email_queue" ON public.email_queue;
CREATE POLICY "Super admins can manage email_queue" 
ON public.email_queue 
FOR ALL 
USING (
    auth.jwt() ->> 'email' IN ('brad@dotsandcoms.co.za', 'bradein@dotsandcoms.co.za', 'admin@4mpadel.co.za')
);

DROP POLICY IF EXISTS "Authenticated users can insert email_queue" ON public.email_queue;
CREATE POLICY "Authenticated users can insert email_queue" 
ON public.email_queue 
FOR INSERT 
WITH CHECK (
    auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Authenticated users can update own email_queue status" ON public.email_queue;
CREATE POLICY "Authenticated users can update own email_queue status" 
ON public.email_queue 
FOR UPDATE 
USING (
    auth.role() = 'authenticated'
);

-- ==========================================
-- INDEXES FOR HIGH PERFORMANCE
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_organizations_creator ON public.organizations(created_by);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations(status);
CREATE INDEX IF NOT EXISTS idx_calendar_org ON public.calendar(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_status ON public.email_queue(status);
