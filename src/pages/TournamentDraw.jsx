import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SEOHead } from '@burkcorp/reactmath';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, ChevronDown, GitBranch } from 'lucide-react';
import Navbar from '../components/Navbar';
import { supabase } from '../supabaseClient';
import { useRankedin } from '../hooks/useRankedin';
import KnockoutBracket from '../components/KnockoutBracket';

const TournamentDraw = () => {
    const { id: idOrSlug } = useParams();
    const navigate = useNavigate();
    const { getTournamentClasses, getDrawsForClass, getTournamentDetails, loading: apiLoading, error } = useRankedin();

    const [resolvedId, setResolvedId] = useState(null);
    const [lookupLoading, setLookupLoading] = useState(true);
    const [classes, setClasses] = useState([]);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedDrawId, setSelectedDrawId] = useState('');
    const [drawData, setDrawData] = useState(null);
    const [tournamentDetails, setTournamentDetails] = useState(null);

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

    // Fetch draw data when class or draw changes
    useEffect(() => {
        if (!selectedClassId || !selectedDrawId) return;

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
                <div className="relative h-[30vh] md:h-[40vh] min-h-[300px] w-full overflow-hidden bg-slate-900 flex items-center justify-center">
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

                <div className="container mx-auto px-6 max-w-7xl pt-12">
                    {/* Controls */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
                        <div className="flex flex-col sm:flex-row gap-4">
                            {/* Class Dropdown */}
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="relative min-w-[200px]"
                            >
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Select Class</label>
                                <div className="relative">
                                    <select
                                        className="w-full bg-[#131C2F] border border-white/10 text-white rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all shadow-lg text-sm font-medium pr-10"
                                        value={selectedClassId}
                                        onChange={(e) => setSelectedClassId(e.target.value)}
                                        disabled={loading || classes.length === 0}
                                    >
                                        {classes.length === 0 && <option>Loading classes...</option>}
                                        {classes.map(c => (
                                            <option key={c.Id} value={c.Id}>{c.Name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                            </motion.div>

                            {/* Stage Dropdown */}
                            {availableDraws.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="relative min-w-[150px]"
                                >
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Select Stage</label>
                                    <div className="relative">
                                        <select
                                            className="w-full bg-[#131C2F] border border-white/10 text-white rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all shadow-lg text-sm font-medium pr-10"
                                            value={selectedDrawId}
                                            onChange={(e) => setSelectedDrawId(e.target.value)}
                                            disabled={loading}
                                        >
                                            {availableDraws.map(d => (
                                                <option key={d.Id} value={d.Id}>{d.Name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>

                    {/* Bracket Area */}
                    <div className="bg-[#0B1221] rounded-3xl p-6 md:p-10 border border-white/5 shadow-2xl min-h-[500px] relative overflow-x-auto">
                        {loading && (
                            <div className="absolute inset-0 bg-[#0B1221]/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-3xl">
                                <Loader2 className="w-10 h-10 text-padel-green animate-spin mb-4" />
                                <p className="text-white font-medium tracking-wide">Fetching live draw data...</p>
                            </div>
                        )}

                        {error && !loading && (
                            <div className="text-center py-20 text-red-400 font-medium">
                                Failed to load draw. Please try again later.
                            </div>
                        )}

                        {!loading && !error && drawData === null && classes.length > 0 && (
                            <div className="text-center py-20 text-gray-400">
                                Draw data is not yet available for this event. Check back closer to the tournament date.
                            </div>
                        )}

                        {!loading && !error && drawData && (
                            <KnockoutBracket matches={drawData} />
                        )}
                    </div>
                </div>
            </main>
        </>
    );
};

export default TournamentDraw;
