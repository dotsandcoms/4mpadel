import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Share2 } from 'lucide-react';

const RankingDetailsModal = ({ player, playerRecord, onClose, selectedOrgId }) => {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' or 'tournaments'
  const [showBest8, setShowBest8] = useState(true);

  if (!playerRecord) return null;

  // ORG mapping
  const orgLabels = {
    15809: 'SAPA',
    16317: 'Broll',
    16482: 'SA Grand Tour'
  };
  const activeOrgLabel = orgLabels[selectedOrgId] || 'SAPA';

  // Find the ranking record for the active org
  let rankingData = null;
  if (playerRecord.rankings && Array.isArray(playerRecord.rankings)) {
    rankingData = playerRecord.rankings.find(r => r.org?.toUpperCase().includes(activeOrgLabel.toUpperCase()));
  }

  // Fallback to player object if rankingData is missing some fields
  const displayRank = rankingData?.rank || player.rawRank;
  const displayPoints = rankingData?.points || player.points;
  const details = rankingData?.details || [];

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
          className="flex-1 flex flex-col bg-[#0b0f19] sm:w-[800px] sm:max-w-[95vw] sm:max-h-[85vh] sm:flex-none sm:rounded-3xl sm:border sm:border-white/10 sm:overflow-hidden relative"
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
            <div>
              <h2 className="text-xl font-bold text-white uppercase tracking-tight flex items-center gap-2">
                {playerRecord.name}
                <span className="w-2.5 h-2.5 rounded-full bg-padel-green"></span>
              </h2>
              <div className="flex flex-col gap-1 mt-1 text-xs text-gray-400 font-medium">
                {playerRecord.nationality && (
                  <div className="flex items-center gap-1.5">
                    <img src={`https://flagcdn.com/w20/${playerRecord.nationality.toLowerCase() === 'south africa' ? 'za' : 'za'}.png`} alt="flag" className="w-4 h-auto" onError={(e) => e.target.style.display='none'}/>
                    <span>{playerRecord.nationality}</span>
                  </div>
                )}
                {playerRecord.home_club && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 flex justify-center text-[10px]">📍</span>
                    <span>{playerRecord.home_club}</span>
                  </div>
                )}
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
          <div className="flex-1 overflow-y-auto px-6 py-6 nice-scrollbar">
            {activeTab === 'overview' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
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
