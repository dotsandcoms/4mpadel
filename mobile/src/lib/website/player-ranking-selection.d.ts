export function resolvePlayerRanking(player: Record<string, unknown> | null | undefined, source?: string): { points: number; rank: number | null; label: string; missing?: boolean };
