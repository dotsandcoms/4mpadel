import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import AuthModal from '../components/AuthModal';
import { supabase } from '../supabaseClient';
import { safeUrl } from '../utils/sanitizeHtml';
import { getEventImage } from '../utils/imageUtils';
import {
    fetchClubBySlug,
    fetchClubOrganisations,
    accentOnDark,
    isPublicClubStatus,
    showFourMApprovedBadge,
    clubCityLabel,
    clubRegionLabel,
} from '../utils/club';
import VerifiedBadge from '../components/VerifiedBadge';
import {
    MapPin, ShieldCheck, Globe, Mail, Phone, MessageCircle,
    ChevronRight, Building, Calendar, LayoutGrid, Instagram, Facebook,
    ExternalLink, Coffee, Landmark, ChevronDown, Users, Trophy, ShoppingBag,
    Droplets, Dumbbell, Wifi, Car, ParkingCircle, Utensils, User,
} from 'lucide-react';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

const waLink = (num) => (num ? `https://wa.me/${String(num).replace(/[^0-9]/g, '').replace(/^0/, '27')}` : null);

const normalizeVenueName = (value) => String(value || '').trim().toLowerCase();

const eventMatchesClub = (event, club) => {
    const clubNames = [club?.name, club?.short_name]
        .filter(Boolean)
        .map(normalizeVenueName)
        .filter(Boolean);
    if (!clubNames.length) return false;

    const venues = Array.isArray(event?.venues)
        ? event.venues.map(normalizeVenueName)
        : [];
    const fallbackVenue = normalizeVenueName(event?.venue);
    const haystacks = [...venues, fallbackVenue].filter(Boolean);

    return clubNames.some((clubName) =>
        haystacks.some((venue) =>
            venue === clubName
            || venue.includes(clubName)
            || clubName.includes(venue),
        ),
    );
};

const serviceIconFor = (title = '') => {
    const t = title.toLowerCase();
    if (t.includes('racket') || t.includes('rent')) return Dumbbell;
    if (t.includes('shop') || t.includes('pro shop')) return ShoppingBag;
    if (t.includes('shower')) return Droplets;
    if (t.includes('coffee') || t.includes('café') || t.includes('cafe') || t.includes('restaurant')) return Coffee;
    if (t.includes('wifi') || t.includes('wi-fi')) return Wifi;
    if (t.includes('park') || t.includes('car')) return Car;
    if (t.includes('playtomic') || t.includes('playsight') || t.includes('pushit')) return LayoutGrid;
    if (t.includes('food') || t.includes('kitchen')) return Utensils;
    if (t.includes('parking')) return ParkingCircle;
    return Building;
};

const AccordionRow = ({ id, title, open, onToggle, children, accent, action, last = false }) => (
    <div id={id} className={last ? '' : 'border-b border-white/10'}>
        <button
            type="button"
            onClick={onToggle}
            className="w-full flex items-center justify-between gap-3 py-3.5 text-left bg-transparent border-0 cursor-pointer"
            aria-expanded={open}
        >
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-[0.16em] text-white">{title}</span>
            <span className="flex items-center gap-3 shrink-0">
                {action ? (
                    <span
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="presentation"
                    >
                        {action}
                    </span>
                ) : null}
                <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    style={{ color: accent }}
                />
            </span>
        </button>
        {open ? <div className="pb-4">{children}</div> : null}
    </div>
);

/**
 * Public club card — /clubs/:slug
 */
