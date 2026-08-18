import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { supabase } from '../supabaseClient';
import { fetchAllRows } from '../utils/fetchAllRows';
import { useRankedin } from '../hooks/useRankedin';
import { Calendar as CalendarIcon, MapPin, Loader, Phone, Mail, Globe, Share2, ArrowLeft, ArrowRight, X, CheckCircle, CreditCard, Cloud, CloudRain, CloudLightning, CloudSnow, GitBranch, PlayCircle, Play, ImageIcon, ChevronDown, ChevronUp, FileText, User, Users, UserPlus, Trophy, AlertCircle, Heart, ChevronRight, Gift, Award, Layout, Circle, Check, Clock, Crown, Coins, Grid2x2, Plus } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import PaystackPop from '@paystack/inline-js';
import { toPaystackAmount, formatCurrency } from '../constants/fees';
import { useCommerceConfig } from '../hooks/useCommerceConfig';
import {
    availableLicenseTypes,
    coerceLicenseChoice,
    eventEntryQuote,
    licenseQuote,
} from '../utils/commerce';
import ManualEventRegistration from '../components/ManualEventRegistration';
import ManualRegistrationEntryCard from '../components/ManualRegistrationEntryCard';
import PlayerModal from '../components/PlayerModal';
import { toast } from 'sonner';
import { sendEmail } from '../utils/emails';
import { canAccessHiddenEvents } from '../hooks/useAdminPermissions';
import { useMembersOnly } from '../context/MembersOnlyContext';
import {
    fetchScheduledEventIds,
    toggleEventOnSchedule,
    addEventToSchedule,
    SCHEDULE_CHANGED_EVENT,
} from '../utils/playerSchedule';

import { PAYSTACK_PUBLIC_KEY, isPaystackTestMode as isTestMode } from '../utils/paystackConfig';

const tournamentHero = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&q=80';
import logo4m from '../assets/logo_4m_lowercase.png';
import sapaLogo from '../assets/sapa-logo.svg';
import { getEventImage } from '../utils/imageUtils';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { isRegistrationClosed } from '../utils/registrationClose';
import { resolvePartnerPaid } from '../utils/partnerPaymentStatus';
import { isEarlyBirdActive, resolveDivisionEntryFee } from '../utils/eventEntryFee';
import {
    countWeeklyEntries,
    getWeeklyCapacity,
    weeklySpotsRemaining,
} from '../utils/weeklyRegistration';
import TournamentProgressBar from '../components/TournamentProgressBar';

const formatPlayerName = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[1].charAt(0)}`;
};

const divisionsMatch = (a, b) => {
    const na = (a || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const nb = (b || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
};

/** Tier-aware gradient + shine for the hero "Registered" status chip */
const getRegisteredStatusStyle = (theme) => {
    const isLightText = theme.primaryText.includes('text-white');
    const fill = theme.fill;
    return {
        background: `linear-gradient(145deg, color-mix(in srgb, ${fill} 68%, white 32%) 0%, ${fill} 50%, color-mix(in srgb, ${fill} 82%, black 18%) 100%)`,
        borderColor: fill,
        color: isLightText ? '#ffffff' : '#0a0a0a',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,${isLightText ? 0.28 : 0.45}), 0 2px 12px color-mix(in srgb, ${fill} 40%, transparent)`,
    };
};

const registeredStatusShineClass = (theme) =>
    theme.primaryText.includes('text-white')
        ? 'pointer-events-none absolute inset-0 bg-gradient-to-b from-white/22 via-white/6 to-transparent rounded-xl'
        : 'pointer-events-none absolute inset-0 bg-gradient-to-b from-white/38 via-white/12 to-transparent rounded-xl';

const REGISTERED_STATUS_CLASS = 'relative overflow-hidden flex items-center justify-center gap-2 px-2 py-3.5 rounded-xl border';

const getManualEntryPaymentLabel = (reg, userEmail) => {
    if (reg.payment_status !== 'paid') return 'Payment pending';
    const selfEmail = (reg.email || userEmail || '').toLowerCase();
    const registeredBy = (reg.registered_by || '').toLowerCase();
    if (!registeredBy || registeredBy === selfEmail) return 'Paid';
    const payerName = reg._payerName || (
        (reg.partner_email || '').toLowerCase() === registeredBy ? reg.partner_name : null
    );
    return payerName ? `Paid for by ${payerName}` : 'Paid for by partner';
};

const playerNamesMatch = (profileName, rankedinName) => {
    const a = (profileName || '').trim().toLowerCase();
    const b = (rankedinName || '').trim().toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    const partsA = a.split(/\s+/).filter(Boolean);
    const partsB = b.split(/\s+/).filter(Boolean);
    if (partsA.length < 2 || partsB.length < 2) return a.includes(b) || b.includes(a);
    const lastA = partsA[partsA.length - 1];
    const lastB = partsB[partsB.length - 1];
    if (lastA !== lastB) return false;
    const firstA = partsA[0];
    const firstB = partsB[0];
    return firstA === firstB || firstA.startsWith(firstB) || firstB.startsWith(firstA);
};

const rankedinIdsMatch = (a, b) => {
    if (!a || !b) return false;
    const sa = String(a).replace(/^R/i, '');
    const sb = String(b).replace(/^R/i, '');
    return sa === sb;
};

// Simple CountUp animation component
const CountUp = ({ end, duration = 1.5 }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTime;
        let animationFrame;

        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
            setCount(Math.floor(progress * end));

            if (progress < 1) {
                animationFrame = requestAnimationFrame(animate);
            }
        };

        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [end, duration]);

    return <span>{count.toLocaleString()}</span>;
};

const SPONSOR_SLIDE_SIZE = 3;

