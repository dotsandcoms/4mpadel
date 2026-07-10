import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Share2, Trophy } from 'lucide-react';
import { supabase } from '../supabaseClient';

const RankingDetailsModal = ({ player, playerRecord, onClose, selectedOrgId, categoryLabel }) => {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' or 'tournaments'
  const [showBest8, setShowBest8] = useState(true);
  const [calendarEvents, setCalendarEvents] = useState([]);

  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        const { data } = await supabase.from('calendar').select('event_name, sapa_status');
        if (data) setCalendarEvents(data);
      } catch (err) {
        console.error('Error fetching calendar:', err);
      }
    };
    fetchCalendar();
  }, []);

  if (!playerRecord) return null;

  // ORG mapping (Rankings page historically used 11706 for Grand Tour; sync uses 16482)
  const orgLabels = {
    15809: 'SAPA',
    16317: 'Broll',
    11706: 'SA Grand',
    16482: 'SA Grand',
  };
  const activeOrgLabel = orgLabels[selectedOrgId] || 'SAPA';

  // Find the ranking record for the active org — a player can have several ranking
  // entries under the same org (Men/Women, different age groups, doubles, etc.), so
  // narrow down to the one matching the category/tab the player was clicked from
  // (e.g. "Men - Main") rather than blindly taking the first org match.
  let rankingData = null;
  if (playerRecord.rankings && Array.isArray(playerRecord.rankings)) {
    const orgCandidates = playerRecord.rankings.filter((r) => {
      const org = (r.org || '').toUpperCase();
      if (!org) return false;
      if (activeOrgLabel === 'SAPA') return org.includes('SAPA');
      if (activeOrgLabel === 'Broll') return org.includes('BROLL');
      if (activeOrgLabel === 'SA Grand') return org.includes('GRAND') || org.includes('SA GRAND');
      return org.includes(activeOrgLabel.toUpperCase());
    });

    const label = (categoryLabel || '').toUpperCase();
    const wantWomen = label.includes('WOMEN') || label.includes('LADIES');
    const wantMen = !wantWomen && (label.includes('MEN') || label === '' || label.includes('MAIN') || label.includes('OVER'));

    const blobOf = (r) => `${r.age_group || ''} ${r.match_type || ''} ${r.org || ''}`.toUpperCase();
    const isWomenRow = (r) => /WOMEN|LADIES|FEMALE/.test(blobOf(r));
    const isMenRow = (r) => !isWomenRow(r) && !/MIXED/.test(blobOf(r));
    const isMainAgeGroup = (r) => {
      const age = (r.age_group || '').toUpperCase();
      return !age || age.includes('OPEN') || age.includes('MAIN');
    };
    const matchesCategoryAge = (r) => {
      const age = (r.age_group || '').toUpperCase();
      if (label.includes('OVER 35') || label.includes('MO35')) return age.includes('35');
      if (label.includes('OVER 40') || label.includes('MO40')) return age.includes('40');
      if (label.includes('OVER 45') || label.includes('MO45')) return age.includes('45');
      if (label.includes('OVER 50') || label.includes('MO50')) return age.includes('50');
      if (label.includes('OVER 55') || label.includes('MO55')) return age.includes('55');
      // Default Main / Open tabs
      return isMainAgeGroup(r);
    };

    const gendered = orgCandidates.filter((r) => (wantWomen ? isWomenRow(r) : isMenRow(r)));
    const pool = gendered.length > 0 ? gendered : orgCandidates;

    rankingData =
      pool.find((r) => matchesCategoryAge(r) && isMainAgeGroup(r)) ||
      pool.find((r) => matchesCategoryAge(r)) ||
      pool.find((r) => isMainAgeGroup(r)) ||
      [...pool].sort((a, b) => (b.details?.length || 0) - (a.details?.length || 0))[0] ||
      null;
  }

  // Fallback to live Rankings-list values when local rankings JSON is missing/corrupt
  const displayRank = rankingData?.rank || player.rawRank || player.rank?.replace?.(/[^\d]/g, '');
  const displayPoints = rankingData?.points || player.points;
  const details = rankingData?.details || [];

  // Compute Trophy Wins across all rankings to get a holistic view of the player's wins
  const uniqueWins = useMemo(() => {
    if (!playerRecord?.rankings || !Array.isArray(playerRecord.rankings)) return {};
    const winsMap = new Map();
    
    playerRecord.rankings.forEach(ranking => {
      if (ranking.details && Array.isArray(ranking.details)) {
        ranking.details.forEach(tourney => {
          if (String(tourney.place) === '1') {
            const key = `${tourney.date}-${tourney.name}`;
            if (!winsMap.has(key)) {
              winsMap.set(key, tourney.name);
            }
          }
        });
      }
    });

    const counts = { Major: 0, 'Super Gold': 0, Gold: 0, Silver: 0, Bronze: 0, Other: 0 };
    
    const normalize = (str) => (str || '').toLowerCase().trim();

    winsMap.forEach((name) => {
      const tourneyName = normalize(name);
      const calEvent = calendarEvents.find(e => normalize(e.event_name) === tourneyName);
      
      let statusStr = '';
      if (calEvent && calEvent.sapa_status) {
         statusStr = calEvent.sapa_status.toUpperCase();
      } else {
         statusStr = name.toUpperCase();
      }

      if (statusStr.includes('MAJOR')) counts.Major++;
      else if (statusStr.includes('SUPER GOLD') || statusStr === 'S GOLD') counts['Super Gold']++;
      else if (statusStr.includes('GOLD')) counts.Gold++;
      else if (statusStr.includes('SILVER')) counts.Silver++;
      else if (statusStr.includes('BRONZE')) counts.Bronze++;
      else counts.Other++;
    });

    // Remove empty counts
    Object.keys(counts).forEach(k => {
      if (counts[k] === 0) delete counts[k];
    });

    return counts;
  }, [playerRecord, calendarEvents]);

  const getTierColor = (tier) => {
    switch (tier) {
      case 'Major': return 'text-purple-400';
      case 'Super Gold': return 'text-yellow-400';
      case 'Gold': return 'text-yellow-500';
      case 'Silver': return 'text-gray-300';
      case 'Bronze': return 'text-amber-600';
      case 'Other': return 'text-blue-400';
      default: return 'text-padel-green';
    }
  };

  // Sort details by points descending and slice for Best 8 if needed
  const sortedDetails = [...details].sort((a, b) => Number(b.points) - Number(a.points));
  const displayDetails = showBest8 ? sortedDetails.slice(0, 8) : sortedDetails;

  const handleShare = async () => {
    try {
      const shareUrl = `${window.location.origin}/players?id=${playerRecord.id}`;
      if (navigator.share) {
        await navigator.share({
          title: `${playerRecord.name}'s Ranking Profile`,
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
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b0f19] sm:bg-black/80 sm:backdrop-blur-sm sm:justify-center sm:items-center">
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-4 bg-[#0b0f19] sm:hidden border-b border-white/5">
          <button onClick={onClose} className="p-2 -ml-2 text-white">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-sm font-bold text-white uppercase tracking-widest">Ranking Details</h2>
          <button onClick={handleShare} className="p-2 -mr-2 text-white">
            <Share2 className="w-5 h-5" />
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="flex-1 min-h-0 flex flex-col bg-[#0b0f19] overflow-hidden sm:w-[800px] sm:max-w-[95vw] sm:h-[85vh] sm:flex-none sm:rounded-3xl sm:border sm:border-white/10 relative"
        >
          {/* Desktop Header Overlay */}
          <div className="hidden sm:flex absolute top-0 left-0 right-0 p-4 justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
             <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
                <ArrowLeft className="w-5 h-5" />
             </button>
             <h2 className="text-xs font-bold text-white uppercase tracking-widest">Ranking Details</h2>
             <button onClick={handleShare} className="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
                <Share2 className="w-4 h-4" />
             </button>
          </div>

          <div className="p-6 pb-0 flex items-center gap-4 sm:pt-20">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 bg-white/5 shrink-0">
              {playerRecord.image_url ? (
                <img src={playerRecord.image_url} alt={playerRecord.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold text-xl">
                  {playerRecord.name?.substring(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col sm:flex-row items-start justify-between min-w-0 gap-3 sm:gap-0">
              <div className="w-full sm:w-auto">
                <h2 className="text-xl font-bold text-white uppercase tracking-tight flex items-center gap-2">
                  <span className="truncate">{playerRecord.name}</span>
                  <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-padel-green"></span>
                </h2>
                <div className="flex flex-col gap-1 mt-1 text-xs text-gray-400 font-medium">
                  {playerRecord.nationality && (
                    <div className="flex items-center gap-1.5">
                      <img src={`https://flagcdn.com/w20/${playerRecord.nationality.toLowerCase() === 'south africa' ? 'za' : 'za'}.png`} alt="flag" className="w-4 h-auto" onError={(e) => e.target.style.display='none'}/>
                      <span>{playerRecord.nationality}</span>
                    </div>
                  )}
                  {playerRecord.home_club && (
                    <div className="flex items-center gap-1.5 truncate pr-2">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="truncate">{playerRecord.home_club}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex mt-6 border-b border-white/10 px-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 text-xs font-bold uppercase tracking-widest relative mr-8 ${activeTab === 'overview' ? 'text-padel-green' : 'text-gray-500'}`}
            >
              Ranking Overview
              {activeTab === 'overview' && (
                <motion.div layoutId="rank_tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-padel-green" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('tournaments')}
              className={`pb-3 text-xs font-bold uppercase tracking-widest relative ${activeTab === 'tournaments' ? 'text-padel-green' : 'text-gray-500'}`}
            >
              Tournament Results
              {activeTab === 'tournaments' && (
                <motion.div layoutId="rank_tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-padel-green" />
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 nice-scrollbar">
            {activeTab === 'overview' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                {/* Tournament Wins Badges (Centered above stats) */}
                {Object.keys(uniqueWins).length > 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 pt-2">
                    <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Tournament Wins</span>
                    <div className="flex flex-wrap justify-center items-center gap-2">
                      {Object.entries(uniqueWins).map(([tier, count]) => (
                        <div key={tier} className="flex items-center gap-1.5 bg-[#151b29] border border-white/5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                           <Trophy className={`w-3.5 h-3.5 ${getTierColor(tier)}`} />
                           <span className="text-white flex items-center gap-1.5">
                             {tier} <span className={getTierColor(tier)}>{count}</span>
                           </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#151b29] rounded-2xl p-4 flex flex-col items-center justify-center text-center border border-white/5">
                    <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1">National</span>
                    <span className="text-xl font-bold text-white">{displayRank}</span>
                  </div>
                  <div className="bg-[#151b29] rounded-2xl p-4 flex flex-col items-center justify-center text-center border border-white/5">
                    <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1">Points</span>
                    <span className="text-xl font-bold text-white">{displayPoints?.toLocaleString()}</span>
                  </div>
                  <div className="bg-[#151b29] rounded-2xl p-4 flex flex-col items-center justify-center text-center border border-white/5">
                    <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1">Tournaments</span>
                    <span className="text-xl font-bold text-white">{details?.length || 0}</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-black uppercase text-padel-green tracking-widest m-0">Points Breakdown</h3>
                    <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                      <button
                        onClick={() => setShowBest8(true)}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${showBest8 ? 'bg-padel-green text-black shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                      >
                        Best 8
                      </button>
                      <button
                        onClick={() => setShowBest8(false)}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${!showBest8 ? 'bg-padel-green text-black shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                      >
                        All
                      </button>
                    </div>
                  </div>
                  {displayDetails && displayDetails.length > 0 ? (
                    <div className="bg-[#151b29] rounded-2xl border border-white/5 overflow-hidden">
                      {displayDetails.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-4 border-b border-white/5 last:border-0">
                          <span className="text-sm font-medium text-gray-300 truncate pr-4">{item.name}</span>
                          <span className="text-sm font-bold text-white shrink-0">{Number(item.points).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500 text-xs">No points breakdown available</div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'tournaments' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-x-auto bg-[#151b29] rounded-2xl border border-white/5">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      <th className="py-3 px-4 font-black text-gray-500 uppercase tracking-widest text-[9px]">Date</th>
                      <th className="py-3 px-4 font-black text-gray-500 uppercase tracking-widest text-[9px]">Name | Class</th>
                      <th className="py-3 px-4 font-black text-gray-500 uppercase tracking-widest text-[9px] text-center">Place</th>
                      <th className="py-3 px-4 font-black text-gray-500 uppercase tracking-widest text-[9px] text-center">Event Type</th>
                      <th className="py-3 px-4 font-black text-gray-500 uppercase tracking-widest text-[9px] text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details && details.length > 0 ? (
                      details.map((item, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 px-4 text-xs font-medium text-gray-400 whitespace-nowrap">{item.date || '-'}</td>
                          <td className="py-4 px-4">
                            <div className="text-xs font-bold text-white leading-tight">
                              {item.name} {item.class ? `| Class: ${item.class}` : ''}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-xs font-medium text-gray-300 text-center">{item.place?.replace(/\D/g,'') || '-'}</td>
                          <td className="py-4 px-4 text-center">
                            <span className="inline-block bg-[#7C3AED] text-white text-[9px] font-black italic uppercase px-2 py-0.5 rounded shadow-sm">
                              Tournament
                            </span>
                          </td>
                          <td className="py-4 px-4 text-xs font-medium text-gray-300 text-right">{Number(item.points).toLocaleString(undefined, {minimumFractionDigits: 3})}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="text-center py-10 text-gray-500 text-xs">No tournament results available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default RankingDetailsModal;
