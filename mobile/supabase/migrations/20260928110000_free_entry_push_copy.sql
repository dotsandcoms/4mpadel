-- Free entries are confirmed, but do not represent money received.
BEGIN;
CREATE OR REPLACE FUNCTION public.notify_registration_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_name text; event_state text; prior jsonb := '{}'; kind text; partner text; self_email text; path text := '/calendar';
BEGIN
 IF TG_OP='UPDATE' THEN prior:=to_jsonb(OLD); END IF;
 SELECT calendar.event_name,calendar.event_status INTO event_name,event_state FROM calendar WHERE id=NEW.event_id;
 event_name:=coalesce(event_name,'your tournament');
 self_email:=lower(trim(NEW.email)); partner:=nullif(lower(trim(NEW.partner_email)),'');
 IF (TG_OP='INSERT' OR prior->>'status'='withdrawn') AND coalesce(NEW.status,'registered')<>'withdrawn' THEN
 kind:=CASE WHEN nullif(lower(trim(NEW.registered_by)),'') IS NOT NULL AND lower(trim(NEW.registered_by))<>self_email THEN 'partner_entry_paid' ELSE 'event_registration' END;
 PERFORM enqueue_push(self_email,kind,CASE WHEN kind='partner_entry_paid' THEN 'You’ve been entered' ELSE 'Entry successful' END,
 CASE WHEN kind='partner_entry_paid' THEN coalesce(NEW.partner_name,'Your partner')||' entered you into '||event_name||'.' ELSE 'Your entry for '||event_name||' has been received.' END,path);
 END IF;
 IF TG_OP='UPDATE' AND NEW.status='withdrawn' AND OLD.status IS DISTINCT FROM NEW.status AND event_state IS DISTINCT FROM 'cancelled' THEN
 PERFORM enqueue_push(self_email,'entry_withdrawn','Withdrawal confirmed','You have withdrawn from '||event_name||'.',path);
 partner:=nullif(lower(trim(OLD.partner_email)),'');
 IF partner IS NOT NULL AND partner<>self_email THEN
 PERFORM enqueue_push(partner,'entry_withdrawn','Partner withdrew',coalesce(OLD.full_name,'Your partner')||' withdrew from '||event_name||'.',path);
 END IF;
 END IF;
 IF NEW.payment_status='paid' AND prior->>'payment_status' IS DISTINCT FROM 'paid'
 AND coalesce(to_jsonb(NEW)->>'payment_method','') <> 'free' THEN
 PERFORM enqueue_push(self_email,'payment_confirmation','Payment received','Your payment for '||event_name||' is confirmed.',path);
 END IF;
 IF NEW.payment_status='refunded' AND prior->>'payment_status' IS DISTINCT FROM 'refunded' THEN
 PERFORM enqueue_push(self_email,'entry_refunded','Entry refunded','Your entry for '||event_name||' has been refunded.',path);
 END IF;
 IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM 'withdrawn' THEN
 IF NEW.division_id IS DISTINCT FROM OLD.division_id THEN
 PERFORM enqueue_push(self_email,'division_changed','Division updated','Your division at '||event_name||' is now '||coalesce(NEW.division,'updated')||'.',path);
 END IF;
 -- Notify the owner of the reciprocal row only, avoiding two pushes for each partner link.
 IF NEW.partner_email IS DISTINCT FROM OLD.partner_email AND event_state IS DISTINCT FROM 'cancelled' THEN
 PERFORM enqueue_push(self_email,'partner_assigned',CASE WHEN NEW.partner_email IS NULL THEN 'Partner removed' ELSE 'Partner confirmed' END,
 CASE WHEN NEW.partner_email IS NULL THEN 'Your entry for '||event_name||' no longer has a partner.' ELSE 'You’re playing with '||coalesce(NEW.partner_name,'your partner')||' at '||event_name||'.' END,path);
 END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
