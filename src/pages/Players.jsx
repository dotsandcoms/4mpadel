import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, Filter, Trophy, ChevronRight, Zap, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import playersHero from '../assets/players-hero.png';
import PlayerModal from '../components/PlayerModal';

const formatPoints = (pts) => {
  const n = Number(pts);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-ZA').replace(/,/g, ' ');
};

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

      // All registered (approved) players — paginated, since supabase caps
      // un-ranged selects at 1000 rows.
      const PAGE = 1000;
      const data = [];
      let error = null;
      for (let from = 0; ; from += PAGE) {
        const { data: page, error: pageError } = await supabase
          .from('players_public')
          .select('*')
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (pageError) { error = pageError; break; }
        data.push(...(page || []));
        if (!page || page.length < PAGE) break;
      }


      if (!error && data) {
        // Top-10 highlight is by points within each category, independent of list sort
        const top10ByCategory = new Set();
        const byCategory = {};
        data.forEach((player) => {
          const cat = player.category;
          if (!cat) return;
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(player);
        });
        Object.values(byCategory).forEach((list) => {
          [...list]
            .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0))
            .slice(0, 10)
            .forEach((p) => top10ByCategory.add(p.id));
        });

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

          return {
            ...player,
            image_url: player.image_url || '',
            sponsors: sponsorsList,
            additional_images: safeAdditionalImages,
            hasGallery: safeAdditionalImages.length > 0,
            isTop10: top10ByCategory.has(player.id),
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

  const rankDisplay = (player, index) => {
    if (player.rank_label && player.rank_label !== 'Unranked') {
      return `#${player.rank_label}`;
    }
    return `#${index + 1}`;
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
      <main className="bg-[#000000] min-h-screen pb-24 text-white relative overflow-hidden pt-[53px] md:pt-0">

        {/* Ambient Neon Glow Bubbles */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-padel-green/5 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute top-[40vh] right-1/4 w-[500px] h-[500px] bg-white/5 rounded-full blur-[150px] pointer-events-none" />

        {/* Hero — full-bleed photo with title/search overlaid (same pattern as Calendar) */}
        <section className="relative z-20 w-full max-w-[1440px] mx-auto px-4 xl:px-8 pt-12 md:pt-28 lg:pt-32 pb-4 md:pb-6 mb-3 md:mb-4">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-0 w-screen h-[62vw] max-h-[420px] md:h-[38vw] md:max-h-[560px] lg:max-h-[600px] min-h-[260px] overflow-hidden">
            <div className="absolute inset-0">
              <img
                src={playersHero}
                alt=""
                className="w-full h-full object-cover object-[70%_top] md:object-[65%_top] md:origin-top grayscale contrast-[1.3] brightness-[1.08] animate-hero-zoom md:animate-hero-zoom-out"
              />
            </div>
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 48%, rgba(0,0,0,0.5) 100%)' }} />
            {/* Left-side black wash so hero copy stays readable over the player photo */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black via-black/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-[#000000]/40 to-[#000000]" />
          </div>

          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-padel-green/20 text-padel-green bg-padel-green/5 text-[10px] md:text-[11px] font-bold uppercase tracking-widest mb-3 max-w-fit">
              <Trophy className="w-3 h-3" />
              <span>COMPETE. RANK. WIN.</span>
            </div>

            <div className="overflow-hidden">
              <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white leading-[1.05] md:leading-[0.95] tracking-tighter font-display drop-shadow-[0_4px_16px_rgba(0,0,0,0.55)]">
                PLAYERS
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-padel-green to-[#beff00]">DIRECTORY</span>
              </h1>
            </div>
            <p className="text-gray-200 text-sm md:text-base lg:text-lg max-w-md leading-snug font-light drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] mt-1.5">
              <strong className="text-white font-medium">
                Meet the talent driving the sport forward.
              </strong>
            </p>
           
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="relative z-10 flex gap-1.5 md:gap-0 items-center w-full mt-5 md:mt-6"
          >
            <div className="relative flex-1 bg-[#181818] border border-white/5 rounded-full shadow-lg">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 md:w-5 md:h-5" />
              <input
                type="text"
                placeholder="Search players..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent py-3 md:py-4 pl-12 md:pl-14 pr-4 text-[14px] md:text-base text-white focus:outline-none placeholder-gray-500 rounded-full"
              />
            </div>

            <button
              onClick={() => setShowFilters(true)}
              className="relative flex items-center justify-center gap-2 bg-[#181818] border border-white/5 hover:bg-white/10 rounded-full px-5 md:px-6 py-3 md:py-4 text-gray-300 hover:text-white transition-all font-semibold text-sm md:text-base shrink-0 group shadow-lg"
            >
              <Filter className="w-4 h-4 md:w-5 md:h-5 text-gray-400 group-hover:text-white transition-colors" />
              <span className="hidden sm:block">Filters</span>
              {(selectedCategory !== 'All' || selectedClub !== 'All') && (
                <span className="w-5 h-5 bg-[#CCFF00] text-black font-black text-[10px] md:text-xs rounded-full flex items-center justify-center shadow-lg ml-1">
                  {(selectedCategory !== 'All' ? 1 : 0) + (selectedClub !== 'All' ? 1 : 0)}
                </span>
              )}
            </button>
          </motion.div>
        </section>

        {/* Quick Category Filters */}
        <section className="w-full max-w-[1440px] mx-auto px-4 xl:px-8 relative z-20 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex overflow-x-auto gap-2 pb-2 hide-scrollbar w-full"
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
                {cat === 'All' ? 'All Players' : cat}
              </button>
            ))}
          </motion.div>
        </section>

        {/* Filters Drawer/Bottom Sheet */}
        <AnimatePresence>
          {showFilters && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowFilters(false)}
                className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
              />

              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed bottom-0 left-0 right-0 z-[1001] bg-[#141414] border-t border-white/10 rounded-t-3xl p-6 pb-28 md:pb-6 shadow-2xl flex flex-col gap-6 max-h-[85vh] overflow-y-auto md:max-w-md md:left-1/2 md:-translate-x-1/2 md:bottom-4 md:border md:rounded-3xl"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">Filters</h3>
                  <button onClick={() => setShowFilters(false)} className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-full transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-300">Category</label>
                    <div className="relative">
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-4 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-padel-green transition-colors font-semibold text-sm"
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat} className="bg-[#141414] text-white">
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

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-300">Club</label>
                    <div className="relative">
                      <select
                        value={selectedClub}
                        onChange={(e) => setSelectedClub(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-4 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-padel-green transition-colors font-semibold text-sm"
                      >
                        {clubs.map(club => (
                          <option key={club} value={club} className="bg-[#141414] text-white">
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

        {/* Players List */}
        <section className="w-full max-w-[1440px] mx-auto px-4 xl:px-8 relative z-20">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-gray-300 text-[11px] sm:text-sm font-black uppercase tracking-widest">
              All Players
            </h2>
          </div>

          <div className="flex flex-col gap-2.5 sm:gap-3 w-full">
            {filteredPlayers.length > 0 ? (
              filteredPlayers.slice(0, visibleCount).map((player, index) => (
                <motion.button
                  type="button"
                  key={player.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min((index % 24) * 0.02, 0.15) }}
                  onClick={() => handleSetSelectedPlayer(player)}
                  className="w-full group flex items-center gap-3 sm:gap-4 bg-[#141414] border border-white/8 hover:border-padel-green/40 rounded-2xl px-3 py-3 sm:px-4 sm:py-3.5 text-left transition-all cursor-pointer shadow-sm"
                >
                  {/* Rank */}
                  <div className="shrink-0 w-11 sm:w-12 flex flex-col items-center justify-center rounded-xl bg-black/40 border border-white/5 py-1.5">
                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-padel-green leading-none">Rank</span>
                    <span className="text-sm sm:text-base font-black text-white tabular-nums leading-tight mt-0.5">
                      {rankDisplay(player, index)}
                    </span>
                  </div>

                  {/* Avatar */}
                  <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden bg-gradient-to-br from-gray-800 to-[#141414] border border-white/10">
                    {player.image_url ? (
                      <img
                        src={player.image_url}
                        alt={player.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/15">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-sm sm:text-base font-bold uppercase tracking-tight truncate group-hover:text-padel-green transition-colors ${player.isTop10 ? 'text-[#FFD700]' : 'text-white'}`}>
                      {player.name}
                    </h3>
                    {player.category && (
                      <p className="text-[10px] sm:text-xs text-gray-500 font-medium truncate mt-0.5">
                        {player.category}
                      </p>
                    )}
                  </div>

                  {/* Points */}
                  <div className="shrink-0 text-right">
                    <div className="text-base sm:text-lg font-black text-white tabular-nums leading-none">
                      {formatPoints(player.points)}
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-gray-500 mt-0.5">
                      Points
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-padel-green shrink-0" />
                </motion.button>
              ))
            ) : (
              <div className="text-center py-24 text-gray-500">
                <Zap size={44} className="mx-auto text-gray-600 mb-4 animate-pulse" />
                <p className="text-lg font-bold">
                  {loading ? 'Loading players…' : 'No players found matching your criteria.'}
                </p>
                {!loading && (
                  <button
                    onClick={() => { setSearchTerm(''); setSelectedCategory('All'); setSelectedClub('All'); }}
                    className="mt-4 text-padel-green hover:underline uppercase text-xs tracking-widest font-black"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          {visibleCount < filteredPlayers.length && (
            <div className="mt-8 flex justify-center pb-8 w-full">
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
