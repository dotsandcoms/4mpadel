import { divisionRankingSource, resolvePlayerRanking } from '../_shared/playerRankingSelection.js';

const rankingId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/**
 * RankedIn's edit model omits SelectedRankings; its separate ranking endpoint owns them.
 * @param {any} selection
 * @param {unknown} federationRankingId
 */
export function buildRankingSelection(selection, federationRankingId = null) {
  if (!Array.isArray(selection?.selectedRankings)) {
    throw new Error('Could not read the existing RankedIn rankings; tournament details were not saved');
  }
  const selectedIds = selection.selectedRankings.map((ranking) => rankingId(ranking?.id ?? ranking?.Id));
  if (selectedIds.some((id) => !id)) throw new Error('RankedIn returned an invalid selected ranking; tournament details were not saved');
  const ids = [...new Set(selectedIds)];
  const savedSeedId = rankingId(selection.seedRankingId);
  if (savedSeedId && !ids.includes(savedSeedId)) ids.push(savedSeedId);
  const federationId = rankingId(federationRankingId);
  const addedRanking = !!federationId && !ids.includes(federationId);
  if (addedRanking) ids.push(federationId);
  const seedId = savedSeedId || federationId || ids[0] || null;
  return {
    SelectedRankings: ids.map((id) => ({ id })),
    SeedRankingId: seedId,
    addedRanking,
    changedSeedRanking: seedId !== savedSeedId,
  };
}

export function rankingSelectionMatches(actual, expected) {
  if (!Array.isArray(actual?.selectedRankings)) return false;
  const actualIds = new Set(actual.selectedRankings.map((row) => rankingId(row?.id ?? row?.Id)));
  return actualIds.size === expected.SelectedRankings.length
    && expected.SelectedRankings.every((row) => actualIds.has(row.id))
    && rankingId(actual.seedRankingId) === expected.SeedRankingId;
}

const playerKey = (value) => String(value ?? '').trim().toUpperCase();
const seedValue = (value) => String(value ?? '').trim().replace(/^0$/, '');
const tournamentPlayerId = (row) => Number(row?.Participant?.TournamentPlayerId ?? row?.Id);

export function rankedinProfileIds(model) {
  return [...new Set((model.Participants || []).flatMap((row) => (
    [row.Participant?.FirstPlayer, row.Participant?.SecondPlayer].flatMap((player) => {
      const code = playerKey(player?.RankedinId);
      return [code, code.toLowerCase(), code.replace(/^R/, ''), String(player?.Id || '')].filter(Boolean);
    })
  )))];
}

/** Match the public 4M card: sum the selected points for the two players. */
export function buildClassSeedPlan(model, profiles, division) {
  if (!Array.isArray(model?.Participants)) throw new Error('RankedIn did not return its player settings');
  if (![1, 5].includes(Number(model.EventState)) || model.IsLocked) {
    return { status: 'skipped', reason: 'tournament_locked', updated: 0 };
  }
  // The top-level AreDrawsGeneratedForSelectedClass flag can be true even
  // before draws exist. RankedIn exposes the actual state on each entrant.
  if (model.Participants.some((row) => row.IsDrawCreated || row.IsAnyMatchGenerated
    || Number(row.Participant?.DrawId) > 0)) {
    return { status: 'skipped', reason: 'draws_exist', updated: 0 };
  }
  const source = divisionRankingSource(division);
  const profilesById = new Map();
  for (const profile of profiles) {
    const key = playerKey(profile.rankedin_id);
    if (!key) continue;
    const existing = profilesById.get(key);
    if (existing && resolvePlayerRanking(existing, source).points !== resolvePlayerRanking(profile, source).points) {
      throw new Error('Multiple 4M profiles have conflicting points for the same RankedIn ID');
    }
    profilesById.set(key, profile);
    if (/^\d+$/.test(key)) profilesById.set(`R${key}`, profile);
  }
  const rows = model.Participants.map((row) => {
    const points = [row.Participant?.FirstPlayer, row.Participant?.SecondPlayer].reduce((total, player) => {
      const profile = profilesById.get(playerKey(player?.RankedinId))
        || profilesById.get(playerKey(player?.Id));
      const value = resolvePlayerRanking(profile, source).points;
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
    return { id: tournamentPlayerId(row), seed: seedValue(row.Participant?.Seed), points };
  });
  if (rows.some((row) => !Number.isSafeInteger(row.id) || row.id <= 0)
    || new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error('RankedIn returned invalid or duplicate tournament player IDs');
  }
  const ranked = rows.filter((row) => row.points > 0).sort((a, b) => b.points - a.points);
  const seeds = new Map(ranked.map((row, index) => [row.id, String(index + 1)]));
  if (rows.some((row) => row.seed && row.seed !== seeds.get(row.id))) {
    return { status: 'skipped', reason: 'existing_seeds', updated: 0 };
  }
  const changes = rows.filter((row) => seeds.has(row.id) && !row.seed)
    .map((row) => ({ tournamentPlayerId: row.id, seed: seeds.get(row.id), points: row.points }));
  if (!changes.length) {
    return { status: 'noop', reason: ranked.length ? 'already_seeded' : 'no_ranking_points', updated: 0 };
  }
  const payload = structuredClone(model);
  for (const row of payload.Participants) {
    const seed = seeds.get(tournamentPlayerId(row));
    if (seed) row.Participant.Seed = seed;
  }
  return { status: 'ready', updated: changes.length, source, changes, payload };
}

/** Uses the same settings model and save endpoint as RankedIn's Players step. */
export async function syncRankedinClassSeeds({
  apiBase, tournamentId, classId, headers, loadProfiles, division,
  fetchImpl = fetch, dryRun = false,
}) {
  const settingsUrl = `${apiBase}/tournament/PlayerSettingsAsync?TournamentId=${tournamentId}`
    + `&TournamentClassId=${classId}&OrderBy=r`;
  const response = await fetchImpl(settingsUrl, { headers });
  if (!response.ok) throw new Error(`Could not read RankedIn seeds (HTTP ${response.status})`);
  const model = await response.json();
  if (Number(model.Id) !== Number(tournamentId) || Number(model.SelectedTournamentClass) !== Number(classId)) {
    throw new Error('RankedIn returned settings for a different tournament or class');
  }
  if (!model.IsAdmin && !model.IsSuperAdmin) throw new Error('RankedIn seeding requires tournament administrator access');
  const profiles = await loadProfiles(model);
  const plan = buildClassSeedPlan(model, profiles, division);
  const { payload, ...summary } = plan;
  if (!payload) return summary;
  if (dryRun) return { ...summary, status: 'preview' };

  const saved = await fetchImpl(`${apiBase}/tournament/UpdatePlayerSettingsAsync`, {
    method: 'POST', headers, body: JSON.stringify(payload),
  });
  if (!saved.ok) throw new Error(`Could not save RankedIn seeds (HTTP ${saved.status})`);
  // An HTTP success alone is insufficient: confirm that the saved seeds exist.
  const verify = await fetchImpl(settingsUrl, { headers });
  if (!verify.ok) throw new Error(`Could not verify saved RankedIn seeds (HTTP ${verify.status})`);
  const actual = await verify.json();
  const actualSeeds = new Map((actual.Participants || []).map((row) => [tournamentPlayerId(row), seedValue(row.Participant?.Seed)]));
  if (plan.changes.some((change) => actualSeeds.get(change.tournamentPlayerId) !== change.seed)) {
    throw new Error('RankedIn did not retain the requested seeds; check the tournament Players step');
  }
  return { ...summary, status: 'ok' };
}
