// A checkout total and its LIC- allocation describe one purchase. Pair only
// explicit references; matching dates or event names are not proof of a link.
export function groupLicensePayments(payments = []) {
  const byReference = new Map(payments.filter(p => p.reference).map(p => [p.reference, p]));
  const children = new Map();
  for (const payment of payments) {
    const parentReference = payment.parent_reference || (payment.reference?.startsWith('LIC-') ? payment.reference.slice(4) : null);
    if (!payment.bundled && parentReference) {
      const parent = byReference.get(parentReference);
      if (parent?.bundled && parent.id !== payment.id && (parent.currency || 'ZAR') === (payment.currency || 'ZAR') && !!parent.is_test === !!payment.is_test) {
        const list = children.get(parent.id) || [];
        list.push(payment);
        children.set(parent.id, list);
      }
    }
  }
  const childIds = new Set([...children.values()].flat().map(p => p.id));
  return payments.filter(p => !childIds.has(p.id)).map(payment => ({
    ...payment,
    allocations: children.get(payment.id) || [],
  }));
}

export const southAfricanToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export function coverageStatus(row, today = southAfricanToday()) {
  if (row.status === 'revoked') return 'revoked';
  if (row.ends_on && row.ends_on.slice(0, 10) < today) return 'expired';
  if (row.starts_on && row.starts_on.slice(0, 10) > today) return 'upcoming';
  return row.status;
}
