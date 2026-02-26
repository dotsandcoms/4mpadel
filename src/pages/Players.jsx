
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from '../components/Navbar';
import { Search, Filter, MapPin, Trophy, X, Calendar, TrendingUp, Activity, ArrowRight, Download, Share2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import heroBg from '../assets/hero_bg.png';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';

const Players = () => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedClub, setSelectedClub] = useState('All');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [userEmail, setUserEmail] = useState(null);
  const cardRef = React.useRef(null);
  const printRef = React.useRef(null);

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

  const downloadCard = async () => {
    if (!printRef.current) {
      console.error("Print ref is null");
      return;
    }
    try {
      console.log("Starting PDF generation for:", selectedPlayer.name);

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

      // Calculate dimensions (leaving 20mm margins)
      const margin = 20;
      const targetWidth = pdfWidth - (margin * 2);
      const targetHeight = (imgProps.height * targetWidth) / imgProps.width;

      // Center on page
      const xPos = (pdfWidth - targetWidth) / 2;
      const yPos = (pdfHeight - targetHeight) / 2;

      pdf.addImage(dataUrl, 'PNG', xPos, yPos > 15 ? yPos : 15, targetWidth, targetHeight);
      pdf.save(`${selectedPlayer.name.replace(/\s+/g, '_')}_Profile_Card.pdf`);
      console.log("Download triggered successfully");
    } catch (err) {
      console.error('Detailed error generating PDF:', err);
      alert('Failed to generate PDF. Check browser console for details.');
    }
  };

  const shareCard = async () => {
    try {
      const shareUrl = `${window.location.origin}/players?id=${selectedPlayer.id}`;
      if (navigator.share) {
        await navigator.share({
          title: `${selectedPlayer.name}'s Player Profile`,
          text: `Check out ${selectedPlayer.name}'s player profile on 4M Padel!`,
          url: shareUrl,
        });
      } else {
        // Fallback: Copy to clipboard
        await navigator.clipboard.writeText(shareUrl);
        alert('Profile link copied to clipboard!');
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  return (
    <>
      <Helmet>
        <title>Players | 4M Padel</title>
        {selectedPlayer && (
          <>
            <meta property="og:title" content={`${selectedPlayer.name} - Player Profile`} />
            <meta property="og:description" content={`Division: ${selectedPlayer.category} | LVR: ${selectedPlayer.level}`} />
            {selectedPlayer.image_url && <meta property="og:image" content={selectedPlayer.image_url} />}
            <meta property="og:type" content="profile" />
          </>
        )}
      </Helmet>
      <Navbar />
      <main className="bg-[#0F172A] min-h-screen text-white pb-20 relative">
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
                  layoutId={`card - ${player.id} `}
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
                        layoutId={`image - ${player.id} `}
                        src={player.image_url}
                        alt={player.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <motion.div
                        layoutId={`image - ${player.id} `}
                        className="w-full h-full flex items-center justify-center text-white/10"
                      >
                        <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </motion.div>
                    )}

                    {/* Badge */}
                    <motion.div layoutId={`category - ${player.id} `} className="absolute top-4 right-4 bg-padel-green/90 backdrop-blur text-black font-bold px-3 py-1 rounded-full text-xs uppercase tracking-wider z-10">
                      {player.category}
                    </motion.div>

                    {/* Level Badge */}
                    <motion.div layoutId={`level - ${player.id} `} className="absolute top-4 left-4 bg-black/60 backdrop-blur border border-white/10 text-white font-bold w-12 h-12 rounded-full flex items-center justify-center text-sm z-10">
                      {player.level}
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

                    <motion.h3 layoutId={`name - ${player.id} `} className="text-xl font-bold text-white mb-2 group-hover:text-padel-green transition-colors">
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

        {/* Modal Overlay */}
        <AnimatePresence>
          {selectedPlayer && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => handleSetSelectedPlayer(null)}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 cursor-pointer"
              />
              <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
                <motion.div
                  layoutId={`card - ${selectedPlayer.id} `}
                  ref={cardRef}
                  className="w-full max-w-lg bg-[#0F172A] rounded-3xl overflow-hidden shadow-2xl pointer-events-auto relative max-h-[90vh] flex flex-col"
                >
                  {/* Close Button */}
                  <button
                    onClick={() => handleSetSelectedPlayer(null)}
                    className="absolute top-6 right-6 z-20 w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* Image Section */}
                  <div className="relative h-[40vh] min-h-[300px]">
                    {selectedPlayer.image_url ? (
                      <motion.img
                        layoutId={`image - ${selectedPlayer.id} `}
                        src={selectedPlayer.image_url}
                        alt={selectedPlayer.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <motion.div
                        layoutId={`image - ${selectedPlayer.id} `}
                        className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-white/10"
                      >
                        <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </motion.div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-transparent to-black/30" />

                    {/* Big Stats Overlays on Image */}
                    <motion.div layoutId={`level - ${selectedPlayer.id} `} className="absolute top-6 left-6 bg-padel-green text-black font-black w-16 h-16 rounded-2xl flex flex-col items-center justify-center border-4 border-black shadow-xl">
                      <span className="text-xs uppercase font-bold opacity-60">LVR</span>
                      <span className="text-2xl leading-none">{selectedPlayer.level}</span>
                    </motion.div>

                    <motion.div layoutId={`category - ${selectedPlayer.id} `} className="absolute top-6 left-24 bg-white/10 backdrop-blur-md border border-white/20 text-white font-bold px-4 h-16 rounded-2xl flex flex-col items-center justify-center shadow-xl">
                      <span className="text-xs uppercase font-bold text-padel-green mb-1">Category</span>
                      <span className="text-sm">{selectedPlayer.category}</span>
                    </motion.div>

                    {selectedPlayer.rankedin_id && (
                      <div className="absolute top-6 right-20 bg-black/40 backdrop-blur-md border border-white/10 text-white font-bold px-4 h-16 rounded-2xl flex flex-col items-center justify-center shadow-xl">
                        <span className="text-[10px] uppercase font-black text-padel-green mb-1">Rankedin ID</span>
                        <span className="text-xs opacity-70 font-mono tracking-tight">{selectedPlayer.rankedin_id}</span>
                      </div>
                    )}

                    {/* Name Overlay */}
                    <div className="absolute bottom-0 left-0 w-full p-8">
                      <motion.h2 layoutId={`name - ${selectedPlayer.id} `} className="text-5xl md:text-6xl font-black text-white leading-[0.85] tracking-tighter uppercase mb-2 drop-shadow-lg">
                        {selectedPlayer.name.split(' ').map((n, i) => (
                          <span key={i} className="block">{n}</span>
                        ))}
                      </motion.h2>
                      <div className="flex items-center gap-2 text-gray-300 font-medium">
                        <MapPin className="w-4 h-4 text-padel-green" />
                        {selectedPlayer.home_club}, {selectedPlayer.nationality}
                        {selectedPlayer.age && <span className="ml-2 px-2 py-0.5 bg-white/10 rounded text-xs">AGE: {selectedPlayer.age}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Content Section (Scrollable) */}
                  <div className="p-8 space-y-8 overflow-y-auto flex-1 bg-[#0F172A] border-t border-white/5">

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
                          {selectedPlayer.match_form.split(/\s+/).filter(Boolean).map((f, i) => (
                            <div key={i} className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shadow-lg ${f === 'W' ? 'bg-padel-green text-black' : 'bg-red-500 text-white'
                              }`}>
                              {f}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rankings */}
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
            </>
          )}
        </AnimatePresence>
        {/* Hidden Print Template */}
        <div className="fixed -left-[2000px] top-0 pointer-events-none">
          {selectedPlayer && (
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
                  <span className="text-sm uppercase font-extrabold opacity-60">LVR</span>
                  <span className="text-4xl leading-none">{selectedPlayer.level}</span>
                </div>

                <div className="absolute top-10 right-10 bg-white/10 backdrop-blur-xl border border-white/20 text-white font-bold px-8 h-20 rounded-3xl flex flex-col items-center justify-center shadow-2xl">
                  <span className="text-xs uppercase font-bold text-padel-green mb-1 tracking-widest">Category</span>
                  <span className="text-lg">{selectedPlayer.category}</span>
                </div>

                {/* Name Overlay */}
                <div className="absolute bottom-12 left-12 right-12">
                  <h1 className="text-7xl font-black uppercase tracking-tighter leading-[0.82] mb-4 drop-shadow-2xl">
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
                    {selectedPlayer.bio || "Pro player at 4M Padel Community. Dedicated to the sport and growing the local community."}
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
          )}
        </div>
      </main>
    </>
  );
};

export default Players;
