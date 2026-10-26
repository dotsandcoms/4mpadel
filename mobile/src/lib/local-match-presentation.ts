import type { FollowedLocalMatch } from './followed-local-matches';
import type { HubPlayer } from './player-hub';

export type LocalMatchPerson = { name: string; photo: string | null; nationality: string | null; profileId: string | null; followed: boolean };
const nameKey = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function publicPhoto(value: string | null) {
  try { const url = new URL(value || ''); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

/** A unique approved directory match is required before assigning a portrait or profile link. */
export function localMatchParticipants(fixture: FollowedLocalMatch, directory: HubPlayer[]): LocalMatchPerson[][] {
  const people = [...new Map([...directory, ...fixture.players].filter(p => p.source === '4m').map(p => [p.id, p])).values()];
  const followed = new Set(fixture.players.map(p => p.id));
  const info = fixture.match.Info || {};
  return [[info.Challenger, info.Challenger1], [info.Challenged, info.Challenged1]].map(team =>
    team.filter(side => !!side?.Name?.trim()).map(side => {
      const name = side!.Name!.trim(), rankedinId = side!.RankedinId?.trim();
      const matches = people.filter(p => rankedinId ? p.rankedinId === rankedinId : nameKey(p.name) === nameKey(name));
      const player = matches.length === 1 ? matches[0] : null;
      const country = side!.CountryShort?.trim();
      return { name, photo: player ? publicPhoto(player.photo) : null, nationality: country && /^[a-z]{2}$/i.test(country) ? country.toUpperCase() : player?.nationality || null,
        profileId: player && /^[1-9]\d*$/.test(player.id) ? player.id : null, followed: !!player && followed.has(player.id) };
    }));
}
