import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../supabaseClient';
import { safeUrl } from '../utils/sanitizeHtml';
import {
    Building, ShieldCheck, BadgeCheck, Globe, Mail, Phone, MessageCircle,
    CalendarDays, Trophy, ChevronLeft, ChevronRight, Clock,
    Instagram, Facebook, Youtube, ExternalLink, Heart, MapPin, Users,
    Image as ImageIcon
} from 'lucide-react';

// Dummy content is only rendered in dev builds so Brad can judge the design;
// production hides these sections until real data exists.
const SHOW_DUMMY = import.meta.env.DEV;

const DUMMY_CLUBS = [
    { name: 'Atlantic Padel', city: 'Cape Town' },
    { name: 'NetSet Padel', city: 'Johannesburg' },
    { name: 'KCC', city: 'Roodepoort' },
    { name: 'Africa Padel', city: 'Sandton' },
];

const DUMMY_SPONSORS = [
    { tier: 'Title Sponsor', name: 'Wilson' },
    { tier: 'Gold Partner', name: 'HEAD' },
    { tier: 'Official Partner', name: 'Bullpadel' },
    { tier: 'Official Partner', name: 'Siux' },
];

const tierBadge = (status) => {
    switch (status) {
        case 'Major': return 'bg-purple-500/10 text-purple-400 border-purple-500/25';
        case 'Super Gold':
        case 'S Gold': return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
        case 'Gold': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25';
        case 'Silver': return 'bg-gray-500/10 text-gray-300 border-gray-500/25';
        case 'Bronze': return 'bg-orange-700/20 text-orange-400 border-orange-700/30';
        default: return 'bg-blue-500/10 text-blue-400 border-blue-500/25';
    }
};

const monthShort = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { month: 'short' }).toUpperCase() : '';
const dayNum = (d) => d ? new Date(d).getDate() : '';

const waLink = (num) => num ? `https://wa.me/${num.replace(/[^0-9]/g, '').replace(/^0/, '27')}` : null;

/** Section wrapper with brand-accented header */
const Section = ({ title, accent, action, children, id }) => (
    <div id={id} className="bg-[#0a0a0a]/50 border border-white/5 rounded-3xl p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: accent }}>{title}</h2>
            {action}
        </div>
        {children}
    </div>
);

const ViewAll = ({ to, accent, label = 'View all' }) => (
    <Link to={to} className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:opacity-80 transition-opacity" style={{ color: accent }}>
        {label} <ChevronRight size={12} />
    </Link>
);

/**
 * Public organisation profile — /organisations/:slug
 * Dark theme, accents driven by org.brand_color (defaults to padel green).
 * Layout mirrors the mobile mockup; two-column on desktop.
 */
