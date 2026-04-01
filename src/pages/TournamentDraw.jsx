import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { SEOHead } from '@burkcorp/reactmath';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2, ChevronDown, GitBranch, Search, X, Trophy, Filter, Calendar } from 'lucide-react';
import Navbar from '../components/Navbar';
import { supabase } from '../supabaseClient';
import { useRankedin } from '../hooks/useRankedin';
import KnockoutBracket from '../components/KnockoutBracket';

const TournamentDraw = () => {
    const { id: idOrSlug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { getTournamentClasses, getDrawsForClass, getTournamentDetails, getTournamentMatches, loading: apiLoading, error } = useRankedin();

    const [resolvedId, setResolvedId] = useState(null);
    const [lookupLoading, setLookupLoading] = useState(true);
    const [classes, setClasses] = useState([]);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedDrawId, setSelectedDrawId] = useState('');
    const [drawData, setDrawData] = useState(null);
    const [tournamentDetails, setTournamentDetails] = useState(null);

    // New State for Results & Matches
    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 1024 : false;
    const initialTab = location.pathname.includes('/results') ? 'matches' : (isMobile ? 'match-list' : 'brackets');
    const [activeTab, setActiveTab] = useState(initialTab);
    const [searchTerm, setSearchTerm] = useState('');
    const [matches, setMatches] = useState([]);
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

    // Initial fetch for the classes mapping to this tournament ID
    useEffect(() => {
        if (!resolvedId) return;
        const fetchClasses = async () => {
            const data = await getTournamentClasses(resolvedId);
            setClasses(data);
            if (data && data.length > 0) {
                setSelectedClassId(data[0].Id);
            }
        };
        fetchClasses();
    }, [resolvedId, getTournamentClasses]);

    // When class changes, default to the last draw (Knockout if available)
    useEffect(() => {
        if (!selectedClassId || classes.length === 0) return;
        const activeClass = classes.find(c => c.Id.toString() === selectedClassId.toString());
        if (activeClass && activeClass.TournamentDraws && activeClass.TournamentDraws.length > 0) {
            setSelectedDrawId(activeClass.TournamentDraws[activeClass.TournamentDraws.length - 1].Id.toString());
        } else {
            setSelectedDrawId('');
            setDrawData(null);
        }
    }, [selectedClassId, classes]);

    // Fetch all matches for tournament-wide results (Matches tab)
    // Fetch all matches for tournament-wide results (Matches tab)
    useEffect(() => {
        if (!resolvedId) return;
        const fetchMatches = async () => {
            const data = await getTournamentMatches({ tournamentId: resolvedId });
            setMatches(data || []);
        };
        fetchMatches();
    }, [resolvedId, getTournamentMatches]);

    // Fetch draw data when class or draw changes
    useEffect(() => {
        if (!selectedClassId || !selectedDrawId || classes.length === 0) return;
        const activeClass = classes.find(c => c.Id.toString() === selectedClassId.toString());
        if (!activeClass) return;
        const activeDraw = activeClass.TournamentDraws?.find(d => d.Id.toString() === selectedDrawId.toString());
        const fetchDraw = async () => {
            const data = await getDrawsForClass(
                selectedClassId,
                activeDraw ? activeDraw.Stage : 0,
                activeDraw ? activeDraw.Strength : 0
            );
            setDrawData(data);
        };
        fetchDraw();
    }, [selectedClassId, selectedDrawId, classes, getDrawsForClass]);

    // Derived State for filtering (Matches tab)
    const uniqueDivisions = useMemo(() => {
        const divs = matches.map(m => m.TournamentClassName).filter(Boolean);
        return ['All', ...new Set(divs)].sort();
    }, [matches]);

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

    // Rendering Helpers for Matches Table (Original results UI)
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
                    <span className={`text-[13px] font-black h-8 w-8 flex items-center justify-center rounded-lg border ${p1Wins ? 'bg-padel-green text-black border-padel-green shadow-[0_0_10px_rgba(154,233,0,0.3)]' : 'bg-white/5 text-white border-white/5'}`}>
                        {score.FirstParticipantScore ?? '-'}
                    </span>
                    <span className={`text-[13px] font-black h-8 w-8 flex items-center justify-center rounded-lg border ${p2Wins ? 'bg-padel-green text-black border-padel-green shadow-[0_0_10px_rgba(154,233,0,0.3)]' : 'bg-white/5 text-white border-white/5'}`}>
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

    const activeClass = classes.find(c => c.Id.toString() === selectedClassId.toString());
    const availableDraws = activeClass?.TournamentDraws || [];

    return (
        <>
            <SEOHead
                title={`${tournamentDetails?.eventName || 'Tournament'} Draw | 4M Padel`}
                description="View live tournament draws and knockout brackets."
            />


            <main className="min-h-screen bg-[#0F172A] pb-20">
                {/* Hero */}
                <div className="relative h-[20vh] md:h-[30vh] min-h-[250px] w-full overflow-hidden bg-slate-900 flex items-center justify-center">
                    <img
                        src={`https://rankedin-prod-cdn-adavg8d3dwfegkbd.z01.azurefd.net/images/upload/tournament/${resolvedId}.png`}
                        alt="Tournament Hero"
                        className="absolute inset-0 w-full h-full object-cover opacity-60 contrast-125 saturate-50"
                        onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1554068865-c7211fa4d4ab?q=80&w=1470&auto=format&fit=crop'; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-[#0F172A]" />

                    <div className="relative z-10 w-full overflow-hidden select-none pointer-events-none translate-y-1/4">
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-[80px] md:text-[180px] font-black text-white/[0.07] uppercase leading-none whitespace-nowrap text-center tracking-tighter"
                        >
                            {tournamentDetails ? tournamentDetails.eventName.split(' ').slice(0, 3).join(' ') : 'Draw'}
                        </motion.h1>
                    </div>

                    <div className="absolute top-24 left-6 z-20">
                        <button
                            onClick={() => navigate(-1)}
                            className="bg-white/10 backdrop-blur-md text-padel-green p-2 rounded-full hover:bg-padel-green hover:text-black transition-colors"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="absolute bottom-10 left-0 w-full px-6 flex flex-col items-center text-center">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="flex items-center gap-1.5 text-[10px] font-bold text-padel-green bg-padel-green/10 border border-padel-green/20 px-3 py-1 rounded-full uppercase tracking-widest">
                                <GitBranch className="w-3 h-3" />
                                Live Draw
                            </span>
                        </div>
                        <motion.h1
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter uppercase font-display max-w-5xl"
                        >
                            {tournamentDetails ? tournamentDetails.eventName : 'Tournament Draw'}
                        </motion.h1>
                    </div>
                </div>

                <div className="container mx-auto px-4 md:px-6 max-w-7xl pt-12">
                    {/* Tab Switcher */}
                    <div className="flex justify-center mb-12">
                        <div className="inline-flex bg-[#131C2F]/80 p-1.5 rounded-3xl border border-white/5 shadow-2xl backdrop-blur-xl">
                            {[
                                { id: 'match-list', label: 'Match List' },
                                { id: 'brackets', label: 'Bracket' },
                                { id: 'matches', label: 'Matches' }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-8 md:px-12 py-3 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all duration-500 relative ${
                                        activeTab === tab.id 
                                            ? 'text-black z-10' 
                                            : 'text-gray-500 hover:text-white'
                                    }`}
                                >
                                    {activeTab === tab.id && (
                                        <motion.div
                                            layoutId="activeTabGlow"
                                            className="absolute inset-0 bg-padel-green rounded-2xl -z-10 shadow-[0_0_20px_rgba(154,233,0,0.4)]"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        {activeTab === 'matches' ? (
                            <motion.div
                                key="matches"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-8"
                            >
                                {/* Results/Matches Filters - ORIGINAL UI */}
                                <div className="flex flex-col md:flex-row items-center gap-4 bg-[#131C2F]/80 backdrop-blur-xl border border-white/5 rounded-[2rem] p-4 shadow-2xl">
                                    <div className="relative group flex-1 w-full">
                                        <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-padel-green transition-colors" />
                                        <input
                                            type="text"
                                            placeholder="Search players or classes..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full bg-[#0B1221] border border-white/10 text-white rounded-2xl pl-14 pr-12 py-4 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green/30 transition-all font-bold text-sm"
                                        />
                                        {searchTerm && (
                                            <button onClick={() => setSearchTerm('')} className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={18} /></button>
                                        )}
                                    </div>

                                    <div className="relative w-full md:w-72">
                                        <Filter size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-padel-green pointer-events-none" />
                                        <select
                                            value={divisionFilter}
                                            onChange={(e) => setDivisionFilter(e.target.value)}
                                            className="w-full bg-[#0B1221] border border-white/10 text-white rounded-2xl pl-14 pr-12 py-4 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green/30 transition-all appearance-none cursor-pointer font-bold text-sm"
                                        >
                                            {uniqueDivisions.map(div => (
                                                <option key={div} value={div}>{div === 'All' ? 'All Divisions' : div}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {loading && (
                                        <div className="flex flex-col items-center justify-center py-40">
                                            <Loader2 className="w-12 h-12 text-padel-green animate-spin mb-6" />
                                            <p className="text-gray-500 font-black uppercase tracking-[0.2em] text-xs">Syncing match data...</p>
                                        </div>
                                    )}

                                    {!loading && filteredMatches.length === 0 && (
                                        <div className="py-40 text-center bg-[#131C2F]/40 rounded-[2.5rem] border border-white/5">
                                            <Search className="w-16 h-16 text-gray-700 mx-auto mb-6" />
                                            <p className="text-white font-bold text-xl mb-2">No matches found</p>
                                            <p className="text-gray-500 text-sm">Try adjusting your search or filters.</p>
                                        </div>
                                    )}

                                    {!loading && filteredMatches.length > 0 && (
                                        <div className="flex flex-col gap-4">
                                            {/* Desktop Table Headers */}
                                            <div className="hidden lg:grid lg:grid-cols-12 items-center px-10 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-white/5 mb-4">
                                                <div className="col-span-11 grid grid-cols-11 items-center gap-4">
                                                    <div className="col-span-4 pl-4">Participants</div>
                                                    <div className="col-span-1 text-center font-normal opacity-50">vs</div>
                                                    <div className="col-span-4 pl-4 text-right pr-12">Participants</div>
                                                    <div className="col-span-2">Match Info</div>
                                                </div>
                                                <div className="col-span-1 text-right pr-4">Result</div>
                                            </div>

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
                                                        className="group bg-[#131C2F]/40 hover:bg-[#131C2F] border border-white/5 rounded-3xl p-6 lg:px-6 lg:py-2.5 transition-all duration-300 shadow-lg"
                                                    >
                                                        {/* Mobile View */}
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
                                                                <div className="flex justify-center gap-4 py-2 bg-white/[0.02] rounded-2xl border border-white/5">
                                                                    {score.DetailedScoring.map((s, i) => (
                                                                        <div key={i} className="flex flex-col items-center">
                                                                            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-0.5 whitespace-nowrap">Set {i + 1}</span>
                                                                            <span className="text-[12px] text-padel-green font-black tracking-widest">
                                                                                {s.FirstParticipantScore}-{s.SecondParticipantScore}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                                                                <div className="flex flex-col p-2 bg-white/[0.02] rounded-xl text-left">
                                                                    <span className="text-[8px] text-gray-500 font-black uppercase tracking-widest mb-1">Details</span>
                                                                    <span className="text-[10px] text-gray-300 font-bold truncate">{m.TournamentClassName}</span>
                                                                </div>
                                                                <div className="flex flex-col p-2 bg-white/[0.02] rounded-xl text-left text-right">
                                                                    <span className="text-[8px] text-gray-500 font-black uppercase tracking-widest mb-1">Schedule</span>
                                                                    <span className="text-[10px] text-gray-300 font-bold">{m.Date ? new Date(m.Date).toLocaleDateString('en-GB') : 'TBD'}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Desktop View */}
                                                        <div className="hidden lg:grid lg:grid-cols-12 items-center gap-0 w-full">
                                                            <div className="col-span-11 grid grid-cols-11 items-center gap-4 text-left">
                                                                <div className="col-span-4 flex items-center justify-end pr-4 text-right">
                                                                    {renderParticipant(m.Challenger, p1Wins)}
                                                                </div>
                                                                <div className="col-span-1 flex justify-center">
                                                                    <span className="text-[10px] font-black text-gray-700 italic px-2 py-0.5 bg-white/5 rounded-full border border-white/5">vs</span>
                                                                </div>
                                                                <div className="col-span-4 flex items-center pl-4">
                                                                    {renderParticipant(m.Challenged, p2Wins)}
                                                                </div>
                                                                <div className="col-span-2 flex flex-col items-start gap-0.5 border-l border-white/5 pl-4 overflow-hidden">
                                                                    <span className="text-[10px] font-black text-padel-green truncate w-full uppercase tracking-tighter">{m.TournamentClassName}</span>
                                                                    <span className="text-[9px] text-gray-500 font-bold">{m.TournamentDrawName || m.Draw}</span>
                                                                </div>
                                                            </div>
                                                            <div className="col-span-1 flex items-center justify-end">
                                                                {renderScore(m)}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-8"
                            >
                                {/* Controls for Brackets/Match List */}
                                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="relative min-w-[200px]">
                                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Select Class</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full bg-[#131C2F] border border-white/10 text-white rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all shadow-lg text-sm font-medium pr-10"
                                                    value={selectedClassId}
                                                    onChange={(e) => setSelectedClassId(e.target.value)}
                                                    disabled={loading || classes.length === 0}
                                                >
                                                    {classes.length === 0 && <option>Loading...</option>}
                                                    {classes.map(c => <option key={c.Id} value={c.Id}>{c.Name}</option>)}
                                                </select>
                                                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                            </div>
                                        </motion.div>

                                        {availableDraws.length > 0 && (
                                            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="relative min-w-[150px]">
                                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Select Stage</label>
                                                <div className="relative">
                                                    <select
                                                        className="w-full bg-[#131C2F] border border-white/10 text-white rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all shadow-lg text-sm font-medium pr-10"
                                                        value={selectedDrawId}
                                                        onChange={(e) => setSelectedDrawId(e.target.value)}
                                                        disabled={loading}
                                                    >
                                                        {availableDraws.map(d => <option key={d.Id} value={d.Id}>{d.Name}</option>)}
                                                    </select>
                                                    <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-[#0B1221] rounded-3xl p-6 md:p-10 border border-white/5 shadow-2xl min-h-[500px] relative overflow-x-auto">
                                    {loading && (
                                        <div className="absolute inset-0 bg-[#0B1221]/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-3xl">
                                            <Loader2 className="w-10 h-10 text-padel-green animate-spin mb-4" />
                                            <p className="text-white font-medium tracking-wide">Fetching live draw data...</p>
                                        </div>
                                    )}

                                    {!loading && !error && drawData === null && classes.length > 0 && (
                                        <div className="text-center py-20 text-gray-400">Draw data not yet available for this event.</div>
                                    )}

                                    {!loading && !error && drawData && (
                                        <KnockoutBracket 
                                            matches={drawData} 
                                            forcedViewMode={activeTab === 'match-list' ? 'list' : 'bracket'}
                                        />
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </>
    );
};

export default TournamentDraw;
