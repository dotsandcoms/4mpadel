import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { safeUrl } from '../utils/sanitizeHtml';
import {
    fetchFederationBySlug,
    getFederationRankingsOrgId,
} from '../utils/federation';
import { useRankedin } from '../hooks/useRankedin';
import RankingDetailsModal from '../components/RankingDetailsModal';
import { getEventImage } from '../utils/imageUtils';
import {
    Landmark, ShieldCheck, BadgeCheck, Globe, Mail, Phone, MessageCircle,
    ChevronRight, Users, Building, GraduationCap, Trophy, Calendar,
    LayoutGrid, Instagram, Facebook, Youtube, ExternalLink, Medal, MapPin,
} from 'lucide-react';

const RANKING_TABS = [
    { id: 'men', label: 'Men', rankingType: 3, ageGroup: 82 },
    { id: 'women', label: 'Women', rankingType: 4, ageGroup: 83 },
];

/** In-page section nav — mirrors SAPA-style icon row. */
const FEDERATION_NAV = [
    { id: 'rankings', label: 'Rankings', icon: Trophy },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'players', label: 'Players', icon: Users },
    { id: 'coaches', label: 'Coaches', icon: GraduationCap },
    { id: 'organisers', label: 'Organisations', shortLabel: 'Orgs', icon: Building },
    { id: 'clubs', label: 'Clubs', icon: LayoutGrid },
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

const medalColor = (pos) => (pos === 1 ? '#FFD700' : pos === 2 ? '#C0C0C0' : pos === 3 ? '#CD7F32' : null);
const monthShort = (d) => (d ? new Date(d).toLocaleDateString('en-ZA', { month: 'short' }).toUpperCase() : '');
const dayNum = (d) => (d ? new Date(d).getDate() : '');
const waLink = (num) => (num ? `https://wa.me/${num.replace(/[^0-9]/g, '').replace(/^0/, '27')}` : null);

const getInitials = (name) => {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
};

/**
 * Lift dark brand colours (e.g. SAPA forest green) so text stays readable on black.
 * @param {string|null|undefined} hex
 * @param {string} [fallback='#C8F500']
 * @returns {string}
 */
const accentOnDark = (hex, fallback = '#C8F500') => {
    if (!hex || typeof hex !== 'string') return fallback;
    const raw = hex.trim().replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance >= 0.48) return `#${full.toUpperCase()}`;
    // Blend toward a bright lime for contrast on dark UI
    const t = 0.62;
    const nr = Math.round(((1 - t) * r + t * 0.78) * 255);
    const ng = Math.round(((1 - t) * g + t * 0.96) * 255);
    const nb = Math.round(((1 - t) * b + t * 0.02) * 255);
    return `#${[nr, ng, nb].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

/**
 * Horizontal snap scroller for mobile-friendly section cards.
 */
const ScrollRow = ({ children, className = '' }) => (
    <div className={`-mx-4 sm:mx-0 px-4 sm:px-0 flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide no-scrollbar touch-pan-x overscroll-x-contain scroll-smooth pb-1 ${className}`}>
        {children}
    </div>
);

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
 * Map RankedIn ranking rows + local player images (same fields as Rankings.jsx).
 * @param {object[]} data
 * @param {Record<string, object>} profileMap
 * @param {{ limit?: number, gender?: string }} [options]
 */
const formatFederationRankings = (data, profileMap, options = {}) => {
    if (!Array.isArray(data)) return [];
    const limit = options.limit ?? 24;
    const gender = options.gender || null;
    return data.slice(0, limit).map((item, index) => {
        const name = item.Name || item.PlayerName || '—';
        const key = name.trim().toLowerCase();
        const profile = profileMap[key] || null;
        return {
            id: item.Participant?.Id || item.RankedinId || `${name}-${index}`,
            playerId: profile?.id || null,
            name,
            pos: item.Standing || item.Position || index + 1,
            change: Number(item.StandingDiff) || 0,
            points: item.ParticipantPoints?.Points ?? item.Points ?? item.TotalPoints ?? 0,
            image: profile?.image_url || null,
            playerRecord: profile || null,
            gender,
            rankedinProfile: item.ParticipantUrl
                ? `https://www.rankedin.com${item.ParticipantUrl}`
                : null,
        };
    });
};

