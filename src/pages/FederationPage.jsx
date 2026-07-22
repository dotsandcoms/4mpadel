import React, { useState, useEffect, useMemo } from 'react';
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
import {
    Landmark, ShieldCheck, BadgeCheck, Globe, Mail, Phone, MessageCircle,
    ChevronRight, Users, Building, GraduationCap,
    Instagram, Facebook, Youtube, ExternalLink, Medal,
} from 'lucide-react';

const RANKING_TABS = [
    { id: 'men', label: 'Men', rankingType: 3, ageGroup: 82 },
    { id: 'women', label: 'Women', rankingType: 4, ageGroup: 83 },
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
 * Map RankedIn ranking rows + local player images (same fields as Rankings.jsx).
 * @param {object[]} data
 * @param {Record<string, string|null>} profileMap name -> image_url
 */
const formatFederationRankings = (data, profileMap) => {
    if (!Array.isArray(data)) return [];
    return data.slice(0, 8).map((item, index) => {
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
        .slice(0, 40)
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

const Section = ({ title, accent, action, children, id }) => (
    <div id={id} className="bg-[#0a0a0a]/50 border border-white/5 rounded-3xl p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: accent }}>{title}</h2>
            {action}
        </div>
        {children}
    </div>
);

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
                        .select('id, slug, event_name, venue, city, start_date, end_date, sapa_status, image_url, organisation_id')
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
                        .select('id, name')
                        .order('name', { ascending: true })
                        .limit(8),
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
                            getOrganisationRankings(3, 82, 8, rid),
                            getOrganisationRankings(4, 83, 8, rid),
                        ]);
                        const names = [
                            ...(menRaw || []).slice(0, 8).map((r) => r.Name),
                            ...(womenRaw || []).slice(0, 8).map((r) => r.Name),
                        ].filter(Boolean);
                        const profileMap = await fetchProfilesByName(names);
                        if (!cancelled) {
                            setRankingsByTab({
                                men: formatFederationRankings(menRaw, profileMap),
                                women: formatFederationRankings(womenRaw, profileMap),
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

    const accent = federation?.brand_color || '#9AE900';
    const upcomingCount = events.length;
    const rankingsPreview = rankingsByTab[rankingsTab] || [];
    const rankingsOrgId = federation ? Number(getFederationRankingsOrgId(federation)) || getFederationRankingsOrgId(federation) : null;
    const rankingsTabLabel = RANKING_TABS.find((t) => t.id === rankingsTab)?.label || 'Men';
    const stats = useMemo(() => {
        const overrides = federation?.stats && typeof federation.stats === 'object' ? federation.stats : {};
        return [
            { label: 'Upcoming Events', value: overrides.upcoming_events ?? upcomingCount },
            { label: 'Approved Organisers', value: overrides.organisers ?? organisers.length },
            { label: 'Approved Clubs', value: overrides.clubs ?? clubs.length },
            { label: 'Approved Coaches', value: overrides.coaches ?? coaches.length },
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
    const personnel = Array.isArray(federation.personnel) ? federation.personnel : [];
    const committees = Array.isArray(federation.committees) ? federation.committees : [];
    const website = safeUrl(federation.website_url);

    return (
        <div className="min-h-screen bg-black text-white pb-28">
            <Helmet>
                <title>{federation.name} | Federation | 4M Padel</title>
                <meta
                    name="description"
                    content={federation.about ? federation.about.slice(0, 155) : `${federation.name} — official padel federation on 4M Padel.`}
                />
            </Helmet>

            {/* Hero */}
            <div className="relative">
                <div className="h-52 md:h-80 relative overflow-hidden bg-gradient-to-br from-[#0B0F19] via-black to-[#0B0F19]">
                    {federation.cover_image_url ? (
                        <img src={federation.cover_image_url} alt="" className="w-full h-full object-cover opacity-70" />
                    ) : (
                        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 70% 30%, ${accent}22, transparent 55%)` }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                </div>

                <div className="container mx-auto px-4 md:px-6 relative -mt-20 md:-mt-28 z-10">
                    <div className="flex flex-col md:flex-row md:items-end gap-5 md:gap-8">
                        <div
                            className="w-28 h-28 md:w-36 md:h-36 rounded-3xl border-4 border-black bg-[#111] overflow-hidden shadow-2xl shrink-0 flex items-center justify-center"
                            style={{ boxShadow: `0 0 0 1px ${accent}40` }}
                        >
                            {federation.logo_url ? (
                                <img src={federation.logo_url} alt={federation.name} className="w-full h-full object-cover" />
                            ) : (
                                <Landmark size={40} style={{ color: accent }} />
                            )}
                        </div>
                        <div className="flex-1 pb-2">
                            <div className="flex flex-wrap gap-2 mb-2">
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
                            <h1 className="text-3xl md:text-5xl font-black leading-tight">{federation.name}</h1>
                            {federation.short_name && (
                                <p className="text-gray-400 text-sm mt-1 font-bold tracking-wide">{federation.short_name}</p>
                            )}
                            {federation.about && (
                                <p className="text-gray-400 text-sm mt-3 max-w-2xl leading-relaxed line-clamp-3 md:line-clamp-4">
                                    {federation.about}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="container mx-auto px-4 md:px-6 mt-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {stats.map((s) => (
                        <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
                            <div className="text-2xl font-black" style={{ color: accent }}>{s.value}</div>
                            <div className="text-[9px] font-black uppercase tracking-wider text-gray-500 mt-1">{s.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="container mx-auto px-4 md:px-6 mt-6">
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
                    {socials.instagram && (
                        <a href={safeUrl(socials.instagram) || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10">
                            <Instagram size={14} />
                        </a>
                    )}
                    {socials.facebook && (
                        <a href={safeUrl(socials.facebook) || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10">
                            <Facebook size={14} />
                        </a>
                    )}
                    {socials.youtube && (
                        <a href={safeUrl(socials.youtube) || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10">
                            <Youtube size={14} />
                        </a>
                    )}
                </div>
            </div>

            <div className="container mx-auto px-4 md:px-6 mt-10 grid lg:grid-cols-2 gap-5">
                {/* Rankings */}
                <Section
                    title="Official Rankings"
                    accent={accent}
                    action={<Link to="/rankings" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:opacity-80" style={{ color: accent }}>View all <ChevronRight size={12} /></Link>}
                >
                    <div className="flex gap-2 mb-3">
                        {RANKING_TABS.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setRankingsTab(tab.id)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${
                                    rankingsTab === tab.id
                                        ? 'text-black'
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
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
                        <ul className="space-y-2">
                            {rankingsPreview.map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedRankingPlayer(r)}
                                        className="w-full flex items-center gap-3 bg-black/30 border border-white/5 hover:border-white/15 rounded-xl px-3 py-2.5 transition-colors text-left cursor-pointer"
                                    >
                                        <span className="w-7 text-center font-black text-sm shrink-0" style={{ color: medalColor(r.pos) || accent }}>
                                            {r.pos <= 3 ? <Medal size={14} className="inline" style={{ color: medalColor(r.pos) }} /> : `#${r.pos}`}
                                        </span>
                                        <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 border border-white/10 shrink-0 flex items-center justify-center">
                                            {r.image && !imageErrors[r.id] ? (
                                                <img
                                                    src={r.image}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                    onError={() => setImageErrors((prev) => ({ ...prev, [r.id]: true }))}
                                                />
                                            ) : (
                                                <span className="text-[10px] font-bold text-gray-400">{getInitials(r.name)}</span>
                                            )}
                                        </div>
                                        <span className="flex-1 text-sm font-bold text-white truncate min-w-0">{r.name}</span>
                                        <span
                                            className="text-xs font-black px-2 py-1 rounded-lg bg-white/5 border border-white/10 shrink-0"
                                            style={{ color: accent }}
                                        >
                                            {Number(r.points).toLocaleString()}
                                        </span>
                                        <span className={`w-10 text-right text-xs font-black shrink-0 ${
                                            r.change > 0 ? 'text-padel-green' : r.change < 0 ? 'text-red-500' : 'text-gray-500'
                                        }`}>
                                            {r.change > 0 && `▲${r.change}`}
                                            {r.change < 0 && `▼${Math.abs(r.change)}`}
                                            {r.change === 0 && '—'}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>

                {/* Calendar */}
                <Section
                    title="Event Calendar"
                    accent={accent}
                    action={<Link to="/calendar" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:opacity-80" style={{ color: accent }}>Full calendar <ChevronRight size={12} /></Link>}
                >
                    {events.length === 0 ? (
                        <p className="text-sm text-gray-500">No upcoming sanctioned events from linked organisers.</p>
                    ) : (
                        <ul className="space-y-2">
                            {events.slice(0, 6).map((ev) => (
                                <li key={ev.id}>
                                    <Link
                                        to={`/calendar/${ev.slug || ev.id}`}
                                        className="flex items-center gap-3 bg-black/30 border border-white/5 hover:border-white/15 rounded-xl px-3 py-2.5 transition-colors"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-white/5 flex flex-col items-center justify-center shrink-0 border border-white/5">
                                            <span className="text-[9px] font-black text-gray-500">{monthShort(ev.start_date)}</span>
                                            <span className="text-lg font-black leading-none" style={{ color: accent }}>{dayNum(ev.start_date)}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-white truncate">{ev.event_name}</p>
                                            <p className="text-[11px] text-gray-500 truncate">{[ev.venue, ev.city].filter(Boolean).join(' · ')}</p>
                                        </div>
                                        {ev.sapa_status && (
                                            <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${tierBadge(ev.sapa_status)}`}>
                                                {ev.sapa_status}
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>

                {/* Personnel */}
                {(personnel.length > 0 || committees.length > 0) && (
                    <Section title="Key Personnel & Committees" accent={accent} id="personnel">
                        {personnel.length > 0 && (
                            <div className="mb-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Key Personnel (Exco)</p>
                                <ul className="grid sm:grid-cols-2 gap-2">
                                    {personnel.map((p, i) => (
                                        <li key={i} className="bg-black/30 border border-white/5 rounded-xl px-3 py-2.5">
                                            <p className="text-sm font-bold text-white">{p.name || p.title}</p>
                                            <p className="text-[11px] text-gray-500">{p.role || p.position || ''}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {committees.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Committees</p>
                                <ul className="space-y-2">
                                    {committees.map((c, i) => (
                                        <li key={i} className="bg-black/30 border border-white/5 rounded-xl px-3 py-2.5">
                                            <p className="text-sm font-bold text-white">{c.name || c.title}</p>
                                            {c.members && (
                                                <p className="text-[11px] text-gray-500 mt-0.5">
                                                    {Array.isArray(c.members) ? c.members.join(', ') : c.members}
                                                </p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </Section>
                )}

                {/* Organisers */}
                <Section
                    title="Approved Event Organisers"
                    accent={accent}
                    action={<Link to="/organisations" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:opacity-80" style={{ color: accent }}>All orgs <ChevronRight size={12} /></Link>}
                >
                    {organisers.length === 0 ? (
                        <p className="text-sm text-gray-500">No organisations assigned to this federation yet.</p>
                    ) : (
                        <ul className="grid sm:grid-cols-2 gap-2">
                            {organisers.map((o) => (
                                <li key={o.id}>
                                    <Link
                                        to={o.slug ? `/organisations/${o.slug}` : '/organisations'}
                                        className="flex items-center gap-3 bg-black/30 border border-white/5 hover:border-white/15 rounded-xl px-3 py-2.5 transition-colors"
                                    >
                                        {o.logo_url ? (
                                            <img src={o.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/10" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                                                <Building size={16} className="text-gray-500" />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-white truncate">{o.name}</p>
                                            <p className="text-[10px] text-gray-500 truncate">{o.org_type || 'Organiser'}</p>
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>

                {/* Clubs */}
                <Section title="Approved Clubs" accent={accent}>
                    {clubs.length === 0 ? (
                        <p className="text-sm text-gray-500">No approved clubs listed yet.</p>
                    ) : (
                        <>
                            <p className="text-[10px] text-gray-600 mb-3 uppercase tracking-wider font-bold">
                                Platform-approved clubs (federation scoping coming soon)
                            </p>
                            <ul className="grid sm:grid-cols-2 gap-2">
                                {clubs.map((c) => (
                                    <li key={c.id} className="flex items-center gap-3 bg-black/30 border border-white/5 rounded-xl px-3 py-2.5">
                                        <Users size={16} className="text-gray-500 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-white truncate">{c.name}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </Section>

                {/* Coaches */}
                <Section
                    title="Approved Coaches"
                    accent={accent}
                    action={<Link to="/academy/coaches" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:opacity-80" style={{ color: accent }}>Academy <ChevronRight size={12} /></Link>}
                >
                    {coaches.length === 0 ? (
                        <p className="text-sm text-gray-500">No approved coaches listed yet.</p>
                    ) : (
                        <>
                            <p className="text-[10px] text-gray-600 mb-3 uppercase tracking-wider font-bold">
                                Platform-approved coaches (federation scoping coming soon)
                            </p>
                            <ul className="grid sm:grid-cols-2 gap-2">
                                {coaches.map((c) => (
                                    <li key={c.id}>
                                        <Link
                                            to={`/academy/coaches?id=${c.id}`}
                                            className="flex items-center gap-3 bg-black/30 border border-white/5 hover:border-white/15 rounded-xl px-3 py-2.5 transition-colors"
                                        >
                                            <div className="w-11 h-11 rounded-full overflow-hidden bg-white/10 border border-white/10 shrink-0 flex items-center justify-center">
                                                {c.profile_pic_url ? (
                                                    <img
                                                        src={c.profile_pic_url}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <GraduationCap size={16} className="text-gray-500" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold text-white truncate">{c.full_name}</p>
                                                <p className="text-[10px] text-gray-500 truncate">
                                                    {[c.city, c.coaching_location].filter(Boolean).join(' · ') || 'Approved coach'}
                                                </p>
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </>
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
