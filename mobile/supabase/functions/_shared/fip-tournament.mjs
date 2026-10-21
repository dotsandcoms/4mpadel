const has = (node, name) => (node?.attribs?.class || '').split(/\s+/).includes(name);
const all = (node, predicate) => (node?.children || []).flatMap(child => [ ...(predicate(child) ? [child] : []), ...all(child, predicate) ]);
const byClass = (node, name) => all(node, child => has(child, name));
const rawText = node => !node || ['script', 'style', 'comment'].includes(node.type) ? '' : node.type === 'text' ? node.data : node.name === 'br' ? '\n' : (node.children || []).map(rawText).join('') + (['p', 'li'].includes(node.name) ? '\n' : '');
const text = node => rawText(node).replace(/[ \t\r]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n+/g, '\n').trim();
const hash = value => { let n = 0; for (const c of value) n = (n * 31 + c.charCodeAt(0)) >>> 0; return n.toString(36); };
const normalized = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
export function officialEventUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'www.padelfip.com' && !u.port && !u.username && !u.password && /^\/events\/[a-z0-9-]+\/$/.test(u.pathname) && !u.search && !u.hash ? u.href : null; } catch { return null; }
}
export function officialDocumentUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'www.padelfip.com' && !u.port && !u.username && !u.password && /^\/wp-content\/uploads\/[a-zA-Z0-9_./%()-]+\.pdf$/i.test(u.pathname) && !u.search && !u.hash && !u.pathname.includes('..') ? u.href : null; } catch { return null; }
}
const flags = { spain: 'ES', italy: 'IT', france: 'FR', argentina: 'AR', brazil: 'BR', marocco: 'MA', morocco: 'MA', portugal: 'PT', belgium: 'BE', netherlands: 'NL', greatbritain: 'GB', unitedkingdom: 'GB', uk: 'GB', sweden: 'SE', denmark: 'DK', germany: 'DE', southafrica: 'ZA', japan: 'JP', indonesia: 'ID', poland: 'PL', chile: 'CL', uruguay: 'UY', mexico: 'MX', usa: 'US', finland: 'FI', norway: 'NO', egypt: 'EG', tunisia: 'TN', austria: 'AT', switzerland: 'CH', romania: 'RO', paraguay: 'PY' };
function flag(node) { const file = node?.attribs?.src?.split('/').pop()?.replace(/_?fip\..*$/i, '').replace(/[^a-z]/gi, '').toLowerCase(); return flags[file] || null; }
function team(node) {
  const players = byClass(node, 'singleMatch__team--item').flatMap(item => {
    const nameNode = byClass(item, 'singleMatch__team--itemName')[0];
    const name = (nameNode?.children || []).filter(n => !has(n, 'ranking')).map(text).join(' ').trim();
    return name && !/^(bye|tbd|to be confirmed)$/i.test(name) ? [{ name, id: null, photo: null, country: flag(byClass(item, 'singleMatch__team--itemFlag')[0]) }] : [];
  });
  const extra = text(byClass(node, 'additionalInfo')[0]);
  return { players, seed: extra.match(/\((\d+)\)/)?.[1] || null, placeholder: players.length ? null : /\bbye\b/i.test(text(node)) ? 'Bye' : /Q\/LL/.test(extra) ? 'Qualifier / lucky loser' : 'To be confirmed' };
}
function drawSections(root, event) {
  const rounds = byClass(root, 'colDraw').filter(n => /^\d+$/.test(n.attribs['data-round'] || '')).map((node, index) => {
    const size = Number(node.attribs['data-round']);
    const matches = byClass(node, 'singleMatch').flatMap((match, order) => {
      const teams = byClass(match, 'singleMatch__team');
      if (teams.length !== 2 || !match.attribs['data-match-id']) return [];
      const won = teams.map(t => /✓|✔/.test(text(byClass(t, 'additionalInfo')[0])));
      const winner = won[0] !== won[1] ? won[0] ? 1 : 2 : null;
      const scores = teams.map(t => byClass(t, 'singleMatch__tableSet').map(cell => /^\d+$/.test(text(cell)) ? Number(text(cell)) : null));
      const sets = scores[0].flatMap((n, i) => n != null && scores[1][i] != null ? [[n, scores[1][i]]] : []);
      return [{ id: `fip:${event.id}:${match.attribs['data-match-id']}`, round: index + 1, order, one: team(teams[0]), two: team(teams[1]), start: null, court: null, status: winner ? 'Final score' : 'Upcoming match', completed: winner != null, winner, scores: sets, summary: false }];
    });
    return { id: String(size), name: size === 1 ? 'Final' : size === 2 ? 'Semifinals' : size === 4 ? 'Quarterfinals' : `Round of ${size * 2}`, matches };
  }).filter(r => r.matches.length);
  // The initial official page exposes one division. Never present it as all divisions.
  const script = all(root, n => n.name === 'script').map(n => (n.children || []).map(c => c.data || '').join('')).join('\n');
  const gender = script.match(/(?:var|let|const)\s+gender\s*=\s*['"]([MF])['"]/)?.[1];
  const draw = rounds[0]?.matches[0]?.id.split(':').pop()?.startsWith('Q') ? 'Qualifying draw' : 'Main draw';
  return rounds.length ? [{ id: 'official-main', name: `${gender === 'F' ? 'Women' : gender === 'M' ? 'Men' : 'Published division'} · ${draw}`, kind: 'knockout', rounds, standings: [] }] : [];
}
const labels = new Map(['Location', 'Gender', 'Prize money', 'Sign up fee', 'Court conditions', 'Qualification', 'Main draw', 'Draws', 'Play order', 'Venue', 'Address', 'Entry deadline'].map(label => [normalized(label), label]));
/** Whitelist event facts and published draw documents; never transport website markup to the app. */
export function parseFipTournament(html, event, parseDocument, now = Date.now()) {
  if (!officialEventUrl(event.sourceUrl) || html.length > 2_000_000) throw new Error('Invalid official event');
  const root = parseDocument(html);
  const heading = all(root, n => n.name === 'h1' && has(n, 'event__name'))[0];
  if (!heading || normalized(text(heading)) !== normalized(event.name)) throw new Error('Official event markup changed');
  const info = byClass(root, 'overview__mirror').flatMap(node => {
    const label = labels.get(normalized(text(byClass(node, 'overview__title')[0])));
    const value = text(byClass(node, 'overview__text')[0] || byClass(node, 'overview__listText')[0]).slice(0, 1200);
    return label && value ? [{ label, value }] : [];
  });
  const documents = [...new Map(all(root, n => n.name === 'a').flatMap(node => {
    const url = officialDocumentUrl(node.attribs?.href);
    if (!url || !['draw', 'oop', 'drawPDF'].some(c => has(node, c))) return [];
    const title = text(byClass(node, 'bw-button-text')[0] || node).slice(0, 160) || 'Published draw';
    const kind = has(node, 'oop') || /order.of.play/i.test(title) ? 'schedule' : 'draw';
    return [{ id: hash(url), title, kind, url }];
  }).map(d => [d.url, d])).values()];
  const sections = drawSections(root, event);
  if (!info.length && !documents.length && !sections.length) throw new Error('Official event content unavailable');
  const country = event.country || flags[normalized(event.location?.split(' - ').pop() || '')] || null;
  return { version: 1, event: { ...event, country }, info, documents, sections, updatedAt: new Date(now).toISOString() };
}
export function fipRefreshSeconds(event, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  return event.endDate.slice(0, 10) < day ? 7 * 86400 : event.startDate.slice(0, 10) <= day ? 900 : 21600;
}
