import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from '../components/Navbar';
import { Search, Filter, Trophy, ArrowUpRight, Zap, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import heroBg from '../assets/hero_bg.png';
import PlayerModal from '../components/PlayerModal';

const Players = () => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedClub, setSelectedClub] = useState('All');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [userEmail, setUserEmail] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);

  useEffect(() => {
    const fetchPlayers = async () => {
      setLoading(true);

      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setUserEmail(session.user.email);
      }

      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('approved', true)
        .eq('paid_registration', true)
        .eq('license_type', 'full')
        .order('points', { ascending: false });


      if (!error && data) {
        const categoryCounts = {};
        const processedPlayers = data.map(player => {
          let sponsorsList = [];
          if (player.sponsors) {
            try {
              sponsorsList = JSON.parse(player.sponsors);
              if (!Array.isArray(sponsorsList)) sponsorsList = [player.sponsors];
            } catch (e) {
              sponsorsList = player.sponsors.split(',').map(s => s.trim()).filter(Boolean);
            }
          }

          let safeAdditionalImages = [];
          if (Array.isArray(player.additional_images)) {
            safeAdditionalImages = player.additional_images;
          } else if (typeof player.additional_images === 'string') {
            const trimmed = player.additional_images.trim();
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
              try {
                safeAdditionalImages = JSON.parse(trimmed);
              } catch (e) {
                safeAdditionalImages = [];
              }
            }
          }

          // Check top 10 status
          const cat = player.category;
          let isTop10 = false;
          if (cat) {
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            if (categoryCounts[cat] <= 10) {
              isTop10 = true;
            }
          }

          return {
            ...player,
            image_url: player.image_url || '',
            sponsors: sponsorsList,
            additional_images: safeAdditionalImages,
            hasGallery: safeAdditionalImages.length > 0,
            isTop10,
          };
        });
        setPlayers(processedPlayers);

        // Handle deep-linking from URL (?id=...)
        const playerId = searchParams.get('id');
        if (playerId) {
          const linkedPlayer = processedPlayers.find(p => p.id.toString() === playerId);
          if (linkedPlayer) setSelectedPlayer(linkedPlayer);
        }
      }
      setLoading(false);
    };
    fetchPlayers();
  }, [searchParams]);

  // Extract unique options for filters
  const categories = useMemo(() => ['All', ...new Set(players.map(p => p.category).filter(Boolean))], [players]);
  const clubs = useMemo(() => ['All', ...new Set(players.map(p => p.home_club).filter(Boolean))], [players]);

  // Filter players
  const filteredPlayers = useMemo(() => {
    return players.filter(player => {
      const matchesSearch = player.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || player.category === selectedCategory;
      const matchesClub = selectedClub === 'All' || player.home_club === selectedClub;
      return matchesSearch && matchesCategory && matchesClub;
    });
  }, [players, searchTerm, selectedCategory, selectedClub]);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(24);
  }, [searchTerm, selectedCategory, selectedClub]);

  const handleSetSelectedPlayer = (player) => {
    setSelectedPlayer(player);
    if (player) {
      setSearchParams({ id: player.id });
    } else {
      setSearchParams({});
    }
  };

  return (
    <>
      <Helmet>
        <title>Players | 4M Padel</title>
        {selectedPlayer && (
          <>
            <meta property="og:title" content={`${selectedPlayer.name} - Player Profile`} />
            <meta property="og:description" content={`Division: ${selectedPlayer.category} | Skill: ${selectedPlayer.skill_rating || '-'}`} />
            {selectedPlayer.image_url && <meta property="og:image" content={selectedPlayer.image_url} />}
            <meta property="og:type" content="profile" />
          </>
        )}
      </Helmet>
      <main className="bg-[#060a14] min-h-screen pb-24 text-white relative overflow-hidden">

        {/* Ambient Neon Glow Bubbles */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-padel-green/5 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute top-[40vh] right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[150px] pointer-events-none" />

        {/* Unified Header */}
        <section className="relative z-20 flex flex-col justify-start pt-6 md:pt-28 lg:pt-32 pb-4 md:pb-12 px-4 container mx-auto">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-padel-green/20 text-padel-green bg-padel-green/5 text-[10px] md:text-[11px] font-bold uppercase tracking-widest mb-6 max-w-fit">
            <Trophy className="w-3 h-3" />
            <span>COMPETE. RANK. WIN.</span>
          </div>

          <div className="overflow-hidden mb-6">
            <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-[110px] xl:text-[130px] font-bold text-white leading-[1.1] md:leading-[0.9] tracking-tighter max-w-[100vw] font-display whitespace-nowrap lg:whitespace-normal">
              PLAYER <span className="text-transparent bg-clip-text bg-gradient-to-r from-padel-green to-[#beff00]">DIRECTORY</span>
            </h1>
          </div>

          <p className="text-gray-200 text-sm md:text-lg lg:text-xl max-w-4xl mb-2 leading-relaxed font-light whitespace-normal tracking-tight sm:tracking-normal">
            <strong className="text-white font-medium">Meet the elite talent driving the sport forward.</strong> <span className="text-gray-500/70 text-[10px] md:text-xs max-w-2xl mt-1 mb-2 md:mb-8 font-medium tracking-wide block sm:inline">-*Only players holding a valid Player's License are listed</span>
          </p>
        </section>

        {/* Search & Command Deck */}
        <section className="container mx-auto px-6 pt-0 md:pt-0 mt-0 md:-mt-12 relative z-20 mb-12">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-[#0a0f1d]/80 border border-white/10 backdrop-blur-2xl p-3 md:p-4 rounded-2xl md:rounded-3xl flex gap-3 items-center shadow-2xl max-w-4xl mx-auto"
          >
            {/* Search Input Container */}
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5" />
              <input
                type="text"
                placeholder="Search Players..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-2xl py-3 md:py-3.5 pl-10 md:pl-12 pr-4 text-[16px] md:text-base text-white focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all"
              />
            </div>

            {/* Filters Button */}
            <button
              onClick={() => setShowFilters(true)}
              className="relative flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-3.5 text-white transition-all font-semibold text-sm md:text-base shrink-0 group"
            >
              <Filter className="w-4 h-4 md:w-5 md:h-5 text-gray-400 group-hover:text-white transition-colors" />
              <span className="hidden sm:block">Filters</span>
              {/* Active filters badge */}
              {(selectedCategory !== 'All' || selectedClub !== 'All') && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 md:w-5 md:h-5 bg-padel-green text-black font-black text-[10px] md:text-xs rounded-full flex items-center justify-center shadow-lg">
                  {(selectedCategory !== 'All' ? 1 : 0) + (selectedClub !== 'All' ? 1 : 0)}
                </span>
              )}
            </button>
          </motion.div>

          {/* Quick Category Filters */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex overflow-x-auto md:justify-center gap-2 pb-2 mt-4 hide-scrollbar"
          >
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all uppercase tracking-widest border ${selectedCategory === cat
                  ? 'bg-padel-green text-black border-padel-green'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/20 hover:text-white'
                  }`}
              >
                {cat}
              </button>
            ))}
          </motion.div>
        </section>

        {/* Filters Drawer/Bottom Sheet */}
        <AnimatePresence>
          {showFilters && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowFilters(false)}
                className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
              />

              {/* Drawer */}
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed bottom-0 left-0 right-0 z-[1001] bg-[#0a0f1d] border-t border-white/10 rounded-t-3xl p-6 shadow-2xl flex flex-col gap-6 max-h-[85vh] overflow-y-auto md:max-w-md md:left-1/2 md:-translate-x-1/2 md:bottom-4 md:border md:rounded-3xl"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">Filters</h3>
                  <button onClick={() => setShowFilters(false)} className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-full transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Category */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-300">Category</label>
                    <div className="relative">
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-4 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-padel-green transition-colors font-semibold text-sm"
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat} className="bg-[#0a0f1d] text-white">
                            {cat === 'All' ? 'All Categories' : cat}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Club */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-300">Club</label>
                    <div className="relative">
                      <select
                        value={selectedClub}
                        onChange={(e) => setSelectedClub(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-4 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-padel-green transition-colors font-semibold text-sm"
                      >
                        {clubs.map(club => (
                          <option key={club} value={club} className="bg-[#0a0f1d] text-white">
                            {club === 'All' ? 'All Clubs' : club}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedCategory('All');
                      setSelectedClub('All');
                    }}
                    className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setShowFilters(false)}
                    className="flex-1 bg-padel-green hover:bg-[#beff00] text-black font-bold py-3.5 rounded-xl transition-colors text-sm"
                  >
                    Show Results
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Players Grid */}
        <section className="container mx-auto px-6">
          <div className="mb-4 text-gray-400 text-xs sm:text-sm font-black uppercase tracking-widest">
            {filteredPlayers.length} PLAYERS FOUND
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-4 md:gap-6">
            {filteredPlayers.length > 0 ? (
              filteredPlayers.slice(0, visibleCount).map((player, index) => (
                <motion.div
                  layoutId={`card-${player.id}`}
                  key={player.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min((index % 24) * 0.03, 0.2) }}
                  onClick={() => handleSetSelectedPlayer(player)}
                  className={`group relative bg-[#0a0f1d]/60 border md:hover:border-padel-green rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden md:hover:shadow-[0_0_35px_rgba(190,255,0,0.15)] transition-all duration-500 cursor-pointer flex flex-col justify-between ${player.isTop10 ? 'border-[#FFD700]' : 'border-white/10'}`}
                >
                  {/* Invisible Click Catch-all for Mobile */}
                  <div className="absolute inset-0 z-[5]" />
                  {/* Photo Section */}
                  <div className="aspect-square bg-gradient-to-br from-gray-900 to-[#0a0f1d] relative overflow-hidden shrink-0">
                    {player.image_url ? (
                      <motion.img
                        layoutId={`image-${player.id}`}
                        src={player.image_url}
                        alt={player.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-700 md:group-hover:scale-105"
                      />
                    ) : (
                      <motion.div
                        layoutId={`image-${player.id}`}
                        className="w-full h-full flex items-center justify-center text-white/5"
                      >
                        <svg className="w-12 h-12 sm:w-20 sm:h-20" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </motion.div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1d] via-[#0a0f1d]/20 to-black/25" />

                    {/* Category Overlay Capsule */}
                    {player.category && (
                      <motion.div layoutId={`category-${player.id}`} className="absolute top-2 right-1 sm:top-3 sm:right-3 bg-[#0a0f1d]/75 backdrop-blur-md border border-white/10 text-padel-green font-bold sm:font-black px-1 py-0.5 sm:px-1.5 sm:py-0.5 rounded sm:rounded-md text-[4px] sm:text-[7px] uppercase tracking-widest z-10 shadow-lg max-w-[50%] text-center truncate">
                        {player.category}
                      </motion.div>
                    )}

                    {/* Rank Overlay Capsule */}
                    <motion.div layoutId={`level-${player.id}`} className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-[#0a0f1d]/75 backdrop-blur-md border border-white/10 text-white font-bold w-7 h-7 sm:w-10 sm:h-10 rounded-md sm:rounded-lg flex flex-col items-center justify-center text-[7px] sm:text-[10px] z-10 shadow-lg">
                      <span className="text-[5px] sm:text-[7px] uppercase font-black text-padel-green opacity-80 leading-none mb-0.5">Rank</span>
                      <span className="text-[7px] sm:text-[10px] font-black">
                        {(!player.rank_label || player.rank_label === 'Unranked') ? '-' : `#${player.rank_label}`}
                      </span>
                    </motion.div>

                    {/* Pro Overlay Button */}
                    <div className="absolute inset-0 bg-black/45 opacity-0 md:group-hover:opacity-100 transition-all duration-300 flex items-center justify-center pointer-events-none">
                      <span className="bg-padel-green text-black px-2 py-1 sm:px-4 sm:py-2 rounded-md sm:rounded-xl font-black text-[6px] sm:text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-1 transform translate-y-4 md:group-hover:translate-y-0 transition-transform duration-300">
                        Pro Card
                        <ArrowUpRight size={10} />
                      </span>
                    </div>
                  </div>

                  {/* Player Content Details Section */}
                  <div className="p-2 sm:p-4 relative flex-1 flex flex-col justify-between bg-[#0a0f1d]/85">
                    <div className="absolute -top-10 left-0 right-0 h-10 bg-gradient-to-t from-[#0a0f1d] to-transparent pointer-events-none" />

                    <div>
                      <motion.h3 layoutId={`name-${player.id}`} className="text-[8px] sm:text-base font-bold sm:font-black text-white leading-none uppercase tracking-tighter mb-1.5 sm:mb-2 md:group-hover:text-padel-green transition-colors line-clamp-1 relative z-10">
                        {player.name}
                      </motion.h3>

                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="col-span-full text-center py-24 text-gray-500">
                <Zap size={44} className="mx-auto text-gray-600 mb-4 animate-pulse" />
                <p className="text-lg font-bold">No players found matching your criteria.</p>
                <button
                  onClick={() => { setSearchTerm(''); setSelectedCategory('All'); setSelectedClub('All'); }}
                  className="mt-4 text-padel-green hover:underline uppercase text-xs tracking-widest font-black"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          {/* Load More Button */}
          {visibleCount < filteredPlayers.length && (
            <div className="mt-8 flex justify-center pb-8">
              <button
                onClick={() => setVisibleCount(prev => prev + 24)}
                className="bg-white/5 border border-white/10 hover:bg-white/10 hover:border-padel-green text-white font-bold py-3 px-8 rounded-xl transition-all uppercase tracking-widest text-xs shadow-lg group flex items-center gap-2"
              >
                Load More Players
                <svg className="w-4 h-4 text-gray-400 group-hover:text-padel-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}
        </section>

        {/* Player Modal Overlay container */}
        <AnimatePresence>
          {selectedPlayer && (
            <PlayerModal
              player={selectedPlayer}
              onClose={() => handleSetSelectedPlayer(null)}
              userEmail={userEmail}
            />
          )}
        </AnimatePresence>
      </main>
    </>
  );
};

export default Players;
