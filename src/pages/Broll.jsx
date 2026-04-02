import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { MapPin, Loader, AlertCircle, Calendar as CalendarIcon, ArrowRight, Users, ExternalLink, Award, Building2, TrendingUp, Trophy, Target, BarChart3, Medal, PlayCircle, Video, Search, ChevronLeft, ChevronRight, X, ChevronDown, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { useRankedin } from '../hooks/useRankedin';
import brollLogo from '../assets/BrollLogo.png';
import PlayerModal from '../components/PlayerModal';
import * as htmlToImage from 'html-to-image';

const Broll = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Rankings State
    const { getOrganisationRankings } = useRankedin();
    const [mensDataRaw, setMensDataRaw] = useState([]);
    const [ladiesDataRaw, setLadiesDataRaw] = useState([]);
    const [rankingsLoading, setRankingsLoading] = useState(true);
    const [localProfileMap, setLocalProfileMap] = useState({});
    const [activeTab, setActiveTab] = useState('men');
    const [activeContentTab, setActiveContentTab] = useState('rankings');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [userEmail, setUserEmail] = useState(null);
    const [imageErrors, setImageErrors] = useState({});
    const contentRef = React.useRef(null);
    const itemsPerPage = 20;

    const scrollToContent = () => {
        contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const BROLL_RED = '#F40020';
    const BROLL_RANKING_ID = 16317;

    useEffect(() => {
        fetchBrollEvents();
        fetchRankings();
        fetchSession();
    }, []);

    const fetchSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
            setUserEmail(session.user.email);
        }
    };

    const fetchRankings = async () => {
        try {
            setRankingsLoading(true);
            const [mensData, ladiesData] = await Promise.all([
                getOrganisationRankings(3, 82, 1000, BROLL_RANKING_ID),
                getOrganisationRankings(4, 83, 1000, BROLL_RANKING_ID)
            ]);
            setMensDataRaw(mensData || []);
            setLadiesDataRaw(ladiesData || []);
        } catch (err) {
            console.error('Error fetching Broll rankings:', err);
        } finally {
            setRankingsLoading(false);
        }
    };

    // Fetch local player profiles once rankings load (reusing logic from Rankings.jsx)
    useEffect(() => {
        const fetchLocalProfiles = async () => {
            const { data } = await supabase
                .from('players')
                .select('*')
                .eq('approved', true);

            if (data) {
                const map = {};
                data.forEach(p => {
                    if (p.name) {
                        map[p.name.trim().toLowerCase()] = p;
                    }
                });
                setLocalProfileMap(map);
            }
        };
        if (!rankingsLoading) fetchLocalProfiles();
    }, [rankingsLoading]);

    const formatRankings = (data, profileMap) => {
        if (!data) return [];
        return data.map(item => {
            const playerRecord = profileMap[item.Name?.trim().toLowerCase()];
            const localImage = playerRecord?.image_url;

            return {
                id: item.Participant?.Id || item.RankedinId,
                name: item.Name,
                rawRank: item.Standing,
                rank: `Rank #${item.Standing}`,
                image: localImage || null,
                hasLocalProfile: !!playerRecord,
                playerRecord: playerRecord || null,
                points: item.ParticipantPoints?.Points || 0,
                rankedinProfile: `https://www.rankedin.com${item.ParticipantUrl}`,
            };
        });
    };

    const mensRankings = React.useMemo(() => formatRankings(mensDataRaw, localProfileMap), [mensDataRaw, localProfileMap]);
    const ladiesRankings = React.useMemo(() => formatRankings(ladiesDataRaw, localProfileMap), [ladiesDataRaw, localProfileMap]);

    const currentData = activeTab === 'men' ? mensRankings : ladiesRankings;
    const filteredData = React.useMemo(() => {
        return currentData.filter(player =>
            player.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [currentData, searchTerm]);

    const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
    const paginatedData = React.useMemo(() => {
        return filteredData.slice(
            (currentPage - 1) * itemsPerPage,
            currentPage * itemsPerPage
        );
    }, [filteredData, currentPage]);

    const getInitials = (name) => {
        if (!name) return '';
        const parts = name.split(' ');
        if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        return name.substring(0, 2).toUpperCase();
    };

    const fetchBrollEvents = async () => {
        try {
            setLoading(true);
            const { data, error: sbError } = await supabase
                .from('calendar')
                .select('*')
                .eq('tournament_tag', 'Broll')
                .order('start_date', { ascending: true });

            if (sbError) throw sbError;
            setEvents(data || []);
        } catch (err) {
            console.error('Error fetching Broll events:', err);
            setError('Failed to load Broll Pro Tour events.');
        } finally {
            setLoading(false);
        }
    };

    const RankingSlider = ({ title, playersData, onPlayerClick, accentColor = '#F40020' }) => {
        const scrollRef = React.useRef(null);
        const [canScrollLeft, setCanScrollLeft] = useState(false);
        const [canScrollRight, setCanScrollRight] = useState(true);

        const updateArrows = () => {
            const el = scrollRef.current;
            if (!el) return;
            setCanScrollLeft(el.scrollLeft > 10);
            setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
        };

        const scroll = (e, dir) => {
            if (e) e.stopPropagation();
            const el = scrollRef.current;
            if (!el) return;
            el.scrollBy({ left: dir * 260, behavior: 'smooth' });
        };

        const handleCardClick = (player) => {
            if (player.hasLocalProfile && player.playerRecord) {
                onPlayerClick(player.playerRecord);
            }
        };

        if (!playersData || playersData.length === 0) return null;
        return (
            <div className="mb-20 last:mb-0">
                <div className="flex items-center gap-3 mb-8 px-6 md:px-20">
                    <Trophy className="w-6 h-6" style={{ color: accentColor }} />
                    <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-wider">{title}</h3>
                </div>
                <div className="relative">
                    {/* Left Arrow */}
                    <button
                        onClick={(e) => scroll(e, -1)}
                        className={`absolute left-2 md:left-8 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/80 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl transition-all duration-300 hover:bg-[#F40020] hover:text-white hover:border-[#F40020] active:scale-95 ${canScrollLeft ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                        aria-label="Scroll left"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>

                    {/* Right Arrow */}
                    <button
                        onClick={(e) => scroll(e, 1)}
                        className={`absolute right-2 md:left-auto md:right-8 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/80 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl transition-all duration-300 hover:bg-[#F40020] hover:text-white hover:border-[#F40020] active:scale-95 ${canScrollRight ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                        aria-label="Scroll right"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>

                    {/* Scroll Container */}
                    <div
                        ref={scrollRef}
                        onScroll={updateArrows}
                        className="flex gap-6 overflow-x-auto pb-8 snap-x px-6 md:px-20 nice-scrollbar scroll-smooth"
                    >
                        {playersData.map((player, index) => (
                            <motion.div
                                key={player.id || index}
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: Math.min(index * 0.1, 0.5) }}
                                className={`w-[200px] md:w-[240px] relative group rounded-3xl overflow-hidden snap-center shadow-2xl border border-white/5 bg-white/5 flex-shrink-0 ${player.hasLocalProfile ? 'cursor-pointer hover:border-[#F40020]/50' : ''}`}
                                onClick={() => handleCardClick(player)}
                            >
                                <div className="slider-card-media h-[280px] md:h-[320px] w-full relative bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                                    {player.image && !imageErrors[player.id] ? (
                                        <img
                                            src={player.image}
                                            alt={player.name}
                                            className={`w-full h-full object-cover object-top transition-all duration-500 scale-100 group-hover:scale-105 ${player.hasLocalProfile ? '' : 'grayscale group-hover:grayscale-0'}`}
                                            onError={() => setImageErrors(prev => ({ ...prev, [player.id]: true }))}
                                        />
                                    ) : null}
                                    {/* Fallback initials */}
                                    <div
                                        className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900"
                                        style={{ display: player.image && !imageErrors[player.id] ? 'none' : 'flex' }}
                                    >
                                        <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center shadow-inner mb-8">
                                            <span className="text-2xl font-black text-slate-400 tracking-tighter">{getInitials(player.name)}</span>
                                        </div>
                                    </div>
                                    {player.hasLocalProfile && (
                                        <div className="absolute top-3 left-3 bg-[#F40020] text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full shadow-lg z-10">
                                            4M Profile
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

                                    {/* View Profile Overlay */}
                                    {player.hasLocalProfile && (
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                                            <span className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-bold transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                                                View Profile
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 p-4">
                                    <p className="text-[#F40020] font-black mb-1 text-[9px] tracking-widest uppercase">{player.rank}</p>
                                    <h4 className="text-lg font-bold text-white mb-3 line-clamp-1">{player.name}</h4>
                                    <div className="flex justify-between items-center border-t border-white/10 pt-3">
                                        <div>
                                            <p className="text-[8px] text-gray-400 uppercase font-bold tracking-widest leading-none mb-1">Points</p>
                                            <p className="text-sm font-black text-white">{player.points.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-white text-slate-900 font-sans">

            {/* Hero Section - Official Broll Aesthetic */}
            <section className="relative pt-12 md:pt-40 pb-20 md:pb-24 px-6 overflow-hidden bg-slate-50">
                <div className="absolute top-0 right-0 w-1/3 h-full bg-[#F40020]/5 skew-x-12 transform translate-x-1/2"></div>
                <div className="max-w-7xl mx-auto relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8 }}
                        >
                            <div className="inline-flex items-center gap-2 bg-[#F40020] text-white px-4 py-1.5 rounded-sm mb-6 text-sm font-bold tracking-widest uppercase">
                                <Award className="w-4 h-4" />
                                Official Partner
                            </div>
                            <h1 className="text-5xl md:text-8xl font-black mb-6 tracking-tighter text-slate-900 leading-[0.9]">
                                <span className="text-[#F40020]">BROLL</span> PRO TOUR
                            </h1>
                            <h2 className="text-2xl md:text-4xl font-bold text-slate-900 mb-6 tracking-tight">
                                South Africa’s Elite Padel Circuit
                            </h2>
                            <div className="space-y-6 max-w-2xl mb-10">
                                <p className="text-base md:text-xl text-slate-700 leading-relaxed">
                                    The <strong className="font-extrabold text-slate-900">Broll Pro Tour</strong> is a premium series of <strong className="font-extrabold text-slate-900">12 top-tier events</strong> showcasing the highest level of men’s professional padel in South Africa.
                                </p>
                                <p className="text-base md:text-xl text-slate-700 leading-relaxed">
                                    Backed by <strong className="font-extrabold text-slate-900">Broll Auctions and Sales</strong>, an official SAPA partner, the tour brings together the country’s best players to compete across the national calendar.
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <a
                                    href="https://www.brollauctions.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-[#F40020] !text-white px-8 py-3.5 md:py-4 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#960f24] transition-all shadow-lg shadow-[#F40020]/20"
                                >
                                    Visit Broll Auctions <ExternalLink className="w-4 h-4" />
                                </a>
                                <button
                                    onClick={() => {
                                        setActiveContentTab('dates');
                                        setTimeout(scrollToContent, 100);
                                    }}
                                    className="border-2 border-slate-200 !text-slate-900 px-8 py-3.5 md:py-4 rounded-lg font-bold hover:bg-slate-100 transition-all text-center flex items-center justify-center cursor-pointer"
                                >
                                    View Tour Schedule
                                </button>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 1, delay: 0.2 }}
                            className="relative"
                        >
                            <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl border-8 border-white">
                                <img
                                    src={brollLogo}
                                    alt="4m Padel Broll"
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#F40020]/40 to-transparent"></div>
                            </div>
                            {/* Stats Overlay */}
                            <div className="absolute -bottom-6 -left-0 md:-left-6 bg-white p-6 md:p-8 rounded-2xl shadow-xl border border-slate-100 scale-90 md:scale-100 origin-left">
                                <div className="flex gap-6 md:gap-8">
                                    <div>
                                        <div className="text-2xl md:text-3xl font-black text-[#F40020]">45+</div>
                                        <div className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">Years Legacy</div>
                                    </div>
                                    <div className="w-px h-10 bg-slate-100"></div>
                                    <div>
                                        <div className="text-2xl md:text-3xl font-black text-[#F40020]">#1</div>
                                        <div className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">Property Platform</div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Content Navigation Tabs */}
            <div ref={contentRef} className="sticky top-20 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100 py-4 shadow-sm">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex items-center justify-center gap-1.5 md:gap-8 py-2">
                        {[
                            { id: 'rankings', label: 'Tour Leaderboard', shortLabel: 'Leaderboard', icon: Trophy },
                            { id: 'format', label: 'Tour Format', shortLabel: 'Format', icon: Target },
                            { id: 'dates', label: 'Broll Tour Dates', shortLabel: 'Dates', icon: CalendarIcon }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveContentTab(tab.id)}
                                className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-2 md:px-6 py-2.5 rounded-full font-bold text-[10px] md:text-sm uppercase tracking-wider transition-all ${activeContentTab === tab.id
                                    ? 'bg-[#F40020] text-white shadow-lg shadow-[#F40020]/20 scale-105'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-[#F40020]'
                                    }`}
                            >
                                <tab.icon className="w-3.5 h-3.5 md:w-4 h-4 shrink-0" />
                                <span className="hidden md:inline">{tab.label}</span>
                                <span className="md:hidden">{tab.shortLabel}</span>
                            </button>
                        ))}
                    </div>

                </div>
            </div>

            <AnimatePresence mode="wait">
                {activeContentTab === 'rankings' && (
                    <motion.div
                        key="rankings-section"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* Broll Tour Rankings Section */}
                        <section className="py-24 px-6 bg-slate-900 text-white relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#F40020] blur-[150px] rounded-full translate-x-1/2 -translate-y-1/2"></div>
                                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#F40020] blur-[150px] rounded-full -translate-x-1/2 translate-y-1/2"></div>
                            </div>

                            <div className="max-w-7xl mx-auto relative z-10">
                                <div className="text-center mb-16">
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[#F40020] text-sm font-bold uppercase tracking-widest mb-6"
                                    >
                                        <span className="w-2 h-2 rounded-full bg-[#F40020] animate-pulse" />
                                        Live Standings
                                    </motion.div>
                                    <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter uppercase mb-6">
                                        OFFICIAL <span className="text-[#F40020]">BROLL TOUR</span> RANKINGS
                                    </h2>
                                    <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                                        Track the best Men's and Ladies Pro players in South Africa as they compete for the Broll Tour bonus. Best 8 results count towards the final standings.
                                    </p>
                                </div>

                                {rankingsLoading ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                                        <Loader className="w-10 h-10 animate-spin mb-4 text-[#F40020]" />
                                        <p className="font-bold uppercase tracking-widest text-xs">Pulling latest rankings...</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Top Players Sliders */}
                                        <div className="space-y-20">
                                            <RankingSlider title="Men's Open Top 10 Leaderboard" playersData={mensRankings.slice(0, 10)} onPlayerClick={setSelectedPlayer} />
                                            <RankingSlider title="Women's Open Top 10 Leaderboard" playersData={ladiesRankings.slice(0, 10)} onPlayerClick={setSelectedPlayer} />
                                        </div>

                                        {/* Searchable Rankings Table */}
                                        <div className="max-w-7xl mx-auto px-6 mt-32 relative z-10">
                                            <div className="mb-12">
                                                <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter mb-4 italic">Live Rankings</h2>
                                                <p className="text-slate-400 text-lg max-w-2xl font-medium leading-relaxed italic">All player rankings across the Broll Pro Tour.</p>
                                            </div>

                                            <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-12">
                                                <div className="flex p-1 bg-white/5 border border-white/10 rounded-xl w-full md:w-auto">
                                                    <button
                                                        onClick={() => setActiveTab('men')}
                                                        className={`flex-1 py-3 px-8 rounded-lg font-bold text-sm uppercase tracking-wider transition-all ${activeTab === 'men' ? 'bg-[#F40020] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                                    >
                                                        Men
                                                    </button>
                                                    <button
                                                        onClick={() => setActiveTab('ladies')}
                                                        className={`flex-1 py-3 px-8 rounded-lg font-bold text-sm uppercase tracking-wider transition-all ${activeTab === 'ladies' ? 'bg-[#F40020] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                                    >
                                                        Women
                                                    </button>
                                                </div>

                                                <div className="relative w-full md:w-80">
                                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                                                    <input
                                                        type="text"
                                                        value={searchTerm}
                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                        placeholder="Search player name..."
                                                        className="w-full bg-white/5 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#F40020]/50 placeholder-slate-500 font-medium"
                                                    />
                                                </div>
                                            </div>

                                            <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md">
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left border-collapse min-w-full md:min-w-[600px]">
                                                        <thead>
                                                            <tr className="bg-white/5">
                                                                <th className="py-3 px-3 md:py-5 md:px-6 font-bold text-slate-400 uppercase tracking-widest text-xs md:text-sm w-12 md:w-24">Pos</th>
                                                                <th className="py-3 px-3 md:py-5 md:px-6 font-bold text-slate-400 uppercase tracking-widest text-xs md:text-sm">Player</th>
                                                                <th className="py-3 px-3 md:py-5 md:px-6 font-bold text-slate-400 uppercase tracking-widest text-xs md:text-sm text-right">Points</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {paginatedData.length > 0 ? (
                                                                paginatedData.map((player) => (
                                                                    <tr key={player.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                                                        <td className="py-3 px-3 md:py-4 md:px-6 text-xl md:text-2xl font-black text-slate-500 group-hover:text-[#F40020] transition-colors text-center md:text-left">
                                                                            {player.rawRank}
                                                                        </td>
                                                                        <td className="py-3 px-3 md:py-4 md:px-6">
                                                                            <div
                                                                                onClick={() => {
                                                                                    if (player.hasLocalProfile && player.playerRecord) {
                                                                                        setSelectedPlayer(player.playerRecord);
                                                                                    } else {
                                                                                        window.open(player.rankedinProfile, '_blank');
                                                                                    }
                                                                                }}
                                                                                className="flex items-center gap-3 md:gap-4 cursor-pointer group/link"
                                                                            >
                                                                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden bg-white/10 border border-white/5 flex-shrink-0 flex items-center justify-center">
                                                                                    {!imageErrors[player.id] ? (
                                                                                        <img
                                                                                            src={player.image}
                                                                                            alt={player.name}
                                                                                            className={`w-full h-full object-cover transition-all ${player.hasLocalProfile ? '' : 'filter grayscale group-hover/link:grayscale-0'}`}
                                                                                            onError={() => setImageErrors(prev => ({ ...prev, [player.id]: true }))}
                                                                                        />
                                                                                    ) : (
                                                                                        <span className="text-xs md:text-sm font-bold text-slate-400">{getInitials(player.name)}</span>
                                                                                    )}
                                                                                </div>
                                                                                <span className="text-base md:text-lg font-bold text-white group-hover/link:text-[#F40020] transition-colors truncate max-w-[120px] xs:max-w-[200px] sm:max-w-none">
                                                                                    {player.name}
                                                                                    {player.hasLocalProfile && (
                                                                                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded-md bg-[#F40020]/10 text-[#F40020] text-[8px] font-black uppercase tracking-widest border border-[#F40020]/20">4M</span>
                                                                                    )}
                                                                                </span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-3 px-3 md:py-4 md:px-6 text-right">
                                                                            <span className="inline-block bg-white/10 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-base md:text-lg font-black text-white group-hover:bg-[#F40020] group-hover:text-white transition-colors">
                                                                                {player.points.toLocaleString()}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                ))
                                                            ) : (
                                                                <tr>
                                                                    <td colSpan="3" className="py-16 text-center text-slate-500 font-medium">No players found matching "{searchTerm}"</td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Pagination Controls */}
                                                {totalPages > 1 && (
                                                    <div className="border-t border-white/10 p-6 flex items-center justify-between bg-white/[0.02]">
                                                        <p className="text-sm text-slate-500 font-medium hidden md:block">
                                                            Showing <span className="text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-white">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> of <span className="text-white">{filteredData.length}</span> players
                                                        </p>

                                                        <div className="flex items-center gap-2 mx-auto md:mx-0">
                                                            <button
                                                                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                                                disabled={currentPage === 1}
                                                                className="p-2 rounded-lg bg-white/5 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 hover:text-[#F40020] transition-colors"
                                                            >
                                                                <ChevronLeft className="w-5 h-5" />
                                                            </button>

                                                            <div className="flex items-center gap-1 mx-4">
                                                                {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
                                                                    // Logic to show a sliding window of pages
                                                                    let pageNum = currentPage;
                                                                    if (totalPages <= 5) pageNum = idx + 1;
                                                                    else if (currentPage <= 3) pageNum = idx + 1;
                                                                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + idx;
                                                                    else pageNum = currentPage - 2 + idx;

                                                                    return (
                                                                        <button
                                                                            key={pageNum}
                                                                            onClick={() => setCurrentPage(pageNum)}
                                                                            className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold text-sm transition-all duration-300 ${currentPage === pageNum
                                                                                ? 'bg-[#F40020] text-white shadow-lg shadow-[#F40020]/20 scale-110'
                                                                                : 'text-slate-400 hover:bg-white/10 hover:text-white'
                                                                                }`}
                                                                        >
                                                                            {pageNum}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>

                                                            <button
                                                                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                                                disabled={currentPage === totalPages}
                                                                className="p-2 rounded-lg bg-white/5 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 hover:text-[#F40020] transition-colors"
                                                            >
                                                                <ChevronRight className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </section>
                    </motion.div>
                )}

                {activeContentTab === 'format' && (
                    <motion.div
                        key="format-section"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* Tour Format & Details Section */}
                        <section className="py-16 md:py-24 px-6 bg-slate-50 border-b border-slate-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-1/3 h-full bg-[#F40020]/5 skew-x-12 transform translate-x-1/2"></div>

                            <div className="max-w-7xl mx-auto relative z-10">
                                <div className="text-center md:text-left mb-16">
                                    <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-4">
                                        TOUR <span className="text-[#F40020]">FORMAT & RULES</span>
                                    </h2>
                                    <div className="h-1 w-24 bg-[#F40020] mx-auto md:mx-0"></div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
                                    {/* 1. Tour Structure */}
                                    <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 hover:border-[#F40020]/30 transition-all duration-300 group hover:shadow-2xl">
                                        <div className="w-12 h-12 bg-[#F40020]/10 rounded-2xl flex items-center justify-center text-[#F40020] mb-6 group-hover:scale-110 transition-transform">
                                            <Target className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Tour Structure</h3>
                                        <ul className="space-y-4">
                                            <li className="flex items-start gap-3 text-slate-600">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#F40020] mt-2.5 shrink-0"></div>
                                                <span className="leading-relaxed text-lg"><strong className="text-slate-900 font-extrabold">12 Premium Events</strong> nationwide</span>
                                            </li>
                                            <li className="flex items-start gap-3 text-slate-600">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#F40020] mt-2.5 shrink-0"></div>
                                                <span className="leading-relaxed text-lg">Exclusive to the <strong className="text-slate-900 font-extrabold">Men’s and Ladies Pro Division</strong></span>
                                            </li>
                                            <li className="flex items-start gap-3 text-slate-600">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#F40020] mt-2.5 shrink-0"></div>
                                                <span className="leading-relaxed text-lg">Officially sanctioned by SAPA</span>
                                            </li>
                                        </ul>
                                    </div>

                                    {/* 2. Points & Rankings */}
                                    <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 hover:border-[#F40020]/30 transition-all duration-300 group hover:shadow-2xl">
                                        <div className="w-12 h-12 bg-[#F40020]/10 rounded-2xl flex items-center justify-center text-[#F40020] mb-6 group-hover:scale-110 transition-transform">
                                            <BarChart3 className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Points & Rankings</h3>
                                        <p className="text-slate-600 mb-6 leading-relaxed text-lg">
                                            Players earn <strong className="text-slate-900 font-extrabold">Broll Ranking Points</strong> at each event, contributing to the <strong className="text-slate-900 font-extrabold">Broll Leaderboard</strong>.
                                        </p>
                                        <ul className="space-y-4">
                                            <li className="flex items-start gap-3 text-slate-600">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#F40020] mt-2.5 shrink-0"></div>
                                                <span className="leading-relaxed text-lg">A player’s <strong className="text-slate-900 font-extrabold">best 8 results</strong> count towards their Broll ranking</span>
                                            </li>
                                            <li className="flex items-start gap-3 text-slate-600">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#F40020] mt-2.5 shrink-0"></div>
                                                <span className="leading-relaxed text-lg"><strong className="text-slate-900 font-extrabold">Broll rankings are separate</strong> from SAPA rankings</span>
                                            </li>
                                            <li className="flex items-start gap-3 text-slate-600">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#F40020] mt-2.5 shrink-0"></div>
                                                <span className="leading-relaxed text-lg">Each event contributes to <strong className="text-slate-900 font-extrabold">both Broll and SAPA ranking systems</strong></span>
                                            </li>
                                        </ul>
                                    </div>

                                    {/* 3. Season Prize */}
                                    <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 hover:border-[#F40020]/30 transition-all duration-300 group hover:shadow-2xl">
                                        <div className="w-12 h-12 bg-[#F40020]/10 rounded-2xl flex items-center justify-center text-[#F40020] mb-6 group-hover:scale-110 transition-transform">
                                            <Trophy className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-2xl font-black text-slate-900 mb-6 tracking-tight">Season Prize</h3>
                                        <div className="bg-[#F40020]/5 border border-[#F40020]/10 rounded-2xl p-6 flex gap-5 items-start">
                                            <span className="text-4xl shrink-0 leading-none">🏆</span>
                                            <p className="text-slate-800 text-lg leading-relaxed">
                                                The No.1 player on the Broll Leaderboard at the end of the season will win <strong className="text-[#F40020] font-black block mt-1 text-xl">a massive cash bonus prize</strong>
                                            </p>
                                        </div>
                                    </div>

                                    {/* 4. The Standard */}
                                    <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 hover:border-[#F40020]/30 transition-all duration-300 group hover:shadow-2xl">
                                        <div className="w-12 h-12 bg-[#F40020]/10 rounded-2xl flex items-center justify-center text-[#F40020] mb-6 group-hover:scale-110 transition-transform">
                                            <Medal className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-2xl font-black text-slate-900 mb-6 tracking-tight">The Standard</h3>
                                        <p className="text-slate-600 text-lg leading-relaxed">
                                            The Broll Pro Tour sets the benchmark for professional padel in South Africa — where performance, consistency, and competition define the best in the country.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </motion.div>
                )}

                {activeContentTab === 'dates' && (
                    <motion.div
                        key="dates-section"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* Tournaments Listing */}
                        <section className="max-w-7xl mx-auto px-6 py-24">
                            <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 md:mb-12 gap-4">
                                <div>
                                    <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                                        BROLL TOUR <span className="text-[#F40020]">DATES</span>
                                    </h2>
                                    <div className="h-1 w-24 bg-[#F40020] mt-2"></div>
                                </div>
                                <p className="text-slate-500 font-medium max-w-md md:text-right text-sm md:text-base">
                                    Limited entries available for top-seed players. Secure your spot in the Broll Pro Tour.
                                </p>
                            </div>

                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                                    <Loader className="w-10 h-10 animate-spin mb-4 text-[#F40020]" />
                                    <p>Loading tour dates...</p>
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center h-64 text-red-500 bg-red-50 border border-red-100 rounded-3xl">
                                    <AlertCircle className="w-10 h-10 mb-4" />
                                    <p>{error}</p>
                                </div>
                            ) : events.length === 0 ? (
                                <div className="text-center py-24 bg-slate-50 border border-slate-100 rounded-3xl">
                                    <p className="text-xl font-bold text-slate-400">No Broll Pro Tour events scheduled.</p>
                                    <p className="text-sm mt-2 text-slate-400 uppercase tracking-widest font-black">Coming Soon</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-8">
                                    <AnimatePresence mode="popLayout">
                                        {events.map((event, index) => (
                                            <motion.div
                                                key={event.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.1 }}
                                            >
                                                <Link
                                                    to={event.slug ? `/calendar/${event.slug}` : `/calendar/${event.id}`}
                                                    className="group block bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-[#F40020]/30 hover:shadow-xl transition-all duration-500"
                                                >
                                                    <div className="flex flex-row">
                                                        <div className="w-[110px] sm:w-[140px] lg:w-1/5 aspect-[3/4] lg:aspect-auto relative overflow-hidden bg-slate-100 flex-shrink-0">
                                                            {event.image_url || event.posterUrl ? (
                                                                <img src={event.image_url || event.posterUrl} alt={event.event_name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                                            ) : (
                                                                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50">
                                                                    <CalendarIcon className="w-8 h-8 text-slate-200 mb-1" />
                                                                    <span className="text-[8px] text-slate-300 font-bold uppercase tracking-widest text-center px-2">Official Broll Event</span>
                                                                </div>
                                                            )}
                                                            <div className="absolute top-2 left-2">
                                                                <span className="bg-[#F40020] text-white px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                                                                    {event.sapa_status || 'Pro Tour'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex-1 p-3 md:p-4 lg:px-8 lg:py-4 flex flex-col justify-center relative min-w-0">
                                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <div className="h-0.5 w-6 bg-[#F40020]"></div>
                                                                        <span className="text-[#F40020] text-[10px] font-black uppercase tracking-[0.2em]">Broll Pro Tour</span>
                                                                        <div className="flex flex-wrap gap-2 ml-4">
                                                                            {event.live_youtube_url && event.featured_live && (
                                                                                <div className="flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest animate-pulse border border-red-500 shadow-sm shadow-red-500/20">
                                                                                    <PlayCircle className="w-2.5 h-2.5" /> Live Now
                                                                                </div>
                                                                            )}
                                                                            {(event.rankedin_id || event.rankedin_url) && (new Date(event.end_date || event.start_date) < new Date()) && (
                                                                                <div className="flex items-center gap-1 bg-slate-900 text-padel-green px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border border-padel-green/50 shadow-sm">
                                                                                    <Trophy className="w-2.5 h-2.5" /> Results Available
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <h3 className="text-lg md:text-xl lg:text-2xl font-black text-slate-900 leading-tight mb-2 tracking-tighter">{event.event_name}</h3>
                                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 font-bold text-xs">
                                                                        <div className="flex items-center gap-1.5"><CalendarIcon size={14} className="text-[#F40020]" />{event.event_dates || (event.start_date && `${new Date(event.start_date).toLocaleDateString()}${event.end_date && event.end_date !== event.start_date ? ` - ${new Date(event.end_date).toLocaleDateString()}` : ''}`)}</div>
                                                                        <div className="flex items-center gap-1.5"><MapPin size={14} className="text-[#F40020]" />{event.venue}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex-shrink-0">
                                                                    <div className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-300 group-hover:border-[#F40020] group-hover:text-[#F40020] transition-all duration-500 transform group-hover:rotate-45">
                                                                        <ArrowRight className="w-5 h-5" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Link>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </section>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sponsor Info Section */}
            <section className="py-16 md:py-24 px-6 bg-white border-b border-slate-100">
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
                        <div className="space-y-3 md:space-y-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-[#F40020]/10 rounded-xl flex items-center justify-center text-[#F40020]">
                                <Building2 className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                            <h3 className="text-lg md:text-xl font-bold text-slate-900">Premier Platform</h3>
                            <p className="text-slate-500 text-sm md:text-base leading-relaxed">
                                Broll Auctions and Sales is one of South Africa's leading commercial real estate auction houses with a proven track record.
                            </p>
                        </div>
                        <div className="space-y-3 md:space-y-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-[#F40020]/10 rounded-xl flex items-center justify-center text-[#F40020]">
                                <TrendingUp className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                            <h3 className="text-lg md:text-xl font-bold text-slate-900">Proven Success</h3>
                            <p className="text-slate-500 text-sm md:text-base leading-relaxed">
                                Specializing in the sale of iconic commercial, industrial, and retail properties across South Africa for over four decades.
                            </p>
                        </div>
                        <div className="space-y-3 md:space-y-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-[#F40020]/10 rounded-xl flex items-center justify-center text-[#F40020]">
                                <Users className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                            <h3 className="text-lg md:text-xl font-bold text-slate-900">Industry Leaders</h3>
                            <p className="text-slate-500 text-sm md:text-base leading-relaxed">
                                Committed to excellence and transparency, bringing the same standard of professionalism to the South African Padel scene.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Player Modal */}
            <AnimatePresence>
                {selectedPlayer && (
                    <PlayerModal
                        player={selectedPlayer}
                        onClose={() => setSelectedPlayer(null)}
                        userEmail={userEmail}
                        hideSapaRankings={true}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Broll;
