const normalise = (value) => String(value || '').trim().toLowerCase();

const rankingKeyParts = (value) => String(value || '').split('|').map((part) => part.trim());

const MEN_AGE_BANDS = new Map([
    [2, 35],
    [3, 40],
    [4, 45],
    [5, 50],
    [6, 55],
    [7, 60],
    [8, 65],
]);

const WOMEN_AGE_BANDS = new Map([
    [14, 35],
    [15, 40],
    [16, 45],
    [17, 50],
    [18, 55],
    [19, 60],
    [20, 65],
    [21, 70],
]);

const BOYS_JUNIORS = new Map([
    [66, 14],
    [67, 16],
    [68, 18],
    [69, 20],
]);

const GIRLS_JUNIORS = new Map([
    [71, 12],
    [72, 14],
    [73, 16],
    [74, 18],
    [75, 20],
]);

/** Translate RankedIn API IDs into the division labels shown on profiles. */
export const rankedInAgeGroupLabel = (ageGroup, rankingType, details = []) => {
    const age = Number(ageGroup);
    if (age === 82) return 'Men-Main';
    if (age === 83) return 'Women-Main';
    if (age === 84) return 'Mixed-Main';

    const womenThreshold = WOMEN_AGE_BANDS.get(age);
    if (womenThreshold) return `Women Over ${womenThreshold}`;
    const menThreshold = MEN_AGE_BANDS.get(age);
    if (menThreshold) return `Men Over ${menThreshold}`;

    const boysAge = BOYS_JUNIORS.get(age);
    if (boysAge) return `Boys Under ${boysAge}`;
    const girlsAge = GIRLS_JUNIORS.get(age);
    if (girlsAge) return `Girls Under ${girlsAge}`;

    const detailText = (details || []).map((detail) => detail?.class).filter(Boolean).join(' ');
    if (Number(rankingType) === 4 || /women|ladies|female|girls/i.test(detailText)) return 'Women Open';

    return 'Open';
};

export const rankingRowKey = (ranking) => [
    ranking?.org,
    ranking?.age_group,
    ranking?.match_type,
].map((part) => String(part || '').trim()).join('|');

/**
 * Match a saved preference without requiring the legacy "Doubles" value to
 * equal newer gendered values such as "Men-Doubles" / "Women-Doubles".
 */
export const findPreferredRanking = (rankings, preferredRanking) => {
    const [preferredOrg, preferredAge, preferredMatch] = rankingKeyParts(preferredRanking);
    if (!preferredOrg || !preferredAge) return null;

    return (rankings || []).find((ranking) => {
        if (normalise(ranking?.org) !== normalise(preferredOrg)) return false;
        if (normalise(ranking?.age_group) !== normalise(preferredAge)) return false;
        if (!preferredMatch) return true;
        const rowMatch = normalise(ranking?.match_type);
        const wantedMatch = normalise(preferredMatch);
        return rowMatch === wantedMatch
            || (wantedMatch === 'doubles' && rowMatch.endsWith('-doubles'));
    }) || null;
};

const findActiveLabelRanking = (rankings, activeLabel) => {
    const label = normalise(activeLabel);
    if (!label) return null;
    return (rankings || []).find((ranking) => (
        label === normalise(`${ranking?.org} - ${ranking?.age_group}`)
    )) || null;
};

const findOrganisationMainRanking = (rankings, organisation, player) => {
    const rows = (rankings || []).filter((ranking) => normalise(ranking?.org) === normalise(organisation));
    if (rows.length === 0) return null;

    const preferred = findPreferredRanking(rows, player?.preferred_ranking);
    if (preferred) return preferred;

    const genderText = normalise(`${player?.category || ''} ${player?.gender || ''}`);
    const wantsWomen = /women|woman|ladies|lady|female/.test(genderText)
        || rows.some((ranking) => normalise(ranking?.age_group) === 'women-main');
    const wantedMain = wantsWomen ? 'women-main' : 'men-main';
    return rows.find((ranking) => normalise(ranking?.age_group) === wantedMain)
        || rows.find((ranking) => /main/.test(normalise(ranking?.age_group)))
        || rows[0];
};

export const rankingSourceOrganisation = (source) => (
    String(source || '').startsWith('organisation:')
        ? String(source).slice('organisation:'.length)
        : null
);

export const rankingSourceCategory = (source) => {
    if (!String(source || '').startsWith('category:')) return null;
    const [organisation, ageGroup, matchType] = String(source)
        .slice('category:'.length)
        .split('|')
        .map((part) => part.trim());
    return organisation && ageGroup
        ? { organisation, ageGroup, matchType: matchType || null }
        : null;
};

export const resolvePlayerRanking = (player, source = 'active') => {
    const rankings = Array.isArray(player?.rankings) ? player.rankings : [];
    const organisation = rankingSourceOrganisation(source);
    const category = rankingSourceCategory(source);
    const ranking = category
        ? rankings.find((row) => (
            normalise(row?.org) === normalise(category.organisation)
            && normalise(row?.age_group) === normalise(category.ageGroup)
            && (!category.matchType || normalise(row?.match_type) === normalise(category.matchType))
        ))
        : organisation
        ? findOrganisationMainRanking(rankings, organisation, player)
        : findPreferredRanking(rankings, player?.preferred_ranking)
            || findActiveLabelRanking(rankings, player?.active_ranking_label);

    if (ranking) {
        return {
            points: Number(ranking.points) || 0,
            rank: ranking.rank == null ? null : String(ranking.rank),
            key: rankingRowKey(ranking),
            label: `${ranking.org} - ${ranking.age_group}`,
            organisation: ranking.org || null,
            age_group: ranking.age_group || null,
            match_type: ranking.match_type || null,
            fallback: false,
        };
    }

    return {
        points: Number(player?.points) || 0,
        rank: player?.rank_label == null ? null : String(player.rank_label),
        key: player?.preferred_ranking || null,
        label: player?.active_ranking_label || 'Player profile points',
        organisation: category?.organisation || organisation || null,
        age_group: null,
        match_type: null,
        fallback: true,
    };
};

export const listRankingOrganisations = (players) => [...new Set(
    (players || []).flatMap((player) => (
        Array.isArray(player?.rankings) ? player.rankings.map((ranking) => ranking?.org) : []
    )).filter(Boolean),
)].sort((a, b) => a.localeCompare(b));

export const listRankingCategories = (players) => {
    const categories = new Map();
    (players || []).forEach((player) => {
        (Array.isArray(player?.rankings) ? player.rankings : []).forEach((ranking) => {
            if (!ranking?.org || !ranking?.age_group) return;
            const key = rankingRowKey(ranking);
            categories.set(key, {
                source: `category:${key}`,
                organisation: ranking.org,
                age_group: ranking.age_group,
                match_type: ranking.match_type || null,
            });
        });
    });
    return [...categories.values()].sort((a, b) => (
        a.organisation.localeCompare(b.organisation)
        || a.age_group.localeCompare(b.age_group)
        || String(a.match_type || '').localeCompare(String(b.match_type || ''))
    ));
};
