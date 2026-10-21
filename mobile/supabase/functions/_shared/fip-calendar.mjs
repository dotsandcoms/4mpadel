const plain = value => value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0*39;|&#x27;/gi, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/g, ' ').trim();
const isoDate = value => { const [d,m,y] = value.split('/'); const date = `${y}-${m}-${d}`; return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) ? date : null; };
export function parseFipCalendar(html, year) {
  const events = new Map();
  for (const card of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
    const content = card[1];
    const title = content.match(/class="event-title"[^>]*>[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const dates = content.match(/From\s+(\d{2}\/\d{2}\/\d{4})\s+to\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (!title || !dates) continue;
    const url = new URL(title[1]);
    if (url.hostname !== 'www.padelfip.com' || url.protocol !== 'https:' || !url.pathname.startsWith('/events/')) continue;
    const name = plain(title[2]);
    const level = name.includes('FIP PROMISES') ? 'fip_promises' : name.includes('FIP BRONZE') ? 'fip_bronze' : null;
    if (!level) continue; // API-covered levels remain in the provider directory.
    const startDate = isoDate(dates[1]), endDate = isoDate(dates[2]);
    if (!startDate || !endDate || !startDate.startsWith(String(year))) continue;
    const statusMarkup = content.match(/class="([^"]*event-status[^"]*)"/i)?.[1] || '';
    const status = /\blive\b/.test(statusMarkup) ? 'live' : /\bfinished\b/.test(statusMarkup) ? 'finished' : 'pending';
    const image = content.match(/<img\b[^>]*src="([^"]+)"[^>]*class="cover-category-event"/i)?.[1];
    let hash = 0; for (const char of url.pathname) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    events.set(url.href, { id: -(hash % 2147483646 + 1), name, level, status, startDate, endDate,
      location: plain(content.match(/class="event-location"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || ''), country: null,
      photoUrl: image?.startsWith('https://www.padelfip.com/') ? image : null, sourceUrl: url.href, source: 'FIP', matchesAvailable: false });
  }
  if (events.size < 5 || ![...events.values()].some(event => event.level === 'fip_promises')) throw new Error('Official FIP calendar format changed; previous calendar preserved.');
  return [...events.values()].sort((a,b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
}
export async function buildFipCalendar({ fetchImpl = fetch, now = () => new Date() } = {}) {
  const year = now().getUTCFullYear();
  const sourceUrl = `https://www.padelfip.com/calendar/?events-year=${year}`;
  const response = await fetchImpl(sourceUrl, { headers: { 'User-Agent': '4M Padel calendar sync/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Official FIP calendar could not refresh.');
  const html = await response.text();
  if (html.length > 5000000) throw new Error('Official FIP calendar response is too large.');
  return { version: 1, updatedAt: now().toISOString(), sourceUrl, tournaments: parseFipCalendar(html, year) };
}
