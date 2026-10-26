-- Restore the exact pre-license grants from 20261013130304_replace_paid_partner.
-- The public RPC is SECURITY INVOKER and therefore needs its existing private
-- helpers to be executable. Their owner/event-manager authorization, paid-entry
-- checks, refund checks, and registration deadlines remain unchanged.
-- These grants reverse a regression; they do not add a new API or entitlement.
grant execute on function private.paid_partner_eligible(uuid),
 private.replace_paid_partner(uuid,text,bigint) to authenticated;
notify pgrst, 'reload schema';
