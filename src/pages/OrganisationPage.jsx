import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../supabaseClient';
import {
    Building, ShieldCheck, BadgeCheck, Globe, Mail, Phone, MessageCircle,
    CalendarDays, Trophy, BarChart3, Image as ImageIcon, ChevronLeft,
    Instagram, Facebook, Youtube, ExternalLink, Heart, MapPin
} from 'lucide-react';

const StatBox = ({ icon: Icon, value, label }) => (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3 md:p-4 flex flex-col items-center text-center">
        <Icon size={16} className="text-padel-green mb-1.5" />
        <span className="text-lg md:text-2xl font-black text-white leading-none">{value}</span>
        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-gray-500 mt-1.5">{label}</span>
    </div>
);

const InfoRow = ({ label, value, href }) => {
    if (!value) return null;
    return (
        <div className="flex justify-between items-center gap-4 py-3 border-b border-white/5 last:border-0">
            <span className="text-xs text-gray-500 shrink-0">{label}</span>
            {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-padel-green hover:underline text-right truncate">
                    {value}
                </a>
            ) : (
                <span className="text-xs font-bold text-white text-right truncate">{value}</span>
            )}
        </div>
    );
};

const waLink = (num) => num ? `https://wa.me/${num.replace(/[^0-9]/g, '').replace(/^0/, '27')}` : null;

/**
 * Public organisation profile — /organisations/:slug
 * Phase 1 scope: core profile (hero, badges, stats, CTAs, about,
 * contacts, socials, info panel). Events / rankings / gallery / reviews follow.
 */
