export function eventContext(search) {
  const ids = new URLSearchParams(search).getAll('event');
  return ids.length === 1 && /^[1-9]\d*$/.test(ids[0]) && Number.isSafeInteger(Number(ids[0])) ? ids[0] : '';
}
