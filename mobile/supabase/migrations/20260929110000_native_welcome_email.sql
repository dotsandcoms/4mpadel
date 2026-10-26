-- One durable delivery record per account; accessible only to the email worker.
CREATE TABLE IF NOT EXISTS public.native_welcome_emails (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'needs_review')),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.native_welcome_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_welcome_emails FROM anon, authenticated;
GRANT ALL ON public.native_welcome_emails TO service_role;
