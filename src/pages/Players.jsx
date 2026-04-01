import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from '../components/Navbar';
import { Search, Filter, MapPin, Trophy, Instagram } from 'lucide-react';
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
      <main className="bg-[#0F172A] min-h-screen pb-12 text-white relative">
        {/* Hero Section */}
        <section className="relative h-[40vh] min-h-[400px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              src={heroBg}
              alt="Players Hero"
              className="w-full h-full object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/50 to-transparent" />
          </div>

          <div className="relative z-10 text-center px-6">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl md:text-7xl font-bold font-display mb-6"
            >
              Our <span className="text-padel-green">Players</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-gray-400 text-lg max-w-2xl mx-auto"
            >
              Meet the talent driving the sport forward. From rising stars to seasoned pros.
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-gray-500 text-sm max-w-2xl mx-auto mt-2 italic"
            >
              *Only players holding a valid SAPA Player’s License are shown
            </motion.p>
          </div>
        </section>

        {/* Search & Filter Bar */}
        <section className="container mx-auto px-6 -mt-10 relative z-20 mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between"
          >
            {/* Search */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search players..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-padel-green transition-colors"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <div className="relative min-w-[180px]">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-8 text-white appearance-none cursor-pointer hover:border-white/30 transition-colors"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat} className="bg-[#0F172A] text-white">
                      {cat === 'All' ? 'All Categories' : cat}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="relative min-w-[180px]">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <select
                  value={selectedClub}
                  onChange={(e) => setSelectedClub(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-8 text-white appearance-none cursor-pointer hover:border-white/30 transition-colors"
                >
                  {clubs.map(club => (
                    <option key={club} value={club} className="bg-[#0F172A] text-white">
                      {club === 'All' ? 'All Clubs' : club}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
                  className="group relative bg-white/5 border border-white/10 rounded-3xl overflow-hidden hover:border-padel-green/50 transition-colors duration-300 cursor-pointer"
                >
                  {/* Image Area (Placeholder for now if null) */}
                  <div className="aspect-[4/5] bg-gradient-to-br from-gray-800 to-gray-900 relative overflow-hidden">
                    {player.image_url ? (
                      <motion.img
                        layoutId={`image-${player.id}`}
                        src={player.image_url}
                        alt={player.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <motion.div
                        layoutId={`image-${player.id}`}
                        className="w-full h-full flex items-center justify-center text-white/10"
                      >
                        <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </motion.div>
                    )}

                    {/* Badge */}
                    <motion.div layoutId={`category-${player.id}`} className="absolute top-4 right-4 bg-padel-green/90 backdrop-blur text-black font-bold px-3 py-1 rounded-full text-xs uppercase tracking-wider z-10">
                      {player.category}
                    </motion.div>

                    {/* Rank Badge */}
                    <motion.div layoutId={`level-${player.id}`} className="absolute top-4 left-4 bg-black/60 backdrop-blur border border-white/10 text-white font-bold w-12 h-12 rounded-full flex flex-col items-center justify-center text-xs z-10">
                      <span className="text-[8px] uppercase font-black text-padel-green opacity-80 leading-none mb-0.5">Rank</span>
                      <span className="text-sm">
                        {(!player.rank_label || player.rank_label === 'Unranked') ? '-' : `#${player.rank_label}`}
                      </span>
                    </motion.div>

                    {/* View Profile Button Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="bg-white text-black px-6 py-2 rounded-full font-bold transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                        View Profile
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-6 relative bg-[#0F172A]">
                    <div className="absolute -top-10 left-0 right-0 h-10 bg-gradient-to-t from-[#0F172A] to-transparent" />

                    <motion.h3 layoutId={`name-${player.id}`} className="text-xl font-bold text-white mb-2 group-hover:text-padel-green transition-colors">
                      {player.name}
                    </motion.h3>

                    <div className="flex flex-wrap gap-2 mb-4 text-sm text-gray-400">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-padel-green" />
                        {player.nationality}
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <Trophy className="w-3 h-3 text-padel-green" />
                        {player.home_club}
                      </div>
                      {player.instagram_link && (
                        <>
                          <span>•</span>
                          <a 
                            href={player.instagram_link.startsWith('http') ? player.instagram_link : `https://instagram.com/${player.instagram_link.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-padel-green transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Instagram className="w-4 h-4" />
                          </a>
                        </>
                      )}
                    </div>

                    <p className="text-sm text-gray-500 line-clamp-2 mb-4">
                      {player.bio}
                    </p>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="col-span-full text-center py-20 text-gray-500">
                <p className="text-xl">No players found matching your criteria.</p>
                <button
                  onClick={() => { setSearchTerm(''); setSelectedCategory('All'); setSelectedClub('All'); }}
                  className="mt-4 text-padel-green hover:underline"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Player Modal */}
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
