-- Add the exact native Home route without widening the destination grammar.
CREATE OR REPLACE FUNCTION public.send_push_broadcast(
 p_request_id uuid, p_title text, p_body text, p_path text, p_fingerprint text,
 p_event_ids bigint[] DEFAULT '{}', p_player_ids bigint[] DEFAULT '{}',
 p_payment text DEFAULT 'all', p_partner text DEFAULT 'all', p_excluded_emails text[] DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE audience jsonb; selection jsonb; existing public.push_broadcasts; total integer; ready integer;
BEGIN
 PERFORM private.require_broadcast_admin();
 IF p_request_id IS NULL OR nullif(trim(p_title),'') IS NULL OR nullif(trim(p_body),'') IS NULL
  OR length(trim(p_title)) > 80 OR length(trim(p_body)) > 500 THEN
  RAISE EXCEPTION 'Enter a title (up to 80 characters) and message (up to 500 characters)';
 END IF;
 IF p_path IS NULL OR NOT (p_path IN ('/(tabs)','/calendar','/(tabs)/rankings','/(tabs)/explore','/(tabs)/profile','/pro/live')
  OR p_path ~ '^/events/[1-9][0-9]*$') THEN RAISE EXCEPTION 'Choose a supported app destination'; END IF;
 IF p_path LIKE '/events/%' AND NOT EXISTS (SELECT 1 FROM public.calendar c WHERE c.id::text = split_part(p_path,'/',3)
  AND c.is_visible IS DISTINCT FROM false AND (c.sanction_status IS NULL OR c.sanction_status = 'approved')) THEN
  RAISE EXCEPTION 'Choose a published event destination';
 END IF;
 selection := jsonb_build_object('event_ids',p_event_ids,'player_ids',p_player_ids,
  'payment',p_payment,'partner',p_partner,'excluded_emails',p_excluded_emails);
 -- Serialise retries of the same request, including concurrent double clicks.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.push_broadcasts WHERE id = p_request_id;
 IF FOUND THEN
  IF existing.created_by <> auth.uid() OR existing.title <> trim(p_title) OR existing.body <> trim(p_body)
   OR existing.path <> p_path OR existing.audience <> selection THEN RAISE EXCEPTION 'Request already used for another broadcast'; END IF;
  RETURN jsonb_build_object('id',existing.id,'total',existing.recipient_count,'queued',existing.queued_count,'reused',true);
 END IF;
 audience := private.push_broadcast_audience(p_event_ids,p_player_ids,p_payment,p_partner,p_excluded_emails);
 total := (audience->>'total')::integer; ready := (audience->>'ready')::integer;
 IF total = 0 THEN RAISE EXCEPTION 'Select at least one recipient'; END IF;
 IF total > 10000 THEN RAISE EXCEPTION 'Limit broadcasts to 10,000 recipients'; END IF;
 IF ready = 0 THEN RAISE EXCEPTION 'No selected recipients can receive push notifications'; END IF;
 IF p_fingerprint IS DISTINCT FROM audience->>'fingerprint' THEN
  RAISE EXCEPTION 'Audience changed. Refresh the preview and review the recipients before sending.';
 END IF;
 INSERT INTO public.push_broadcasts(id,created_by,created_by_email,title,body,path,audience,recipient_count,queued_count)
 VALUES (p_request_id,auth.uid(),lower(trim(auth.jwt()->>'email')),trim(p_title),trim(p_body),p_path,selection,total,ready);
 INSERT INTO public.push_outbox(email,type,title,body,path,data,status,error,broadcast_id)
 SELECT r->>'email','admin_broadcast',trim(p_title),trim(p_body),p_path,
  jsonb_build_object('broadcast_id',p_request_id),CASE WHEN r->>'availability' = 'ready' THEN 'pending' ELSE 'skipped' END,
  CASE r->>'availability' WHEN 'disabled' THEN 'Disabled in notification settings' WHEN 'no_device' THEN 'No registered Expo device' END,
  p_request_id FROM jsonb_array_elements(audience->'recipients') r;
 RETURN jsonb_build_object('id',p_request_id,'total',total,'queued',ready,'reused',false);
END $$;

-- Page only five campaigns; aggregate delivery rows only for that page.
CREATE FUNCTION public.list_push_broadcasts_page(p_page integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE total bigint; pages integer; page integer; items jsonb;
BEGIN
 PERFORM private.require_broadcast_admin();
 SELECT count(*) INTO total FROM public.push_broadcasts;
 pages:=greatest(1,ceil(total/5.0)::integer);
 page:=greatest(1,least(coalesce(p_page,1),pages));
 SELECT coalesce(jsonb_agg(to_jsonb(history) ORDER BY history.created_at DESC,history.id DESC),'[]'::jsonb) INTO items FROM (
  SELECT b.id,b.title,b.body,b.path,b.created_at,b.recipient_count,
   count(o.id) FILTER (WHERE o.status='pending') pending,
   count(o.id) FILTER (WHERE o.status='sent') sent,
   count(o.id) FILTER (WHERE o.status='failed') failed,
   count(o.id) FILTER (WHERE o.status='skipped') skipped
  FROM (SELECT * FROM public.push_broadcasts ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET (page-1)*5) b
  LEFT JOIN public.push_outbox o ON o.broadcast_id=b.id
  GROUP BY b.id,b.title,b.body,b.path,b.created_at,b.recipient_count
 ) history;
 RETURN jsonb_build_object('items',items,'page',page,'pages',pages,'pageSize',5,'total',total);
END $$;
REVOKE ALL ON FUNCTION public.list_push_broadcasts_page(integer),public.send_push_broadcast(uuid,text,text,text,text,bigint[],bigint[],text,text,text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_push_broadcasts_page(integer),public.send_push_broadcast(uuid,text,text,text,text,bigint[],bigint[],text,text,text[]) TO authenticated;
NOTIFY pgrst,'reload schema';
