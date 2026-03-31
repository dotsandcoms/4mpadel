import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Target, TrendingUp, Star, ChevronDown, CheckCircle2, Users, Search, ChevronLeft, ChevronRight, X, MapPin, Download, Share2, Instagram } from 'lucide-react';
import { useRankedin } from '../hooks/useRankedin';
import { supabase } from '../supabaseClient';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';

const getInitials = (name) => {
  if (!name) return '';
  const parts = name.split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

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

const RankingSlider = ({ title, playersData, onPlayerClick }) => {
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

  const handleCardClick = (player) => {
    if (player.hasLocalProfile && player.playerRecord) {
      onPlayerClick(player.playerRecord);
    }
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
              className={`w-[200px] md:w-[240px] relative group rounded-3xl overflow-hidden snap-center shadow-xl border border-white/5 bg-black/40 flex-shrink-0 ${player.hasLocalProfile ? 'cursor-pointer hover:border-padel-green/50' : ''}`}
              onClick={() => handleCardClick(player)}
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
                  <div className="absolute top-3 left-3 bg-padel-green/90 backdrop-blur-sm text-black text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full shadow-lg z-10">
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
                <p className="text-padel-green font-black mb-1 text-[9px] tracking-widest uppercase">{player.rank}</p>
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
        className="p-4 md:p-8 cursor-pointer flex items-center justify-between gap-4 relative z-10"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4 md:gap-6">
          <div className={`w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl ${tier.bgIcon} flex items-center justify-center shadow-lg flex-shrink-0 transition-all group-hover:scale-105`}>
            <Star className={`w-6 h-6 md:w-8 md:h-8 ${tier.iconColor}`} />
          </div>
          <div>
            <h2 className="text-lg md:text-3xl font-black text-white uppercase tracking-[0.1em] md:tracking-wider leading-tight md:mb-1">
              {tier.type} <span className="text-white/30 font-medium hidden sm:inline md:hidden lg:inline ml-1">Tier</span>
            </h2>
            <div className="flex items-center gap-4 text-[10px] md:text-sm font-black uppercase tracking-widest opacity-80 md:opacity-100">
              <span className="text-padel-green flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4" /> Up to {tier.maxPoints} pts
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] hidden lg:block">
            {isOpen ? 'Close' : 'Breakdown'}
          </span>
          <button className={`w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center transition-all duration-300 ${isOpen ? 'rotate-180 bg-white/20' : 'group-hover:bg-white/10'}`}>
            <ChevronDown className="w-5 h-5 md:w-6 md:h-6 text-white" />
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

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const cardRef = useRef(null);
  const printRef = useRef(null);

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        const [mensData, ladiesData, { data: { session } }] = await Promise.all([
          getOrganisationRankings(3, 82, 1000),
          getOrganisationRankings(4, 83, 1000),
          supabase.auth.getSession()
        ]);
        setMensDataRaw(mensData || []);
        setLadiesDataRaw(ladiesData || []);
        if (session?.user?.email) {
          setUserEmail(session.user.email);
        }
      } catch (err) {
        console.error('Error fetching rankings:', err);
      } finally {
        setRankingsLoading(false);
      }
    };
    fetchRankings();
  }, [getOrganisationRankings]);

  // Fetch local player profiles once rankings load
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
            // Process sponsors as in Players.jsx
            let sponsorsList = [];
            if (p.sponsors) {
              try {
                sponsorsList = JSON.parse(p.sponsors);
                if (!Array.isArray(sponsorsList)) sponsorsList = [p.sponsors];
              } catch {
                sponsorsList = p.sponsors.split(',').map(s => s.trim()).filter(Boolean);
              }
            }

            map[p.name.trim().toLowerCase()] = {
              ...p,
              sponsors: sponsorsList
            };
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
        { cat: '2', winner: '600', finals: '360', semis: '180', quarters: '90', r16: '45', r32: '23', bold: false },
        { cat: '3', winner: '240', finals: '144', semis: '72', quarters: '36', r16: '18', r32: '9', bold: false },
        { cat: '4', winner: '96', finals: '86', semis: '36', quarters: '18', r16: '9', r32: '5', bold: false }
      ]
    },
    {
      type: 'SUPER GOLD',
      maxPoints: '1,500',
      bgGradient: 'bg-amber-600',
      bgIcon: 'bg-amber-600/20',
      iconColor: 'text-amber-500',
      rows: [
        { cat: '1', winner: '1,500', finals: '900', semis: '540', quarters: '270', r16: '135', r32: '68', bold: true },
        { cat: '2', winner: '450', finals: '270', semis: '162', quarters: '97', r16: '58', r32: '35', bold: false },
        { cat: '3', winner: '180', finals: '108', semis: '65', quarters: '39', r16: '23', r32: '14', bold: false },
        { cat: '4', winner: '72', finals: '43', semis: '26', quarters: '16', r16: '9', r32: '6', bold: false }
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
        { cat: '2', winner: '300', finals: '180', semis: '108', quarters: '54', r16: '27', r32: '14', bold: false },
        { cat: '3', winner: '120', finals: '72', semis: '43', quarters: '22', r16: '11', r32: '5', bold: false },
        { cat: '4', winner: '48', finals: '29', semis: '17', quarters: '9', r16: '4', r32: '2', bold: false }
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
        { cat: '2', winner: '180', finals: '108', semis: '65', quarters: '32', r16: '16', r32: '8', bold: false },
        { cat: '3', winner: '72', finals: '43', semis: '26', quarters: '13', r16: '6', r32: '3', bold: false },
        { cat: '4', winner: '29', finals: '17', semis: '10', quarters: '5', r16: '3', r32: '1', bold: false }
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
        { cat: '2', winner: '120', finals: '72', semis: '43', quarters: '22', r16: '11', r32: '5', bold: false },
        { cat: '3', winner: '48', finals: '29', semis: '17', quarters: '9', r16: '4', r32: '2', bold: false }
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

  const downloadCard = async () => {
    if (!printRef.current || !selectedPlayer) return;
    try {
      const dataUrl = await htmlToImage.toPng(printRef.current, {
        quality: 1.0,
        backgroundColor: '#0F172A',
        cacheBust: true,
        pixelRatio: 4,
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const targetWidth = pdfWidth - (margin * 2);
      const targetHeight = (imgProps.height * targetWidth) / imgProps.width;
      const xPos = (pdfWidth - targetWidth) / 2;
      const yPos = (pdfHeight - targetHeight) / 2;

      pdf.addImage(dataUrl, 'PNG', xPos, yPos > 15 ? yPos : 15, targetWidth, targetHeight);
      pdf.save(`${selectedPlayer.name.replace(/\s+/g, '_')}_Profile_Card.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
    }
  };

  const shareCard = async () => {
    if (!selectedPlayer) return;
    try {
      const shareUrl = `${window.location.origin}/players?id=${selectedPlayer.id}`;
      if (navigator.share) {
        await navigator.share({
          title: `${selectedPlayer.name}'s Player Profile`,
          text: `Check out ${selectedPlayer.name}'s player profile on 4M Padel!`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert('Profile link copied to clipboard!');
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

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
            <h2 className="text-3xl font-bold text-white mb-2">SA’s Top Players</h2>
            <p className="text-gray-400">Latest Top 10 Players</p>
          </div>
          <RankingSlider title="Men's Open Top 10" playersData={mensRankings.slice(0, 10)} onPlayerClick={setSelectedPlayer} />
          <RankingSlider title="Ladies Open Top 10" playersData={ladiesRankings.slice(0, 10)} onPlayerClick={setSelectedPlayer} />

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
                            <div
                              onClick={() => {
                                if (player.hasLocalProfile && player.playerRecord) {
                                  setSelectedPlayer(player.playerRecord);
                                } else {
                                  window.open(player.rankedinProfile, '_blank');
                                }
                              }}
                              className="flex items-center gap-3 md:gap-4 group/link cursor-pointer"
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
                                  <span className="text-xs md:text-sm font-bold text-gray-400">{getInitials(player.name)}</span>
                                )}
                              </div>
                              <span className="text-base md:text-lg font-bold text-white group-hover/link:text-padel-green transition-colors truncate max-w-[120px] xs:max-w-[200px] sm:max-w-none">
                                {player.name}
                                {player.hasLocalProfile && (
                                  <span className="ml-2 inline-block px-1.5 py-0.5 rounded-md bg-padel-green/10 text-padel-green text-[8px] font-black uppercase tracking-widest border border-padel-green/20">4M</span>
                                )}
                              </span>
                            </div>
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

      {/* Player Modal */}
      <AnimatePresence>
        {selectedPlayer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPlayer(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] cursor-pointer"
            />
            <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-4">
              <motion.div
                layoutId={`card-${selectedPlayer.id}`}
                ref={cardRef}
                className="w-full max-w-lg bg-[#0F172A] rounded-3xl overflow-hidden shadow-2xl pointer-events-auto relative max-h-[90vh] flex flex-col"
              >
                {/* Close Button */}
                <button
                  onClick={() => setSelectedPlayer(null)}
                  className="absolute top-6 right-6 z-20 w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Image Section */}
                <div className="relative h-[40vh] min-h-[300px] overflow-hidden">
                  {selectedPlayer.image_url ? (
                    <motion.img
                      layoutId={`image-${selectedPlayer.id}`}
                      src={selectedPlayer.image_url}
                      alt={selectedPlayer.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <motion.div
                      layoutId={`image-${selectedPlayer.id}`}
                      className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-white/10"
                    >
                      <Trophy className="w-48 h-48 opacity-10" />
                    </motion.div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-transparent to-black/30" />

                  {/* Big Stats Overlays on Image */}
                  <motion.div layoutId={`level-${selectedPlayer.id}`} className="absolute top-4 left-4 bg-padel-green text-black font-black w-16 h-16 rounded-2xl flex flex-col items-center justify-center border-4 border-black shadow-xl z-20">
                    <span className="text-xs uppercase font-bold opacity-60">SKILL</span>
                    <span className="text-2xl leading-none">{selectedPlayer.skill_rating ? Number(selectedPlayer.skill_rating).toFixed(1) : selectedPlayer.skill_rating || '-'}</span>
                  </motion.div>

                  {selectedPlayer.rankedin_id && (
                    <div className="absolute top-4 right-16 bg-black/40 backdrop-blur-md border border-white/10 text-white font-bold px-4 h-16 rounded-2xl flex flex-col items-center justify-center shadow-xl z-20">
                      <span className="text-[10px] uppercase font-black text-padel-green mb-1">Rankedin ID</span>
                      <span className="text-xs opacity-70 font-mono tracking-tight">{selectedPlayer.rankedin_id}</span>
                    </div>
                  )}

                  {/* Name Overlay */}
                  <div className="absolute bottom-0 left-0 w-full p-8 pl-24 pt-20 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/40 to-transparent">
                    <motion.h2 layoutId={`name-${selectedPlayer.id}`} className="text-4xl md:text-5xl font-black text-white leading-[0.85] tracking-tighter uppercase mb-2 drop-shadow-lg">
                      {selectedPlayer.name.split(' ').map((n, i) => (
                        <span key={i} className="block">{n}</span>
                      ))}
                    </motion.h2>
                    <div className="flex items-center gap-2 text-gray-300 font-medium">
                      <MapPin className="w-4 h-4 text-padel-green" />
                      {selectedPlayer.home_club}, {selectedPlayer.nationality}
                      {selectedPlayer.age && <span className="ml-2 px-2 py-0.5 bg-white/10 rounded text-xs font-bold uppercase">AGE: {selectedPlayer.age}</span>}
                      {selectedPlayer.instagram_link && (
                        <a 
                          href={selectedPlayer.instagram_link.startsWith('http') ? selectedPlayer.instagram_link : `https://instagram.com/${selectedPlayer.instagram_link.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 p-1.5 bg-white/10 hover:bg-padel-green hover:text-black rounded-lg transition-all"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Instagram size={14} />
                        </a>
                      )}
                    </div>

                    <motion.div layoutId={`category-${selectedPlayer.id}`} className="mt-4 bg-white/10 backdrop-blur-md border border-white/20 text-white font-bold px-4 py-2 rounded-xl inline-flex flex-col items-start shadow-xl">
                      <span className="text-[10px] uppercase font-bold text-padel-green mb-0.5 tracking-wider">Category</span>
                      <span className="text-sm">{selectedPlayer.category}</span>
                    </motion.div>
                  </div>
                </div>

                {/* Content Section (Scrollable) */}
                <div className="p-8 pb-12 space-y-8 overflow-y-auto flex-1 bg-[#0F172A] border-t border-white/5">
                  {/* Bio */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Player Bio</h4>
                    <p className="text-gray-300 leading-relaxed text-lg">
                      {selectedPlayer.bio}
                    </p>
                  </div>

                  {/* Skill Rating Widget */}
                  {selectedPlayer.skill_rating && (
                    <div className="bg-white/5 rounded-3xl p-6 border border-white/10 flex items-center gap-6 relative overflow-hidden group/skill">
                      <div className="absolute inset-0 bg-padel-green/5 opacity-0 group-hover/skill:opacity-100 transition-opacity" />
                      <div className="relative w-24 h-24">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                          <motion.circle
                            initial={{ strokeDashoffset: 283 }}
                            animate={{ strokeDashoffset: 283 - (283 * Math.min(selectedPlayer.skill_rating, 30) / 30) }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                            cx="50" cy="50" r="45" fill="none" stroke="#beff00" strokeWidth="8"
                            strokeDasharray="283"
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-black text-white">{selectedPlayer.skill_rating}</span>
                          <span className="text-[8px] uppercase font-black text-padel-green">Rating</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-black text-white uppercase tracking-tight mb-1">Rankedin Skill Level</h4>
                        <p className="text-xs text-gray-400 leading-relaxed font-bold uppercase tracking-wider opacity-60">
                          Live performance index based on match intensity and win quality.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Recent Form */}
                  {selectedPlayer.match_form && (
                    <div className="flex items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl">
                      <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Recent Form</h4>
                      <div className="flex gap-2">
                        {String(selectedPlayer.match_form).split(/\s+/).filter(Boolean).map((f, i) => (
                          <div key={i} className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shadow-lg ${f === 'W' ? 'bg-padel-green text-black' : 'bg-red-500 text-white'}`}>
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Organizational Rankings */}
                  {selectedPlayer.rankings && selectedPlayer.rankings.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Organizational Rankings</h4>
                      <div className="grid grid-cols-1 gap-3">
                        {selectedPlayer.rankings.map((r, i) => (
                          <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-colors group">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-[10px] font-black text-padel-green uppercase tracking-widest">{r.org || 'Ranking'}</p>
                                  <span className="text-[10px] text-gray-600 font-bold">•</span>
                                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{r.match_type || 'Doubles'}</p>
                                </div>
                                <p className="text-lg font-bold text-white tracking-tight leading-tight mb-1">{r.age_group || r.division || 'Open'}</p>
                              </div>
                              <div className="flex gap-4">
                                <div className="text-right">
                                  <p className="text-[8px] text-gray-500 uppercase font-black tracking-widest mb-0.5">Rank</p>
                                  <div className="flex items-baseline gap-0.5 justify-end">
                                    <span className="text-padel-green text-[10px] font-black">#</span>
                                    <span className="text-xl font-black text-white tracking-tighter">{r.rank}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-[8px] text-gray-500 uppercase font-black tracking-widest mb-0.5">Points</p>
                                  <p className="text-xl font-black text-white tracking-tighter">{r.points}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sponsors */}
                  {selectedPlayer.sponsors && selectedPlayer.sponsors.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Sponsors</h4>
                      <div className="flex gap-4">
                        {selectedPlayer.sponsors.map(sponsor => (
                          <div key={sponsor} className="px-4 py-2 border border-white/10 rounded-lg text-sm font-bold text-gray-400 bg-white/5">
                            {sponsor}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Download & Share Section for Owners */}
                  {userEmail === selectedPlayer.email && (
                    <div className="flex gap-4 pt-4">
                      <button
                        onClick={downloadCard}
                        className="flex-1 bg-padel-green text-black font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 hover:bg-white transition-all pointer-events-auto"
                      >
                        <Download size={18} />
                        Download Card
                      </button>
                      <button
                        onClick={shareCard}
                        className="bg-white/10 hover:bg-white text-white hover:text-black transition-all p-3 rounded-xl flex items-center justify-center pointer-events-auto"
                      >
                        <Share2 size={20} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Hidden Print Template */}
            <div className="fixed -left-[2000px] top-0 pointer-events-none">
              <div
                ref={printRef}
                className="w-[600px] bg-[#0F172A] text-white rounded-[40px] overflow-hidden"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {/* Header Image Area */}
                <div className="relative h-[450px] w-full">
                  {selectedPlayer.image_url ? (
                    <img src={selectedPlayer.image_url} crossOrigin="anonymous" className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                      <Trophy size={140} className="text-white/10" />
                    </div>
                  )}
                  {/* Overlays */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-transparent to-black/30" />

                  {/* Badges */}
                  <div className="absolute top-10 left-10 bg-padel-green text-black font-black w-24 h-24 rounded-3xl flex flex-col items-center justify-center border-[6px] border-black shadow-2xl">
                    <span className="text-sm uppercase font-extrabold opacity-60">SKILL</span>
                    <span className="text-4xl leading-none">{selectedPlayer.skill_rating ? Number(selectedPlayer.skill_rating).toFixed(1) : selectedPlayer.skill_rating || '-'}</span>
                  </div>

                  {/* Name Overlay */}
                  <div className="absolute bottom-12 left-12 right-12">
                    <h1 className="text-6xl font-black uppercase tracking-tighter leading-[0.82] mb-4 drop-shadow-2xl">
                      {selectedPlayer.name.split(' ').map((n, i) => (
                        <span key={i} className="block">{n}</span>
                      ))}
                    </h1>
                    <div className="flex items-center gap-3 text-padel-green text-2xl font-bold uppercase tracking-[0.15em] drop-shadow-lg">
                      <MapPin size={28} />
                      {selectedPlayer.home_club}
                    </div>
                  </div>
                </div>

                {/* Stats and Info Area */}
                <div className="p-12 space-y-12 border-t border-white/5 bg-[#0F172A]">
                  {/* Bio Section */}
                  <div>
                    <h4 className="text-sm font-black text-gray-500 uppercase tracking-[0.3em] mb-6">Player Bio</h4>
                    <p className="text-2xl text-gray-300 leading-relaxed font-medium py-2">
                      {selectedPlayer.bio || "Pro player at 4M Padel Community."}
                    </p>
                  </div>

                  {/* Rankings in Print Template */}
                  {selectedPlayer.rankings && selectedPlayer.rankings.length > 0 && (
                    <div className="bg-white/5 rounded-[32px] p-8 border border-white/10">
                      <h4 className="text-sm font-black text-gray-500 uppercase tracking-[0.3em] mb-8">Official Rankings</h4>
                      <div className="space-y-4">
                        {selectedPlayer.rankings.map((r, i) => (
                          <div key={i} className="flex items-center justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0">
                            <div>
                              <p className="text-padel-green text-xs font-black uppercase tracking-widest mb-1">{r.org}</p>
                              <p className="text-xl font-bold text-white">{r.age_group || 'Open'}</p>
                              <p className="text-sm text-gray-500 font-bold uppercase">{r.match_type}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Rank</p>
                              <p className="text-3xl font-black text-white">#{r.rank}</p>
                              <p className="text-sm text-padel-green font-bold">{r.points} PTS</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sponsors Section */}
                  {selectedPlayer.sponsors && selectedPlayer.sponsors.length > 0 && (
                    <div>
                      <h4 className="text-sm font-black text-gray-500 uppercase tracking-[0.3em] mb-8">Official Sponsors</h4>
                      <div className="flex flex-wrap gap-4">
                        {selectedPlayer.sponsors.map(sponsor => (
                          <div key={sponsor} className="px-8 py-4 border border-white/10 rounded-2xl text-xl font-black text-gray-300 bg-white/5 uppercase tracking-wide">
                            {sponsor}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bottom Footer */}
                  <div className="pt-12 mt-4 border-t border-white/5 flex items-center justify-between opacity-30">
                    <span className="text-xs font-black uppercase tracking-[0.5em]">4M Padel Community</span>
                    <span className="text-xs font-bold font-mono uppercase tracking-widest">PRO-CARD | 2026</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Rankings;
