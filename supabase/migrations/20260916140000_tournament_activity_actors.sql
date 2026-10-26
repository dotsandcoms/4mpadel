-- Enrich existing audit rows with the account that actually performed the action.
-- Resolve names inside the already-authorised snapshot, never in the browser.
DO $migration$
DECLARE definition text; before_text text; after_text text;
BEGIN
 definition := pg_get_functiondef('public.tm_snapshot(bigint)'::regprocedure);
 before_text := '''audit'',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)';
 after_text := '''audit'',COALESCE((SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object(''actor_name'',(SELECT COALESCE(NULLIF(u.raw_user_meta_data->>''full_name'',''''),NULLIF(u.raw_user_meta_data->>''name'',''''),u.email) FROM auth.users u WHERE u.id=a.actor)) ORDER BY a.created_at DESC)';
 IF strpos(definition, before_text) = 0 THEN
  IF strpos(definition, after_text) > 0 THEN RETURN; END IF;
  RAISE EXCEPTION 'Unexpected tm_snapshot definition; review before applying actor enrichment';
 END IF;
 EXECUTE replace(definition, before_text, after_text);
END $migration$;
