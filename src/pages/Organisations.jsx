import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../supabaseClient';
import { Building, ShieldCheck, BadgeCheck, ChevronRight, Search, CalendarDays } from 'lucide-react';

/**
 * Public directory of approved organisations — /organisations
 */
const Organisations = () => {
    const [orgs, setOrgs] = useState([]);
    const [eventCounts, setEventCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const fetchOrgs = async () => {
            try {
                const { data, error } = await supabase
                    .from('organizations')
                    .select('id, name, slug, logo_url, cover_image_url, org_type, coverage, verified, sapa_sanctioned, about')
                    .eq('status', 'approved')
                    .order('name', { ascending: true });
                if (error) throw error;
                setOrgs(data || []);

                // Upcoming approved event counts per org
                if (data?.length) {
                    const { data: events } = await supabase
                        .from('calendar')
                        .select('organization_id')
                        .in('organization_id', data.map(o => o.id))
                        .or('sanction_status.eq.approved,sanction_status.is.null')
                        .gte('start_date', new Date().toISOString());
                    const counts = {};
                    (events || []).forEach(e => {
                        counts[e.organization_id] = (counts[e.organization_id] || 0) + 1;
                    });
                    setEventCounts(counts);
                }
            } catch (err) {
                console.error('Failed to load organisations:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchOrgs();
    }, []);

    const filtered = orgs.filter(o =>
        !search.trim() || o.name.toLowerCase().includes(search.toLowerCase().trim())
    );

    return (
        <div className="min-h-screen bg-black text-white pb-24">
            <Helmet>
                <title>Tournament Organisations | 4M Padel</title>
                <meta name="description" content="Official SAPA-sanctioned padel tournament organisers on 4M Padel. Browse organisations, their events and rankings." />
            </Helmet>

            {/* Header */}
            <div className="relative overflow-hidden border-b border-white/5 bg-gradient-to-br from-black via-[#0B0F19] to-black">
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-padel-green/5 blur-[100px] rounded-full pointer-events-none" />
                <div className="container mx-auto px-4 md:px-6 pt-28 md:pt-36 pb-10 md:pb-14 relative z-10">
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.25em] text-padel-green">4M Padel Ecosystem</span>
                    <h1 className="text-3xl md:text-5xl font-black mt-2 leading-tight">
                        Tournament <span className="text-padel-green">Organisations</span>
                    </h1>
                    <p className="text-gray-400 text-sm md:text-base mt-3 max-w-xl">
                        Official sanctioned organisers hosting events across South Africa. Explore their calendars, rankings and media.
                    </p>

                    <div className="relative max-w-md mt-6">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search organisations..."
                            className="w-full bg-white/[0.04] border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-padel-green transition-colors placeholder:text-gray-600"
                        />
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="container mx-auto px-4 md:px-6 mt-8 md:mt-12">
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="h-48 rounded-3xl bg-white/[0.03] border border-white/5 animate-pulse" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-24 text-gray-500">
                        <Building size={40} className="mx-auto mb-4 opacity-30" />
                        <p className="text-sm">{orgs.length === 0 ? 'No organisations published yet — check back soon.' : 'No organisations match your search.'}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filtered.map((org, idx) => (
                            <motion.div
                                key={org.id}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                            >
                                <Link
                                    to={`/organisations/${org.slug}`}
                                    className="block bg-[#0F172A]/60 hover:bg-[#0F172A] border border-white/5 hover:border-padel-green/30 rounded-3xl overflow-hidden transition-all duration-300 group"
                                >
                                    {/* Cover strip */}
                                    <div className="h-24 relative overflow-hidden bg-gradient-to-r from-padel-green/10 via-[#0B0F19] to-blue-500/10">
                                        {org.cover_image_url && (
                                            <img src={org.cover_image_url} alt="" className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500" />
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] to-transparent" />
                                    </div>

                                    <div className="p-5 -mt-10 relative">
                                        <div className="flex items-end justify-between">
                                            {org.logo_url ? (
                                                <img src={org.logo_url} alt={org.name} className="w-16 h-16 rounded-2xl object-cover border-2 border-[#0F172A] bg-white shadow-xl" />
                                            ) : (
                                                <div className="w-16 h-16 rounded-2xl bg-padel-green/10 border-2 border-[#0F172A] flex items-center justify-center text-padel-green shadow-xl">
                                                    <Building size={26} />
                                                </div>
                                            )}
                                            <ChevronRight size={18} className="text-gray-600 group-hover:text-padel-green group-hover:translate-x-1 transition-all mb-1" />
                                        </div>

                                        <h3 className="font-black text-lg mt-3 leading-tight group-hover:text-padel-green transition-colors">{org.name}</h3>
                                        <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">{org.org_type || 'Tournament Organiser'}</p>

                                        <div className="flex flex-wrap items-center gap-1.5 mt-3">
                                            {org.verified && (
                                                <span className="inline-flex items-center gap-1 bg-padel-green/10 border border-padel-green/20 text-padel-green text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full">
                                                    <BadgeCheck size={10} /> Verified
                                                </span>
                                            )}
                                            {org.sapa_sanctioned && (
                                                <span className="inline-flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full">
                                                    <ShieldCheck size={10} /> SAPA
                                                </span>
                                            )}
                                            {eventCounts[org.id] > 0 && (
                                                <span className="inline-flex items-center gap-1 bg-white/5 border border-white/10 text-gray-300 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full">
                                                    <CalendarDays size={10} /> {eventCounts[org.id]} upcoming
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Organisations;
