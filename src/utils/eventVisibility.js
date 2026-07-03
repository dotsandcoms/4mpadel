/**
 * Public event visibility — sanction filtering.
 *
 * Org-created events enter the calendar with sanction_status = 'pending'
 * and must never appear on public surfaces until a 4M admin approves them.
 * Legacy/admin-created events have sanction_status = 'approved' (column
 * default); null is tolerated defensively for pre-migration rows.
 *
 * Usage: const { data } = await withSanctionFilter(supabase.from('calendar').select('*'))...
 */
export const withSanctionFilter = (query) =>
    query.or('sanction_status.eq.approved,sanction_status.is.null');
