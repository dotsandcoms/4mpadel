-- Adding an event is explicit interest. Subscribe atomically with the saved schedule row.
-- Later unfollows remain respected; merely reading a saved event never turns alerts back on.
BEGIN;
CREATE OR REPLACE FUNCTION public.follow_scheduled_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF nullif(trim(NEW.user_email),'') IS NULL THEN RETURN NEW; END IF;
 INSERT INTO event_notification_follows(event_id,email,following,created_at)
 VALUES(NEW.event_id,lower(trim(NEW.user_email)),true,now())
 ON CONFLICT(event_id,email) DO UPDATE SET following=true,
  created_at=CASE WHEN event_notification_follows.following THEN event_notification_follows.created_at ELSE now() END;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.follow_scheduled_event() FROM PUBLIC;
DROP TRIGGER IF EXISTS follow_saved_tournament ON public.player_schedule_events;
CREATE TRIGGER follow_saved_tournament AFTER INSERT ON public.player_schedule_events
 FOR EACH ROW EXECUTE FUNCTION public.follow_scheduled_event();
COMMIT;
