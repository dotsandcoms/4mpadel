import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
    Building2, ChevronRight, ExternalLink, Globe, Instagram, Facebook,
    Mail, MapPin, MessageCircle, Phone,
} from 'lucide-react';
import { safeUrl } from '../utils/sanitizeHtml';
import { accentOnDark, isPublicClubStatus, showFourMApprovedBadge, clubCityLabel, clubRegionLabel } from '../utils/club';
import {
    fetchClubGroupBySlug,
    fetchClubGroupVenues,
    isPublicClubGroupStatus,
    resolveClubLogo,
} from '../utils/clubGroup';
import VerifiedBadge from '../components/VerifiedBadge';

const waLink = (num) => (num ? `https://wa.me/${String(num).replace(/[^0-9]/g, '').replace(/^0/, '27')}` : null);

/**
 * Public club group (brand) page — /groups/:slug
 */
const ClubGroupPage = () => {
    const { slug } = useParams();
    const [group, setGroup] = useState(null);
    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const data = await fetchClubGroupBySlug(slug);
                if (cancelled) return;
                if (!data || !isPublicClubGroupStatus(data.status)) {
                    setGroup(null);
                    setVenues([]);
                    return;
                }
                setGroup(data);
                const linked = await fetchClubGroupVenues(data.id);
                if (!cancelled) setVenues(linked);
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setGroup(null);
                    setVenues([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [slug]);

    const accent = accentOnDark(group?.brand_color);
    const brandTitle = (group?.short_name || group?.name || '').trim();
    const website = safeUrl(group?.website_url);
    const socials = group?.socials || {};
    const socialLinks = useMemo(() => ([
        { key: 'instagram', href: safeUrl(socials.instagram), icon: Instagram, label: 'Instagram' },
        { key: 'facebook', href: safeUrl(socials.facebook), icon: Facebook, label: 'Facebook' },
        { key: 'tiktok', href: safeUrl(socials.tiktok), icon: ExternalLink, label: 'TikTok' },
        { key: 'playtomic', href: safeUrl(socials.playtomic), icon: ExternalLink, label: 'Playtomic' },
    ].filter((s) => s.href)), [socials.instagram, socials.facebook, socials.tiktok, socials.playtomic]);

    if (loading) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-gray-500 text-sm">Loading group…</div>;
    }

    if (!group) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-center px-6">
                <Building2 size={48} className="text-gray-700 mb-4" />
                <h1 className="text-2xl font-black text-white">Group not found</h1>
                <Link to="/groups" className="mt-4 text-sm font-bold text-padel-green">Back to groups</Link>
            </div>
        );
    }

    const locationLabel = [group.city, group.province].filter(Boolean).join(', ');

    return (
        <div className="min-h-screen bg-black text-white pb-24">
            <Helmet>
                <title>{`${brandTitle} | Club Group | 4M Padel`}</title>
                <meta
                    name="description"
                    content={
                        group.about
                            ? String(group.about).slice(0, 155)
                            : `${brandTitle} — ${venues.length} padel venues on 4M Padel.`
                    }
                />
            </Helmet>

            <div className="relative overflow-hidden border-b border-white/5">
                <div
                    className="absolute inset-0"
                    style={{ background: `radial-gradient(ellipse at 70% 20%, ${accent}22, transparent 55%)` }}
                />
                <div className="container mx-auto px-4 md:px-6 pt-28 md:pt-36 pb-10 relative z-10">
                    <Link
                        to="/groups"
                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white mb-6"
                    >
                        Groups <ChevronRight size={12} /> {brandTitle}
                    </Link>

                    <div className="flex flex-col sm:flex-row gap-5 sm:items-end">
                        <div
                            className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden border border-white/10 bg-white/5 shrink-0 flex items-center justify-center"
                            style={{ boxShadow: `0 0 0 1px ${accent}40` }}
                        >
                            {group.logo_url ? (
                                <img src={group.logo_url} alt={brandTitle} className="w-full h-full object-cover" />
                            ) : (
                                <Building2 size={32} style={{ color: accent }} />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2" style={{ color: accent }}>
                                Club group · {venues.length} {venues.length === 1 ? 'venue' : 'venues'}
                            </p>
                            <h1 className="text-3xl md:text-5xl font-bold font-display tracking-tighter leading-[1.05]">
                                {brandTitle}
                            </h1>
                            {locationLabel && (
                                <p className="text-sm text-gray-400 mt-2 flex items-center gap-1.5">
                                    <MapPin size={14} style={{ color: accent }} /> {locationLabel}
                                </p>
                            )}
                            {group.about && (
                                <p className="text-sm text-gray-400 mt-3 max-w-2xl leading-relaxed">{group.about}</p>
                            )}
                            <div className="flex flex-wrap gap-3 mt-5">
                                {website && (
                                    <a
                                        href={website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-black"
                                        style={{ background: accent }}
                                    >
                                        <Globe size={14} /> Website <ExternalLink size={12} />
                                    </a>
                                )}
                                {group.contact_phone && (
                                    <a
                                        href={`tel:${group.contact_phone}`}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-white/5 border border-white/10 text-white"
                                    >
                                        <Phone size={14} style={{ color: accent }} /> Call
                                    </a>
                                )}
                                {waLink(group.whatsapp_number) && (
                                    <a
                                        href={waLink(group.whatsapp_number)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/25"
                                    >
                                        <MessageCircle size={14} /> WhatsApp
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 md:px-6 py-8 space-y-8">
                {(group.contact_email || socialLinks.length > 0) && (
                    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">Contact</h2>
                        {group.contact_email && (
                            <a href={`mailto:${group.contact_email}`} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white">
                                <Mail size={14} style={{ color: accent }} /> {group.contact_email}
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
                    </section>
                )}

                <section>
                    <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-white mb-4">
                        Venues & branches
                    </h2>
                    {venues.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center text-sm text-gray-500">
                            No published venues linked yet.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {venues.filter((v) => isPublicClubStatus(v.status)).map((venue) => {
                                const logo = resolveClubLogo({ ...venue, club_groups: group });
                                const city = clubCityLabel(venue);
                                const region = venue.province || clubRegionLabel(venue);
                                return (
                                    <Link
                                        key={venue.id}
                                        to={`/clubs/${venue.slug}`}
                                        className="group block bg-white/[0.02] border border-white/10 hover:border-padel-green/40 rounded-2xl p-5 transition-all h-full"
                                    >
                                        <div className="flex items-start gap-4">
                                            {logo ? (
                                                <img src={logo} alt="" className="w-14 h-14 rounded-2xl object-cover border border-white/10 shrink-0" />
                                            ) : (
                                                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                                    <MapPin size={20} className="text-gray-500" />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-lg font-bold font-display tracking-tighter text-white group-hover:text-padel-green transition-colors flex items-center gap-1.5">
                                                    <span className="truncate">{venue.short_name || venue.name}</span>
                                                    {showFourMApprovedBadge(venue) && (
                                                        <VerifiedBadge tone="green" size={14} className="shrink-0" title="4M approved" />
                                                    )}
                                                </h3>
                                                {(city || region) && (
                                                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                                        <MapPin size={11} /> {[city, region].filter(Boolean).join(' · ')}
                                                    </p>
                                                )}
                                            </div>
                                            <ChevronRight size={16} className="text-gray-600 group-hover:text-padel-green shrink-0 mt-1" />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default ClubGroupPage;
