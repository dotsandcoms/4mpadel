import type { ProPerson } from './pro-padel';

export const proShortName = (player: ProPerson) => player.shortName?.trim() || player.name.trim().split(/\s+/).map((part, index, all) => index < all.length - 1 ? `${part[0]}.` : part).join(' ');
export const proInitials = (name: string) => { const words = name.trim().split(/\s+/).filter(Boolean); return `${words[0]?.[0] || '?'}${words.length > 1 ? words.at(-1)![0] : ''}`.toUpperCase(); };
export const proPairName = (team: ProPerson[]) => team.map(proShortName).join(' / ') || 'Players to be confirmed';
