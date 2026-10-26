/** Return links are navigation hints, never evidence that a payment succeeded. */
export function parsePaymentReturn(value: string): { eventId: string; reference: string; mode?: 'pay' } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'fourmpadel:' || url.hostname !== 'events' || url.pathname !== '/register') return null;
    const eventId = url.searchParams.get('id') || '';
    const reference = url.searchParams.get('pay_ref') || '';
    if (url.searchParams.get('payment_return') !== '1' || !/^[1-9]\d*$/.test(eventId) || !/^MOBILE-[a-f0-9]{8}-[a-f0-9-]{36}$/i.test(reference)) return null;
    return { eventId, reference, ...(url.searchParams.get('mode') === 'pay' ? { mode: 'pay' as const } : {}) };
  } catch { return null; }
}
