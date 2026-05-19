import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from '../components/Navbar';
import { Search, Filter, MapPin, Trophy, Instagram, ArrowUpRight, Zap } from 'lucide-react';
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
          return {
            ...player,
            image_url: player.image_url || '',
            sponsors: sponsorsList,
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

        {/* Hero Section */}
        <section className="relative h-[45vh] min-h-[420px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              src={heroBg}
              alt="Players Hero"
              className="w-full h-full object-cover opacity-20"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#060a14] via-[#060a14]/65 to-transparent" />
          </div>

          <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl md:text-8xl font-black font-display mb-6 uppercase tracking-tighter"
            >
              Our <span className="bg-gradient-to-r from-padel-green to-[#beff00] bg-clip-text text-transparent">Players</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-gray-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed"
            >
              Meet the elite talent driving the sport forward. From rising tournament stars to seasoned SAPA champions.
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-gray-500 text-xs max-w-2xl mx-auto mt-3.5 uppercase tracking-widest font-black"
            >
              *Only players holding a valid SAPA Player’s License are listed
            </motion.p>
          </div>
        </section>

        {/* Search & Command Deck */}
        <section className="container mx-auto px-6 -mt-12 relative z-20 mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/[0.03] border border-white/10 backdrop-blur-2xl p-6 rounded-3xl flex flex-col md:flex-row gap-4 items-center justify-between shadow-2xl"
          >
            {/* Search Input Container */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search pro players..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all"
              />
            </div>

            {/* Glass Dropdown Selectors */}
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <div className="relative min-w-[190px]">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-450 w-4 h-4" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-10 pr-8 text-white appearance-none cursor-pointer hover:border-white/30 focus:outline-none focus:border-padel-green transition-colors font-semibold"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat} className="bg-[#0a0f1d] text-white font-semibold">
                      {cat === 'All' ? 'All Categories' : cat}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-450" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="relative min-w-[190px]">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-450 w-4 h-4" />
                <select
                  value={selectedClub}
                  onChange={(e) => setSelectedClub(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-10 pr-8 text-white appearance-none cursor-pointer hover:border-white/30 focus:outline-none focus:border-padel-green transition-colors font-semibold"
                >
                  {clubs.map(club => (
                    <option key={club} value={club} className="bg-[#0a0f1d] text-white font-semibold">
                      {club === 'All' ? 'All Clubs' : club}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-455" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Players Grid */}
        <section className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map((player, index) => (
                <motion.div
                  layoutId={`card-${player.id}`}
                  key={player.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.05, 0.5) }}
                  onClick={() => handleSetSelectedPlayer(player)}
                  className="group relative bg-[#0a0f1d]/60 border border-white/10 hover:border-padel-green rounded-[2rem] overflow-hidden hover:shadow-[0_0_35px_rgba(190,255,0,0.15)] transition-all duration-500 cursor-pointer flex flex-col justify-between"
                >
                  {/* Photo Section */}
                  <div className="aspect-[4/5] bg-gradient-to-br from-gray-900 to-[#0a0f1d] relative overflow-hidden shrink-0">
                    {player.image_url ? (
                      <motion.img
                        layoutId={`image-${player.id}`}
                        src={player.image_url}
                        alt={player.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <motion.div
                        layoutId={`image-${player.id}`}
                        className="w-full h-full flex items-center justify-center text-white/5"
                      >
                        <svg className="w-28 h-28" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </motion.div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1d] via-[#0a0f1d]/20 to-black/25" />

                    {/* Category Overlay Capsule */}
                    <motion.div layoutId={`category-${player.id}`} className="absolute top-5 right-5 bg-[#0a0f1d]/75 backdrop-blur-md border border-white/10 text-padel-green font-black px-3.5 py-1.5 rounded-xl text-[9px] uppercase tracking-widest z-10 shadow-lg">
                      {player.category || 'Open'}
                    </motion.div>

                    {/* Rank Overlay Capsule */}
                    <motion.div layoutId={`level-${player.id}`} className="absolute top-5 left-5 bg-[#0a0f1d]/75 backdrop-blur-md border border-white/10 text-white font-bold w-12 h-12 rounded-xl flex flex-col items-center justify-center text-[10px] z-10 shadow-lg">
                      <span className="text-[7px] uppercase font-black text-padel-green opacity-80 leading-none mb-0.5">Rank</span>
                      <span className="text-xs font-black">
                        {(!player.rank_label || player.rank_label === 'Unranked') ? '-' : `#${player.rank_label}`}
                      </span>
                    </motion.div>

                    {/* Pro Overlay Button */}
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
                      <span className="bg-padel-green text-black px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-1.5 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                        View Pro Card
                        <ArrowUpRight size={13} />
                      </span>
                    </div>
                  </div>

                  {/* Player Content Details Section */}
                  <div className="p-6 relative flex-1 flex flex-col justify-between bg-[#0a0f1d]/85">
                    <div className="absolute -top-10 left-0 right-0 h-10 bg-gradient-to-t from-[#0a0f1d] to-transparent pointer-events-none" />

                    <div>
                      <motion.h3 layoutId={`name-${player.id}`} className="text-xl font-black text-white leading-none uppercase tracking-tighter mb-3.5 group-hover:text-padel-green transition-colors">
                        {player.name}
                      </motion.h3>

                      {/* Info Badges & Social Row */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-gray-300 font-semibold mb-4">
                        <div className="flex items-center gap-1 bg-white/5 border border-white/5 px-2.5 py-1 rounded-lg">
                          <MapPin className="w-3 h-3 text-padel-green" />
                          <span>{player.nationality}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-white/5 border border-white/5 px-2.5 py-1 rounded-lg">
                          <Trophy className="w-3 h-3 text-padel-green" />
                          <span className="truncate max-w-[90px]">{player.home_club || 'No Club'}</span>
                        </div>
                        {player.instagram_link && (
                          <a 
                            href={player.instagram_link.startsWith('http') ? player.instagram_link : `https://instagram.com/${player.instagram_link.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white/5 border border-white/5 hover:bg-padel-green hover:text-black p-1.5 rounded-lg transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Instagram className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {player.bio && (
                      <p className="text-xs text-gray-400 line-clamp-2 italic font-medium leading-relaxed border-t border-white/5 pt-3.5 mt-auto">
                        "{player.bio}"
                      </p>
                    )}
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
