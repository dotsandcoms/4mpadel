import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../supabaseClient';
import { safeUrl } from '../utils/sanitizeHtml';
import {
    fetchClubBySlug,
    fetchClubOrganisations,
    accentOnDark,
} from '../utils/club';
import {
    MapPin, BadgeCheck, ShieldCheck, Globe, Mail, Phone, MessageCircle,
    ChevronRight, Building, Calendar, Image as ImageIcon, Info, LayoutGrid,
    Instagram, Facebook, ExternalLink, Clock, Coffee, Landmark,
} from 'lucide-react';

const CLUB_NAV = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'courts', label: 'Courts', icon: LayoutGrid },
    { id: 'events', label: 'Events', icon: Calendar },
    { id: 'gallery', label: 'Gallery', icon: ImageIcon },
    { id: 'facilities', label: 'Facilities', icon: Coffee },
    { id: 'info', label: 'Info', icon: Clock },
];

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

const waLink = (num) => (num ? `https://wa.me/${String(num).replace(/[^0-9]/g, '').replace(/^0/, '27')}` : null);

const Section = ({ title, accent, action, children, id }) => (
    <section id={id} className="scroll-mt-44 sm:scroll-mt-40 md:scroll-mt-36">
        <div className="flex items-center justify-between gap-3 mb-3 px-0.5">
            <h2 className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: accent }}>{title}</h2>
            {action}
        </div>
        {children}
    </section>
);

/**
 * Public club card — /clubs/:slug
 */