const ClubPage = () => {
    const { slug } = useParams();
    const [club, setClub] = useState(null);
    const [orgs, setOrgs] = useState([]);
    const [memberCount, setMemberCount] = useState(0);
    const [hasClubOwner, setHasClubOwner] = useState(false);
    const [admins, setAdmins] = useState([]);
    const [coaches, setCoaches] = useState([]);
    const [clubEvents, setClubEvents] = useState([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [galleryFilter, setGalleryFilter] = useState('all');
    const [aboutExpanded, setAboutExpanded] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [openAccordions, setOpenAccordions] = useState({
        facilities: true,
        events: true,
        courts: true,
        gallery: true,
        coaches: true,
        contact: true,
        admins: true,
        hours: true,
        orgs: true,
        sponsors: true,
    });
    const eventsRailRef = useRef(null);

    const toggleAccordion = useCallback((key) => {
        setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const data = await fetchClubBySlug(slug);
                if (cancelled) return;
                if (!data || !isPublicClubStatus(data.status)) {
                    setClub(null);
                    return;
                }
                setClub(data);

                const linked = await fetchClubOrganisations(data.id);
                if (!cancelled) setOrgs(linked);

                const [{ count }, { count: ownerCount }, { data: memberRows }] = await Promise.all([
                    supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', data.id),
                    supabase.from('club_members').select('club_id', { count: 'exact', head: true }).eq('club_id', data.id).eq('role', 'owner'),
                    supabase
                        .from('club_members')
                        .select('role, user_email, players!player_id(id, name, image_url)')
                        .eq('club_id', data.id)
                        .in('role', ['owner', 'admin', 'staff'])
                        .limit(12),
                ]);

                if (!cancelled) {
                    setMemberCount(count || 0);
                    setHasClubOwner((ownerCount || 0) > 0);
                    setAdmins(
                        (memberRows || []).map((row) => ({
                            role: row.role,
                            email: row.user_email,
                            name: row.players?.name || row.user_email?.split('@')[0] || 'Admin',
                            image_url: row.players?.image_url || null,
                        })),
                    );
                }

                const clubNames = [data.name, data.short_name].filter(Boolean);
                if (clubNames.length) {
                    const { data: coachRows } = await supabase
                        .from('coach_applications')
                        .select('id, full_name, profile_pic_url, contact_number, coaching_location, city, status')
                        .eq('status', 'approved')
                        .limit(80);
                    if (!cancelled) {
                        const matched = (coachRows || []).filter((coach) => {
                            const loc = String(coach.coaching_location || '').toLowerCase();
                            return clubNames.some((n) => loc.includes(String(n).toLowerCase()));
                        });
                        setCoaches(matched.slice(0, 8));
                    }
                }
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
        if (!club?.id) {
            setClubEvents([]);
            return undefined;
        }

        let cancelled = false;
        const loadClubEvents = async () => {
            setEventsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('calendar')
                    .select('id, slug, event_name, start_date, end_date, venue, venues, city, sapa_status, registered_players, image_url, custom_image_url, poster_image_url')
                    .or('sanction_status.eq.approved,sanction_status.is.null')
                    .neq('is_visible', false)
                    .order('start_date', { ascending: false })
                    .limit(200);

                if (error) throw error;
                if (cancelled) return;

                const matched = (data || [])
                    .filter((event) => eventMatchesClub(event, club))
                    .sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

                setClubEvents(matched);
            } catch (err) {
                console.error('Failed to load club events:', err);
                if (!cancelled) setClubEvents([]);
            } finally {
                if (!cancelled) setEventsLoading(false);
            }
        };

        loadClubEvents();
        return () => { cancelled = true; };
    }, [club]);

    const accent = accentOnDark(club?.brand_color);
    const courts = club?.courts || {};
    const indoorCount = Number(courts.indoor?.count) || 0;
    const outdoorCount = Number(courts.outdoor?.count) || 0;
    const totalCourts = Number(club?.stats?.courts) || indoorCount + outdoorCount;
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

    const mapEmbedUrl = useMemo(() => {
        if (!club) return null;
        if (club.lat != null && club.lng != null && club.lat !== '' && club.lng !== '') {
            return `https://maps.google.com/maps?q=${Number(club.lat)},${Number(club.lng)}&z=15&output=embed`;
        }
        const query = [club.address, club.city, club.province].filter(Boolean).join(', ');
        if (!query) return null;
        return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
    }, [club]);
    const principal = club?.principal_sponsor;
    const brandTitle = (club?.short_name || club?.name || '').trim();
    const cityLabel = club ? clubCityLabel(club) : '';
    const regionLabel = club ? (club.province || clubRegionLabel(club)) : '';
    const locationLabel = [cityLabel, regionLabel].filter(Boolean).join(', ');
    const blurb = (club?.tagline || club?.about || '').trim();
    const playerCount = Number(club?.stats?.members) || memberCount || 0;
    const playerLabel = playerCount >= 30 ? `${playerCount}+` : String(playerCount || '—');
    const year = new Date().getFullYear();
    const eventsThisYear = clubEvents.filter((e) => {
        const d = new Date(e.start_date);
        return !Number.isNaN(d.getTime()) && d.getFullYear() === year;
    });
    const ranking = club?.stats?.ranking;
    const rankingArea = club?.stats?.ranking_area || cityLabel || regionLabel;

    const facilityItems = useMemo(() => {
        const items = [];
        (club?.services || []).forEach((svc, idx) => {
            if (!svc?.title) return;
            items.push({
                id: `svc-${idx}`,
                title: svc.title,
                Icon: serviceIconFor(svc.title),
            });
        });
        if (club?.cafe?.name) {
            items.push({ id: 'cafe', title: club.cafe.name, Icon: Coffee });
        }
        return items;
    }, [club]);

    const hoursEntries = DAY_ORDER
        .map((day) => ({ day, h: club?.opening_hours?.[day] }))
        .filter((row) => row.h);

    const scrollEvents = (dir) => {
        const el = eventsRailRef.current;
        if (!el) return;
        el.scrollBy({ left: dir * Math.min(320, el.clientWidth * 0.85), behavior: 'smooth' });
    };

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

    const stats = [
        {
            key: 'courts',
            Icon: LayoutGrid,
            value: totalCourts || '—',
            label: 'Courts',
            sub: [indoorCount ? `${indoorCount} Indoor` : null, outdoorCount ? `${outdoorCount} Outdoor` : null]
                .filter(Boolean)
                .join(' · ') || 'Courts',
        },
        {
            key: 'events',
            Icon: Calendar,
            value: eventsLoading ? '…' : eventsThisYear.length,
            label: 'SAPA Events',
            sub: 'This Year',
        },
        {
            key: 'players',
            Icon: Users,
            value: playerLabel,
            label: 'Players',
            sub: 'Active Community',
        },
    ];
    if (ranking != null && ranking !== '') {
        stats.push({
            key: 'ranking',
            Icon: Trophy,
            value: ranking,
            label: 'Club Ranking',
            sub: rankingArea || '—',
        });
    }

    return (
        <div className="min-h-screen bg-black text-white pb-24 max-md:pt-[68px]">
            <Helmet>
                <title>{`${brandTitle} | Club | 4M Padel`}</title>
                <meta
                    name="description"
                    content={blurb ? blurb.slice(0, 155) : `${brandTitle} — padel club on 4M Padel.`}
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
                        club.cover_image_url ? 'h-48 sm:h-64 md:h-80' : 'h-28 sm:h-36'
                    }`}
                >
                    {club.cover_image_url ? (
                        <img src={club.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 70% 30%, ${accent}22, transparent 55%)` }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/20" />
                </div>

                <div className={`container mx-auto px-4 md:px-6 relative z-10 ${
                    club.cover_image_url ? '-mt-16 sm:-mt-20' : 'mt-0'
                }`}>
                    <div className="flex items-end gap-3.5 sm:gap-5">
                        <div
                            className="w-[4.5rem] h-[4.5rem] sm:w-28 sm:h-28 rounded-2xl sm:rounded-3xl border-4 border-black bg-[#111] overflow-hidden shadow-2xl shrink-0 flex items-center justify-center"
                            style={{ boxShadow: `0 0 0 1px ${accent}40` }}
                        >
                            {club.logo_url ? (
                                <img src={club.logo_url} alt={brandTitle} className="w-full h-full object-cover" />
                            ) : (
                                <MapPin size={28} style={{ color: accent }} />
                            )}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                {showFourMApprovedBadge(club) && (
                                    <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border bg-padel-green/10 text-padel-green border-padel-green/25">
                                        <VerifiedBadge tone="green" size={13} title="4M approved" /> 4M approved
                                    </span>
                                )}
                                {club.sapa_registered && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                                        <ShieldCheck size={11} /> SAPA
                                    </span>
                                )}
                                {club.club_type && (
                                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border border-white/10 text-gray-400 bg-white/5">
                                        {club.club_type}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                                <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold font-display leading-[1.05] tracking-tighter flex items-center gap-2 min-w-0">
                                    <span className="truncate min-w-0">{brandTitle}</span>
                                    {showFourMApprovedBadge(club) && (
                                        <VerifiedBadge tone="green" size={24} className="shrink-0" title="4M approved" />
                                    )}
                                </h1>
                                {!hasClubOwner && (
                                    <button
                                        type="button"
                                        onClick={() => setIsAuthModalOpen(true)}
                                        className="inline-flex items-center justify-center gap-2 self-start shrink-0 px-4 py-2.5 rounded-2xl bg-padel-green text-black text-[10px] sm:text-[11px] font-black uppercase tracking-widest hover:bg-white transition-colors"
                                    >
                                        <Landmark size={14} />
                                        Claim Club
                                    </button>
                                )}
                            </div>
                            {locationLabel && (
                                <p className="text-gray-400 text-sm mt-1.5 flex items-center gap-1.5">
                                    <MapPin size={13} style={{ color: accent }} /> {locationLabel}
                                </p>
                            )}
                        </div>
                    </div>

                    {blurb && (
                        <div className="mt-3.5 max-w-2xl">
                            <p className={`text-gray-400 text-sm leading-relaxed ${aboutExpanded ? '' : 'line-clamp-2'}`}>
                                {blurb}
                            </p>
                            {blurb.length > 110 && (
                                <button
                                    type="button"
                                    onClick={() => setAboutExpanded((open) => !open)}
                                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider border-0 bg-transparent cursor-pointer p-0"
                                    style={{ color: accent }}
                                    aria-expanded={aboutExpanded}
                                >
                                    {aboutExpanded ? 'Show less' : 'Read more'}
                                    <ChevronDown size={12} className={`transition-transform ${aboutExpanded ? 'rotate-180' : ''}`} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Stats strip */}
            <div className="container mx-auto px-4 md:px-6 mt-5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                    <div className={`grid divide-x divide-white/10 ${stats.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                        {stats.map((s) => {
                            const Icon = s.Icon;
                            return (
                                <div key={s.key} className="px-2.5 py-3.5 sm:px-4 sm:py-4 text-center min-w-0">
                                    <Icon size={16} className="mx-auto mb-1.5 overflow-visible" style={{ color: accent }} />
                                    <p className="text-xl sm:text-2xl font-black text-white leading-none">{s.value}</p>
                                    <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-white mt-1.5">{s.label}</p>
                                    <p className="text-[8px] sm:text-[10px] text-gray-500 mt-0.5 truncate">{s.sub}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 md:px-6 mt-7 sm:mt-9">
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 sm:px-5">
                    {facilityItems.length > 0 && (
                        <AccordionRow
                            id="facilities"
                            title="Club Facilities"
                            open={openAccordions.facilities}
                            onToggle={() => toggleAccordion('facilities')}
                            accent={accent}
                        >
                            <div className="flex gap-3 sm:gap-0 overflow-x-auto sm:overflow-visible scrollbar-hide no-scrollbar pb-1 -mx-1 px-1 sm:mx-0 sm:px-0 sm:justify-between">
                                {facilityItems.map((item) => {
                                    const Icon = item.Icon;
                                    return (
                                        <div key={item.id} className="shrink-0 w-[4.5rem] sm:w-auto sm:flex-1 flex flex-col items-center gap-2 text-center px-1">
                                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center">
                                                <Icon size={20} className="text-gray-300" />
                                            </div>
                                            <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 leading-tight line-clamp-2 max-w-[5.5rem] sm:max-w-[7rem]">{item.title}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </AccordionRow>
                    )}

                    <AccordionRow
                        id="events"
                        title="Linked Events"
                        open={openAccordions.events}
                        onToggle={() => toggleAccordion('events')}
                        accent={accent}
                        action={(
                            <Link to="/calendar" className="text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>
                                View all
                            </Link>
                        )}
                    >
                        {eventsLoading ? (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-gray-500">
                                Loading events…
                            </div>
                        ) : clubEvents.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
                                <Calendar size={28} className="mx-auto text-gray-600 mb-2" />
                                <p className="text-sm text-gray-500">No linked events for this club yet.</p>
                            </div>
                        ) : (
                            <div className="relative">
                                <div ref={eventsRailRef} className="flex gap-3 overflow-x-auto scrollbar-hide no-scrollbar snap-x snap-mandatory pb-1">
                                    {clubEvents.slice(0, 8).map((event) => {
                                        const poster = getEventImage(event);
                                        const dateLabel = event.start_date
                                            ? new Date(event.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
                                            : '';
                                        return (
                                            <Link
                                                key={event.id}
                                                to={`/calendar/${event.slug || event.id}`}
                                                className="snap-start shrink-0 w-[min(100%,320px)] sm:w-[360px] rounded-2xl border border-white/10 bg-white/[0.03] p-3 flex gap-3 hover:border-white/20 transition-colors"
                                            >
                                                <div className="w-20 h-24 sm:w-24 sm:h-28 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                                    {poster ? (
                                                        <img src={poster} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Calendar size={20} className="text-gray-600" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1 py-0.5">
                                                    <p className="text-sm font-bold text-white line-clamp-2 leading-snug">{event.event_name}</p>
                                                    {event.sapa_status && (
                                                        <p className="text-[9px] font-black uppercase tracking-wider mt-1.5" style={{ color: accent }}>
                                                            SAPA {event.sapa_status}
                                                        </p>
                                                    )}
                                                    {dateLabel && (
                                                        <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1">
                                                            <Calendar size={11} /> {dateLabel}
                                                        </p>
                                                    )}
                                                    {(event.venue || event.city) && (
                                                        <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1 truncate">
                                                            <MapPin size={11} /> {[event.venue, event.city].filter(Boolean).join(', ')}
                                                        </p>
                                                    )}
                                                    {event.registered_players ? (
                                                        <p className="text-[10px] font-black uppercase tracking-wider mt-2 text-sky-400">
                                                            {event.registered_players} entries
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                                {clubEvents.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => scrollEvents(1)}
                                        className="hidden sm:flex absolute -right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center border-0 cursor-pointer shadow-lg"
                                        style={{ background: accent, color: '#000' }}
                                        aria-label="Next events"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                )}
                            </div>
                        )}
                    </AccordionRow>

                    {(indoorCount > 0 || outdoorCount > 0) && (
                        <AccordionRow
                            id="courts"
                            title="Courts"
                            open={openAccordions.courts}
                            onToggle={() => toggleAccordion('courts')}
                            accent={accent}
                        >
                            <div className="grid sm:grid-cols-2 gap-3">
                                {['indoor', 'outdoor'].map((side) => {
                                    const block = courts[side] || {};
                                    if (!block.count) return null;
                                    return (
                                        <div key={side} className="rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10">
                                            {block.image_url && (
                                                <img src={block.image_url} alt="" className="w-full h-32 object-cover" />
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
                        </AccordionRow>
                    )}

                    <AccordionRow
                        id="gallery"
                        title="Club Pictures"
                        open={openAccordions.gallery}
                        onToggle={() => toggleAccordion('gallery')}
                        accent={accent}
                    >
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
                                <div className="flex gap-2 overflow-x-auto scrollbar-hide no-scrollbar pb-1 sm:grid sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 sm:overflow-visible">
                                    {filteredGallery.map((img, idx) => (
                                        <div key={idx} className="shrink-0 w-28 sm:w-auto aspect-[4/3] sm:aspect-square rounded-xl overflow-hidden border border-white/10 bg-white/5">
                                            <img src={img.url} alt={img.caption || ''} className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </AccordionRow>

                    {coaches.length > 0 && (
                        <AccordionRow
                            id="coaches"
                            title="Coaching Team"
                            open={openAccordions.coaches}
                            onToggle={() => toggleAccordion('coaches')}
                            accent={accent}
                            action={(
                                <Link to="/academy/coaches" className="text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>
                                    View all
                                </Link>
                            )}
                        >
                            <div className="flex gap-3 overflow-x-auto scrollbar-hide no-scrollbar pb-1">
                                {coaches.map((coach) => (
                                    <Link
                                        key={coach.id}
                                        to={`/academy/coaches?id=${coach.id}`}
                                        className="shrink-0 w-40 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center hover:border-white/20 transition-colors"
                                    >
                                        <div className="w-16 h-16 mx-auto rounded-full overflow-hidden border border-white/10 bg-white/5 mb-2.5">
                                            {coach.profile_pic_url ? (
                                                <img src={coach.profile_pic_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <User size={22} className="text-gray-500" />
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[12px] font-bold text-white truncate">{coach.full_name}</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Coach</p>
                                        {waLink(coach.contact_number) && (
                                            <a
                                                href={waLink(coach.contact_number)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex mt-2 w-7 h-7 rounded-full items-center justify-center bg-[#25D366]/15 text-[#25D366]"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <MessageCircle size={13} />
                                            </a>
                                        )}
                                    </Link>
                                ))}
                            </div>
                        </AccordionRow>
                    )}

                    <AccordionRow
                        id="info"
                        title="Contact & Community"
                        open={openAccordions.contact}
                        onToggle={() => toggleAccordion('contact')}
                        accent={accent}
                    >
                        <div className="space-y-3 text-sm">
                            {(club.address || locationLabel) && (
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-gray-300 flex items-start gap-2 min-w-0">
                                        <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: accent }} />
                                        <span>{club.address || locationLabel}</span>
                                    </p>
                                    {mapUrl && (
                                        <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black uppercase tracking-widest shrink-0" style={{ color: accent }}>
                                            Directions
                                        </a>
                                    )}
                                </div>
                            )}
                            {mapEmbedUrl && (
                                <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
                                    <iframe
                                        title={`${brandTitle} location`}
                                        src={mapEmbedUrl}
                                        className="w-full h-44 sm:h-52 block border-0"
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                        allowFullScreen
                                    />
                                </div>
                            )}
                            {club.contact_phone && (
                                <a href={`tel:${club.contact_phone}`} className="flex items-center gap-2 text-gray-300 hover:text-white">
                                    <Phone size={14} style={{ color: accent }} /> {club.contact_phone}
                                </a>
                            )}
                            {website && (
                                <a href={website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-300 hover:text-white">
                                    <Globe size={14} style={{ color: accent }} />
                                    <span className="truncate">{website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                    <ExternalLink size={12} className="shrink-0 text-gray-500" />
                                </a>
                            )}
                            {club.contact_email && (
                                <a href={`mailto:${club.contact_email}`} className="flex items-center gap-2 text-gray-300 hover:text-white">
                                    <Mail size={14} style={{ color: accent }} /> {club.contact_email}
                                </a>
                            )}
                            {waLink(club.whatsapp_number) && (
                                <a
                                    href={waLink(club.whatsapp_number)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between gap-2 text-gray-300 hover:text-white py-1"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <MessageCircle size={14} style={{ color: accent }} /> WhatsApp
                                    </span>
                                    <ChevronRight size={14} className="text-gray-600" />
                                </a>
                            )}
                            {socialLinks.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {socialLinks.map((item) => {
                                        const SocialIcon = item.icon;
                                        return (
                                            <a
                                                key={item.key}
                                                href={item.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider text-gray-300 hover:text-white"
                                            >
                                                <SocialIcon size={12} /> {item.label}
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </AccordionRow>

                    {admins.length > 0 && (
                        <AccordionRow
                            title="Club Admins"
                            open={openAccordions.admins}
                            onToggle={() => toggleAccordion('admins')}
                            accent={accent}
                        >
                            <div className="flex gap-4 overflow-x-auto scrollbar-hide no-scrollbar pb-1">
                                {admins.map((person, idx) => (
                                    <div key={`${person.email}-${idx}`} className="shrink-0 flex flex-col items-center gap-1.5 w-20 text-center">
                                        <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 bg-white/5">
                                            {person.image_url ? (
                                                <img src={person.image_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[11px] font-black text-gray-400">
                                                    {(person.name || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[10px] font-bold text-white truncate w-full">{person.name?.split(' ')[0]}</p>
                                        <p className="text-[9px] text-gray-500 capitalize">{person.role}</p>
                                    </div>
                                ))}
                            </div>
                        </AccordionRow>
                    )}

                    {hoursEntries.length > 0 && (
                        <AccordionRow
                            title="Opening Hours"
                            open={openAccordions.hours}
                            onToggle={() => toggleAccordion('hours')}
                            accent={accent}
                        >
                            <ul className="rounded-xl bg-black/30 border border-white/5 divide-y divide-white/5">
                                {hoursEntries.map(({ day, h }) => (
                                    <li key={day} className="flex justify-between px-3.5 py-2.5 text-sm">
                                        <span className="text-gray-400 font-bold">{DAY_LABELS[day]}</span>
                                        <span className="text-white font-bold">
                                            {h.closed ? 'Closed' : `${h.open || '—'} – ${h.close || '—'}`}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </AccordionRow>
                    )}

                    {orgs.length > 0 && (
                        <AccordionRow
                            title="Linked Organisations"
                            open={openAccordions.orgs}
                            onToggle={() => toggleAccordion('orgs')}
                            accent={accent}
                        >
                            <div className="flex gap-3 overflow-x-auto scrollbar-hide no-scrollbar pb-1">
                                {orgs.map((o) => (
                                    <Link
                                        key={o.id}
                                        to={`/organisations/${o.slug}`}
                                        className="shrink-0 w-24 flex flex-col items-center gap-2 text-center"
                                    >
                                        <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center">
                                            {o.logo_url ? (
                                                <img src={o.logo_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <Building size={18} className="text-gray-500" />
                                            )}
                                        </div>
                                        <p className="text-[10px] font-bold text-white line-clamp-2">{o.name}</p>
                                    </Link>
                                ))}
                            </div>
                        </AccordionRow>
                    )}

                    {((club.sponsors || []).length > 0 || principal?.name) && (
                        <AccordionRow
                            title="Partners & Sponsors"
                            open={openAccordions.sponsors}
                            onToggle={() => toggleAccordion('sponsors')}
                            accent={accent}
                            last
                        >
                            <div className="grid grid-cols-2 gap-3">
                                {principal?.name && (
                                    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 text-center min-h-[88px] flex flex-col items-center justify-center">
                                        {principal.logo_url ? (
                                            <img src={principal.logo_url} alt={principal.name} className="h-8 object-contain mb-2" />
                                        ) : null}
                                        <p className="text-[11px] font-bold text-white">{principal.name}</p>
                                        <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">Principal</p>
                                    </div>
                                )}
                                {(club.sponsors || []).map((sp, idx) => (
                                    <div key={idx} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 text-center min-h-[88px] flex flex-col items-center justify-center">
                                        {sp.logo_url ? (
                                            <img src={sp.logo_url} alt={sp.name} className="h-8 object-contain mb-2" />
                                        ) : null}
                                        <p className="text-[11px] font-bold text-white">{sp.name}</p>
                                        {sp.tier && <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">{sp.tier}</p>}
                                    </div>
                                ))}
                            </div>
                        </AccordionRow>
                    )}
                </div>
            </div>

            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                initialTab="register"
                initialRegisterType="club"
                initialClubClaim={club ? {
                    id: club.id,
                    name: club.name,
                    short_name: club.short_name,
                    city: club.city,
                    logo_url: club.logo_url,
                    status: club.status,
                    verified: club.verified,
                } : null}
            />
        </div>
    );
};

export default ClubPage;
