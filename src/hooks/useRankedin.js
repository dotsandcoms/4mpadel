import { useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// Rankedin API Base URL
const API_BASE = 'https://api.rankedin.com/v1';
const SAPA_ORG_ID = '11331';

// Global cache for the anonymous token to avoid redundant fetches
let cachedAnonymousToken = null;

/**
 * Custom fetch helper that implements a standard timeout and signal merging.
 */
const fetchWithTimeout = async (url, options = {}, timeout = 8000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const mergedOptions = { cache: 'no-store', ...options };
    if (options.signal) {
        if (options.signal.aborted) {
            controller.abort();
        } else {
            options.signal.addEventListener('abort', () => controller.abort());
        }
    }
    mergedOptions.signal = controller.signal;

    try {
        const response = await fetch(url, mergedOptions);
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
};

/**
 * Generic fetch helper that implements a standard timeout, abort signal merging,
 * and caches the response in Supabase `rankedin_cache` for high availability and sub-second loads.
 */
const fetchWithCache = async (url, options = {}, cacheDurationMs = 1000 * 60 * 60 * 6) => { // Default 6 hours cache
    // 1. Attempt to read from Supabase cache first
    try {
        const { data, error } = await supabase
            .from('rankedin_cache')
            .select('payload, updated_at')
            .eq('url', url)
            .maybeSingle();

        if (data) {
            const ageMs = Date.now() - new Date(data.updated_at).getTime();
            if (ageMs < cacheDurationMs) {
                console.log(`[Cache HIT - Fresh]: ${url}`);
                return data.payload;
            }
            console.log(`[Cache HIT - Stale, age: ${Math.round(ageMs / 1000)}s]: ${url}`);
        }
    } catch (e) {
        console.error("Cache read error:", e);
    }

    // 2. Fetch live from RankedIn API
    try {
        const response = await fetchWithTimeout(url, options);
        if (!response.ok) throw new Error(`Rankedin API status ${response.status}`);
        const data = await response.json();

        // 3. Save to Supabase cache asynchronously so we don't block the client
        supabase
            .from('rankedin_cache')
            .upsert({ url, payload: data, updated_at: new Date().toISOString() }, { onConflict: 'url' })
            .then(({ error }) => {
                if (error) console.error("Cache write error:", error.message);
            });

        return data;
    } catch (liveError) {
        console.warn(`[Rankedin Offline/Timeout]: ${liveError.message}. Attempting stale cache fallback...`);

        // 4. Fallback to stale cache if Rankedin is offline
        try {
            const { data } = await supabase
                .from('rankedin_cache')
                .select('payload')
                .eq('url', url)
                .maybeSingle();

            if (data && data.payload) {
                console.warn(`[Offline Mode]: Successfully served stale cache for ${url}`);
                return data.payload;
            }
        } catch (cacheErr) {
            console.error("Fallback cache read error:", cacheErr);
        }

        // If no cache at all and live fetch failed, throw the original error
        throw liveError;
    }
};

export const useRankedin = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    /**
     * Fetches the latest finished tournaments for SAPA.
     * @param {number} take Number of tournaments to fetch
     * @returns {Promise<Array>} Array of tournament objects
     */
    const getRecentTournaments = useCallback(async (take = 3) => {
        setLoading(true);
        setError(null);
        try {
            // Organization/GetOrganisationEventsAsync endpoint
            const data = await fetchWithCache(
                `${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=true&Language=en&skip=0&take=${take}`
            );
            return data.payload || [];
        } catch (err) {
            console.error('Error fetching recent tournaments:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Fetches standings and fixtures for a team league.
     * @param {string|number} teamleagueId 
     * @param {string|number} poolId 
     * @returns {Promise<Object>} Standings and matches data
     */
    const getTeamLeagueStandings = useCallback(async (teamleagueId, poolId) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchWithCache(
                `${API_BASE}/teamleague/GetStandingsSectionAsync?teamleagueId=${teamleagueId}&poolid=${poolId}&language=en`
            );
            return data;
        } catch (err) {
            console.error("Rankedin TeamLeague Standings fetch error:", err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Fetches teams and players for a team league.
     * @param {string|number} poolId 
     * @returns {Promise<Array>} Array of teams
     */
    const getTeamLeagueTeams = useCallback(async (poolId) => {
        setLoading(true);
        setError(null);
        try {
            return await fetchWithCache(
                `${API_BASE}/teamleague/GetPoolTeamsAsync?poolid=${poolId}&language=en`
            );
        } catch (err) {
            console.error("Rankedin TeamLeague Teams fetch error:", err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Fetches individual game results for a team match.
     * @param {string|number} teamMatchId 
     * @returns {Promise<Array>} Array of matches
     */
    const getTeamMatchResults = useCallback(async (teamMatchId) => {
        try {
            const data = await fetchWithCache(
                `${API_BASE}/teamleague/GetTeamLeagueTeamsMatchesAsync?teamMatchId=${teamMatchId}&language=en`
            );
            // Data is usually an array of sections, the first one contains the matches
            return data[0]?.Matches?.Matches || [];
        } catch (err) {
            console.error("Rankedin TeamMatch Results fetch error:", err);
            return [];
        }
    }, []);

    /**
     * Fetches the upcoming tournaments for SAPA.
     * @returns {Promise<Array>} Array of upcoming tournament objects
     */
    const getUpcomingOrganisationEvents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchWithCache(
                `${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=false&Language=en&skip=0&take=100`
            );
            return data.payload || [];
        } catch (err) {
            console.error('Error fetching upcoming tournaments:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Fetches the classes (e.g. Men's Pro, Mixed) available for a specific tournament.
     * @param {string|number} tournamentId 
     * @returns {Promise<Array>} Array of class objects
     */
    const getTournamentClasses = useCallback(async (tournamentId) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchWithCache(
                `${API_BASE}/tournament/GetClassesAndDrawNamesAsync/?tournamentId=${tournamentId}`,
                {},
                1000 * 60 * 2 // 2 minutes cache
            );
            return data || [];
        } catch (err) {
            console.error('Error fetching tournament classes:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Fetches the knockout bracket / draw data for a specific tournament class.
     * @param {string|number} tournamentClassId 
     * @param {number} drawStage
     * @param {number} drawStrength
     * @returns {Promise<Object>} Formatted draw data
     */
    const getDrawsForClass = useCallback(async (tournamentClassId, drawStage = 0, drawStrength = 0) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchWithCache(
                `${API_BASE}/tournament/GetDrawsForStageAndStrengthAsync?tournamentClassId=${tournamentClassId}&drawStrength=${drawStrength}&drawStage=${drawStage}&isReadonly=true&language=en`,
                {},
                1000 * 60 * 2 // 2 minutes cache
            );
            // Return the raw data array so KnockoutBracket can parse BaseType (RoundRobin or Elimination)
            return data;
        } catch (err) {
            console.error('Error fetching draws for class:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Fetches details for a specific tournament by ID.
     * @param {string|number} tournamentId 
     * @returns {Promise<Object>} Tournament object
     */
    const getTournamentDetails = useCallback(async (tournamentId) => {
        try {
            // Check finished events
            const finishedData = await fetchWithCache(`${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=true&Language=en&skip=0&take=100`);
            let tour = finishedData.payload?.find(t => t.eventId.toString() === tournamentId.toString());

            if (tour) return tour;

            // Check upcoming/ongoing events
            const upcomingData = await fetchWithCache(`${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=false&Language=en&skip=0&take=100`);
            tour = upcomingData.payload?.find(t => t.eventId.toString() === tournamentId.toString());

            return tour || null;
        } catch (err) {
            console.error('Error fetching tournament details:', err);
            return null;
        }
    }, []);

    const getTournamentInfo = useCallback(async (tournamentId) => {
        try {
            const data = await fetchWithCache(`${API_BASE}/tournament/GetInfoAsync?id=${tournamentId}`, {}, 1000 * 60 * 5); // 5 minutes cache
            return data;
        } catch (err) {
            console.error('Error fetching tournament info:', err);
            return null;
        }
    }, []);

    /**
     * Fetches the latest rankings for a specific type and age group.
     * @param {number} rankingType 3 (Men), 4 (Women), 5 (Mixed)
     * @param {number} ageGroup 82 (Men-Main), 83 (Women-Main), 84 (Mixed-Main)
     * @param {number} take Number of players to fetch
     * @returns {Promise<Array>} Array of ranked players
     */
    const getOrganisationRankings = useCallback(async (rankingType, ageGroup, take = 10, rankingId = 15809) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchWithCache(
                `${API_BASE}/Ranking/GetRankingsAsync?rankingId=${rankingId}&rankingType=${rankingType}&ageGroup=${ageGroup}&weekFromNow=0&language=en&skip=0&take=${take}`
            );
            return data.Payload || [];
        } catch (err) {
            console.error('Error fetching rankings:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Fetches events for a specific player by their Rankedin ID.
     * @param {string} playerId Rankedin Player ID (e.g. R000328907)
     * @returns {Promise<Array>} Array of player events
     */
    const getPlayerEventsAsync = useCallback(async (playerId, signal) => {
        if (!playerId) return [];
        setLoading(true);
        setError(null);
        try {
            // Step 1: Get internal PlayerId from string ID (e.g. R000328907)
            const profileData = await fetchWithCache(`${API_BASE}/player/playerprofileinfoasync?rankedinId=${playerId}&language=en`, { signal });
            const internalId = profileData.Header?.PlayerId;

            if (!internalId) throw new Error("Could not extract internal PlayerId");

            // Step 2: Fetch events using internal ID
            const data = await fetchWithCache(
                `${API_BASE}/player/ParticipatedEventsAsync?playerId=${internalId}&language=en&skip=0&take=100`,
                { signal },
                1000 * 60 * 15 // 15 minutes cache for events
            );

            const rawEvents = data.Payload || data.payload || [];

            return rawEvents.map(e => {
                const n = (e.Name || '').toLowerCase();
                let status = 'None';
                if (n.includes('fip')) status = 'FIP event';
                else if (n.includes('super gold') || n.includes('s gold') || n.includes('sgold')) status = 'Super Gold';
                else if (n.includes('major')) status = 'Major';
                else if (n.includes('gold')) status = 'Gold';
                else if (n.includes('bronze')) status = 'Bronze';
                else if (n.includes('key')) status = 'Key Event';

                return {
                    id: e.Id,
                    event_name: e.Name,
                    sapa_status: status,
                    start_date: e.StartDate,
                    end_date: e.EndDate || e.StartDate,
                    slug: e.Link ? e.Link.split('/').pop() : null,
                    eventId: e.Id, // For EventCard external link logic
                    state: e.State
                };
            });
        } catch (err) {
            console.error('Error fetching player events:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Fetches matches for a tournament, optionally filtered by class, stage, etc.
     * @param {Object} params { tournamentId, tournamentClassId, drawStage, drawStrength, isFinished }
     * @returns {Promise<Array>} Array of match objects
     */
    const getTournamentMatches = useCallback(async ({ tournamentId, tournamentClassId, drawStage, drawStrength, isFinished }) => {
        setLoading(true);
        setError(null);
        try {
            let url = `${API_BASE}/tournament/GetMatchesSectionAsync?Id=${tournamentId}&LanguageCode=en&IsReadonly=true`;
            if (tournamentClassId) url += `&tournamentClassId=${tournamentClassId}`;
            if (drawStage !== undefined) url += `&drawStage=${drawStage}`;
            if (drawStrength !== undefined) url += `&drawStrength=${drawStrength}`;
            if (isFinished !== undefined) url += `&isFinished=${isFinished}`;

            const data = await fetchWithCache(url, {}, 1000 * 60 * 2); // 2 minutes cache
            return data.Matches || [];
        } catch (err) {
            console.error('Error fetching tournament matches:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Attempts to find winners for all classes in a tournament.
     * @param {string|number} tournamentId 
     * @returns {Promise<Array>} Array of objects { className, winners }
     */
    const getTournamentWinners = useCallback(async (tournamentId) => {
        try {
            const classes = await getTournamentClasses(tournamentId);
            const winnersList = [];

            for (const cls of classes.slice(0, 24)) {
                if (!cls.TournamentDraws || cls.TournamentDraws.length === 0) continue;

                // Fetch each draw (Main, Backdraw, etc.)
                for (const draw of cls.TournamentDraws) {
                    try {
                        const drawData = await getDrawsForClass(cls.Id, draw.Stage, draw.Strength);
                        if (!drawData || !Array.isArray(drawData)) continue;

                        // Look for Elimination draw winners
                        const eliminationDraw = drawData.find(d => d.BaseType === 'Elimination');
                        const elimination = eliminationDraw?.Elimination;

                        if (elimination && elimination.DrawData) {
                            // Find the Final (highest round)
                            const allCells = elimination.DrawData.flat()
                                .filter(cell => cell && (cell.MatchCell || cell.MatchViewModel || cell.WinnerParticipantId !== undefined || cell.Round !== undefined));

                            // Identical grouping logic to KnockoutBracket.jsx
                            const roundsMap = {};
                            elimination.DrawData.forEach(row => {

                                row.forEach(cell => {
                                    if (!cell || (!cell.MatchCell && !cell.MatchViewModel)) return;
                                    const m = cell.MatchCell || cell;
                                    const round = m.Round;
                                    if (typeof round === 'undefined') return;
                                    if (!roundsMap[round]) roundsMap[round] = [];
                                    const matchId = m.MatchId;
                                    if (!roundsMap[round].some(existing => (existing.MatchCell || existing).MatchId === matchId)) {
                                        roundsMap[round].push(cell);
                                    }
                                });
                            });

                            const sortedRounds = Object.keys(roundsMap).map(Number).sort((a, b) => a - b).map(roundKey => {
                                return roundsMap[roundKey].sort((a, b) => {
                                    const ordA = (a.MatchCell || a).MatchOrder || 0;
                                    const ordB = (b.MatchCell || b).MatchOrder || 0;
                                    return ordA - ordB;
                                });
                            });

                            const finalRound = sortedRounds.length > 0 ? sortedRounds[sortedRounds.length - 1] : [];
                            const semiFinalRound = sortedRounds.length > 1 ? sortedRounds[sortedRounds.length - 2] : [];
                            const finalCell = finalRound.length > 0 ? finalRound[0] : null;

                            const extractNames = (participant) => {
                                if (!participant) return null;
                                let names = participant.Name;
                                if (!names && participant.FirstPlayer) {
                                    names = participant.FirstPlayer.Name;
                                    if (participant.SecondPlayer) names += ` & ${participant.SecondPlayer.Name}`;
                                }
                                return names;
                            };

                            const getLoser = (matchCell) => {
                                if (!matchCell) return null;
                                const m = matchCell.MatchCell || matchCell.MatchViewModel || matchCell;
                                const scoreObj = m.MatchResults?.Score || m.MatchViewModel?.Score || m.Score || matchCell.Score;
                                const winnerId = m.MatchResults?.WinnerParticipantId || m.MatchViewModel?.WinnerParticipantId || m.WinnerParticipantId || matchCell.WinnerParticipantId;

                                const p1 = matchCell.ChallengerParticipant || m.ChallengerParticipant;
                                const p2 = matchCell.ChallengedParticipant || m.ChallengedParticipant;

                                let winningParticipant = null;
                                if (winnerId) {
                                    const p1Matches = (p1?.Id == winnerId || p1?.EventParticipantId == winnerId);
                                    const p2Matches = (p2?.Id == winnerId || p2?.EventParticipantId == winnerId);
                                    if (p1Matches) winningParticipant = p1;
                                    else if (p2Matches) winningParticipant = p2;
                                }

                                if (!winningParticipant) {
                                    const isFirstWinner = scoreObj?.IsFirstParticipantWinner || m.MatchViewModel?.IsFirstParticipantWinner || false;
                                    winningParticipant = isFirstWinner ? p1 : p2;
                                }

                                if (winningParticipant === p1) return p2;
                                if (winningParticipant === p2) return p1;
                                return null;
                            };

                            if (finalCell) {
                                const m = finalCell.MatchCell || finalCell.MatchViewModel || finalCell;
                                const p1 = finalCell.ChallengerParticipant || m.ChallengerParticipant;
                                const p2 = finalCell.ChallengedParticipant || m.ChallengedParticipant;

                                const loser = getLoser(finalCell);
                                const winner = loser === p1 ? p2 : p1;

                                const winnerNames = extractNames(winner);
                                const runnerUpNames = extractNames(loser);

                                let thirdPlaceNames = null;
                                let fourthPlaceNames = null;

                                if (semiFinalRound.length === 2) {
                                    const sf1Loser = getLoser(semiFinalRound[0]);
                                    const sf2Loser = getLoser(semiFinalRound[1]);
                                    thirdPlaceNames = extractNames(sf1Loser);
                                    fourthPlaceNames = extractNames(sf2Loser);
                                }

                                if (winnerNames) {
                                    winnersList.push({
                                        CategoryName: cls.Name,
                                        Winner: { Name: winnerNames },
                                        RunnerUp: runnerUpNames ? { Name: runnerUpNames } : null,
                                        ThirdPlace: thirdPlaceNames ? { Name: thirdPlaceNames } : null,
                                        FourthPlace: fourthPlaceNames ? { Name: fourthPlaceNames } : null,
                                        className: cls.Name,
                                        drawName: draw.Name,
                                        winners: winnerNames,
                                        runnerUp: runnerUpNames
                                    });
                                }
                            }
                        } else if (drawData.some(d => d.BaseType === 'RoundRobin')) {
                            // Simple RoundRobin detection if available
                            const rr = drawData.find(d => d.BaseType === 'RoundRobin')?.RoundRobin;
                            if (rr && rr.Ranking && rr.Ranking.length > 0) {
                                const top = rr.Ranking[0];
                                let winnerNames = top.ParticipantName;
                                const runnerUp = rr.Ranking.length > 1 ? rr.Ranking[1] : null;
                                let runnerUpNames = runnerUp ? runnerUp.ParticipantName : null;

                                if (winnerNames) {
                                    winnersList.push({
                                        CategoryName: cls.Name,
                                        Winner: { Name: winnerNames },
                                        RunnerUp: runnerUpNames ? { Name: runnerUpNames } : null,
                                        className: cls.Name,
                                        drawName: draw.Name,
                                        winners: winnerNames
                                    });
                                }
                            }
                        }
                    } catch (drawErr) {
                        console.error(`Error processing draw ${draw.Name}:`, drawErr);
                    }
                }
            }
            return winnersList;
        } catch (err) {
            console.error('Error fetching winners:', err);
            return [];
        }
    }, [getTournamentClasses, getDrawsForClass]);

    /**
     * Internal helper to fetch an anonymous token if not cached.
     */
    const getAnonymousToken = useCallback(async () => {
        if (cachedAnonymousToken) return cachedAnonymousToken;
        try {
            const data = await fetchWithCache(`${API_BASE}/player/getlayoutinfoasync?language=en`);
            if (data && data.AnonymousToken) {
                cachedAnonymousToken = data.AnonymousToken;
                return cachedAnonymousToken;
            }
        } catch (err) {
            console.error('Failed to fetch anonymous token:', err);
        }
        return null;
    }, []);

    /**
     * Fetches match history for a specific player by their Rankedin ID.
     * @param {string} rankedinId Rankedin Player ID (e.g. R000328907)
     * @param {boolean} takeHistory Whether to fetch past matches (true) or upcoming (false)
     * @param {number} take Number of matches to fetch
     * @returns {Promise<Array>} Array of matches
     */
    const getPlayerMatches = useCallback(async (rankedinId, takeHistory = true, take = 20, signal) => {
        if (!rankedinId) return [];
        setLoading(true);
        setError(null);
        try {
            // Step 0: Check custom player_matches cache (ONLY for history)
            if (takeHistory) {
                try {
                    const { data: cacheRow } = await supabase
                        .from('player_matches')
                        .select('*')
                        .eq('rankedin_id', rankedinId)
                        .maybeSingle();

                    if (cacheRow) {
                        const ageMs = Date.now() - new Date(cacheRow.updated_at).getTime();
                        // 5 minutes = 300000 ms
                        if (ageMs < 300000) {
                            if (cacheRow.past_matches !== null) {
                                return cacheRow.past_matches;
                            }
                        }
                    }
                } catch (cacheErr) {
                    console.warn("player_matches cache read error:", cacheErr);
                }
            }

            // Step 1: Get internal PlayerId
            const profileData = await fetchWithCache(`${API_BASE}/player/playerprofileinfoasync?rankedinId=${rankedinId}&language=en`, { signal });
            const internalId = profileData.Id || profileData.Header?.PlayerId;

            if (!internalId) throw new Error("Could not extract internal PlayerId");

            // Step 2: Get token for real data
            const token = await getAnonymousToken();

            // Step 3: Fetch matches
            const data = await fetchWithCache(
                `${API_BASE}/player/GetPlayerMatchesAsync?playerid=${internalId}&takehistory=${takeHistory}&skip=0&take=${take}&language=en`,
                {
                    signal,
                    headers: {
                        ...(token ? { 'x-anonymous-token': token } : {}),
                        'Accept': 'application/json'
                    }
                },
                takeHistory ? 1000 * 60 * 5 : 1000 * 60 * 5 // 5 minutes for both history and upcoming
            );

            let payload = data.Payload || [];

            // If we're fetching history and only got placeholders, use the tournament fallback
            const isPlaceholder = payload.length > 0 && payload.every(m => m.Info?.EventName === 'EventName');

            if (takeHistory && (payload.length === 0 || isPlaceholder)) {
                // FALLBACK: Fetch events and then their matches
                const events = await getPlayerEventsAsync(rankedinId, signal);
                const now = new Date();
                const pastEvents = events
                    .filter(e => new Date(e.start_date) < now)
                    .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
                    .slice(0, 5); // Limit to last 5 tournaments to avoid too many requests

                const historyMatches = [];
                const matchPromises = pastEvents.map(async (event) => {
                    try {
                        let url = `${API_BASE}/tournament/GetMatchesSectionAsync?Id=${event.id}&LanguageCode=en&IsReadonly=true`;
                        if (event.id === 68674 || event.id === '68674' || (event.event_name || '').toLowerCase().includes('north vs south')) {
                            url = `${API_BASE}/tournament/GetTournamentTeamsMatchesAsync?tournamentId=${event.id}&challengeId=6404918&language=en`;
                        }
                        const mData = await fetchWithCache(url, { signal });
                        const matches = (mData[0] && mData[0].Matches && mData[0].Matches.Matches) ? mData[0].Matches.Matches : (mData.Matches || []);

                        // Filter matches for THIS player AND only those already played
                        const filtered = matches.filter(m => {
                            const pId = internalId;
                            const isThisPlayer = (m.Challenger?.Player1Id === pId || m.Challenger?.Player2Id === pId ||
                                m.Challenged?.Player1Id === pId || m.Challenged?.Player2Id === pId);
                            // Only include in history if strictly played
                            return isThisPlayer && m.MatchResult?.IsPlayed;
                        });

                        const eventMatches = [];
                        // Normalize to match structure
                        filtered.forEach(m => {
                            // Format ISO date to DD/MM/YYYY HH:MM
                            let formattedDate = m.Date;
                            try {
                                const d = new Date(m.Date);

                                const day = String(d.getDate()).padStart(2, '0');
                                const month = String(d.getMonth() + 1).padStart(2, '0');
                                const year = d.getFullYear();
                                const hours = String(d.getHours()).padStart(2, '0');
                                const mins = String(d.getMinutes()).padStart(2, '0');
                                formattedDate = `${day}/${month}/${year} ${hours}:${mins}`;
                            } catch (e) { }

                            // Determine if Team 1 (Challenger) won
                            const winnerId = m.MatchResult?.WinnerParticipantId || m.MatchResult?.Score?.WinnerParticipantId;
                            let firstWon = false;

                            if (winnerId) {
                                firstWon = (m.Challenger?.Id == winnerId || m.Challenger?.EventParticipantId == winnerId || m.Challenger?.Player1Id == winnerId);
                            } else if (m.MatchResult?.Score) {
                                const scoreObj = m.MatchResult.Score;
                                if (scoreObj.FirstParticipantScore !== undefined && scoreObj.SecondParticipantScore !== undefined) {
                                    firstWon = scoreObj.FirstParticipantScore > scoreObj.SecondParticipantScore;
                                } else {
                                    firstWon = scoreObj.IsFirstParticipantWinner !== undefined ? scoreObj.IsFirstParticipantWinner : m.MatchResult.IsFirstParticipantWinner;
                                }
                            } else {
                                firstWon = m.MatchResult?.IsFirstParticipantWinner;
                            }

                            const pId = internalId;

                            // Check if the current player is on Team 1 or Team 2 and if their team won
                            const isOnTeam1 = (m.Challenger?.Player1Id === pId || m.Challenger?.Player2Id === pId);
                            const playerIsWinner = isOnTeam1 ? firstWon : !firstWon;

                            eventMatches.push({
                                Info: {
                                    EventName: event.event_name,
                                    Date: formattedDate,
                                    Challenger: {
                                        Name: m.Challenger?.Name,
                                        Id: m.Challenger?.Player1Id,
                                        IsWinner: firstWon
                                    },
                                    Challenger1: { Name: m.Challenger?.Player2Name, Id: m.Challenger?.Player2Id },
                                    Challenged: {
                                        Name: m.Challenged?.Name,
                                        Id: m.Challenged?.Player1Id,
                                        IsWinner: !firstWon
                                    },
                                    Challenged1: { Name: m.Challenged?.Player2Name, Id: m.Challenged?.Player2Id },
                                    Court: m.Court,
                                    Location: null,
                                    Venue: null,
                                    IsWinner: playerIsWinner // Add helper level winner flag
                                },
                                Score: {
                                    Score: (m.MatchResult?.Score?.DetailedScoring || []).map(ds => ({
                                        Score1: ds.FirstParticipantScore,
                                        Score2: ds.SecondParticipantScore
                                    }))
                                }
                            });
                        });
                        return eventMatches;
                    } catch (e) {
                        console.error(`Error fetching matches for event ${event.id}:`, e);
                        return [];
                    }
                });

                const results = await Promise.all(matchPromises);
                historyMatches.push(...results.flat());
                payload = historyMatches;
            }

            // Step 4: Save result to player_matches (ONLY for history)
            if (takeHistory) {
                supabase
                    .from('player_matches')
                    .upsert({
                        rankedin_id: rankedinId,
                        past_matches: payload,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'rankedin_id' })
                    .then(({ error }) => {
                        if (error) console.error("player_matches write error:", error);
                    });
            }

            return payload;
        } catch (err) {
            console.error('Error fetching player matches:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    }, [getAnonymousToken, getPlayerEventsAsync]);

    const getTournamentParticipants = useCallback(async (tournamentId, classId) => {
        try {
            const url = `${API_BASE}/tournament/GetPlayersForClassAsync?tournamentId=${tournamentId}&tournamentClassId=${classId}&language=en`;
            const data = await fetchWithCache(url, {}, 1000 * 60 * 2); // 2 minutes cache

            if (data.Teams && data.Teams.length > 0) {
                return data.Teams.map(team => ({ Participant: team }));
            }
            return data.Participants || [];
        } catch (err) {
            console.error('Error fetching tournament participants:', err);
            return [];
        }
    }, []);

    const getTournamentPlayerTabs = useCallback(async (tournamentId) => {
        try {
            const url = `${API_BASE}/tournament/GetPlayersTabAsync?id=${tournamentId}&language=en`;
            const data = await fetchWithCache(url, {}, 1000 * 60 * 2); // 2 minutes cache
            return data || [];
        } catch (err) {
            console.error('Error fetching tournament player tabs:', err);
            return [];
        }
    }, []);

    /**
     * Fetches live match results and standings for a team-based tournament challenge.
     * @param {string|number} challengeId 
     * @returns {Promise<Object>} Team tournament results
     */
    const getTeamTournamentResults = useCallback(async (challengeId) => {
        setLoading(true);
        setError(null);
        try {
            // First get the actual tournament ID from the challenge ID
            const tourData = await fetchWithCache(`${API_BASE}/tournament/GetTournamentForChallengeAsync?challengeId=${challengeId}`);
            const tournamentId = tourData.TournamentId;

            if (!tournamentId) throw new Error("Could not find tournament for challenge");

            // Fetch Matches
            const matchUrl = `${API_BASE}/tournament/GetTournamentTeamsMatchesAsync?tournamentId=${tournamentId}&challengeId=${challengeId}&language=en`;
            const matchData = await fetchWithCache(matchUrl);

            // Fetch Standings
            const standingsUrl = `${API_BASE}/tournament/GeTournamentTeamMatchStandingsAsync?tournamentId=${tournamentId}&challengeId=${challengeId}&language=en`;
            let team1 = null;
            let team2 = null;
            try {
                const standingsData = await fetchWithCache(standingsUrl);
                if (standingsData && standingsData.ScoresViewModels && standingsData.ScoresViewModels.length >= 2) {
                    team1 = standingsData.ScoresViewModels[0];
                    team2 = standingsData.ScoresViewModels[1];

                    // Ensure North is Team1
                    if (team1.ParticipantName.toLowerCase().includes('south')) {
                        const temp = team1;
                        team1 = team2;
                        team2 = temp;
                    }
                }
            } catch (e) {
                console.warn("Standings fetch failed during team tournament query:", e);
            }

            const rawMatches = (matchData[0] && matchData[0].Matches && matchData[0].Matches.Matches) ? matchData[0].Matches.Matches : [];

            const formattedMatches = rawMatches.map(m => {
                const team1Name = m.Challenger ? [m.Challenger.Name, m.Challenger.Player2Name].filter(Boolean).join(' / ') : '';
                const team2Name = m.Challenged ? [m.Challenged.Name, m.Challenged.Player2Name].filter(Boolean).join(' / ') : '';

                let scoreText = 'Upcoming';
                let winnerTeamId = null;
                let isFinished = false;

                if (m.MatchResult && m.MatchResult.IsPlayed) {
                    isFinished = true;
                    if (m.MatchResult.Score && Array.isArray(m.MatchResult.Score.DetailedScoring) && m.MatchResult.Score.DetailedScoring.length > 0) {
                        scoreText = m.MatchResult.Score.DetailedScoring.map(s => `${s.FirstParticipantScore}-${s.SecondParticipantScore}`).join(' ');
                    } else if (m.MatchResult.Score && m.MatchResult.Score.FirstParticipantScore !== undefined && m.MatchResult.Score.SecondParticipantScore !== undefined) {
                        scoreText = `${m.MatchResult.Score.FirstParticipantScore}-${m.MatchResult.Score.SecondParticipantScore}`;
                    } else {
                        scoreText = 'Played';
                    }

                    if (m.MatchResult.Score && m.MatchResult.Score.IsFirstParticipantWinner === true) {
                        winnerTeamId = team1 ? team1.ParticipantId : null;
                    } else if (m.MatchResult.Score && m.MatchResult.Score.IsFirstParticipantWinner === false) {
                        winnerTeamId = team2 ? team2.ParticipantId : null;
                    }
                } else if (m.MatchResult && m.MatchResult.Score && Array.isArray(m.MatchResult.Score.DetailedScoring) && m.MatchResult.Score.DetailedScoring.length > 0) {
                    scoreText = m.MatchResult.Score.DetailedScoring.map(s => `${s.FirstParticipantScore}-${s.SecondParticipantScore}`).join(' ');
                }

                let formattedDate = 'Upcoming';
                if (m.Date) {
                    const d = new Date(m.Date);
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const hours = String(d.getHours()).padStart(2, '0');
                    const mins = String(d.getMinutes()).padStart(2, '0');
                    formattedDate = `${day}/${month} ${hours}:${mins}`;
                }

                return {
                    Team1Players: team1Name,
                    Team2Players: team2Name,
                    Score: scoreText,
                    WinnerTeamId: winnerTeamId,
                    IsFinished: isFinished,
                    MatchDateFormatted: formattedDate,
                    CategoryName: 'Men-Doubles'
                };
            });

            return {
                Team1Id: team1 ? team1.ParticipantId : null,
                Team2Id: team2 ? team2.ParticipantId : null,
                Team1Score: team1 ? team1.Wins : 0,
                Team2Score: team2 ? team2.Wins : 0,
                Matches: formattedMatches
            };

        } catch (err) {
            console.error("Rankedin TeamTournament Results fetch error:", err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        loading,
        error,
        getRecentTournaments,
        getUpcomingOrganisationEvents,
        getTournamentClasses,
        getDrawsForClass,
        getTournamentDetails,
        getTournamentInfo,
        getOrganisationRankings,
        getPlayerEventsAsync,
        getTournamentWinners,
        getTournamentMatches,
        getTournamentParticipants,
        getTournamentPlayerTabs,
        getPlayerMatches,
        getTeamLeagueStandings,
        getTeamLeagueTeams,
        getTeamMatchResults,
        getTeamTournamentResults
    };
};


