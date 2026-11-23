begin;

-- JWT email is an identity, not a pattern. Preserve existing role rules,
-- function attributes and EXECUTE grants through CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.can_manage_club(p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT p_club_id IS NOT NULL AND (
        EXISTS (
            SELECT 1 FROM public.club_members cm
            WHERE cm.club_id = p_club_id
              AND lower(cm.user_email) = lower(auth.jwt() ->> 'email')
              AND cm.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1
            FROM public.club_organisations co
            JOIN public.organisation_members om ON om.organisation_id = co.organisation_id
            WHERE co.club_id = p_club_id
              AND lower(om.user_email) = lower(auth.jwt() ->> 'email')
              AND om.role IN ('owner', 'admin')
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_organisation_admin(p_organisation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.organisation_members om
        WHERE om.organisation_id = p_organisation_id
          AND lower(om.user_email) = lower(auth.jwt() ->> 'email')
          AND om.role IN ('owner', 'admin')
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_organisation_member(p_organisation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.organisation_members om
        WHERE om.organisation_id = p_organisation_id
          AND lower(om.user_email) = lower(auth.jwt() ->> 'email')
    );
$function$;

commit;
