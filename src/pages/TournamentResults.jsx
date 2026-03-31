import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { SEOHead } from '@burkcorp/reactmath';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Search, X, Trophy, Filter } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useRankedin } from '../hooks/useRankedin';
import resultsHero from '../assets/results_hero.png';

const TournamentResults = () => {
    const { id: idOrSlug } = useParams();
    const navigate = useNavigate();
    const { getTournamentMatches, getTournamentDetails, loading: apiLoading, error } = useRankedin();

    const [resolvedId, setResolvedId] = useState(null);
    const [lookupLoading, setLookupLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [matches, setMatches] = useState([]);
    const [tournamentDetails, setTournamentDetails] = useState(null);
    const [divisionFilter, setDivisionFilter] = useState('All');

    // Resolve slug to RankedIn ID if necessary
    useEffect(() => {
        const resolveId = async () => {
            if (/^\d+$/.test(idOrSlug)) {
                setResolvedId(idOrSlug);
                setLookupLoading(false);
                return;
            }

            try {
                const { data, error: sbError } = await supabase
                    .from('calendar')
                    .select('rankedin_url')
                    .eq('slug', idOrSlug)
                    .single();

                if (sbError) throw sbError;

                let rId = null;
                if (data.rankedin_url) {
                    const match = data.rankedin_url.match(/tournament\/(\d+)/i);
                    if (match) rId = match[1];
                }

                if (rId) {
                    setResolvedId(rId);
                } else {
                    console.error('Could not find RankedIn ID for slug:', idOrSlug);
                }
            } catch (err) {
                console.error('Error resolving slug:', err);
            } finally {
                setLookupLoading(false);
            }
        };
        resolveId();
    }, [idOrSlug]);

    const loading = lookupLoading || apiLoading;

    // Initial fetch for tournament details
    useEffect(() => {
        if (!resolvedId) return;
        const fetchTournamentDetails = async () => {
            const details = await getTournamentDetails(resolvedId);
            if (details) setTournamentDetails(details);
        };
        fetchTournamentDetails();
    }, [resolvedId, getTournamentDetails]);

    // Fetch all matches 
    useEffect(() => {
        if (!resolvedId) return;

        const fetchMatches = async () => {
            const data = await getTournamentMatches({
                tournamentId: resolvedId
                // Passing nothing else to get all results
            });
            setMatches(data);
        };
        fetchMatches();
    }, [resolvedId, getTournamentMatches]);

    const uniqueDivisions = useMemo(() => {
        const divs = matches.map(m => m.TournamentClassName).filter(Boolean);
        return ['All', ...new Set(divs)].sort();
    }, [matches]);

    // Client-side search and division filtering
    const filteredMatches = useMemo(() => {
        let result = matches;
        
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(m => 
                (m.Challenger?.Name?.toLowerCase().includes(term) || m.Challenger?.Player2Name?.toLowerCase().includes(term)) ||
                (m.Challenged?.Name?.toLowerCase().includes(term) || m.Challenged?.Player2Name?.toLowerCase().includes(term)) ||
                m.TournamentClassName?.toLowerCase().includes(term)
            );
        }

        if (divisionFilter !== 'All') {
            result = result.filter(m => m.TournamentClassName === divisionFilter);
        }

        return result;
    }, [matches, searchTerm, divisionFilter]);

    const renderParticipant = (participant, isWinner) => {
        if (!participant) return null;
        return (
            <div className="flex flex-col min-w-0">
                <span className={`font-bold text-sm tracking-tight truncate ${isWinner ? 'text-white' : 'text-gray-400'}`}>
                    {participant.Name}
                </span>
                {participant.Player2Name && (
                    <span className={`font-bold text-sm tracking-tight truncate -mt-1 ${isWinner ? 'text-white' : 'text-gray-400'}`}>
                        {participant.Player2Name}
                    </span>
                )}
                <span className="text-[9px] text-gray-600 font-medium uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                    Rankedin #{participant.Id}
                </span>
            </div>
        );
    };

    const renderScore = (m) => {
        const isPlayed = m.MatchResult?.IsPlayed;
        const score = m.MatchResult?.Score;
        
        if (!isPlayed || !score) {
            return (
                <div className="flex flex-col items-end opacity-50 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest whitespace-nowrap">Scheduled</span>
                    <span className="text-[8px] text-gray-500 font-bold uppercase truncate max-w-[80px]">{m.Court || 'No Court'}</span>
                </div>
            );
        }
        const winnerId = m.MatchResult?.WinnerParticipantId || m.MatchResult?.Score?.WinnerParticipantId;
        let p1Wins = false;
        let p2Wins = false;

        if (winnerId) {
            p1Wins = (m.Challenger?.Id == winnerId || m.Challenger?.EventParticipantId == winnerId || m.Challenger?.Player1Id == winnerId);
            p2Wins = (m.Challenged?.Id == winnerId || m.Challenged?.EventParticipantId == winnerId || m.Challenged?.Player1Id == winnerId);
        } else {
            p1Wins = score.IsFirstParticipantWinner;
            p2Wins = !p1Wins;
        }

        return (
            <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5 h-8">
                    <span className={`text-[13px] font-black h-8 w-8 flex items-center justify-center rounded-lg border ${p1Wins ? 'bg-padel-green text-black border-padel-green' : 'bg-white/5 text-white border-white/5'}`}>
                        {score.FirstParticipantScore ?? '-'}
                    </span>
                    <span className={`text-[13px] font-black h-8 w-8 flex items-center justify-center rounded-lg border ${p2Wins ? 'bg-padel-green text-black border-padel-green' : 'bg-white/5 text-white border-white/5'}`}>
                        {score.SecondParticipantScore ?? '-'}
                    </span>
                </div>
                {score.DetailedScoring && score.DetailedScoring.length > 0 && (
                    <div className="flex gap-1.5 pr-0.5">
                        {score.DetailedScoring.map((s, i) => (
                            <span key={i} className="text-[10px] text-gray-500 font-bold">
                                {s.FirstParticipantScore}-{s.SecondParticipantScore}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <SEOHead
                title={`${tournamentDetails?.eventName || 'Tournament'} Results | 4M Padel`}
                description="View live tournament match results and scores."
            />

            <main className="min-h-screen bg-[#0F172A] pb-20">
                {/* Hero Section */}
                <div className="relative h-[45vh] min-h-[400px] w-full overflow-hidden bg-slate-900 flex items-center justify-center">
                    <img
                        src={`https://rankedin-prod-cdn-adavg8d3dwfegkbd.z01.azurefd.net/images/upload/tournament/${resolvedId}.png`}
                        alt="Tournament Hero"
                        className="absolute inset-0 w-full h-full object-cover opacity-60 contrast-125 saturate-50"
                        onError={(e) => { e.target.src = resultsHero; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-[#0F172A]" />

                    {/* Background Big Text */}
                    <div className="relative z-10 w-full overflow-hidden select-none pointer-events-none translate-y-1/3">
                        <motion.h1
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-[120px] md:text-[220px] font-black text-white/[0.07] uppercase leading-none whitespace-nowrap text-center tracking-tighter"
                        >
                            {tournamentDetails ? tournamentDetails.eventName.split(' ').slice(0, 3).join(' ') : 'RESULTS'}
                        </motion.h1>
                    </div>

                    <div className="absolute top-24 left-4 md:left-6 z-10">
                        <Link
                            to="/calendar"
                            className="bg-white/10 backdrop-blur-md text-padel-green p-2 rounded-full hover:bg-padel-green hover:text-black transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                    </div>

                    <div className="absolute bottom-12 left-0 w-full px-6 flex flex-col items-center text-center z-20">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="flex items-center gap-1.5 text-[10px] font-black text-padel-green bg-padel-green/10 border border-padel-green/20 px-4 py-1.5 rounded-full uppercase tracking-widest">
                                <Trophy className="w-3.5 h-3.5" />
                                Matches Results
                            </span>
                        </div>
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-3xl md:text-6xl font-black text-white tracking-tighter uppercase max-w-5xl drop-shadow-2xl"
                        >
                            {tournamentDetails ? tournamentDetails.eventName : 'Tournament Results'}
                        </motion.h1>
                    </div>
                </div>

                <div className="container mx-auto px-4 md:px-6 max-w-7xl pt-12 relative z-30">
                    <div className="flex flex-col md:flex-row items-center gap-4 bg-[#131C2F]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-3 md:p-4 mb-8 shadow-2xl sticky top-4 z-40">
                        {/* Search Input */}
                        <div className="relative group flex-1 w-full">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-padel-green transition-colors">
                                <Search size={18} />
                            </div>
                            <input
                                type="text"
                                placeholder="Search players or classes..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-[#0B1221] border border-white/10 text-white rounded-2xl pl-12 pr-12 py-3.5 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all shadow-inner text-sm font-medium"
                            />
                            {searchTerm && (
                                <button 
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        {/* Division Filter */}
                        <div className="relative w-full md:w-64">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green pointer-events-none">
                                <Filter size={18} />
                            </div>
                            <select
                                value={divisionFilter}
                                onChange={(e) => setDivisionFilter(e.target.value)}
                                className="w-full bg-[#0B1221] border border-white/10 text-white rounded-2xl pl-12 pr-10 py-3.5 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all appearance-none cursor-pointer text-sm font-medium"
                            >
                                {uniqueDivisions.map(div => (
                                    <option key={div} value={div} className="bg-[#0B1221]">
                                        {div === 'All' ? 'All Divisions' : div}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Results Table Area */}
                    <div className="space-y-4">
                        {loading && (
                            <div className="flex flex-col items-center justify-center py-32 bg-[#0B1221] rounded-3xl border border-white/5">
                                <Loader2 className="w-12 h-12 text-padel-green animate-spin mb-4" />
                                <p className="text-gray-400 font-medium tracking-wide">Syncing match data...</p>
                            </div>
                        )}

                        {!loading && error && (
                            <div className="text-center py-20 bg-red-500/5 rounded-3xl border border-red-500/10 text-red-400 font-medium">
                                Unable to fetch latest matches.
                            </div>
                        )}

                        {!loading && !error && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col gap-4"
                            >
                                {filteredMatches.length === 0 && (
                                    <div className="py-24 text-center bg-[#0B1221] rounded-3xl border border-white/5">
                                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Search className="text-gray-600" size={24} />
                                        </div>
                                        <p className="text-gray-400 font-medium">No results found for "{searchTerm}"</p>
                                        <button 
                                            onClick={() => setSearchTerm('')}
                                            className="mt-4 text-padel-green text-xs font-bold uppercase tracking-widest hover:underline"
                                        >
                                            Clear search
                                        </button>
                                    </div>
                                )}

                                {/* Desktop Table Headers */}
                                {filteredMatches.length > 0 && (
                                    <div className="hidden lg:grid lg:grid-cols-12 items-center px-10 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-white/5 mb-4">
                                        <div className="col-span-11 grid grid-cols-11 items-center gap-4">
                                            <div className="col-span-4 pl-4">Participants</div>
                                            <div className="col-span-1 text-center font-normal opacity-50">vs</div>
                                            <div className="col-span-4 pl-4 text-right pr-12">Participants</div>
                                            <div className="col-span-2">Match Info</div>
                                        </div>
                                        <div className="col-span-1 text-right pr-4">Result</div>
                                    </div>
                                )}

                                {filteredMatches.map((m, idx) => {
                                    const score = m.MatchResult?.Score;
                                    const winnerId = m.MatchResult?.WinnerParticipantId || m.MatchResult?.Score?.WinnerParticipantId;
                                    let p1Wins = false;
                                    let p2Wins = false;

                                    if (winnerId) {
                                        p1Wins = (m.Challenger?.Id == winnerId || m.Challenger?.EventParticipantId == winnerId || m.Challenger?.Player1Id == winnerId);
                                        p2Wins = (m.Challenged?.Id == winnerId || m.Challenged?.EventParticipantId == winnerId || m.Challenged?.Player1Id == winnerId);
                                    } else {
                                        p1Wins = score?.IsFirstParticipantWinner;
                                        p2Wins = !p1Wins && m.MatchResult?.IsPlayed;
                                    }
                                    
                                    return (
                                        <motion.div
                                            key={m.Id || idx}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.03 }}
                                            className="group bg-[#131C2F]/40 hover:bg-[#131C2F] border border-white/5 md:border-white/[0.03] rounded-3xl p-6 lg:px-6 lg:py-2.5 transition-all duration-300 shadow-lg hover:shadow-padel-green/5"
                                        >
                                            {/* Mobile View: Stacked Card */}
                                            <div className="flex flex-col lg:hidden gap-5">
                                                <div className="flex justify-between items-center bg-white/5 p-3.5 rounded-2xl border border-white/5">
                                                    <div className="flex flex-col flex-1 min-w-0 pr-2">
                                                        <span className={`text-sm font-bold truncate ${p1Wins ? 'text-white' : 'text-gray-400'}`}>
                                                            {m.Challenger?.Name}
                                                        </span>
                                                        {m.Challenger?.Player2Name && (
                                                            <span className={`text-sm font-bold truncate -mt-0.5 ${p1Wins ? 'text-white' : 'text-gray-400'}`}>
                                                                {m.Challenger.Player2Name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`text-xl font-black w-12 h-12 flex items-center justify-center rounded-xl bg-slate-900 border border-white/10 ${p1Wins ? 'text-padel-green ring-1 ring-padel-green/30' : 'text-gray-600'}`}>
                                                        {score?.FirstParticipantScore ?? '-'}
                                                    </span>
                                                </div>

                                                <div className="flex justify-center -my-3 relative z-10">
                                                    <span className="bg-slate-900 text-[10px] font-black text-gray-700 px-3 py-1 rounded-full border border-white/5 italic">vs</span>
                                                </div>

                                                <div className="flex justify-between items-center bg-white/5 p-3.5 rounded-2xl border border-white/5">
                                                    <div className="flex flex-col flex-1 min-w-0 pr-2">
                                                        <span className={`text-sm font-bold truncate ${p2Wins ? 'text-white' : 'text-gray-400'}`}>
                                                            {m.Challenged?.Name}
                                                        </span>
                                                        {m.Challenged?.Player2Name && (
                                                            <span className={`text-sm font-bold truncate -mt-0.5 ${p2Wins ? 'text-white' : 'text-gray-400'}`}>
                                                                {m.Challenged.Player2Name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`text-xl font-black w-12 h-12 flex items-center justify-center rounded-xl bg-slate-900 border border-white/10 ${p2Wins ? 'text-padel-green ring-1 ring-padel-green/30' : 'text-gray-600'}`}>
                                                        {score?.SecondParticipantScore ?? '-'}
                                                    </span>
                                                </div>

                                                {score?.DetailedScoring && score.DetailedScoring.length > 0 && (
                                                    <div className="flex justify-center gap-2 mt-1">
                                                        {score.DetailedScoring.map((s, i) => (
                                                            <span key={i} className="text-xs text-gray-500 font-bold px-2 py-1 bg-white/5 rounded-md border border-white/5">
                                                                {s.FirstParticipantScore}-{s.SecondParticipantScore}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                                                    <div className="flex flex-col p-2 bg-white/[0.02] rounded-xl">
                                                        <span className="text-[8px] text-gray-500 font-black uppercase tracking-widest mb-1">Details</span>
                                                        <span className="text-[10px] text-gray-300 font-bold truncate">{m.TournamentClassName}</span>
                                                        <span className="text-[9px] text-gray-500 font-medium">{m.TournamentDrawName || m.Draw}</span>
                                                    </div>
                                                    <div className="flex flex-col p-2 bg-white/[0.02] rounded-xl">
                                                        <span className="text-[8px] text-gray-500 font-black uppercase tracking-widest mb-1">Schedule</span>
                                                        <span className="text-[10px] text-gray-300 font-bold">{m.Date ? new Date(m.Date).toLocaleDateString('en-GB') : 'TBD'}</span>
                                                        <span className="text-[9px] text-gray-500 font-medium">{m.Court || 'Court TBD'}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Desktop View: Horizontal Row */}
                                            <div className="hidden lg:grid lg:grid-cols-12 items-center gap-0 w-full">
                                                <div className="col-span-11 grid grid-cols-11 items-center gap-4">
                                                    {/* Challenger */}
                                                    <div className="col-span-4 flex items-center justify-end pr-4 text-right">
                                                        {renderParticipant(m.Challenger, p1Wins)}
                                                    </div>

                                                    {/* VS */}
                                                    <div className="col-span-1 flex justify-center">
                                                        <span className="text-[10px] font-black text-gray-700 italic px-2 py-0.5 bg-white/5 rounded-full border border-white/5">vs</span>
                                                    </div>

                                                    {/* Challenged */}
                                                    <div className="col-span-4 flex items-center pl-4">
                                                        {renderParticipant(m.Challenged, p2Wins)}
                                                    </div>

                                                    {/* Metadata */}
                                                    <div className="col-span-2 flex flex-col items-start gap-0.5 border-l border-white/5 pl-4 overflow-hidden">
                                                        <span className="text-[10px] font-black text-padel-green truncate w-full uppercase tracking-tighter">
                                                            {m.TournamentClassName}
                                                        </span>
                                                        <div className="flex items-center gap-2 text-[9px] text-gray-500 font-bold whitespace-nowrap">
                                                            <span>{m.TournamentDrawName || m.Draw}</span>
                                                            {m.Date && (
                                                                <>
                                                                    <span className="text-gray-700 mx-1">•</span>
                                                                    <span>{new Date(m.Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Score / Result */}
                                                <div className="col-span-1 flex items-center justify-end">
                                                    {renderScore(m)}
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </motion.div>
                        )}
                    </div>
                </div>
            </main>
        </>
    );
};

export default TournamentResults;
