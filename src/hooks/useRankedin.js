import { useState, useCallback } from 'react';

// Rankedin API Base URL
const API_BASE = 'https://api.rankedin.com/v1';
const SAPA_ORG_ID = '11331';

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
    const getOrganisationRankings = useCallback(async (rankingType, ageGroup, take = 10) => {
        setLoading(true);
        setError(null);
        try {
            // Hardcoded SAPA Ranking ID 15809 since it's the current main ranking system
            const rankingId = 15809;
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
                let status = 'Silver';
                if (n.includes('fip')) status = 'FIP event';
                else if (n.includes('super gold') || n.includes('s gold') || n.includes('sgold')) status = 'S Gold';
                else if (n.includes('major')) status = 'Major';
                else if (n.includes('gold')) status = 'Gold';
                else if (n.includes('key')) status = 'Key Event';

                return {
                    id: e.Id,
                    event_name: e.Name,
                    sapa_status: status,
                    start_date: e.StartDate,
                    end_date: e.EndDate || e.StartDate,
                    slug: e.Link ? e.Link.split('/').pop() : null,
                    eventId: e.Id // For EventCard external link logic
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

    return {
        loading,
        error,
        getRecentTournaments,
        getTournamentClasses,
        getDrawsForClass,
        getTournamentDetails,
        getOrganisationRankings,
        getPlayerEventsAsync
    };
};
