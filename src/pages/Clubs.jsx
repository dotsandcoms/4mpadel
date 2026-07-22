import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MapPin, BadgeCheck, ShieldCheck, ChevronRight, Search } from 'lucide-react';
import { fetchPublishedClubs } from '../utils/club';

/**
 * Public directory of published clubs — /clubs
 */
const Clubs = () => {
    const [clubs, setClubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchPublishedClubs();
                setClubs(data);
            } catch (err) {
                console.error('Failed to load clubs:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const filtered = clubs.filter((c) =>
        !search.trim()
        || c.name?.toLowerCase().includes(search.toLowerCase().trim())
        || c.short_name?.toLowerCase().includes(search.toLowerCase().trim())
        || c.city?.toLowerCase().includes(search.toLowerCase().trim()),
    );

    return (
        <div className="min-h-screen bg-black text-white pb-24">
            <Helmet>
                <title>Clubs | 4M Padel</title>
                <meta name="description" content="Padel clubs on 4M Padel — courts, facilities, organisations and events." />
            </Helmet>

            <div className="relative overflow-hidden border-b border-white/5 bg-gradient-to-br from-black via-[#0B0F19] to-black">
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-padel-green/5 blur-[100px] rounded-full pointer-events-none" />
                <div className="container mx-auto px-4 md:px-6 pt-28 md:pt-36 pb-10 md:pb-14 relative z-10">
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.25em] text-padel-green">4M Padel Ecosystem</span>
                    <h1 className="text-3xl md:text-5xl font-black mt-2 leading-tight">
                        Padel <span className="text-padel-green">Clubs</span>
                    </h1>
                    <p className="text-gray-400 text-sm md:text-base mt-3 max-w-xl">
                        Venues across South Africa — courts, facilities, and links to tournament organisers.
                    </p>

                    <div className="relative max-w-md mt-6">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search clubs..."
                            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-padel-green"
                        />
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 md:px-6 py-10">
                {loading ? (
                    <p className="text-gray-500 text-sm">Loading clubs…</p>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <MapPin size={40} className="mx-auto mb-4 opacity-40" />
                        <p className="text-sm">No published clubs yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map((c) => (
                            <Link
                                key={c.id}
                                to={`/clubs/${c.slug}`}
                                className="group block bg-white/[0.02] border border-white/10 hover:border-padel-green/40 rounded-2xl p-5 transition-all h-full"
                            >
                                <div className="flex items-start gap-4">
                                    {c.logo_url ? (
                                        <img src={c.logo_url} alt="" className="w-14 h-14 rounded-2xl object-cover border border-white/10 shrink-0" />
                                    ) : (
                                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                            <MapPin size={20} className="text-gray-500" />
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                                            {c.verified && (
                                                <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/25">
                                                    <BadgeCheck size={9} /> Verified
                                                </span>
                                            )}
                                            {c.sapa_registered && (
                                                <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                                                    <ShieldCheck size={9} /> SAPA
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="text-lg font-black text-white group-hover:text-padel-green transition-colors truncate">
                                            {c.short_name || c.name}
                                        </h2>
                                        {c.city && (
                                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                                <MapPin size={11} /> {c.city}
                                            </p>
                                        )}
                                        {c.about && (
                                            <p className="text-[12px] text-gray-500 mt-2 line-clamp-2">{c.about}</p>
                                        )}
                                    </div>
                                    <ChevronRight size={16} className="text-gray-600 group-hover:text-padel-green shrink-0 mt-1" />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Clubs;
