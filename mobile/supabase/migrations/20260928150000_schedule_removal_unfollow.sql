-- Removing a saved event opts out of general updates, not active-entry alerts.
BEGIN;
CREATE OR REPLACE FUNCTION public.unfollow_removed_schedule_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE event_notification_follows SET following=false,created_at=now()
 WHERE event_id=OLD.event_id AND email=lower(trim(OLD.user_email)) AND following;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.unfollow_removed_schedule_event() FROM PUBLIC;
DROP TRIGGER IF EXISTS unfollow_removed_tournament ON public.player_schedule_events;
CREATE TRIGGER unfollow_removed_tournament AFTER DELETE ON public.player_schedule_events
 FOR EACH ROW EXECUTE FUNCTION public.unfollow_removed_schedule_event();
COMMIT;
