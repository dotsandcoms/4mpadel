import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Target, TrendingUp, Star, ChevronDown, CheckCircle2, Users, Search, ChevronLeft, ChevronRight, X, MapPin, Download, Share2, Instagram } from 'lucide-react';
import { useRankedin } from '../hooks/useRankedin';
import { supabase } from '../supabaseClient';
import PlayerModal from '../components/PlayerModal';
import sapaLogo from '../assets/sapa-logo.svg';
import brollLogo from '../assets/BrollLogo.png';

const ORG_LABELS = {
  15809: 'SAPA',
  16317: 'Broll Pro Tour',
  16482: 'SA Grand Tour'
};

const ORG_LOGOS = {
  15809: sapaLogo,
  16317: brollLogo
};

const getInitials = (name) => {
  if (!name) return '';
  const parts = name.split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const RankingExplanation = () => (
  <div className="grid md:grid-cols-3 gap-6 mb-16 relative z-10">
    {[
      {
        icon: <Target className="w-7 h-7 text-padel-green" />,
        title: 'Play Tournaments',
        desc: 'Compete in SAPA sanctioned events across various tiers, from Bronze up to Major.',
      },
      {
        icon: <Trophy className="w-7 h-7 text-padel-green" />,
        title: 'Earn Points',
        desc: 'Your performance dictates your points. Higher tier events offer significantly larger rewards.',
      },
      {
        icon: <TrendingUp className="w-7 h-7 text-padel-green" />,
        title: 'Climb the Ranks',
        desc: 'Only your Best 8 tournaments count towards your official national ranking. (Cat 3 & 4 proportionate where applicable)',
      }
    ].map((step, idx) => (
      <motion.div
        key={idx}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1 * idx }}
        className="bg-white/[0.02] backdrop-blur-md border border-white/10 p-6 md:p-8 rounded-3xl hover:bg-white/[0.05] transition-colors group relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-padel-green/5 blur-2xl rounded-full" />
        <div className="bg-white/5 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 group-hover:bg-padel-green/20 transition-all border border-white/5">
          {step.icon}
        </div>
        <h3 className="text-lg md:text-xl font-bold text-white mb-2">{step.title}</h3>
        <p className="text-gray-400 text-xs md:text-sm leading-relaxed">{step.desc}</p>
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
    <div className="mb-16 last:mb-0">
      <div className="flex items-center gap-3 mb-6 px-6 md:px-12">
        <Trophy className="w-5 h-5 text-padel-green" />
        <h3 className="text-xl md:text-2xl font-bold text-white uppercase tracking-wider">{title}</h3>
      </div>
      <div className="relative">
        {/* Left Arrow */}
        <button
          onClick={(e) => scroll(e, -1)}
          className={`absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-white shadow-2xl transition-all duration-300 hover:bg-padel-green hover:text-black hover:border-padel-green active:scale-95 ${canScrollLeft ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Right Arrow */}
        <button
          onClick={(e) => scroll(e, 1)}
          className={`absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-white shadow-2xl transition-all duration-300 hover:bg-padel-green hover:text-black hover:border-padel-green active:scale-95 ${canScrollRight ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          aria-label="Scroll right"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Scroll Container */}
        <div
          ref={scrollRef}
          onScroll={updateArrows}
          className="flex gap-5 overflow-x-auto pb-6 snap-x px-6 md:px-12 nice-scrollbar scroll-smooth"
        >
          {playersData.map((player, index) => (
            <motion.div
              key={player.id || index}
              initial={{ opacity: 0, x: 25 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: Math.min(index * 0.05, 0.4) }}
              className={`w-[170px] md:w-[200px] relative group rounded-2xl overflow-hidden snap-center shadow-xl border border-white/5 bg-black/40 flex-shrink-0 ${player.hasLocalProfile ? 'cursor-pointer hover:border-padel-green/50' : ''}`}
              onClick={() => handleCardClick(player)}
            >
              <div className="slider-card-media h-[200px] md:h-[230px] w-full relative bg-gradient-to-br from-[#1E293B] to-[#0F172A] flex items-center justify-center">
                {player.image && !player._imgError ? (
                  <img
                    src={player.image}
                    alt={player.name}
                    className={`w-full h-full object-cover object-top filter opacity-80 group-hover:opacity-100 transition-all duration-500 scale-100 group-hover:scale-105 ${player.hasLocalProfile ? '' : 'grayscale group-hover:grayscale-0'}`}
                    onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling && (e.currentTarget.nextElementSibling.style.display = 'flex'); }}
                  />
                ) : null}
                {/* Fallback initials */}
                <div
                  className="absolute inset-0 w-full h-full flex flex-col items-center justify-center opacity-85 bg-gradient-to-b from-[#253247] to-[#141d2e]"
                  style={{ display: player.image && !player._imgError ? 'none' : 'flex' }}
                >
                  <div className="w-14 h-14 rounded-full bg-[#E2E4EB] flex items-center justify-center shadow-2xl mb-4">
                    <span className="text-xl font-black text-[#2B3B60] tracking-tighter">{getInitials(player.name)}</span>
                  </div>
                </div>
                {player.hasLocalProfile && (
                  <div className="absolute top-2 left-2 bg-padel-green/90 backdrop-blur-sm text-black text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shadow-lg z-10">
                    4M Profile
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

                {/* View Profile Overlay */}
                {player.hasLocalProfile && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                    <span className="bg-white text-black px-3.5 py-1 rounded-full text-[10px] font-bold transform translate-y-3 group-hover:translate-y-0 transition-all duration-300">
                      View Profile
                    </span>
                  </div>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-3.5 bg-gradient-to-t from-black via-black/85 to-transparent">
                <p className="text-padel-green font-black mb-0.5 text-[7px] tracking-widest uppercase flex items-center gap-1"><Star className="w-2 h-2 fill-padel-green" /> {player.rank}</p>
                <h4 className="text-sm font-bold text-white mb-1.5 line-clamp-1 group-hover:text-padel-green transition-colors">{player.name}</h4>
                <div className="flex justify-between items-center border-t border-white/10 pt-2">
                  <div>
                    <p className="text-[7px] text-gray-500 uppercase font-bold tracking-widest leading-none mb-0.5">Points</p>
                    <p className="text-xs font-black text-white">{player.points.toLocaleString()}</p>
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
  const headers = tier.headers || ['Winner', 'Finals', 'Semis', 'Quarters', 'R16', 'R32'];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      className={`border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md transition-all duration-300 relative group
            ${isOpen ? 'bg-white/10 shadow-2xl shadow-black/50 border-white/20' : 'bg-white/5 hover:bg-white/[0.08]'}`}
    >
      {/* Glowing background gradient based on tier color */}
      <div className={`absolute top-0 right-0 w-64 h-64 ${tier.bgGradient} opacity-10 blur-[100px] rounded-full pointer-events-none group-hover:opacity-20 transition-opacity`} />

      {/* Header / Clickable area */}
      <div
        className="p-5 md:p-6 cursor-pointer flex items-center justify-between gap-4 relative z-10"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4 md:gap-5">
          <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl ${tier.bgIcon} flex items-center justify-center shadow-lg flex-shrink-0 transition-all group-hover:scale-105 border border-white/5`}>
            <Star className={`w-5 h-5 md:w-6 h-6 ${tier.iconColor}`} />
          </div>
          <div>
            <h2 className="text-base md:text-xl font-black text-white uppercase tracking-wider leading-tight">
              {tier.type} <span className="text-white/30 font-medium hidden sm:inline ml-1">Tier</span>
            </h2>
            <div className="flex items-center gap-4 text-[9px] md:text-xs font-black uppercase tracking-widest mt-1">
              <span className="text-padel-green flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Up to {tier.maxPoints} pts
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest hidden lg:block">
            {isOpen ? 'Close' : 'Breakdown'}
          </span>
          <button className={`w-9 h-9 md:w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center transition-all duration-300 ${isOpen ? 'rotate-180 bg-white/25' : 'group-hover:bg-white/10'}`}>
            <ChevronDown className="w-4 h-4 text-white" />
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
            <div className="p-4 md:p-6 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr>
                    <th className="py-3 px-3 text-[10px] uppercase tracking-widest font-black text-gray-500 border-b border-white/10 w-20">Cat</th>
                    {headers.map((header, hIdx) => (
                      <th
                        key={hIdx}
                        className={`py-3 px-3 text-[10px] uppercase tracking-widest font-black text-gray-500 border-b border-white/10 text-right ${
                          hIdx === headers.length - 1 ? 'pr-6' : ''
                        }`}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tier.rows.map((row, idx) => {
                    const rowPoints = row.points || [row.winner, row.finals, row.semis, row.quarters, row.r16, row.r32];
                    return (
                      <tr key={idx} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-3 px-3 border-b border-white/5">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${row.cat === '1' ? tier.bgIcon + ' ' + tier.iconColor + ' border border-' + tier.iconColor + '/25' : 'bg-white/10 text-gray-300'}`}>
                            {row.cat}
                          </span>
                        </td>
                        {rowPoints.map((pt, ptIdx) => {
                          const isFirst = ptIdx === 0;
                          const isLast = ptIdx === rowPoints.length - 1;
                          let textClass = 'text-gray-400 text-xs';
                          if (row.bold) {
                            if (isFirst) {
                              textClass = 'font-black text-padel-green text-sm';
                            } else {
                              textClass = 'font-bold text-gray-200 text-xs';
                            }
                          }
                          return (
                            <td
                              key={ptIdx}
                              className={`py-3 px-3 text-right border-b border-white/5 ${textClass} ${isLast ? 'pr-6' : ''}`}
                            >
                              {pt}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const FullRankingsTable = ({
  activeTab,
  setActiveTab,
  searchTerm,
  setSearchTerm,
  paginatedData,
  totalPages,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  filteredData,
  imageErrors,
  setImageErrors,
  setSelectedPlayer,
  getInitials,
  selectedOrgId,
  setSelectedOrgId
}) => {
  return (
    <div className="max-w-6xl mx-auto px-6 relative z-10">
      {/* Official Rankings Header */}
      <div className="mb-10 flex flex-col items-center text-center">
        {ORG_LOGOS[selectedOrgId] && (
          <motion.div
            key={selectedOrgId}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-4 bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-sm h-16 w-36 flex items-center justify-center shadow-lg shadow-black/20"
          >
            <img
              src={ORG_LOGOS[selectedOrgId]}
              alt={`${ORG_LABELS[selectedOrgId]} Logo`}
              className="max-h-full max-w-full object-contain filter drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]"
            />
          </motion.div>
        )}
        <h2 className="text-3xl md:text-4xl font-black text-white tracking-tighter uppercase mb-3">Official <span className="text-padel-green">{ORG_LABELS[selectedOrgId] || 'SAPA'}</span> Rankings</h2>
        <p className="text-gray-400 text-sm max-w-xl mx-auto">Browse the full rankings list, search for specific players, and check total accumulated points.</p>
      </div>

      {/* Controls Box */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-5 md:p-6 backdrop-blur-md mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">

          {/* Internal Table Tabs with custom sliding background pill */}
          <div className="relative flex p-1 bg-black/40 rounded-xl w-full sm:w-auto border border-white/5">
            {['men', 'ladies'].map((tabKey) => {
              const isSelected = activeTab === tabKey;
              return (
                <button
                  key={tabKey}
                  onClick={() => setActiveTab(tabKey)}
                  className="relative flex-1 sm:flex-none py-2 px-6 rounded-lg font-black text-xs uppercase tracking-widest transition-all duration-300 z-10"
                  style={{ color: isSelected ? '#000000' : '#9CA3AF' }}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="activeGenderTab"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      className="absolute inset-0 bg-padel-green rounded-lg shadow-lg shadow-padel-green/20"
                      style={{ zIndex: -1 }}
                    />
                  )}
                  {tabKey === 'men' ? 'Men' : 'Women'}
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-500" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search player name..."
              className="w-full bg-black/40 border border-white/10 text-white rounded-xl pl-10 pr-9 py-2.5 focus:outline-none focus:ring-2 focus:ring-padel-green/50 placeholder-gray-500 transition-all font-medium text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-white"
              >
                &times;
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table / List Area */}
      <div className="bg-black/40 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-full">
            <thead>
              <tr className="bg-white/5">
                <th className="py-4 px-6 font-black text-gray-400 uppercase tracking-widest text-xs w-24">Pos</th>
                <th className="py-4 px-6 font-black text-gray-400 uppercase tracking-widest text-xs">Player</th>
                <th className="py-4 px-6 font-black text-gray-400 uppercase tracking-widest text-xs text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length > 0 ? (
                paginatedData.map((player) => (
                  <tr key={player.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors group">
                    <td className="py-4 px-6 text-xl font-black text-gray-500 group-hover:text-padel-green transition-colors">
                      #{player.rawRank}
                    </td>
                    <td className="py-4 px-6">
                      <div
                        onClick={() => {
                          if (player.hasLocalProfile && player.playerRecord) {
                            setSelectedPlayer(player.playerRecord);
                          } else {
                            window.open(player.rankedinProfile, '_blank');
                          }
                        }}
                        className="flex items-center gap-3.5 group/link cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/5 flex-shrink-0 flex items-center justify-center">
                          {!imageErrors[player.id] ? (
                            <img
                              src={player.image}
                              alt={player.name}
                              className={`w-full h-full object-cover transition-all ${player.hasLocalProfile ? '' : 'filter grayscale group-hover/link:grayscale-0'}`}
                              onError={() => setImageErrors(prev => ({ ...prev, [player.id]: true }))}
                            />
                          ) : (
                            <span className="text-xs font-bold text-gray-400">{getInitials(player.name)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base font-bold text-white group-hover/link:text-padel-green transition-colors truncate">
                            {player.name}
                          </span>
                          {player.hasLocalProfile && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-padel-green/10 text-padel-green text-[8px] font-black uppercase tracking-widest border border-padel-green/20 flex-shrink-0">
                              4M
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className="inline-block bg-white/10 border border-white/5 px-4 py-2 rounded-xl text-base font-black text-white group-hover:bg-padel-green/10 group-hover:text-padel-green group-hover:border-padel-green/30 transition-all duration-300">
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

        {/* Mobile App-like Card List View */}
        <div className="block md:hidden p-4 space-y-3">
          {paginatedData.length > 0 ? (
            paginatedData.map((player) => (
              <div
                key={player.id}
                onClick={() => {
                  if (player.hasLocalProfile && player.playerRecord) {
                    setSelectedPlayer(player.playerRecord);
                  } else {
                    window.open(player.rankedinProfile, '_blank');
                  }
                }}
                className="bg-white/[0.02] border border-white/10 hover:border-padel-green/30 rounded-2xl p-3.5 flex items-center justify-between gap-3 active:bg-white/[0.06] transition-all cursor-pointer relative overflow-hidden group"
              >
                {/* Ranking circle badge */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 border ${
                    player.rawRank === 1 
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : player.rawRank === 2
                      ? 'bg-slate-300/20 text-slate-300 border-slate-300/30'
                      : player.rawRank === 3
                      ? 'bg-amber-700/20 text-amber-600 border-amber-700/30'
                      : 'bg-black/40 text-gray-400 border-white/5'
                  }`}>
                    #{player.rawRank}
                  </div>
                  
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/5 flex-shrink-0 flex items-center justify-center">
                    {!imageErrors[player.id] ? (
                      <img
                        src={player.image}
                        alt={player.name}
                        className={`w-full h-full object-cover transition-all ${player.hasLocalProfile ? '' : 'filter grayscale'}`}
                        onError={() => setImageErrors(prev => ({ ...prev, [player.id]: true }))}
                      />
                    ) : (
                      <span className="text-xs font-black text-gray-400">{getInitials(player.name)}</span>
                    )}
                  </div>

                  {/* Name and Tag */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-white group-hover:text-padel-green transition-colors truncate">
                        {player.name}
                      </span>
                      {player.hasLocalProfile && (
                        <span className="inline-block px-1 py-0.5 rounded bg-padel-green/10 text-padel-green text-[7px] font-black uppercase tracking-widest border border-padel-green/20 flex-shrink-0">
                          4M
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-gray-500 uppercase tracking-widest font-black block leading-none">
                      {player.hasLocalProfile ? 'View 4M Profile' : 'View RankedIn'}
                    </span>
                  </div>
                </div>

                {/* Points Pill */}
                <div className="flex-shrink-0">
                  <span className="inline-block bg-padel-green/10 border border-padel-green/20 px-2.5 py-1.5 rounded-xl text-xs font-black text-padel-green group-hover:bg-padel-green/20 group-hover:border-padel-green/45 transition-colors">
                    {player.points.toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-gray-500 font-medium text-xs">
              No players found matching "{searchTerm}"
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="border-t border-white/10 p-5 flex items-center justify-between bg-white/[0.02]">
            <p className="text-xs text-gray-500 font-bold hidden md:block">
              Showing <span className="text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-white">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> of <span className="text-white">{filteredData.length}</span> players
            </p>

            <div className="flex items-center gap-1.5 mx-auto md:mx-0">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-xl bg-white/5 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 hover:text-padel-green transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1 mx-2">
                {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
                  let pageNum = currentPage;
                  if (totalPages <= 5) pageNum = idx + 1;
                  else if (currentPage <= 3) pageNum = idx + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + idx;
                  else pageNum = currentPage - 2 + idx;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg font-black text-xs transition-all duration-300 ${currentPage === pageNum
                        ? 'bg-padel-green text-black shadow-lg shadow-padel-green/20 scale-105'
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
                className="p-2 rounded-xl bg-white/5 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 hover:text-padel-green transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Rankings = () => {
  const { getOrganisationRankings } = useRankedin();
  const [mensDataRaw, setMensDataRaw] = useState([]);
  const [ladiesDataRaw, setLadiesDataRaw] = useState([]);
  const [rankingsLoading, setRankingsLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState({});
  const [localProfileMap, setLocalProfileMap] = useState({});

  const [selectedOrgId, setSelectedOrgId] = useState(15809); // 15809 = SAPA, 16317 = Broll Pro Tour, 16482 = SA Grand Tour

  // Search & Pagination State
  const [activeMainTab, setActiveMainTab] = useState('leaderboards'); // 'overview', 'leaderboards', 'rankings'
  const [activeTab, setActiveTab] = useState('men');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    const fetchRankings = async () => {
      setRankingsLoading(true);
      try {
        const [mensData, ladiesData, { data: { session } }] = await Promise.all([
          getOrganisationRankings(3, 82, 1000, selectedOrgId),
          getOrganisationRankings(4, 83, 1000, selectedOrgId),
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
  }, [getOrganisationRankings, selectedOrgId]);

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
            // Process sponsors
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
      maxPoints: '2,600',
      bgGradient: 'bg-red-500',
      bgIcon: 'bg-red-500/20',
      iconColor: 'text-red-500',
      headers: [
        'Winner (1st)',
        'Finalist (2nd)',
        'Semi-Final (3rd / 4th)',
        'Quarter-Final (5th - 8th)',
        'R16 Playoff - 9th Place',
        'R16 Playoff - 10th Place',
        'R16 Playoff - 11th / 12th',
        'R16 Playoff - 13th - 16th',
        'R32 Playoff - 17th'
      ],
      rows: [
        { cat: '1', points: ['2,600', '1,560', '936', '468', '410', '351', '293', '234', '211'], bold: true },
        { cat: '2', points: ['780', '468', '234', '117', '103', '88', '74', '59', '53'], bold: false },
        { cat: '3', points: ['312', '188', '94', '47', '41', '36', '30', '24', '22'], bold: false },
        { cat: '4', points: ['125', '113', '47', '24', '21', '18', '15', '12', '11'], bold: false }
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
      maxPoints: '500',
      bgGradient: 'bg-gray-400',
      bgIcon: 'bg-gray-400/20',
      iconColor: 'text-gray-300',
      rows: [
        { cat: '1', winner: '500', finals: '300', semis: '180', quarters: '90', r16: '45', r32: '22', bold: true },
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

  return (
    <div className="bg-[#0F172A] min-h-screen pt-20 md:pt-32 pb-24 font-sans selection:bg-padel-green selection:text-black text-white">
      {/* Background elements */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-padel-green/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[150px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03]" />
      </div>

      <div className="container mx-auto px-6 max-w-5xl relative z-10">
        {/* Hero Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-padel-green text-[10px] md:text-xs font-black uppercase tracking-widest mb-4 md:mb-6"
          >
            <span className="w-2 h-2 rounded-full bg-padel-green animate-pulse" />
            Live Standings
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-4 uppercase"
          >
            How the <span className="text-padel-green">Rankings</span> Work
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="text-base md:text-lg text-gray-400 max-w-xl mx-auto leading-relaxed"
          >
            4M Padel hosts various different ranking lists. Select from the dropdown below to view the different available ranking lists.
          </motion.p>
        </div>

        {/* Organization Filter Header */}
        <div className="flex justify-center mb-12 relative z-20">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-4 flex items-center justify-center backdrop-blur-md shadow-xl transition-all duration-300 w-full sm:w-auto">
            <div className="flex flex-col xs:flex-row items-center gap-3 w-full sm:w-auto">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 whitespace-nowrap">Select Organisation:</span>
              <div className="relative w-full xs:w-56">
                <select
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 text-white rounded-xl pl-4.5 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-padel-green/50 appearance-none font-bold uppercase text-[10px] tracking-widest cursor-pointer transition-all"
                >
                  <option value={15809} className="bg-[#0F172A] text-white">SAPA Ranking</option>
                  <option value={16317} className="bg-[#0F172A] text-white">Broll Pro Tour</option>
                  <option value={16482} className="bg-[#0F172A] text-white">SA Grand Tour</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                  <ChevronDown className="w-4 h-4 text-padel-green" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Categories Tab Navigation */}
        <div className="relative flex items-center gap-1 mb-12 bg-white/5 p-1 rounded-2xl md:rounded-full border border-white/10 w-full md:max-w-fit mx-auto overflow-hidden">
          {[
            { id: 'overview', label: 'Overview', icon: <Target className="w-3.5 h-3.5" /> },
            { id: 'leaderboards', label: 'Leaderboards', icon: <Trophy className="w-3.5 h-3.5" /> },
            { id: 'rankings', label: 'Rankings', icon: <Users className="w-3.5 h-3.5" /> }
          ].map((tab) => {
            const isActive = activeMainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id)}
                className="relative flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-full text-[9px] md:text-xs font-black uppercase tracking-widest transition-all duration-300 z-10"
                style={{ color: isActive ? '#000000' : '#9CA3AF' }}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    className="absolute inset-0 bg-padel-green rounded-xl md:rounded-full shadow-lg shadow-padel-green/20"
                    style={{ zIndex: -1 }}
                  />
                )}
                {tab.icon}
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

      </div>

      <AnimatePresence mode="wait">
        {activeMainTab === 'overview' && (
          <motion.div
            key="overview-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="container mx-auto px-6 max-w-5xl relative z-10"
          >
            {/* Info Cards */}
            <RankingExplanation />

            {/* Points Breakdown Header */}
            <div className="mb-8 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between border-b border-white/10 pb-5 gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1.5">Points Breakdown for official SAPA Rankings 2026</h2>
                <p className="text-gray-400 text-sm">Expand each tier to see detailed point structures by category.</p>
              </div>
            </div>

            {/* Expandable Tiers List */}
            <div className="space-y-4">
              {rankingData.map((tier) => (
                <TierCard key={tier.type} tier={tier} />
              ))}
            </div>
          </motion.div>
        )}

        {activeMainTab === 'leaderboards' && (
          <motion.div
            key="leaderboards-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="w-full relative z-10"
          >
            {!rankingsLoading && (
              <div className="relative pt-2">
                <div className="w-full px-6 md:px-12 mb-10 flex flex-col items-center gap-4 text-center">
                  <AnimatePresence mode="wait">
                    {ORG_LOGOS[selectedOrgId] && (
                      <motion.div
                        key={selectedOrgId}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.3 }}
                        className="mb-1 bg-white/5 border border-white/10 rounded-2xl p-3 h-16 w-36 flex items-center justify-center shadow-lg shadow-black/20"
                      >
                        <img
                          src={ORG_LOGOS[selectedOrgId]}
                          alt={`${ORG_LABELS[selectedOrgId]} Logo`}
                          className="max-h-full max-w-full object-contain filter drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <h2 className="text-3xl font-black text-white mb-1 uppercase tracking-tighter">
                      <span className="text-padel-green">
                        {ORG_LABELS[selectedOrgId] || "SAPA"}’s
                      </span>{" "}
                      Top Players
                    </h2>
                    <p className="text-gray-400 text-sm">Live rankings of the current top performers across {selectedOrgId === 15809 ? "South Africa" : (ORG_LABELS[selectedOrgId] || "South Africa")}.</p>
                  </div>
                </div>
                <RankingSlider title="Men's Open Top 10" playersData={mensRankings.slice(0, 10)} onPlayerClick={setSelectedPlayer} />
                <RankingSlider title="Ladies Open Top 10" playersData={ladiesRankings.slice(0, 10)} onPlayerClick={setSelectedPlayer} />

                {/* Full Ranking Table added under Leaderboards */}
                <div className="mt-16">
                  <FullRankingsTable
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    paginatedData={paginatedData}
                    totalPages={totalPages}
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                    itemsPerPage={itemsPerPage}
                    filteredData={filteredData}
                    imageErrors={imageErrors}
                    setImageErrors={setImageErrors}
                    setSelectedPlayer={setSelectedPlayer}
                    getInitials={getInitials}
                    selectedOrgId={selectedOrgId}
                    setSelectedOrgId={setSelectedOrgId}
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeMainTab === 'rankings' && (
          <motion.div
            key="rankings-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="w-full relative z-10"
          >
            <FullRankingsTable
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              paginatedData={paginatedData}
              totalPages={totalPages}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              itemsPerPage={itemsPerPage}
              filteredData={filteredData}
              imageErrors={imageErrors}
              setImageErrors={setImageErrors}
              setSelectedPlayer={setSelectedPlayer}
              getInitials={getInitials}
              selectedOrgId={selectedOrgId}
              setSelectedOrgId={setSelectedOrgId}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player Modal */}
      <AnimatePresence>
        {selectedPlayer && (
          <PlayerModal
            player={selectedPlayer}
            onClose={() => setSelectedPlayer(null)}
            userEmail={userEmail}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Rankings;
