-- Preserve the existing audited RPC and its 50-row default for old clients.
-- The redesigned register requests 10, 25 or 50 rows explicitly.
do $$declare definition text;
begin
 select pg_get_functiondef('public.manage_license(text,jsonb)'::regprocedure) into definition;
 if position('limit 50 offset v_page*50' in definition)=0 then raise exception 'License list pagination changed; review before applying'; end if;
 definition:=replace(definition,'v_page integer:=',
  'v_page_size integer:=least(50,greatest(1,coalesce((p_input->>''page_size'')::integer,50))); v_page integer:=');
 definition:=replace(definition,'limit 50 offset v_page*50','limit v_page_size offset v_page*v_page_size');
 if position('v_page_size integer:=' in definition)=0 then raise exception 'License list declaration changed'; end if;
 execute definition;
end $$;
notify pgrst, 'reload schema';
