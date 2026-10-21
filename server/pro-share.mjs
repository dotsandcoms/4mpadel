import { playerProfileUrl } from '../src/utils/proUrl.js';

export const SHARE_ORIGIN = 'https://4mpadel.co.za';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export async function shareSnapshot(file) {
  const origin = process.env.VITE_SUPABASE_URL || 'https://uzglrpbixubfijvjbtgz.supabase.co';
  const response = await fetch(`${origin}/storage/v1/object/public/pro-padel/${file}-v1.json`, { signal: AbortSignal.timeout(6000), redirect: 'error' });
  if (!response.ok) throw new Error('Share data unavailable');
  return response.json();
}
export async function loadShare(kind, id) {
  if (!['player', 'match'].includes(kind) || !/^\d+$/.test(String(id))) return null;
  const rankings = await shareSnapshot('rankings');
  const players = Object.values(rankings.categories || {}).flatMap(category => category.players || []);
  if (kind === 'player') {
    const player = players.find(player => String(player.id) === String(id));
    return player ? { kind, player, title: `${player.name} | 4M Pro Padel`, description: `World #${player.rank} · ${Number(player.points).toLocaleString('en-ZA')} points. Follow ${player.name} on 4M Padel.`, path: playerProfileUrl(player) } : null;
  }
  const tour = await shareSnapshot('tour');
  const match = tour.matches.find(match => String(match.id) === String(id));
  if (!match) return null;
  const pairNames = match.teams.map(team => team.map(player => player.name).join(' / '));
  return { kind, match, players, title: `${pairNames.join(' vs ')} | 4M Padel`, description: `${match.tournamentName} · ${match.score.map(set => set.join('–')).join(', ') || match.status}. View the match on 4M Padel.`, path: `/pro/results?match=${match.id}${match.category === 'women' ? '&category=women' : ''}` };
}
export function shareHtml(data) {
  const image = `${SHARE_ORIGIN}/api/pro-share-image?kind=${data.kind}&id=${data.player?.id || data.match.id}`;
  const url = SHARE_ORIGIN + data.path;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(data.title)}</title><meta name="description" content="${escapeHtml(data.description)}"><meta property="og:type" content="website"><meta property="og:site_name" content="4M Padel"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:title" content="${escapeHtml(data.title)}"><meta property="og:description" content="${escapeHtml(data.description)}"><meta property="og:image" content="${escapeHtml(image)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escapeHtml(data.title)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(data.title)}"><meta name="twitter:description" content="${escapeHtml(data.description)}"><meta name="twitter:image" content="${escapeHtml(image)}"></head><body><a href="${escapeHtml(url)}">${escapeHtml(data.title)}</a></body></html>`;
}
