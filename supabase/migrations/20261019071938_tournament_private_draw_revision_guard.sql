-- Candidate only: do not apply to a shared database without reviewed rollout.
-- Keep the deployed tm_save_draw signature and source implementation. A private
-- draft save consumes its expected preparation revision under the existing event
-- lock, so two clients holding the same snapshot cannot both overwrite a draft.
-- The new revision is also written into scoring_rules by the unchanged source
-- body; publication therefore still validates against the current confirmation.
DO $guard$
DECLARE
  definition text := pg_get_functiondef('public.tm_save_draw(bigint,uuid,integer,jsonb)'::regprocedure);
  insertion_point text := ' v_draw:=COALESCE(d.id,gen_random_uuid());';
  revision_check text := 'c.revision<>p_expected';
  source_hash text;
BEGIN
  IF position('-- tm_private_draw_revision_guard_v1' IN definition) > 0 THEN
    RETURN;
  END IF;
  -- Hash of pg_proc.prosrc read from production on 19 October 2026. This is a
  -- source-drift tripwire, not a claim that every legacy draw writer is guarded.
  SELECT md5(prosrc) INTO source_hash FROM pg_proc
    WHERE oid='public.tm_save_draw(bigint,uuid,integer,jsonb)'::regprocedure;
  -- Fail closed if deployed source changed; never replace an unfamiliar body.
  IF source_hash IS DISTINCT FROM 'cdb82aaac64fafdf72d69f9d27e56a0a'
    OR position('PERFORM public.tm_require(p_event,''draws'');' IN definition) = 0
    OR position('pg_advisory_xact_lock(hashtextextended(''tm:''||p_event,0))' IN definition) = 0
    OR (length(definition)-length(replace(definition,insertion_point,'')))/length(insertion_point) <> 1
    OR (length(definition)-length(replace(definition,revision_check,'')))/length(revision_check) <> 1
    OR position('jsonb_build_object(''preparation_revision'',c.revision)' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected tm_save_draw implementation. Review the current function before applying the draft revision guard';
  END IF;
  definition := replace(definition,revision_check,'c.revision IS DISTINCT FROM p_expected');
  definition := replace(definition,insertion_point,
    E' -- tm_private_draw_revision_guard_v1\n'
    || E' UPDATE public.tournament_confirmations SET revision=revision+1,updated_by=auth.uid()\n'
    || E' WHERE division_id=p_division AND event_id=p_event RETURNING * INTO c;\n'
    || insertion_point);
  EXECUTE definition;
END $guard$;
