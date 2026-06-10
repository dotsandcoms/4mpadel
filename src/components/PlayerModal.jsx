import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, MapPin, Instagram, Download, Share2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';

const PlayerModal = ({ player, onClose, userEmail, hideSapaRankings = false }) => {
    const cardRef = useRef(null);
    const printRef = useRef(null);
    const [expandedRankingIdx, setExpandedRankingIdx] = useState(null);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [lightboxImageIdx, setLightboxImageIdx] = useState(0);
    const [activeTab, setActiveTab] = useState('info');

    const tabs = [
        { id: 'info', label: 'Info' },
        { id: 'form', label: 'Form' },
        { id: 'rankings', label: 'Rankings' },
        { id: 'sponsors', label: 'Sponsors' },
    ];

    if (!player) return null;

    // Parse additional images safely
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

    // Combined unique gallery URLs (main photo + up to 5 additional gallery photos)
    const gallery = [player.image_url, ...safeAdditionalImages].filter(Boolean).filter((val, idx, self) => self.indexOf(val) === idx);

    // Safe data parsing
    let safeSponsors = [];
    if (Array.isArray(player.sponsors)) {
        safeSponsors = player.sponsors;
    } else if (typeof player.sponsors === 'string') {
        const trimmed = player.sponsors.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                safeSponsors = JSON.parse(trimmed);
            } catch (e) {
                // Fallback for malformed stringified arrays
                safeSponsors = trimmed.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
            }
        } else {
            safeSponsors = trimmed.split(',').map(s => s.trim()).filter(Boolean);
        }
    }

    let safeRankings = Array.isArray(player.rankings) ? player.rankings : [];
    if (hideSapaRankings) {
        safeRankings = safeRankings.filter(r => !r.org?.toUpperCase().includes('SAPA'));
    }

    const downloadCard = async () => {
        if (!printRef.current) return;
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
            pdf.save(`${player.name.replace(/\s+/g, '_')}_Profile_Card.pdf`);
        } catch (err) {
            console.error('Error generating PDF:', err);
        }
    };

    const shareCard = async () => {
        try {
            const shareUrl = `${window.location.origin}/players?id=${player.id}`;
            if (navigator.share) {
                await navigator.share({
                    title: `${player.name}'s Player Profile`,
                    text: `Check out ${player.name}'s player profile on 4M Padel!`,
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
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] cursor-pointer"
            />
            <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-4">
                <motion.div
                    layoutId={`card-${player.id}`}
                    ref={cardRef}
                    className="w-full max-w-lg md:max-w-4xl bg-[#0a0f1d] border border-white/10 backdrop-blur-2xl rounded-[2rem] md:rounded-[2.5rem] overflow-y-auto md:overflow-hidden shadow-2xl pointer-events-auto relative max-h-[90vh] md:max-h-[85vh] flex flex-col my-auto"
                >
                    {/* Floating Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 z-50 w-11 h-11 bg-black/40 hover:bg-white text-white hover:text-black rounded-full flex items-center justify-center transition-all cursor-pointer shadow-2xl border border-white/10"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Ambient Neon Glow Bubbles */}
                    <div className="absolute top-0 right-0 w-72 h-72 bg-padel-green/5 rounded-full blur-[100px] pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-72 h-72 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

                    <div className="flex flex-col md:flex-row h-auto md:h-full overflow-visible md:overflow-hidden">
                        
                        {/* LEFT COLUMN: Player Identity & Hero Media Viewport */}
                        <div className="w-full md:w-[40%] flex flex-col border-b md:border-b-0 md:border-r border-white/5 shrink-0 bg-black/30">
                            
                            {/* Hero Viewport */}
                            <div className="relative h-[30vh] md:h-[48vh] overflow-hidden group shrink-0">
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
                                        className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-white/10"
                                    >
                                        <svg className="w-32 h-32 md:w-44 md:h-44" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                                        </svg>
                                    </motion.div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1d] via-[#0a0f1d]/30 to-black/30" />

                                {/* Skill Rating Badge Overlay */}
                                <motion.div layoutId={`level-${player.id}`} className="absolute top-6 left-6 bg-padel-green text-black font-black w-14 h-14 rounded-2xl flex flex-col items-center justify-center border-4 border-[#0a0f1d] shadow-2xl z-20 hover:scale-105 transition-transform duration-300">
                                    <span className="text-[9px] uppercase font-black opacity-60">SKILL</span>
                                    <span className="text-xl leading-none">{player.skill_rating ? Number(player.skill_rating).toFixed(1) : player.skill_rating || '-'}</span>
                                </motion.div>

                                {/* Rankedin ID Overlay */}
                                {player.rankedin_id && (
                                    <div className="absolute top-6 right-16 bg-[#0a0f1d]/75 backdrop-blur-md border border-white/10 text-white font-bold px-3.5 h-14 rounded-2xl flex flex-col items-center justify-center shadow-xl z-20">
                                        <span className="text-[8px] uppercase font-black text-padel-green mb-0.5 tracking-wider">Rankedin ID</span>
                                        <span className="text-[10px] opacity-70 font-mono tracking-tight">{player.rankedin_id}</span>
                                    </div>
                                )}

                                {/* High-Contrast Name Overlay */}
                                <div className="absolute bottom-0 left-0 w-full p-6 md:p-8 bg-gradient-to-t from-[#0a0f1d] via-[#0a0f1d]/40 to-transparent">
                                    <motion.h2 layoutId={`name-${player.id}`} className="text-3xl md:text-[2.65rem] font-black text-white leading-[0.88] tracking-tighter uppercase mb-3">
                                        {player.name?.split(' ').map((n, i) => (
                                            <span key={i} className="block">{n}</span>
                                        ))}
                                    </motion.h2>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-300 font-semibold">
                                        <div className="flex items-center gap-1">
                                            <MapPin className="w-3.5 h-3.5 text-padel-green" />
                                            <span>{player.home_club || 'No Club'}, {player.nationality}</span>
                                        </div>
                                        {player.instagram_link && (
                                            <a
                                                href={player.instagram_link.startsWith('http') ? player.instagram_link : `https://instagram.com/${player.instagram_link.replace('@', '')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 bg-white/10 hover:bg-padel-green hover:text-black rounded-lg transition-all"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Instagram size={12} />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Gallery Thumbnail Shelf */}
                            {gallery.length > 1 && (
                                <div className="p-6 bg-[#060a14]/60 flex flex-col gap-2.5 md:flex-1 md:justify-center border-t border-white/5 shrink-0 md:shrink">
                                    <span className="text-[8px] font-black text-padel-green uppercase tracking-[0.25em] leading-none mb-1">
                                        Player Gallery ({gallery.length})
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        {gallery.map((imgUrl, idx) => (
                                            <button
                                                key={idx}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setLightboxImageIdx(idx);
                                                    setIsLightboxOpen(true);
                                                }}
                                                className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 hover:border-padel-green hover:scale-105 active:scale-95 transition-all duration-300 shrink-0 relative group shadow-md"
                                            >
                                                <img src={imgUrl} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/25 group-hover:bg-transparent transition-colors" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: Spacious & Structured Information Pane */}
                        <div className="flex-1 p-6 md:p-10 flex flex-col h-auto md:h-auto min-h-0 bg-[#0a0f1d]/50 backdrop-blur-md">
                            
                            {/* Tabs Header */}
                            <div className="flex gap-2 border-b border-white/5 pb-4 mb-6 overflow-x-auto hide-scrollbar shrink-0">
                                {tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`px-4 py-1.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all ${
                                            activeTab === tab.id 
                                            ? 'bg-padel-green text-black shadow-[0_0_15px_rgba(190,255,0,0.3)]' 
                                            : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 overflow-visible md:overflow-y-auto nice-scrollbar pr-0 md:pr-2 space-y-6 md:space-y-8 relative">
                                
                                <div className={`${activeTab === 'info' ? 'block animate-in fade-in duration-300' : 'hidden'} space-y-6 md:space-y-8`}>
                                        {/* Tactile Information Panel Grid */}
                                        <div className="grid grid-cols-2 gap-3.5 shrink-0">
                                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-0.5 hover:border-white/20 transition-all duration-300">
                                                <span className="text-[9px] uppercase font-black text-padel-green tracking-widest leading-none mb-1">Category / Division</span>
                                                <span className="text-sm font-extrabold text-white truncate">{player.category || 'Open Division'}</span>
                                            </div>
                                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-0.5 hover:border-white/20 transition-all duration-300">
                                                <span className="text-[9px] uppercase font-black text-padel-green tracking-widest leading-none mb-1">Racket Brand</span>
                                                <span className="text-sm font-extrabold text-white truncate">{player.racket_brand || 'Not Specified'}</span>
                                            </div>
                                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-0.5 hover:border-white/20 transition-all duration-300">
                                                <span className="text-[9px] uppercase font-black text-padel-green tracking-widest leading-none mb-1">Home Region</span>
                                                <span className="text-sm font-extrabold text-white truncate">{player.region || 'Not Specified'}</span>
                                            </div>
                                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-0.5 hover:border-white/20 transition-all duration-300">
                                                <span className="text-[9px] uppercase font-black text-padel-green tracking-widest leading-none mb-1">Age Group</span>
                                                <span className="text-sm font-extrabold text-white truncate">{player.age ? `${player.age} Years Old` : 'Not Specified'}</span>
                                            </div>
                                        </div>

                                        {/* Player Biography (High-end Card with Quotes Watermark) */}
                                        {player.bio && (
                                            <div className="relative overflow-hidden bg-gradient-to-r from-white/5 to-transparent border border-white/10 rounded-2xl p-5 md:p-6 shadow-inner hover:border-white/20 transition-all duration-300">
                                                <div className="absolute -top-4 -right-3 text-white/5 font-serif text-9xl pointer-events-none select-none font-bold">“</div>
                                                <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-[0.25em] mb-2.5">Player Bio</h4>
                                                <p className="text-gray-300 leading-relaxed text-sm md:text-[15px] italic font-medium relative z-10">
                                                    "{player.bio}"
                                                </p>
                                            </div>
                                        )}
                                </div>

                                <div className={`${activeTab === 'form' ? 'block animate-in fade-in duration-300' : 'hidden'} space-y-6 md:space-y-8`}>
                                        {/* Skill Level Progress Bar / Radial Widget */}
                                        {player.skill_rating && (
                                            <div className="bg-white/5 rounded-2xl p-5 border border-white/10 flex items-center gap-5 relative overflow-hidden group">
                                                <div className="absolute inset-0 bg-padel-green/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                                <div className="relative w-16 h-16 shrink-0">
                                                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                                        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                                                        <motion.circle
                                                            initial={{ strokeDashoffset: 283 }}
                                                            animate={{ strokeDashoffset: 283 - (283 * Math.min(player.skill_rating, 30) / 30) }}
                                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                                            cx="50" cy="50" r="45" fill="none" stroke="#beff00" strokeWidth="8"
                                                            strokeDasharray="283"
                                                            strokeLinecap="round"
                                                        />
                                                    </svg>
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                        <span className="text-lg font-black text-white">{player.skill_rating}</span>
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-xs font-black text-white uppercase tracking-wider mb-0.5">Rankedin Skill Rating</h4>
                                                    <p className="text-[10px] text-gray-400 font-semibold leading-relaxed uppercase opacity-75">
                                                        Live index based on match intensity and performance.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Recent Match Form */}
                                        {player.match_form && (
                                            <div className="flex items-center justify-between p-5 bg-white/5 border border-white/10 rounded-2xl">
                                                <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-[0.25em]">Recent Form</h4>
                                                <div className="flex gap-2">
                                                    {String(player.match_form).split(/\s+/).filter(Boolean).map((f, i) => (
                                                        <div key={i} className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shadow-lg ${f === 'W' ? 'bg-padel-green text-black' : 'bg-red-500 text-white'}`}>
                                                            {f}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {!player.skill_rating && !player.match_form && (
                                            <div className="text-center py-8 text-gray-500 text-sm font-bold bg-white/5 border border-white/10 rounded-2xl">
                                                No form or rating data available.
                                            </div>
                                        )}
                                </div>

                                <div className={`${activeTab === 'rankings' ? 'block animate-in fade-in duration-300' : 'hidden'} space-y-6 md:space-y-8`}>
                                        {/* Organizational Rankings (Interactive Accordions) */}
                                        {safeRankings && safeRankings.length > 0 ? (
                                            <div className="space-y-4">
                                                <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-[0.25em]">Official Rankings</h4>
                                                <div className="grid grid-cols-1 gap-3">
                                                    {safeRankings.map((r, i) => {
                                                        const isBroll = r.org?.toLowerCase().includes('broll');
                                                        const isSapa = r.org?.toLowerCase().includes('sapa');
                                                        return (
                                                            <div
                                                                key={i}
                                                                className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-all duration-300 group cursor-pointer pointer-events-auto"
                                                                onClick={() => setExpandedRankingIdx(expandedRankingIdx === i ? null : i)}
                                                            >
                                                                <div className="flex items-center justify-between gap-4">
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <p className={`text-[10px] font-black uppercase tracking-widest ${isBroll ? 'text-[#F40020]' : isSapa ? 'text-padel-green' : 'text-gray-400'}`}>
                                                                                {r.org || 'SAPA RANKING'}
                                                                            </p>
                                                                            <span className="text-[10px] text-gray-600 font-bold">•</span>
                                                                            <p className="text-[9px] text-gray-450 font-bold uppercase tracking-tight">{r.match_type || 'Doubles'}</p>
                                                                        </div>
                                                                        <p className="text-base font-bold text-white tracking-tight leading-tight">{r.age_group || r.division || 'Open'}</p>
                                                                    </div>
                                                                    <div className="flex gap-4 items-center">
                                                                        <div className="text-right">
                                                                            <p className="text-[8px] text-gray-500 uppercase font-black tracking-widest mb-0.5">Rank</p>
                                                                            <div className="flex items-baseline gap-0.5 justify-end">
                                                                                <span className={`${isBroll ? 'text-[#F40020]' : 'text-padel-green'} text-[9px] font-black`}>#</span>
                                                                                <span className="text-lg font-black text-white tracking-tighter">{r.rank}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-[8px] text-gray-500 uppercase font-black tracking-widest mb-0.5">Points</p>
                                                                            <p className={`text-lg font-black tracking-tighter ${isBroll ? 'text-[#F40020]' : 'text-padel-green'}`}>{r.points}</p>
                                                                        </div>
                                                                        <div className="text-gray-400 pl-2">
                                                                            {expandedRankingIdx === i ? <ChevronUp size={14} className="text-padel-green" /> : <ChevronDown size={14} className="group-hover:text-padel-green transition-colors" />}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Expanded Points Breakdown Accordion */}
                                                                {expandedRankingIdx === i && (
                                                                    <div
                                                                        className="mt-4 pt-4 border-t border-white/10 overflow-hidden"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        {r.details && r.details.length > 0 ? (
                                                                            <div className="space-y-2 max-h-[160px] overflow-y-auto no-scrollbar">
                                                                                {r.details.map((item, idx) => (
                                                                                    <div key={idx} className="flex justify-between items-center bg-black/30 border border-white/5 rounded-xl p-3 text-[10px]">
                                                                                        <div className="min-w-0 pr-2">
                                                                                            <div className="font-bold text-white truncate max-w-[200px]">{item.name}</div>
                                                                                            <div className="flex gap-2 items-center text-[8px] text-gray-455 mt-0.5 font-semibold">
                                                                                                <span>{item.date}</span>
                                                                                                {item.class && (
                                                                                                    <>
                                                                                                        <span>•</span>
                                                                                                        <span className="text-padel-green uppercase font-black tracking-wider text-[8px]">{item.class}</span>
                                                                                                    </>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="text-right shrink-0">
                                                                                            <div className="text-padel-green font-black">+{item.points} PTS</div>
                                                                                            <div className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Place: {item.place}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="text-center py-4 text-[9px] text-gray-500 font-black uppercase tracking-wider bg-black/10 rounded-xl">
                                                                                No tournament details available for this ranking list.
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 text-gray-500 text-sm font-bold bg-white/5 border border-white/10 rounded-2xl">
                                                No official rankings available.
                                            </div>
                                        )}
                                </div>

                                <div className={`${activeTab === 'sponsors' ? 'block animate-in fade-in duration-300' : 'hidden'} space-y-6 md:space-y-8`}>
                                        {/* Sponsors Section */}
                                        {safeSponsors && safeSponsors.length > 0 ? (
                                            <div className="space-y-3.5">
                                                <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-[0.25em]">Official Sponsors</h4>
                                                <div className="flex flex-wrap gap-2.5">
                                                    {safeSponsors.map(sponsor => (
                                                        <div key={sponsor} className="px-4 py-2 border border-white/10 hover:border-padel-green rounded-xl text-xs font-black text-gray-300 bg-white/5 uppercase tracking-wider shadow-md hover:scale-105 transition-all">
                                                            {sponsor}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 text-gray-500 text-sm font-bold bg-white/5 border border-white/10 rounded-2xl">
                                                No official sponsors listed.
                                            </div>
                                        )}
                                </div>
                            </div>

                            {/* Action Buttons for Card Owners */}
                            {(userEmail === player.email || (player.hasLocalProfile && userEmail === player.playerRecord?.email)) && (
                                <div className="flex gap-4 pt-6 mt-6 border-t border-white/5 shrink-0">
                                    <button
                                        onClick={downloadCard}
                                        className="flex-1 bg-padel-green text-black font-extrabold uppercase tracking-widest text-[10px] md:text-xs py-4 px-6 rounded-xl flex items-center justify-center gap-2 hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all pointer-events-auto shadow-lg shadow-padel-green/10"
                                    >
                                        <Download size={15} />
                                        Download Pro Card
                                    </button>
                                    <button
                                        onClick={shareCard}
                                        className="bg-white/5 hover:bg-white text-white hover:text-black transition-all p-4 rounded-xl flex items-center justify-center pointer-events-auto border border-white/10"
                                    >
                                        <Share2 size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

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
                        {player.image_url ? (
                            <img src={player.image_url} crossOrigin="anonymous" className="w-full h-full object-cover" alt="" />
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
                            <span className="text-4xl leading-none">{player.skill_rating ? Number(player.skill_rating).toFixed(1) : player.skill_rating || '-'}</span>
                        </div>

                        <div className="absolute top-10 right-10 bg-white/10 backdrop-blur-xl border border-white/20 text-white font-bold px-8 h-20 rounded-3xl flex flex-col items-center justify-center shadow-2xl">
                            <span className="text-xs uppercase font-bold text-padel-green mb-1 tracking-widest">Category</span>
                            <span className="text-lg">{player.category}</span>
                        </div>

                        {/* Name Overlay */}
                        <div className="absolute bottom-12 left-12 right-12">
                            <h1 className="text-6xl font-black uppercase tracking-tighter leading-[0.82] mb-4 drop-shadow-2xl">
                                {player.name?.split(' ').map((n, i) => (
                                    <span key={i} className="block">{n}</span>
                                ))}
                            </h1>
                            <div className="flex items-center gap-3 text-padel-green text-2xl font-bold uppercase tracking-[0.15em] drop-shadow-lg">
                                <MapPin size={28} />
                                {player.home_club}
                            </div>
                        </div>
                    </div>

                    {/* Stats and Info Area */}
                    <div className="p-12 space-y-12 border-t border-white/5 bg-[#0F172A]">
                        {/* Bio Section */}
                        {player.bio && (
                            <div>
                                <h4 className="text-sm font-black text-gray-500 uppercase tracking-[0.3em] mb-6">Player Bio</h4>
                                <p className="text-2xl text-gray-300 leading-relaxed font-medium py-2">
                                    {player.bio}
                                </p>
                            </div>
                        )}

                        {/* Rankings in Print Template */}
                        {safeRankings && safeRankings.length > 0 && (
                            <div className="bg-white/5 rounded-[32px] p-8 border border-white/10">
                                <h4 className="text-sm font-black text-gray-500 uppercase tracking-[0.3em] mb-8">Official Rankings</h4>
                                <div className="space-y-4">
                                    {safeRankings.map((r, i) => {
                                        const isBroll = r.org?.toLowerCase().includes('broll');
                                        return (
                                            <div key={i} className="flex items-center justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0">
                                                <div>
                                                    <p className={`${isBroll ? 'text-[#F40020]' : 'text-padel-green'} text-xs font-black uppercase tracking-widest mb-1`}>{r.org || 'SAPA RANKING'}</p>
                                                    <p className="text-xl font-bold text-white">{r.age_group || 'Open'}</p>
                                                    <p className="text-sm text-gray-500 font-bold uppercase">{r.match_type}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Rank</p>
                                                    <p className="text-3xl font-black text-white">#{r.rank}</p>
                                                    <p className={`text-sm ${isBroll ? 'text-[#F40020]' : 'text-padel-green'} font-bold`}>{r.points} PTS</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Sponsors Section */}
                        {safeSponsors && safeSponsors.length > 0 && (
                            <div>
                                <h4 className="text-sm font-black text-gray-500 uppercase tracking-[0.3em] mb-8">Official Sponsors</h4>
                                <div className="flex flex-wrap gap-4">
                                    {safeSponsors.map(sponsor => (
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

            {/* Lightbox / Fullscreen Image Viewer Modal */}
            <AnimatePresence>
                {isLightboxOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsLightboxOpen(false)}
                        className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl p-4 md:p-8 pointer-events-auto"
                    >
                        {/* Close button */}
                        <button
                            onClick={() => setIsLightboxOpen(false)}
                            className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white text-white hover:text-black rounded-full flex items-center justify-center transition-all cursor-pointer z-50 shadow-2xl"
                        >
                            <X className="w-6 h-6" />
                        </button>

                        {/* Prev button */}
                        {gallery.length > 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxImageIdx((prev) => (prev === 0 ? gallery.length - 1 : prev - 1));
                                }}
                                className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/5 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all cursor-pointer z-50 shadow-xl"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </button>
                        )}

                        {/* Main Lightbox Image Viewport */}
                        <div className="relative max-w-4xl max-h-[80vh] w-full flex items-center justify-center">
                            <motion.img
                                key={lightboxImageIdx}
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                src={gallery[lightboxImageIdx]}
                                alt={`Gallery Photo ${lightboxImageIdx + 1}`}
                                className="max-w-full max-h-[80vh] object-contain rounded-2xl border border-white/10 shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>

                        {/* Next button */}
                        {gallery.length > 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxImageIdx((prev) => (prev === gallery.length - 1 ? 0 : prev + 1));
                                }}
                                className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/5 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all cursor-pointer z-50 shadow-xl"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </button>
                        )}

                        {/* Lightbox pagination indicator */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-gray-400 font-bold uppercase tracking-widest text-xs md:text-sm bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                            {lightboxImageIdx + 1} / {gallery.length}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default PlayerModal;
