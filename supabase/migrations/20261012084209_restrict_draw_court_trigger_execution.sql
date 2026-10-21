-- Internal court-conflict trigger; clients use the authorised draw-save RPCs.
-- Trigger execution remains available to the table's existing trigger.
REVOKE EXECUTE ON FUNCTION public.protect_americano_court_booking() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
