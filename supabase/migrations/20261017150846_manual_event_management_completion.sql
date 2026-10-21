-- Event Manager housekeeping is independent of calendar dates and public status.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE public.event_management_completion (
    event_id bigint PRIMARY KEY REFERENCES public.calendar(id) ON DELETE CASCADE,
    completed_at timestamptz,
    completed_by uuid,
    CONSTRAINT completion_has_actor CHECK ((completed_at IS NULL) = (completed_by IS NULL))
);
ALTER TABLE public.event_management_completion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_management_completion FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.event_management_completion TO authenticated;
CREATE POLICY event_managers_read_completion ON public.event_management_completion
    FOR SELECT TO authenticated USING (public.can_manage_event(event_id));

CREATE OR REPLACE FUNCTION private.set_event_management_completed(
    p_event_id bigint, p_completed boolean, p_expected_completed_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    event_row public.calendar;
    previous_completed_at timestamptz;
    next_completed_at timestamptz;
BEGIN
    IF auth.uid() IS NULL OR NOT COALESCE(public.account_is_active(), false) THEN
        RAISE EXCEPTION 'Sign in with an active event-manager account.';
    END IF;
    IF p_completed IS NULL THEN RAISE EXCEPTION 'Choose whether to complete or reopen the event.'; END IF;
    IF NOT COALESCE(public.can_manage_event(p_event_id), false) THEN
        RAISE EXCEPTION 'You cannot manage this event.';
    END IF;
    -- Serialise simultaneous complete/reopen requests without changing calendar data.
    SELECT * INTO event_row FROM public.calendar WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND OR NOT COALESCE(event_row.finance_managed, false) THEN
        RAISE EXCEPTION 'This event is not enabled for Event Manager. Refresh and try again.';
    END IF;
    SELECT completed_at INTO previous_completed_at FROM public.event_management_completion
        WHERE event_id = p_event_id FOR UPDATE;
    IF previous_completed_at IS DISTINCT FROM p_expected_completed_at THEN
        RAISE EXCEPTION 'The completion status changed. Refresh the event list and try again.';
    END IF;
    IF (previous_completed_at IS NOT NULL) = p_completed THEN
        RETURN jsonb_build_object('event_id', p_event_id, 'completed_at', previous_completed_at);
    END IF;
    next_completed_at := CASE WHEN p_completed THEN clock_timestamp() ELSE NULL END;
    INSERT INTO public.event_management_completion(event_id, completed_at, completed_by)
    VALUES (p_event_id, next_completed_at, CASE WHEN p_completed THEN auth.uid() ELSE NULL END)
    ON CONFLICT (event_id) DO UPDATE SET completed_at = EXCLUDED.completed_at, completed_by = EXCLUDED.completed_by;
    INSERT INTO public.event_activity_log(event_id, actor_email, actor_role, action, category, summary, details)
    VALUES (p_event_id, auth.email(), 'ADMIN', CASE WHEN p_completed THEN 'admin.event_completed' ELSE 'admin.event_reopened' END,
        'ADMIN', CASE WHEN p_completed THEN 'Marked as completed: ' ELSE 'Reopened in Event Manager: ' END || event_row.event_name,
        jsonb_build_object('previous_completed_at', previous_completed_at, 'completed_at', next_completed_at));
    RETURN jsonb_build_object('event_id', p_event_id, 'completed_at', next_completed_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_event_management_completed(
    p_event_id bigint, p_completed boolean, p_expected_completed_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT private.set_event_management_completed(p_event_id, p_completed, p_expected_completed_at);
$$;
REVOKE ALL ON FUNCTION private.set_event_management_completed(bigint, boolean, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_event_management_completed(bigint, boolean, timestamptz) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.set_event_management_completed(bigint, boolean, timestamptz),
    public.set_event_management_completed(bigint, boolean, timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
