-- Keep the authorised sender filter explicit: the table also has a scope column.
-- Replace only this predicate and retain the current ownership/permission checks.
do $patch$
declare definition text; corrected text;
begin
  definition := pg_get_functiondef('messaging.api(text,jsonb)'::regprocedure);
  corrected := replace(definition, 'g.creator_id=uid and g.scope=scope and', 'g.creator_id=uid and g.scope=(p_data->>''scope'') and');
  if corrected=definition then raise exception 'Expected admin inbox scope predicate was not found'; end if;
  execute corrected;
end $patch$;
notify pgrst,'reload schema';
