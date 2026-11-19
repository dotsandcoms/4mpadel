// Comparison only: never authorizes a sync or claims bank settlement.
export function compareGatewayRecord(gateway, payment) {
  const differences = [], unchecked = [];
  const gatewayCurrency = typeof gateway.currency === 'string' ? gateway.currency.trim().toUpperCase() : '';
  const recordedCurrency = typeof payment.currency === 'string' ? payment.currency.trim().toUpperCase() : '';
  if (!gatewayCurrency || !recordedCurrency) unchecked.push('Currency missing');
  else if (gatewayCurrency !== recordedCurrency) differences.push('Currency differs');
  // Restrict conversion to the audited 4M Rand storage convention. Other
  // currencies need an explicit minor-unit contract before amounts are compared.
  if (gatewayCurrency === 'ZAR' && recordedCurrency === 'ZAR') {
    const raw = payment.amount;
    const valid = ['number', 'string'].includes(typeof raw) && /^\d+(?:\.\d{1,2})?$/.test(String(raw));
    const cents = valid ? Math.round(Number(raw) * 100) : NaN;
    if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(gateway.amountMinor) || gateway.amountMinor < 0) unchecked.push('Amount cannot be compared');
    else if (cents !== gateway.amountMinor) differences.push('Amount differs');
  } else unchecked.push('Amount comparison requires matching ZAR currencies');
  const left = typeof gateway.status === 'string' ? gateway.status.trim().toLowerCase() : '';
  const right = typeof payment.status === 'string' ? payment.status.trim().toLowerCase() : '';
  if (!left || !right) unchecked.push('Status missing');
  else if (left !== right) differences.push('Status differs');
  return { state: differences.length ? 'different' : unchecked.length ? 'incomplete' : 'agree', differences, unchecked };
}

export function gatewayComparisonLabel(comparison) {
  if (!comparison) return 'Not compared';
  if (comparison.state === 'agree') return 'Amount, currency and status agree — not settlement verification';
  return [...comparison.differences, ...comparison.unchecked].join('; ');
}
