import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Trophy, MapPin, Instagram, Download, Share2 } from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';

const PlayerModal = ({ player, onClose, userEmail, hideSapaRankings = false }) => {
    const cardRef = useRef(null);
    const printRef = useRef(null);

    if (!player) return null;

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
                    className="w-full max-w-lg bg-[#0F172A] rounded-3xl overflow-hidden shadow-2xl pointer-events-auto relative max-h-[90vh] flex flex-col"
                >
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 z-20 w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Image Section */}
                    <div className="relative h-[40vh] min-h-[300px] overflow-hidden">
                        {player.image_url ? (
                            <motion.img
                                layoutId={`image-${player.id}`}
                                src={player.image_url}
                                alt={player.name}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <motion.div
                                layoutId={`image-${player.id}`}
                                className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-white/10"
                            >
                                <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                            </motion.div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-transparent to-black/30" />

                        {/* Big Stats Overlays on Image */}
                        <motion.div layoutId={`level-${player.id}`} className="absolute top-4 left-4 bg-padel-green text-black font-black w-16 h-16 rounded-2xl flex flex-col items-center justify-center border-4 border-black shadow-xl z-20">
                            <span className="text-xs uppercase font-bold opacity-60">SKILL</span>
                            <span className="text-2xl leading-none">{player.skill_rating ? Number(player.skill_rating).toFixed(1) : player.skill_rating || '-'}</span>
                        </motion.div>

                        {player.rankedin_id && (
                            <div className="absolute top-4 right-16 bg-black/40 backdrop-blur-md border border-white/10 text-white font-bold px-4 h-16 rounded-2xl flex flex-col items-center justify-center shadow-xl z-20">
                                <span className="text-[10px] uppercase font-black text-padel-green mb-1">Rankedin ID</span>
                                <span className="text-xs opacity-70 font-mono tracking-tight">{player.rankedin_id}</span>
                            </div>
                        )}

                        {/* Name Overlay */}
                        <div className="absolute bottom-0 left-0 w-full p-8 pl-12 pt-20 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/40 to-transparent">
                            <motion.h2 layoutId={`name-${player.id}`} className="text-4xl md:text-5xl font-black text-white leading-[0.85] tracking-tighter uppercase mb-2 drop-shadow-lg">
                                {player.name?.split(' ').map((n, i) => (
                                    <span key={i} className="block">{n}</span>
                                ))}
                            </motion.h2>
                            <div className="flex items-center gap-2 text-gray-300 font-medium">
                                <MapPin className="w-4 h-4 text-padel-green" />
                                {player.home_club}, {player.nationality}
                                {player.age && <span className="ml-2 px-2 py-0.5 bg-white/10 rounded text-xs font-bold uppercase">AGE: {player.age}</span>}
                                {player.instagram_link && (
                                    <a
                                        href={player.instagram_link.startsWith('http') ? player.instagram_link : `https://instagram.com/${player.instagram_link.replace('@', '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-2 p-1.5 bg-white/10 hover:bg-padel-green hover:text-black rounded-lg transition-all"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Instagram size={14} />
                                    </a>
                                )}
                            </div>

                            <motion.div layoutId={`category-${player.id}`} className="mt-4 bg-white/10 backdrop-blur-md border border-white/20 text-white font-bold px-4 py-2 rounded-xl inline-flex flex-col items-start shadow-xl">
                                <span className="text-[10px] uppercase font-bold text-padel-green mb-0.5 tracking-wider">Category</span>
                                <span className="text-sm">{player.category}</span>
                            </motion.div>
                        </div>
                    </div>

                    {/* Content Section (Scrollable) */}
                    <div className="p-8 pb-12 space-y-8 overflow-y-auto flex-1 bg-[#0F172A] border-t border-white/5 nice-scrollbar">
                        {/* Bio */}
                        {player.bio && (
                            <div>
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Player Bio</h4>
                                <p className="text-gray-300 leading-relaxed text-lg">
                                    {player.bio}
                                </p>
                            </div>
                        )}

                        {/* Skill Rating Widget */}
                        {player.skill_rating && (
                            <div className="bg-white/5 rounded-3xl p-6 border border-white/10 flex items-center gap-6 relative overflow-hidden group/skill">
                                <div className="absolute inset-0 bg-padel-green/5 opacity-0 group-hover/skill:opacity-100 transition-opacity" />
                                <div className="relative w-24 h-24">
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
                                        <span className="text-2xl font-black text-white">{player.skill_rating}</span>
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
                        {player.match_form && (
                            <div className="flex items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl">
                                <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Recent Form</h4>
                                <div className="flex gap-2">
                                    {String(player.match_form).split(/\s+/).filter(Boolean).map((f, i) => (
                                        <div key={i} className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shadow-lg ${f === 'W' ? 'bg-padel-green text-black' : 'bg-red-500 text-white'}`}>
                                            {f}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Organizational Rankings */}
                        {safeRankings && safeRankings.length > 0 && (
                            <div className="space-y-4">
                                <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Organizational Rankings</h4>
                                <div className="grid grid-cols-1 gap-3">
                                    {safeRankings.map((r, i) => {
                                        const isBroll = r.org?.toLowerCase().includes('broll');
                                        return (
                                            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-colors group">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className={`text-[10px] font-black uppercase tracking-widest ${isBroll ? 'text-[#F40020]' : 'text-padel-green'}`}>
                                                                {r.org || 'Ranking'}
                                                            </p>
                                                            <span className="text-[10px] text-gray-600 font-bold">•</span>
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{r.match_type || 'Doubles'}</p>
                                                        </div>
                                                        <p className="text-lg font-bold text-white tracking-tight leading-tight mb-1">{r.age_group || r.division || 'Open'}</p>
                                                    </div>
                                                    <div className="flex gap-4">
                                                        <div className="text-right">
                                                            <p className="text-[8px] text-gray-500 uppercase font-black tracking-widest mb-0.5">Rank</p>
                                                            <div className="flex items-baseline gap-0.5 justify-end">
                                                                <span className={`${isBroll ? 'text-[#F40020]' : 'text-padel-green'} text-[10px] font-black`}>#</span>
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
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Sponsors */}
                        {safeSponsors && safeSponsors.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Sponsors</h4>
                                <div className="flex flex-wrap gap-4">
                                    {safeSponsors.map(sponsor => (
                                        <div key={sponsor} className="px-4 py-2 border border-white/10 rounded-lg text-sm font-bold text-gray-400 bg-white/5">
                                            {sponsor}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Download & Share Section for Owners */}
                        {(userEmail === player.email || (player.hasLocalProfile && userEmail === player.playerRecord?.email)) && (
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
                                                    <p className={`${isBroll ? 'text-[#F40020]' : 'text-padel-green'} text-xs font-black uppercase tracking-widest mb-1`}>{r.org}</p>
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
        </>
    );
};

export default PlayerModal;
