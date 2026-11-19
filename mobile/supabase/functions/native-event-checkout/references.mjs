const appReference = /^MOBILE-[a-f0-9]{8}-[a-f0-9-]{36}$/i;
const gatewayReference = /^MOBILE-[A-Z0-9][A-Z0-9-]{0,35}-\d{23}$/;

export function nativeAppReference(userId, attemptId) {
  return `MOBILE-${userId.slice(0, 8)}-${attemptId}`;
}

export function nativePaystackReference(event, timestamp = Date.now(), nonce = crypto.getRandomValues(new Uint32Array(1))[0]) {
  const label = String(event.event_name || '')
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 36)
    .replace(/-+$/, '');
  return `MOBILE-${label || `EVENT-${event.id}`}-${timestamp}${String(nonce).padStart(10, '0')}`;
}

export async function nativeCheckoutReturn(params, resolve) {
  const eventId = params.get('event_id') || '';
  const reference = params.get('reference') || params.get('trxref') || '';
  if (!/^[1-9]\d*$/.test(eventId)) return null;
  let token = reference;
  if (gatewayReference.test(reference)) {
    const mapping = await resolve(reference);
    if (!mapping || String(mapping.event_id) !== eventId || mapping.gateway_reference !== reference) return null;
    token = mapping.app_reference;
  }
  if (!appReference.test(token)) return null;
  const target = new URL('fourmpadel://events/register');
  target.searchParams.set('id', eventId);
  target.searchParams.set('pay_ref', token);
  target.searchParams.set('payment_return', '1');
  if (params.get('mode') === 'pay') target.searchParams.set('mode', 'pay');
  return target;
}

function orderedKeys(_key, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
}

export function nativeCheckoutDetailsMatch(saved, rows, covers, total, isTest) {
  return Number(saved.amount) === total && saved.is_test === isTest
    && JSON.stringify(saved.metadata?.registration_rows, orderedKeys) === JSON.stringify(rows, orderedKeys)
    && JSON.stringify(saved.metadata?.covers, orderedKeys) === JSON.stringify(covers, orderedKeys);
}
