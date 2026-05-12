import { useState, useCallback } from 'react';

// Rankedin API Base URL
const API_BASE = 'https://api.rankedin.com/v1';
const SAPA_ORG_ID = '11331';

// Global cache for the anonymous token to avoid redundant fetches
let cachedAnonymousToken = null;

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
            const response = await fetch(
                `${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=true&Language=en&skip=0&take=${take}`
            );

            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);

            const data = await response.json();
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
            const response = await fetch(
                `${API_BASE}/teamleague/GetStandingsSectionAsync?teamleagueId=${teamleagueId}&poolid=${poolId}&language=en`
            );
            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);
            const data = await response.json();
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
            const response = await fetch(
                `${API_BASE}/teamleague/GetPoolTeamsAsync?poolid=${poolId}&language=en`
            );
            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);
            return await response.json();
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
            const response = await fetch(
                `${API_BASE}/teamleague/GetTeamLeagueTeamsMatchesAsync?teamMatchId=${teamMatchId}&language=en`
            );
            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);
            const data = await response.json();
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
            const response = await fetch(
                `${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=false&Language=en&skip=0&take=100`
            );

            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);

            const data = await response.json();
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
            const response = await fetch(
                `${API_BASE}/tournament/GetClassesAndDrawNamesAsync/?tournamentId=${tournamentId}`
            );

            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);

            const data = await response.json();
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
            const response = await fetch(
                `${API_BASE}/tournament/GetDrawsForStageAndStrengthAsync?tournamentClassId=${tournamentClassId}&drawStrength=${drawStrength}&drawStage=${drawStage}&isReadonly=true&language=en`
            );

            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);

            const data = await response.json();

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
            const finishedRes = await fetch(`${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=true&Language=en&skip=0&take=100`);
            const finishedData = await finishedRes.json();
            let tour = finishedData.payload?.find(t => t.eventId.toString() === tournamentId.toString());

            if (tour) return tour;

            // Check upcoming/ongoing events
            const upcomingRes = await fetch(`${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=false&Language=en&skip=0&take=100`);
            const upcomingData = await upcomingRes.json();
            tour = upcomingData.payload?.find(t => t.eventId.toString() === tournamentId.toString());

            return tour || null;
        } catch (err) {
            console.error('Error fetching tournament details:', err);
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
            const response = await fetch(
                `${API_BASE}/Ranking/GetRankingsAsync?rankingId=${rankingId}&rankingType=${rankingType}&ageGroup=${ageGroup}&weekFromNow=0&language=en&skip=0&take=${take}`
            );

            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);

            const data = await response.json();
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
    const getPlayerEventsAsync = useCallback(async (playerId) => {
        if (!playerId) return [];
        setLoading(true);
        setError(null);
        try {
            // Step 1: Get internal PlayerId from string ID (e.g. R000328907)
            const profileRes = await fetch(`${API_BASE}/player/playerprofileinfoasync?rankedinId=${playerId}&language=en`);
            if (!profileRes.ok) throw new Error(`Rankedin Profile API Error: ${profileRes.status}`);
            const profileData = await profileRes.json();
            const internalId = profileData.Header?.PlayerId;

            if (!internalId) throw new Error("Could not extract internal PlayerId");

            // Step 2: Fetch events using internal ID
            const eventsRes = await fetch(
                `${API_BASE}/player/ParticipatedEventsAsync?playerId=${internalId}&language=en&skip=0&take=100`
            );

            if (!eventsRes.ok) throw new Error(`Rankedin Events API Error: ${eventsRes.status}`);

            const data = await eventsRes.json();
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

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);

            const data = await response.json();
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
                            const finalCell = finalRound.length > 0 ? finalRound[0] : null;

                            
                            if (finalCell) {
                                const m = finalCell.MatchCell || finalCell.MatchViewModel || finalCell;
                                const scoreObj = m.MatchResults?.Score || m.MatchViewModel?.Score || m.Score || finalCell.Score;
                                const winnerId = m.MatchResults?.WinnerParticipantId || m.MatchViewModel?.WinnerParticipantId || m.WinnerParticipantId || finalCell.WinnerParticipantId;
                                
                                const p1 = finalCell.ChallengerParticipant || m.ChallengerParticipant;
                                const p2 = finalCell.ChallengedParticipant || m.ChallengedParticipant;

                                // Robust detection: Winner ID or Boolean flag
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
                                
                                if (winningParticipant) {
                                    let winnerNames = winningParticipant.Name;
                                    if (!winnerNames && winningParticipant.FirstPlayer) {
                                        winnerNames = winningParticipant.FirstPlayer.Name;
                                        if (winningParticipant.SecondPlayer) winnerNames += ` & ${winningParticipant.SecondPlayer.Name}`;
                                    }

                                    if (winnerNames) {
                                        winnersList.push({
                                            className: cls.Name,
                                            drawName: draw.Name,
                                            winners: winnerNames
                                        });
                                    }
                                }
                            }
                        } else if (drawData.some(d => d.BaseType === 'RoundRobin')) {
                            // Simple RoundRobin detection if available
                            const rr = drawData.find(d => d.BaseType === 'RoundRobin')?.RoundRobin;
                            if (rr && rr.Ranking && rr.Ranking.length > 0) {
                                const top = rr.Ranking[0];
                                let winnerNames = top.ParticipantName;
                                if (winnerNames) {
                                    winnersList.push({
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
            const res = await fetch(`${API_BASE}/player/getlayoutinfoasync?language=en`);
            if (res.ok) {
                const data = await res.json();
                if (data.AnonymousToken) {
                    cachedAnonymousToken = data.AnonymousToken;
                    return cachedAnonymousToken;
                }
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
    /**
     * Fetches match history for a specific player by their Rankedin ID.
     * @param {string} rankedinId Rankedin Player ID (e.g. R000328907)
     * @param {boolean} takeHistory Whether to fetch past matches (true) or upcoming (false)
     * @param {number} take Number of matches to fetch
     * @returns {Promise<Array>} Array of matches
     */
    const getPlayerMatches = useCallback(async (rankedinId, takeHistory = true, take = 20) => {
        if (!rankedinId) return [];
        setLoading(true);
        setError(null);
        try {
            // Step 1: Get internal PlayerId
            const profileRes = await fetch(`${API_BASE}/player/playerprofileinfoasync?rankedinId=${rankedinId}&language=en`);
            if (!profileRes.ok) throw new Error(`Rankedin Profile API Error: ${profileRes.status}`);
            const profileData = await profileRes.json();
            const internalId = profileData.Id || profileData.Header?.PlayerId;

            if (!internalId) throw new Error("Could not extract internal PlayerId");

            // Step 2: Get token for real data
            const token = await getAnonymousToken();

            // Step 3: Fetch matches
            // NOTE: takehistory=true often returns placeholders for anonymous users.
            // We use this for "Upcoming" (false) as it works well, but we'll try it for history too.
            const response = await fetch(
                `${API_BASE}/player/GetPlayerMatchesAsync?playerid=${internalId}&takehistory=${takeHistory}&skip=0&take=${take}&language=en`,
                {
                    headers: {
                        ...(token ? { 'x-anonymous-token': token } : {}),
                        'Accept': 'application/json'
                    }
                }
            );

            if (!response.ok) throw new Error(`Rankedin Matches API Error: ${response.status}`);

            const data = await response.json();
            const payload = data.Payload || [];

            // If we're fetching history and only got placeholders, use the tournament fallback
            const isPlaceholder = payload.length > 0 && payload.every(m => m.Info?.EventName === 'EventName');
            
            if (takeHistory && (payload.length === 0 || isPlaceholder)) {
                // FALLBACK: Fetch events and then their matches
                const events = await getPlayerEventsAsync(rankedinId);
                const now = new Date();
                const pastEvents = events
                    .filter(e => new Date(e.start_date) < now)
                    .sort((a,b) => new Date(b.start_date) - new Date(a.start_date))
                    .slice(0, 5); // Limit to last 5 tournaments to avoid too many requests

                const historyMatches = [];
                for (const event of pastEvents) {
                    try {
                        const url = `${API_BASE}/tournament/GetMatchesSectionAsync?Id=${event.id}&LanguageCode=en&IsReadonly=true`;
                        const res = await fetch(url);
                        if (!res.ok) continue;
                        const mData = await res.json();
                        const matches = mData.Matches || [];
                        
                        // Filter matches for THIS player AND only those already played
                        const filtered = matches.filter(m => {
                            const pId = internalId;
                            const isThisPlayer = (m.Challenger?.Player1Id === pId || m.Challenger?.Player2Id === pId ||
                                                m.Challenged?.Player1Id === pId || m.Challenged?.Player2Id === pId);
                            // Only include in history if strictly played
                            return isThisPlayer && m.MatchResult?.IsPlayed;
                        });

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
                            } catch (e) {}

                            // Determine if Team 1 (Challenger) won
                            const winnerId = m.MatchResult?.WinnerParticipantId || m.MatchResult?.Score?.WinnerParticipantId;
                            let firstWon = false;
                            
                            if (winnerId) {
                                firstWon = (m.Challenger?.Id == winnerId || m.Challenger?.EventParticipantId == winnerId || m.Challenger?.Player1Id == winnerId);
                            } else {
                                firstWon = m.MatchResult?.IsFirstParticipantWinner || m.MatchResult?.Score?.IsFirstParticipantWinner;
                            }

                            const pId = internalId;
                            
                            // Check if the current player is on Team 1 or Team 2 and if their team won
                            const isOnTeam1 = (m.Challenger?.Player1Id === pId || m.Challenger?.Player2Id === pId);
                            const playerIsWinner = isOnTeam1 ? firstWon : !firstWon;

                            historyMatches.push({
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
                    } catch (e) {
                        console.error(`Error fetching matches for event ${event.id}:`, e);
                    }
                }
                return historyMatches;
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
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);
            const data = await response.json();
            
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
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);
            const data = await response.json();
            return data || [];
        } catch (err) {
            console.error('Error fetching tournament player tabs:', err);
            return [];
        }
    }, []);

    /**
     * Fetches live match results and standings for a team-based tournament.
     * @param {string|number} tournamentId 
     * @returns {Promise<Object>} Team tournament results
     */
    const getTeamTournamentResults = useCallback(async (tournamentId) => {
        setLoading(true);
        setError(null);
        try {
            const url = 'https://www.rankedin.com/team/GetTeamTournamentMatchResultsAsync';
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `teamTournamentId=${tournamentId}`
            });

            if (!response.ok) throw new Error(`Rankedin API Error: ${response.status}`);
            return await response.json();
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


