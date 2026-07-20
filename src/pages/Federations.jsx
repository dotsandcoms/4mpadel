import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Landmark, ShieldCheck, BadgeCheck, ChevronRight, Search } from 'lucide-react';
import { fetchPublishedFederations } from '../utils/federation';

/**
 * Public directory of published federations — /federations
 */
const Federations = () => {
    const [federations, setFederations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchPublishedFederations();
                setFederations(data);
            } catch (err) {
                console.error('Failed to load federations:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const filtered = federations.filter((f) =>
        !search.trim()
        || f.name?.toLowerCase().includes(search.toLowerCase().trim())
        || f.short_name?.toLowerCase().includes(search.toLowerCase().trim()),
    );

    return (
        <div className="min-h-screen bg-black text-white pb-24">
            <Helmet>
                <title>Federations | 4M Padel</title>
                <meta name="description" content="Official padel federations on 4M Padel — rankings, sanctioned events, clubs and organisers." />
            </Helmet>

            <div className="relative overflow-hidden border-b border-white/5 bg-gradient-to-br from-black via-[#0B0F19] to-black">
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-padel-green/5 blur-[100px] rounded-full pointer-events-none" />
                <div className="container mx-auto px-4 md:px-6 pt-28 md:pt-36 pb-10 md:pb-14 relative z-10">
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.25em] text-padel-green">4M Padel Ecosystem</span>
                    <h1 className="text-3xl md:text-5xl font-black mt-2 leading-tight">
                        Official <span className="text-padel-green">Federations</span>
                    </h1>
                    <p className="text-gray-400 text-sm md:text-base mt-3 max-w-xl">
                        National and regional governing bodies sanctioning tournaments, rankings and member organisations.
                    </p>

                    <div className="relative max-w-md mt-6">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search federations..."
                            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-padel-green"
                        />
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 md:px-6 py-10">
                {loading ? (
                    <p className="text-gray-500 text-sm">Loading federations…</p>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <Landmark size={40} className="mx-auto mb-4 opacity-40" />
                        <p className="text-sm">No published federations yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map((f) => (
                            <div key={f.id}>
                                <Link
                                    to={`/federations/${f.slug}`}
                                    className="group block bg-white/[0.02] border border-white/10 hover:border-padel-green/40 rounded-2xl p-5 transition-all h-full"
                                >
                                    <div className="flex items-start gap-4">
                                        {f.logo_url ? (
                                            <img src={f.logo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-white/10 shrink-0" />
                                        ) : (
                                            <div className="w-14 h-14 rounded-xl bg-padel-green/10 text-padel-green flex items-center justify-center shrink-0">
                                                <Landmark size={22} />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <h2 className="font-black text-white text-lg leading-tight group-hover:text-padel-green transition-colors truncate">
                                                {f.short_name || f.name}
                                            </h2>
                                            {f.short_name && (
                                                <p className="text-xs text-gray-500 mt-0.5 truncate">{f.name}</p>
                                            )}
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {f.is_national_governing_body && (
                                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-padel-green/10 text-padel-green border-padel-green/20">
                                                        <ShieldCheck size={10} /> NGB
                                                    </span>
                                                )}
                                                {f.verified && (
                                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20">
                                                        <BadgeCheck size={10} /> Verified
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-gray-600 group-hover:text-padel-green shrink-0 mt-1" />
                                    </div>
                                    {f.about && (
                                        <p className="text-xs text-gray-500 mt-3 line-clamp-2">{f.about}</p>
                                    )}
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Federations;
