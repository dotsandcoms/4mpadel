const sections = ['rankings', 'following', 'results', 'calendar', 'compare'];
export function proSection(pathname, params) {
  const value = params.get('view') || pathname.split('/')[2];
  return sections.includes(value) ? value : 'rankings';
}
export function proUrl(section, input) {
  const params = new URLSearchParams(input);
  params.delete('view');
  if (params.get('category') !== 'women') params.delete('category');
  const page = Number(params.get('page') || params.get('rankingPage') || 1);
  params.delete('rankingPage');
  params.delete('page');
  if (section === 'rankings' && Number.isSafeInteger(page) && page > 1) params.set('page', String(page));
  const scoped = { rankings: ['q', 'country', 'side'], compare: ['compare', 'against'], results: ['event'], calendar: ['tourSearch', 'tourLevel'] };
  for (const [scope, keys] of Object.entries(scoped)) if (scope !== section) keys.forEach(key => params.delete(key));
  for (const [key, value] of [...params]) if (!value) params.delete(key);
  return `/pro/${section}${params.size ? `?${params}` : ''}`;
}

export function playerProfileUrl(player) {
  const slug = player.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `/pro/players/${encodeURIComponent(player.id)}${slug ? `/${slug}` : ''}`;
}
