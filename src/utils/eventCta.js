/** Mirror EventDetails / FeaturedSections: outstanding fee → Pay Now; otherwise Manage Entry.
 *  Curated schedule-only events the user hasn't registered for get a Register CTA
 *  (same as FeaturedSections) — it just opens the event page to start registration. */
export const resolveScheduleEntryCta = (event) => {
    if (event?.fromSchedule && !event?.isRegistered) return { label: 'Register', action: 'register' };
    const hasFee = Number(event?.entry_fee) > 0
        || (event?.category_fees && Object.keys(event.category_fees).length > 0);
    const paymentsAllowed = event?.allow_payments === true;
    const needsPay = event?.isPaid !== true && hasFee && paymentsAllowed;
    if (needsPay) return { label: 'Pay Now', action: 'pay' };
    return { label: 'Manage Entry', action: 'manage' };
};

/** Same hand-off as Featured Events → EventDetails (state.eventCta). */
export const navigateToEntryCta = (navigate, event, cta) => {
    const path = event.slug || event.db_id
        ? `/calendar/${event.slug || event.db_id}`
        : null;
    if (!path) return;
    const action = cta?.action;
    if (action === 'pay' || action === 'manage') {
        navigate(path, { state: { eventCta: action } });
        return;
    }
    navigate(path);
};