const OrganisationPage = () => {
    const { slug } = useParams();
    const [org, setOrg] = useState(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ hosted: 0, upcoming: 0 });

    useEffect(() => {
        const fetchOrg = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('organizations')
                    .select('*')
                    .eq('slug', slug)
                    .eq('status', 'approved')
                    .maybeSingle();
                if (error) throw error;
                setOrg(data);

                if (data) {
                    const nowIso = new Date().toISOString();
                    const [{ count: hosted }, { count: upcoming }] = await Promise.all([
                        supabase.from('calendar').select('*', { count: 'exact', head: true })
                            .eq('organization_id', data.id)
                            .or('sanction_status.eq.approved,sanction_status.is.null'),
                        supabase.from('calendar').select('*', { count: 'exact', head: true })
                            .eq('organization_id', data.id)
                            .or('sanction_status.eq.approved,sanction_status.is.null')
                            .gte('start_date', nowIso)
                    ]);
                    setStats({ hosted: hosted || 0, upcoming: upcoming || 0 });
                }
            } catch (err) {
                console.error('Failed to load organisation:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchOrg();
        window.scrollTo(0, 0);
    }, [slug]);

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center text-gray-500 text-sm">
                Loading organisation...
            </div>
        );
    }

    if (!org) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-center px-6">
                <Building size={48} className="text-gray-700 mb-4" />
                <h1 className="text-2xl font-black text-white">Organisation not found</h1>
                <p className="text-gray-500 text-sm mt-2">This page may still be pending approval, or the link is incorrect.</p>
                <Link to="/organisations" className="mt-6 text-[11px] font-black uppercase tracking-widest px-6 py-3 bg-padel-green text-black rounded-xl hover:bg-white transition-all">
                    Browse Organisations
                </Link>
            </div>
        );
    }

    const socials = org.socials || {};
    const contacts = Array.isArray(org.contacts) ? org.contacts : [];
    const brand = org.brand_color || '#9AE900';

    return (
        <div className="min-h-screen bg-black text-white pb-28">
            <Helmet>
                <title>{org.name} | Tournament Organisation | 4M Padel</title>
                <meta name="description" content={org.about ? org.about.slice(0, 155) : `${org.name} — official padel tournament organiser on 4M Padel.`} />
            </Helmet>

            {/* ===== HERO ===== */}
            <div className="relative">
                <div className="h-56 md:h-80 relative overflow-hidden bg-gradient-to-br from-[#0B0F19] via-black to-[#0B0F19]">
                    {org.cover_image_url ? (
                        <img src={org.cover_image_url} alt="" className="w-full h-full object-cover opacity-70" />
                    ) : (
                        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 20%, ${brand}14, transparent 60%)` }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />

                    {/* Back */}
                    <Link
                        to="/organisations"
                        className="absolute top-24 md:top-28 left-4 md:left-6 z-20 inline-flex items-center gap-1.5 bg-black/50 backdrop-blur-md border border-white/10 text-white text-[10px] font-black uppercase tracking-widest px-3.5 py-2 rounded-full hover:bg-black/80 transition-all"
                    >
                        <ChevronLeft size={13} /> Organisations
                    </Link>
                </div>

                {/* Identity card */}
                <div className="container mx-auto px-4 md:px-6">
                    <div className="relative -mt-16 md:-mt-20 z-10 max-w-3xl">
                        <div className="flex items-end gap-4">
                            {org.logo_url ? (
                                <img
                                    src={org.logo_url}
                                    alt={org.name}
                                    className="w-24 h-24 md:w-32 md:h-32 rounded-3xl object-cover bg-white border-4 border-black shadow-2xl shrink-0"
                                />
                            ) : (
                                <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-[#0F172A] border-4 border-black flex items-center justify-center text-padel-green shadow-2xl shrink-0">
                                    <Building size={40} />
                                </div>
                            )}
                            <div className="pb-1 min-w-0">
                                <h1 className="text-2xl md:text-4xl font-black leading-tight truncate">{org.name}</h1>
                                <p className="text-gray-400 text-xs md:text-sm font-bold mt-0.5">
                                    {org.org_type || 'Tournament Organiser'}
                                </p>
                            </div>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2 mt-4">
                            {org.verified && (
                                <span className="inline-flex items-center gap-1.5 bg-padel-green/10 border border-padel-green/25 text-padel-green text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full">
                                    <BadgeCheck size={12} /> Verified Organiser
                                </span>
                            )}
                            {org.sapa_sanctioned && (
                                <span className="inline-flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/25 text-blue-400 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full">
                                    <ShieldCheck size={12} /> Approved by SAPA
                                </span>
                            )}
                            {org.coverage && (
                                <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-300 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full">
                                    <MapPin size={12} /> {org.coverage}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 md:px-6 mt-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
                    {/* ===== MAIN COLUMN ===== */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Stats strip */}
                        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-4 gap-2 md:gap-3">
                            <StatBox icon={Trophy} value={stats.hosted} label="Events Hosted" />
                            <StatBox icon={CalendarDays} value={stats.upcoming} label="Upcoming" />
                            <StatBox icon={BarChart3} value={org.rankings_published ?? '—'} label="Rankings" />
                            <StatBox icon={ImageIcon} value={org.media_count ?? '—'} label="Media" />
                        </motion.div>

                        {/* CTA row */}
                        <div className="flex flex-wrap gap-2.5">
                            {org.website_url && (
                                <a
                                    href={org.website_url.startsWith('http') ? org.website_url : `https://${org.website_url}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 bg-padel-green text-black text-[11px] font-black uppercase tracking-widest px-5 py-3.5 rounded-2xl hover:bg-white transition-all"
                                >
                                    <Globe size={14} /> Visit Website
                                </a>
                            )}
                            {org.contact_email && (
                                <a
                                    href={`mailto:${org.contact_email}`}
                                    className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white text-[11px] font-black uppercase tracking-widest px-5 py-3.5 rounded-2xl hover:bg-white/10 transition-all"
                                >
                                    <Mail size={14} /> Contact
                                </a>
                            )}
                            <button
                                disabled
                                title="Following is coming soon"
                                className="inline-flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-gray-500 text-[11px] font-black uppercase tracking-widest px-5 py-3.5 rounded-2xl cursor-not-allowed"
                            >
                                <Heart size={14} /> Follow
                            </button>
                        </div>

                        {/* About */}
                        {org.about && (
                            <div className="bg-[#0F172A]/50 border border-white/5 rounded-3xl p-6">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-padel-green mb-3">About {org.name}</h2>
                                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{org.about}</p>
                            </div>
                        )}

                        {/* Contacts directory */}
                        {(contacts.length > 0 || org.contact_email || org.contact_phone) && (
                            <div className="bg-[#0F172A]/50 border border-white/5 rounded-3xl p-6">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-padel-green mb-4">Contacts</h2>
                                <div className="space-y-3">
                                    {contacts.length > 0 ? contacts.map((c, i) => (
                                        <div key={i} className="flex items-center gap-3 bg-black/30 border border-white/5 p-3.5 rounded-2xl">
                                            <div className="w-10 h-10 rounded-xl bg-padel-green/10 text-padel-green flex items-center justify-center text-xs font-black shrink-0">
                                                {(c.name || c.role || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-white truncate">{c.role || 'Contact'}</p>
                                                <p className="text-[11px] text-gray-500 truncate">{c.name}{c.email ? ` · ${c.email}` : ''}</p>
                                            </div>
                                            <div className="flex gap-1.5 shrink-0">
                                                {c.phone && (
                                                    <a href={`tel:${c.phone}`} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-all">
                                                        <Phone size={14} />
                                                    </a>
                                                )}
                                                {(c.whatsapp || c.phone) && (
                                                    <a href={waLink(c.whatsapp || c.phone)} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 hover:bg-green-500 hover:text-black transition-all">
                                                        <MessageCircle size={14} />
                                                    </a>
                                                )}
                                                {c.email && (
                                                    <a href={`mailto:${c.email}`} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-all">
                                                        <Mail size={14} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="flex items-center gap-3 bg-black/30 border border-white/5 p-3.5 rounded-2xl">
                                            <div className="w-10 h-10 rounded-xl bg-padel-green/10 text-padel-green flex items-center justify-center shrink-0">
                                                <Building size={16} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-white">General Enquiries</p>
                                                <p className="text-[11px] text-gray-500 truncate">{org.contact_email}</p>
                                            </div>
                                            <div className="flex gap-1.5 shrink-0">
                                                {org.contact_phone && (
                                                    <a href={`tel:${org.contact_phone}`} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white transition-all">
                                                        <Phone size={14} />
                                                    </a>
                                                )}
                                                {(org.whatsapp_number || org.contact_phone) && (
                                                    <a href={waLink(org.whatsapp_number || org.contact_phone)} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 hover:bg-green-500 hover:text-black transition-all">
                                                        <MessageCircle size={14} />
                                                    </a>
                                                )}
                                                {org.contact_email && (
                                                    <a href={`mailto:${org.contact_email}`} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white transition-all">
                                                        <Mail size={14} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ===== SIDE COLUMN ===== */}
                    <div className="space-y-6">
                        {/* Socials */}
                        {(socials.instagram || socials.facebook || socials.tiktok || socials.youtube || org.website_url) && (
                            <div className="bg-[#0F172A]/50 border border-white/5 rounded-3xl p-6">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-padel-green mb-4">Social / Website</h2>
                                <div className="flex flex-wrap gap-2">
                                    {org.website_url && (
                                        <a href={org.website_url.startsWith('http') ? org.website_url : `https://${org.website_url}`} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:text-white hover:border-padel-green/40 transition-all" title="Website">
                                            <Globe size={18} />
                                        </a>
                                    )}
                                    {socials.instagram && (
                                        <a href={socials.instagram} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:text-pink-400 hover:border-pink-500/40 transition-all" title="Instagram">
                                            <Instagram size={18} />
                                        </a>
                                    )}
                                    {socials.facebook && (
                                        <a href={socials.facebook} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:text-blue-400 hover:border-blue-500/40 transition-all" title="Facebook">
                                            <Facebook size={18} />
                                        </a>
                                    )}
                                    {socials.tiktok && (
                                        <a href={socials.tiktok} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:text-white hover:border-white/40 transition-all text-[15px] font-black leading-none flex items-center justify-center w-11 h-11" title="TikTok">
                                            ♪
                                        </a>
                                    )}
                                    {socials.youtube && (
                                        <a href={socials.youtube} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:text-red-400 hover:border-red-500/40 transition-all" title="YouTube">
                                            <Youtube size={18} />
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Organisation info panel */}
                        <div className="bg-[#0F172A]/50 border border-white/5 rounded-3xl p-6">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-padel-green mb-2">Organisation Info</h2>
                            <InfoRow label="Coverage" value={org.coverage} />
                            <InfoRow
                                label="Affiliation"
                                value={org.sapa_sanctioned ? 'Sanctioned & verified by SAPA' : (org.verified ? 'Verified by 4M Padel' : null)}
                            />
                            <InfoRow label="Organisation Type" value={org.org_type || 'Tournament Organiser'} />
                            <InfoRow label="Year Established" value={org.year_established} />
                            <InfoRow label="Events hosted" value={stats.hosted > 0 ? `${stats.hosted}${stats.upcoming ? ` (${stats.upcoming} upcoming)` : ''}` : null} />
                            <InfoRow
                                label="Website"
                                value={org.website_url ? org.website_url.replace(/^https?:\/\/(www\.)?/, '') : null}
                                href={org.website_url ? (org.website_url.startsWith('http') ? org.website_url : `https://${org.website_url}`) : null}
                            />
                            <InfoRow label="Email" value={org.contact_email} href={org.contact_email ? `mailto:${org.contact_email}` : null} />
                        </div>

                        {/* Upcoming events teaser → full list ships in the next phase */}
                        {stats.upcoming > 0 && (
                            <Link
                                to="/calendar"
                                className="block bg-gradient-to-br from-padel-green/15 to-transparent border border-padel-green/20 rounded-3xl p-6 group hover:border-padel-green/40 transition-all"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-black text-white">{stats.upcoming} upcoming event{stats.upcoming === 1 ? '' : 's'}</p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">View on the 4M Padel calendar</p>
                                    </div>
                                    <ExternalLink size={16} className="text-padel-green group-hover:scale-110 transition-transform" />
                                </div>
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrganisationPage;
