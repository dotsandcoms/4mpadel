/** National summary statistics must never use the editable active-ranking fields. */
export type SapaPlayer = { rankings?: unknown; gender?: unknown; category?: unknown };
type Row = Record<string, unknown>;
export type SapaMainRanking = { row: Row; label: 'SAPA Men-Main' | 'SAPA Women-Main'; gender: 'men' | 'women'; rank: number | null; points: number | null };
const text = (value: unknown) => String(value ?? '').trim().toLowerCase();
const genderOf = (value: unknown): 'men' | 'women' | null => {
  const label = text(value);
  if (/\b(women|woman|ladies|lady|female)\b/.test(label)) return 'women';
  if (/\b(men|man|male)\b/.test(label)) return 'men';
  return null;
};
const number = (value: unknown) => {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/^#/, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function rankingRows(value: unknown): Row[] {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  return Array.isArray(value) ? value.filter((row): row is Row => !!row && typeof row === 'object' && !Array.isArray(row)) : [];
}

function rowGender(row: Row): 'men' | 'women' | null {
  // Numeric provider identity takes precedence over a potentially stale label.
  if (row.ranking_id != null && Number(row.ranking_id) !== 15809) return null;
  if (row.ranking_id == null && !['sapa ranking', 'sapa'].includes(text(row.org))) return null;
  const age = text(row.age_group || row.division);
  const id = row.age_group_id == null ? null : Number(row.age_group_id);
  const gender = id === 82 ? 'men' : id === 83 ? 'women' : id != null ? null : age === 'men-main' ? 'men' : age === 'women-main' ? 'women' : null;
  if (!gender) return null;
  if (age && age !== `${gender}-main`) return null;
  if (row.ranking_type != null && Number(row.ranking_type) !== (gender === 'men' ? 3 : 4)) return null;
  const match = text(row.match_type);
  if (match && match !== 'doubles' && match !== `${gender}-doubles`) return null;
  return gender;
}

/** Unknown/ambiguous identities stay unavailable rather than borrowing another circuit or gender. */
export function resolveSapaMainRanking(player: SapaPlayer | null | undefined): SapaMainRanking | null {
  if (!player) return null;
  const candidates = rankingRows(player.rankings).map(row => ({ row, gender: rowGender(row) })).filter(item => item.gender != null);
  const explicit = genderOf(player.gender) || genderOf(player.category);
  const genders = new Set(candidates.map(item => item.gender));
  const gender = explicit || (genders.size === 1 ? candidates[0].gender : null);
  if (!gender) return null;
  const matching = candidates.filter(item => item.gender === gender);
  // Gendered doubles is preferred over the older, generic Doubles spelling.
  const doubles = matching.filter(item => text(item.row.match_type) === `${gender}-doubles`);
  const rows = doubles.length ? doubles : matching;
  if (!rows.length) return null;
  const signatures = new Set(rows.map(({ row }) => `${number(row.rank)}:${number(row.points)}`));
  if (signatures.size !== 1) return null;
  const row = rows[0].row, rank = number(row.rank);
  return { row, gender, label: gender === 'men' ? 'SAPA Men-Main' : 'SAPA Women-Main', rank: rank && Number.isInteger(rank) ? rank : null, points: number(row.points) };
}

/** Read projection only: preferences and the original ranking breakdown remain intact. */
export function withSapaMainRanking<T extends SapaPlayer>(player: T) {
  const main = resolveSapaMainRanking(player);
  return { ...player, rank_label: main?.rank != null ? String(main.rank) : null, points: main?.points ?? null, sapa_main_label: main?.label ?? null };
}