const ClubPage = () => {
    const { slug } = useParams();
    const [club, setClub] = useState(null);
    const [orgs, setOrgs] = useState([]);
    const [memberCount, setMemberCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [galleryFilter, setGalleryFilter] = useState('all');
    const [activeNavId, setActiveNavId] = useState('overview');

    const scrollToSection = useCallback((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        setActiveNavId(id);
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const data = await fetchClubBySlug(slug);
                if (cancelled) return;
                if (!data || data.status !== 'published') {
                    setClub(null);
                    return;
                }
                setClub(data);

                const linked = await fetchClubOrganisations(data.id);
                if (!cancelled) setOrgs(linked);

                const { count } = await supabase
                    .from('players')
                    .select('id', { count: 'exact', head: true })
                    .eq('club_id', data.id);
                if (!cancelled) setMemberCount(count || 0);
            } catch (err) {
                console.error(err);
                if (!cancelled) setClub(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [slug]);

    useEffect(() => {
        const ids = CLUB_NAV.map((n) => n.id);
        const nodes = ids.map((id) => document.getElementById(id)).filter(Boolean);
        if (nodes.length === 0) return undefined;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
                if (visible[0]?.target?.id) setActiveNavId(visible[0].target.id);
            },
            { rootMargin: '-30% 0px -55% 0px', threshold: [0.1, 0.35, 0.6] },
        );
        nodes.forEach((n) => observer.observe(n));
        return () => observer.disconnect();
    }, [club?.id, loading]);

    const accent = accentOnDark(club?.brand_color);
    const courts = club?.courts || {};
    const indoorCount = Number(courts.indoor?.count) || 0;
    const outdoorCount = Number(courts.outdoor?.count) || 0;
    const totalCourts = indoorCount + outdoorCount;
    const gallery = Array.isArray(club?.gallery) ? club.gallery : [];
    const galleryCategories = ['all', ...new Set(gallery.map((g) => g.category || 'other'))];
    const filteredGallery = galleryFilter === 'all'
        ? gallery
        : gallery.filter((g) => (g.category || 'other') === galleryFilter);
    const socials = club?.socials || {};
    const socialLinks = [
        { key: 'instagram', href: safeUrl(socials.instagram), icon: Instagram, label: 'Instagram' },
        { key: 'facebook', href: safeUrl(socials.facebook), icon: Facebook, label: 'Facebook' },
        { key: 'tiktok', href: safeUrl(socials.tiktok), icon: ExternalLink, label: 'TikTok' },
        { key: 'playtomic', href: safeUrl(socials.playtomic), icon: ExternalLink, label: 'Playtomic' },
    ].filter((s) => s.href);
    const website = safeUrl(club?.website_url);
    const mapUrl = useMemo(() => {
        if (!club) return null;
        if (club.lat != null && club.lng != null) {
            return `https://www.google.com/maps?q=${club.lat},${club.lng}`;
        }
        if (club.address || club.city) {
            return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([club.address, club.city].filter(Boolean).join(', '))}`;
        }
        return null;
    }, [club]);
    const principal = club?.principal_sponsor;
    const brandTitle = (club?.short_name || club?.name || '').trim();
    const federation = club?.federations;

    if (loading) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-gray-500 text-sm">Loading club…</div>;
    }

    if (!club) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-center px-6">
                <MapPin size={48} className="text-gray-700 mb-4" />
                <h1 className="text-2xl font-black text-white">Club not found</h1>
                <p className="text-gray-500 text-sm mt-2">This club may still be a draft, or the link is incorrect.</p>
                <Link to="/clubs" className="mt-6 text-[11px] font-black uppercase tracking-widest px-6 py-3 bg-padel-green text-black rounded-xl hover:bg-white transition-all">
                    Browse Clubs
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white pb-20 md:pb-28 max-md:pt-[68px]">
            <Helmet>
                <title>{`${brandTitle} | Club | 4M Padel`}</title>
                <meta
                    name="description"
                    content={club.about ? club.about.slice(0, 155) : `${brandTitle} — padel club on 4M Padel.`}
                />
            </Helmet>

            {principal?.name && (
                <div className="border-b border-white/10 bg-[#0a0a0a]">
                    <div className="container mx-auto px-4 md:px-6 py-2.5 flex items-center justify-center gap-3">
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Principal sponsor</span>
                        {principal.logo_url ? (
                            principal.url ? (
                                <a href={safeUrl(principal.url) || '#'} target="_blank" rel="noopener noreferrer">
                                    <img src={principal.logo_url} alt={principal.name} className="h-7 object-contain" />
                                </a>
                            ) : (
                                <img src={principal.logo_url} alt={principal.name} className="h-7 object-contain" />
                            )
                        ) : (
                            <span className="text-xs font-bold text-white">{principal.name}</span>
                        )}
                    </div>
                </div>
            )}

            {/* Hero */}
            <div className="relative">
                <div
                    className={`relative overflow-hidden bg-gradient-to-br from-[#0B0F19] via-black to-[#0B0F19] ${
                        club.cover_image_url ? 'h-44 sm:h-60 md:h-80' : 'h-24 sm:h-32 md:h-40'
                    }`}
                >
                    {club.cover_image_url ? (
                        <img src={club.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 70% 30%, ${accent}22, transparent 55%)` }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/30" />
                </div>

                <div className={`container mx-auto px-4 md:px-6 relative z-10 ${
                    club.cover_image_url ? '-mt-14 sm:-mt-20' : 'mt-0 md:-mt-16'
                }`}>
                    <div className="flex items-end gap-3.5 sm:gap-5">
                        <div
                            className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl sm:rounded-3xl border-4 border-black bg-[#111] overflow-hidden shadow-2xl shrink-0 flex items-center justify-center"
                            style={{ boxShadow: `0 0 0 1px ${accent}40` }}
                        >
                            {club.logo_url ? (
                                <img src={club.logo_url} alt={brandTitle} className="w-full h-full object-cover" />
                            ) : (
                                <MapPin size={32} style={{ color: accent }} />
                            )}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                            <div className="hidden md:flex flex-wrap gap-2 mb-2">
                                {club.verified && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border bg-blue-500/10 text-blue-400 border-blue-500/25">
                                        <BadgeCheck size={11} /> Verified club
                                    </span>
                                )}
                                {club.sapa_registered && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                                        <ShieldCheck size={11} /> SAPA registered
                                    </span>
                                )}
                            </div>
                            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black leading-none tracking-tight truncate">{brandTitle}</h1>
                            {club.city && (
                                <p className="text-gray-400 text-sm mt-1.5 flex items-center gap-1">
                                    <MapPin size={13} /> {club.city}
                                    {club.short_name && club.name !== club.short_name ? ` · ${club.name}` : ''}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex md:hidden flex-wrap gap-1.5 mt-3">
                        {club.verified && (
                            <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border bg-blue-500/10 text-blue-400 border-blue-500/25">
                                <BadgeCheck size={10} /> Verified
                            </span>
                        )}
                        {club.sapa_registered && (
                            <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                                <ShieldCheck size={10} /> SAPA
                            </span>
                        )}
                    </div>

                    {club.about && (
                        <p className="text-gray-400 text-sm mt-3 max-w-2xl leading-relaxed line-clamp-3">{club.about}</p>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="container mx-auto px-3 sm:px-4 md:px-6 mt-4 sm:mt-6">
                <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                    {[
                        { label: 'Courts', value: club.stats?.courts ?? totalCourts },
                        { label: 'Events', value: club.stats?.events ?? '—' },
                        { label: 'Members', value: club.stats?.members ?? memberCount },
                    ].map((s) => (
                        <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-xl sm:rounded-2xl px-1 py-2.5 sm:p-4 text-center min-w-0">
                            <div className="text-lg sm:text-2xl font-black leading-none" style={{ color: accent }}>{s.value}</div>
                            <div className="text-[7px] sm:text-[9px] font-black uppercase tracking-wider text-gray-500 mt-1.5">{s.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick actions */}
            <div className="container mx-auto px-4 md:px-6 mt-4">
                <div className="flex flex-wrap gap-2">
                    {website && (
                        <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-black" style={{ background: accent }}>
                            <Globe size={14} /> Website
                        </a>
                    )}
                    {mapUrl && (
                        <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white hover:bg-white/10">
                            <MapPin size={14} /> Map
                        </a>
                    )}
                    {club.contact_email && (
                        <a href={`mailto:${club.contact_email}`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white hover:bg-white/10">
                            <Mail size={14} /> Contact
                        </a>
                    )}
                    {waLink(club.whatsapp_number) && (
                        <a href={waLink(club.whatsapp_number)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white hover:bg-white/10">
                            <MessageCircle size={14} /> WhatsApp
                        </a>
                    )}
                    {socialLinks.map((item) => {
                        const SocialIcon = item.icon;
                        const isNamed = item.key === 'tiktok' || item.key === 'playtomic';
                        return (
                            <a
                                key={item.key}
                                href={item.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={item.label}
                                title={item.label}
                                className={isNamed
                                    ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white hover:bg-white/10'
                                    : 'inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10'}
                            >
                                <SocialIcon size={isNamed ? 14 : 16} />
                                {isNamed ? item.label : null}
                            </a>
                        );
                    })}
                </div>
            </div>

            {/* Section nav */}
            <div className="sticky top-16 sm:top-[68px] lg:top-[72px] z-40 mt-4 sm:mt-5 border-y border-white/10 bg-black/95 backdrop-blur-xl">
                <div className="mx-auto w-full max-w-[1440px] px-2 sm:px-4 md:px-6">
                    <nav aria-label="Club sections" className="flex items-stretch justify-between gap-0.5 overflow-x-auto scrollbar-hide no-scrollbar touch-pan-x py-2 sm:py-3">
                        {CLUB_NAV.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeNavId === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => scrollToSection(item.id)}
                                    className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1.5 rounded-xl transition-colors touch-manipulation cursor-pointer border-0 ${
                                        isActive ? 'text-padel-green' : 'text-gray-400 bg-transparent'
                                    }`}
                                >
                                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={isActive ? 2.25 : 1.75} />
                                    <span className="text-[7px] sm:text-[10px] font-black uppercase tracking-wider">{item.label}</span>
                                    <span className={`h-0.5 w-5 sm:w-8 rounded-full ${isActive ? 'bg-padel-green' : 'bg-transparent'}`} />
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            <div className="container mx-auto px-4 md:px-6 mt-4 sm:mt-6 flex flex-col gap-7 sm:gap-8">
                <Section id="overview" title="Overview" accent={accent}>
                    <div className="grid lg:grid-cols-2 gap-4">
                        {(club.address || club.city || club.contact_phone) && (
                            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Location & contact</p>
                                {club.address && <p className="text-sm text-white flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0" style={{ color: accent }} />{club.address}</p>}
                                {club.city && !club.address && <p className="text-sm text-white">{club.city}</p>}
                                {club.contact_phone && <p className="text-sm text-gray-400 flex items-center gap-2"><Phone size={13} />{club.contact_phone}</p>}
                                {club.contact_email && <p className="text-sm text-gray-400 flex items-center gap-2"><Mail size={13} />{club.contact_email}</p>}
                                {mapUrl && (
                                    <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-[10px] font-black uppercase tracking-widest mt-2" style={{ color: accent }}>
                                        Open in Maps <ChevronRight size={12} />
                                    </a>
                                )}
                            </div>
                        )}
                        {federation && (
                            <Link
                                to={`/federations/${federation.slug}`}
                                className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex items-center gap-3 hover:border-white/20 transition-colors"
                            >
                                {federation.logo_url ? (
                                    <img src={federation.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                                ) : (
                                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                                        <Landmark size={18} style={{ color: accent }} />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Federation</p>
                                    <p className="text-sm font-bold text-white truncate">{federation.short_name || federation.name}</p>
                                </div>
                                <ChevronRight size={16} className="text-gray-600" />
                            </Link>
                        )}
                    </div>
                </Section>

                <Section id="courts" title="Courts" accent={accent}>
                    {(indoorCount === 0 && outdoorCount === 0) ? (
                        <p className="text-sm text-gray-500">Court details coming soon.</p>
                    ) : (
                        <div className="grid sm:grid-cols-2 gap-4">
                            {['indoor', 'outdoor'].map((side) => {
                                const block = courts[side] || {};
                                if (!block.count) return null;
                                return (
                                    <div key={side} className="rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10">
                                        {block.image_url && (
                                            <img src={block.image_url} alt="" className="w-full h-36 object-cover" />
                                        )}
                                        <div className="p-4">
                                            <p className="text-sm font-black text-white capitalize">{side} · {block.count} courts</p>
                                            {(block.features || []).length > 0 && (
                                                <ul className="mt-2 space-y-1">
                                                    {block.features.map((f) => (
                                                        <li key={f} className="text-[12px] text-gray-400 flex items-center gap-2">
                                                            <span className="w-1 h-1 rounded-full" style={{ background: accent }} />
                                                            {f}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Section>

                <Section id="events" title="Upcoming Events" accent={accent}>
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
                        <Calendar size={28} className="mx-auto text-gray-600 mb-2" />
                        <p className="text-sm text-gray-500">Events at this club coming soon.</p>
                        <Link to="/calendar" className="inline-flex items-center gap-1 mt-3 text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>
                            Browse calendar <ChevronRight size={12} />
                        </Link>
                    </div>
                </Section>

                <Section id="gallery" title="Gallery" accent={accent}>
                    {gallery.length === 0 ? (
                        <p className="text-sm text-gray-500">No photos yet.</p>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {galleryCategories.map((cat) => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setGalleryFilter(cat)}
                                        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border-0 cursor-pointer ${
                                            galleryFilter === cat ? 'text-black' : 'bg-white/5 text-gray-400'
                                        }`}
                                        style={galleryFilter === cat ? { background: accent } : undefined}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                {filteredGallery.map((img, idx) => (
                                    <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-white/10 bg-white/5">
                                        <img src={img.url} alt={img.caption || ''} className="w-full h-full object-cover" />
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </Section>

                <Section id="facilities" title="Facilities" accent={accent}>
                    <div className="space-y-4">
                        {club.cafe?.name && (
                            <div className="rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10 sm:flex">
                                {club.cafe.image_url && (
                                    <img src={club.cafe.image_url} alt="" className="sm:w-40 h-32 sm:h-auto object-cover shrink-0" />
                                )}
                                <div className="p-4">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">Café</p>
                                    <p className="text-sm font-black text-white">{club.cafe.name}</p>
                                    {club.cafe.description && <p className="text-[12px] text-gray-400 mt-1">{club.cafe.description}</p>}
                                    {(club.cafe.tags || []).length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {club.cafe.tags.map((t) => (
                                                <span key={t} className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">{t}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {(club.services || []).length === 0 && !club.cafe?.name ? (
                            <p className="text-sm text-gray-500">Facility details coming soon.</p>
                        ) : (
                            <div className="grid sm:grid-cols-2 gap-3">
                                {(club.services || []).map((svc, idx) => (
                                    <div key={idx} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                                        <p className="text-sm font-bold text-white">{svc.title}</p>
                                        {svc.description && <p className="text-[12px] text-gray-400 mt-1">{svc.description}</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </Section>

                <Section id="info" title="Info" accent={accent}>
                    <div className="space-y-6">
                        {Object.keys(club.opening_hours || {}).length > 0 && (
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Opening hours</p>
                                <ul className="rounded-2xl bg-white/[0.04] border border-white/10 divide-y divide-white/5">
                                    {DAY_ORDER.map((day) => {
                                        const h = club.opening_hours?.[day];
                                        if (!h) return null;
                                        return (
                                            <li key={day} className="flex justify-between px-4 py-2.5 text-sm">
                                                <span className="text-gray-400 font-bold">{DAY_LABELS[day]}</span>
                                                <span className="text-white font-bold">
                                                    {h.closed ? 'Closed' : `${h.open || '—'} – ${h.close || '—'}`}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {orgs.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Tournament organisations</p>
                                <ul className="space-y-2">
                                    {orgs.map((o) => (
                                        <li key={o.id}>
                                            <Link
                                                to={`/organisations/${o.slug}`}
                                                className="flex items-center gap-3 rounded-2xl bg-white/[0.04] border border-white/10 px-3 py-2.5 hover:border-white/20 transition-colors"
                                            >
                                                {o.logo_url ? (
                                                    <img src={o.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                                                        <Building size={16} className="text-gray-500" />
                                                    </div>
                                                )}
                                                <span className="flex-1 text-sm font-bold text-white truncate">{o.name}</span>
                                                <ChevronRight size={14} className="text-gray-600" />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {(club.sponsors || []).length > 0 && (
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Sponsors & partners</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {club.sponsors.map((sp, idx) => (
                                        <div key={idx} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 text-center">
                                            {sp.logo_url ? (
                                                <img src={sp.logo_url} alt={sp.name} className="h-8 mx-auto object-contain mb-2" />
                                            ) : null}
                                            <p className="text-[11px] font-bold text-white">{sp.name}</p>
                                            {sp.tier && <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">{sp.tier}</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(club.contacts || []).length > 0 && (
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Contacts</p>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    {club.contacts.map((c, idx) => (
                                        <div key={idx} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                                            <p className="text-sm font-bold text-white">{c.name}</p>
                                            {c.role && <p className="text-[11px] text-gray-500 mt-0.5">{c.role}</p>}
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {c.email && (
                                                    <a href={`mailto:${c.email}`} className="p-2 rounded-lg bg-white/5 border border-white/10 text-white"><Mail size={14} /></a>
                                                )}
                                                {c.phone && (
                                                    <a href={`tel:${c.phone}`} className="p-2 rounded-lg bg-white/5 border border-white/10 text-white"><Phone size={14} /></a>
                                                )}
                                                {waLink(c.whatsapp) && (
                                                    <a href={waLink(c.whatsapp)} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-white/5 border border-white/10 text-white"><MessageCircle size={14} /></a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </Section>
            </div>
        </div>
    );
};

export default ClubPage;
