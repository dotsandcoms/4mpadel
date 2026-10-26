// IDs take precedence; name matching supports older registrations without IDs.
export function belongsToDivision(registration, division) {
    return registration.division_id != null
        ? String(registration.division_id) === String(division.id)
        : registration.division === division.name;
}

export function cancellationRefundStatus(results) {
    if (results.some((r) => r.status === 'needs_attention' || r.status.startsWith('skipped:'))) return 'needs_attention';
    return results.some((r) => r.status === 'processing') ? 'processing' : 'complete';
}
