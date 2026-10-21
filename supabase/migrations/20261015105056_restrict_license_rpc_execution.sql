-- Supabase's default privileges can grant roles directly, independently of PUBLIC.
-- Owner/admin RPCs keep their in-function guards and authenticated entry points.
revoke execute on function public.can_manage_licenses(),public.get_player_licenses(bigint),
 public.manage_license(text,jsonb),public.temporary_license_sales_report(date,date) from public,anon;
grant execute on function public.can_manage_licenses(),public.get_player_licenses(bigint),
 public.manage_license(text,jsonb),public.temporary_license_sales_report(date,date) to authenticated;
revoke execute on function public.refresh_license_projections() from public,anon,authenticated;
grant execute on function public.refresh_license_projections() to service_role;
notify pgrst, 'reload schema';
