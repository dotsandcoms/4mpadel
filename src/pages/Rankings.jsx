import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Target, TrendingUp, Star, ChevronDown, CheckCircle2, Users, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRankedin } from '../hooks/useRankedin';
import { supabase } from '../supabaseClient';

const RankingExplanation = () => (
  <div className="grid md:grid-cols-3 gap-6 mb-20 relative z-10">
    {[
      {
        icon: <Target className="w-8 h-8 text-padel-green" />,
        title: 'Play Tournaments',
        desc: 'Compete in SAPA sanctioned events across various tiers, from Bronze up to Major.',
      },
      {
        icon: <Trophy className="w-8 h-8 text-padel-green" />,
        title: 'Earn Points',
        desc: 'Your performance dictates your points. Higher tier events offer significantly larger rewards.',
      },
      {
        icon: <TrendingUp className="w-8 h-8 text-padel-green" />,
        title: 'Climb the Ranks',
        desc: 'Only your Best 8 tournaments count towards your official national ranking. (Cat 3 & 4 proportionate where applicable)',
      }
    ].map((step, idx) => (
      <motion.div
        key={idx}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 * idx }}
        className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl hover:bg-white/10 transition-colors group"
      >
        <div className="bg-white/10 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-padel-green/20 transition-all">
          {step.icon}
        </div>
        <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
      </motion.div>
    ))}
  </div>
);