const OrganisationPage = () => {
    const { slug } = useParams();
    const [org, setOrg] = useState(null);
    const [events, setEvents] = useState([]);
    const [galleryImages, setGalleryImages] = useState([]);
    const [orgAlbums, setOrgAlbums] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('organisations')
                    .select('*')
                    .eq('slug', slug)
                    .eq('status', 'approved')
                    .maybeSingle();
                if (error) throw error;
                setOrg(data);

                if (data) {
                    // Org public page shows this organisation's sanctioned events.
                    // Main-calendar `is_visible` still controls /calendar; hide only
                    // rejected sanctions here so linked org events actually appear.
                    const { data: evs } = await supabase
                        .from('calendar')
                        .select('id, slug, event_name, venue, city, start_date, end_date, sapa_status, image_url, registered_players, created_at')
                        .eq('organisation_id', data.id)
                        .or('sanction_status.eq.approved,sanction_status.is.null')
                        .order('start_date', { ascending: true });
                    const eventList = evs || [];
                    setEvents(eventList);

                    // Albums linked directly to this organisation (cover images for Media)
                    const { data: linkedAlbums } = await supabase
                        .from('albums')
                        .select('id, slug, title, cover_image_url, album_date, is_featured')
                        .eq('organisation_id', data.id)
                        .is('parent_album_id', null)
                        .eq('is_active', true)
                        .order('is_featured', { ascending: false })
                        .order('album_date', { ascending: false });
                    setOrgAlbums(linkedAlbums || []);

                    // Also pull gallery photos from albums linked to this org's events
                    const eventIds = eventList.map((e) => e.id).filter(Boolean);
                    const orgAlbumIds = (linkedAlbums || []).map((a) => a.id).filter(Boolean);
                    let albumIds = [...orgAlbumIds];

                    if (eventIds.length > 0) {
                        const { data: eventAlbums } = await supabase
                            .from('albums')
                            .select('id, event_id, slug')
                            .in('event_id', eventIds)
                            .is('parent_album_id', null)
                            .eq('is_active', true);

                        const eventAlbumIds = (eventAlbums || []).map((a) => a.id).filter(Boolean);
                        albumIds = [...new Set([...albumIds, ...eventAlbumIds])];
                    }

                    if (albumIds.length > 0) {
                        const { data: images } = await supabase
                            .from('gallery_images')
                            .select('id, image_url, thumbnail_url, album_id, sort_order, created_at')
                            .in('album_id', albumIds)
                            .order('sort_order', { ascending: true })
                            .limit(24);

                        setGalleryImages(images || []);
                    } else {
                        setGalleryImages([]);
                    }
                }
            } catch (err) {
                console.error('Failed to load organisation:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
        window.scrollTo(0, 0);
    }, [slug]);

    const accent = org?.brand_color || '#9AE900';
    const accentSoft = `${accent}1a`;   // ~10% alpha
    const accentBorder = `${accent}40`; // ~25% alpha

    const today = new Date().toISOString().substring(0, 10);
    const upcoming = useMemo(() => events.filter(e => (e.end_date || e.start_date || '') >= today), [events, today]);
    const hostVenues = useMemo(() => {
        const seen = new Map();
        events.forEach(e => {
            if (e.venue && !seen.has(e.venue.toLowerCase())) seen.set(e.venue.toLowerCase(), { name: e.venue, city: e.city });
        });
        return [...seen.values()];
    }, [events]);
    const registeredPlayers = useMemo(
        () => events.reduce((sum, e) => sum + (parseInt(e.registered_players) || 0), 0),
        [events]
    );
    // Prefer organisation album covers; then gallery photos; then event posters
    const mediaItems = useMemo(() => {
        const fromAlbums = (orgAlbums || [])
            .filter((a) => a.cover_image_url || a.title)
            .map((a) => ({
                src: a.cover_image_url || null,
                href: a.slug ? `/gallery/${a.slug}` : '/gallery',
                title: a.title || 'Album',
                date: a.album_date ? String(a.album_date).substring(0, 10) : null,
                kind: 'album',
            }));
        if (fromAlbums.length > 0) return fromAlbums.slice(0, 8);

        const fromGallery = galleryImages
            .map((img) => ({
                src: img.thumbnail_url || img.image_url,
                href: '/gallery',
                title: 'Gallery',
                date: null,
                kind: 'gallery',
            }))
            .filter((item) => item.src);
        if (fromGallery.length > 0) return fromGallery.slice(0, 8);

        return events
            .map((e) => ({
                src: e.image_url,
                href: e.slug ? `/events/${e.slug}` : null,
                title: e.event_name,
                date: e.start_date ? String(e.start_date).substring(0, 10) : null,
                kind: 'event',
            }))
            .filter((item) => item.src)
            .slice(0, 8);
    }, [orgAlbums, galleryImages, events]);
    const lastUpdated = useMemo(() => {
        const dates = events.map(e => e.created_at).filter(Boolean).sort();
        return dates.length ? dates[dates.length - 1] : org?.approved_at || org?.created_at;
    }, [events, org]);

    if (loading) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-gray-500 text-sm">Loading organisation...</div>;
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
    const sponsors = Array.isArray(org.sponsors)
        ? org.sponsors.filter((s) => (s.name || '').trim() || s.logo_url)
        : [];
    const showClubs = false; // Hidden until clubs are wired up
    const showMedia = mediaItems.length > 0 || SHOW_DUMMY;
    const showSponsors = sponsors.length > 0 || SHOW_DUMMY;
    const clubsList = hostVenues.length > 0 ? hostVenues : (SHOW_DUMMY ? DUMMY_CLUBS : []);
    const sponsorsList = sponsors.length > 0 ? sponsors : (SHOW_DUMMY ? DUMMY_SPONSORS : []);
    const galleryLink = orgAlbums.length > 0
        ? (orgAlbums[0].slug ? `/gallery/${orgAlbums[0].slug}` : '/gallery')
        : (galleryImages.length > 0 ? '/gallery' : null);
    const stats = [
        { icon: Trophy, value: events.length, label: 'Events Hosted' },
        { icon: Building, value: clubsList.length, label: 'Host Clubs' },
        { icon: Users, value: registeredPlayers > 999 ? `${(registeredPlayers / 1000).toFixed(1)}k` : registeredPlayers, label: 'Registered Players' },
        {
            icon: Clock,
            value: lastUpdated ? new Date(lastUpdated).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—',
            label: 'Updated'
        },
    ];

    return (
        <div className="min-h-screen bg-black text-white pb-28">
            <Helmet>
                <title>{org.name} | Tournament Organisation | 4M Padel</title>
                <meta name="description" content={org.about ? org.about.slice(0, 155) : `${org.name} — official padel tournament organiser on 4M Padel.`} />
            </Helmet>

            {/* ===== HERO ===== */}
            <div className="relative">
                <div className="h-52 md:h-80 relative overflow-hidden bg-gradient-to-br from-[#0B0F19] via-black to-[#0B0F19]">
                    {org.cover_image_url ? (
                        <img src={org.cover_image_url} alt="" className="w-full h-full object-cover opacity-70" />
                    ) : (
                        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 20%, ${accentSoft}, transparent 60%)` }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />
                    <Link
                        to="/organisations"
                        className="absolute top-24 md:top-28 left-4 md:left-6 z-20 inline-flex items-center gap-1.5 bg-black/50 backdrop-blur-md border border-white/10 text-white text-[10px] font-black uppercase tracking-widest px-3.5 py-2 rounded-full hover:bg-black/80 transition-all"
                    >
                        <ChevronLeft size={13} /> Organisations
                    </Link>
                </div>

                <div className="w-full max-w-[1440px] mx-auto px-4 xl:px-8">
                    <div className="relative -mt-14 md:-mt-20 z-10">
                        <div className="flex items-end gap-4">
                            {org.logo_url ? (
                                <img src={org.logo_url} alt={org.name} className="w-24 h-24 md:w-32 md:h-32 rounded-3xl object-cover bg-white border-4 border-black shadow-2xl shrink-0" />
                            ) : (
                                <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-[#0a0a0a] border-4 border-black flex items-center justify-center shadow-2xl shrink-0" style={{ color: accent }}>
                                    <Building size={40} />
                                </div>
                            )}
                            <div className="pb-1 min-w-0">
                                <h1 className="text-2xl md:text-4xl font-black leading-tight">{org.name}</h1>
                                <p className="text-gray-400 text-xs md:text-sm font-semibold mt-1 leading-snug">
                                    {org.org_type || 'Tournament Organiser'}{org.coverage ? ` · ${org.coverage}` : ''}
                                </p>
                            </div>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2 mt-4">
                            {org.sapa_sanctioned && (
                                <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full">
                                    <ShieldCheck size={12} /> SAPA Approved Organiser
                                </span>
                            )}
                            {org.verified && (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full border" style={{ background: accentSoft, borderColor: accentBorder, color: accent }}>
                                    <BadgeCheck size={12} /> 4M Verified
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-300 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full">
                                <Trophy size={12} /> {org.org_type || 'Tournament Series'}
                            </span>
                        </div>

                    </div>
                </div>
            </div>

            <div className="w-full max-w-[1440px] mx-auto px-4 xl:px-8 mt-7 space-y-6">
                {/* ===== STAT STRIP ===== */}
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="bg-[#0a0a0a]/50 border border-white/5 rounded-3xl p-4 md:p-5 grid grid-cols-4 divide-x divide-white/5">
                    {stats.map((s, i) => (
                        <div key={i} className="flex flex-col items-center text-center px-1">
                            <s.icon size={15} className="mb-1.5" style={{ color: accent }} />
                            <span className="text-sm md:text-xl font-black text-white leading-none">{s.value}</span>
                            <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-gray-500 mt-1.5 leading-tight">{s.label}</span>
                        </div>
                    ))}
                </motion.div>

                {/* ===== INFO CARD ===== */}
                <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-3xl p-5 md:p-6 space-y-3.5">
                    {org.website_url && (
                        <a href={safeUrl(org.website_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-gray-200 hover:text-white group">
                            <Globe size={16} style={{ color: accent }} className="shrink-0" />
                            <span className="truncate">{org.website_url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                            <ChevronRight size={14} className="ml-auto text-gray-600 group-hover:translate-x-0.5 transition-transform" />
                        </a>
                    )}
                    {org.contact_email && (
                        <a href={`mailto:${org.contact_email}`} className="flex items-center gap-3 text-sm text-gray-200 hover:text-white group">
                            <Mail size={16} style={{ color: accent }} className="shrink-0" />
                            <span className="truncate">{org.contact_email}</span>
                            <ChevronRight size={14} className="ml-auto text-gray-600 group-hover:translate-x-0.5 transition-transform" />
                        </a>
                    )}
                    {org.contact_phone && (
                        <div className="flex items-center gap-3 text-sm text-gray-200">
                            <Phone size={16} style={{ color: accent }} className="shrink-0" />
                            <a href={`tel:${org.contact_phone}`} className="hover:text-white">{org.contact_phone}</a>
                            {(org.whatsapp_number || org.contact_phone) && (
                                <a href={waLink(org.whatsapp_number || org.contact_phone)} target="_blank" rel="noopener noreferrer" className="ml-auto p-1.5 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 hover:bg-green-500 hover:text-black transition-all">
                                    <MessageCircle size={14} />
                                </a>
                            )}
                        </div>
                    )}
                    {org.coverage && (
                        <div className="flex items-center gap-3 text-sm text-gray-200">
                            <MapPin size={16} style={{ color: accent }} className="shrink-0" />
                            <span>{org.coverage}</span>
                        </div>
                    )}
                </div>

                {/* ===== ABOUT ===== */}
                {org.about && (
                    <Section title={`About ${org.name}`} accent={accent}>
                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{org.about}</p>
                    </Section>
                )}

                {/* ===== UPCOMING EVENTS ===== */}
                <Section
                    id="org-events"
                    title="Upcoming Events"
                    accent={accent}
                    action={<ViewAll to="/calendar" accent={accent} />}
                >
                    {upcoming.length === 0 ? (
                        <p className="text-xs text-gray-500 py-4">No upcoming events published yet — check back soon.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {upcoming.slice(0, 5).map((ev) => (
                                <Link
                                    key={ev.id}
                                    to={`/calendar/${ev.slug || ev.id}`}
                                    className="flex items-center gap-3.5 bg-black/30 hover:bg-black/50 border border-white/5 p-3 rounded-2xl transition-all group"
                                >
                                    <div className="w-12 shrink-0 text-center bg-white/[0.04] border border-white/5 rounded-xl py-1.5">
                                        <span className="block text-base font-black leading-none" style={{ color: accent }}>{dayNum(ev.start_date)}</span>
                                        <span className="block text-[8px] font-black uppercase tracking-widest text-gray-500 mt-1">{monthShort(ev.start_date)}</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-white truncate group-hover:text-padel-green transition-colors">{ev.event_name}</p>
                                        <p className="text-[11px] text-gray-500 truncate mt-0.5">{[ev.venue, ev.city].filter(Boolean).join(' · ')}</p>
                                        {ev.sapa_status && ev.sapa_status !== 'None' && (
                                            <span className={`inline-flex mt-1.5 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${tierBadge(ev.sapa_status)}`}>
                                                {ev.sapa_status}
                                            </span>
                                        )}
                                    </div>
                                    <ChevronRight size={15} className="text-gray-600 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                                </Link>
                            ))}
                        </div>
                    )}
                </Section>

                {/* ===== HOST CLUBS ===== */}
                {showClubs && (
                    <Section title="Host Clubs" accent={accent}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                            {clubsList.slice(0, 8).map((c, i) => (
                                <div key={i} className="flex items-center gap-2.5 bg-black/30 border border-white/5 p-3 rounded-2xl">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: accentSoft, color: accent }}>
                                        <Building size={15} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-white truncate">{c.name}</p>
                                        {c.city && <p className="text-[10px] text-gray-500 truncate">{c.city}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {hostVenues.length === 0 && SHOW_DUMMY && (
                            <p className="text-[9px] text-gray-600 uppercase tracking-widest font-black mt-3">Preview data — populated from this organiser's event venues</p>
                        )}
                    </Section>
                )}

                {/* ===== MEDIA ===== */}
                {showMedia && (
                    <Section title="Media" accent={accent} action={mediaItems.length > 4 ? <ViewAll to={galleryLink || '/gallery'} accent={accent} /> : null}>
                        {mediaItems.length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                                {mediaItems.slice(0, 4).map((item, i) => {
                                    const tile = (
                                        <div className="group rounded-2xl overflow-hidden bg-white/5 border border-white/5 hover:border-white/15 transition-colors">
                                            <div className="aspect-square overflow-hidden bg-black/40">
                                                {item.src ? (
                                                    <img
                                                        src={item.src}
                                                        alt={item.title || ''}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center" style={{ color: `${accent}55` }}>
                                                        <ImageIcon size={28} />
                                                    </div>
                                                )}
                                            </div>
                                            {item.title && (
                                                <div className="px-2.5 py-2.5">
                                                    <p className="text-[11px] font-bold text-white leading-snug line-clamp-2 group-hover:text-padel-green transition-colors">
                                                        {item.title}
                                                    </p>
                                                    {item.date && (
                                                        <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-1">
                                                            {item.date}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                    return item.href ? (
                                        <Link key={i} to={item.href} className="block" title={item.title}>
                                            {tile}
                                        </Link>
                                    ) : (
                                        <div key={i}>{tile}</div>
                                    );
                                })}
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-4 gap-2">
                                    {[Trophy, ImageIcon, Users, CalendarDays].map((Icon, i) => (
                                        <div key={i} className="aspect-square rounded-2xl bg-gradient-to-br from-white/[0.05] to-transparent border border-white/5 flex items-center justify-center" style={{ color: `${accent}55` }}>
                                            <Icon size={26} />
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[9px] text-gray-600 uppercase tracking-widest font-black mt-3">Preview — link albums to this organisation to show covers here</p>
                            </>
                        )}
                    </Section>
                )}

                {/* ===== SPONSORS ===== */}
                {showSponsors && (
                    <Section title="Sponsors & Partners" accent={accent}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                            {sponsorsList.map((s, i) => (
                                <div key={i} className="bg-black/30 border border-white/5 rounded-2xl p-4 text-center flex flex-col items-center justify-center min-h-[100px]">
                                    <p className="text-[8px] font-black uppercase tracking-widest mb-2" style={{ color: accent }}>{s.tier || 'Partner'}</p>
                                    {s.logo_url ? (
                                        <img
                                            src={s.logo_url}
                                            alt={s.name || 'Sponsor'}
                                            className="max-h-12 max-w-full object-contain mb-1"
                                            loading="lazy"
                                        />
                                    ) : null}
                                    {s.name ? (
                                        <p className={`font-black text-white tracking-tight ${s.logo_url ? 'text-xs mt-1' : 'text-lg'}`}>{s.name}</p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                        {sponsors.length === 0 && SHOW_DUMMY && (
                            <p className="text-[9px] text-gray-600 uppercase tracking-widest font-black mt-3">Preview data — add sponsors in the org profile editor</p>
                        )}
                    </Section>
                )}

                {/* ===== CONTACT DIRECTORY ===== */}
                {(contacts.length > 0 || org.contact_email) && (
                    <Section title="Contacts" accent={accent}>
                        <div className="space-y-3">
                            {(contacts.length > 0 ? contacts : [{ role: 'General Enquiries', name: org.name, email: org.contact_email, phone: org.contact_phone, whatsapp: org.whatsapp_number }]).map((c, i) => (
                                <div key={i} className="flex items-center gap-3 bg-black/30 border border-white/5 p-3.5 rounded-2xl">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0" style={{ background: accentSoft, color: accent }}>
                                        {(c.role || c.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-white truncate">{c.role || 'Contact'}</p>
                                        <p className="text-[11px] text-gray-500 truncate">{[c.name, c.email].filter(Boolean).join(' · ')}</p>
                                    </div>
                                    <div className="flex gap-1.5 shrink-0">
                                        {c.phone && (
                                            <a href={`tel:${c.phone}`} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-all"><Phone size={14} /></a>
                                        )}
                                        {(c.whatsapp || c.phone) && (
                                            <a href={waLink(c.whatsapp || c.phone)} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 hover:bg-green-500 hover:text-black transition-all"><MessageCircle size={14} /></a>
                                        )}
                                        {c.email && (
                                            <a href={`mailto:${c.email}`} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-all"><Mail size={14} /></a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {/* ===== SOCIALS + INFO PANEL (side by side on desktop) ===== */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    {(socials.instagram || socials.facebook || socials.tiktok || socials.youtube || org.website_url) && (
                        <Section title="Social / Website" accent={accent}>
                            <div className="flex flex-wrap gap-2">
                                {org.website_url && (
                                    <a href={safeUrl(org.website_url)} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:text-white transition-all" title="Website"><Globe size={18} /></a>
                                )}
                                {socials.instagram && (
                                    <a href={safeUrl(socials.instagram)} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:text-pink-400 transition-all" title="Instagram"><Instagram size={18} /></a>
                                )}
                                {socials.facebook && (
                                    <a href={safeUrl(socials.facebook)} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:text-blue-400 transition-all" title="Facebook"><Facebook size={18} /></a>
                                )}
                                {socials.tiktok && (
                                    <a href={safeUrl(socials.tiktok)} target="_blank" rel="noopener noreferrer" className="w-11 h-11 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:text-white transition-all text-[15px] font-black flex items-center justify-center" title="TikTok">♪</a>
                                )}
                                {socials.youtube && (
                                    <a href={safeUrl(socials.youtube)} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:text-red-400 transition-all" title="YouTube"><Youtube size={18} /></a>
                                )}
                            </div>
                        </Section>
                    )}

                    <Section title="Organisation Info" accent={accent}>
                        {[
                            ['Coverage', org.coverage],
                            ['Affiliation', org.sapa_sanctioned ? 'Sanctioned & verified by SAPA' : (org.verified ? 'Verified by 4M Padel' : null)],
                            ['Organisation Type', org.org_type || 'Tournament Organiser'],
                            ['Year Established', org.year_established],
                            ['Events hosted', events.length > 0 ? `${events.length}${upcoming.length ? ` (${upcoming.length} upcoming)` : ''}` : null],
                        ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                            <div key={label} className="flex justify-between items-center gap-4 py-3 border-b border-white/5 last:border-0">
                                <span className="text-xs text-gray-500 shrink-0">{label}</span>
                                <span className="text-xs font-bold text-white text-right truncate">{value}</span>
                            </div>
                        ))}
                    </Section>
                </div>

                {/* ===== BOTTOM CONTACT STRIP ===== */}
                {(org.contact_phone || org.contact_email) && (
                    <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-3xl p-4 md:p-5 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-8">
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500">Contact</span>
                        {org.contact_phone && (
                            <a href={`tel:${org.contact_phone}`} className="flex items-center gap-2 text-sm font-bold text-white hover:opacity-80">
                                <Phone size={14} style={{ color: accent }} /> {org.contact_phone}
                            </a>
                        )}
                        {org.contact_email && (
                            <a href={`mailto:${org.contact_email}`} className="flex items-center gap-2 text-sm font-bold text-white hover:opacity-80">
                                <Mail size={14} style={{ color: accent }} /> {org.contact_email}
                            </a>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrganisationPage;
