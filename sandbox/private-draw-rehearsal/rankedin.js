const unavailable = async () => { throw new Error('Live RankedIn refresh is disabled in private rehearsal. Use a saved player ranking source.'); };
export const useRankedin = () => ({ getTournamentParticipants: unavailable });