const RankingSlider = ({ title, playersData }) => {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 260, behavior: 'smooth' });
  };

  const getInitials = (name) => {
    if (!name) return '';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  if (!playersData || playersData.length === 0) return null;
  return (
    <div className="mb-20 last:mb-0">
      <div className="flex items-center gap-3 mb-6 px-6 md:px-20">
        <Trophy className="w-6 h-6 text-padel-green" />
        <h3 className="text-2xl md:text-3xl font-bold text-white uppercase tracking-wider">{title}</h3>
      </div>
      <div className="relative">
        {/* Left Arrow */}
        <button
          onClick={() => scroll(-1)}
          className={`absolute left-2 md:left-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/70 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white shadow-xl transition-all duration-300 hover:bg-padel-green hover:text-black hover:border-padel-green ${canScrollLeft ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Right Arrow */}
        <button
          onClick={() => scroll(1)}
          className={`absolute right-2 md:right-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/70 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white shadow-xl transition-all duration-300 hover:bg-padel-green hover:text-black hover:border-padel-green ${canScrollRight ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}
          aria-label="Scroll right"
        >
          <ChevronRight className="w-5 h-5" />
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
              className="w-[200px] md:w-[240px] relative group rounded-3xl overflow-hidden snap-center shadow-xl border border-white/5 bg-black/40 flex-shrink-0"
            >
              <div className="slider-card-media h-[280px] md:h-[320px] w-full relative bg-gradient-to-br from-[#1E293B] to-[#0F172A] flex items-center justify-center">
                {player.image && !player._imgError ? (
                  <img
                    src={player.image}
                    alt={player.name}
                    className={`w-full h-full object-cover object-top filter opacity-80 group-hover:opacity-100 transition-all duration-500 scale-100 group-hover:scale-105 ${player.hasLocalProfile ? '' : 'grayscale group-hover:grayscale-0'}`}
                    onError={(e) => { e.currentTarget.closest('.slider-card-media').dataset.err = '1'; e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling && (e.currentTarget.nextElementSibling.style.display = 'flex'); }}
                  />
                ) : null}
                {/* Fallback initials — always rendered, hidden when image loads */}
                <div
                  className="absolute inset-0 w-full h-full flex flex-col items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-[#253247] to-[#141d2e]"
                  style={{ display: player.image && !player._imgError ? 'none' : 'flex' }}
                >
                  <div className="w-24 h-24 rounded-full bg-[#E2E4EB] flex items-center justify-center shadow-2xl mb-8">
                    <span className="text-3xl font-black text-[#2B3B60] tracking-tighter">{getInitials(player.name)}</span>
                  </div>
                </div>
                {player.hasLocalProfile && (
                  <div className="absolute top-3 left-3 bg-padel-green/90 backdrop-blur-sm text-black text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full shadow-lg">
                    4M Profile
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="text-padel-green font-black mb-1 text-[9px] tracking-widest uppercase">{player.rank}</p>
                <h4 className="text-lg font-bold text-white mb-3 line-clamp-1">{player.name}</h4>
                <div className="flex justify-between items-center border-t border-white/10 pt-3">
                  <div>
                    <p className="text-[8px] text-gray-400 uppercase font-bold tracking-widest leading-none mb-1">Points</p>
                    <p className="text-sm font-black text-white">{player.points.toLocaleString()}</p>
                  </div>
                  <a
                    href={player.rankedinProfile}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-padel-green hover:text-black transition-colors"
                  >
                    <Users className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

const TierCard = ({ tier }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      className={`border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md transition-all duration-300 relative group
            ${isOpen ? 'bg-white/10 shadow-2xl shadow-black/50' : 'bg-white/5 hover:bg-white/10'}`}
    >
      {/* Glowing background gradient based on tier color */}
      <div className={`absolute top-0 right-0 w-64 h-64 ${tier.bgGradient} opacity-20 blur-[100px] rounded-full pointer-events-none group-hover:opacity-40 transition-opacity`} />

      {/* Header / Clickable area */}
      <div
        className="p-6 md:p-8 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-6">
          <div className={`w-16 h-16 rounded-2xl ${tier.bgIcon} flex items-center justify-center shadow-lg flex-shrink-0`}>
            <Star className={`w-8 h-8 ${tier.iconColor}`} />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-wider mb-1">
              {tier.type} <span className="text-gray-500 font-medium">Tier</span>
            </h2>
            <div className="flex items-center gap-4 text-sm font-medium">
              <span className="text-padel-green flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Up to {tier.maxPoints} pts
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 self-end md:self-auto">
          <span className="text-sm font-bold text-gray-500 uppercase tracking-widest hidden md:block">
            {isOpen ? 'Close details' : 'View breakdown'}
          </span>
          <button className={`w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center transition-transform duration-300 ${isOpen ? 'rotate-180 bg-white/20' : ''}`}>
            <ChevronDown className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

      {/* Expandable Table Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/10 bg-black/40"
          >
            <div className="p-6 md:p-8 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 w-24">Cat</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right">Winner</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right">Finals</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right">Semis</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right">Quarters</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right">R16</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right pr-8">R32</th>
                  </tr>
                </thead>
                <tbody>
                  {tier.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className="py-4 px-4 border-b border-white/5">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${row.cat === '1' ? tier.bgIcon + ' ' + tier.iconColor : 'bg-white/10 text-gray-300'}`}>
                          {row.cat}
                        </span>
                      </td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 ${row.bold ? 'font-black text-white text-lg' : 'font-medium text-gray-400'}`}>{row.winner}</td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 ${row.bold ? 'font-bold text-gray-200' : 'text-gray-400'}`}>{row.finals}</td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 ${row.bold ? 'font-bold text-gray-200' : 'text-gray-400'}`}>{row.semis}</td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 ${row.bold ? 'font-bold text-gray-200' : 'text-gray-400'}`}>{row.quarters}</td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 ${row.bold ? 'font-bold text-gray-200' : 'text-gray-400'}`}>{row.r16}</td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 pr-8 ${row.bold ? 'font-bold text-gray-200' : 'text-gray-400'}`}>{row.r32}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Rankings = () => {
  const { getOrganisationRankings } = useRankedin();
  const [mensDataRaw, setMensDataRaw] = useState([]);
  const [ladiesDataRaw, setLadiesDataRaw] = useState([]);
  const [rankingsLoading, setRankingsLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState({});
  const [localProfileMap, setLocalProfileMap] = useState({});

  // Search & Pagination State
  const [activeTab, setActiveTab] = useState('men');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        const [mensData, ladiesData] = await Promise.all([
          getOrganisationRankings(3, 82, 1000),
          getOrganisationRankings(4, 83, 1000),
        ]);
        setMensDataRaw(mensData || []);
        setLadiesDataRaw(ladiesData || []);
      } catch (err) {
        console.error('Error fetching rankings:', err);
      } finally {
        setRankingsLoading(false);
      }
    };
    fetchRankings();
  }, [getOrganisationRankings]);

  // Fetch local player profiles (name → image_url) once rankings load
  useEffect(() => {
    const fetchLocalProfiles = async () => {
      const { data } = await supabase
        .from('players')
        .select('name, image_url')
        .not('image_url', 'is', null)
        .neq('image_url', '');
      if (data) {
        const map = {};
        data.forEach(p => {
          if (p.name && p.image_url) {
            map[p.name.trim().toLowerCase()] = p.image_url;
          }
        });
        setLocalProfileMap(map);
      }
    };
    if (!rankingsLoading) fetchLocalProfiles();
  }, [rankingsLoading]);

  // Format rankings using useMemo to ensure latest localProfileMap is used
  const formatRankings = (data, profileMap) => {
    if (!data) return [];
    return data.map(item => {
      const localImage = profileMap[item.Name?.trim().toLowerCase()];
      return {
        id: item.Participant?.Id || item.RankedinId,
        name: item.Name,
        rawRank: item.Standing,
        rank: `Rank #${item.Standing}`,
        image: localImage || null,
        hasLocalProfile: !!localImage,
        points: item.ParticipantPoints?.Points || 0,
        rankedinProfile: `https://www.rankedin.com${item.ParticipantUrl}`,
      };
    });
  };

  const mensRankings = useMemo(() => formatRankings(mensDataRaw, localProfileMap), [mensDataRaw, localProfileMap]);
  const ladiesRankings = useMemo(() => formatRankings(ladiesDataRaw, localProfileMap), [ladiesDataRaw, localProfileMap]);

  // Reset page when searching or switching tabs
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  const rankingData = [
    {
      type: 'MAJOR',
      maxPoints: '2,000',
      bgGradient: 'bg-red-500',
      bgIcon: 'bg-red-500/20',
      iconColor: 'text-red-500',
      rows: [
        { cat: '1', winner: '2,000', finals: '1,200', semis: '720', quarters: '360', r16: '180', r32: '90', bold: true },
        { cat: '2', winner: '800', finals: '480', semis: '240', quarters: '120', r16: '60', r32: '30', bold: false }
      ]
    },
    {
      type: 'S GOLD',
      maxPoints: '1,500',
      bgGradient: 'bg-amber-600',
      bgIcon: 'bg-amber-600/20',
      iconColor: 'text-amber-500',
      rows: [
        { cat: '1', winner: '1,500', finals: '900', semis: '540', quarters: '270', r16: '135', r32: '68', bold: true },
        { cat: '2', winner: '600', finals: '360', semis: '216', quarters: '130', r16: '78', r32: '47', bold: false }
      ]
    },
    {
      type: 'GOLD',
      maxPoints: '1,000',
      bgGradient: 'bg-yellow-500',
      bgIcon: 'bg-yellow-500/20',
      iconColor: 'text-yellow-400',
      rows: [
        { cat: '1', winner: '1,000', finals: '600', semis: '360', quarters: '180', r16: '90', r32: '45', bold: true },
        { cat: '2', winner: '400', finals: '240', semis: '144', quarters: '72', r16: '36', r32: '18', bold: false }
      ]
    },
    {
      type: 'SILVER',
      maxPoints: '600',
      bgGradient: 'bg-gray-400',
      bgIcon: 'bg-gray-400/20',
      iconColor: 'text-gray-300',
      rows: [
        { cat: '1', winner: '600', finals: '360', semis: '180', quarters: '90', r16: '45', r32: '22', bold: true },
        { cat: '2', winner: '240', finals: '144', semis: '86', quarters: '43', r16: '22', r32: '11', bold: false }
      ]
    },
    {
      type: 'BRONZE',
      maxPoints: '300',
      bgGradient: 'bg-orange-800',
      bgIcon: 'bg-orange-800/20',
      iconColor: 'text-orange-700',
      rows: [
        { cat: '1', winner: '300', finals: '180', semis: '90', quarters: '45', r16: '25', r32: '14', bold: true },
        { cat: '2', winner: '120', finals: '72', semis: '43', quarters: '22', r16: '11', r32: '5', bold: false }
      ]
    }
  ];

  // Search logic computation
  const currentData = activeTab === 'men' ? mensRankings : ladiesRankings;
  const filteredData = useMemo(() => {
    return currentData.filter(player =>
      player.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [currentData, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const paginatedData = useMemo(() => {
    return filteredData.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredData, currentPage]);

  return (
    <div className="bg-[#0F172A] min-h-screen pt-32 pb-20 font-sans selection:bg-padel-green selection:text-black">
      {/* Background elements */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-padel-green/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[150px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03]" />
      </div>

      <div className="container mx-auto px-6 max-w-5xl relative z-10">
        {/* Hero Header */}
        <div className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-padel-green text-sm font-bold uppercase tracking-widest mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-padel-green animate-pulse" />
            Live Standings
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-6 uppercase"
          >
            How the <span className="text-padel-green">Rankings</span> Work
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto"
          >
            The SAPA Tour points breakdown for 2026. Master the tier system, compete in the right categories, and build your national profile.
          </motion.p>
        </div>

        {/* Info Cards */}
        <RankingExplanation />

        {/* Points Breakdown Header */}
        <div className="mb-10 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between border-b border-white/10 pb-6 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Points Breakdown for official SAPA Rankings 2026</h2>
            <p className="text-gray-400">Expand each tier to see detailed point structures by category.</p>
          </div>
        </div>

        {/* Expandable Tiers List */}
        <div className="space-y-6">
          {rankingData.map((tier) => (
            <TierCard key={tier.type} tier={tier} />
          ))}
        </div>

      </div>

      {/* Live Rankings - Full width (same as footer) */}
      {!rankingsLoading && (
        <div className="w-full mt-24 pt-16 border-t border-white/10 relative z-10">
          <div className="px-6 md:px-20 mb-12">
            <h2 className="text-3xl font-bold text-white mb-2">Live Rankings Highlights</h2>
            <p className="text-gray-400">The latest Top 10 straight from Rankedin.</p>
          </div>
          <RankingSlider title="Men's Open Top 10" playersData={mensRankings.slice(0, 10)} />
          <RankingSlider title="Ladies Open Top 10" playersData={ladiesRankings.slice(0, 10)} />

          {/* Full Searchable Table Section */}
          <div className="max-w-7xl mx-auto px-6 mt-32 mb-12 relative z-10">
            <div className="mb-10 text-center">
              <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase mb-4">Official <span className="text-padel-green">SAPA</span> Rankings</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Browse the full rankings list, search for specific players, and check total accumulated points.</p>
            </div>

            {/* Controls Box */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-md mb-8">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6">

                {/* Tabs */}
                <div className="flex p-1 bg-black/40 rounded-xl max-w-sm w-full md:w-auto">
                  <button
                    onClick={() => setActiveTab('men')}
                    className={`flex-1 py-3 px-6 rounded-lg font-bold text-sm uppercase tracking-wider transition-all duration-300 ${activeTab === 'men' ? 'bg-padel-green text-black shadow-lg shadow-padel-green/20' : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    Men
                  </button>
                  <button
                    onClick={() => setActiveTab('ladies')}
                    className={`flex-1 py-3 px-6 rounded-lg font-bold text-sm uppercase tracking-wider transition-all duration-300 ${activeTab === 'ladies' ? 'bg-padel-green text-black shadow-lg shadow-padel-green/20' : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    Women
                  </button>
                </div>

                {/* Search Box */}
                <div className="relative w-full md:w-80">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-500" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search player name..."
                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-padel-green/50 placeholder-gray-500 transition-all font-medium"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Table Area */}
            <div className="bg-black/40 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-full md:min-w-[600px]">
                  <thead>
                    <tr className="bg-white/5">
                      <th className="py-3 px-3 md:py-5 md:px-6 font-bold text-gray-400 uppercase tracking-widest text-xs md:text-sm w-12 md:w-24">Pos</th>
                      <th className="py-3 px-3 md:py-5 md:px-6 font-bold text-gray-400 uppercase tracking-widest text-xs md:text-sm">Player</th>
                      <th className="py-3 px-3 md:py-5 md:px-6 font-bold text-gray-400 uppercase tracking-widest text-xs md:text-sm text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.length > 0 ? (
                      paginatedData.map((player) => (
                        <tr key={player.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                          <td className="py-3 px-3 md:py-4 md:px-6 text-xl md:text-2xl font-black text-gray-500 group-hover:text-padel-green transition-colors text-center md:text-left">
                            {player.rawRank}
                          </td>
                          <td className="py-3 px-3 md:py-4 md:px-6">
                            <a href={player.rankedinProfile} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 md:gap-4 group/link">
                              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden bg-white/10 border border-white/5 flex-shrink-0 flex items-center justify-center">
                                {!imageErrors[player.id] ? (
                                  <img
                                    src={player.image}
                                    alt={player.name}
                                    className={`w-full h-full object-cover transition-all ${player.hasLocalProfile ? '' : 'filter grayscale group-hover/link:grayscale-0'}`}
                                    onError={() => setImageErrors(prev => ({ ...prev, [player.id]: true }))}
                                  />
                                ) : (
                                  <span className="text-xs md:text-sm font-bold text-gray-400">{getInitials(player.name)}</span>
                                )}
                              </div>
                              <span className="text-base md:text-lg font-bold text-white group-hover/link:text-padel-green transition-colors truncate max-w-[120px] xs:max-w-[200px] sm:max-w-none">{player.name}</span>
                            </a>
                          </td>
                          <td className="py-3 px-3 md:py-4 md:px-6 text-right">
                            <span className="inline-block bg-white/10 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-base md:text-lg font-black text-white group-hover:bg-padel-green group-hover:text-black transition-colors">
                              {player.points.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3" className="py-16 text-center text-gray-500 font-medium">
                          No players found matching "{searchTerm}"
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="border-t border-white/10 p-6 flex items-center justify-between bg-white/[0.02]">
                  <p className="text-sm text-gray-500 font-medium hidden md:block">
                    Showing <span className="text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-white">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> of <span className="text-white">{filteredData.length}</span> players
                  </p>

                  <div className="flex items-center gap-2 mx-auto md:mx-0">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg bg-white/5 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 hover:text-padel-green transition-colors"
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
                              ? 'bg-padel-green text-black shadow-lg shadow-padel-green/20 scale-110'
                              : 'text-gray-400 hover:bg-white/10 hover:text-white'
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
                      className="p-2 rounded-lg bg-white/5 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 hover:text-padel-green transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Rankings;
