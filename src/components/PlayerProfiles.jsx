import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRankedin } from '../hooks/useRankedin';
import player1 from '../assets/player_1.png';
import dynamicsPlayer from '../assets/dynamics_player.png';
import { Users, Trophy } from 'lucide-react';

const PlayerProfiles = () => {
    const { getOrganisationRankings } = useRankedin();
    const [mensRankings, setMensRankings] = useState([]);
    const [ladiesRankings, setLadiesRankings] = useState([]);
    const [mixedRankings, setMixedRankings] = useState([]);
    const [loading, setLoading] = useState(true);

    const [imageErrors, setImageErrors] = useState({});

    useEffect(() => {
        const fetchAllRankings = async () => {
            try {
                // Fetch top 10 for each category concurrently
                const [mensData, ladiesData, mixedData] = await Promise.all([
                    getOrganisationRankings(3, 82, 10), // Men-Main
                    getOrganisationRankings(4, 83, 10), // Women-Main
                    getOrganisationRankings(5, 84, 10)  // Mixed-Main
                ]);

                setMensRankings(formatRankings(mensData));
                setLadiesRankings(formatRankings(ladiesData));
                setMixedRankings(formatRankings(mixedData));
            } catch (err) {
                console.error("Error fetching rankings for Player profiles", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAllRankings();
    }, [getOrganisationRankings]);

    const getInitials = (name) => {
        if (!name) return "";
        const parts = name.split(" ");
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    const formatRankings = (data) => {
        if (!data) return [];
        return data.map(item => {
            const participantId = item.Participant?.Id;
            // Rankedin uses Azure CDN for profile pictures if available
            // If they don't have one, this URL might 404, so we'll handle fallback in the img tag
            const avatarUrl = participantId
                ? `https://rankedin-prod-cdn-adavg8d3dwfegkbd.z01.azurefd.net/images/upload/participant/${participantId}.png`
                : player1;

            return {
                id: item.Participant?.Id || item.RankedinId,
                name: item.Name,
                rank: `Rank #${item.Standing}`,
                image: avatarUrl,
                originalImage: avatarUrl, // store Original to check if it fails
                points: item.ParticipantPoints?.Points || 0,
                ageGroup: item.PlayerAgeGroup,
                rankedinProfile: `https://www.rankedin.com${item.ParticipantUrl}`
            };
        });
    };

    if (loading) return null;

    const renderRankingSlider = (title, playersData) => {
        if (!playersData || playersData.length === 0) return null;

        return (
            <div className="mb-20 last:mb-0">
                <div className="flex items-center gap-3 mb-6 px-6 md:px-20">
                    <Trophy className="w-6 h-6 text-padel-green" />
                    <h3 className="text-2xl md:text-3xl font-bold text-white uppercase tracking-wider">{title}</h3>
                </div>

                <div className="flex gap-6 overflow-x-auto pb-8 snap-x px-6 md:px-20 nice-scrollbar">
                    {playersData.map((player, index) => (
                        <motion.div
                            key={player.id || index}
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: Math.min(index * 0.1, 0.5) }}
                            className="min-w-[280px] md:min-w-[320px] relative group rounded-3xl overflow-hidden snap-center shadow-xl border border-white/5 bg-black/40"
                        >
                            <div className="h-[380px] w-full relative bg-gradient-to-br from-[#1E293B] to-[#0F172A] flex items-center justify-center">
                                {!imageErrors[player.id] ? (
                                    <img
                                        src={player.image}
                                        alt={player.name}
                                        className="w-full h-full object-cover filter grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 scale-100 group-hover:scale-105"
                                        onError={() => setImageErrors(prev => ({ ...prev, [player.id]: true }))}
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-[#253247] to-[#141d2e]">
                                        <div className="w-48 h-48 rounded-full bg-[#E2E4EB] flex items-center justify-center shadow-2xl mb-12 transform scale-100 group-hover:scale-105 transition-transform duration-500">
                                            <span className="text-6xl font-black text-[#2B3B60] tracking-tighter">{getInitials(player.name)}</span>
                                        </div>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
                            </div>

                            <div className="absolute bottom-0 left-0 right-0 p-6">
                                <p className="text-padel-green font-black mb-1 text-sm tracking-widest uppercase">{player.rank}</p>
                                <h4 className="text-2xl font-bold text-white mb-4 line-clamp-1">{player.name}</h4>

                                <div className="flex justify-between items-center border-t border-white/10 pt-4">
                                    <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Points</p>
                                        <p className="text-lg font-black text-white">{player.points.toLocaleString()}</p>
                                    </div>
                                    <a
                                        href={player.rankedinProfile}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-padel-green hover:text-black transition-colors"
                                    >
                                        <Users className="w-4 h-4" />
                                    </a>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <section className="py-24 bg-[#0F172A] overflow-hidden">
            <div className="container mx-auto px-6 md:px-20 mb-12">
                <span className="text-padel-green font-bold tracking-widest uppercase text-sm">Our Talent</span>
                <h2 className="text-4xl md:text-5xl font-bold text-white mt-4">SAPA Official Top Rankings</h2>
                <p className="text-gray-400 mt-4 max-w-2xl">The latest top 10 rankings straight from Rankedin. See who's dominating the leaderboard in the open divisions.</p>
            </div>

            {renderRankingSlider("Men's Open", mensRankings)}
            {renderRankingSlider("Ladies Open", ladiesRankings)}
            {renderRankingSlider("Mixed Open", mixedRankings)}
        </section>
    );
};

export default PlayerProfiles;
