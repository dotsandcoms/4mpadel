export function validBadgeTotal(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const { unread, pending, total } = value as Record<string, unknown>;
  if (![unread, pending, total].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) return null;
  return pending === 0 && total === Math.min(99999, unread as number) ? total as number : null;
}

/** Serial writes and identity epochs prevent old-account counts surviving sign-out. */
export function createBadgeWriter(write: (count: number) => Promise<unknown>) {
  let identity: string | null = null, initialized = false, generation = 0, sequence = Promise.resolve();
  const enqueue = (count: number, version: number) => {
    sequence = sequence.catch(() => {}).then(async () => { if (version === generation) await write(count); });
    return sequence;
  };
  return {
    switchOwner(owner: string | null) { if (!initialized || owner !== identity) { initialized = true; identity = owner; generation++; void enqueue(0, generation); } },
    ticket() { return { owner: identity, generation }; },
    apply(ticket: { owner: string | null; generation: number }, count: number) {
      if (ticket.owner && ticket.owner === identity && ticket.generation === generation) return enqueue(count, generation);
      return Promise.resolve();
    },
  };
}