const EventSponsorStrip = ({ items, className = '', onPosterClick, accentColor = '#CCFF00' }) => {
    const [sponsorOffset, setSponsorOffset] = useState(0);

    if (!items?.length) return null;

    const org = items.find((item) => item.type === 'org') || null;
    const poster = items.find((item) => item.type === 'poster') || null;
    const sponsors = items.filter((item) => item.type === 'sponsor');

    const hasOrg = Boolean(org);
    const hasPoster = Boolean(poster);
    const hasSponsors = sponsors.length > 0;
    if (!hasOrg && !hasPoster && !hasSponsors) return null;

    // Fixed-height labels keep Organisation / Event Poster / Sponsors on one baseline
    const labelClass = 'h-4 flex items-center justify-center text-[9px] sm:text-[10px] font-bold uppercase tracking-wider leading-none whitespace-nowrap';
    const sideColClass = 'shrink-0 w-[5.75rem] sm:w-[6.5rem] flex flex-col items-center pt-3 pb-3 sm:pb-3.5 px-2 sm:px-2.5';

    const canSlideSponsors = sponsors.length > SPONSOR_SLIDE_SIZE;
    const visibleSponsors = canSlideSponsors
        ? Array.from({ length: SPONSOR_SLIDE_SIZE }, (_, i) => sponsors[(sponsorOffset + i) % sponsors.length])
        : sponsors;

    const advanceSponsors = () => {
        if (!canSlideSponsors) return;
        setSponsorOffset((prev) => (prev + 1) % sponsors.length);
    };

    return (
        <div className={`rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm overflow-hidden ${className}`}>
            <div className="flex items-stretch divide-x divide-white/10">
                {hasOrg && (
                    org.href ? (
                        <Link
                            to={org.href}
                            className={`${sideColClass} hover:bg-white/5 transition-colors`}
                            title={org.label || 'Organisation'}
                        >
                            <p className={`${labelClass} mb-2`} style={{ color: accentColor }}>Organisation</p>
                            <div className="flex-1 flex items-center justify-center">
                                <img
                                    src={org.url}
                                    alt={org.label || 'Organisation'}
                                    className="h-8 sm:h-10 w-auto max-w-full object-contain"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            </div>
                        </Link>
                    ) : (
                        <div className={sideColClass}>
                            <p className={`${labelClass} mb-2`} style={{ color: accentColor }}>Organisation</p>
                            <div className="flex-1 flex items-center justify-center">
                                <img
                                    src={org.url}
                                    alt={org.label || 'Organisation'}
                                    className="h-8 sm:h-10 w-auto max-w-full object-contain"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            </div>
                        </div>
                    )
                )}

                {hasPoster && (
                    onPosterClick ? (
                        <button
                            type="button"
                            onClick={() => onPosterClick(poster.url)}
                            className={`${sideColClass} hover:bg-white/5 transition-colors cursor-pointer`}
                            title="View event poster"
                        >
                            <p className={`${labelClass} mb-2`} style={{ color: accentColor }}>Event Poster</p>
                            <div className="flex-1 flex items-center justify-center">
                                <img
                                    src={poster.url}
                                    alt={poster.label || 'Event poster'}
                                    className="h-10 sm:h-12 w-auto max-w-[3.25rem] sm:max-w-[3.75rem] object-cover rounded-sm"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            </div>
                        </button>
                    ) : (
                        <div className={sideColClass}>
                            <p className={`${labelClass} mb-2`} style={{ color: accentColor }}>Event Poster</p>
                            <div className="flex-1 flex items-center justify-center">
                                <img
                                    src={poster.url}
                                    alt={poster.label || 'Event poster'}
                                    className="h-10 sm:h-12 w-auto max-w-[3.25rem] sm:max-w-[3.75rem] object-cover rounded-sm"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            </div>
                        </div>
                    )
                )}

                {hasSponsors && (
                    <div className="flex-1 min-w-0 flex flex-col items-center pt-3 pb-3 sm:pb-3.5 px-3">
                        <p className={`${labelClass} mb-2`} style={{ color: accentColor }}>Sponsors</p>
                        <div className="flex-1 w-full flex items-center gap-1.5 sm:gap-2 min-w-0">
                            <div className="flex-1 min-w-0 flex items-center justify-center gap-3 sm:gap-5 overflow-hidden">
                                {visibleSponsors.map((item, i) => (
                                    <img
                                        key={`${item.url}-${sponsorOffset}-${i}`}
                                        src={item.url}
                                        alt={item.label || `Sponsor ${i + 1}`}
                                        className="h-7 sm:h-9 w-auto max-w-[4.5rem] sm:max-w-[6rem] object-contain shrink-0"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                ))}
                            </div>
                            {canSlideSponsors && (
                                <button
                                    type="button"
                                    onClick={advanceSponsors}
                                    className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full border flex items-center justify-center hover:bg-white/10 transition-colors"
                                    style={{ borderColor: accentColor, color: accentColor }}
                                    aria-label="Next sponsors"
                                    title="Next sponsors"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// mode: 'closes' (counts down to registration close) or 'opens' (counts down to registration opening)
const RegistrationCountdown = ({
    closesAt,
    accentColor = '#CCFF00',
    mode = 'closes',
    ctaLabel = null,
    onCtaClick = null,
    ctaDisabled = false,
    ctaStyle = null,
}) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!closesAt) return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [closesAt]);

    // Only render an actionable CTA (skip disabled placeholders that leave empty space)
    const showCta = Boolean(ctaLabel) && !ctaDisabled;

    const closeDate = closesAt ? new Date(closesAt) : null;
    const hasCloseDate = Boolean(closeDate) && !Number.isNaN(closeDate.getTime());

    // Imported (non-4M-created) events often have no local registration_closes_at —
    // still show the CTA (e.g. Register out to the source it was imported from)
    // instead of hiding the whole row for lack of a date to count down to.
    if (!hasCloseDate && !showCta) return null;

    const diff = hasCloseDate ? closeDate.getTime() - now : 0;
    const isClosed = hasCloseDate && diff <= 0;
    const label = hasCloseDate
        ? (mode === 'opens' ? `Registration ${isClosed ? 'open' : 'opens'}` : `Registration ${isClosed ? 'closed' : 'closes'}`)
        : 'Registration Open';
    const parts = isClosed
        ? { days: 0, hours: 0, mins: 0, secs: 0 }
        : {
            days: Math.floor(diff / (1000 * 60 * 60 * 24)),
            hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
            mins: Math.floor((diff / (1000 * 60)) % 60),
            secs: Math.floor((diff / 1000) % 60),
        };

    const formattedDate = hasCloseDate ? closeDate.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) : null;
    // Compact mobile date — day + month + time only
    const compactDate = hasCloseDate ? closeDate.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }) : null;

    const pad = (n) => String(n).padStart(2, '0');

    return (
        <div className="mt-2 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm px-3 py-3 min-[420px]:pl-3 min-[420px]:pr-4 sm:pl-4 sm:pr-5 sm:py-4 flex flex-col min-[420px]:flex-row min-[420px]:items-center gap-2.5 min-[420px]:gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink overflow-hidden">
                <div
                    className="w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 border"
                    style={{ backgroundColor: `${accentColor}20`, borderColor: `${accentColor}40` }}
                >
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: accentColor }} />
                </div>
                <div className="min-w-0 overflow-hidden">
                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest text-white/60 mb-0.5 leading-none truncate">
                        {label}
                    </p>
                    {hasCloseDate && (
                        <p className="text-xs sm:text-sm font-bold leading-tight whitespace-nowrap truncate" style={{ color: accentColor }}>
                            <span className="sm:hidden">{compactDate}</span>
                            <span className="hidden sm:inline">{formattedDate}</span>
                        </p>
                    )}
                </div>
            </div>

            <div className={`flex items-center gap-2 sm:gap-3 min-w-0 ${showCta ? 'min-[420px]:ml-auto shrink-0 justify-between min-[420px]:justify-end' : 'flex-1 justify-end'}`}>
                {hasCloseDate && !isClosed && (
                    <div className={`flex items-center gap-1.5 sm:gap-3 ${showCta ? 'shrink-0' : 'flex-1 justify-evenly max-w-xs sm:max-w-sm ml-auto'}`}>
                        {[
                            { value: pad(parts.days), label: 'DAYS' },
                            { value: pad(parts.hours), label: 'HRS' },
                            { value: pad(parts.mins), label: 'MINS' },
                            { value: pad(parts.secs), label: 'SECS' },
                        ].map(({ value, label: unitLabel }) => (
                            <div key={unitLabel} className="text-center min-w-[1.5rem] sm:min-w-[2rem]">
                                <p className="text-base sm:text-lg font-bold text-white leading-none tabular-nums">{value}</p>
                                <p className="text-[8px] sm:text-[9px] font-bold text-white/50 tracking-wider mt-0.5">{unitLabel}</p>
                            </div>
                        ))}
                    </div>
                )}
                {showCta && (
                    <button
                        type="button"
                        onClick={onCtaClick}
                        className="relative overflow-hidden shrink-0 whitespace-nowrap px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wide border transition-all hover:brightness-110"
                        style={{
                            ...(ctaStyle || {
                                background: `linear-gradient(145deg, color-mix(in srgb, ${accentColor} 68%, white 32%) 0%, ${accentColor} 50%, color-mix(in srgb, ${accentColor} 82%, black 18%) 100%)`,
                                borderColor: accentColor,
                                color: '#ffffff',
                            }),
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), 0 1px 6px color-mix(in srgb, ${accentColor} 35%, transparent)`,
                        }}
                    >
                        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/22 via-white/6 to-transparent rounded-full" />
                        <span className="relative z-10">{ctaLabel}</span>
                    </button>
                )}
            </div>
        </div>
    );
};

const extractRankedinId = (url) => {
    if (!url) return null;
    // Matches /tournament/123, /clubleague/123, /draws/123, or just 123 at the end of a path
    const match = url.match(/\/(?:tournament|clubleague|draws|results)\/(\d+)/) || url.match(/\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
};

const getYoutubeEmbedUrl = (url) => {
    if (!url) return null;
    let videoId = '';

    if (url.includes('youtube.com/watch?v=')) {
        videoId = url.split('v=')[1].split('&')[0];
    } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.includes('youtube.com/embed/')) {
        videoId = url.split('embed/')[1].split('?')[0];
    }

    if (!videoId && /^[a-zA-Z0-9_-]{11}$/.test(url)) {
        videoId = url;
    }

    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : null;
};

const VideoModal = ({ isOpen, onClose, videoUrl, title }) => {
    if (!isOpen) return null;

    const embedUrl = getYoutubeEmbedUrl(videoUrl);

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 md:p-8">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/90 backdrop-blur-sm shadow-2xl"
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative w-full max-w-5xl aspect-video bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl z-10"
            >
                <div className="absolute top-4 right-4 z-20">
                    <button
                        onClick={onClose}
                        className="p-2 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md transition-colors border border-white/10"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {embedUrl ? (
                    <iframe
                        src={embedUrl}
                        title={title || "YouTube video player"}
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-white p-8 text-center">
                        <p>Video not found or invalid URL</p>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

const parsePrizeBreakdown = (raw) => {
    if (!raw) return [];
    let data = raw;
    if (typeof raw === 'string') {
        try { data = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(data)) return [];
    return data
        .map((row) => ({
            label: (row?.label || row?.name || '').trim(),
            amount: row?.amount ?? row?.value ?? '',
        }))
        .filter((row) => row.label && row.amount !== '' && row.amount != null);
};

const formatPrizeAmount = (amount) => {
    const raw = String(amount).trim();
    if (!raw) return '';
    if (raw.startsWith('R')) return raw;
    const n = Number(raw.replace(/[^\d.]/g, ''));
    if (!Number.isNaN(n)) return `R ${n.toLocaleString('en-ZA')}`;
    return `R ${raw}`;
};

const EventHeroBranding = ({
    event,
    theme,
    variant = 'hero',
    title = null,
    centered = false,
    dateLabel = null,
    locationLabel = null,
    brandLogoUrl = null,
    brandLogoAlt = '',
}) => {
    const isWeekly = !!event?.is_weekly;
    const badgeText = event?.organiser_badge_text?.trim()
        || (!isWeekly && event?.sapa_status && event.sapa_status !== 'None'
            ? `SAPA ${event.sapa_status}${event?.points ? ` ${event.points}` : ''}`.trim()
            : '');
    const logoUrl = isWeekly
        ? (brandLogoUrl || event?.organiser_logo_url || '').trim() || null
        : (badgeText ? sapaLogo : null);
    const logoAlt = isWeekly
        ? (brandLogoAlt || event?.organiser_name || 'Organiser')
        : 'SAPA';
    const showLogo = Boolean(logoUrl);
    const showBadge = Boolean(badgeText);
    const dateRow = dateLabel ? (
        <div className="flex items-center gap-1 sm:gap-1.5 text-white/90 text-xs sm:text-sm font-normal shrink-0">
            <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={{ color: theme.fill }} />
            <span className="whitespace-nowrap">{dateLabel}</span>
        </div>
    ) : null;
    const locationRow = locationLabel ? (
        <div className="flex items-center gap-1 sm:gap-1.5 text-white/90 text-xs sm:text-sm font-normal min-w-0 flex-1">
            <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={{ color: theme.fill }} />
            <span className="truncate">{locationLabel}</span>
        </div>
    ) : null;
    const sep = <span className="text-white/35 text-xs sm:text-sm font-light select-none shrink-0" aria-hidden>|</span>;

    if (variant === 'nav') {
        if (!showLogo && !showBadge) return null;
        return (
            <div className="flex items-center gap-2 min-w-0">
                {showLogo && (
                    <img
                        src={logoUrl}
                        alt={logoAlt}
                        className={`w-8 h-8 md:w-9 md:h-9 rounded-full border border-white/30 shrink-0 ${
                            isWeekly ? 'object-cover bg-black' : 'object-contain bg-white p-0.5'
                        }`}
                    />
                )}
                {showBadge && (
                    <span
                        className="text-xs md:text-sm font-bold uppercase tracking-wide truncate drop-shadow-md"
                        style={{ color: theme.fill }}
                    >
                        {badgeText}
                    </span>
                )}
            </div>
        );
    }

    // Hero: brand logo left (org for weekly, SAPA for sanctioned), title + badge right.
    return (
        <div className={`flex flex-col gap-2.5 min-w-0 ${centered ? 'items-center' : ''}`}>
            <div className={`flex items-center gap-3.5 sm:gap-4 min-w-0 ${centered ? 'justify-center' : ''}`}>
                {showLogo && (
                    <img
                        src={logoUrl}
                        alt={logoAlt}
                        className={`w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] md:w-20 md:h-20 rounded-full border border-white/30 shrink-0 shadow-md ${
                            isWeekly ? 'object-cover bg-black' : 'object-contain bg-white p-1'
                        }`}
                    />
                )}
                <div className={`min-w-0 flex-1 ${centered ? 'text-center' : ''}`}>
                    {title && (
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight drop-shadow-lg">
                            {title}
                        </h1>
                    )}
                    {showBadge && (
                        <p
                            className={`text-sm sm:text-base font-bold uppercase tracking-wide drop-shadow-md ${title ? 'mt-1' : ''}`}
                            style={{ color: theme.fill }}
                        >
                            {badgeText}
                        </p>
                    )}
                </div>
            </div>

            {(dateRow || locationRow) && (
                <div className={`flex items-center gap-1.5 sm:gap-2.5 min-w-0 w-full flex-nowrap overflow-hidden ${centered ? 'justify-center' : ''}`}>
                    {dateRow}
                    {locationRow && (
                        <>
                            {dateRow ? sep : null}
                            {locationRow}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const InfoSection = ({ title, icon: Icon, accent = '#9AE900', defaultOpen = false, text = null, children, className = "" }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200 ${className}`}>
            <div
                onClick={() => setOpen((o) => !o)}
                className="flex items-center justify-between px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent + '20' }}>
                        {Icon && <Icon className="w-4 h-4 text-[#0a0a0a]" />}
                    </div>
                    <h2 className="text-sm font-semibold text-slate-900 tracking-normal">{title}</h2>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${open ? '' : '-rotate-90'}`} />
            </div>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-6 py-5">
                            {text != null ? (
                                /<[a-z][\s\S]*>/i.test(text) ? (
                                    <div className="rich-text text-slate-600 leading-snug text-xs font-normal" dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }} />
                                ) : (
                                    <div className="text-slate-600 leading-snug text-xs font-normal whitespace-pre-wrap">{text}</div>
                                )
                            ) : children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const ModuleAccordion = ({ title, icon: Icon, children, defaultOpen = false, className = "" }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={`bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden transition-all ${className}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between p-6 md:p-8 text-left transition-all duration-300 ${isOpen ? 'bg-slate-900 border-b border-slate-800 shadow-lg' : 'bg-white hover:bg-gray-50/80'}`}
            >
                <div className="flex items-center gap-4">
                    {Icon && <Icon className={`w-6 h-6 transition-colors duration-300 ${isOpen ? 'text-padel-green drop-shadow-[0_0_8px_rgba(154,233,0,0.4)]' : 'text-padel-green'}`} />}
                    <h3 className={`text-base md:text-lg font-semibold tracking-normal transition-colors duration-300 ${isOpen ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
                </div>
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                >
                    <ChevronDown className={`w-6 h-6 transition-colors duration-300 ${isOpen ? 'text-padel-green' : 'text-gray-400'}`} />
                </motion.div>
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    >
                        <div className="p-6 md:p-8">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const EventDetails = () => {
    const { config: commerce } = useCommerceConfig();
    const getPlaylistEmbedUrl = (url) => {
        if (!url) return null;
        const match = url.match(/[&?]list=([^&]+)/);
        const playlistId = match ? match[1] : null;
        return playlistId ? `https://www.youtube.com/embed/videoseries?list=${playlistId}` : null;
    };

    const { slug } = useParams(); // changed from id to slug
    const navigate = useNavigate();
    const location = useLocation();
    const [event, setEvent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setSubmitting] = useState(false);
    const [weather, setWeather] = useState(null);
    const [albumPhotos, setAlbumPhotos] = useState([]);
    const [albumInfo, setAlbumInfo] = useState(null);

    // Animation Variants
    const containerVariants = {
        hidden: { opacity: 0, y: 30 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.8,
                ease: [0.16, 1, 0.3, 1],
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 15 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
        }
    };

    const isLive = React.useMemo(() => {
        if (!event || !event.start_date) return false;
        const now = new Date();
        const start = new Date(event.start_date);
        const end = new Date(event.end_date || event.start_date);
        // Set end to end of day
        end.setHours(23, 59, 59, 999);
        return now >= start && now <= end;
    }, [event]);

    const [hasDraw, setHasDraw] = useState(false);
    const [hasResults, setHasResults] = useState(false);
    const [winners, setWinners] = useState([]);
    const [expandedResults, setExpandedResults] = useState({ 0: true });

    // New State for Tabs & Enhanced Data
    const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'divisions', 'media'
    const [expandedOverviewCard, setExpandedOverviewCard] = useState(null);
    const [isMobilePlayerInfoOpen, setIsMobilePlayerInfoOpen] = useState(false);
    const [tournamentClasses, setTournamentClasses] = useState([]);
    const [upcomingMatches, setUpcomingMatches] = useState([]);
    const [fetchingRankedinData, setFetchingRankedinData] = useState(false);
    const [isRankedinRegistrationClosed, setIsRankedinRegistrationClosed] = useState(false);

    const [videoModal, setVideoModal] = useState({ isOpen: false, url: '', title: '' });
    const [participants, setParticipants] = useState({});
    const [playerDivisions, setPlayerDivisions] = useState([]);
    const [fourMPlayers, setFourMPlayers] = useState({});
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [loadingPlayerProfile, setLoadingPlayerProfile] = useState(false);
    // Total registered entries for manual events (incl. pending payment, counts
    // each player's division entry separately; excludes withdrawn).
    const [manualEntriesCount, setManualEntriesCount] = useState(0);
    const [globalRankings, setGlobalRankings] = useState(new Map());
    const [playerRankingsMap, setPlayerRankingsMap] = useState({});
    const [topSeedsGender, setTopSeedsGender] = useState('men');
    const [topSeedsOpen, setTopSeedsOpen] = useState(false);
    const [fetchingParticipants, setFetchingParticipants] = useState(false);
    const { getTournamentClasses, getTournamentWinners, getTournamentMatches, getTournamentParticipants, getTournamentPlayerTabs, getTournamentInfo, getOrganisationRankings } = useRankedin();

    const totalPlayersCount = useMemo(() => {
        // Manual events are the source of truth via their own registrations — never fall
        // back to the cached registered_players column (which can hold stale RankedIn data).
        const fallback = event?.is_manual ? 0 : (event?.registered_players || 0);
        if (!participants || Object.keys(participants).length === 0) return fallback;
        const uniqueNames = new Set();
        Object.values(participants).forEach(divisionPlayers => {
            if (!divisionPlayers) return;
            divisionPlayers.forEach(item => {
                const p = item.Participant || {};
                if (p.Players) {
                    p.Players.forEach(pl => { if (pl.Name) uniqueNames.add(pl.Name.toLowerCase()); });
                }
                if (p.FirstPlayer?.Name) uniqueNames.add(p.FirstPlayer.Name.toLowerCase());
                if (p.SecondPlayer?.Name) uniqueNames.add(p.SecondPlayer.Name.toLowerCase());
            });
        });
        return event?.is_manual ? uniqueNames.size : Math.max(uniqueNames.size, event?.registered_players || 0);
    }, [participants, event?.registered_players, event?.is_manual]);

    // Resolves a player's SAPA "Main" ranking points for the given gender from their
    // locally-synced players.rankings breakdown (same matching rules used on the
    // Rankings page's player modal: prefer an Open/Main age group of the right
    // gender, relax to just the right gender, then fall back to whichever SAPA
    // entry has the deepest tournament history).
    const getMainCategoryPoints = useCallback((playerData, genderLabel) => {
        if (!playerData) return 0;
        const rankingsArr = playerData.rankings;
        let matchPoints = 0;

        if (Array.isArray(rankingsArr) && rankingsArr.length > 0) {
            const orgCandidates = rankingsArr.filter((r) => r.org?.toUpperCase().includes('SAPA'));
            if (orgCandidates.length > 0) {
                const genderKeywords = genderLabel === 'women' ? ['WOMEN', 'LADIES', 'FEMALE'] : ['MEN'];

                let match = orgCandidates.find((r) => {
                    const matchType = (r.match_type || '').toUpperCase();
                    const ageGroup = (r.age_group || '').toUpperCase();
                    const genderMatch = genderKeywords.some((k) => matchType.includes(k));
                    const isMain = !ageGroup || ageGroup.includes('OPEN') || ageGroup.includes('MAIN');
                    return genderMatch && isMain;
                });

                if (!match) {
                    match = orgCandidates.find((r) =>
                        genderKeywords.some((k) => (r.match_type || '').toUpperCase().includes(k))
                    );
                }
                if (!match) {
                    match = [...orgCandidates].sort((a, b) => (b.details?.length || 0) - (a.details?.length || 0))[0];
                }

                if (match?.points) matchPoints = Number(match.points);
            }
        }

        // Only fall back to the flat players.points column when no SAPA ranking entry exists.
        return matchPoints > 0 ? matchPoints : (playerData.points || 0);
    }, []);

    // Seeds each manual-event team by combined SAPA Men/Women "Main" ranking points
    // (each player's synced best-8 points total, summed across the team), matching
    // the gender of the division they're registered in. Only used for manual
    // events — RankedIn events already carry their own Rank/Seed fields from the API.
    const manualTeamSeeds = useMemo(() => {
        if (!event?.is_manual) return {};
        const result = {};
        playerDivisions.forEach((div) => {
            const dname = (div.Name || '').toLowerCase();
            const genderLabel = (dname.includes('women') || dname.includes('ladies') || dname.includes('girls')) ? 'women' : 'men';

            const teams = (participants[div.Id] || []).map((item) => {
                const p = item.Participant || {};
                const players = p.Players || [];
                const totalPoints = players.reduce((sum, pl) => {
                    const rId = pl.RankedinId || pl.Id?.toString();
                    const pName = (pl.Name || '').toLowerCase().trim();
                    let mappedData = null;
                    if (rId && playerRankingsMap[rId]) {
                        mappedData = playerRankingsMap[rId];
                    } else if (pName && playerRankingsMap[pName]) {
                        mappedData = playerRankingsMap[pName];
                    }
                    
                    return sum + getMainCategoryPoints(mappedData, genderLabel);
                }, 0);
                return { id: p.Id, name: p.Name, players, totalPoints };
            });

            const ranked = teams.filter((t) => t.totalPoints > 0).sort((a, b) => b.totalPoints - a.totalPoints);
            const seedById = {};
            ranked.forEach((t, idx) => { seedById[t.id] = idx + 1; });

            result[div.Id] = {
                genderLabel,
                teams: teams.map((t) => ({ ...t, seed: seedById[t.id] || null })),
            };
        });
        return result;
    }, [event?.is_manual, playerDivisions, participants, playerRankingsMap, getMainCategoryPoints]);

    // Total registered entries for manual events.
    // Weekly: count bookable teams (not partner-mirror rows) for capacity display.
    // Other manual: count every active registration row (admin Entries total).
    useEffect(() => {
        if (!event?.id || !event?.is_manual) { setManualEntriesCount(0); return; }
        let cancelled = false;
        const countEntries = async () => {
            if (event.is_weekly) {
                const { data } = await supabase
                    .from('event_registrations_public')
                    .select('email_hash, registered_by_hash, status')
                    .eq('event_id', event.id);
                const mapped = (data || []).map((r) => ({
                    email: r.email_hash,
                    registered_by: r.registered_by_hash,
                    status: r.status,
                }));
                if (!cancelled) setManualEntriesCount(countWeeklyEntries(mapped));
                return;
            }
            const { count } = await supabase
                .from('event_registrations_public')
                .select('id', { count: 'exact', head: true })
                .eq('event_id', event.id);
            if (!cancelled) setManualEntriesCount(count || 0);
        };
        countEntries();
        window.addEventListener('4m:registrations-changed', countEntries);
        return () => {
            cancelled = true;
            window.removeEventListener('4m:registrations-changed', countEntries);
        };
    }, [event?.id, event?.is_manual, event?.is_weekly]);

    const entryFeeStatLabel = useMemo(() => {
        const fmt = (n) => `R${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
        if (isEarlyBirdActive(event) && event.early_bird_fee != null && event.early_bird_fee !== '') {
            return fmt(event.early_bird_fee);
        }
        // Weekly socials use calendar.entry_fee (no divisions).
        if (event?.is_weekly) {
            return Number(event?.entry_fee || 0) > 0 ? fmt(event.entry_fee) : '-';
        }
        if (event?.is_manual) {
            const fees = playerDivisions
                .map((d) => Number(d.EntryFee ?? d.StandardEntryFee ?? 0))
                .filter((f) => f > 0);
            if (fees.length === 0) {
                return Number(event?.entry_fee || 0) > 0 ? fmt(event.entry_fee) : '-';
            }
            const min = Math.min(...fees);
            const max = Math.max(...fees);
            if (min === max) return fmt(min);
            return `${fmt(min)}–${fmt(max)}`;
        }
        return Number(event?.entry_fee || 0) > 0 ? fmt(event.entry_fee) : '-';
    }, [event, playerDivisions]);

    const entryFeeStatSublabel = useMemo(() => {
        if (entryFeeStatLabel === '-') return null;
        if (isEarlyBirdActive(event)) return 'EARLY BIRD PER PLAYER';
        if (event?.is_weekly) return 'PER PLAYER / WEEK';
        return '';
    }, [entryFeeStatLabel, event]);

    const isEventPassed = useMemo(() => {
        if (!event) return false;
        const compareDate = event.end_date || event.start_date;
        if (!compareDate) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const eventDate = new Date(compareDate);
        eventDate.setHours(0, 0, 0, 0);

        return eventDate < today;
    }, [event]);

    // Event-wide close date for hero/countdown. Per-division closes are handled
    // in ManualEventRegistration (Register button) and via manualRegStatus.
    const isManualRegClosed = useMemo(() => {
        if (!event?.is_manual) return false;
        if (!event.registration_closes_at) return false;
        return new Date(event.registration_closes_at) < new Date();
    }, [event]);

    const registrationClosed = event?.is_manual ? isManualRegClosed : isRankedinRegistrationClosed;

    // Registration hasn't opened yet (registration_opens_at in the future)
    const registrationNotYetOpen = useMemo(() => {
        if (!event?.registration_opens_at) return false;
        return new Date(event.registration_opens_at) > new Date();
    }, [event]);

    const registrationOpensLabel = useMemo(() => {
        if (!event?.registration_opens_at) return '';
        return new Date(event.registration_opens_at).toLocaleDateString('en-ZA', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });
    }, [event]);

    // Linked organisation logo (not event.organiser_logo_url — that field often holds a SAPA mark)
    const [linkedOrgLogoUrl, setLinkedOrgLogoUrl] = useState('');
    const [linkedOrgSlug, setLinkedOrgSlug] = useState('');
    const [linkedOrgName, setLinkedOrgName] = useState('');
    const [posterModalUrl, setPosterModalUrl] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const orgId = event?.organisation_id;
        if (!orgId) {
            setLinkedOrgLogoUrl('');
            setLinkedOrgSlug('');
            setLinkedOrgName('');
            return undefined;
        }
        (async () => {
            const { data } = await supabase
                .from('organisations')
                .select('logo_url, slug, name')
                .eq('id', orgId)
                .maybeSingle();
            if (!cancelled) {
                setLinkedOrgLogoUrl((data?.logo_url || '').trim());
                setLinkedOrgSlug((data?.slug || '').trim());
                setLinkedOrgName((data?.name || '').trim());
            }
        })();
        return () => { cancelled = true; };
    }, [event?.organisation_id]);

    // Order: 1) organiser logo → org page, 2) event poster (modal), 3) sponsor logos in configured order
    const eventSponsorItems = useMemo(() => {
        const items = [];
        const orgLogo = linkedOrgLogoUrl;
        const posterUrl = String(event?.poster_image_url || '').trim();
        const coverUrl = String(event?.custom_image_url || '').trim();
        const sponsors = Array.isArray(event?.sponsor_logos)
            ? event.sponsor_logos.filter((url) => typeof url === 'string' && url.trim())
            : [];

        if (orgLogo) {
            items.push({
                type: 'org',
                url: orgLogo,
                href: linkedOrgSlug ? `/organisations/${linkedOrgSlug}` : null,
                label: linkedOrgName || 'Organiser',
            });
        }
        if (posterUrl) {
            items.push({
                type: 'poster',
                url: posterUrl,
                label: 'Event poster',
            });
        }
        for (const url of sponsors) {
            const trimmed = url.trim();
            if (!trimmed) continue;
            if (orgLogo && trimmed === orgLogo) continue;
            if (posterUrl && trimmed === posterUrl) continue;
            if (coverUrl && trimmed === coverUrl) continue;
            items.push({ type: 'sponsor', url: trimmed, label: 'Sponsor' });
        }
        return items;
    }, [linkedOrgLogoUrl, linkedOrgSlug, linkedOrgName, event?.poster_image_url, event?.custom_image_url, event?.sponsor_logos]);

    const computedEventStatus = useMemo(() => {
        if (event?.status && event.status.toLowerCase() !== 'published' && event.status !== 'Date available' && event.status !== 'Date available offered to R&B') return event.status;
        if (isEventPassed) return 'Completed';
        if (isLive) return 'Live Today';
        if (registrationNotYetOpen) return `Reg. Opens ${registrationOpensLabel}`;
        if (registrationClosed) return 'Registration Closed';
        return 'Registration Open';
    }, [event?.status, isEventPassed, isLive, registrationNotYetOpen, registrationOpensLabel, registrationClosed]);

    const stripHtml = (html) => {
        if (!html) return '';
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    };

    // Registration Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCalendarMenuOpen, setIsCalendarMenuOpen] = useState(false);
    const calendarMenuRef = useRef(null);
    const [regStep, setRegStep] = useState(1); // 1: Form, 2: Success/Payment
    const [loggedInPlayer, setLoggedInPlayer] = useState(null);
    const [isRegistered, setIsRegistered] = useState(false);
    const [isPaid, setIsPaid] = useState(false);
    const [paidDivisions, setPaidDivisions] = useState([]);
    const [registeredDivisions, setRegisteredDivisions] = useState([]);
    const [selectedDivisions, setSelectedDivisions] = useState([]);
    const [divisionPartners, setDivisionPartners] = useState({});
    const [initialPartners, setInitialPartners] = useState({});
    const [isCheckingReg, setIsCheckingReg] = useState(false);
    const [isDivisionsDropdownOpen, setIsDivisionsDropdownOpen] = useState(false);

    const availableDivisions = useMemo(() => {
        if (playerDivisions && playerDivisions.length > 0) {
            return playerDivisions.map(d => d.Name);
        }
        if (event?.allowed_divisions?.length) return event.allowed_divisions;
        if (event?.category_fees && Object.keys(event.category_fees).length > 0) return Object.keys(event.category_fees);
        return [];
    }, [event, playerDivisions]);

    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        partner_name: '',
        division: ''
    });

    const [partnerProfile, setPartnerProfile] = useState(null);
    const [partnerSearchResults, setPartnerSearchResults] = useState([]);
    const [hasPartner, setHasPartner] = useState(false);
    const [isLookingUpPartner, setIsLookingUpPartner] = useState(false);
    const [payForPartner, setPayForPartner] = useState(false);
    const [partnerLookupError, setPartnerLookupError] = useState(null);
    const [searchTimeout, setSearchTimeout] = useState(null);
    const [paymentReference, setPaymentReference] = useState('');

    const [emailCheckStatus, setEmailCheckStatus] = useState('idle'); // 'idle', 'checking', 'found', 'not_found'
    const [playerProfileData, setPlayerProfileData] = useState(null);
    const [licenseChoice, setLicenseChoice] = useState('temporary'); // 'temporary' | 'full'
    const [partnerLicenseChoice, setPartnerLicenseChoice] = useState('temporary'); // 'temporary' | 'full'
    const eventAllowsTemporary = event?.allow_temporary_license !== false;
    const eventLicenseOpts = { allowTemporary: eventAllowsTemporary };
    const licenseTypes = availableLicenseTypes(commerce, eventLicenseOpts);
    const licenseCharge = (choice) => licenseQuote(choice === 'full' ? 'full' : 'temporary', commerce).total;
    const entryCharge = (base) => eventEntryQuote(base, commerce).total;
    const licenseSalesOpen = licenseTypes.length > 0;

    useEffect(() => {
        const next = coerceLicenseChoice(licenseChoice, commerce, eventLicenseOpts);
        if (next && next !== licenseChoice) setLicenseChoice(next);
        const nextPartner = coerceLicenseChoice(partnerLicenseChoice, commerce, eventLicenseOpts);
        if (nextPartner && nextPartner !== partnerLicenseChoice) setPartnerLicenseChoice(nextPartner);
    }, [commerce, eventAllowsTemporary, licenseChoice, partnerLicenseChoice]);

    const [collapsedSections, setCollapsedSections] = useState({
        about: true,
        details: true,
        location: true,
        sponsors: true,
        weather: true,
        organiser: true
    });

    const toggleSection = (section) => {
        setCollapsedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const [expandedDivisions, setExpandedDivisions] = useState({});

    const toggleDivision = (divId) => {
        setExpandedDivisions(prev => ({
            ...prev,
            [divId]: !prev[divId]
        }));
    };

    const getTierTheme = () => {
        const status = event?.sapa_status?.trim();

        if (status === 'Major') {
            return {
                primary: 'bg-red-600 hover:bg-red-700 text-white',
                primaryText: 'text-white',
                accentText: 'text-red-600',
                accentBg: 'bg-red-600/10 border-red-600/20',
                badgeBg: 'bg-red-600 text-white',
                badgeText: 'text-white',
                glow: 'shadow-lg shadow-red-600/20',
                border: 'border-red-600',
                fill: '#DC2626'
            };
        }
        if (status === 'Super Gold' || status === 'S Gold') {
            return {
                primary: 'bg-amber-500 hover:bg-amber-600 text-[#0a0a0a]',
                primaryText: 'text-[#0a0a0a]',
                accentText: 'text-amber-500',
                accentBg: 'bg-amber-500/10 border-amber-500/20',
                badgeBg: 'bg-amber-500 text-[#0a0a0a]',
                badgeText: 'text-[#0a0a0a]',
                glow: 'shadow-lg shadow-amber-500/20',
                border: 'border-amber-500',
                fill: '#F59E0B'
            };
        }
        if (status === 'Gold') {
            return {
                primary: 'bg-yellow-500 hover:bg-yellow-600 text-[#0a0a0a]',
                primaryText: 'text-[#0a0a0a]',
                accentText: 'text-yellow-500',
                accentBg: 'bg-yellow-500/10 border-yellow-500/20',
                badgeBg: 'bg-yellow-500 text-[#0a0a0a]',
                badgeText: 'text-[#0a0a0a]',
                glow: 'shadow-lg shadow-yellow-500/20',
                border: 'border-yellow-500',
                fill: '#EAB308'
            };
        }
        if (status === 'Silver') {
            return {
                primary: 'bg-gray-400 hover:bg-gray-500 text-[#0a0a0a]',
                primaryText: 'text-[#0a0a0a]',
                accentText: 'text-gray-400',
                accentBg: 'bg-gray-400/10 border-gray-400/20',
                badgeBg: 'bg-gray-400 text-[#0a0a0a]',
                badgeText: 'text-[#0a0a0a]',
                glow: 'shadow-lg shadow-gray-400/20',
                border: 'border-gray-400',
                fill: '#9CA3AF'
            };
        }
        if (status === 'Bronze') {
            return {
                primary: 'bg-orange-700 hover:bg-orange-800 text-white',
                primaryText: 'text-white',
                accentText: 'text-orange-700',
                accentBg: 'bg-orange-700/10 border-orange-700/20',
                badgeBg: 'bg-orange-700 text-white',
                badgeText: 'text-white',
                glow: 'shadow-lg shadow-orange-700/20',
                border: 'border-orange-700',
                fill: '#C2410C'
            };
        }
        if (status === 'FIP event') {
            return {
                primary: 'bg-blue-600 hover:bg-blue-700 text-white',
                primaryText: 'text-white',
                accentText: 'text-blue-600',
                accentBg: 'bg-blue-600/10 border-blue-600/20',
                badgeBg: 'bg-blue-600 text-white',
                badgeText: 'text-white',
                glow: 'shadow-lg shadow-blue-600/20',
                border: 'border-blue-600',
                fill: '#2563EB'
            };
        }
        return {
            primary: 'bg-[#CCFF00] hover:bg-[#CCFF00]/80 text-[#0a0a0a]',
            primaryText: 'text-[#0a0a0a]',
            accentText: 'text-[#CCFF00]',
            accentBg: 'bg-[#CCFF00]/10 border-[#CCFF00]/20',
            badgeBg: 'bg-[#CCFF00] text-[#0a0a0a]',
            badgeText: 'text-[#0a0a0a]',
            glow: 'shadow-lg shadow-[#CCFF00]/20',
            border: 'border-[#CCFF00]',
            fill: '#CCFF00'
        };
    };

    const theme = getTierTheme();
    const registerNowStyle = { color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0a0a0a' };
    const registeredStatusStyle = getRegisteredStatusStyle(theme);
    const { promptMembersOnly } = useMembersOnly();

    // Resolve the effective logged-in (or impersonated) user email for manual-event registration.
    // NOTE: never call supabase.auth.getSession() inside onAuthStateChange — that deadlocks the
    // auth lock and causes AbortErrors elsewhere. Use the session passed to the callback instead.
    const [manualUserEmail, setManualUserEmail] = useState('');
    const [manualRegStatus, setManualRegStatus] = useState({
        hasPendingPayment: false,
        hasRegistrations: false,
        allRegistrationsPaid: false,
        hasAnyRegistration: false,
        entries: [],
        canAddDivision: false,
        registrationFullyClosed: false,
        canStartRegistration: false,
    });
    const manualRegActionsRef = React.useRef({});
    const [participantsRefreshKey, setParticipantsRefreshKey] = useState(0);
    const [isOnSchedule, setIsOnSchedule] = useState(false);
    const [scheduleBusy, setScheduleBusy] = useState(false);

    useEffect(() => {
        if (!isCalendarMenuOpen) return;
        const handleClickOutside = (event) => {
            if (calendarMenuRef.current && !calendarMenuRef.current.contains(event.target)) {
                setIsCalendarMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isCalendarMenuOpen]);

    const refreshParticipants = useCallback(() => {
        setParticipantsRefreshKey((k) => k + 1);
        try {
            if (manualUserEmail) {
                localStorage.removeItem(`hero_events_${manualUserEmail}`);
                localStorage.removeItem(`hero_match_${manualUserEmail}`);
            }
            window.dispatchEvent(new CustomEvent('4m:registrations-changed'));
        } catch (_) { /* ignore */ }
    }, [manualUserEmail]);

    /**
     * Open the public 4M player profile modal for a Players-tab entry.
     * Resolves against the local players table by RankedIn id, then name.
     */
    const openPlayerProfile = useCallback(async (playerObj) => {
        if (!playerObj || loadingPlayerProfile) return;
        const rId = String(playerObj.RankedinId || playerObj.Id || '').trim();
        const pName = String(playerObj.Name || '').trim();
        if (!rId && !pName) return;

        setLoadingPlayerProfile(true);
        try {
            const selectCols = 'id, name, image_url, rankedin_id, rankings, points, skill_rating, sponsors, additional_images, home_club, region, racket_brand, rank_label, category, active_ranking_label, level';
            let profile = null;

            if (rId) {
                const { data } = await supabase
                    .from('players_public')
                    .select(selectCols)
                    .eq('rankedin_id', rId)
                    .maybeSingle();
                profile = data;
            }

            if (!profile && pName) {
                const { data } = await supabase
                    .from('players_public')
                    .select(selectCols)
                    .ilike('name', pName)
                    .limit(5);
                if (data?.length === 1) {
                    profile = data[0];
                } else if (data?.length > 1) {
                    profile = data.find((row) => playerNamesMatch(row.name, pName)) || data[0];
                }
            }

            if (!profile) {
                toast.message('No 4M profile found for this player');
                return;
            }

            let sponsorsList = profile.sponsors;
            if (typeof sponsorsList === 'string') {
                try {
                    const parsed = JSON.parse(sponsorsList);
                    sponsorsList = Array.isArray(parsed) ? parsed : [sponsorsList];
                } catch {
                    sponsorsList = sponsorsList.split(',').map((s) => s.trim()).filter(Boolean);
                }
            }

            let additionalImages = profile.additional_images;
            if (typeof additionalImages === 'string') {
                try {
                    additionalImages = JSON.parse(additionalImages);
                } catch {
                    additionalImages = [];
                }
            }

            setSelectedPlayer({
                ...profile,
                image_url: profile.image_url || fourMPlayers[rId] || fourMPlayers[pName.toLowerCase()] || playerObj.Image || '',
                sponsors: Array.isArray(sponsorsList) ? sponsorsList : [],
                additional_images: Array.isArray(additionalImages) ? additionalImages : [],
            });
        } catch (err) {
            console.error('Error loading player profile:', err);
            toast.error('Could not load player profile');
        } finally {
            setLoadingPlayerProfile(false);
        }
    }, [loadingPlayerProfile, fourMPlayers]);

    useEffect(() => {
        let active = true;
        const applySession = (session) => {
            const impersonationEmail = sessionStorage.getItem('admin_test_login_email');
            const targetEmail = impersonationEmail || session?.user?.email;
            if (active) setManualUserEmail((targetEmail || '').toLowerCase().trim());
        };
        supabase.auth.getSession()
            .then(({ data: { session } }) => applySession(session))
            .catch(() => { });
        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));
        return () => { active = false; listener?.subscription?.unsubscribe?.(); };
    }, []);

    const hasEnteredEvent = !!(
        manualRegStatus.hasAnyRegistration
        || manualRegStatus.hasRegistrations
        || (manualRegStatus.entries || []).length > 0
    );

    useEffect(() => {
        let cancelled = false;
        const loadScheduleState = async () => {
            if (!manualUserEmail || !event?.id) {
                if (!cancelled) setIsOnSchedule(false);
                return;
            }
            try {
                const ids = await fetchScheduledEventIds(manualUserEmail);
                let saved = ids.map(Number).includes(Number(event.id));
                // Registered entries belong on My Schedule — sync if missing (shows the tick).
                if (!saved && hasEnteredEvent) {
                    try {
                        await addEventToSchedule(manualUserEmail, event.id);
                        saved = true;
                    } catch (syncErr) {
                        console.warn('Could not sync registration to My Schedule:', syncErr);
                    }
                }
                if (!cancelled) setIsOnSchedule(saved || hasEnteredEvent);
            } catch (err) {
                console.warn('Failed to load schedule state:', err);
                if (!cancelled) setIsOnSchedule(hasEnteredEvent);
            }
        };
        loadScheduleState();
        const onScheduleChanged = () => loadScheduleState();
        const onRegsChanged = () => loadScheduleState();
        window.addEventListener(SCHEDULE_CHANGED_EVENT, onScheduleChanged);
        window.addEventListener('4m:registrations-changed', onRegsChanged);
        return () => {
            cancelled = true;
            window.removeEventListener(SCHEDULE_CHANGED_EVENT, onScheduleChanged);
            window.removeEventListener('4m:registrations-changed', onRegsChanged);
        };
    }, [manualUserEmail, event?.id, hasEnteredEvent]);

    const handleToggleMySchedule = useCallback(async () => {
        if (!manualUserEmail) {
            promptMembersOnly();
            return;
        }
        if (!event?.id || scheduleBusy) return;

        const eventId = Number(event.id);
        // Registered players stay on schedule (tick) — same as Calendar when entered.
        if (hasEnteredEvent && isOnSchedule) {
            toast.message("You're registered for this event — it stays on My Schedule");
            return;
        }
        const currentlyOn = isOnSchedule;
        setScheduleBusy(true);
        setIsOnSchedule(!currentlyOn);

        try {
            const nowOn = await toggleEventOnSchedule(manualUserEmail, eventId, currentlyOn);
            setIsOnSchedule(nowOn || hasEnteredEvent);
            toast.success(nowOn ? 'Added to My Schedule' : 'Removed from My Schedule');
        } catch (err) {
            console.error('Schedule toggle failed:', err);
            setIsOnSchedule(currentlyOn || hasEnteredEvent);
            toast.error(err?.message || 'Could not update My Schedule');
        } finally {
            setScheduleBusy(false);
        }
    }, [manualUserEmail, event?.id, isOnSchedule, scheduleBusy, promptMembersOnly, hasEnteredEvent]);

    const loadManualRegistrationSummary = useCallback(async () => {
        if (!event?.is_manual || !manualUserEmail) {
            setManualRegStatus({
                hasPendingPayment: false,
                hasRegistrations: false,
                allRegistrationsPaid: false,
                hasAnyRegistration: false,
                entries: [],
                canAddDivision: false,
                registrationFullyClosed: false,
                canStartRegistration: false,
            });
            return;
        }

        const [{ data: regs }, { data: divs }, { data: divisionRegs }] = await Promise.all([
            supabase
                .from('event_registrations')
                .select('*')
                .eq('event_id', event.id)
                .ilike('email', manualUserEmail)
                .neq('status', 'withdrawn'),
            supabase
                .from('tournament_divisions')
                .select('*')
                .eq('event_id', event.id)
                .eq('is_active', true)
                .order('sort_order', { ascending: true }),
            supabase
                .from('event_registrations')
                .select('email, full_name, division_id, payment_status, partner_email, status')
                .eq('event_id', event.id)
                .neq('status', 'withdrawn'),
        ]);

        const myRegs = regs || [];
        const divisions = divs || [];
        const registrationFullyClosed = event?.is_weekly
            ? isRegistrationClosed(null, event)
            : (divisions.length > 0
                ? divisions.every((d) => isRegistrationClosed(d, event))
                : isRegistrationClosed(null, event));
        if (myRegs.length === 0) {
            const canAddDivision = !event?.is_weekly && divisions.some((d) => !isRegistrationClosed(d, event));
            setManualRegStatus({
                hasPendingPayment: false,
                hasRegistrations: false,
                allRegistrationsPaid: false,
                hasAnyRegistration: false,
                entries: [],
                canAddDivision,
                registrationFullyClosed,
                canStartRegistration: event?.is_weekly ? !registrationFullyClosed : canAddDivision,
            });
            return;
        }

        const payerEmails = [...new Set(
            myRegs
                .map((r) => (r.registered_by || '').toLowerCase())
                .filter((em) => em && em !== manualUserEmail),
        )];
        const payerNames = {};
        if (payerEmails.length > 0) {
            const { data: payerRows } = await supabase
                .from('event_registrations')
                .select('email, full_name')
                .eq('event_id', event.id)
                .in('email', payerEmails);
            for (const row of payerRows || []) {
                const em = (row.email || '').toLowerCase();
                if (em && row.full_name) payerNames[em] = row.full_name;
            }
        }

        const enrichedRegs = myRegs.map((r) => {
            const rb = (r.registered_by || '').toLowerCase();
            if (!rb || rb === manualUserEmail) return r;
            let name = r.partner_name;
            if (!name || (r.partner_email || '').toLowerCase() !== rb) name = payerNames[rb] || null;
            return { ...r, _payerName: name };
        });

        const registeredDivisionIds = new Set(
            enrichedRegs
                .filter((reg) => {
                    if (reg.payment_status === 'paid') return true;
                    const div = divisions.find((d) => d.id === reg.division_id);
                    return div && Number(div.entry_fee || 0) === 0;
                })
                .map((r) => r.division_id),
        );

        const entries = enrichedRegs.map((reg) => {
            const div = divisions.find((d) => d.id === reg.division_id)
                || divisions.find((d) => d.name === reg.division);
            const fee = event?.is_weekly
                ? Number(event?.entry_fee || 0)
                : Number(div?.entry_fee || 0);
            const isPaid = reg.payment_status === 'paid' || fee === 0;
            const hasPartner = !!(reg.partner_name?.trim() || reg.partner_email?.trim());
            const partnerReg = hasPartner && reg.partner_email
                ? (divisionRegs || []).find((r) =>
                    (r.division_id === reg.division_id
                        || (event?.is_weekly && (r.division || '').toLowerCase() === (reg.division || '').toLowerCase()))
                    && (r.email || '').toLowerCase() === (reg.partner_email || '').toLowerCase()
                    && r.status !== 'withdrawn',
                )
                : null;
            const partnerPaid = hasPartner && (
                resolvePartnerPaid(reg, partnerReg)
            );
            const registeredBy = (reg.registered_by || '').toLowerCase();
            const wasAddedByPartner = !!(registeredBy && registeredBy !== manualUserEmail);
            const addedByName = wasAddedByPartner
                ? (reg._payerName || reg.partner_name || 'your partner')
                : null;
            const regClosed = event?.is_weekly
                ? isRegistrationClosed(null, event)
                : isRegistrationClosed(div, event);
            const canWithdraw = reg.status !== 'withdrawn' && !regClosed && (!!div || !!event?.is_weekly);
            const canAddPartner = isPaid
                && !hasPartner
                && reg.status !== 'withdrawn'
                && (!!div || !!event?.is_weekly)
                && !regClosed;
            return {
                id: reg.id,
                division: reg.division,
                divisionId: reg.division_id,
                partnerName: reg.partner_name?.trim() || null,
                partnerEmail: reg.partner_email?.trim() || null,
                hasPartner,
                partnerPaid,
                wasAddedByPartner,
                addedByName,
                isBookingOwner: !wasAddedByPartner,
                canWithdraw,
                partnerPaymentLabel: !hasPartner
                    ? null
                    : partnerPaid
                        ? 'Paid & Confirmed'
                        : 'Payment Pending',
                paymentLabel: getManualEntryPaymentLabel(reg, manualUserEmail),
                isPaid,
                statusText: isPaid ? 'Paid & Confirmed' : 'Payment Pending',
                statusClassName: isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
                partnerStatusClassName: partnerPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
                canAddPartner,
            };
        });

        const canAddDivision = !event?.is_weekly && divisions.some((d) => {
            if (registeredDivisionIds.has(d.id)) return false;
            return !isRegistrationClosed(d, event);
        });

        const confirmedRegs = enrichedRegs.filter((reg) => {
            if (reg.payment_status === 'paid') return true;
            const div = divisions.find((d) => d.id === reg.division_id);
            return div && Number(div.entry_fee || 0) === 0;
        });
        const pendingPaymentRegs = enrichedRegs.filter((reg) => {
            if (reg.payment_status === 'paid') return false;
            const div = divisions.find((d) => d.id === reg.division_id);
            return div && Number(div.entry_fee || 0) > 0;
        });
        const hasRegistrations = confirmedRegs.length > 0;
        const hasPendingPayment = pendingPaymentRegs.length > 0;
        const allRegistrationsPaid = hasRegistrations && confirmedRegs.every((reg) => {
            if (reg.payment_status === 'paid') return true;
            const div = divisions.find((d) => d.id === reg.division_id);
            return !div || Number(div.entry_fee || 0) === 0;
        });

        setManualRegStatus({
            hasPendingPayment,
            hasRegistrations,
            allRegistrationsPaid,
            hasAnyRegistration: true,
            entries,
            canAddDivision,
            registrationFullyClosed,
            // Weekly: already entered for this event/week — no new registration.
            // Non-weekly: only if another open division remains.
            canStartRegistration: event?.is_weekly ? false : canAddDivision,
        });
    }, [event?.is_manual, event?.id, event?.is_weekly, event?.registration_closes_at, manualUserEmail]);

    useEffect(() => {
        loadManualRegistrationSummary();
    }, [loadManualRegistrationSummary, participantsRefreshKey]);

    // Load logged-in player profile for manual-event registration (profile pic, license, points)
    useEffect(() => {
        if (!event?.is_manual || !manualUserEmail) {
            setLoggedInPlayer(null);
            return;
        }
        let active = true;
        (async () => {
            const { data } = await supabase
                .from('players')
                .select('id, name, contact_number, email, license_type, paid_registration, image_url, points, approved, temporary_licenses(event_id, event_date)')
                .ilike('email', manualUserEmail)
                .maybeSingle();
            if (active) setLoggedInPlayer(data || null);
        })();
        return () => { active = false; };
    }, [event?.is_manual, event?.id, manualUserEmail]);

    // Prefill form from logged-in player profile when modal opens
    useEffect(() => {
        if (!isModalOpen) return;
        const prefillFromSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const impersonationEmail = sessionStorage.getItem('admin_test_login_email');
            const targetEmail = impersonationEmail || session?.user?.email;

            if (!targetEmail) return;

            const { data: playerData } = await supabase
                .from('players')
                .select('name, email, contact_number, category, license_type, paid_registration')
                .ilike('email', targetEmail)
                .maybeSingle();

            if (playerData) {
                setLoggedInPlayer(playerData);
                setFormData(prev => ({
                    ...prev,
                    full_name: prev.full_name || playerData.name || '',
                    email: prev.email || playerData.email || targetEmail || '',
                    phone: prev.phone || playerData.contact_number || '',
                    division: prev.division || playerData.category || ''
                }));
            } else {
                // Not a registered player yet, at least fill email
                setFormData(prev => ({
                    ...prev,
                    email: prev.email || targetEmail || ''
                }));
            }

            // check for existing registration to prevent duplicates early
            const checkEmail = (playerData?.email || targetEmail || '').toLowerCase().trim();
            if (checkEmail) {
                const { data: reg } = await supabase
                    .from('event_registrations')
                    .select('id')
                    .eq('event_id', event.id)
                    .ilike('email', checkEmail)
                    .eq('payment_status', 'paid')
                    .maybeSingle();

                const { data: part } = await supabase
                    .from('tournament_participants')
                    .select('id')
                    .eq('event_id', event.id)
                    .ilike('email', checkEmail)
                    .eq('is_paid', true)
                    .maybeSingle();

                if (reg || part) {
                    setIsPaid(true);
                }
            }
            // Generate a stable payment reference for this registration attempt
            setPaymentReference(`REGEV-${event.id}-${Date.now()}`);
        };
        prefillFromSession();
    }, [isModalOpen, event?.id]);

    // Check registration on mount/email change
    useEffect(() => {
        if (!event) return;
        const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);

        const checkStatus = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const impersonationEmail = sessionStorage.getItem('admin_test_login_email');
            const targetEmail = impersonationEmail || session?.user?.email;
            const userEmail = targetEmail?.toLowerCase().trim() || formData.email?.toLowerCase().trim();

            if (!userEmail || userEmail.length < 5 || !userEmail.includes('@')) {
                setRegisteredDivisions([]);
                setIsRegistered(false);
                return;
            }

            // Fetch profile for name and Rankedin ID matching
            const { data: profile } = await supabase
                .from('players')
                .select('id, name, rankedin_id')
                .ilike('email', userEmail)
                .maybeSingle();

            const userName = profile?.name?.toLowerCase().trim();
            const userRID = profile?.rankedin_id;

            // 1. Check Registration & Payment Status (Local DB)
            let orConditions = [`email.ilike.${userEmail}`];
            if (profile?.id) orConditions.push(`profile_id.eq.${profile.id}`);
            if (userName) orConditions.push(`full_name.ilike.%${userName}%`);

            const { data: localParts } = await supabase
                .from('tournament_participants')
                .select('class_name, is_paid')
                .eq('event_id', event.id)
                .or(orConditions.join(','));

            // 1b. Check legacy event_registrations table
            let legacyOr = [`email.ilike.${userEmail}`];
            if (userName) legacyOr.push(`full_name.ilike.%${userName}%`);

            const { data: legacyRegs } = await supabase
                .from('event_registrations')
                .select('division, payment_status, partner_name, full_name, email')
                .eq('event_id', event.id)
                .or(legacyOr.join(','));

            // 1c. Check Direct Payments table
            const { data: allEventPayments } = await supabase
                .from('payments')
                .select('metadata, player_id')
                .eq('event_id', event.id)
                .eq('status', 'success')
                .eq('payment_type', 'event_entry_fee');

            const directPayments = (allEventPayments || []).filter(pay => {
                if (profile?.id && pay.player_id === profile.id) return true;
                if (userEmail && pay.metadata?.email?.toLowerCase().trim() === userEmail) return true;
                if (userName && pay.metadata?.line_items && Array.isArray(pay.metadata.line_items)) {
                    return pay.metadata.line_items.some(item =>
                        (item.type === 'entry_fee' || item.type === 'entry') &&
                        playerNamesMatch(userName, item.player?.toLowerCase().trim())
                    );
                }
                return false;
            });

            const paidDivs = Array.from(new Set([
                ...(legacyRegs || []).filter(r => r.payment_status === 'paid').map(r => (r.division || '').trim()),
                ...(localParts || []).filter(p => p.is_paid).map(p => (p.class_name || '').trim()),
                ...(directPayments || []).flatMap((p) => {
                    const divs = [];
                    if (p.metadata?.division) divs.push(String(p.metadata.division).trim());
                    if (Array.isArray(p.metadata?.line_items)) {
                        p.metadata.line_items.forEach((item) => {
                            if ((item.type === 'entry_fee' || item.type === 'entry') && item.division) {
                                divs.push(String(item.division).trim());
                            }
                        });
                    }
                    return divs;
                }),
            ].filter(Boolean)));

            const isDivPaid = (divName) => paidDivs.some((pd) => divisionsMatch(pd, divName));

            const unpaidLocalDivs = [
                ...(localParts || []).filter(p => !p.is_paid).map(p => (p.class_name || '').trim()),
                ...(legacyRegs || []).filter(r => r.payment_status !== 'paid').map(r => (r.division || '').trim()),
            ].filter(Boolean).filter((div) => !isDivPaid(div));

            setPaidDivisions(paidDivs);
            setIsPaid(paidDivs.length > 0);

            // 2. Check Registration Status (Rankedin Live Player List fallback)
            const regDivs = [...unpaidLocalDivs];
            const divPartnersMap = {};

            // Get local partners from legacyRegs
            (legacyRegs || []).forEach(reg => {
                if (reg.partner_name && (reg.division || '').trim()) {
                    const isPartner = userName && reg.partner_name.toLowerCase().includes(userName);
                    divPartnersMap[reg.division.trim()] = isPartner ? reg.full_name.trim() : reg.partner_name.trim();
                }
            });

            if (rId) {
                setIsCheckingReg(true);
                try {
                    const divisions = await getTournamentPlayerTabs(rId, true);
                    await Promise.all(divisions.map(async (cls) => {
                        const teams = await getTournamentParticipants(rId, cls.Id, true);
                        const divName = (cls.Name || '').trim();

                        const isMatch = teams.some(t => {
                            const p = t.Participant || t;
                            const players = p.Players || [p.FirstPlayer, p.SecondPlayer].filter(Boolean);
                            if (players.length === 0) players.push(p);

                            const userMatch = players.find(player => {
                                const pEmail = (player.Email || '').toLowerCase().trim();
                                const pName = (player.Name || player.FullName || '').toLowerCase().trim();
                                const pRID = player.RankedinId?.toString() || player.Id?.toString();

                                return (pEmail && pEmail === userEmail) ||
                                    rankedinIdsMatch(pRID, userRID) ||
                                    playerNamesMatch(userName, pName);
                            });

                            if (userMatch) {
                                const partnerMatch = players.find(player => player !== userMatch);
                                if (partnerMatch) {
                                    divPartnersMap[divName] = (partnerMatch.Name || partnerMatch.FullName || '').trim();
                                }
                                return true;
                            }
                            return false;
                        });

                        if (isMatch && !regDivs.some((d) => divisionsMatch(d, divName))) {
                            regDivs.push(divName);
                        }
                    }));
                } catch (e) {
                    console.error("Registration check failed:", e);
                } finally {
                    setIsCheckingReg(false);
                }
            }

            const allRegDivs = Array.from(new Set([...paidDivs, ...regDivs])).filter(Boolean);
            setRegisteredDivisions(allRegDivs);
            setIsRegistered(allRegDivs.length > 0);

            // Fetch profiles for any found partners
            const partnerNames = Object.values(divPartnersMap).filter(Boolean);
            if (partnerNames.length > 0) {
                const partnerResults = await Promise.all(
                    partnerNames.map((pName) => supabase.rpc('find_registration_partner', { p_name: pName, p_event_id: event?.id })),
                );
                const partnerProfiles = partnerResults.flatMap((r) => r.data || []);

                setDivisionPartners(prev => {
                    const next = { ...prev };
                    for (const [div, pName] of Object.entries(divPartnersMap)) {
                        const pProf = partnerProfiles?.find(p => p.name.toLowerCase() === pName.toLowerCase());
                        if (!next[div]?.partnerProfile && !next[div]?.partnerName) {
                            next[div] = {
                                ...next[div],
                                hasPartner: true,
                                partnerName: pProf ? pProf.name : pName,
                                partnerProfile: pProf || null,
                                payForPartner: false,
                                partnerLicenseChoice: coerceLicenseChoice('temporary', commerce, eventLicenseOpts) || 'temporary'
                            };
                        }
                    }
                    setInitialPartners(next);
                    return next;
                });
            }

            // Auto-select all unpaid registered divisions
            const unpaidRegDivs = Array.from(new Set(regDivs)).filter((d) => !isDivPaid(d));
            if (unpaidRegDivs.length > 0) {
                setSelectedDivisions(unpaidRegDivs);
            }
        };
        checkStatus();
    }, [event?.id, formData.email, loggedInPlayer, getTournamentParticipants, getTournamentPlayerTabs]);

    // Debounced email lookup
    useEffect(() => {
        const checkEmail = async () => {
            if (!formData.email || formData.email.length < 5 || !formData.email.includes('@') || !event?.id) {
                setEmailCheckStatus('idle');
                setPlayerProfileData(null);
                return;
            }
            setEmailCheckStatus('checking');
            try {
                const { data: rows } = await supabase
                    .rpc('find_registration_partner', { p_email: formData.email.trim(), p_event_id: event?.id });
                const data = Array.isArray(rows) ? rows[0] : rows;

                if (data) {
                    if (data.license_type === 'temporary') {
                        // Check if they have a temporary license for THIS specific event
                        const { data: tempLic } = await supabase
                            .from('temporary_licenses')
                            .select('id')
                            .eq('player_id', data.id)
                            .eq('event_id', event.id)
                            .maybeSingle();

                        if (!tempLic) {
                            // No temporary license for this event, override paid_registration to false
                            data.paid_registration = false;
                        }
                    }
                    setPlayerProfileData(data);
                    setEmailCheckStatus('found');
                } else {
                    setPlayerProfileData(null);
                    setEmailCheckStatus('not_found');
                }
            } catch (err) {
                console.error("Email lookup error:", err);
                setEmailCheckStatus('idle');
            }
        };

        const timeoutId = setTimeout(checkEmail, 400); // 400ms debounce
        return () => clearTimeout(timeoutId);
    }, [formData.email, event?.id]);

    const [playlistVideos, setPlaylistVideos] = useState([]);
    const [fetchingVideos, setFetchingVideos] = useState(false);
    const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

    useEffect(() => {
        const fetchPlaylistItems = async () => {
            if (!event?.youtube_playlist_url) return;

            const match = event.youtube_playlist_url.match(/[&?]list=([^&]+)/);
            const playlistId = match ? match[1] : null;
            if (!playlistId) return;

            setFetchingVideos(true);
            try {
                const response = await fetch(
                    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=12&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}`
                );
                const data = await response.json();
                if (data.items) {
                    setPlaylistVideos(data.items
                        .filter(item =>
                            item.snippet.title !== 'Deleted video' &&
                            item.snippet.title !== 'Private video'
                        )
                        .map(item => ({
                            id: item.snippet.resourceId.videoId,
                            title: item.snippet.title,
                            thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                            publishedAt: item.snippet.publishedAt
                        }))
                    );
                } else if (data.error) {
                    console.error('YouTube API Error:', data.error.message);
                }
            } catch (error) {
                console.error('Error fetching playlist videos:', error);
            } finally {
                setFetchingVideos(false);
            }
        };

        fetchPlaylistItems();
    }, [event?.youtube_playlist_url]);

    useEffect(() => {
        const fetchEventDetails = async () => {
            try {
                let query = supabase
                    .from('calendar')
                    .select('*');

                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug);
                const isNumeric = /^\d+$/.test(slug);

                if (isNumeric) {
                    query = query.eq('id', slug);
                } else if (isUuid) {
                    query = query.eq('id', slug);
                } else {
                    query = query.eq('slug', slug);
                }

                // Hide unsanctioned org events from the public event page
                query = query.or('sanction_status.eq.approved,sanction_status.is.null');

                const { data, error } = await query.maybeSingle();
                if (error) throw error;
                if (!data) {
                    setEvent(null);
                    return;
                }

                // Hidden events are excluded from calendar listings, but manual events
                // must stay reachable via direct link so players can register and pay.
                if (data.is_visible === false && !data.is_manual) {
                    const { data: { session } } = await supabase.auth.getSession();
                    const impersonationEmail = sessionStorage.getItem('admin_test_login_email');
                    const viewerEmail = impersonationEmail || session?.user?.email;
                    const canPreview = await canAccessHiddenEvents(viewerEmail);
                    if (!canPreview) {
                        setEvent(null);
                        return;
                    }
                }

                setEvent(data);
            } catch (error) {
                console.error('Error fetching event details:', error);
                setEvent(null);
            } finally {
                setLoading(false);
            }
        };

        setLoading(true);
        fetchEventDetails();
    }, [slug, manualUserEmail]);

    useEffect(() => {
        const classHasPublishedDraw = (c) =>
            Boolean(
                (c?.IsPublished || c?.ShowDraws) &&
                Array.isArray(c?.TournamentDraws) &&
                c.TournamentDraws.length > 0
            );

        const checkRankedinStatus = async () => {
            if (!event) return;
            const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);

            if (rId) {
                setFetchingRankedinData(true);
                try {
                    // 1. Check DB Cache first — apply draw/results flags immediately so the Draws
                    // tab does not flash "Coming Soon" while slower Rankedin calls run.
                    const { data: cacheRow } = await supabase
                        .from('rankedin_results_cache')
                        .select('*')
                        .eq('event_id', event.id)
                        .maybeSingle();

                    if (cacheRow?.has_draw) {
                        setHasDraw(true);
                        if (Array.isArray(cacheRow.classes) && cacheRow.classes.length > 0) {
                            setTournamentClasses(cacheRow.classes);
                        }
                    }
                    if (cacheRow?.has_results) {
                        setHasResults(true);
                        if (Array.isArray(cacheRow.winners)) setWinners(cacheRow.winners);
                    }
                    if (Array.isArray(cacheRow?.upcoming_matches) && cacheRow.upcoming_matches.length > 0) {
                        setUpcomingMatches(cacheRow.upcoming_matches);
                    }

                    // Registration status (non-blocking for draws — failures must not hide draws)
                    if (isEventPassed) {
                        setIsRankedinRegistrationClosed(true);
                    } else {
                        try {
                            const info = await getTournamentInfo(rId);
                            if (info?.TournamentSidebarModel?.ClosingDate) {
                                const closingDate = new Date(info.TournamentSidebarModel.ClosingDate);
                                setIsRankedinRegistrationClosed(closingDate < new Date());
                            }
                        } catch (infoErr) {
                            console.warn('Rankedin registration info unavailable:', infoErr);
                        }
                    }

                    const isPassed = new Date(event.end_date || event.start_date) < new Date();
                    const MIN_SYNC_DATE = new Date('2026-04-02T08:50:00Z');

                    let useCache = false;
                    if (cacheRow) {
                        const lastSynced = new Date(cacheRow.last_synced_at);
                        const isCacheValid = lastSynced >= MIN_SYNC_DATE;

                        if (isPassed) {
                            useCache = isCacheValid;
                        } else {
                            const diffHrs = Math.abs(Date.now() - lastSynced.getTime()) / 36e5;
                            if (diffHrs < (2 / 60) && isCacheValid) {
                                useCache = true;
                            }
                        }
                    }

                    if (useCache && cacheRow) {
                        const winnersArray = Array.isArray(cacheRow.winners) ? cacheRow.winners : [];
                        const hasPending = winnersArray.some(w => {
                            const wStr = JSON.stringify(w).toLowerCase();
                            return wStr.includes('pending') || wStr.includes('null');
                        });
                        const isEmpty = winnersArray.length === 0;
                        const diffHrs = Math.abs(Date.now() - new Date(cacheRow.last_synced_at).getTime()) / 36e5;

                        // Only invalidate empty winners for finished events — `isPassed` already
                        // protects upcoming tournaments (which often have a published draw with
                        // zero winners) from having that state wiped. A published draw on a
                        // *finished* event is exactly the case where results are expected but
                        // haven't synced yet, so `has_draw` must not block a re-fetch here —
                        // otherwise a stale empty `winners: []` cache never gets retried once a
                        // draw exists, and results silently never pull through.
                        if (hasPending || (isPassed && isEmpty && diffHrs > 2)) {
                            useCache = false;
                            console.log('Cache invalidated because winners are empty/pending and cache is stale');
                        }
                    }

                    if (useCache && cacheRow) {
                        setTournamentClasses(cacheRow.classes || []);
                        setWinners(cacheRow.winners || []);
                        setHasDraw(Boolean(cacheRow.has_draw));
                        setHasResults(Boolean(cacheRow.has_results));
                        setUpcomingMatches(cacheRow.upcoming_matches || []);
                    } else {
                        // 2. Fetch from Live API
                        const classes = await getTournamentClasses(rId);
                        const classesList = Array.isArray(classes) ? classes : [];
                        let drawAvailable = classesList.some(classHasPublishedDraw);
                        let apiWinners = [];
                        let apiHasResults = false;
                        let apiUpcomingMatches = [];

                        if (classesList.length > 0) {
                            setTournamentClasses(classesList);
                            setHasDraw(drawAvailable);
                        } else if (cacheRow?.has_draw) {
                            // Empty/failed classes fetch must not hide a known published draw
                            drawAvailable = true;
                            setHasDraw(true);
                            if (Array.isArray(cacheRow.classes) && cacheRow.classes.length > 0) {
                                setTournamentClasses(cacheRow.classes);
                            }
                        } else {
                            setHasDraw(false);
                        }

                        const tournamentWinners = await getTournamentWinners(rId);
                        if (tournamentWinners && tournamentWinners.length > 0) {
                            apiWinners = tournamentWinners;
                            setWinners(tournamentWinners);
                            apiHasResults = true;
                            setHasResults(true);
                        } else {
                            const tournamentMatchesCompleted = await getTournamentMatches({ tournamentId: rId, isFinished: true });
                            if (tournamentMatchesCompleted && tournamentMatchesCompleted.length > 0) {
                                apiHasResults = true;
                                setHasResults(true);
                            } else if (cacheRow?.has_results) {
                                apiHasResults = true;
                                setHasResults(true);
                            }
                        }

                        if (!isPassed) {
                            const matchesPreview = await getTournamentMatches({ tournamentId: rId, isFinished: false });
                            if (matchesPreview && matchesPreview.length > 0) {
                                apiUpcomingMatches = matchesPreview.slice(0, 15);
                                setUpcomingMatches(apiUpcomingMatches);
                            }
                        }

                        // Never poison cache with has_draw:false when the live classes payload was empty
                        const classesToStore = classesList.length > 0
                            ? classesList
                            : (cacheRow?.classes || []);
                        const hasDrawToStore = classesList.length > 0
                            ? drawAvailable
                            : Boolean(cacheRow?.has_draw);

                        console.log("Upserting Rankedin Cache to Database...");
                        await supabase
                            .from('rankedin_results_cache')
                            .upsert({
                                event_id: event.id,
                                rankedin_id: rId.toString(),
                                classes: classesToStore,
                                winners: apiWinners.length > 0 ? apiWinners : (cacheRow?.winners || []),
                                has_draw: hasDrawToStore,
                                has_results: apiHasResults || Boolean(cacheRow?.has_results),
                                upcoming_matches: apiUpcomingMatches.length > 0
                                    ? apiUpcomingMatches
                                    : (cacheRow?.upcoming_matches || []),
                                last_synced_at: new Date().toISOString()
                            }, { onConflict: 'event_id' })
                            .select();
                    }
                } catch (err) {
                    console.error("Error fetching rankedin detailed data:", err);
                } finally {
                    setFetchingRankedinData(false);
                }
            } else if (event.slug) {
                setHasDraw(false);
                setHasResults(false);
            }
        };
        checkRankedinStatus();
    }, [event, getTournamentClasses, getTournamentWinners, getTournamentMatches, getTournamentInfo, isEventPassed]);

    useEffect(() => {
        const fetchParticipantsData = async () => {
            if (!event) return;

            setFetchingParticipants(true);
            try {
                let divisions = [];
                let participantsMap = {};

                // Manual events: divisions come only from tournament_divisions (never RankedIn).
                // Weekly socials have no divisions — one flat entries list.
                if (event.is_manual && event.is_weekly) {
                    const weeklyDiv = { Id: 'weekly_entries', Name: 'Entries' };
                    divisions = [weeklyDiv];
                    participantsMap[weeklyDiv.Id] = [];

                    const { data: localRegs } = await supabase
                        .from('event_registrations_public')
                        .select('id, full_name, partner_name, payment_status, email_hash, partner_email_hash, registered_by_hash, created_at')
                        .eq('event_id', event.id)
                        .order('created_at', { ascending: true });

                    const activeEmails = new Set(
                        (localRegs || [])
                            .map((r) => (r.email_hash || '').toLowerCase())
                            .filter(Boolean),
                    );
                    const seenEmails = new Set();

                    (localRegs || []).forEach((reg) => {
                        const emailKey = (reg.email_hash || '').toLowerCase();
                        if (emailKey && seenEmails.has(emailKey)) return;
                        if (emailKey) seenEmails.add(emailKey);

                        const partnerEmail = (reg.partner_email_hash || '').toLowerCase();
                        // Skip pure partner-mirror rows when the partner already registered as primary
                        if (
                            partnerEmail
                            && activeEmails.has(partnerEmail)
                            && (reg.registered_by_hash || '').toLowerCase() === partnerEmail
                        ) {
                            return;
                        }
                        if (partnerEmail) seenEmails.add(partnerEmail);

                        const players = [{ Name: reg.full_name, Email: null }];
                        // Weekly: always show a named partner (including unpaid reserve flow).
                        if (reg.partner_name?.trim()) {
                            if (!players.some((p) => (p.Name || '').toLowerCase() === (reg.partner_name || '').toLowerCase())) {
                                players.push({ Name: reg.partner_name, Email: null });
                            }
                        }

                        participantsMap[weeklyDiv.Id].push({
                            Participant: {
                                Id: `local_${reg.id}`,
                                Name: players.length > 1
                                    ? `${reg.full_name} / ${reg.partner_name}`
                                    : reg.full_name,
                                Players: players,
                            },
                            _paymentStatus: reg.payment_status,
                        });
                    });

                    setPlayerDivisions(divisions);
                    setParticipants(participantsMap);
                } else if (event.is_manual) {
                    const { data: manualDivs } = await supabase
                        .from('tournament_divisions')
                        .select('*')
                        .eq('event_id', event.id)
                        .eq('is_active', true)
                        .order('sort_order', { ascending: true });

                    divisions = (manualDivs || []).map((d) => ({
                        Id: d.id,
                        Name: d.name,
                        EntryFee: resolveDivisionEntryFee(d, event),
                        StandardEntryFee: Number(d.entry_fee || 0),
                    }));

                    const { data: localRegs } = await supabase
                        .from('event_registrations_public')
                        .select('id, full_name, partner_name, division, division_id, payment_status, email_hash, partner_email_hash')
                        .eq('event_id', event.id);

                    const activeEmailsByDiv = new Map();
                    (localRegs || []).forEach((reg) => {
                        const div = divisions.find((d) => d.Name.toLowerCase() === (reg.division || '').toLowerCase())
                            || (reg.division_id ? divisions.find((d) => d.Id === reg.division_id) : null);
                        if (!div) return;
                        if (!activeEmailsByDiv.has(div.Id)) activeEmailsByDiv.set(div.Id, new Set());
                        if (reg.email_hash) activeEmailsByDiv.get(div.Id).add(reg.email_hash.toLowerCase());
                    });

                    (localRegs || []).forEach((reg) => {
                        const div = divisions.find((d) => d.Name.toLowerCase() === (reg.division || '').toLowerCase())
                            || (reg.division_id ? divisions.find((d) => d.Id === reg.division_id) : null);
                        if (!div) return;
                        if (!participantsMap[div.Id]) participantsMap[div.Id] = [];

                        const existing = participantsMap[div.Id].some((item) => {
                            const p = item.Participant || {};
                            const names = [];
                            if (p.Players) p.Players.forEach((pl) => names.push((pl.Name || '').toLowerCase()));
                            if (p.FirstPlayer?.Name) names.push(p.FirstPlayer.Name.toLowerCase());
                            if (p.SecondPlayer?.Name) names.push(p.SecondPlayer.Name.toLowerCase());
                            return names.includes((reg.full_name || '').toLowerCase());
                        });

                        if (!existing) {
                            const activeEmails = activeEmailsByDiv.get(div.Id) || new Set();
                            const players = [{ Name: reg.full_name, Email: null }];
                            const partnerEmail = (reg.partner_email_hash || '').toLowerCase();
                            if (reg.partner_name && (!partnerEmail || activeEmails.has(partnerEmail))) {
                                players.push({ Name: reg.partner_name, Email: null });
                            }
                            participantsMap[div.Id].push({
                                Participant: {
                                    Id: `local_${reg.id}`,
                                    Name: players.length > 1
                                        ? `${reg.full_name} / ${reg.partner_name}`
                                        : reg.full_name,
                                    Players: players,
                                },
                            });
                        }
                    });

                    divisions.forEach((d) => {
                        if (!participantsMap[d.Id]) participantsMap[d.Id] = [];
                    });

                    setPlayerDivisions(divisions);
                    setParticipants(participantsMap);
                } else {
                    const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);

                    // 1. Fetch from Rankedin if rId exists
                    if (rId) {
                        if (divisions.length === 0) {
                            const fetchedDivs = await getTournamentPlayerTabs(rId);
                            if (fetchedDivs) divisions = fetchedDivs;
                        }
                        if (divisions.length > 0) {
                            for (const cls of divisions) {
                                const data = await getTournamentParticipants(rId, cls.Id);
                                participantsMap[cls.Id] = data || [];
                            }
                        }
                    }

                    // 2. Fetch from local event_registrations
                    const { data: localRegs } = await supabase
                        .from('event_registrations_public')
                        .select('id, full_name, partner_name, division, payment_status, status')
                        .eq('event_id', event.id);

                    if (localRegs && localRegs.length > 0) {
                        localRegs.forEach(reg => {
                            if (reg.status === 'withdrawn' || reg.payment_status !== 'paid') {
                                return;
                            }

                            // Find division by name, case-insensitive
                            let div = divisions.find(d => d.Name.toLowerCase() === reg.division.toLowerCase());

                            // If it's a Rankedin event, only accept divisions that exist on Rankedin. 
                            // If it's a local-only event (!rId), allow creating new divisions from registrations.
                            if (!div && !rId) {
                                div = { Id: `local_${reg.division.replace(/\s+/g, '_')}`, Name: reg.division };
                                divisions.push(div);
                            }

                            if (div) {
                                if (!participantsMap[div.Id]) {
                                    participantsMap[div.Id] = [];
                                }

                                // Check if this player is already in the Rankedin list for this division
                                const existingInRankedin = participantsMap[div.Id].some(item => {
                                    const p = item.Participant || {};
                                    const pNames = [];
                                    if (p.Players) p.Players.forEach(pl => pNames.push((pl.Name || '').toLowerCase()));
                                    if (p.FirstPlayer) pNames.push((p.FirstPlayer.Name || '').toLowerCase());
                                    if (p.SecondPlayer) pNames.push((p.SecondPlayer.Name || '').toLowerCase());
                                    return pNames.includes((reg.full_name || '').toLowerCase());
                                });

                                if (!existingInRankedin) {
                                    const players = [{ Name: reg.full_name, Email: null }];
                                    if (reg.partner_name) {
                                        players.push({ Name: reg.partner_name });
                                    }

                                    participantsMap[div.Id].push({
                                        Participant: {
                                            Id: `local_${reg.id}`,
                                            Name: reg.partner_name ? `${reg.full_name} / ${reg.partner_name}` : reg.full_name,
                                            Players: players
                                        }
                                    });
                                }
                            }
                        });
                    }

                    setPlayerDivisions(divisions);
                    setParticipants(prev => ({ ...prev, ...participantsMap }));
                }

                // Gather all player names and Rankedin IDs for bulk database query
                const names = new Set();
                const rankedInIds = new Set();

                Object.values(participantsMap).forEach(classParticipants => {
                    if (!classParticipants) return;
                    classParticipants.forEach(item => {
                        const p = item.Participant || {};
                        if (p.Players && p.Players.length > 0) {
                            p.Players.forEach(player => {
                                if (player.Name) names.add(player.Name);
                                if (player.RankedinId) rankedInIds.add(player.RankedinId.toString());
                                if (player.Id) rankedInIds.add(player.Id.toString());
                            });
                        }
                        if (p.FirstPlayer) {
                            if (p.FirstPlayer.Name) names.add(p.FirstPlayer.Name);
                            if (p.FirstPlayer.RankedinId) rankedInIds.add(p.FirstPlayer.RankedinId.toString());
                            if (p.FirstPlayer.Id) rankedInIds.add(p.FirstPlayer.Id.toString());
                        }
                        if (p.SecondPlayer) {
                            if (p.SecondPlayer.Name) names.add(p.SecondPlayer.Name);
                            if (p.SecondPlayer.RankedinId) rankedInIds.add(p.SecondPlayer.RankedinId.toString());
                            if (p.SecondPlayer.Id) rankedInIds.add(p.SecondPlayer.Id.toString());
                        }
                    });
                });

                const namesArray = Array.from(names);
                const idsArray = Array.from(rankedInIds);

                if (namesArray.length > 0 || idsArray.length > 0) {
                    // Query the Supabase players table for profile photos
                    const query = supabase.from('players_public').select('name, image_url, rankedin_id');

                    const filters = [];
                    if (namesArray.length > 0) {
                        filters.push(`name.in.(${namesArray.map(n => `"${n.replace(/"/g, '""')}"`).join(',')})`);
                    }
                    if (idsArray.length > 0) {
                        filters.push(`rankedin_id.in.(${idsArray.join(',')})`);
                    }

                    const { data: dbPlayers, error } = await query.or(filters.join(','));

                    if (!error && dbPlayers) {
                        const playerMap = {};
                        dbPlayers.forEach(player => {
                            if (!player.image_url) return;
                            if (player.rankedin_id) {
                                playerMap[player.rankedin_id.toString()] = player.image_url;
                            }
                            if (player.name) {
                                const key = player.name.toLowerCase().trim();
                                playerMap[key] = player.image_url;
                                playerMap[player.name.toLowerCase()] = player.image_url;
                            }
                        });
                        setFourMPlayers(playerMap);
                    }
                }
            } catch (err) {
                console.error("Error fetching participants:", err);
            } finally {
                setFetchingParticipants(false);
            }
        };

        fetchParticipantsData();
    }, [event, getTournamentParticipants, getTournamentPlayerTabs, participantsRefreshKey]);

    useEffect(() => {
        const fetchFourMPlayers = async () => {
            try {
                const data = await fetchAllRows(() => supabase
                    .from('players_public')
                    .select('name, rankedin_id, image_url')
                    .not('image_url', 'is', null)
                    .order('id', { ascending: true }));

                if (data) {
                    const lookup = {};
                    data.forEach(p => {
                        if (p.rankedin_id) lookup[p.rankedin_id] = p.image_url;
                        if (p.name) lookup[p.name.toLowerCase()] = p.image_url;
                    });
                    setFourMPlayers(lookup);
                }
            } catch (err) {
                console.error("Error fetching 4M players:", err);
            }
        };
        fetchFourMPlayers();
    }, []);

    // Local players table already stores each player's synced ranking breakdown
    // (per-org/gender/age-group, with the Best-8 points total) — used for manual
    // event seeding instead of a live RankedIn API call, since name-matching against
    // a live top-2000 list can silently miss players who are still ranked but just
    // outside that window or fetched at a different moment.
    useEffect(() => {
        const fetchPlayerRankings = async () => {
            try {
                let allData = [];
                let page = 0;
                const pageSize = 1000;
                let hasMore = true;

                while (hasMore) {
                    const { data, error } = await supabase
                        .from('players_public')
                        .select('name, rankedin_id, rankings, points')
                        .range(page * pageSize, (page + 1) * pageSize - 1);

                    if (error) {
                        console.error("Error fetching player rankings page:", error);
                        break;
                    }
                    
                    if (data) {
                        allData = [...allData, ...data];
                        if (data.length < pageSize) hasMore = false;
                        else page++;
                    } else {
                        hasMore = false;
                    }
                }

                const lookup = {};
                allData.forEach(p => {
                    const payload = { rankings: p.rankings || [], points: p.points || 0 };
                    if (p.rankedin_id) lookup[p.rankedin_id.toString()] = payload;
                    if (p.name) lookup[p.name.toLowerCase().trim()] = payload;
                });
                setPlayerRankingsMap(lookup);
            } catch (err) {
                console.error("Error fetching player rankings:", err);
            }
        };
        fetchPlayerRankings();
    }, []);

    useEffect(() => {
        const fetchGlobalRankings = async () => {
            try {
                // Fetch SAPA Men & Women rankings (federation Rankedin ID, SAPA fallback)
                const men = await getOrganisationRankings(3, 82, 2000);
                const women = await getOrganisationRankings(4, 83, 2000);
                const map = new Map();
                if (men) men.forEach(r => { if (r.Name) map.set(r.Name.toLowerCase(), r.Standing); });
                if (women) women.forEach(r => { if (r.Name) map.set(r.Name.toLowerCase(), r.Standing); });
                setGlobalRankings(map);
            } catch (err) {
                console.error("Error fetching global rankings:", err);
            }
        };
        fetchGlobalRankings();
    }, [getOrganisationRankings]);

    useEffect(() => {
        const fetchAlbumPhotos = async () => {
            if (!event) return;

            // Check if there's an album linked to this event in our DB
            try {
                const { data: albumsData, error: albumError } = await supabase
                    .from('albums')
                    .select('id, title, description, slug')
                    .eq('event_id', event.id)
                    .is('parent_album_id', null)
                    .limit(1);

                if (!albumError && albumsData && albumsData.length > 0) {
                    const albumData = albumsData[0];
                    setAlbumInfo(albumData);
                    const { data: images, error: imageError } = await supabase
                        .from('gallery_images')
                        .select('image_url, thumbnail_url, id')
                        .eq('album_id', albumData.id)
                        .order('sort_order', { ascending: true });

                    if (images && !imageError) {
                        setAlbumPhotos(images);
                    }
                }
            } catch (err) {
                console.error("Error fetching event album:", err);
            }
        };
        fetchAlbumPhotos();
    }, [event]);

    useEffect(() => {
        const fetchWeather = async () => {
            if (!event || (!event.city && !event.venue)) return;

            try {
                // 1. Get coordinates for city
                const searchLocation = event.city || event.venue;
                const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchLocation)}&count=1&language=en&format=json`);
                const geoData = await geoRes.json();

                if (!geoData.results || geoData.results.length === 0) return;
                const { latitude, longitude } = geoData.results[0];

                // 2. Get forecast
                const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=auto`);
                const weatherData = await weatherRes.json();

                if (!weatherData.daily) return;

                // 3. Find specific day or use first day
                let targetIndex = 0;
                if (event.start_date) {
                    const eventDate = event.start_date.substring(0, 10);
                    const foundIndex = weatherData.daily.time.findIndex(t => t === eventDate);
                    if (foundIndex !== -1) targetIndex = foundIndex;
                }

                // Map WMO Weather Codes
                const code = weatherData.daily.weather_code[targetIndex];
                let condition = "Sunny";
                let iconType = "sun";

                if (code === 0 || code === 1) { condition = "Clear"; iconType = "sun"; }
                else if (code === 2) { condition = "Partly Cloudy"; iconType = "cloud"; }
                else if (code === 3) { condition = "Overcast"; iconType = "cloud"; }
                else if (code >= 45 && code <= 48) { condition = "Fog"; iconType = "cloud"; }
                else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) { condition = "Rain"; iconType = "rain"; }
                else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { condition = "Snow"; iconType = "snow"; }
                else if (code >= 95) { condition = "Thunderstorm"; iconType = "thunder"; }

                setWeather({
                    temp: weatherData.daily.temperature_2m_max[targetIndex],
                    precip: weatherData.daily.precipitation_probability_max[targetIndex],
                    condition,
                    iconType
                });

            } catch (err) {
                console.error("Error fetching weather:", err);
            }
        };

        fetchWeather();
    }, [event]);

    const getEntryFeeForCategory = (category) => {
        if (!event?.allow_payments) return 0;

        if (event?.category_fees && event.category_fees[category] !== undefined) {
            return Number(event.category_fees[category]);
        }
        return Number(event?.entry_fee || 0);
    };

    const calculateTotalAmount = () => {
        if (!event?.allow_payments) return 0;

        let entryFeesTotal = 0;
        let partnerTotal = 0;

        selectedDivisions.forEach(div => {
            entryFeesTotal += entryCharge(getEntryFeeForCategory(div));

            const pState = divisionPartners[div];
            if (pState && pState.partnerProfile && pState.payForPartner) {
                partnerTotal += entryCharge(getEntryFeeForCategory(div));
                if (!pState.partnerProfile.paid_registration && pState.payForPartnerLicense && licenseSalesOpen) {
                    partnerTotal += licenseCharge(pState.partnerLicenseChoice);
                }
            }
        });

        let total = entryFeesTotal + partnerTotal;

        if (playerProfileData && !playerProfileData.paid_registration && licenseSalesOpen) {
            total += licenseCharge(licenseChoice);
        }

        return total;
    };



    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePartnerSearchForDivision = (division, name) => {
        if (searchTimeout) clearTimeout(searchTimeout);

        setDivisionPartners(prev => {
            const current = prev[division] || {};
            return {
                ...prev,
                [division]: {
                    ...current,
                    partnerName: name,
                    partnerProfile: null,
                    partnerLookupError: null,
                    payForPartner: false,
                    partnerSearchResults: []
                }
            };
        });

        if (!name || name.length < 2) return;

        const timeout = setTimeout(async () => {
            setDivisionPartners(prev => ({ ...prev, [division]: { ...prev[division], isLookingUpPartner: true } }));
            try {
                let enrichedData = [];

                if (event?.is_manual) {
                    const { data } = await supabase
                        .rpc('find_registration_partner', { p_name_partial: name.trim(), p_event_id: event?.id });

                    if (data && data.length > 0) {
                        enrichedData = data.map(player => ({
                            ...player,
                            paid_registration: player.license_type === 'temporary'
                                ? (player.has_temp_license_for_event ? player.paid_registration : false)
                                : player.paid_registration,
                        })).filter(p => p.id !== playerProfileData?.id);
                    }
                } else {
                    // RankedIn event: search tournament_participants registered for this event, in this division
                    const { data: participants } = await supabase
                        .rpc('search_tournament_participants_for_partner', {
                            p_event_id: event.id, p_class_name: division.trim(), p_query: name.trim(),
                        });

                    if (participants && participants.length > 0) {
                        const profileIds = participants.map(p => p.profile_id).filter(Boolean);
                        let playersMap = new Map();

                        if (profileIds.length > 0) {
                            const { data: players } = await supabase
                                .rpc('find_registration_partner', { p_ids: profileIds, p_event_id: event?.id });

                            if (players) {
                                players.forEach(p => playersMap.set(p.id, p));
                            }
                        }

                        enrichedData = participants.map(p => {
                            const playerProfile = p.profile_id ? playersMap.get(p.profile_id) : null;
                            if (playerProfile) {
                                if (playerProfile.license_type === 'temporary') {
                                    return { ...playerProfile, paid_registration: playerProfile.has_temp_license_for_event ? playerProfile.paid_registration : false };
                                }
                                return playerProfile;
                            }
                            return {
                                id: `temp-${p.email || p.full_name || Math.random().toString()}`,
                                name: p.full_name,
                                email: p.email || '',
                                paid_registration: false,
                                license_type: 'temporary',
                                category: p.class_name
                            };
                        }).filter(p => p.id !== playerProfileData?.id);
                    }
                }

                if (enrichedData.length > 0) {
                    setDivisionPartners(prev => ({
                        ...prev,
                        [division]: {
                            ...prev[division],
                            partnerSearchResults: enrichedData,
                            partnerLookupError: null,
                            isLookingUpPartner: false
                        }
                    }));
                } else {
                    const errorMsg = event?.is_manual
                        ? "Profile not found. Partner must register to be paid for."
                        : "Player not found. Partner must be registered for this division on RankedIn.";

                    setDivisionPartners(prev => ({
                        ...prev,
                        [division]: {
                            ...prev[division],
                            partnerSearchResults: [],
                            partnerLookupError: errorMsg,
                            isLookingUpPartner: false
                        }
                    }));
                }
            } catch (err) {
                setDivisionPartners(prev => ({ ...prev, [division]: { ...prev[division], isLookingUpPartner: false } }));
            }
        }, 500);
        setSearchTimeout(timeout);
    };

    const handleSelectPartnerForDivision = (division, player) => {
        setDivisionPartners(prev => ({
            ...prev,
            [division]: {
                ...prev[division],
                partnerProfile: player,
                partnerName: player.name,
                partnerSearchResults: [],
                partnerLookupError: null,
                partnerLicenseChoice: coerceLicenseChoice('temporary', commerce, eventLicenseOpts) || 'temporary'
            }
        }));
    };

    const handleSelectPartner = (player) => { };

    const finalizeRegistrationEmailsAndSync = async (isPaidStatus) => {
        // 1. Send Emails
        for (const division of selectedDivisions) {
            const part = divisionPartners[division] || {};
            const partnerName = part.partnerProfile ? part.partnerProfile.name : part.partnerName || 'TBD';
            const entryFee = getEntryFeeForCategory(division);
            const partnerEntryFee = (part.hasPartner && part.payForPartner && part.partnerProfile) ? entryFee : 0;

            try {
                sendEmail(formData.email.trim(), 'event_entry', {
                    eventId: event.id,
                    playerName: formData.full_name,
                    eventName: event.event_name,
                    division: division,
                    partnerName: partnerName,
                    amount: isPaidStatus ? `R ${(entryFee + partnerEntryFee).toFixed(2)}` : 'R 0.00'
                });
            } catch (err) { console.error(err); }

            if (part.hasPartner && part.partnerProfile?.email) {
                try {
                    sendEmail(part.partnerProfile.email.trim(), 'event_entry', {
                        eventId: event.id,
                        playerName: part.partnerProfile.name,
                        eventName: event.event_name,
                        division: division,
                        partnerName: formData.full_name,
                        amount: isPaidStatus ? 'R 0.00 (Paid by Partner)' : 'R 0.00'
                    });
                } catch (err) { console.error(err); }
            }
        }

        // 2. Sync / Insert to tournament_participants
        const insertParticipant = async (pEmail, pName, targetDivs, overrideIsPaid = isPaidStatus) => {
            let pId = null;
            let finalEmail = pEmail;

            if (pEmail) {
                const { data: pRows } = await supabase.rpc('find_registration_partner', { p_email: pEmail });
                const pData = pRows?.[0];
                if (pData) {
                    pId = pData.id;
                    finalEmail = pData.email;
                }
            } else if (pName) {
                const { data: pRows } = await supabase.rpc('find_registration_partner', { p_name: pName });
                const pData = pRows?.[0];
                if (pData) {
                    pId = pData.id;
                    finalEmail = pData.email;
                }
            }

            for (const div of targetDivs) {
                await supabase.rpc('upsert_tournament_participant', {
                    p_event_id: event.id,
                    p_full_name: pName,
                    p_email: finalEmail || null,
                    p_class_name: div,
                    p_profile_id: pId,
                    p_is_paid: overrideIsPaid,
                });
            }
        };

        await insertParticipant(formData.email, formData.full_name, selectedDivisions);

        for (const div of selectedDivisions) {
            const part = divisionPartners[div];
            if (part?.hasPartner) {
                // Partner is only marked as paid if the main user successfully paid AND explicitly chose to pay for the partner
                const partnerPaidStatus = isPaidStatus && part.payForPartner === true;

                if (part.partnerProfile) {
                    await insertParticipant(part.partnerProfile.email, part.partnerProfile.name, [div], partnerPaidStatus);
                } else if (part.partnerName) {
                    await insertParticipant(null, part.partnerName, [div], partnerPaidStatus);
                }
            }
        }
    };

    const handleRegisterOnly = async () => {
        if (!formData.full_name.trim() || !formData.email.trim()) {
            toast.error('Please fill in your name and email.');
            return;
        }

        if (emailCheckStatus === 'not_found') {
            toast.error('Profile not found. Please create a profile first.');
            return;
        }

        const hasUnpaidSelections = selectedDivisions.some((div) => !paidDivisions.some((pd) => divisionsMatch(pd, div)));
        if (!hasUnpaidSelections) {
            toast.error('You have already registered for these divisions!');
            return;
        }

        setIsCheckingReg(true);
        toast.info("Recording your registration...");

        try {
            const registrationsToUpsert = [];
            selectedDivisions.forEach(division => {
                const partnerState = divisionPartners[division] || {};

                registrationsToUpsert.push({
                    event_id: event.id,
                    full_name: formData.full_name,
                    email: formData.email,
                    phone: formData.phone,
                    partner_name: partnerState.partnerName || null,
                    division: division,
                    payment_status: 'pending',
                    is_test: isTestMode
                });

                if (partnerState.payForPartner && partnerState.partnerProfile) {
                    registrationsToUpsert.push({
                        event_id: event.id,
                        full_name: partnerState.partnerProfile.name,
                        email: partnerState.partnerProfile.email,
                        partner_name: formData.full_name,
                        division: division,
                        payment_status: 'pending',
                        is_test: isTestMode
                    });
                }
            });

            const uniqueRegistrations = Array.from(new Map(registrationsToUpsert.map(r => [`${r.email.toLowerCase()}_${r.division}`, r])).values());

            // Avoid constraint issues by manually deleting pending entries first
            for (const reg of uniqueRegistrations) {
                await supabase.from('event_registrations')
                    .delete()
                    .eq('event_id', reg.event_id)
                    .ilike('email', reg.email)
                    .eq('division', reg.division)
                    .eq('payment_status', 'pending');
            }

            const { error: regError } = await supabase.from('event_registrations').insert(uniqueRegistrations);

            if (regError) {
                console.error("Reg Error:", regError);
                toast.error(`Error saving registration: ${regError.message}`);
                return;
            }

            // Sync emails and participants
            await finalizeRegistrationEmailsAndSync(false);

            setRegStep(2);
            setIsRegistered(true);
            toast.success("Registration Successful!");
        } catch (err) {
            console.error("Registration Error:", err);
            toast.error(`Registration Error: ${err.message}`);
        } finally {
            setIsCheckingReg(false);
        }
    };

    const handlePayNow = async () => {
        // Validation
        if (!formData.full_name.trim() || !formData.email.trim()) {
            toast.error('Please fill in your name and email.');
            return;
        }

        if (emailCheckStatus === 'not_found') {
            toast.error('Profile not found. Please create a profile first.');
            return;
        }

        if (playerProfileData && !playerProfileData.paid_registration && !licenseSalesOpen) {
            toast.error('License sales are closed. You cannot enter this event until a license type is available.');
            return;
        }

        if (!PAYSTACK_PUBLIC_KEY.startsWith('pk_')) {
            toast.error('Payment system not configured. Please contact support.');
            return;
        }

        const [firstname, ...lastnameParts] = (formData.full_name || '').split(' ');
        const lastname = lastnameParts.join(' ');

        const paystackPop = new PaystackPop();

        await paystackPop.checkout({
            key: PAYSTACK_PUBLIC_KEY,
            reference: paymentReference || `REGEV-${event?.id}-${Date.now()}`,
            email: formData.email,
            firstname: firstname || '',
            lastname: lastname || '',
            amount: toPaystackAmount(calculateTotalAmount()),
            currency: 'ZAR',
            metadata: {
                event_id: event?.id,
                event_name: event?.event_name,
                full_name: formData.full_name,
                partner_name: formData.partner_name,
                partner_id: partnerProfile?.id,
                division: selectedDivisions.length > 0 ? selectedDivisions.join(', ') : formData.division,
                is_test: isTestMode,
                includes_license: playerProfileData && !playerProfileData.paid_registration && licenseSalesOpen,
                license_type: playerProfileData && !playerProfileData.paid_registration && licenseSalesOpen ? licenseChoice : null,
                paying_for_partner: hasPartner && payForPartner,
                partner_needs_license: hasPartner && payForPartner && partnerProfile && !partnerProfile.paid_registration && licenseSalesOpen,
                partner_license_type: hasPartner && payForPartner && partnerProfile && !partnerProfile.paid_registration && licenseSalesOpen ? partnerLicenseChoice : null
            },
            onSuccess: (ref) => handlePaymentSuccess(ref),
            onCancel: () => {
                console.log("Paystack payment cancelled.");
                toast.info('Payment cancelled.');
            }
        });
    };

    // End of pay/register handlers

    const getCalendarData = () => {
        if (!event) return null;

        const dateParts = event.start_date ? event.start_date.split('-') : [];
        let year = dateParts[0];
        let month = dateParts[1];
        let day = dateParts[2];

        if (!year) {
            const now = new Date();
            year = now.getFullYear();
            month = String(now.getMonth() + 1).padStart(2, '0');
            day = String(now.getDate()).padStart(2, '0');
        }

        let startHour = 9;
        let startMinute = 0;

        if (event.start_time) {
            const timeMatch = event.start_time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (timeMatch) {
                let h = parseInt(timeMatch[1], 10);
                startMinute = parseInt(timeMatch[2], 10);
                const ampm = timeMatch[3];
                if (ampm) {
                    if (ampm.toLowerCase() === 'pm' && h < 12) h += 12;
                    if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
                }
                startHour = h;
            }
        }

        const startDate = new Date(year, month - 1, day, startHour, startMinute);
        const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000)); // 2 hours default

        return {
            title: event.event_name,
            description: stripHtml(event.description || 'Padel Tournament Event'),
            location: `${event.venue}${event.address ? `, ${event.address}` : ''}`,
            start: startDate,
            end: endDate
        };
    };

    const handleGoogleCalendar = () => {
        const data = getCalendarData();
        if (!data) return;

        const formatGDate = (date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");
        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(data.title)}&dates=${formatGDate(data.start)}/${formatGDate(data.end)}&details=${encodeURIComponent(data.description)}&location=${encodeURIComponent(data.location)}`;
        window.open(url, '_blank');
        setIsCalendarMenuOpen(false);
    };

    const handleAppleCalendar = () => {
        const data = getCalendarData();
        if (!data) return;

        const formatDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//SAPA//Event Calendar//EN',
            'BEGIN:VEVENT',
            `UID:${event.id}@4mpadel.co.za`,
            `DTSTAMP:${formatDate(new Date())}`,
            `DTSTART:${formatDate(data.start)}`,
            `DTEND:${formatDate(data.end)}`,
            `SUMMARY:${data.title}`,
            `DESCRIPTION:${data.description}`,
            `LOCATION:${data.location}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${event.event_name.replace(/\s+/g, '_')}.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsCalendarMenuOpen(false);
    };

    const handleOutlookCalendar = () => {
        const data = getCalendarData();
        if (!data) return;

        const url = `https://outlook.office.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(data.title)}&startdt=${data.start.toISOString()}&enddt=${data.end.toISOString()}&body=${encodeURIComponent(data.description)}&location=${encodeURIComponent(data.location)}`;
        window.open(url, '_blank');
        setIsCalendarMenuOpen(false);
    };

    const handleMainCalendarClick = () => {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
        const isAndroid = /android/i.test(userAgent);

        if (isIOS) {
            handleAppleCalendar();
        } else if (isAndroid) {
            handleGoogleCalendar();
        } else {
            setIsCalendarMenuOpen(!isCalendarMenuOpen);
        }
    };
    const handlePaymentSuccess = async (reference) => {
        console.log("SUCCESS CALLBACK TRIGGERED. Reference:", reference);

        setRegStep(2);
        setIsPaid(true);
        setIsRegistered(true);
        toast.success("Payment Received! Recording your registration...");

        try {
            const paystackRef = typeof reference === 'string' ? reference : (reference?.reference || reference?.trxref || 'Unknown');

            const registrationsToUpsert = [];
            selectedDivisions.forEach(division => {
                const partnerState = divisionPartners[division] || {};

                registrationsToUpsert.push({
                    event_id: event.id,
                    full_name: formData.full_name,
                    email: formData.email,
                    phone: formData.phone,
                    partner_name: partnerState.partnerName || null,
                    division: division,
                    payment_status: 'paid',
                    is_test: isTestMode
                });

                if (partnerState.payForPartner && partnerState.partnerProfile) {
                    registrationsToUpsert.push({
                        event_id: event.id,
                        full_name: partnerState.partnerProfile.name,
                        email: partnerState.partnerProfile.email,
                        partner_name: formData.full_name,
                        division: division,
                        payment_status: 'paid',
                        is_test: isTestMode
                    });
                }
            });

            const uniqueRegistrations = Array.from(new Map(registrationsToUpsert.map(r => [`${r.email.toLowerCase()}_${r.division}`, r])).values());

            // Clear previous entries to avoid constraint clashes
            for (const reg of uniqueRegistrations) {
                await supabase.from('event_registrations')
                    .delete()
                    .eq('event_id', reg.event_id)
                    .ilike('email', reg.email)
                    .eq('division', reg.division);
            }

            const { error: regError } = await supabase.from('event_registrations').insert(uniqueRegistrations);

            if (regError) {
                console.error("Reg Error:", regError);
            }

            const { data: pRows } = await supabase.rpc('find_registration_partner', { p_email: formData.email });
            const playerId = pRows?.[0]?.id || null;

            const paymentsToInsert = [];
            selectedDivisions.forEach(division => {
                const fee = entryCharge(getEntryFeeForCategory(division));
                const partnerState = divisionPartners[division] || {};
                const partnerEntryFee = (partnerState.payForPartner && partnerState.partnerProfile) ? fee : 0;

                paymentsToInsert.push({
                    player_id: playerId,
                    event_id: event.id,
                    amount: fee + partnerEntryFee,
                    status: 'success',
                    payment_type: 'event_entry_fee',
                    payment_method: 'paystack',
                    reference: `REG-${paystackRef}-${division.replaceAll(' ', '_')}`,
                    is_test: isTestMode,
                    metadata: {
                        paystack_ref: paystackRef,
                        division: division,
                        line_items: [
                            { type: 'entry_fee', amount: fee, player: formData.full_name },
                            ...(partnerState.payForPartner ? [{ type: 'entry_fee', amount: fee, player: partnerState.partnerProfile.name }] : [])
                        ]
                    }
                });

                if (partnerState.payForPartner && partnerState.partnerProfile) {
                    paymentsToInsert.push({
                        player_id: partnerState.partnerProfile.id,
                        event_id: event.id,
                        amount: 0,
                        status: 'success',
                        payment_type: 'event_entry_fee',
                        payment_method: 'paystack',
                        reference: `REG-PARTNER-${paystackRef}-${division.replaceAll(' ', '_')}`,
                        is_test: isTestMode,
                        metadata: {
                            paystack_ref: paystackRef,
                            division: division,
                            paid_by_name: formData.full_name,
                            paid_by_id: playerId,
                            line_items: [{ type: 'entry_fee', amount: 0, player: partnerState.partnerProfile.name, paid_by: formData.full_name }]
                        }
                    });
                }
            });

            if (playerProfileData && !playerProfileData.paid_registration && licenseSalesOpen) {
                const isFull = licenseChoice === 'full';
                const licenseAmount = licenseCharge(licenseChoice);
                paymentsToInsert.push({
                    player_id: playerId,
                    event_id: event.id,
                    amount: licenseAmount,
                    status: 'success',
                    payment_type: isFull ? 'full_license' : 'temp_license',
                    payment_method: 'paystack',
                    reference: `License - ${formData.full_name}`,
                    is_test: isTestMode,
                    metadata: { paystack_ref: paystackRef, line_items: [{ type: isFull ? 'full_license' : 'temp_license', amount: licenseAmount, player: formData.full_name }] }
                });
            }

            selectedDivisions.forEach(division => {
                const partnerState = divisionPartners[division];
                if (partnerState?.payForPartner && partnerState?.partnerProfile && !partnerState.partnerProfile.paid_registration && partnerState.payForPartnerLicense && licenseSalesOpen) {
                    const isFull = partnerState.partnerLicenseChoice === 'full';
                    const licenseAmount = licenseCharge(partnerState.partnerLicenseChoice);
                    const existingLicensePayment = paymentsToInsert.find(p => p.player_id === partnerState.partnerProfile.id && (p.payment_type === 'full_license' || p.payment_type === 'temp_license'));

                    if (!existingLicensePayment) {
                        paymentsToInsert.push({
                            player_id: partnerState.partnerProfile.id,
                            event_id: event.id,
                            amount: licenseAmount,
                            status: 'success',
                            payment_type: isFull ? 'full_license' : 'temp_license',
                            payment_method: 'paystack',
                            reference: `License - ${partnerState.partnerProfile.name} (Paid by ${formData.full_name})`,
                            is_test: isTestMode,
                            metadata: { paystack_ref: paystackRef, paid_by_name: formData.full_name, paid_by_id: playerId, line_items: [{ type: isFull ? 'full_license' : 'temp_license', amount: licenseAmount, player: partnerState.partnerProfile.name, paid_by: formData.full_name }] }
                        });
                    }
                }
            });

            const { error: payError } = await supabase.from('payments').insert(paymentsToInsert);
            if (payError) {
                console.error("Payment Record Error:", payError);
            }

            // Apply licenses to players if paid
            const licensesToGrant = [];

            // Player License
            if (playerProfileData && !playerProfileData.paid_registration && licenseSalesOpen) {
                licensesToGrant.push({
                    playerId: playerId,
                    isFull: licenseChoice === 'full',
                    amount: licenseCharge(licenseChoice)
                });
            }

            // Partner Licenses
            selectedDivisions.forEach(division => {
                const partnerState = divisionPartners[division];
                if (partnerState?.payForPartner && partnerState?.partnerProfile && !partnerState.partnerProfile.paid_registration && partnerState.payForPartnerLicense && licenseSalesOpen) {
                    if (!licensesToGrant.some(l => l.playerId === partnerState.partnerProfile.id)) {
                        licensesToGrant.push({
                            playerId: partnerState.partnerProfile.id,
                            isFull: partnerState.partnerLicenseChoice === 'full',
                            amount: licenseCharge(partnerState.partnerLicenseChoice)
                        });
                    }
                }
            });

            for (const license of licensesToGrant) {
                if (!license.playerId) continue;
                if (license.isFull) {
                    await supabase.rpc('grant_partner_full_license', { p_player_id: license.playerId });
                } else {
                    await supabase.from('temporary_licenses').insert({
                        player_id: license.playerId,
                        event_id: event.id,
                        event_name: event.event_name,
                        event_date: event.start_date
                    });
                }
            }

            // Sync emails and participants
            await finalizeRegistrationEmailsAndSync(true);

        } catch (err) {
            console.error("Critical Save Error:", err);
            toast.error(`Error saving registration: ${err.message}`);
        }
    };

    // handlePayNow removed from here since it's now at the top

    // Featured Events navigate here with state.eventCta — must run before any early
    // return so hook order stays stable across loading → loaded renders.
    useEffect(() => {
        const cta = location.state?.eventCta;
        if (!cta || !event?.id || loading) return;

        let cancelled = false;
        let attempts = 0;

        const clearInboundCta = () => {
            navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
        };

        const run = () => {
            if (cancelled) return;
            attempts += 1;

            if (cta === 'manage') {
                if (!manualUserEmail) {
                    promptMembersOnly();
                    clearInboundCta();
                    return;
                }
                setActiveTab('overview');
                if (event.is_manual) {
                    if (!manualRegActionsRef.current?.openManageEntry && attempts < 12) {
                        setTimeout(run, 80);
                        return;
                    }
                    if (manualRegActionsRef.current?.openManageEntry) {
                        manualRegActionsRef.current.openManageEntry();
                    } else {
                        document.getElementById('manual-registration')?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                        });
                    }
                } else {
                    document.getElementById('event-registration')?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                    });
                }
            } else if (cta === 'pay') {
                if (!manualUserEmail) {
                    promptMembersOnly();
                    clearInboundCta();
                    return;
                }
                if (event.is_manual) {
                    if (!manualRegActionsRef.current?.openPayFlow && attempts < 12) {
                        setTimeout(run, 80);
                        return;
                    }
                    manualRegActionsRef.current?.openPayFlow?.();
                } else {
                    setRegStep(1);
                    setIsModalOpen(true);
                }
            } else if (cta === 'register') {
                if (event.is_manual) {
                    if (!manualUserEmail) {
                        promptMembersOnly();
                        clearInboundCta();
                        return;
                    }
                    if (!manualRegActionsRef.current?.openRegistration && attempts < 12) {
                        setTimeout(run, 80);
                        return;
                    }
                    manualRegActionsRef.current?.openRegistration?.();
                } else {
                    const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
                    if (rId) {
                        const slugPart = event?.slug ? `/${event.slug}` : '';
                        window.open(`https://www.rankedin.com/en/tournament/${rId}${slugPart}`, '_blank');
                    }
                }
            }

            clearInboundCta();
        };

        const timer = setTimeout(run, 120);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event?.id, event?.is_manual, loading, location.state?.eventCta, manualUserEmail]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center text-slate-800">
                <Loader className="w-10 h-10 animate-spin text-padel-green" />
            </div>
        );
    }

    if (!event) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center text-slate-800">
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-4">Event not found</h2>
                    <Link to="/calendar" className="text-padel-green hover:underline">Back to Calendar</Link>
                </div>
            </div>
        );
    }

    const handleRankedinRedirect = () => {
        const rId = event?.rankedin_id || extractRankedinId(event?.rankedin_url);
        if (event?.rankedin_url) {
            window.open(event.rankedin_url, '_blank');
        } else if (rId) {
            const slug = event?.slug ? `/${event.slug}` : '';
            window.open(`https://www.rankedin.com/en/tournament/${rId}${slug}`, '_blank');
        } else {
            alert('RankedIn registration link is not available for this event.');
        }
    };

    const openManualRegistration = () => {
        if (!manualUserEmail) {
            promptMembersOnly();
            return;
        }
        if (registrationClosed || manualRegStatus.registrationFullyClosed) {
            toast.error('Registration has closed for this event');
            return;
        }
        manualRegActionsRef.current?.openRegistration?.();
    };

    const openManualPayFlow = () => {
        if (!manualUserEmail) {
            promptMembersOnly();
            return;
        }
        if (registrationClosed) {
            toast.error('Registration has closed — payment is no longer available for this event.');
            return;
        }
        manualRegActionsRef.current?.openPayFlow?.();
    };

    /** Open the "You are registered" accordion and scroll it into view. */
    const openManageEntry = () => {
        if (!manualUserEmail) {
            promptMembersOnly();
            return;
        }
        setActiveTab('overview');
        const run = (attempt = 0) => {
            if (event?.is_manual) {
                if (manualRegActionsRef.current?.openManageEntry) {
                    manualRegActionsRef.current.openManageEntry();
                    return;
                }
                if (attempt < 5) {
                    setTimeout(() => run(attempt + 1), 50);
                    return;
                }
                document.getElementById('manual-registration')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                });
                return;
            }
            document.getElementById('event-registration')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        };
        requestAnimationFrame(() => setTimeout(() => run(), 50));
    };

    const openRegistrationModal = () => {
        if (!manualUserEmail) {
            promptMembersOnly();
            return;
        }
        setRegStep(1);
        setIsModalOpen(true);
    };

    // Prefer uploaded custom cover; fall back to SAPA tier default.
    const heroBackgroundUrl = getEventImage(event);

    const renderCalendarButton = (wrapperClass = '', iconOnly = false) => (
        <div ref={calendarMenuRef} className={`relative ${wrapperClass}`}>
            <button
                type="button"
                onClick={() => setIsCalendarMenuOpen(!isCalendarMenuOpen)}
                className={iconOnly
                    ? 'pointer-events-auto w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/40 transition-all shadow-lg cursor-pointer'
                    : 'w-full flex items-center justify-center gap-2 px-2 py-3.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all'}
                aria-label="Add to calendar"
            >
                <CalendarIcon className="w-4 h-4 shrink-0" />
                {!iconOnly && (
                    <span className="text-xs font-semibold tracking-normal truncate">Add to Calendar</span>
                )}
            </button>
            <AnimatePresence>
                {isCalendarMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        className="absolute top-full mt-2 right-0 left-auto w-56 bg-[#1a1a1a] rounded-2xl shadow-2xl border border-white/10 overflow-hidden z-[110] animate-scale-up"
                    >
                        {[
                            {
                                label: 'Google Calendar', fn: handleGoogleCalendar, icon: (
                                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                )
                            },
                            {
                                label: 'Apple Calendar', fn: handleAppleCalendar, icon: (
                                    <svg viewBox="0 0 384 512" className="w-3.5 h-3.5 flex-shrink-0" fill="#94a3b8">
                                        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                                    </svg>
                                )
                            },
                            {
                                label: 'Outlook / Other', fn: handleOutlookCalendar, icon: (
                                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0 text-[#0078D4]" fill="currentColor">
                                        <path d="M1 4.5l8.7-2.6v19.4L1 18.5V4.5z" />
                                        <path d="M10.4 2.8h12v18.4h-12V2.8zM14 9c0-.9.7-1.6 1.6-1.6h.8c.9 0 1.6.7 1.6 1.6v6c0 .9-.7 1.6-1.6 1.6h-.8c-.9 0-1.6-.7-1.6-1.6V9z" />
                                    </svg>
                                )
                            },
                        ].map(({ label, icon, fn }) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => { fn(); setIsCalendarMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-white hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
                            >
                                {icon}
                                {label}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    const eventAllowsPayments = event?.allow_payments === true && (event.entry_fee > 0 || Object.keys(event.category_fees || {}).length > 0);

    const getDivisionStatus = (divName) => {
        if (!eventAllowsPayments) {
            return {
                text: isPaid ? 'Paid & Confirmed' : 'Registered',
                className: 'bg-green-100 text-green-700'
            };
        }
        const isDivPaid = paidDivisions.some((pd) => divisionsMatch(pd, divName));
        if (isDivPaid) {
            return {
                text: 'Paid & Confirmed',
                className: 'bg-green-100 text-green-700'
            };
        }
        return {
            text: 'Payment Pending',
            className: 'bg-amber-100 text-amber-700'
        };
    };

    const registrationBlock = !event.is_manual && (isRegistered || isPaid) && (
        <div className="bg-[#F4FAEC] rounded-2xl shadow-sm overflow-hidden p-4 sm:p-5 border border-green-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 sm:gap-4 w-full sm:w-auto">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-green-600 flex items-center justify-center bg-white shadow-sm shrink-0 mt-0.5 sm:mt-0">
                    <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-1.5">YOU ARE REGISTERED FOR</p>
                    <div className="flex flex-col gap-2">
                        {registeredDivisions.length > 0 ? (
                            registeredDivisions.map(div => {
                                const status = getDivisionStatus(div);
                                return (
                                    <div key={div} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="text-sm font-semibold text-[#0a0a0a] leading-tight">
                                            {div}
                                        </span>
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${status.className}`}>
                                            {status.text}
                                        </span>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-sm font-semibold text-[#0a0a0a] leading-tight">
                                    Main Event
                                </span>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {isPaid ? 'Paid & Confirmed' : 'Registered'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <button
                onClick={handleRankedinRedirect}
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg border border-green-600 text-green-700 hover:bg-green-50 transition-colors font-medium text-sm whitespace-nowrap shrink-0 sm:self-center"
            >
                <span className="text-lg leading-none">+</span> Add Division
            </button>
        </div>
    );

    const manualEntries = manualRegStatus.entries || [];
    const partnerAddedEntries = manualEntries.filter((e) => e.wasAddedByPartner);
    const partnerAddedNeedsPayment = partnerAddedEntries.some((e) => !e.isPaid);
    const partnerAddedByName = partnerAddedEntries[0]?.addedByName || 'Your partner';
    const hasManualRegistrations = event.is_manual && manualUserEmail && manualEntries.length > 0;
    /** Green only when every entry is fully paid — including partners. */
    const entryTeamFullyPaid = (e) => e.isPaid && (!e.hasPartner || e.partnerPaid);
    const manualAllPaid = manualEntries.length > 0 && manualEntries.every(entryTeamFullyPaid);
    const manualHasPending = manualEntries.some((e) => !entryTeamFullyPaid(e));
    const partnerPaymentPending = manualEntries.some((e) => e.isPaid && e.hasPartner && !e.partnerPaid);

    const manualAllRegistrationsBlock = hasManualRegistrations && (
        <div className={`rounded-2xl shadow-sm overflow-hidden ${manualHasPending
                ? 'border border-amber-200/80 bg-gradient-to-br from-amber-50 to-[#FFFBEB]'
                : 'border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-[#F4FAEC]'
            }`}>
            <div className="p-4 sm:p-5">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`w-11 h-11 rounded-full bg-white border-2 flex items-center justify-center shadow-sm shrink-0 ${manualHasPending ? 'border-amber-500' : 'border-emerald-500'
                        }`}>
                        {manualHasPending ? (
                            <AlertCircle className="w-5 h-5 text-amber-600" strokeWidth={2.5} />
                        ) : (
                            <Check className="w-5 h-5 text-emerald-600" strokeWidth={2.5} />
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${manualHasPending ? 'text-amber-700' : 'text-emerald-700'
                            }`}>
                            You are registered for{manualEntries.length > 1 ? ` (${manualEntries.length} divisions)` : ''}
                        </p>
                        {partnerAddedEntries.length > 0 && (
                            <p className={`text-xs leading-relaxed mt-1 ${manualHasPending ? 'text-amber-900/90' : 'text-emerald-900/90'
                                }`}>
                                {partnerAddedNeedsPayment
                                    ? `${partnerAddedByName} added you to ${partnerAddedEntries.length > 1 ? 'some divisions' : 'a division'}. Pay your entry fee to confirm, or decline if you don't want to play.`
                                    : partnerAddedEntries.length === manualEntries.length
                                        ? `${partnerAddedByName} added you to this event.`
                                        : `Includes ${partnerAddedEntries.length} division${partnerAddedEntries.length > 1 ? 's' : ''} added by ${partnerAddedByName}.`}
                            </p>
                        )}
                    </div>
                </div>

                {partnerPaymentPending && (
                    <div className="flex items-start gap-2.5 mb-4 p-3 rounded-xl bg-amber-50/80 border border-amber-100">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-900 leading-relaxed">
                            Your partner still needs to complete payment to confirm the team entry.
                        </p>
                    </div>
                )}

                <div className="space-y-3">
                    {manualEntries.map((entry) => (
                        <ManualRegistrationEntryCard
                            key={entry.id}
                            entry={entry}
                            playerName={entry.wasAddedByPartner ? (loggedInPlayer?.name || 'You') : 'You'}
                            playerAvatar={loggedInPlayer?.image_url}
                            partnerAvatar={entry.partnerName ? fourMPlayers[entry.partnerName.toLowerCase().trim()] : null}
                            variant="banner"
                            accent={theme?.fill || '#CCFF00'}
                            showActions
                            hideDivision={!!event?.is_weekly}
                            withdrawLabel={entry.wasAddedByPartner && !entry.isPaid ? 'Decline' : 'Withdraw'}
                            onAddPartner={entry.canAddPartner
                                ? () => manualRegActionsRef.current?.openAddPartner?.(entry.id)
                                : undefined}
                            onWithdraw={entry.canWithdraw
                                ? () => manualRegActionsRef.current?.openWithdraw?.(entry.id)
                                : undefined}
                            onRemovePartner={entry.canWithdraw
                                ? () => manualRegActionsRef.current?.openRemovePartner?.(entry.id)
                                : undefined}
                        />
                    ))}
                </div>

                {(manualRegStatus.hasPendingPayment || manualRegStatus.canAddDivision) && (
                    <div className={`flex flex-col gap-2.5 mt-4 pt-4 border-t ${manualAllPaid ? 'border-emerald-200/60' : 'border-amber-200/60'
                        }`}>
                        {manualRegStatus.hasPendingPayment && !registrationClosed && (
                            <button
                                type="button"
                                onClick={() => manualRegActionsRef.current?.openPayFlow?.()}
                                className="flex w-full items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                                style={{ backgroundColor: theme?.fill || '#CCFF00', color: theme?.primaryText?.includes('text-white') ? '#ffffff' : '#0a0a0a' }}
                            >
                                Pay Entry <CreditCard className="w-4 h-4" />
                            </button>
                        )}
                        {manualRegStatus.hasPendingPayment && registrationClosed && (
                            <p className="text-xs text-amber-800/80 text-center leading-relaxed">
                                Registration has closed. Unpaid entries may be removed from the draw.
                            </p>
                        )}
                        {manualRegStatus.canAddDivision && !event?.is_weekly && (
                            <button
                                type="button"
                                onClick={() => manualRegActionsRef.current?.openRegistration?.()}
                                className={`flex w-full items-center justify-center gap-1.5 px-4 py-3 rounded-xl font-semibold text-sm transition-colors ${manualAllPaid
                                        ? 'border border-emerald-600 text-emerald-700 bg-white/80 hover:bg-white'
                                        : 'border border-amber-600/60 text-amber-800 bg-white hover:bg-amber-50/50'
                                    }`}
                            >
                                <span className="text-base leading-none">+</span> Add Division
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    const activeRegistrationBlock = registrationBlock || manualAllRegistrationsBlock;

    const isRegistrationAllowed = !isEventPassed && !isLive && !isRankedinRegistrationClosed;
    const needsRegistration = !isRegistered && isRegistrationAllowed;
    const needsPayment = event?.allow_payments === true && (event.entry_fee > 0 || Object.keys(event.category_fees || {}).length > 0) && (!isPaid || (isRegistered && !registeredDivisions.every((div) => paidDivisions.some((pd) => divisionsMatch(pd, div)))));
    const showReadyToCompete = false; // temporarily hidden: isRegistrationAllowed || needsPayment;

    const shouldHighlightRegistration = Boolean(
        activeRegistrationBlock
        || (event.is_manual && (manualRegStatus.hasRegistrations || manualRegStatus.hasPendingPayment))
    );
    const registrationHighlightClass = shouldHighlightRegistration
        ? (manualRegStatus?.hasPendingPayment || needsPayment || partnerPaymentPending)
            ? '!shadow-[0_0_15px_rgba(245,158,11,0.4)] !border-amber-400'
            : '!shadow-[0_0_15px_rgba(34,197,94,0.3)] !border-green-400'
        : '';

    const readyToCompeteBlock = showReadyToCompete && (
        <div className="bg-[#0a0a0a] rounded-2xl p-5 shadow-lg border border-white/5 animate-fade-in">
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: theme.fill }}>Ready to compete?</p>
            <p className="text-xs text-gray-400 mb-4">Secure your spot at {event.event_name}.</p>
            <div className="space-y-2">
                {needsRegistration && (
                    <button
                        type="button"
                        onClick={handleRankedinRedirect}
                        className="w-full block text-center text-[10px] font-semibold tracking-normal px-4 py-3 rounded-xl transition-all font-bold hover:brightness-110"
                        style={registeredStatusStyle}
                    >
                        Register Now
                    </button>
                )}
                {needsPayment && (
                    <button
                        onClick={openRegistrationModal}
                        className="w-full text-center text-[10px] font-semibold tracking-normal px-4 py-3 rounded-xl transition-all hover:brightness-110"
                        style={registeredStatusStyle}
                    >
                        Pay Entry Fee
                    </button>
                )}
                {(!needsRegistration && !needsPayment && isRegistrationAllowed) && (
                    <button
                        onClick={handleRankedinRedirect}
                        className="w-full text-center text-[10px] font-semibold tracking-normal px-4 py-3 rounded-xl transition-all bg-green-500 text-white hover:bg-green-600"
                    >
                        Add Division
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <>
            <Helmet>
                <title>{`${event.event_name} | 4M Padel`}</title>
                <meta property="og:title" content={`${event.event_name} | 4M Padel`} />
                <meta property="og:description" content={`${event.event_dates || ''} at ${event.venue || ''}. View draws, results, and registration info on 4M Padel.`} />
                <meta property="og:image" content={getEventImage(event)} />
                <meta property="og:type" content="article" />
            </Helmet>

            {/* ===== MAIN PAGE ===== */}
            <div className="min-h-screen bg-gray-50 font-sans relative">

                {event.is_visible === false && (
                    <div className="relative z-[110] bg-amber-400 text-[#0a0a0a] text-center text-xs sm:text-sm font-medium py-2.5 px-4">
                        {event.is_manual
                            ? 'This event is hidden from the public calendar — only people with this link can view it.'
                            : 'Preview mode — this event is hidden from the public calendar.'}
                    </div>
                )}

                {/* Floating nav bar */}
                <div className="absolute top-0 left-0 right-0 z-[100] pt-safe pt-24 md:pt-28 pointer-events-none">
                    <div className="max-w-5xl mx-auto px-5 w-full flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 md:gap-6 min-w-0 flex-1">
                            <button
                                onClick={() => window.history.back()}
                                className="pointer-events-auto w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/40 transition-all shadow-lg cursor-pointer shrink-0"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex items-center gap-2 pointer-events-auto shrink-0">
                            {renderCalendarButton('', true)}
                            <button
                                onClick={async () => {
                                    if (navigator.share) {
                                        try {
                                            await navigator.share({
                                                title: event.event_name,
                                                url: window.location.href
                                            });
                                        } catch (err) {
                                            console.log("Error sharing", err);
                                        }
                                    } else if (navigator.clipboard) {
                                        navigator.clipboard.writeText(window.location.href);
                                        toast.success('Link copied!');
                                    } else {
                                        toast.error('Sharing not supported on this browser');
                                    }
                                }}
                                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/40 transition-all shadow-lg cursor-pointer"
                                aria-label="Share event"
                            >
                                <Share2 className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={handleToggleMySchedule}
                                disabled={scheduleBusy}
                                title={isOnSchedule ? 'Remove from My Schedule' : 'Add to My Schedule'}
                                aria-label={isOnSchedule ? 'Remove from My Schedule' : 'Add to My Schedule'}
                                className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center transition-all shadow-lg cursor-pointer ${
                                    isOnSchedule
                                        ? 'bg-padel-green border-padel-green text-black hover:bg-white'
                                        : 'bg-white/20 border-white/30 text-white hover:bg-white/40'
                                } ${scheduleBusy ? 'opacity-50 cursor-wait' : ''}`}
                            >
                                {isOnSchedule
                                    ? <Check className="w-4 h-4" strokeWidth={3} />
                                    : <Plus className="w-4 h-4" strokeWidth={2.5} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── HERO ── */}
                <div className="relative w-full bg-[#0a0a0a]">
                    {/* Full width foreground flyer image */}
                    <div className="absolute inset-0 z-0 h-[55vw] max-h-[480px] min-h-[280px] overflow-hidden">
                        <img
                            src={heroBackgroundUrl}
                            alt={event.event_name}
                            className="w-full h-[118%] object-cover origin-top animate-hero-zoom-out saturate-[1.45] contrast-[1.28] brightness-[1.18] mt-[10%] md:mt-0"
                            style={{ objectPosition: 'center top' }}
                        />
                        {/* Soft vignette + bottom fade for text readability (no tier colour glow) */}
                        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 48%, rgba(0,0,0,0.5) 100%)' }} />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-[#0a0a0a]/40 to-[#0a0a0a]" />
                    </div>

                    {/* Live badge */}
                    {isLive && (
                        <div className="absolute top-20 left-4 z-20">
                            <span className="inline-flex items-center gap-1.5 bg-red-500 text-white text-[10px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full shadow-lg">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live Today
                            </span>
                        </div>
                    )}

                    {/* Hero text overlay & Action Buttons */}
                    <div className="relative z-50 pb-10 pt-[38vw] sm:pt-[250px]">
                        <div className="max-w-5xl mx-auto px-5 w-full relative">
                            <div className="w-full flex flex-col mt-2">
                                <div className="w-full flex flex-col gap-1">
                                {event.sapa_status && event.sapa_status !== 'None' && (
                                    <span
                                        className="inline-flex self-start items-center px-2 py-0.5 mb-1.5 rounded-full border text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.12em] bg-black/50 backdrop-blur-sm shadow-md"
                                        style={{ color: theme.fill, borderColor: theme.fill }}
                                    >
                                        {event.sapa_status === 'Major' ? 'Major Event' : event.sapa_status}
                                    </span>
                                )}

                                <EventHeroBranding
                                    event={event}
                                    theme={theme}
                                    variant="hero"
                                    title={event.event_name}
                                    brandLogoUrl={linkedOrgLogoUrl}
                                    brandLogoAlt={linkedOrgName || event.organiser_name || ''}
                                    dateLabel={event.event_dates || (event.start_date ? new Date(event.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBC')}
                                    locationLabel={
                                        (() => {
                                            const venuePart = Array.isArray(event.venues) && event.venues.length > 0
                                                ? event.venues.join(' / ')
                                                : event.venue;
                                            return [venuePart, event.city && !(venuePart || '').toLowerCase().includes((event.city || '').toLowerCase()) ? event.city : null]
                                                .filter(Boolean)
                                                .join(', ')
                                            || event.address
                                            || null;
                                        })()
                                    }
                                />
                                </div>

                                {(() => {
                                        // Temporarily hide hero Register / Pay CTA — countdown row handles it.
                                        const SHOW_HERO_REGISTER_CTA = false;
                                        if (!SHOW_HERO_REGISTER_CTA) return null;

                                        const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
                                        let cta = null;

                                        if (event.is_manual) {
                                            if (!isEventPassed) {
                                                if (manualRegStatus.allRegistrationsPaid && manualRegStatus.hasRegistrations) {
                                                    cta = null;
                                                } else if (manualRegStatus.hasPendingPayment && !registrationClosed) {
                                                    cta = (
                                                        <button
                                                            type="button"
                                                            onClick={openManualPayFlow}
                                                            className="flex-1 min-w-[calc(50%-0.5rem)] flex items-center justify-center gap-2 text-xs font-semibold tracking-normal px-2 py-3.5 rounded-xl transition-all hover:brightness-110"
                                                            style={registeredStatusStyle}
                                                        >
                                                            <CreditCard className="w-4 h-4" />
                                                            Pay Entry
                                                        </button>
                                                    );
                                                } else if (registrationNotYetOpen) {
                                                    cta = (
                                                        <button
                                                            type="button"
                                                            disabled
                                                            className="w-full flex items-center justify-center gap-2 text-xs font-semibold tracking-normal px-2 py-3.5 rounded-xl font-bold bg-white/10 border border-white/15 text-white/60 cursor-not-allowed"
                                                        >
                                                            <Clock className="w-4 h-4" />
                                                            Registration Opening Soon
                                                        </button>
                                                    );
                                                } else {
                                                    cta = (
                                                        <button
                                                            type="button"
                                                            onClick={openManualRegistration}
                                                            className="w-full flex items-center justify-center gap-2 text-xs font-semibold tracking-normal px-2 py-3.5 rounded-xl font-bold transition-all hover:brightness-110"
                                                            style={registeredStatusStyle}
                                                        >
                                                            Register Now <ArrowRight className="w-4 h-4" />
                                                        </button>
                                                    );
                                                }
                                            }
                                        } else if (!isEventPassed) {
                                            if (isRegistered && isPaid && registeredDivisions.every((div) => paidDivisions.some((pd) => divisionsMatch(pd, div)))) {
                                                cta = null;
                                            } else {
                                                cta = (
                                                    <>
                                                        {!isRegistered && !isLive && !isRankedinRegistrationClosed && (
                                                            registrationNotYetOpen ? (
                                                                <button
                                                                    type="button"
                                                                    disabled
                                                                    className="w-full flex items-center justify-center gap-2 text-xs font-semibold tracking-normal px-2 py-3.5 rounded-xl font-bold bg-white/10 border border-white/15 text-white/60 cursor-not-allowed"
                                                                >
                                                                    <Clock className="w-4 h-4" />
                                                                    Registration Opening Soon
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={handleRankedinRedirect}
                                                                    className="w-full flex items-center justify-center gap-2 text-xs font-semibold tracking-normal px-2 py-3.5 rounded-xl font-bold transition-all hover:brightness-110"
                                                                    style={registeredStatusStyle}
                                                                >
                                                                    Register Now <ArrowRight className="w-4 h-4" />
                                                                </button>
                                                            )
                                                        )}
                                                        {event?.allow_payments === true && (event.entry_fee > 0 || Object.keys(event.category_fees || {}).length > 0) && isRegistered && (!isPaid || !registeredDivisions.every((div) => paidDivisions.some((pd) => divisionsMatch(pd, div)))) && (
                                                            <button
                                                                type="button"
                                                                onClick={openRegistrationModal}
                                                                className="flex-1 min-w-[calc(50%-0.5rem)] flex items-center justify-center gap-2 text-xs font-semibold tracking-normal px-2 py-3.5 rounded-xl transition-all hover:brightness-110"
                                                                style={registeredStatusStyle}
                                                            >
                                                                <CreditCard className="w-4 h-4" />
                                                                Pay Fee
                                                            </button>
                                                        )}
                                                    </>
                                                );
                                            }
                                        } else if ((hasResults || hasDraw) && (rId || event.slug)) {
                                            cta = (
                                                <Link
                                                    to={`/draws/${event.slug || rId}`}
                                                    className="w-full flex items-center justify-center gap-2 text-xs font-semibold tracking-normal px-2 py-3.5 rounded-xl transition-all hover:brightness-110"
                                                    style={registeredStatusStyle}
                                                >
                                                    <GitBranch className="w-4 h-4" />
                                                    Draws & Results
                                                </Link>
                                            );
                                        }

                                        if (!cta) return null;
                                        return (
                                            <div className="flex flex-wrap items-center gap-2 w-full mt-3 mb-0">
                                                {cta}
                                            </div>
                                        );
                                    })()}

                                {/* Quick Stats */}
                                <div className="mt-2 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm overflow-hidden flex divide-x divide-white/10">
                                    <div className="hidden md:flex flex-1 py-4 px-1 flex-col items-center justify-center text-center min-w-0">
                                        <CheckCircle className="w-4 h-4 mb-1" style={{ color: theme.fill }} />
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-white/50 mb-1">Status</p>
                                        <p className="text-[11px] sm:text-xs font-semibold leading-tight px-1" style={{ color: theme.fill }}>
                                            {computedEventStatus}
                                        </p>
                                    </div>
                                    {[
                                        (() => {
                                            const count = event.is_manual ? manualEntriesCount : totalPlayersCount;
                                            const cap = event.is_weekly ? getWeeklyCapacity(event) : null;
                                            if (cap != null) {
                                                const left = weeklySpotsRemaining(count, cap);
                                                return {
                                                    label: 'Entries',
                                                    value: `${count}/${cap}`,
                                                    sublabel: left === 0 ? 'FULL' : `${left} LEFT`,
                                                    icon: Users,
                                                };
                                            }
                                            return { label: 'Entries', value: count, icon: Users };
                                        })(),
                                        ...(!event.is_weekly ? [
                                            { label: 'Points', value: event.points || '1000', icon: Trophy },
                                            { label: 'Divisions', value: event.is_manual ? playerDivisions.length : (playerDivisions.length > 0 ? playerDivisions.length : (tournamentClasses.length || event.allowed_divisions?.length || 0)), icon: Grid2x2 },
                                        ] : []),
                                        { label: 'Entry Fee', value: entryFeeStatLabel, sublabel: entryFeeStatSublabel, icon: Coins },
                                    ].map(({ label, value, sublabel, icon: Icon }, idx) => (
                                        <div key={idx} className="flex-1 py-4 px-1 flex flex-col items-center justify-center text-center min-w-0">
                                            <Icon className="w-4 h-4 mb-1" style={{ color: theme.fill }} />
                                            <p className="text-sm sm:text-base font-bold text-white leading-tight tabular-nums">{value}</p>
                                            {sublabel && (
                                                <p className="text-[8px] font-bold uppercase tracking-wider text-white/40 mt-0.5">{sublabel}</p>
                                            )}
                                            <p className="text-[9px] font-bold uppercase tracking-wider text-white/50 mt-0.5">{label}</p>
                                        </div>
                                    ))}
                                </div>

                                {eventSponsorItems.length > 0 && (
                                    <EventSponsorStrip
                                        items={eventSponsorItems}
                                        className="w-full mt-3"
                                        accentColor={theme?.fill || '#CCFF00'}
                                        onPosterClick={(url) => setPosterModalUrl(url)}
                                    />
                                )}

                                {(() => {
                                    // Only actionable CTAs — no disabled placeholders in the countdown row
                                    let countdownCta = null;
                                    if (!isEventPassed) {
                                        if (event.is_manual) {
                                            if (manualRegStatus.allRegistrationsPaid && manualRegStatus.hasRegistrations) {
                                                countdownCta = { label: 'Manage Entry', onClick: openManageEntry };
                                            } else if (manualRegStatus.hasPendingPayment && !registrationClosed) {
                                                countdownCta = { label: 'Pay Now', onClick: openManualPayFlow };
                                            } else if (manualRegStatus.hasPendingPayment || manualRegStatus.hasRegistrations || manualRegStatus.hasAnyRegistration) {
                                                countdownCta = { label: 'Manage Entry', onClick: openManageEntry };
                                            } else if (
                                                !registrationNotYetOpen
                                                && !registrationClosed
                                                && !manualRegStatus.registrationFullyClosed
                                                && (event.is_weekly || manualRegStatus.canStartRegistration || manualRegStatus.canAddDivision)
                                            ) {
                                                countdownCta = { label: 'Register', onClick: openManualRegistration };
                                            }
                                        } else if (isRegistered && isPaid && registeredDivisions.every((div) => paidDivisions.some((pd) => divisionsMatch(pd, div)))) {
                                            countdownCta = { label: 'Manage Entry', onClick: openManageEntry };
                                        } else if (!isRegistered && !isLive && !isRankedinRegistrationClosed && !registrationNotYetOpen) {
                                            countdownCta = { label: 'Register', onClick: handleRankedinRedirect };
                                        } else if (
                                            event?.allow_payments === true
                                            && (event.entry_fee > 0 || Object.keys(event.category_fees || {}).length > 0)
                                            && isRegistered
                                            && (!isPaid || !registeredDivisions.every((div) => paidDivisions.some((pd) => divisionsMatch(pd, div))))
                                            && !registrationClosed
                                        ) {
                                            countdownCta = { label: 'Pay Now', onClick: openRegistrationModal };
                                        }
                                    }
                                    return (
                                        <RegistrationCountdown
                                            closesAt={registrationNotYetOpen ? event.registration_opens_at : event.registration_closes_at}
                                            mode={registrationNotYetOpen ? 'opens' : 'closes'}
                                            accentColor={theme.fill}
                                            ctaLabel={countdownCta?.label || null}
                                            onCtaClick={countdownCta?.onClick || undefined}
                                            ctaStyle={registeredStatusStyle}
                                        />
                                    );
                                })()}

                                <TournamentProgressBar
                                    event={event}
                                    accentColor={theme.fill}
                                    drawPublished={hasDraw}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── TAB BAR ── */}
                <div className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm px-4">
                    <div className="max-w-5xl mx-auto flex justify-between w-full overflow-x-auto no-scrollbar">
                        {[
                            { id: 'overview', label: 'Overview' },
                            { id: 'players', label: 'Players' },
                            { id: 'draws', label: 'Draws' },
                            { id: 'results', label: 'Results' },
                            { id: 'media', label: 'Media' },
                        ].map(({ id, label }) => {
                            const active = activeTab === id;
                            return (
                                <button
                                    key={id}
                                    onClick={() => setActiveTab(id)}
                                    className={`flex-1 py-4 text-sm font-semibold border-b-2 transition-all whitespace-nowrap text-center ${active
                                        ? 'text-[#0a0a0a] border-[#0a0a0a]'
                                        : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── TAB CONTENT ── */}
                <div className="max-w-5xl mx-auto px-4 py-6 pb-32 md:pb-10">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.2 }}
                        >

                            {/* ══ OVERVIEW TAB ══ */}
                            {activeTab === 'overview' && (
                                <div className="flex flex-col gap-6">
                                    {event.is_manual && registrationNotYetOpen && (
                                        <div id="manual-registration" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                                            <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                                                <Clock className="w-6 h-6 text-gray-400" />
                                            </div>
                                            <h3 className="text-lg font-bold text-[#0a0a0a]">Registration Not Open Yet</h3>
                                            <p className="text-sm text-gray-500 mt-1.5">
                                                Entries for this event open on <span className="font-bold text-[#0a0a0a]">{registrationOpensLabel}</span>. Check back then!
                                            </p>
                                        </div>
                                    )}
                                    {event.is_manual && !registrationNotYetOpen && (
                                        <div id="manual-registration">
                                            <ManualEventRegistration
                                                event={event}
                                                userEmail={manualUserEmail}
                                                theme={theme}
                                                initialPlayer={loggedInPlayer}
                                                fourMPlayers={fourMPlayers}
                                                onStatusChange={setManualRegStatus}
                                                onParticipantsChange={refreshParticipants}
                                                registrationActionsRef={manualRegActionsRef}
                                                highlightClassName={registrationHighlightClass}
                                            />
                                        </div>
                                    )}
                                    {!event.is_manual && (
                                        <div id="event-registration" className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${registrationHighlightClass}`}>
                                            {(activeRegistrationBlock || readyToCompeteBlock) && (
                                                <div className="p-4 sm:p-5 border-b border-gray-50">
                                                    {activeRegistrationBlock || readyToCompeteBlock}
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-50">
                                                <h2 className="text-base font-semibold text-slate-900">Divisions</h2>
                                                <button onClick={() => setActiveTab('players')} className="text-[13px] font-bold text-[#0a0a0a] hover:text-gray-600 flex items-center gap-1">
                                                    View All Divisions <ChevronRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="divide-y divide-gray-50">
                                                {playerDivisions.length > 0 ? playerDivisions.map((cls, idx) => {
                                                    const clsParticipants = participants[cls.Id] || [];
                                                    return (
                                                        <div key={idx} onClick={() => { setActiveTab('players'); toggleDivision(cls.Id); }} className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors">
                                                            <div className="flex items-center gap-4">
                                                                <Users className="w-5 h-5 text-gray-400" strokeWidth={1.5} />
                                                                <span className="font-medium text-[#0a0a0a] text-[15px]">{cls.Name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[13px] text-gray-500 font-medium">{clsParticipants.length} Teams</span>
                                                                <ChevronRight className="w-4 h-4 text-gray-300" />
                                                            </div>
                                                        </div>
                                                    );
                                                }) : (
                                                    <div className="px-6 py-8 flex flex-col items-center justify-center text-center">
                                                        <Users className="w-10 h-10 text-gray-200 mb-3" />
                                                        <h3 className="text-sm font-bold text-[#0a0a0a] mb-1">No divisions setup yet</h3>
                                                        <p className="text-xs text-gray-400">Divisions will appear here once they are created.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-col md:flex-row gap-6">

                                        {/* Left Column: Event Information */}
                                        <div className="flex-1 space-y-6">
                                            <InfoSection title="Event Information" icon={FileText} accent={theme.fill} defaultOpen={false}>
                                                <div className="divide-y divide-gray-50 -mx-6 -my-5 border-t border-gray-50">
                                                    {(() => {
                                                        const computedStatus = computedEventStatus;

                                                        return [
                                                            {
                                                                label: Array.isArray(event.venues) && event.venues.length > 1 ? 'Venues' : 'Venue',
                                                                value: (Array.isArray(event.venues) && event.venues.length > 0
                                                                    ? event.venues.join(' / ')
                                                                    : event.venue) || 'Virgin Active Padel Club',
                                                                icon: MapPin,
                                                            },
                                                            ...(event.courts ? [{ label: 'Courts', value: event.courts, icon: Layout }] : []),
                                                            { label: 'Organiser', value: event.organiser_name || 'VAPC', icon: User },
                                                            { label: 'Tournament Tier', value: event.sapa_status || 'Gold 1000', icon: Award, valueColor: theme.accentText },
                                                            ...(event.prize_money_total != null && Number(event.prize_money_total) > 0 ? [{
                                                                label: 'Prize Pool',
                                                                value: `R ${Number(event.prize_money_total).toLocaleString('en-ZA')}`,
                                                                icon: Trophy,
                                                                valueColor: theme.accentText,
                                                            }] : []),
                                                            ...(event.back_draw_options ? [{ label: 'Back Draw', value: event.back_draw_options, icon: Award }] : []),
                                                            ...(event.max_teams_capacity ? [{ label: 'Team Capacity', value: `${event.max_teams_capacity} teams`, icon: User }] : []),
                                                            ...( (() => {
                                                                const scoring = event.scoring_point
                                                                    || (event.golden_point === false ? 'advantage' : (event.golden_point === true ? 'golden' : null));
                                                                if (!scoring) return [];
                                                                const labels = {
                                                                    golden: 'Golden Point',
                                                                    silver: 'Silver Point',
                                                                    star: 'Star Point',
                                                                    advantage: 'Advantage (No Deciding Point)',
                                                                };
                                                                return [{ label: 'Scoring', value: labels[scoring] || String(scoring), icon: Award }];
                                                            })() ),
                                                            ...(event.is_league ? [{ label: 'Format', value: 'League', icon: Trophy }] : []),
                                                            { label: 'Status', value: computedStatus, icon: Clock }
                                                        ].map((item, idx) => (
                                                            <div key={idx} className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors">
                                                                <div className="flex items-center gap-4">
                                                                    <item.icon className="w-5 h-5 text-gray-400" strokeWidth={1.5} />
                                                                    <span className="text-[14px] text-gray-700 font-medium">{item.label}</span>
                                                                </div>
                                                                <div className="flex items-center gap-3">
                                                                    <span className={`text-[14px] font-medium text-right max-w-[150px] truncate ${item.valueColor || 'text-[#0a0a0a]'}`}>{item.value}</span>
                                                                    <ChevronRight className="w-4 h-4 text-gray-300" />
                                                                </div>
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>
                                            </InfoSection>
                                        </div>

                                        {/* Right Column: Top Seeds (RankedIn events only) */}
                                        {!event.is_manual && (
                                            <div className="flex-1 space-y-6">

                                                {/* Top Seeds */}
                                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                                    <div className="flex items-center justify-between px-6 py-5 border-b border-gray-50">
                                                        <h2 className="font-bold text-[#0a0a0a] text-lg">Top Seeds</h2>
                                                        <Link to="/rankings" className="text-[13px] font-bold text-[#0a0a0a] hover:text-gray-600 flex items-center gap-1">
                                                            View Rankings <ChevronRight className="w-4 h-4" />
                                                        </Link>
                                                    </div>
                                                    <div className="divide-y divide-gray-50 px-6">
                                                        {(() => {
                                                            let seedList = [];

                                                            let targetDivs = playerDivisions.filter(d => {
                                                                const name = (d.Name || '').toLowerCase().replace(/['`]/g, '');
                                                                return name.includes('mens');
                                                            });

                                                            if (targetDivs.length === 0) {
                                                                const fallbackDivs = playerDivisions.filter(d => {
                                                                    const name = (d.Name || '').toLowerCase().replace(/['`]/g, '');
                                                                    const isLadies = name.includes('ladies') || name.includes('women') || name.includes('mixed');
                                                                    return !isLadies && (name.includes('open') || name.includes('advanced') || name.includes('pro'));
                                                                });
                                                                targetDivs.push(...fallbackDivs);
                                                            }

                                                            if (targetDivs.length === 0) {
                                                                const genericDivs = playerDivisions.filter(d => {
                                                                    const name = (d.Name || '').toLowerCase().replace(/['`]/g, '');
                                                                    return !name.includes('ladies') && !name.includes('women') && !name.includes('mixed');
                                                                });
                                                                targetDivs.push(...genericDivs);
                                                            }

                                                            if (targetDivs.length === 0) {
                                                                targetDivs = playerDivisions;
                                                            }

                                                            const divParticipantsToProcess = targetDivs.map(d => participants[d.Id]).filter(Boolean);

                                                            const seenNames = new Set();

                                                            divParticipantsToProcess.forEach(divParticipants => {
                                                                if (!divParticipants) return;
                                                                divParticipants.forEach(item => {
                                                                    const p = item.Participant || {};

                                                                    let individualPlayers = [];
                                                                    if (p.Players && p.Players.length > 0) {
                                                                        individualPlayers = p.Players;
                                                                    } else if (p.FirstPlayer || p.SecondPlayer) {
                                                                        if (p.FirstPlayer) individualPlayers.push(p.FirstPlayer);
                                                                        if (p.SecondPlayer) individualPlayers.push(p.SecondPlayer);
                                                                    } else if (p.Name) {
                                                                        individualPlayers.push(p);
                                                                    }

                                                                    individualPlayers.forEach(player => {
                                                                        if (player && player.Name && !seenNames.has(player.Name)) {
                                                                            seenNames.add(player.Name);

                                                                            const globalRank = globalRankings.get(player.Name.toLowerCase());
                                                                            const rankVal = globalRank !== undefined ? globalRank : (item.Ranking ? parseInt(item.Ranking) : Infinity);
                                                                            const seedVal = p.Seed ? parseInt(p.Seed) : Infinity;

                                                                            const country = player.Country?.ISOCode || 'za';
                                                                            seedList.push({ name: player.Name, seed: seedVal, rank: rankVal, country });
                                                                        }
                                                                    });
                                                                });
                                                            });

                                                            if (seedList.length === 0) {
                                                                return (
                                                                    <div className="py-8 text-center text-gray-400 text-sm">
                                                                        No ranked players registered yet
                                                                    </div>
                                                                );
                                                            }

                                                            seedList.sort((a, b) => {
                                                                if (a.rank !== Infinity || b.rank !== Infinity) return a.rank - b.rank;
                                                                return a.seed - b.seed;
                                                            });

                                                            const validSeeds = seedList.filter(s => s.rank !== Infinity || s.seed !== Infinity);
                                                            const displayList = validSeeds.length > 0 ? validSeeds : seedList;

                                                            return displayList.slice(0, 4).map((seed, idx) => (
                                                                <div key={idx} className="flex items-center justify-between py-4">
                                                                    <div className="flex items-center gap-4">
                                                                        <span className="font-semibold text-yellow-500 w-4 flex-shrink-0">{idx + 1}</span>
                                                                        <span className="font-medium text-[#0a0a0a] text-[14px] max-w-[180px] truncate" title={seed.name}>
                                                                            {seed.name} {seed.rank !== Infinity && <span className="text-gray-500 ml-1 text-[13px]">(#{seed.rank})</span>}
                                                                        </span>
                                                                    </div>
                                                                    {seed.country && (
                                                                        <img src={`https://flagcdn.com/w40/${seed.country.toLowerCase()}.png`} alt={seed.country} className="w-6 h-auto rounded-sm border border-gray-200 flex-shrink-0" />
                                                                    )}
                                                                </div>
                                                            ));
                                                        })()}
                                                    </div>
                                                </div>

                                            </div>
                                        )}

                                        {/* Right Column: Top Seeds (Manual events — combined ranking points seeding) */}
                                        {event.is_manual && (
                                            <div className="flex-1 space-y-6">
                                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200">
                                                    <div
                                                        onClick={() => setTopSeedsOpen((o) => !o)}
                                                        className="flex items-center justify-between px-6 py-4 border-b border-gray-50 gap-3 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.fill + '20' }}>
                                                                <Crown className="w-4 h-4 text-[#0a0a0a]" />
                                                            </div>
                                                            <h2 className="text-sm font-semibold text-slate-900 tracking-normal">Top Seeds</h2>
                                                        </div>
                                                        <div className="flex items-center gap-3 shrink-0">
                                                            <div className="flex bg-gray-100 rounded-full p-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                <button
                                                                    onClick={() => setTopSeedsGender('men')}
                                                                    style={topSeedsGender === 'men' ? { backgroundColor: theme.fill, color: '#0a0a0a' } : undefined}
                                                                    className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-full transition-all ${topSeedsGender === 'men' ? '' : 'text-gray-500 hover:text-gray-700'}`}
                                                                >
                                                                    Men
                                                                </button>
                                                                <button
                                                                    onClick={() => setTopSeedsGender('women')}
                                                                    style={topSeedsGender === 'women' ? { backgroundColor: theme.fill, color: '#0a0a0a' } : undefined}
                                                                    className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-full transition-all ${topSeedsGender === 'women' ? '' : 'text-gray-500 hover:text-gray-700'}`}
                                                                >
                                                                    Women
                                                                </button>
                                                            </div>
                                                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${topSeedsOpen ? '' : '-rotate-90'}`} />
                                                        </div>
                                                    </div>
                                                    <AnimatePresence initial={false}>
                                                        {topSeedsOpen && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="divide-y divide-gray-50 px-6">
                                                                    {(() => {
                                                                        // Note: teams[].seed is numbered per-division (each division's
                                                                        // own draw starts at 1), so when pooling multiple divisions of
                                                                        // the same gender for this overview panel we re-rank fresh by
                                                                        // points across the whole pool rather than reusing that field.
                                                                        const teams = Object.values(manualTeamSeeds)
                                                                            .filter((d) => d.genderLabel === topSeedsGender)
                                                                            .flatMap((d) => d.teams)
                                                                            .filter((t) => t.totalPoints > 0)
                                                                            .sort((a, b) => b.totalPoints - a.totalPoints);

                                                                        if (teams.length === 0) {
                                                                            return (
                                                                                <div className="py-8 text-center text-gray-400 text-sm">
                                                                                    No ranked teams registered yet
                                                                                </div>
                                                                            );
                                                                        }

                                                                        return teams.slice(0, 4).map((team, idx) => (
                                                                            <div key={team.id} className="flex items-center justify-between py-4 gap-3">
                                                                                <div className="flex items-center gap-4 min-w-0">
                                                                                    <span className="font-semibold text-yellow-500 w-4 flex-shrink-0">{idx + 1}</span>
                                                                                    <span className="font-medium text-[#0a0a0a] text-[14px] truncate" title={team.name}>
                                                                                        {team.name} <span className="text-gray-500 ml-1 text-[13px]">({team.totalPoints.toLocaleString()} pts)</span>
                                                                                    </span>
                                                                                </div>
                                                                                <img src="https://flagcdn.com/w40/za.png" alt="South Africa" className="w-6 h-auto rounded-sm border border-gray-200 flex-shrink-0" />
                                                                            </div>
                                                                        ));
                                                                    })()}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="w-full space-y-6">
                                        {/* Tournament Details — full width under Event Information / Top Seeds */}
                                        {(event.courts || event.balls || event.draw_released || event.cut_off_times || event.tournament_director || event.referees) && (
                                            <InfoSection title="Tournament Details" icon={Layout} accent={theme.fill}>
                                                <div className="divide-y divide-gray-100">
                                                    {[
                                                        ['Courts', event.courts],
                                                        ['Balls', event.balls],
                                                        ['Draw Released', event.draw_released],
                                                        ['Cut-off Times', event.cut_off_times],
                                                        ['Tournament Director', event.tournament_director],
                                                        ['Referees', event.referees],
                                                    ].filter(([, v]) => v).map(([label, value]) => {
                                                        const text = String(value);
                                                        const isHtml = /<[a-z][\s\S]*>/i.test(text);
                                                        return (
                                                            <div
                                                                key={label}
                                                                className={isHtml
                                                                    ? 'flex flex-col gap-2 py-3 text-sm'
                                                                    : 'flex items-start justify-between gap-4 py-2 text-sm'}
                                                            >
                                                                <span className="text-slate-500 font-medium">{label}</span>
                                                                {isHtml ? (
                                                                    <div
                                                                        className="rich-text text-slate-700 leading-snug text-xs font-normal"
                                                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }}
                                                                    />
                                                                ) : (
                                                                    <span className="text-[#0a0a0a] font-semibold text-right">{text}</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </InfoSection>
                                        )}

                                        {/* Event Info */}
                                        <div className="space-y-5">

                                            {/* About This Event */}
                                            {event.description && (
                                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200">
                                                    <div
                                                        onClick={() => toggleSection('about')}
                                                        className="flex items-center justify-between px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.fill + '20' }}>
                                                                <FileText className="w-4 h-4 text-[#0a0a0a]" />
                                                            </div>
                                                            <h2 className="font-semibold text-slate-900 text-sm tracking-normal">About This Event</h2>
                                                        </div>
                                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${collapsedSections.about ? '-rotate-90' : ''}`} />
                                                    </div>
                                                    <AnimatePresence initial={false}>
                                                        {!collapsedSections.about && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="px-6 py-5">
                                                                    <div
                                                                        className="text-slate-600 leading-snug text-xs font-normal prose max-w-none"
                                                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.description) }}
                                                                    />
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            )}

                                            {/* Contact */}
                                            {(event.contact_details || event.organiser_phone || event.organiser_email) && (
                                                <InfoSection title="Contact" icon={Phone} accent={theme.fill}>
                                                    <div className="space-y-2 text-sm">
                                                        {event.contact_details && <p className="text-slate-700 whitespace-pre-wrap">{event.contact_details}</p>}
                                                        {event.organiser_phone && (
                                                            <a
                                                                href={`tel:${event.organiser_phone}`}
                                                                className="flex items-center gap-2 font-semibold !text-slate-800 hover:!text-black"
                                                                style={{ color: '#1a1a1a' }}
                                                            >
                                                                <Phone className="w-4 h-4 shrink-0 text-slate-500" />
                                                                {event.organiser_phone}
                                                            </a>
                                                        )}
                                                        {event.organiser_email && (
                                                            <a
                                                                href={`mailto:${event.organiser_email}`}
                                                                className="flex items-center gap-2 font-semibold !text-slate-800 hover:!text-black"
                                                                style={{ color: '#1a1a1a' }}
                                                            >
                                                                <Mail className="w-4 h-4 shrink-0 text-slate-500" />
                                                                {event.organiser_email}
                                                            </a>
                                                        )}
                                                    </div>
                                                </InfoSection>
                                            )}

                                            {/* Location & Map */}
                                            {(event.address || event.venue) && (
                                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200">
                                                    <div
                                                        onClick={() => toggleSection('location')}
                                                        className="flex items-center justify-between px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.fill + '20' }}>
                                                                <MapPin className="w-4 h-4 text-[#0a0a0a]" />
                                                            </div>
                                                            <h2 className="font-semibold text-slate-900 text-sm tracking-normal">Location</h2>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <a
                                                                href={`https://maps.google.com/?q=${encodeURIComponent(`${event.venue || ''} ${event.address || ''} ${event.city || ''}`.trim())}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className={`text-[10px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-lg transition-colors shrink-0 ${theme.primary}`}
                                                                style={{ color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0a0a0a' }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                Directions
                                                            </a>
                                                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${collapsedSections.location ? '-rotate-90' : ''}`} />
                                                        </div>
                                                    </div>
                                                    <AnimatePresence initial={false}>
                                                        {!collapsedSections.location && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="px-6 py-3 bg-gray-50/30 border-b border-gray-100 space-y-2">
                                                                    {Array.isArray(event.venues) && event.venues.length > 1 ? (
                                                                        <ul className="space-y-1">
                                                                            {event.venues.map((v) => (
                                                                                <li key={v} className="text-sm font-semibold text-slate-700 flex items-start gap-2">
                                                                                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                                                                                    <span>{v}</span>
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    ) : (
                                                                        <p className="text-sm font-semibold text-slate-700">
                                                                            {[event.venue, event.address, event.city].filter(Boolean).join(' · ')}
                                                                        </p>
                                                                    )}
                                                                    {Array.isArray(event.venues) && event.venues.length > 1 && (event.address || event.city) && (
                                                                        <p className="text-xs text-slate-500">
                                                                            {[event.address, event.city].filter(Boolean).join(' · ')}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <div className="h-[220px] w-full relative">
                                                                    <iframe
                                                                        width="100%"
                                                                        height="100%"
                                                                        frameBorder="0"
                                                                        scrolling="no"
                                                                        marginHeight="0"
                                                                        marginWidth="0"
                                                                        src={`https://maps.google.com/maps?q=${encodeURIComponent(`${event.venue || ''} ${event.address || ''} ${event.city || ''}`.trim())}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                                                        className="w-full h-full"
                                                                        title="Event Location"
                                                                    />
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            )}

                                            {/* Points Breakdown */}
                                            {event.points_breakdown && (
                                                <InfoSection title="Points Breakdown" icon={Award} accent={theme.fill} text={event.points_breakdown} />
                                            )}

                                            {/* Prize Money */}
                                            {(() => {
                                                const prizeBreakdown = parsePrizeBreakdown(event.prize_money_breakdown);
                                                const hasTotal = event.prize_money_total != null && Number(event.prize_money_total) > 0;
                                                if (!hasTotal && prizeBreakdown.length === 0) return null;
                                                return (
                                                    <InfoSection title="Prize Money" icon={Trophy} accent={theme.fill} defaultOpen={false}>
                                                        {hasTotal && (
                                                            <p className="text-2xl font-semibold text-slate-900 mb-3">
                                                                R {Number(event.prize_money_total).toLocaleString('en-ZA')}
                                                            </p>
                                                        )}
                                                        {prizeBreakdown.length > 0 && (
                                                            <div className={hasTotal ? 'pt-3 border-t border-gray-100' : ''}>
                                                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                                                    Prize Pool Breakdown
                                                                </p>
                                                                <div className="divide-y divide-gray-100">
                                                                    {prizeBreakdown.map((row, i) => (
                                                                        <div key={i} className="flex items-center justify-between gap-4 py-2.5 text-sm first:pt-0">
                                                                            <span className="text-slate-600 font-medium">{row.label}</span>
                                                                            <span className="font-semibold text-[#0a0a0a] shrink-0">{formatPrizeAmount(row.amount)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </InfoSection>
                                                );
                                            })()}

                                            {/* Rules & Regulations */}
                                            {event.rules_regs && (
                                                <InfoSection title="Rules & Regulations" icon={FileText} accent={theme.fill} text={event.rules_regs} />
                                            )}

                                            {/* Sanctioning Details */}
                                            {event.sanctioning_details && (
                                                <InfoSection title="Sanctioning Details" icon={CheckCircle} accent={theme.fill} text={event.sanctioning_details} />
                                            )}

                                            {/* Sponsors */}
                                            {eventSponsorItems.length > 0 && (
                                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200">
                                                    <div
                                                        onClick={() => toggleSection('sponsors')}
                                                        className="flex items-center justify-between px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.fill + '20' }}>
                                                                <ImageIcon className="w-4 h-4 text-[#0a0a0a]" />
                                                            </div>
                                                            <h2 className="font-semibold text-slate-900 text-sm tracking-normal">Sponsors</h2>
                                                        </div>
                                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${collapsedSections.sponsors ? '-rotate-90' : ''}`} />
                                                    </div>
                                                    <AnimatePresence initial={false}>
                                                        {!collapsedSections.sponsors && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="px-6 py-5 grid grid-cols-3 md:grid-cols-4 gap-4">
                                                                    {eventSponsorItems.map((item, i) => {
                                                                        const tile = (
                                                                            <div className="aspect-[3/2] bg-gray-50 rounded-xl flex items-center justify-center p-3 border border-gray-100 hover:scale-[1.03] transition-transform">
                                                                                <img
                                                                                    src={item.url}
                                                                                    alt={item.label || `Sponsor ${i + 1}`}
                                                                                    className="max-w-full max-h-full object-contain"
                                                                                />
                                                                            </div>
                                                                        );
                                                                        if (item.type === 'org' && item.href) {
                                                                            return (
                                                                                <Link key={`org-${i}`} to={item.href} title={item.label || 'Organiser'}>
                                                                                    {tile}
                                                                                </Link>
                                                                            );
                                                                        }
                                                                        if (item.type === 'poster') {
                                                                            return (
                                                                                <button
                                                                                    key={`poster-${i}`}
                                                                                    type="button"
                                                                                    onClick={() => setPosterModalUrl(item.url)}
                                                                                    className="text-left cursor-pointer"
                                                                                    title="View event poster"
                                                                                >
                                                                                    {tile}
                                                                                </button>
                                                                            );
                                                                        }
                                                                        return (
                                                                            <div key={`${item.url}-${i}`}>
                                                                                {tile}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            )}

                                            {/* Weather Forecast */}
                                            {weather && (
                                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200">
                                                    <div
                                                        onClick={() => toggleSection('weather')}
                                                        className="flex items-center justify-between px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.fill + '20' }}>
                                                                <Cloud className="w-4 h-4 text-[#0a0a0a]" />
                                                            </div>
                                                            <h2 className="font-semibold text-slate-900 text-sm tracking-normal">Weather Forecast</h2>
                                                        </div>
                                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${collapsedSections.weather ? '-rotate-90' : ''}`} />
                                                    </div>
                                                    <AnimatePresence initial={false}>
                                                        {!collapsedSections.weather && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="px-6 py-5 flex items-center gap-4">
                                                                    <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: theme.fill + '15' }}>
                                                                        <Cloud className="w-7 h-7 text-[#0a0a0a]" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-2xl font-semibold text-slate-900">{Math.round(weather.temp)}°C</p>
                                                                        <p className="text-xs font-bold text-gray-500 capitalize">{weather.condition}</p>
                                                                        {weather.humidity && <p className="text-[10px] text-gray-400 font-bold mt-0.5">Humidity: {weather.humidity}%</p>}
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            )}

                                            {/* Withdrawal & Substitution */}
                                            {event.withdrawal_substitution && (
                                                <InfoSection title="Withdrawal & Substitution" icon={AlertCircle} accent={theme.fill} text={event.withdrawal_substitution} />
                                            )}
                                        </div>


                                    </div>
                                </div>
                            )}

                            {/* ══ PLAYERS TAB ══ */}
                            {activeTab === 'players' && (
                                <div className="space-y-4">
                                    {fetchingParticipants && playerDivisions.length === 0 ? (
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 flex flex-col items-center">
                                            <Loader className="w-8 h-8 animate-spin text-[#0a0a0a] mb-4" />
                                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Loading Players...</p>
                                        </div>
                                    ) : playerDivisions.length > 0 ? (
                                        event.is_weekly ? (() => {
                                            const weeklyCls = playerDivisions[0];
                                            const clsParticipants = participants[weeklyCls?.Id] || [];
                                            const filled = clsParticipants.length;
                                            const cap = getWeeklyCapacity(event);
                                            const spotsLeft = weeklySpotsRemaining(filled, cap);
                                            const badgeLabel = cap != null
                                                ? `${filled}/${cap}${spotsLeft === 0 ? ' · Full' : ` · ${spotsLeft} left`}`
                                                : `${filled} ${filled === 1 ? 'Entry' : 'Entries'}`;
                                            return (
                                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                                                        <h3 className="font-semibold text-slate-900 text-base tracking-normal">Entries</h3>
                                                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#CCFF00] text-[#0a0a0a] px-3 py-1.5 rounded-full">
                                                            {badgeLabel}
                                                        </span>
                                                    </div>
                                                    {clsParticipants.length > 0 ? (
                                                        <div className="divide-y divide-gray-100">
                                                            {clsParticipants.map((item, pIdx) => {
                                                                const p = item.Participant || {};
                                                                const players = (p.Players && p.Players.length > 0)
                                                                    ? p.Players
                                                                    : [p.FirstPlayer, p.SecondPlayer].filter(Boolean);
                                                                const getProfileImage = (playerObj) => {
                                                                    if (!playerObj) return null;
                                                                    const rId = playerObj.RankedinId || playerObj.Id?.toString();
                                                                    const pName = (playerObj.Name || '').toLowerCase();
                                                                    if (rId && fourMPlayers[rId]) return fourMPlayers[rId];
                                                                    if (pName && fourMPlayers[pName]) return fourMPlayers[pName];
                                                                    return playerObj.Image;
                                                                };
                                                                return (
                                                                    <div key={p.Id || pIdx} className="bg-white px-4 py-2.5 sm:px-5 sm:py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                                                                        <div className="flex items-center gap-3 sm:gap-4">
                                                                            <div className="flex-shrink-0 w-8 sm:w-9 text-center self-center">
                                                                                <span className="text-lg sm:text-xl font-black text-[#0a0a0a] tabular-nums leading-none">
                                                                                    {pIdx + 1}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0">
                                                                                {players.map((player, idx) => {
                                                                                    const pName = (player.Name || '').split(' ')[0];
                                                                                    const avatarUrl = getProfileImage(player);
                                                                                    return (
                                                                                        <button
                                                                                            key={idx}
                                                                                            type="button"
                                                                                            onClick={() => openPlayerProfile(player)}
                                                                                            disabled={loadingPlayerProfile}
                                                                                            title={`View ${player.Name || 'player'} profile`}
                                                                                            className="flex flex-col items-center min-w-[80px] group cursor-pointer disabled:opacity-60 disabled:cursor-wait bg-transparent border-0 p-0"
                                                                                        >
                                                                                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200 flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 group-hover:border-slate-300 group-focus-visible:ring-2 group-focus-visible:ring-offset-2 group-focus-visible:ring-slate-400">
                                                                                                {avatarUrl ? (
                                                                                                    <img src={avatarUrl} alt={player.Name} className="w-full h-full object-cover" />
                                                                                                ) : (
                                                                                                    <User className="w-7 h-7 text-gray-400" />
                                                                                                )}
                                                                                            </div>
                                                                                            <span className="text-sm font-bold text-slate-800 mt-1.5 text-center max-w-[96px] truncate group-hover:underline underline-offset-2">
                                                                                                {pName}
                                                                                            </span>
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                            {item._paymentStatus && item._paymentStatus !== 'paid' && (
                                                                                <span className="text-[9px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full flex-shrink-0">
                                                                                    Reserved
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="px-6 py-10 text-center">
                                                            <Users className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                                                            <p className="text-xs font-bold text-gray-400">No entries yet</p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })() : (
                                        playerDivisions.map((cls) => {
                                            const clsParticipants = participants[cls.Id] || [];
                                            const isExpanded = !!expandedDivisions[cls.Id];
                                            return (
                                                <div key={cls.Id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                                    <div
                                                        onClick={() => toggleDivision(cls.Id)}
                                                        className="flex items-center justify-between px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                                                    >
                                                        <h3 className="font-semibold text-slate-900 text-base tracking-normal">{cls.Name}</h3>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#CCFF00] text-[#0a0a0a] px-3 py-1.5 rounded-full">
                                                                {clsParticipants.length} Teams
                                                            </span>
                                                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                                        </div>
                                                    </div>

                                                    <AnimatePresence initial={false}>
                                                        {isExpanded && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="overflow-hidden"
                                                            >
                                                                {clsParticipants.length > 0 ? (
                                                                    <div className="divide-y divide-gray-100">
                                                                        {(() => {
                                                                            const dname = (cls.Name || '').toLowerCase();
                                                                            const genderLabel = (dname.includes('women') || dname.includes('ladies') || dname.includes('girls')) ? 'women' : 'men';
                                                                            
                                                                            let enrichedParticipants = clsParticipants.map((item) => {
                                                                                const p = item.Participant || {};
                                                                                const isTeam = p.Players && p.Players.length > 0 && !p.FirstPlayer;
                                                                                const players = isTeam ? p.Players : [p.FirstPlayer, p.SecondPlayer].filter(Boolean);
                                                                                const manualSeedInfo = event.is_manual ? manualTeamSeeds[cls.Id]?.teams.find((t) => t.id === p.Id) : null;
                                                                                
                                                                                let p1Points = 0;
                                                                                let p2Points = 0;

                                                                                const getPlayerPoints = (playerObj) => {
                                                                                    if (!playerObj) return 0;
                                                                                    const rId = playerObj.RankedinId || playerObj.Id?.toString();
                                                                                    const pName = (playerObj.Name || '').toLowerCase().trim();
                                                                                    
                                                                                    let mappedData = null;
                                                                                    if (rId && playerRankingsMap[rId]) {
                                                                                        mappedData = playerRankingsMap[rId];
                                                                                    } else if (pName && playerRankingsMap[pName]) {
                                                                                        mappedData = playerRankingsMap[pName];
                                                                                    }
                                                                                    
                                                                                    return getMainCategoryPoints(mappedData, genderLabel);
                                                                                };
                                                                                
                                                                                p1Points = getPlayerPoints(players[0]);
                                                                                p2Points = getPlayerPoints(players[1]);
                                                                                
                                                                                const teamPoints = manualSeedInfo?.totalPoints || (p1Points + p2Points);
                                                                                const explicitSeed = item.Ranking || p.Seed || manualSeedInfo?.seed || 9999;
                                                                                
                                                                                return { ...item, _players: players, _p1Points: p1Points, _p2Points: p2Points, _teamPoints: teamPoints, _explicitSeed: explicitSeed };
                                                                            });
                                                                            
                                                                            enrichedParticipants.sort((a, b) => {
                                                                                if (a._explicitSeed !== 9999 || b._explicitSeed !== 9999) {
                                                                                    return a._explicitSeed - b._explicitSeed;
                                                                                }
                                                                                return b._teamPoints - a._teamPoints;
                                                                            });

                                                                            return enrichedParticipants.map((item, pIdx) => {
                                                                                const p = item.Participant || {};
                                                                                const players = item._players;
                                                                                const rank = item.Ranking;
                                                                                const seed = p.Seed;
                                                                                const manualSeedInfo = event.is_manual ? manualTeamSeeds[cls.Id]?.teams.find((t) => t.id === p.Id) : null;
                                                                                
                                                                                const getProfileImage = (playerObj) => {
                                                                                    if (!playerObj) return null;
                                                                                    const rId = playerObj.RankedinId || playerObj.Id?.toString();
                                                                                    const pName = (playerObj.Name || '').toLowerCase();
                                                                                    if (rId && fourMPlayers[rId]) return fourMPlayers[rId];
                                                                                    if (pName && fourMPlayers[pName]) return fourMPlayers[pName];
                                                                                    return playerObj.Image;
                                                                                };

                                                                                const displayNumber = manualSeedInfo?.seed ?? (seed ? Number(seed) : null) ?? (rank ? Number(rank) : null) ?? (pIdx + 1);

                                                                                return (
                                                                                    <div key={pIdx} className="bg-white px-4 py-2.5 sm:px-5 sm:py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                                                                                        <div className="flex items-center gap-3 sm:gap-4">
                                                                                            <div className="flex-shrink-0 w-8 sm:w-9 text-center self-center">
                                                                                                <span className="text-lg sm:text-xl font-black text-[#0a0a0a] tabular-nums leading-none">
                                                                                                    {displayNumber}
                                                                                                </span>
                                                                                            </div>

                                                                                            <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0">
                                                                                                {players.map((player, idx) => {
                                                                                                    const pts = idx === 0 ? item._p1Points : item._p2Points;
                                                                                                    const hasPts = pts > 0;
                                                                                                    const pName = (player.Name || '').split(' ')[0];
                                                                                                    const avatarUrl = getProfileImage(player);
                                                                                                    return (
                                                                                                        <button
                                                                                                            key={idx}
                                                                                                            type="button"
                                                                                                            onClick={() => openPlayerProfile(player)}
                                                                                                            disabled={loadingPlayerProfile}
                                                                                                            title={`View ${player.Name || 'player'} profile`}
                                                                                                            className="flex flex-col items-center min-w-[80px] group cursor-pointer disabled:opacity-60 disabled:cursor-wait bg-transparent border-0 p-0"
                                                                                                        >
                                                                                                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200 flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 group-hover:border-slate-300 group-focus-visible:ring-2 group-focus-visible:ring-offset-2 group-focus-visible:ring-slate-400">
                                                                                                                {avatarUrl ? (
                                                                                                                    <img src={avatarUrl} alt={player.Name} className="w-full h-full object-cover" />
                                                                                                                ) : (
                                                                                                                    <User className="w-7 h-7 text-gray-400" />
                                                                                                                )}
                                                                                                            </div>
                                                                                                            <span className="text-sm font-bold text-slate-800 mt-1.5 text-center max-w-[96px] truncate group-hover:underline underline-offset-2">
                                                                                                                {pName}
                                                                                                            </span>
                                                                                                            {hasPts && (
                                                                                                                <span className="mt-1 bg-[#CCFF00] text-[#0a0a0a] text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm">
                                                                                                                    {pts.toLocaleString()}
                                                                                                                </span>
                                                                                                            )}
                                                                                                        </button>
                                                                                                    );
                                                                                                })}
                                                                                            </div>

                                                                                            {(item._teamPoints > 0 || rank || seed || manualSeedInfo?.seed) && (
                                                                                                <div className="flex items-center flex-shrink-0 border-l border-gray-200 pl-3 sm:pl-4 h-14 sm:h-16">
                                                                                                    <div className="text-right">
                                                                                                        <div className="flex flex-wrap justify-end gap-1 mb-1">
                                                                                                            {rank && <span className="text-[8px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Rank {rank}</span>}
                                                                                                            {(seed || manualSeedInfo?.seed) && (
                                                                                                                <span className="text-[8px] font-semibold uppercase tracking-wide bg-[#CCFF00] text-[#0a0a0a] px-2 py-0.5 rounded-full">
                                                                                                                    Seed {manualSeedInfo?.seed || seed}
                                                                                                                </span>
                                                                                                            )}
                                                                                                        </div>
                                                                                                        {item._teamPoints > 0 && (
                                                                                                            <>
                                                                                                                <span className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Team Points</span>
                                                                                                                <span className="block text-base sm:text-lg font-semibold text-slate-800 leading-none">
                                                                                                                    {item._teamPoints.toLocaleString()}
                                                                                                                </span>
                                                                                                            </>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            });
                                                                        })()}
                                                                    </div>
                                                                ) : (
                                                                    <div className="px-6 py-10 text-center">
                                                                        <Users className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                                                                        <p className="text-xs font-bold text-gray-400">No teams registered yet</p>
                                                                    </div>
                                                                )}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            );
                                        })
                                    )
                                    ) : (
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center text-center">
                                            <Users className="w-12 h-12 text-gray-200 mb-4" />
                                            <h3 className="text-base font-semibold text-slate-900 mb-2">No Players Yet</h3>
                                            <p className="text-sm text-gray-400">The player list will populate closer to the event.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ══ DRAWS TAB ══ */}
                            {activeTab === 'draws' && (
                                <div className="space-y-6">
                                    {fetchingRankedinData && !(hasDraw || hasResults) ? (
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center text-center">
                                            <div className="w-8 h-8 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin mb-4" />
                                            <p className="text-xs font-bold text-gray-400">Checking for published draws...</p>
                                        </div>
                                    ) : hasDraw || hasResults ? (
                                        <Link
                                            to={`/draws/${event.slug || event.rankedin_id || extractRankedinId(event.rankedin_url)}`}
                                            className="flex items-center justify-between p-6 bg-[#0a0a0a] rounded-2xl shadow-lg hover:bg-[#0a0a0a]/90 transition-all group"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-[#CCFF00]/10 flex items-center justify-center">
                                                    <GitBranch className="w-6 h-6 text-[#CCFF00]" />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-semibold text-white tracking-normal">Tournament Draws</h3>
                                                    <p className="text-[10px] font-bold text-[#CCFF00] uppercase tracking-widest mt-0.5">View Live Brackets & Match Results</p>
                                                </div>
                                            </div>
                                            <ArrowRight className="w-5 h-5 text-[#CCFF00] group-hover:translate-x-1 transition-transform" />
                                        </Link>
                                    ) : (
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center text-center">
                                            <GitBranch className="w-12 h-12 text-gray-200 mb-4" />
                                            <h3 className="text-base font-semibold text-slate-900 mb-2">Draws Coming Soon</h3>
                                            <p className="text-sm text-gray-400">Draws will be released shortly before the tournament begins.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ══ RESULTS TAB ══ */}
                            {activeTab === 'results' && (
                                <div className="space-y-6">
                                    {isEventPassed || hasResults ? (
                                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
                                                <div className="w-8 h-8 rounded-lg bg-[#CCFF00]/20 flex items-center justify-center">
                                                    <Trophy className="w-4 h-4 text-[#0a0a0a]" />
                                                </div>
                                                <h2 className="font-semibold text-slate-900 text-sm tracking-normal">Champions</h2>
                                            </div>
                                            {winners.length > 0 ? (
                                                <div className="divide-y divide-gray-50">
                                                    {winners.map((winner, idx) => {
                                                        const isExpanded = expandedResults[idx];
                                                        return (
                                                            <div key={idx} className="px-6 py-5">
                                                                <button
                                                                    onClick={() => setExpandedResults(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                                                    className="w-full flex items-center justify-between group"
                                                                >
                                                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#CCFF00] bg-[#0a0a0a] px-2 py-1 rounded-md inline-block">
                                                                        {winner.CategoryName || winner.className || 'Unknown Division'}
                                                                    </p>
                                                                    <div className="text-gray-400 group-hover:text-[#0a0a0a] transition-colors">
                                                                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                                                    </div>
                                                                </button>

                                                                <AnimatePresence>
                                                                    {isExpanded && (
                                                                        <motion.div
                                                                            initial={{ height: 0, opacity: 0 }}
                                                                            animate={{ height: "auto", opacity: 1 }}
                                                                            exit={{ height: 0, opacity: 0 }}
                                                                            className="overflow-hidden"
                                                                        >
                                                                            <div className="space-y-2 pt-4">
                                                                                <div className="flex items-center justify-between bg-[#CCFF00]/5 border border-[#CCFF00]/20 p-3 rounded-xl">
                                                                                    <div>
                                                                                        <p className="text-[8px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">1st Place</p>
                                                                                        <p className="text-sm font-semibold text-slate-900">{winner.Winner?.Name || winner.winners || 'TBD'}</p>
                                                                                    </div>
                                                                                    <span className="text-2xl">🥇</span>
                                                                                </div>
                                                                                {(winner.RunnerUp?.Name || winner.runnerUp) && (
                                                                                    <div className="flex items-center justify-between bg-gray-50 border border-gray-100 p-3 rounded-xl">
                                                                                        <div>
                                                                                            <p className="text-[8px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">2nd Place</p>
                                                                                            <p className="text-sm font-bold text-slate-700">{winner.RunnerUp?.Name || winner.runnerUp}</p>
                                                                                        </div>
                                                                                        <span className="text-2xl">🥈</span>
                                                                                    </div>
                                                                                )}
                                                                                {(winner.ThirdPlace?.Name || winner.thirdPlace) && (
                                                                                    <div className="flex items-center justify-between bg-orange-50 border border-orange-100 p-3 rounded-xl">
                                                                                        <div>
                                                                                            <p className="text-[8px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Semi-Finalist</p>
                                                                                            <p className="text-sm font-bold text-slate-700">{winner.ThirdPlace?.Name || winner.thirdPlace}</p>
                                                                                        </div>
                                                                                        <span className="text-2xl">🥉</span>
                                                                                    </div>
                                                                                )}
                                                                                {(winner.FourthPlace?.Name || winner.fourthPlace) && (
                                                                                    <div className="flex items-center justify-between bg-gray-50 border border-gray-100 p-3 rounded-xl">
                                                                                        <div>
                                                                                            <p className="text-[8px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Semi-Finalist</p>
                                                                                            <p className="text-sm font-bold text-slate-700">{winner.FourthPlace?.Name || winner.fourthPlace}</p>
                                                                                        </div>
                                                                                        <span className="text-2xl">🏅</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : fetchingRankedinData ? (
                                                <div className="px-6 py-10 flex flex-col items-center justify-center">
                                                    <div className="w-8 h-8 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin mb-4"></div>
                                                    <p className="text-xs font-bold text-gray-400">Loading results...</p>
                                                </div>
                                            ) : (
                                                <div className="px-6 py-10 text-center">
                                                    <Trophy className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                                                    <p className="text-xs font-bold text-gray-400">Results pending</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center text-center">
                                            <Trophy className="w-12 h-12 text-gray-200 mb-4" />
                                            <h3 className="text-base font-semibold text-slate-900 mb-2">No Results Yet</h3>
                                            <p className="text-sm text-gray-400">Tournament results will appear here once matches are completed.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ══ MEDIA TAB ══ */}
                            {activeTab === 'media' && (
                                <div className="space-y-6">
                                    {/* Gallery card */}
                                    {albumInfo && (
                                        <div className="bg-[#0a0a0a] rounded-2xl shadow-lg overflow-hidden">
                                            {albumPhotos.length > 0 && (
                                                <div className="grid grid-cols-3 h-48">
                                                    {albumPhotos.slice(0, 3).map((photo, i) => (
                                                        <div key={i} className={`relative overflow-hidden ${i === 0 ? 'col-span-2' : ''}`}>
                                                            <img
                                                                src={photo.url || photo.photo_url}
                                                                alt=""
                                                                className="w-full h-full object-cover opacity-80"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="p-6 flex items-center justify-between">
                                                <div>
                                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#CCFF00] mb-1">Official Gallery</p>
                                                    <h3 className="text-lg font-semibold text-white tracking-normal">{albumInfo.title}</h3>
                                                    <p className="text-xs text-gray-400 mt-1 font-bold">{albumPhotos.length} Photos</p>
                                                </div>
                                                <Link
                                                    to={`/gallery/${albumInfo.slug || albumInfo.id}`}
                                                    className="px-6 py-3 bg-[#CCFF00] !text-black rounded-xl font-semibold text-xs tracking-normal hover:bg-white transition-colors flex-shrink-0 ml-4"
                                                >
                                                    View All
                                                </Link>
                                            </div>
                                        </div>
                                    )}

                                    {/* YouTube Videos */}
                                    {event.youtube_playlist_url && (
                                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
                                                <div className="w-8 h-8 rounded-lg bg-[#CCFF00]/20 flex items-center justify-center">
                                                    <PlayCircle className="w-4 h-4 text-[#0a0a0a]" />
                                                </div>
                                                <h2 className="font-semibold text-slate-900 text-sm tracking-normal">Event Highlights</h2>
                                            </div>
                                            {fetchingVideos ? (
                                                <div className="flex items-center justify-center py-12">
                                                    <Loader className="w-6 h-6 animate-spin text-gray-300" />
                                                </div>
                                            ) : playlistVideos.length > 0 ? (
                                                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {playlistVideos.map((video) => (
                                                        <div
                                                            key={video.id}
                                                            className="group relative cursor-pointer rounded-xl overflow-hidden border border-gray-100 shadow-sm"
                                                            onClick={() => setVideoModal({ isOpen: true, url: video.id, title: video.title })}
                                                        >
                                                            <div className="aspect-video relative bg-gray-100">
                                                                <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                                                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                                                                    <div className="w-11 h-11 rounded-full bg-[#CCFF00] flex items-center justify-center shadow-lg">
                                                                        <Play className="w-5 h-5 text-[#0a0a0a] fill-current ml-0.5" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="p-3">
                                                                <p className="text-xs font-bold text-[#0a0a0a] line-clamp-2 leading-tight group-hover:text-gray-600 transition-colors">{video.title}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="p-5">
                                                    {getPlaylistEmbedUrl(event.youtube_playlist_url) ? (
                                                        <div className="aspect-video w-full rounded-xl overflow-hidden bg-gray-100">
                                                            <iframe
                                                                src={getPlaylistEmbedUrl(event.youtube_playlist_url)}
                                                                title="YouTube playlist player"
                                                                className="w-full h-full border-0"
                                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                                allowFullScreen
                                                            />
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {!albumInfo && !event.youtube_playlist_url && (
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center text-center">
                                            <ImageIcon className="w-12 h-12 text-gray-200 mb-4" />
                                            <h3 className="text-base font-semibold text-slate-900 mb-2">No Media Yet</h3>
                                            <p className="text-sm text-gray-400">Media will be added after the event.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                        </motion.div>
                    </AnimatePresence>
                </div>

                {isEventPassed && (hasResults || hasDraw) && (
                    <div className="fixed bottom-[88px] inset-x-4 z-50 md:hidden bg-white/95 backdrop-blur-md border border-gray-200/80 p-3.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                        {(() => {
                            const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
                            return (
                                <Link
                                    to={`/draws/${event.slug || rId}`}
                                    className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-semibold text-xs tracking-normal transition-all hover:brightness-110"
                                    style={registeredStatusStyle}
                                >
                                    <GitBranch className="w-4 h-4" />
                                    View Draws & Results
                                </Link>
                            );
                        })()}
                    </div>
                )}

            </div>

            {/* Registration Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[1100]">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1100]"
                            onClick={() => setIsModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center pointer-events-none sm:p-6 md:p-8"
                        >
                            <div className="bg-[#0a0a0a] w-[95vw] md:w-[90vw] max-w-5xl rounded-t-3xl sm:rounded-3xl shadow-2xl pointer-events-auto flex flex-col max-h-[90vh] sm:max-h-[92vh] border border-white/10 overflow-hidden">
                                {/* Modal Header */}
                                <div className="bg-black/20 backdrop-blur-xl px-6 py-4 flex justify-between items-center border-b border-white/5 sticky top-0 z-10">
                                    <h3 className="text-white font-bold text-lg">
                                        {regStep === 1
                                            ? (calculateTotalAmount() > 0
                                                ? `Payment for ${event?.event_name || 'Event'}`
                                                : (isRegistered ? 'Registered' : `Registration for ${event?.event_name || 'Event'}`))
                                            : (isRegistered ? 'Payment Successful' : 'Registration Successful')}
                                    </h3>
                                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2 transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Modal Content */}
                                <div className="p-4 md:p-6 overflow-y-auto flex-1 custom-scrollbar">
                                    {regStep === 1 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                            <div className="col-span-1 space-y-4">
                                                <div className="md:hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsMobilePlayerInfoOpen(!isMobilePlayerInfoOpen)}
                                                        className="w-full bg-[#0a0a0a] shadow-sm border border-white/10 rounded-xl p-4 flex items-center justify-between transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-padel-green/20 flex items-center justify-center">
                                                                <User className="w-4 h-4 text-padel-green" />
                                                            </div>
                                                            <span className="text-xs font-semibold tracking-normal text-white">Player Information</span>
                                                        </div>
                                                        {isMobilePlayerInfoOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                                                    </button>
                                                </div>
                                                <div className={`space-y-4 ${isMobilePlayerInfoOpen ? 'block' : 'hidden md:block'}`}>
                                                    <div className="grid grid-cols-1 gap-3">
                                                        <div className="space-y-1.5">
                                                            <label className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 ml-3">Full Name</label>
                                                            <div className="relative group">
                                                                <User className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-padel-green transition-colors" size={16} />
                                                                <input
                                                                    type="text"
                                                                    name="full_name"
                                                                    value={formData.full_name}
                                                                    onChange={handleInputChange}
                                                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-base text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all font-bold placeholder:text-gray-600"
                                                                    placeholder="Player Full Name"
                                                                    required
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            <label className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 ml-3">Email Address</label>
                                                            <div className="relative">
                                                                <Mail className={`absolute left-5 top-1/2 -translate-y-1/2 ${emailCheckStatus === 'not_found' ? 'text-red-500' : 'text-padel-green'}`} size={16} />
                                                                <input
                                                                    type="email"
                                                                    name="email"
                                                                    value={formData.email}
                                                                    onChange={handleInputChange}
                                                                    className={`w-full bg-white/5 border ${emailCheckStatus === 'not_found' ? 'border-red-500/50' : 'border-white/10'} rounded-xl pl-12 pr-10 py-3 text-base text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all font-bold placeholder:text-gray-600`}
                                                                    placeholder="email@example.com"
                                                                    required
                                                                />
                                                                {emailCheckStatus === 'checking' && (
                                                                    <Loader className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                                                                )}
                                                            </div>
                                                            {emailCheckStatus === 'not_found' && (
                                                                <p className="text-[9px] text-red-500 font-bold uppercase tracking-widest bg-red-500/10 py-1.5 px-3 rounded-lg border border-red-500/20 inline-block mt-1">Profile not found. Please create a profile first.</p>
                                                            )}
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            <label className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 ml-3">Phone Number</label>
                                                            <div className="relative">
                                                                <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-padel-green" size={16} />
                                                                <input
                                                                    type="tel"
                                                                    name="phone"
                                                                    value={formData.phone}
                                                                    onChange={handleInputChange}
                                                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-base text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all font-bold placeholder:text-gray-600"
                                                                    placeholder="+27 00 000 0000"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>


                                                    <div className="space-y-3">
                                                        <div className="hidden items-center justify-between bg-[#0a0a0a] p-5 rounded-2xl border border-white/10 shadow-sm group">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all duration-500">
                                                                    <Users size={20} />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-semibold text-white tracking-normal">Register with a Partner?</p>
                                                                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Optional Entry Fee Payment</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const newState = !hasPartner;
                                                                    setHasPartner(newState);
                                                                    if (!newState) {
                                                                        setPartnerProfile(null);
                                                                        setPartnerSearchResults([]);
                                                                        setPayForPartner(false);
                                                                        setFormData(prev => ({ ...prev, partner_name: '' }));
                                                                    }
                                                                }}
                                                                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${hasPartner ? 'bg-blue-400' : 'bg-white/20'}`}
                                                            >
                                                                <span
                                                                    aria-hidden="true"
                                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[#0a0a0a] shadow-xl ring-0 transition duration-300 ease-in-out ${hasPartner ? 'translate-x-5' : 'translate-x-0'}`}
                                                                />
                                                            </button>
                                                        </div>

                                                        <AnimatePresence>
                                                            {hasPartner && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, height: 0 }}
                                                                    animate={{ opacity: 1, height: 'auto' }}
                                                                    exit={{ opacity: 0, height: 0 }}
                                                                    className="space-y-3"
                                                                >
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 ml-3">Partner Name</label>
                                                                        <div className="relative group">
                                                                            <Users className="absolute left-5 top-1/2 -translate-y-1/2 text-blue-500" size={16} />
                                                                            <input
                                                                                type="text"
                                                                                name="partner_name"
                                                                                value={formData.partner_name}
                                                                                onChange={handleInputChange}
                                                                                autoComplete="off"
                                                                                className={`w-full bg-white/5 border ${partnerLookupError ? 'border-red-500' : 'border-white/10'} rounded-xl pl-12 pr-20 py-3 text-base text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all font-bold placeholder:text-gray-600`}
                                                                                placeholder="Type 2+ characters to search..."
                                                                            />
                                                                            {isLookingUpPartner && (
                                                                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                                                    <Loader className="w-4 h-4 animate-spin text-blue-400" />
                                                                                </div>
                                                                            )}
                                                                            {partnerProfile && !isLookingUpPartner && (
                                                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-blue-400 text-black px-2 py-1 rounded-lg shadow-sm font-semibold text-[8px]">
                                                                                    <CheckCircle className="w-3 h-3 fill-current" />
                                                                                    Found
                                                                                </div>
                                                                            )}

                                                                            {/* Search Results Dropdown */}
                                                                            <AnimatePresence>
                                                                                {partnerSearchResults.length > 0 && (
                                                                                    <motion.div
                                                                                        initial={{ opacity: 0, y: -5 }}
                                                                                        animate={{ opacity: 1, y: 0 }}
                                                                                        exit={{ opacity: 0, y: -5 }}
                                                                                        className="absolute top-full left-0 right-0 mt-1 bg-[#0a0a0a] rounded-xl border border-white/5 shadow-2xl z-[1200] overflow-hidden p-1 max-h-48 overflow-y-auto"
                                                                                    >
                                                                                        {partnerSearchResults.map((player) => (
                                                                                            <button
                                                                                                key={player.id}
                                                                                                type="button"
                                                                                                onClick={() => handleSelectPartner(player)}
                                                                                                className="w-full flex items-center justify-between p-2.5 hover:bg-slate-50 rounded-lg transition-all text-left group/item"
                                                                                            >
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <div className="w-6 h-6 rounded-full bg-blue-400/20 flex items-center justify-center text-blue-400 group-hover/item:bg-blue-400 group-hover/item:text-black transition-colors">
                                                                                                        <User size={12} />
                                                                                                    </div>
                                                                                                    <div>
                                                                                                        <p className="text-xs font-bold text-white">{player.name}</p>
                                                                                                        <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">{player.category || 'No Category'}</p>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <CheckCircle className="w-3 h-3 text-blue-400 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                                                                                            </button>
                                                                                        ))}
                                                                                    </motion.div>
                                                                                )}
                                                                            </AnimatePresence>
                                                                        </div>
                                                                        {partnerLookupError && !partnerSearchResults.length && (
                                                                            <p className="text-[9px] text-red-600 font-bold uppercase tracking-widest ml-12 bg-red-50 py-1.5 px-3 rounded-lg border border-red-100 inline-block">
                                                                                {partnerLookupError}
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    {partnerProfile && (
                                                                        <>
                                                                            <motion.div
                                                                                initial={{ opacity: 0, y: 5 }}
                                                                                animate={{ opacity: 1, y: 0 }}
                                                                                className="bg-blue-50 border border-blue-100 p-4 rounded-[1.5rem] flex items-center justify-between group hover:bg-blue-100 transition-colors"
                                                                            >
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className="w-10 h-10 bg-[#0a0a0a] rounded-xl flex items-center justify-center text-blue-500 shadow-sm">
                                                                                        <CreditCard className="w-5 h-5" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <h5 className="font-semibold text-white text-xs tracking-normal">Pay for {partnerProfile.name}?</h5>
                                                                                        <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                                                                            Multi-Division Fee Auto-Calculated
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setPayForPartner(!payForPartner)}
                                                                                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${payForPartner ? 'bg-blue-400' : 'bg-slate-200'}`}
                                                                                >
                                                                                    <span
                                                                                        aria-hidden="true"
                                                                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[#0a0a0a] shadow ring-0 transition duration-200 ease-in-out ${payForPartner ? 'translate-x-5' : 'translate-x-0'}`}
                                                                                    />
                                                                                </button>
                                                                            </motion.div>

                                                                            <AnimatePresence>
                                                                                {payForPartner && !partnerProfile.paid_registration && (
                                                                                    <motion.div
                                                                                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                                                                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                                                                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                                                                        className="overflow-hidden"
                                                                                    >
                                                                                        <div className="flex items-center justify-between bg-[#0a0a0a] p-4 rounded-2xl border border-white/10 shadow-sm group">
                                                                                            <div className="flex items-center gap-2">
                                                                                                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                                                                                                    <CreditCard size={16} />
                                                                                                </div>
                                                                                                <div>
                                                                                                    <p className="text-xs font-bold text-white uppercase tracking-tight">Partner License</p>
                                                                                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                                                                                                        {licenseSalesOpen ? 'Choose license type' : 'License sales are closed'}
                                                                                                    </p>
                                                                                                </div>
                                                                                            </div>
                                                                                            {licenseSalesOpen && (
                                                                                            <div className="flex bg-white/10 rounded-full p-1 border border-white/10">
                                                                                                {licenseTypes.includes('temporary') && (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => setPartnerLicenseChoice('temporary')}
                                                                                                    className={`text-[10px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${partnerLicenseChoice === 'temporary' ? 'bg-blue-400 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                                                                                >
                                                                                                    Temp <span className="opacity-70">({formatCurrency(licenseCharge('temporary'))})</span>
                                                                                                </button>
                                                                                                )}
                                                                                                {licenseTypes.includes('full') && (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => setPartnerLicenseChoice('full')}
                                                                                                    className={`text-[10px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${partnerLicenseChoice === 'full' ? 'bg-[#0a0a0a] text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                                                                                >
                                                                                                    Full <span className="opacity-70">({formatCurrency(licenseCharge('full'))})</span>
                                                                                                </button>
                                                                                                )}
                                                                                            </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </motion.div>
                                                                                )}
                                                                            </AnimatePresence>
                                                                        </>
                                                                    )}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>

                                                        {playerProfileData && !playerProfileData.paid_registration && (
                                                            <motion.div
                                                                initial={{ opacity: 0, y: 5 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                className="flex items-center justify-between bg-[#0a0a0a] p-4 rounded-2xl border border-white/10 shadow-sm group mt-3"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                                                                        <CreditCard size={16} />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-bold text-white uppercase tracking-tight">License Required</p>
                                                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                                                                            {licenseSalesOpen ? 'Choose license type' : 'License sales are closed'}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {licenseSalesOpen && (
                                                                <div className="flex bg-white/10 rounded-full p-1 border border-white/10">
                                                                    {licenseTypes.includes('temporary') && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setLicenseChoice('temporary')}
                                                                        className={`text-[10px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${licenseChoice === 'temporary' ? 'bg-padel-green text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                                                    >
                                                                        Temp <span className="opacity-70">({formatCurrency(licenseCharge('temporary'))})</span>
                                                                    </button>
                                                                    )}
                                                                    {licenseTypes.includes('full') && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setLicenseChoice('full')}
                                                                        className={`text-[10px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${licenseChoice === 'full' ? 'bg-[#0a0a0a] text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                                                    >
                                                                        Full <span className="opacity-70">({formatCurrency(licenseCharge('full'))})</span>
                                                                    </button>
                                                                    )}
                                                                </div>
                                                                )}
                                                            </motion.div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Read-Only Registered Divisions */}
                                                <div className="space-y-3 mt-4">
                                                    <div className="flex items-center justify-between ml-3 mb-1">
                                                        <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Registered Divisions</label>
                                                    </div>

                                                    {isCheckingReg ? (
                                                        <div className="flex items-center gap-4 bg-slate-900/50 border border-white/5 rounded-2xl px-6 py-4 animate-pulse">
                                                            <Loader className="w-5 h-5 animate-spin text-padel-green" />
                                                            <span className="text-sm text-gray-400 font-bold uppercase tracking-widest">Syncing Rankedin Status...</span>
                                                        </div>
                                                    ) : availableDivisions.length > 0 ? (
                                                        <div className="flex flex-wrap gap-2 px-1">
                                                            {selectedDivisions.length === 0 ? (
                                                                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">No unpaid entries found.</span>
                                                            ) : (
                                                                selectedDivisions.map(div => (
                                                                    <span key={div} className="text-[10px] font-semibold tracking-normal px-3 py-2 rounded-lg bg-padel-green/20 text-padel-green border border-padel-green/30">
                                                                        {div}
                                                                    </span>
                                                                ))
                                                            )}
                                                        </div>
                                                    ) : formData.email && (
                                                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6 text-center">
                                                            <Trophy className="w-8 h-8 text-orange-500/40 mx-auto mb-3" />
                                                            <p className="text-xs text-orange-400 font-semibold mb-1">Entry Not Found</p>
                                                            <p className="text-[10px] text-orange-400/60 font-bold uppercase tracking-widest leading-relaxed">
                                                                Please ensure you are registered on Rankedin <br />for this specific event.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="col-span-1">
                                                <div className="bg-white/5 rounded-[1.5rem] p-4 text-white overflow-hidden relative group border border-white/10 shadow-md h-full flex flex-col justify-between">
                                                    {/* Decorative Background Glow */}
                                                    <div className="absolute top-0 right-0 w-48 h-48 bg-padel-green/10 rounded-full blur-3xl -mr-24 -mt-24 group-hover:bg-padel-green/20 transition-colors duration-1000" />

                                                    <div className="relative z-10 space-y-4">
                                                        {/* Itemized list */}
                                                        <div className="space-y-3">
                                                            <div className="space-y-2">
                                                                {/* Registrant Section */}
                                                                <div className="space-y-2">
                                                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-padel-green mb-1">Your Entries</p>
                                                                    {selectedDivisions.map(div => {
                                                                        const pState = divisionPartners[div] || {};
                                                                        const pProf = pState.partnerProfile;
                                                                        return (
                                                                            <div key={`div-${div}`} className="flex flex-col gap-2 bg-[#0a0a0a] p-3 rounded-xl border border-white/10 shadow-sm">
                                                                                <div className="flex justify-between items-center">
                                                                                    <div className="flex items-center gap-3">
                                                                                        <div className="w-6 h-6 rounded-full bg-padel-green/20 flex items-center justify-center border border-padel-green/30 text-padel-green font-semibold text-[9px]">
                                                                                            {div.substring(0, 2)}
                                                                                        </div>
                                                                                        <div>
                                                                                            <h4 className="font-bold text-white text-xs leading-none">{div}</h4>
                                                                                            <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wider mt-0.5">Selected Category</p>
                                                                                        </div>
                                                                                    </div>
                                                                                    <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap pt-0.5 text-white">R{getEntryFeeForCategory(div)}</span>
                                                                                </div>
                                                                                <div className="mt-2 pt-2 border-t border-white/5 space-y-3">
                                                                                    {!pState.hasPartner ? (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                setDivisionPartners(prev => ({
                                                                                                    ...prev,
                                                                                                    [div]: { ...prev[div], hasPartner: true }
                                                                                                }));
                                                                                            }}
                                                                                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-white/20 text-gray-400 hover:text-padel-green hover:border-padel-green/50 hover:bg-padel-green/5 transition-all text-xs font-bold tracking-wider"
                                                                                        >
                                                                                            <UserPlus size={14} /> Add a Partner
                                                                                        </button>
                                                                                    ) : !pProf ? (
                                                                                        <div className="relative">
                                                                                            <div className="flex justify-between items-center mb-2 px-1">
                                                                                                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Partner Search</span>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => {
                                                                                                        setDivisionPartners(prev => ({
                                                                                                            ...prev,
                                                                                                            [div]: { ...prev[div], hasPartner: false, partnerName: '', partnerProfile: null, payForPartner: false }
                                                                                                        }));
                                                                                                    }}
                                                                                                    className="text-[9px] text-red-400 hover:text-red-300 font-bold uppercase tracking-wider"
                                                                                                >
                                                                                                    Remove
                                                                                                </button>
                                                                                            </div>
                                                                                            <div className="relative">
                                                                                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                                                                <input
                                                                                                    type="text"
                                                                                                    value={pState.partnerName || ''}
                                                                                                    onChange={(e) => handlePartnerSearchForDivision(div, e.target.value)}
                                                                                                    autoComplete="off"
                                                                                                    className={`w-full bg-white/5 border ${pState.partnerLookupError ? 'border-red-500/50' : 'border-white/10'
                                                                                                        } rounded-lg pl-10 pr-10 py-2.5 text-base text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all placeholder:text-gray-600`}
                                                                                                    placeholder={`Search partner for ${div}...`}
                                                                                                />
                                                                                                {pState.isLookingUpPartner && (
                                                                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                                                                        <Loader className="w-3 h-3 animate-spin text-padel-green" />
                                                                                                    </div>
                                                                                                )}
                                                                                                {pState.partnerSearchResults?.length > 0 && (
                                                                                                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a] border border-slate-200 rounded-xl shadow-2xl overflow-hidden z-[1150]">
                                                                                                        <div className="max-h-48 overflow-y-auto p-1.5 custom-scrollbar space-y-1">
                                                                                                            {pState.partnerSearchResults.map(player => (
                                                                                                                <button
                                                                                                                    key={player.id}
                                                                                                                    onClick={() => handleSelectPartnerForDivision(div, player)}
                                                                                                                    className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors group text-left"
                                                                                                                >
                                                                                                                    <div>
                                                                                                                        <p className="text-white font-bold text-xs group-hover:text-padel-green transition-colors">{player.name}</p>
                                                                                                                        <p className="text-gray-500 text-[10px] mt-0.5 line-clamp-1">{player.email}</p>
                                                                                                                    </div>
                                                                                                                </button>
                                                                                                            ))}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="bg-padel-green/5 border border-padel-green/20 rounded-xl p-3">
                                                                                            <div className="flex items-center justify-between mb-3">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <div className="w-6 h-6 rounded-full bg-padel-green/20 flex items-center justify-center">
                                                                                                        <CheckCircle className="w-3 h-3 text-padel-green" />
                                                                                                    </div>
                                                                                                    <div>
                                                                                                        <p className="text-xs font-bold text-white leading-none">{pProf.name}</p>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <button
                                                                                                    onClick={() => setDivisionPartners(prev => ({ ...prev, [div]: { ...prev[div], partnerProfile: null, partnerName: '' } }))}
                                                                                                    className="p-1.5 rounded-full hover:bg-slate-200 text-gray-500 hover:text-white transition-colors"
                                                                                                >
                                                                                                    <X className="w-3 h-3" />
                                                                                                </button>
                                                                                            </div>
                                                                                            {getEntryFeeForCategory(div) > 0 && (
                                                                                                <>
                                                                                                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                                                                                        <div className="flex items-center gap-2">
                                                                                                            <CreditCard className="w-3 h-3 text-gray-400" />
                                                                                                            <span className="font-bold text-gray-300 text-[10px] uppercase">Pay for partner entry fee?</span>
                                                                                                        </div>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDivisionPartners(prev => ({ ...prev, [div]: { ...prev[div], payForPartner: !pState.payForPartner } }))}
                                                                                                            className={`relative inline-flex h-5 w-9 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${pState.payForPartner ? 'bg-blue-400' : 'bg-gray-300'}`}
                                                                                                        >
                                                                                                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[#0a0a0a] shadow transition ${pState.payForPartner ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                                                        </button>
                                                                                                    </div>
                                                                                                    {pState.payForPartner && !pProf.paid_registration && (
                                                                                                        <>
                                                                                                            <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/5">
                                                                                                                <span className="text-[9px] font-bold text-gray-300 uppercase">Pay for partner's license?</span>
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    onClick={() => setDivisionPartners(prev => ({ ...prev, [div]: { ...prev[div], payForPartnerLicense: !pState.payForPartnerLicense } }))}
                                                                                                                    className={`relative inline-flex h-5 w-9 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${pState.payForPartnerLicense ? 'bg-blue-400' : 'bg-gray-300'}`}
                                                                                                                >
                                                                                                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[#0a0a0a] shadow transition ${pState.payForPartnerLicense ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                                                                </button>
                                                                                                            </div>
                                                                                                            {pState.payForPartnerLicense && licenseSalesOpen && (
                                                                                                                <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/5">
                                                                                                                    <span className="text-[9px] font-bold text-gray-400 uppercase">License Choice</span>
                                                                                                                    <div className="flex bg-white/10 rounded-full p-0.5 border border-white/10">
                                                                                                                        {licenseTypes.includes('temporary') && (
                                                                                                                        <button type="button" onClick={() => setDivisionPartners(prev => ({ ...prev, [div]: { ...prev[div], partnerLicenseChoice: 'temporary' } }))} className={`text-[8px] font-semibold uppercase px-2 py-1 rounded-full ${pState.partnerLicenseChoice !== 'full' ? 'bg-blue-400 text-white' : 'text-gray-400'}`}>Temp</button>
                                                                                                                        )}
                                                                                                                        {licenseTypes.includes('full') && (
                                                                                                                        <button type="button" onClick={() => setDivisionPartners(prev => ({ ...prev, [div]: { ...prev[div], partnerLicenseChoice: 'full' } }))} className={`text-[8px] font-semibold uppercase px-2 py-1 rounded-full ${pState.partnerLicenseChoice === 'full' ? 'bg-[#0a0a0a] text-white shadow-sm' : 'text-gray-400'}`}>Full</button>
                                                                                                                        )}
                                                                                                                    </div>
                                                                                                                </div>
                                                                                                            )}
                                                                                                        </>
                                                                                                    )}
                                                                                                </>
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                    {selectedDivisions.length === 0 && (
                                                                        <div className="flex justify-between items-start gap-4 opacity-50 p-3">
                                                                            <div className="space-y-0.5">
                                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-white">{formData.full_name || 'You'}</p>
                                                                                <p className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">No Category Selected</p>
                                                                            </div>
                                                                            <span className="text-xs font-semibold tracking-tight whitespace-nowrap pt-0.5 text-white">R0</span>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {playerProfileData && !playerProfileData.paid_registration && licenseSalesOpen && (
                                                                    <div className="flex justify-between items-center bg-padel-green/10 p-2.5 rounded-xl border border-padel-green/20 mt-2">
                                                                        <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-padel-green">4M Padel {licenseChoice === 'full' ? 'Full' : 'Temp'} License</span>
                                                                        <span className="text-[10px] font-semibold text-padel-green">{formatCurrency(licenseCharge(licenseChoice))}</span>
                                                                    </div>
                                                                )}

                                                                {/* Partner Section - Conditional */}
                                                                {selectedDivisions.some(div => divisionPartners[div]?.partnerProfile) && (
                                                                    <div className="space-y-2 pt-1">
                                                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400 mb-0.5">Partner Entries</p>
                                                                        {selectedDivisions.map(div => {
                                                                            const pState = divisionPartners[div] || {};
                                                                            if (!pState.partnerProfile) return null;
                                                                            return (
                                                                                <React.Fragment key={`summary-partner-${div}`}>
                                                                                    <div className="flex justify-between items-start gap-4 bg-white/5 p-2.5 rounded-xl border border-white/5">
                                                                                        <div className="space-y-0.5">
                                                                                            <p className="text-[9px] font-bold uppercase tracking-widest text-white">{pState.partnerProfile.name} <span className="text-gray-500">(Partner)</span></p>
                                                                                            <p className="text-[8px] font-semibold text-blue-500 uppercase tracking-wider italic">{div}</p>
                                                                                        </div>
                                                                                        <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap pt-0.5 text-white">R{pState.payForPartner ? entryCharge(getEntryFeeForCategory(div)) : 0}</span>
                                                                                    </div>
                                                                                    {pState.payForPartner && !pState.partnerProfile.paid_registration && pState.payForPartnerLicense && licenseSalesOpen && (
                                                                                        <div className="flex justify-between items-center bg-blue-400/10 p-2.5 rounded-xl border border-blue-400/20 mt-1">
                                                                                            <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-blue-500">Partner {pState.partnerLicenseChoice === 'full' ? 'Full' : 'Temp'} License</span>
                                                                                            <span className="text-[10px] font-semibold text-blue-500">{formatCurrency(licenseCharge(pState.partnerLicenseChoice))}</span>
                                                                                        </div>
                                                                                    )}
                                                                                </React.Fragment>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}

                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Bottom Action Area */}
                                                    <div className="pt-4 border-t border-white/10 mt-auto">
                                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 w-full">
                                                            <div className="space-y-0.5">
                                                                <p className="text-[8px] font-semibold uppercase tracking-[0.3em] text-padel-green mb-0.5">Grand Total</p>
                                                                <div className="space-y-1">
                                                                    <p className="text-3xl font-semibold tracking-tighter leading-none text-white">R {calculateTotalAmount()}</p>
                                                                    {event?.allow_payments && (
                                                                        <p className="text-[7px] font-semibold uppercase tracking-[0.2em] text-gray-400 whitespace-nowrap">SECURE PAYSTACK</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {(() => {
                                                                const totalAmt = calculateTotalAmount();
                                                                const hasNewDivisions = selectedDivisions.some(div => !registeredDivisions.includes(div));
                                                                const hasPartnerChanges = selectedDivisions.some(div => {
                                                                    const current = divisionPartners[div]?.partnerName?.trim().toLowerCase() || '';
                                                                    const initial = initialPartners[div]?.partnerName?.trim().toLowerCase() || '';
                                                                    return current !== initial;
                                                                });
                                                                const needsUpdate = hasNewDivisions || hasPartnerChanges;
                                                                const isConfirmedWithoutChanges = !needsUpdate && isRegistered && totalAmt === 0;
                                                                const isInAppBrowser = /FBAN|FBAV|Instagram|WhatsApp|Line|Snapchat/i.test(navigator.userAgent || navigator.vendor || window.opera);

                                                                return (
                                                                    <div className="flex flex-col items-end gap-3 w-full md:w-auto">
                                                                        {totalAmt > 0 && isInAppBrowser && (
                                                                            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-400 text-[10px] w-full text-center leading-tight">
                                                                                <span className="font-bold block mb-1">⚠️ Apple Pay Unavailable</span>
                                                                                Apple Pay doesn't work inside in-app browsers. Please tap the menu dots and select <span className="font-bold text-white">Open in Safari</span> to pay.
                                                                            </div>
                                                                        )}
                                                                        <button
                                                                            type="button"
                                                                            onClick={totalAmt > 0 ? handlePayNow : handleRegisterOnly}
                                                                            disabled={isSubmitting || emailCheckStatus === 'not_found' || selectedDivisions.length === 0 || isConfirmedWithoutChanges}
                                                                            className={`w-full min-h-[72px] md:min-h-[64px] px-12 rounded-xl flex items-center justify-center gap-3 transition-all duration-500 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed font-semibold text-sm group mb-2 md:mb-0 ${isConfirmedWithoutChanges ? 'bg-white/10 text-gray-500 border border-white/10' : 'bg-padel-green text-black hover:bg-padel-green/90 hover:scale-[1.03] active:scale-95 shadow-lg shadow-padel-green/20'}`}
                                                                        >
                                                                            <span>
                                                                                {isConfirmedWithoutChanges
                                                                                    ? 'Registration Confirmed'
                                                                                    : totalAmt > 0
                                                                                        ? 'Pay Now'
                                                                                        : (isRegistered ? (needsUpdate ? 'Update Registration' : 'Register Now') : 'Register Now')}
                                                                            </span>
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Ambient Glows */}
                                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-padel-green/10 blur-[120px] rounded-full pointer-events-none" />
                                            <div className="absolute bottom-0 right-0 w-32 h-32 bg-white/5 blur-[80px] rounded-full pointer-events-none" />

                                            <div className="relative mb-10">
                                                <div className="w-28 h-28 bg-padel-green/20 rounded-full flex items-center justify-center mx-auto relative z-10 animate-in zoom-in duration-500 delay-150 shadow-2xl shadow-padel-green/40">
                                                    <CheckCircle className="w-14 h-14 text-padel-green" />
                                                </div>
                                                <div className="absolute inset-0 bg-padel-green/30 blur-2xl rounded-full scale-110 animate-pulse" />
                                            </div>

                                            <h3 className="text-2xl font-semibold text-center text-white mb-4 tracking-normal leading-tight animate-in fade-in slide-in-from-bottom duration-700">
                                                Registration <br />
                                                <span className="text-padel-green">Confirmed</span>
                                            </h3>

                                            <p className="text-center text-gray-400 text-sm mb-12 max-w-xs mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom duration-1000">
                                                You've been successfully registered for <span className="text-white font-bold">{event.event_name}</span>.
                                                {isPaid && " Your payment was confirmed and your profile is updated."}
                                                {!isPaid && calculateTotalAmount() > 0 && " You can complete your payment below or pay later."}
                                            </p>

                                            <div className="flex flex-col gap-4 w-full max-w-xs animate-in fade-in slide-in-from-bottom duration-1000 delay-300 mx-auto">
                                                {!isPaid && calculateTotalAmount() > 0 && (
                                                    <button
                                                        onClick={handlePayNow}
                                                        className="w-full min-h-[72px] md:min-h-[64px] bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm flex items-center justify-center gap-3 rounded-2xl transition-all duration-300 shadow-xl shadow-blue-500/20 hover:scale-[1.03] active:scale-95"
                                                    >
                                                        <CreditCard className="w-5 h-5" />
                                                        <span>Pay R{calculateTotalAmount()} Now</span>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setIsModalOpen(false);
                                                        window.location.reload();
                                                    }}
                                                    className="w-full h-14 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs flex items-center justify-center gap-3 rounded-2xl transition-all duration-300"
                                                >
                                                    <span>Close & Refresh</span>
                                                    <ArrowRight className="w-4 h-4" />
                                                </button>
                                                {isPaid && <p className="text-[10px] text-slate-500 font-medium text-center">Data Syncing Complete</p>}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <VideoModal
                isOpen={videoModal.isOpen}
                onClose={() => setVideoModal({ ...videoModal, isOpen: false })}
                videoUrl={videoModal.url}
                title={videoModal.title}
            />

            <AnimatePresence>
                {selectedPlayer && (
                    <PlayerModal
                        player={selectedPlayer}
                        onClose={() => setSelectedPlayer(null)}
                        userEmail={manualUserEmail}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {posterModalUrl && (
                    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 md:p-8">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setPosterModalUrl(null)}
                            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 8 }}
                            className="relative z-10 w-full max-w-3xl max-h-[90vh] flex flex-col items-center"
                        >
                            <button
                                type="button"
                                onClick={() => setPosterModalUrl(null)}
                                className="absolute -top-2 -right-2 sm:top-0 sm:right-0 z-20 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full border border-white/10 transition-colors"
                                aria-label="Close poster"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <img
                                src={posterModalUrl}
                                alt="Event poster"
                                className="w-full h-auto max-h-[85vh] object-contain rounded-2xl border border-white/10 shadow-2xl bg-black/40"
                            />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

export default EventDetails;