/**
 * Load local player profiles keyed by lowercased name.
 * @param {string[]} names
 * @returns {Promise<Record<string, object>>}
 */
async function fetchProfilesByName(names) {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    const map = {};
    if (unique.length === 0) return map;

    const orClause = unique
        .slice(0, 80)
        .map((n) => `name.ilike."${String(n).replace(/"/g, '')}"`)
        .join(',');

    const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('approved', true)
        .or(orClause);

    if (error) {
        console.warn('Profile lookup failed:', error.message);
        return map;
    }

    (data || []).forEach((p) => {
        const key = (p.name || '').trim().toLowerCase();
        if (key && p.id) {
            let sponsorsList = [];
            if (p.sponsors) {
                try {
                    sponsorsList = JSON.parse(p.sponsors);
                    if (!Array.isArray(sponsorsList)) sponsorsList = [p.sponsors];
                } catch {
                    sponsorsList = String(p.sponsors).split(',').map((s) => s.trim()).filter(Boolean);
                }
            }
            map[key] = { ...p, sponsors: sponsorsList };
        }
    });
    return map;
}

/**
 * Public federation portal — /federations/:slug
 */
const FederationPage = () => {
    const { slug } = useParams();
    const { getOrganisationRankings } = useRankedin();
    const [federation, setFederation] = useState(null);
    const [organisers, setOrganisers] = useState([]);
    const [events, setEvents] = useState([]);
    const [rankingsByTab, setRankingsByTab] = useState({ men: [], women: [] });
    const [rankingsTab, setRankingsTab] = useState('men');
    const [rankingsLoading, setRankingsLoading] = useState(false);
    const [imageErrors, setImageErrors] = useState({});
    const [coaches, setCoaches] = useState([]);
    const [clubs, setClubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRankingPlayer, setSelectedRankingPlayer] = useState(null);
    const [activeNavId, setActiveNavId] = useState('rankings');

    const scrollToSection = useCallback((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        setActiveNavId(id);
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    useEffect(() => {
        const sectionIds = FEDERATION_NAV.map((item) => item.id);
        const nodes = sectionIds
            .map((id) => document.getElementById(id))
            .filter(Boolean);
        if (nodes.length === 0) return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
                if (visible[0]?.target?.id) setActiveNavId(visible[0].target.id);
            },
            { rootMargin: '-30% 0px -55% 0px', threshold: [0.1, 0.35, 0.6] }
        );
        nodes.forEach((node) => observer.observe(node));
        return () => observer.disconnect();
    }, [federation?.id, loading]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const fed = await fetchFederationBySlug(slug);
                if (cancelled) return;
                if (!fed || fed.status !== 'published') {
                    setFederation(null);
                    return;
                }
                setFederation(fed);

                const { data: orgs } = await supabase
                    .from('organisations')
                    .select('id, name, slug, logo_url, org_type, verified, sapa_sanctioned, about')
                    .eq('federation_id', fed.id)
                    .eq('status', 'approved')
                    .order('name', { ascending: true });
                const orgList = orgs || [];
                if (!cancelled) setOrganisers(orgList);

                const orgIds = orgList.map((o) => o.id);
                if (orgIds.length > 0) {
                    const today = new Date().toISOString().substring(0, 10);
                    const { data: evs } = await supabase
                        .from('calendar')
                        .select('id, slug, event_name, venue, city, start_date, end_date, sapa_status, image_url, custom_image_url, poster_image_url, organisation_id')
                        .in('organisation_id', orgIds)
                        .or('sanction_status.eq.approved,sanction_status.is.null')
                        .neq('is_visible', false)
                        .gte('start_date', today)
                        .order('start_date', { ascending: true })
                        .limit(12);
                    if (!cancelled) setEvents(evs || []);
                } else if (!cancelled) {
                    setEvents([]);
                }

                const [{ data: clubRows }, { data: coachRows }] = await Promise.all([
                    supabase
                        .from('clubs')
                        .select('id, name, slug, logo_url, city, status')
                        .eq('federation_id', fed.id)
                        .eq('status', 'published')
                        .order('name', { ascending: true })
                        .limit(12),
                    supabase
                        .from('coach_applications')
                        .select('id, full_name, city, coaching_location, profile_pic_url')
                        .eq('status', 'approved')
                        .order('full_name', { ascending: true })
                        .limit(8),
                ]);
                if (!cancelled) {
                    setClubs(clubRows || []);
                    setCoaches(coachRows || []);
                }

                const rankingsOrgId = getFederationRankingsOrgId(fed);
                if (rankingsOrgId) {
                    setRankingsLoading(true);
                    try {
                        const rid = Number(rankingsOrgId) || rankingsOrgId;
                        const [menRaw, womenRaw] = await Promise.all([
                            getOrganisationRankings(3, 82, 40, rid),
                            getOrganisationRankings(4, 83, 40, rid),
                        ]);
                        const names = [
                            ...(menRaw || []).slice(0, 40).map((r) => r.Name),
                            ...(womenRaw || []).slice(0, 40).map((r) => r.Name),
                        ].filter(Boolean);
                        const profileMap = await fetchProfilesByName(names);
                        if (!cancelled) {
                            setRankingsByTab({
                                men: formatFederationRankings(menRaw, profileMap, { limit: 40, gender: 'men' }),
                                women: formatFederationRankings(womenRaw, profileMap, { limit: 40, gender: 'women' }),
                            });
                        }
                    } catch (rankErr) {
                        console.warn('Federation rankings preview failed:', rankErr);
                    } finally {
                        if (!cancelled) setRankingsLoading(false);
                    }
                }
            } catch (err) {
                console.error('Federation page load failed:', err);
                if (!cancelled) setFederation(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [slug, getOrganisationRankings]);

    const accent = accentOnDark(federation?.brand_color);
    const upcomingCount = events.length;
    const rankingsPreview = rankingsByTab[rankingsTab] || [];
    const rankingsOrgId = federation ? Number(getFederationRankingsOrgId(federation)) || getFederationRankingsOrgId(federation) : null;
    const rankingsTabLabel = RANKING_TABS.find((t) => t.id === rankingsTab)?.label || 'Men';
    const playersAlphabetical = useMemo(() => {
        const seen = new Set();
        return [...(rankingsByTab.men || []), ...(rankingsByTab.women || [])]
            .filter((p) => {
                const key = (p.name || '').trim().toLowerCase();
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    }, [rankingsByTab]);
    const stats = useMemo(() => {
        const overrides = federation?.stats && typeof federation.stats === 'object' ? federation.stats : {};
        return [
            { label: 'Upcoming Events', shortLabel: 'Events', value: overrides.upcoming_events ?? upcomingCount },
            { label: 'Approved Organisers', shortLabel: 'Organisers', value: overrides.organisers ?? organisers.length },
            { label: 'Approved Clubs', shortLabel: 'Clubs', value: overrides.clubs ?? clubs.length },
            { label: 'Approved Coaches', shortLabel: 'Coaches', value: overrides.coaches ?? coaches.length },
        ];
    }, [federation, upcomingCount, organisers.length, clubs.length, coaches.length]);

    if (loading) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-gray-500 text-sm">Loading federation…</div>;
    }

    if (!federation) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-center px-6">
                <Landmark size={48} className="text-gray-700 mb-4" />
                <h1 className="text-2xl font-black text-white">Federation not found</h1>
                <p className="text-gray-500 text-sm mt-2">This federation may still be a draft, or the link is incorrect.</p>
                <Link to="/federations" className="mt-6 text-[11px] font-black uppercase tracking-widest px-6 py-3 bg-padel-green text-black rounded-xl hover:bg-white transition-all">
                    Browse Federations
                </Link>
            </div>
        );
    }

    const socials = federation.socials || {};
    const socialLinks = [
        { key: 'instagram', href: safeUrl(socials.instagram), Icon: Instagram, label: 'Instagram' },
        { key: 'facebook', href: safeUrl(socials.facebook), Icon: Facebook, label: 'Facebook' },
        { key: 'tiktok', href: safeUrl(socials.tiktok), Icon: ExternalLink, label: 'TikTok' },
        { key: 'youtube', href: safeUrl(socials.youtube), Icon: Youtube, label: 'YouTube' },
    ].filter((s) => s.href);
    const personnel = Array.isArray(federation.personnel) ? federation.personnel : [];
    const committees = Array.isArray(federation.committees) ? federation.committees : [];
    const website = safeUrl(federation.website_url);
    const brandTitle = (federation.short_name || federation.name || '').trim();
    const brandSubtitle = federation.short_name && federation.name !== federation.short_name
        ? federation.name
        : null;
    const documentTitle = brandTitle ? `${brandTitle} | 4M Padel` : 'Federation | 4M Padel';

    return (
        <div className="min-h-screen bg-black text-white pb-20 md:pb-28 max-md:pt-[68px]">
            <Helmet>
                <title>{documentTitle}</title>
                <meta
                    name="description"
                    content={federation.about
                        ? federation.about.slice(0, 155)
                        : `${brandTitle}${brandSubtitle ? ` (${brandSubtitle})` : ''} — official padel federation on 4M Padel.`}
                />
                <meta property="og:title" content={documentTitle} />
                <meta name="twitter:title" content={documentTitle} />
            </Helmet>

            {/* Hero */}
            <div className="relative">
                <div
                    className={`relative overflow-hidden bg-gradient-to-br from-[#0B0F19] via-black to-[#0B0F19] ${
                        federation.cover_image_url ? 'h-44 sm:h-60 md:h-80 lg:h-[26rem]' : 'h-3 sm:h-8 md:h-40'
                    }`}
                >
                    {federation.cover_image_url ? (
                        <img
                            src={federation.cover_image_url}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover object-center"
                        />
                    ) : (
                        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 70% 30%, ${accent}22, transparent 55%)` }} />
                    )}
                    {/* Soft bottom fade only — keep hero photo readable */}
                    {federation.cover_image_url ? (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/25" />
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                    )}
                </div>

                <div className={`container mx-auto px-4 md:px-6 relative z-10 ${
                    federation.cover_image_url ? '-mt-14 sm:-mt-20 md:-mt-28' : 'mt-0 md:-mt-16'
                }`}>
                    <div className="flex flex-col gap-2.5 sm:gap-3 md:gap-5">
                        <div className="flex items-end gap-3.5 sm:gap-5 md:gap-8">
                            <div
                                className="w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 rounded-2xl sm:rounded-3xl border-4 border-black bg-[#111] overflow-hidden shadow-2xl shrink-0 flex items-center justify-center"
                                style={{ boxShadow: `0 0 0 1px ${accent}40` }}
                            >
                                {federation.logo_url ? (
                                    <img src={federation.logo_url} alt={brandTitle} className="w-full h-full object-cover" />
                                ) : (
                                    <Landmark size={36} style={{ color: accent }} />
                                )}
                            </div>
                            <div className="flex-1 min-w-0 pb-0.5 md:pb-2">
                                <div className="hidden md:flex flex-wrap gap-2 mb-2">
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border" style={{ color: accent, borderColor: `${accent}40`, background: `${accent}15` }}>
                                        Official Federation
                                    </span>
                                    {federation.verified && (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border bg-blue-500/10 text-blue-400 border-blue-500/25">
                                            <BadgeCheck size={11} /> Verified
                                        </span>
                                    )}
                                    {federation.is_national_governing_body && (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                                            <ShieldCheck size={11} /> National Governing Body
                                        </span>
                                    )}
                                </div>
                                <h1 className="text-3xl sm:text-4xl md:text-5xl font-black leading-none tracking-tight truncate">{brandTitle}</h1>
                                {brandSubtitle && (
                                    <p className="text-gray-400 text-xs sm:text-sm md:text-base mt-1.5 font-semibold tracking-wide line-clamp-2">
                                        {brandSubtitle}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex md:hidden flex-wrap gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border" style={{ color: accent, borderColor: `${accent}40`, background: `${accent}15` }}>
                                Official Federation
                            </span>
                            {federation.verified && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border bg-blue-500/10 text-blue-400 border-blue-500/25">
                                    <BadgeCheck size={10} /> Verified
                                </span>
                            )}
                            {federation.is_national_governing_body && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                                    <ShieldCheck size={10} /> National Governing Body
                                </span>
                            )}
                        </div>

                        {federation.about && (
                            <p className="text-gray-400 text-sm leading-relaxed line-clamp-3 md:line-clamp-4 max-w-2xl">
                                {federation.about}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="container mx-auto px-3 sm:px-4 md:px-6 mt-4 sm:mt-6">
                <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
                    {stats.map((s) => (
                        <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-xl sm:rounded-2xl px-1 py-2.5 sm:p-4 text-center min-w-0">
                            <div className="text-lg sm:text-2xl font-black leading-none" style={{ color: accent }}>{s.value}</div>
                            <div className="text-[7px] sm:text-[9px] font-black uppercase tracking-wider text-gray-500 mt-1.5 leading-tight">
                                <span className="sm:hidden">{s.shortLabel || s.label}</span>
                                <span className="hidden sm:inline">{s.label}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Section nav */}
            <div className="sticky top-16 sm:top-[68px] lg:top-[72px] z-40 mt-4 sm:mt-5 border-y border-white/10 bg-black/95 backdrop-blur-xl supports-[backdrop-filter]:bg-black/85">
                <div className="mx-auto w-full max-w-[1440px] px-2 sm:px-4 md:px-6">
                    <nav
                        aria-label="Federation sections"
                        className="flex items-stretch justify-between gap-0.5 overflow-x-auto scrollbar-hide no-scrollbar touch-pan-x py-2 sm:py-3"
                    >
                        {FEDERATION_NAV.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeNavId === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => scrollToSection(item.id)}
                                    aria-current={isActive ? 'true' : undefined}
                                    className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1.5 rounded-xl transition-colors touch-manipulation cursor-pointer border-0 ${
                                        isActive
                                            ? 'text-padel-green'
                                            : 'text-gray-400 bg-transparent active:text-white sm:hover:text-white'
                                    }`}
                                >
                                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" strokeWidth={isActive ? 2.25 : 1.75} />
                                    <span className="text-[7px] sm:text-[10px] font-black uppercase tracking-wider text-center leading-tight truncate max-w-full">
                                        <span className="sm:hidden">{item.shortLabel || item.label}</span>
                                        <span className="hidden sm:inline">{item.label}</span>
                                    </span>
                                    <span
                                        className={`h-0.5 w-5 sm:w-8 rounded-full transition-opacity ${isActive ? 'opacity-100 bg-padel-green' : 'opacity-0 bg-transparent'}`}
                                        aria-hidden
                                    />
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Actions */}
            {(website || federation.contact_email || waLink(federation.whatsapp_number) || socialLinks.length > 0) && (
            <div className="container mx-auto px-4 md:px-6 mt-4">
                <div className="flex flex-wrap gap-2">
                    {website && (
                        <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-black" style={{ background: accent }}>
                            <Globe size={14} /> Visit Website
                        </a>
                    )}
                    {federation.contact_email && (
                        <a href={`mailto:${federation.contact_email}`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white hover:bg-white/10">
                            <Mail size={14} /> Contact
                        </a>
                    )}
                    {waLink(federation.whatsapp_number) && (
                        <a href={waLink(federation.whatsapp_number)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white hover:bg-white/10">
                            <MessageCircle size={14} /> WhatsApp
                        </a>
                    )}
                    {socialLinks.map(({ key, href, Icon, label }) => (
                        <a
                            key={key}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={label}
                            title={label}
                            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:text-padel-green transition-colors"
                        >
                            <Icon size={16} />
                        </a>
                    ))}
                </div>
            </div>
            )}

            <div className="container mx-auto px-4 md:px-6 mt-4 sm:mt-6 flex flex-col gap-7 sm:gap-8">
                {/* Rankings */}
                <Section
                    id="rankings"
                    title="Official Rankings"
                    accent={accent}
                    action={<Link to="/rankings" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:opacity-80" style={{ color: accent }}>View all <ChevronRight size={12} /></Link>}
                >
                    <div className="flex gap-1.5 mb-3">
                        {RANKING_TABS.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setRankingsTab(tab.id)}
                                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors ${
                                    rankingsTab === tab.id
                                        ? 'text-black'
                                        : 'bg-white/5 text-gray-400'
                                }`}
                                style={rankingsTab === tab.id ? { background: accent } : undefined}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    {rankingsLoading ? (
                        <p className="text-sm text-gray-500">Loading rankings…</p>
                    ) : rankingsPreview.length === 0 ? (
                        <p className="text-sm text-gray-500">Rankings unavailable right now.</p>
                    ) : (
                        <ScrollRow className="md:pr-2">
                            {rankingsPreview.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => setSelectedRankingPlayer(r)}
                                    className="snap-start shrink-0 w-[120px] sm:w-[140px] md:w-[148px] rounded-2xl bg-white/[0.04] border border-white/10 p-3 text-left cursor-pointer active:scale-[0.98] transition-transform"
                                >
                                    <div className="flex items-center justify-between mb-2.5">
                                        <span className="text-[11px] font-black" style={{ color: medalColor(r.pos) || accent }}>
                                            {r.pos <= 3 ? <Medal size={14} style={{ color: medalColor(r.pos) }} /> : `#${r.pos}`}
                                        </span>
                                        <span className={`text-[10px] font-black ${
                                            r.change > 0 ? 'text-padel-green' : r.change < 0 ? 'text-red-500' : 'text-gray-600'
                                        }`}>
                                            {r.change > 0 ? `▲${r.change}` : r.change < 0 ? `▼${Math.abs(r.change)}` : '—'}
                                        </span>
                                    </div>
                                    <div className="w-14 h-14 mx-auto rounded-full overflow-hidden bg-white/10 border border-white/10 flex items-center justify-center mb-2.5">
                                        {r.image && !imageErrors[r.id] ? (
                                            <img
                                                src={r.image}
                                                alt=""
                                                className="w-full h-full object-cover"
                                                onError={() => setImageErrors((prev) => ({ ...prev, [r.id]: true }))}
                                            />
                                        ) : (
                                            <span className="text-xs font-bold text-gray-400">{getInitials(r.name)}</span>
                                        )}
                                    </div>
                                    <p className="text-[12px] font-bold text-white text-center truncate">{r.name}</p>
                                    <p className="text-[11px] font-black text-center mt-1" style={{ color: accent }}>
                                        {Number(r.points).toLocaleString()} pts
                                    </p>
                                </button>
                            ))}
                        </ScrollRow>
                    )}
                </Section>

                {/* Calendar */}
                <Section
                    id="calendar"
                    title="Event Calendar"
                    accent={accent}
                    action={<Link to="/calendar" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:opacity-80" style={{ color: accent }}>Full calendar <ChevronRight size={12} /></Link>}
                >
                    {events.length === 0 ? (
                        <p className="text-sm text-gray-500">No upcoming sanctioned events from linked organisers.</p>
                    ) : (
                        <ScrollRow>
                            {events.slice(0, 8).map((ev) => (
                                <Link
                                    key={ev.id}
                                    to={`/calendar/${ev.slug || ev.id}`}
                                    className="snap-start shrink-0 w-[220px] sm:w-[240px] rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10 active:scale-[0.98] transition-transform"
                                >
                                    <div className="h-24 relative bg-gradient-to-br from-white/10 to-black">
                                        <img
                                            src={getEventImage(ev)}
                                            alt=""
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
                                        <div className="absolute bottom-2.5 left-2.5 flex items-end gap-2">
                                            <div className="w-11 h-11 rounded-xl bg-black/70 border border-white/15 flex flex-col items-center justify-center backdrop-blur-sm">
                                                <span className="text-[8px] font-black text-gray-400 leading-none">{monthShort(ev.start_date)}</span>
                                                <span className="text-base font-black leading-none mt-0.5" style={{ color: accent }}>{dayNum(ev.start_date)}</span>
                                            </div>
                                            {ev.sapa_status && (
                                                <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${tierBadge(ev.sapa_status)}`}>
                                                    {ev.sapa_status}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <p className="text-[13px] font-bold text-white leading-snug line-clamp-2 min-h-[2.4em]">{ev.event_name}</p>
                                        <p className="text-[11px] text-gray-500 mt-1.5 flex items-start gap-1 truncate">
                                            <MapPin size={11} className="shrink-0 mt-0.5 opacity-70" />
                                            <span className="truncate">{[ev.city, ev.venue].filter(Boolean).join(' · ') || 'Venue TBC'}</span>
                                        </p>
                                    </div>
                                </Link>
                            ))}
                        </ScrollRow>
                    )}
                </Section>

                {/* Players */}
                <Section
                    id="players"
                    title="Players"
                    accent={accent}
                    action={<Link to="/players" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:opacity-80" style={{ color: accent }}>Directory <ChevronRight size={12} /></Link>}
                >
                    {rankingsLoading ? (
                        <p className="text-sm text-gray-500">Loading players…</p>
                    ) : playersAlphabetical.length === 0 ? (
                        <p className="text-sm text-gray-500">No ranked players available right now.</p>
                    ) : (
                        <ScrollRow>
                            {playersAlphabetical.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => {
                                        if (r.gender) setRankingsTab(r.gender);
                                        setSelectedRankingPlayer(r);
                                    }}
                                    className="snap-start shrink-0 w-[88px] sm:w-[96px] flex flex-col items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
                                >
                                    <div className="relative">
                                        <div className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full overflow-hidden bg-white/10 border-2 border-white/10 flex items-center justify-center">
                                            {r.image && !imageErrors[`p-${r.id}`] ? (
                                                <img
                                                    src={r.image}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                    onError={() => setImageErrors((prev) => ({ ...prev, [`p-${r.id}`]: true }))}
                                                />
                                            ) : (
                                                <span className="text-[11px] font-bold text-gray-400">{getInitials(r.name)}</span>
                                            )}
                                        </div>
                                        <span
                                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-black px-1.5 py-0.5 rounded-full text-black"
                                            style={{ background: accent }}
                                        >
                                            #{r.pos}
                                        </span>
                                    </div>
                                    <span className="text-[10px] sm:text-[11px] font-bold text-white text-center leading-tight line-clamp-2 w-full mt-1">
                                        {r.name}
                                    </span>
                                </button>
                            ))}
                        </ScrollRow>
                    )}
                </Section>

                {/* Personnel */}
                {(personnel.length > 0 || committees.length > 0) && (
                    <Section title="Key Personnel & Committees" accent={accent} id="personnel">
                        {personnel.length > 0 && (
                            <div className="mb-4">
                                <p className="text-[9px] font-black uppercase tracking-wider text-gray-500 mb-2 px-0.5">Key Personnel</p>
                                <ScrollRow>
                                    {personnel.map((p, i) => (
                                        <div
                                            key={i}
                                            className="snap-start shrink-0 w-[160px] rounded-2xl bg-white/[0.04] border border-white/10 p-3"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-black text-gray-300 mb-2">
                                                {getInitials(p.name || p.title)}
                                            </div>
                                            <p className="text-[13px] font-bold text-white leading-snug line-clamp-2">{p.name || p.title}</p>
                                            <p className="text-[10px] text-gray-500 mt-1 truncate">{p.role || p.position || ''}</p>
                                        </div>
                                    ))}
                                </ScrollRow>
                            </div>
                        )}
                        {committees.length > 0 && (
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-wider text-gray-500 mb-2 px-0.5">Committees</p>
                                <ScrollRow>
                                    {committees.map((c, i) => (
                                        <div
                                            key={i}
                                            className="snap-start shrink-0 w-[200px] rounded-2xl bg-white/[0.04] border border-white/10 p-3"
                                        >
                                            <p className="text-[13px] font-bold text-white leading-snug">{c.name || c.title}</p>
                                            {c.members && (
                                                <p className="text-[10px] text-gray-500 mt-1.5 line-clamp-3">
                                                    {Array.isArray(c.members) ? c.members.join(', ') : c.members}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </ScrollRow>
                            </div>
                        )}
                    </Section>
                )}

                {/* Organisers */}
                <Section
                    id="organisers"
                    title="Approved Organisers"
                    accent={accent}
                    action={<Link to="/organisations" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:opacity-80" style={{ color: accent }}>All orgs <ChevronRight size={12} /></Link>}
                >
                    {organisers.length === 0 ? (
                        <p className="text-sm text-gray-500">No organisations assigned to this federation yet.</p>
                    ) : (
                        <ScrollRow>
                            {organisers.map((o) => (
                                <Link
                                    key={o.id}
                                    to={o.slug ? `/organisations/${o.slug}` : '/organisations'}
                                    className="snap-start shrink-0 w-[140px] rounded-2xl bg-white/[0.04] border border-white/10 p-3 text-center active:scale-[0.98] transition-transform"
                                >
                                    {o.logo_url ? (
                                        <img src={o.logo_url} alt="" className="w-14 h-14 mx-auto rounded-xl object-cover border border-white/10" />
                                    ) : (
                                        <div className="w-14 h-14 mx-auto rounded-xl bg-white/5 flex items-center justify-center">
                                            <Building size={20} className="text-gray-500" />
                                        </div>
                                    )}
                                    <p className="text-[12px] font-bold text-white mt-2.5 line-clamp-2 leading-snug min-h-[2.4em]">{o.name}</p>
                                    <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-1 truncate">{o.org_type || 'Organiser'}</p>
                                </Link>
                            ))}
                        </ScrollRow>
                    )}
                </Section>

                {/* Clubs */}
                <Section
                    id="clubs"
                    title="Approved Clubs"
                    accent={accent}
                    action={<Link to="/clubs" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:opacity-80" style={{ color: accent }}>All clubs <ChevronRight size={12} /></Link>}
                >
                    {clubs.length === 0 ? (
                        <p className="text-sm text-gray-500">No clubs linked to this federation yet.</p>
                    ) : (
                        <ScrollRow>
                            {clubs.map((c) => (
                                <Link
                                    key={c.id}
                                    to={c.slug ? `/clubs/${c.slug}` : '/clubs'}
                                    className="snap-start shrink-0 w-[140px] rounded-2xl bg-white/[0.04] border border-white/10 p-3 text-center active:scale-[0.98] transition-transform"
                                >
                                    {c.logo_url ? (
                                        <img src={c.logo_url} alt="" className="w-12 h-12 mx-auto rounded-xl object-cover border border-white/10 mb-2" />
                                    ) : (
                                        <div className="w-12 h-12 mx-auto rounded-xl bg-white/5 flex items-center justify-center mb-2">
                                            <LayoutGrid size={18} style={{ color: accent }} />
                                        </div>
                                    )}
                                    <p className="text-[12px] font-bold text-white line-clamp-2 leading-snug">{c.name}</p>
                                    {c.city && <p className="text-[9px] text-gray-500 mt-1 truncate">{c.city}</p>}
                                </Link>
                            ))}
                        </ScrollRow>
                    )}
                </Section>

                {/* Coaches */}
                <Section
                    id="coaches"
                    title="Approved Coaches"
                    accent={accent}
                    action={<Link to="/academy/coaches" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:opacity-80" style={{ color: accent }}>Academy <ChevronRight size={12} /></Link>}
                >
                    {coaches.length === 0 ? (
                        <p className="text-sm text-gray-500">No approved coaches listed yet.</p>
                    ) : (
                        <ScrollRow>
                            {coaches.map((c) => (
                                <Link
                                    key={c.id}
                                    to={`/academy/coaches?id=${c.id}`}
                                    className="snap-start shrink-0 w-[120px] flex flex-col items-center gap-2 rounded-2xl bg-white/[0.04] border border-white/10 p-3 active:scale-[0.98] transition-transform"
                                >
                                    <div className="w-14 h-14 rounded-full overflow-hidden bg-white/10 border border-white/10 flex items-center justify-center">
                                        {c.profile_pic_url ? (
                                            <img src={c.profile_pic_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <GraduationCap size={18} className="text-gray-500" />
                                        )}
                                    </div>
                                    <p className="text-[11px] font-bold text-white text-center leading-snug line-clamp-2 min-h-[2.2em]">{c.full_name}</p>
                                    <p className="text-[9px] text-gray-500 text-center truncate w-full">
                                        {c.city || c.coaching_location || 'Coach'}
                                    </p>
                                </Link>
                            ))}
                        </ScrollRow>
                    )}
                </Section>
            </div>

            {(federation.contact_phone || federation.contact_email) && (
                <div className="container mx-auto px-4 md:px-6 mt-8">
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        {federation.contact_phone && (
                            <span className="inline-flex items-center gap-1.5"><Phone size={12} /> {federation.contact_phone}</span>
                        )}
                        {federation.contact_email && (
                            <a href={`mailto:${federation.contact_email}`} className="inline-flex items-center gap-1.5 hover:text-white">
                                <Mail size={12} /> {federation.contact_email}
                            </a>
                        )}
                        {website && (
                            <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-white">
                                <ExternalLink size={12} /> Website
                            </a>
                        )}
                    </div>
                </div>
            )}

            <AnimatePresence>
                {selectedRankingPlayer && (
                    <RankingDetailsModal
                        player={selectedRankingPlayer}
                        playerRecord={
                            selectedRankingPlayer.playerRecord
                            || { name: selectedRankingPlayer.name, id: selectedRankingPlayer.playerId || selectedRankingPlayer.id }
                        }
                        selectedOrgId={Number(rankingsOrgId) || 15809}
                        categoryLabel={rankingsTabLabel}
                        onClose={() => setSelectedRankingPlayer(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default FederationPage;
