import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Building2, ChevronRight, MapPin, Search } from 'lucide-react';
import {
    fetchPublishedClubGroups,
    fetchClubGroupVenueCounts,
} from '../utils/clubGroup';
import { clubRegionLabel } from '../utils/club';
import heroCourt from '../assets/home.jpeg';

/**
 * Public directory of published club groups — /groups
 */
const ClubGroups = () => {
    const [groups, setGroups] = useState([]);
    const [venueCounts, setVenueCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchPublishedClubGroups();
                setGroups(data || []);
                const counts = await fetchClubGroupVenueCounts((data || []).map((g) => g.id));
                setVenueCounts(counts);
            } catch (err) {
                console.error('Failed to load club groups:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return groups;
        return groups.filter(
            (g) =>
                g.name?.toLowerCase().includes(q)
                || g.short_name?.toLowerCase().includes(q)
                || g.city?.toLowerCase().includes(q)
                || g.province?.toLowerCase().includes(q),
        );
    }, [groups, search]);

    return (
        <div className="min-h-screen bg-black text-white pb-24">
            <Helmet>
                <title>Club Groups | 4M Padel</title>
                <meta
                    name="description"
                    content="Padel club groups and brands on 4M Padel — browse multi-venue operators and their branches."
                />
            </Helmet>

            <div className="relative overflow-hidden border-b border-white/5 bg-gradient-to-br from-black via-[#0B0F19] to-black">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-0 w-screen h-[62vw] max-h-[420px] md:h-[38vw] md:max-h-[520px] lg:max-h-[560px] min-h-[260px] overflow-hidden">
                    <div className="absolute inset-0">
                        <img
                            src={heroCourt}
                            alt=""
                            className="w-full h-full object-cover object-[78%_center] md:object-[82%_center] grayscale contrast-[1.35] brightness-[0.95]"
                        />
                    </div>
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black via-black/75 to-transparent" />
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/25 via-black/45 to-black" />
                </div>
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-padel-green/5 blur-[100px] rounded-full pointer-events-none" />
                <div className="container mx-auto px-4 md:px-6 pt-28 md:pt-36 pb-10 md:pb-14 relative z-10">
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.25em] text-padel-green">
                        4M Padel Ecosystem
                    </span>
                    <h1 className="text-3xl md:text-5xl font-bold font-display tracking-tighter mt-2 leading-[1.05]">
                        Club <span className="text-padel-green">Groups</span>
                    </h1>
                    <p className="text-gray-400 text-sm md:text-base mt-3 max-w-xl">
                        Multi-venue brands and operators — explore groups and jump into their venues.
                    </p>

                    <div className="relative z-10 max-w-md mt-6">
                        <div className="relative bg-[#181818] border border-white/5 rounded-full shadow-lg">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 md:w-5 md:h-5" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search groups..."
                                className="w-full bg-transparent py-3 md:py-3.5 pl-12 md:pl-14 pr-4 text-[14px] md:text-base text-white focus:outline-none placeholder-gray-500 rounded-full"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 md:px-6 mt-8 md:mt-12">
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="h-40 rounded-3xl bg-white/[0.03] border border-white/5 animate-pulse" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-24 text-gray-500">
                        <Building2 size={40} className="mx-auto mb-4 opacity-30" />
                        <p className="text-sm">
                            {groups.length === 0
                                ? 'No club groups published yet — check back soon.'
                                : 'No groups match your search.'}
                        </p>
                        <Link
                            to="/clubs"
                            className="inline-block mt-4 text-[10px] font-black uppercase tracking-widest text-padel-green"
                        >
                            Browse clubs
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filtered.map((group, idx) => {
                            const venueCount = venueCounts[group.id] || 0;
                            const region = group.province || clubRegionLabel({ city: group.city, name: group.name });
                            const locationLabel = [group.city, region].filter(Boolean).join(' · ');
                            return (
                                <motion.div
                                    key={group.id}
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.04 }}
                                >
                                    <Link
                                        to={`/groups/${group.slug}`}
                                        className="group block bg-white/[0.02] border border-white/10 hover:border-padel-green/40 rounded-2xl p-5 transition-all h-full"
                                    >
                                        <div className="flex items-start gap-4">
                                            {group.logo_url ? (
                                                <img
                                                    src={group.logo_url}
                                                    alt=""
                                                    className="w-14 h-14 rounded-2xl object-cover border border-white/10 shrink-0"
                                                />
                                            ) : (
                                                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                                    <Building2 size={20} className="text-gray-500" />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap gap-1.5 mb-1.5">
                                                    <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-sky-500/10 text-sky-300 border-sky-500/25">
                                                        <Building2 size={9} /> Group
                                                    </span>
                                                    <span className="inline-flex items-center text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-white/5 text-gray-400 border-white/10">
                                                        {venueCount} {venueCount === 1 ? 'venue' : 'venues'}
                                                    </span>
                                                </div>
                                                <h2 className="text-lg font-bold font-display tracking-tighter text-white group-hover:text-padel-green transition-colors truncate">
                                                    {group.short_name || group.name}
                                                </h2>
                                                {locationLabel && (
                                                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                                        <MapPin size={11} /> {locationLabel}
                                                    </p>
                                                )}
                                                {group.about && (
                                                    <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">
                                                        {group.about}
                                                    </p>
                                                )}
                                            </div>
                                            <ChevronRight size={16} className="text-gray-600 group-hover:text-padel-green shrink-0 mt-1" />
                                        </div>
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClubGroups;
