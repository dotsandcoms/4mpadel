import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, useScroll, useTransform, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import heroBg from '../assets/herobg.jpeg';
import AuthModal from './AuthModal';
import { supabase } from '../supabaseClient';
import { PlayCircle, Calendar, ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, ExternalLink, Trophy, MapPin, Swords, Star, BarChart2, CreditCard, User } from 'lucide-react';
import VideoModal from './VideoModal';
import { useRankedin } from '../hooks/useRankedin';
import { usePendingPayments } from '../hooks/usePendingPayments';
import HappeningNowWidget from './HappeningNowWidget';

const parseMatchDate = (dateStr) => {
    if (!dateStr) return new Date(0);
    if (dateStr.includes('T') || dateStr.includes('-')) {
        return new Date(dateStr);
    }
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('/');
    return new Date(`${year}-${month}-${day}T${timePart || '00:00'}:00`);
};

const getEventEndDate = (event) => {
    const eventEnd = event.end_date ? new Date(event.end_date) : new Date(event.start_date);
    eventEnd.setHours(23, 59, 59, 999);
    return eventEnd;
};

const getEventStatusColors = (sapaStatus) => {
    if (sapaStatus === 'Major') return { border: 'border-red-500/40', text: 'text-red-500', fill: '#EF4444' };
    if (sapaStatus === 'Super Gold' || sapaStatus === 'S Gold') return { border: 'border-amber-500/40', text: 'text-amber-500', fill: '#F59E0B' };
    if (sapaStatus === 'Gold') return { border: 'border-yellow-400/40', text: 'text-yellow-400', fill: '#EAB308' };
    if (sapaStatus === 'Silver') return { border: 'border-gray-400/40', text: 'text-gray-400', fill: '#9CA3AF' };
    if (sapaStatus === 'Bronze') return { border: 'border-orange-700/40', text: 'text-orange-700', fill: '#C2410C' };
    return { border: 'border-padel-green/40', text: 'text-padel-green', fill: '#CCFF00' };
};

const pad2 = (n) => String(n).padStart(2, '0');

/** Live countdown to event start_date — My Schedule upcoming events */
const EventStartsCountdown = ({ startDate, accent = '#EAB308' }) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    if (!startDate) return null;
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) return null;

    const diff = start.getTime() - now;
    if (diff <= 0) return null;

    const parts = {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        mins: Math.floor((diff / (1000 * 60)) % 60),
        secs: Math.floor((diff / 1000) % 60),
    };

    return (
        <div
            className="relative w-full md:w-fit rounded-lg border px-2.5 pt-2.5 pb-1.5 shrink-0"
            style={{ borderColor: `${accent}80` }}
            onClick={(e) => e.stopPropagation()}
        >
            <span
                className="absolute -top-1.5 left-2 px-1 text-[8px] font-bold uppercase tracking-wider bg-[#141414]"
                style={{ color: accent }}
            >
                Event starts in
            </span>
            <div className="flex items-end justify-between md:justify-start gap-1.5 sm:gap-2">
                {[
                    { value: pad2(parts.days), unit: 'DAYS' },
                    { value: pad2(parts.hours), unit: 'HRS' },
                    { value: pad2(parts.mins), unit: 'MINS' },
                    { value: pad2(parts.secs), unit: 'SECS' },
                ].map(({ value, unit }, i) => (
                    <React.Fragment key={unit}>
                        {i > 0 && <span className="text-white/40 font-bold text-xs sm:text-sm pb-2">:</span>}
                        <div className="text-center flex-1 md:flex-none min-w-[1.6rem]">
                            <p className="text-sm sm:text-base font-black text-white leading-none tabular-nums">{value}</p>
                            <p className="text-[7px] font-bold text-white/50 tracking-wider mt-0.5">{unit}</p>
                        </div>
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

const Hero = () => {
    const { scrollY } = useScroll();
    const opacityText = useTransform(scrollY, [0, 300], [1, 0]);

    // Mouse tracking for desktop light effect
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const smoothMouseX = useSpring(mouseX, { damping: 50, stiffness: 400 });
    const smoothMouseY = useSpring(mouseY, { damping: 50, stiffness: 400 });

    const handleMouseMove = (e) => {
        const { currentTarget, clientX, clientY } = e;
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    };
    const navigate = useNavigate();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [liveEvent, setLiveEvent] = useState(null);
    const [videoModal, setVideoModal] = useState({ isOpen: false, url: '', title: '' });
    const [session, setSession] = useState(null);
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const [pastEvents, setPastEvents] = useState([]);
    const [nextMatch, setNextMatch] = useState(null);
    const [upcomingMatchesList, setUpcomingMatchesList] = useState([]);
    const [pastMatchesList, setPastMatchesList] = useState([]);
    const [matchesCount, setMatchesCount] = useState(0);
    const [winLossStats, setWinLossStats] = useState(null);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [activeHeroTab, setActiveHeroTab] = useState('matches'); // 'events' | 'matches'
    const [scheduleTimeFilter, setScheduleTimeFilter] = useState('upcoming'); // 'upcoming' | 'past'
    const [pastEventSlide, setPastEventSlide] = useState(0);
    const [pastMatchSlide, setPastMatchSlide] = useState(0);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [pendingActionsOpen, setPendingActionsOpen] = useState(false);
    const [player, setPlayer] = useState(null);
    const { getPlayerEventsAsync, getPlayerMatches, getPlayerProfile, getOrganisationRankings } = useRankedin();

    const scheduleEmail = session?.user
        ? (sessionStorage.getItem('admin_test_login_email') || session.user.email)
        : null;
    const { pendingPayments } = usePendingPayments(scheduleEmail);

    const pendingActions = useMemo(() => {
        const actions = pendingPayments.map((payment) => ({
            key: `pay_${payment.id}_${payment.division || 'N/A'}`,
            type: 'payment',
            title: 'Complete payment',
            subtitle: payment.name,
            detail: payment.amount > 0
                ? `R${Number(payment.amount).toLocaleString('en-ZA')} outstanding`
                : 'Payment outstanding',
            href: `/calendar/${payment.slug}?register=true`,
        }));

        if (player && !player.region) {
            actions.push({
                key: 'profile_region',
                type: 'profile',
                title: 'Complete profile',
                subtitle: 'Region missing',
                detail: 'Required to continue',
                href: '/profile?edit=true',
            });
        }

        return actions;
    }, [pendingPayments, player]);

    const hasPendingActions = pendingActions.length > 0;

    const hasScheduleContent = upcomingEvents.length > 0
        || pastEvents.length > 0
        || upcomingMatchesList.length > 0
        || pastMatchesList.length > 0
        || eventsLoading;

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        const fetchLiveEvent = async () => {
            const { data, error } = await supabase
                .from('calendar')
                .select('*')
                .eq('featured_live', true)
                .or('sanction_status.eq.approved,sanction_status.is.null')
                .neq('is_visible', false)
                .order('start_date', { ascending: true })
                .limit(1)
                .single();

            if (data && !error) {
                setLiveEvent(data);
            }
        };

        fetchLiveEvent();

        return () => subscription.unsubscribe();
    }, []);

    // Fetch upcoming events and matches when session changes
    useEffect(() => {
        if (!session?.user) {
            setUpcomingEvents([]);
            setPastEvents([]);
            setNextMatch(null);
            setUpcomingMatchesList([]);
            setPastMatchesList([]);
            setMatchesCount(0);
            setEventsLoading(false);
            return;
        }

        const controller = new AbortController();
        const signal = controller.signal;

        // Respect admin impersonation (set by PlayerManager) so the Hero shows the
        // impersonated user's events/matches instead of the logged-in admin's own.
        const impersonationEmail = sessionStorage.getItem('admin_test_login_email');
        const targetEmail = impersonationEmail || session.user.email;

        const CACHE_KEY = `hero_events_${targetEmail}`;
        const PAST_EVENTS_CACHE_KEY = `hero_past_events_${targetEmail}`;
        const MATCH_CACHE_KEY = `hero_match_${targetEmail}`;
        const PAST_MATCHES_CACHE_KEY = `hero_past_matches_${targetEmail}`;
        const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

        const fetchPlayerEventsAndMatches = async () => {
            try {
                // Check player details cache
                const PLAYER_METADATA_KEY = `player_metadata_${targetEmail}`;
                let playerData = null;
                try {
                    const cachedPlayer = localStorage.getItem(PLAYER_METADATA_KEY);
                    if (cachedPlayer) {
                        playerData = JSON.parse(cachedPlayer);
                    }
                } catch (_) { }

                if (!playerData || !playerData.rankedin_id) {
                    const { data, error } = await supabase
                        .from('players')
                        .select('id, rankedin_id, email, name')
                        .ilike('email', targetEmail)
                        .maybeSingle();

                    if (error) throw error;
                    if (data?.email) {
                        playerData = data;
                        try {
                            localStorage.setItem(PLAYER_METADATA_KEY, JSON.stringify(data));
                        } catch (_) { }
                    }
                }

                if (!playerData?.email) {
                    setEventsLoading(false);
                    return;
                }

                if (signal.aborted) return;

                // Fetch events and matches in parallel using the signal
                const [rawEvents, rawMatches, rawPastMatches, profileData] = await Promise.all([
                    playerData.rankedin_id ? getPlayerEventsAsync(playerData.rankedin_id, signal) : Promise.resolve([]),
                    playerData.rankedin_id ? getPlayerMatches(playerData.rankedin_id, false, 20, signal) : Promise.resolve([]),
                    playerData.rankedin_id ? getPlayerMatches(playerData.rankedin_id, true, 200, signal) : Promise.resolve([]),
                    playerData.rankedin_id ? getPlayerProfile(playerData.rankedin_id, signal) : Promise.resolve(null)
                ]);

                if (signal.aborted) return;

                let localRegs = [];
                try {
                    const localRegsRes = await supabase
                        .from('event_registrations')
                        .select('*, calendar(*)')
                        .or(`email.ilike.${playerData.email},partner_email.ilike.${playerData.email}`)
                        .neq('status', 'withdrawn');
                    localRegs = localRegsRes.data || [];
                } catch (localRegsErr) {
                    console.warn('Hero local registrations fetch failed:', localRegsErr);
                }

                const activeManualEventIds = new Set(
                    localRegs.map((r) => r.event_id || r.calendar?.id).filter(Boolean),
                );
                const paidManualEventIds = new Set(
                    localRegs
                        .filter((r) => {
                            const isRegistrant = r.email?.toLowerCase() === playerData.email?.toLowerCase();
                            const isPartner = r.partner_email?.toLowerCase() === playerData.email?.toLowerCase();
                            if (isRegistrant && r.payment_status === 'paid') return true;
                            if (isPartner && r.partner_payment_status === 'paid') return true;
                            return false;
                        })
                        .map((r) => r.event_id || r.calendar?.id)
                        .filter(Boolean),
                );

                const allEvents = rawEvents || [];
                localRegs.forEach(reg => {
                    const cal = reg.calendar;
                    if (!cal) return;
                    const rankedinMatch = cal.rankedin_url ? cal.rankedin_url.match(/\/tournament\/(\d+)/) : null;
                    const rId = rankedinMatch ? rankedinMatch[1] : null;
                    const isDuplicate = allEvents.some(e => e.id?.toString() === rId);

                    if (!isDuplicate && !allEvents.some(e => e.db_id === cal.id || e.id === `local_${cal.id}`)) {
                        const isRegistrant = reg.email?.toLowerCase() === playerData.email?.toLowerCase();
                        const userPaymentStatus = isRegistrant ? reg.payment_status : reg.partner_payment_status;
                        allEvents.push({
                            id: `local_${cal.id}`,
                            db_id: cal.id,
                            start_date: cal.start_date,
                            end_date: cal.end_date,
                            event_name: cal.event_name,
                            state: 1,
                            payment_status: userPaymentStatus,
                            isPaid: userPaymentStatus === 'paid',
                        });
                    }
                });

                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                const currentMonth = startOfToday.getMonth();
                const currentYear = startOfToday.getFullYear();

                const uniqueEventsMap = new Map();
                allEvents.forEach(e => {
                    if (e.id?.toString().startsWith('local_') && !activeManualEventIds.has(e.db_id)) {
                        return;
                    }
                    const key = e.id?.toString().startsWith('local_') ? `local_${e.db_id}` : `rankedin_${e.id}`;
                    if (!uniqueEventsMap.has(key)) {
                        uniqueEventsMap.set(key, e);
                    }
                });
                const uniqueEvents = Array.from(uniqueEventsMap.values());

                const isUpcomingEvent = (event) => {
                    const eventEnd = getEventEndDate(event);
                    return eventEnd >= startOfToday && event.state !== 2;
                };
                const isPastEvent = (event) => {
                    const eventEnd = getEventEndDate(event);
                    return event.state === 4 || (eventEnd < startOfToday && event.state !== 2);
                };

                if (uniqueEvents.length > 0) {
                    const [dbEventsRes, paidParticipantsRes] = await Promise.all([
                        supabase.from('calendar').select('id, slug, rankedin_url, sapa_status, entry_fee, category_fees, venue, city'),
                        supabase.from('tournament_participants').select('event_id')
                            .or(`email.ilike.${playerData.email},profile_id.eq.${playerData.id}`)
                            .eq('is_paid', true),
                    ]);

                    if (signal.aborted) return;

                    const paidEventIds = new Set([
                        ...paidManualEventIds,
                        ...(paidParticipantsRes.data || []).map(p => p.event_id),
                    ]);

                    if (dbEventsRes.data) {
                        uniqueEvents.forEach((e) => {
                            const match = e.id?.toString().startsWith('local_')
                                ? dbEventsRes.data.find(dbE => dbE.id === e.db_id)
                                : dbEventsRes.data.find(dbE => dbE.rankedin_url?.includes(`/tournament/${e.id}/`));
                            if (match) {
                                e.db_id = match.id;
                                e.slug = match.slug;
                                e.sapa_status = match.sapa_status;
                                e.entry_fee = match.entry_fee;
                                e.category_fees = match.category_fees;
                                e.venue = match.venue;
                                e.city = match.city;
                                e.isPaid = e.id?.toString().startsWith('local_')
                                    ? paidManualEventIds.has(match.id)
                                    : paidEventIds.has(match.id);
                            }
                        });
                    }
                }

                let upcomingFiltered = uniqueEvents
                    .filter(isUpcomingEvent)
                    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

                const pastFiltered = uniqueEvents
                    .filter(isPastEvent)
                    .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
                    .slice(0, 15);

                const currentMonthEvents = upcomingFiltered.filter((e) => {
                    const eventEnd = getEventEndDate(e);
                    return eventEnd.getMonth() === currentMonth && eventEnd.getFullYear() === currentYear;
                });

                if (currentMonthEvents.length > 0) {
                    upcomingFiltered = currentMonthEvents;
                } else {
                    upcomingFiltered = upcomingFiltered.slice(0, 3);
                }

                const validMatches = (rawMatches || []).filter(m => m.Info?.EventName && m.Info.EventName !== 'EventName');
                validMatches.sort((a, b) => parseMatchDate(a.Info?.Date) - parseMatchDate(b.Info?.Date));

                // RankedIn's "upcoming" matches list can include recent past matches.
                // Ensure "Upcoming" really means >= now.
                const now = new Date();
                const upcomingMatchesOnly = validMatches.filter((m) => parseMatchDate(m.Info?.Date) >= now);
                const firstNextMatch = upcomingMatchesOnly[0] || null;

                const getMatchDedupeKey = (match) => {
                    const info = match.Info || {};
                    return `${info.EventName || ''}|${info.Date || ''}|${info.Challenger?.Name || ''}|${info.Challenged?.Name || ''}`;
                };

                let validPastMatches = (rawPastMatches || [])
                    .filter(m => m.Info?.EventName && m.Info.EventName !== 'EventName')
                    .sort((a, b) => parseMatchDate(b.Info?.Date) - parseMatchDate(a.Info?.Date));

                const passedFromUpcoming = validMatches.filter((m) => parseMatchDate(m.Info?.Date) < now);
                const pastKeys = new Set(validPastMatches.map(getMatchDedupeKey));
                passedFromUpcoming.forEach((match) => {
                    const key = getMatchDedupeKey(match);
                    if (!pastKeys.has(key)) {
                        pastKeys.add(key);
                        validPastMatches.push(match);
                    }
                });
                validPastMatches = validPastMatches
                    .sort((a, b) => parseMatchDate(b.Info?.Date) - parseMatchDate(a.Info?.Date))
                    .slice(0, 15);

                if (signal.aborted) return;

                setUpcomingEvents(upcomingFiltered);
                setPastEvents(pastFiltered);
                setNextMatch(firstNextMatch);
                setUpcomingMatchesList(upcomingMatchesOnly);
                setPastMatchesList(validPastMatches);
                setMatchesCount(upcomingMatchesOnly.length);
                let winLossStr = null;
                if (profileData?.Statistics?.WinLossDoublesCurrentYear) {
                    winLossStr = profileData.Statistics.WinLossDoublesCurrentYear;
                } else {
                    let wins = 0;
                    let losses = 0;
                    if (rawPastMatches && rawPastMatches.length > 0) {
                        rawPastMatches.forEach((match) => {
                            const info = match.Info || {};
                            const isWinner = info.IsWinner !== undefined
                                ? info.IsWinner
                                : info.Challenger?.IsWinner;
                            if (isWinner) wins++;
                            else losses++;
                        });
                    }
                    winLossStr = `${wins}-${losses}`;
                }
                setWinLossStats(winLossStr);

                setEventsLoading(false);

                if (firstNextMatch) {
                    setActiveHeroTab('matches');
                } else if (upcomingFiltered.length > 0) {
                    setActiveHeroTab('events');
                }

                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), events: upcomingFiltered }));
                    localStorage.setItem(PAST_EVENTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), events: pastFiltered }));
                    localStorage.setItem(MATCH_CACHE_KEY, JSON.stringify({ ts: Date.now(), match: firstNextMatch, count: upcomingMatchesOnly.length, winLoss: winLossStr }));
                    localStorage.setItem(PAST_MATCHES_CACHE_KEY, JSON.stringify({ ts: Date.now(), matches: validPastMatches }));
                } catch (_) { }
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.error('Hero events and matches error:', err);
                setEventsLoading(false);
            }
        };

        // ── Step 1: Read cache and render immediately (SWR) ──
        let hasCachedData = false;
        let isCacheExpired = true;
        let hasCachedMatch = false;

        try {
            const cachedPastEvents = localStorage.getItem(PAST_EVENTS_CACHE_KEY);
            if (cachedPastEvents) {
                const { events } = JSON.parse(cachedPastEvents);
                if (events && Array.isArray(events)) {
                    setPastEvents(events);
                    hasCachedData = true;
                }
            }
        } catch (_) { }

        try {
            const cachedPastMatches = localStorage.getItem(PAST_MATCHES_CACHE_KEY);
            if (cachedPastMatches) {
                const { matches } = JSON.parse(cachedPastMatches);
                if (matches && Array.isArray(matches)) {
                    setPastMatchesList(matches);
                    hasCachedData = true;
                }
            }
        } catch (_) { }

        try {
            const cachedMatch = localStorage.getItem(MATCH_CACHE_KEY);
            if (cachedMatch) {
                const { ts, match, count, winLoss } = JSON.parse(cachedMatch);
                if (match) {
                    const cachedDate = parseMatchDate(match.Info?.Date);
                    if (cachedDate >= new Date()) {
                        setNextMatch(match);
                        setMatchesCount(count || 1);
                        if (winLoss) setWinLossStats(winLoss);
                        hasCachedData = true;
                        hasCachedMatch = true;
                        if (Date.now() - ts < CACHE_TTL) {
                            isCacheExpired = false;
                        }
                        setActiveHeroTab('matches');
                    }
                }
            }
        } catch (_) { }

        try {
            const cachedEvents = localStorage.getItem(CACHE_KEY);
            if (cachedEvents) {
                const { ts, events } = JSON.parse(cachedEvents);
                if (events && Array.isArray(events)) {
                    setUpcomingEvents(events);
                    hasCachedData = true;
                    if (Date.now() - ts < CACHE_TTL) {
                        isCacheExpired = false;
                    }
                    if (!hasCachedMatch && events.length > 0) {
                        setActiveHeroTab('events');
                    }
                }
            }
        } catch (_) { }

        // If no cache, set loading true to show shimmering skeletons immediately
        if (!hasCachedData) {
            setEventsLoading(true);
        }

        // ── Step 2: Always refresh in background (cache is display-only) ──
        fetchPlayerEventsAndMatches();

        const handleRegistrationsChanged = () => {
            try {
                localStorage.removeItem(CACHE_KEY);
                localStorage.removeItem(PAST_EVENTS_CACHE_KEY);
                localStorage.removeItem(MATCH_CACHE_KEY);
                localStorage.removeItem(PAST_MATCHES_CACHE_KEY);
            } catch (_) { }
            fetchPlayerEventsAndMatches();
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') fetchPlayerEventsAndMatches();
        };
        window.addEventListener('4m:registrations-changed', handleRegistrationsChanged);
        window.addEventListener('visibilitychange', handleVisibility);

        // Periodic refresh so a long-lived open tab doesn't get stuck showing a stale
        // "next match" — previously this only refetched on login, a registration change,
        // or the tab regaining focus, so it could sit stale for the full 30-minute cache TTL
        // (or longer if the tab was never backgrounded).
        const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
        const refreshIntervalId = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchPlayerEventsAndMatches();
            }
        }, REFRESH_INTERVAL_MS);

        return () => {
            controller.abort();
            clearInterval(refreshIntervalId);
            window.removeEventListener('4m:registrations-changed', handleRegistrationsChanged);
            window.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [session, getPlayerEventsAsync, getPlayerMatches]);

    // Fetch lightweight player profile (name, ranking, points) for the personalized greeting/stats
    useEffect(() => {
        if (!session?.user) {
            setPlayer(null);
            return;
        }

        // Respect admin impersonation so the greeting/stats reflect the impersonated user, not the admin
        const impersonationEmail = sessionStorage.getItem('admin_test_login_email');
        const email = impersonationEmail || session.user.email;
        const CACHE_KEY = `hero_player_stats_v3_${email}`;
        let cancelled = false;

        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) setPlayer(JSON.parse(cached));
        } catch (_) { }

        const resolveRankingChange = async (playerData) => {
            if (!playerData?.rankedin_id) return null;
            if (!playerData.rank_label || playerData.rank_label === 'Unranked') return null;

            const isWoman = /women|ladies|female/i.test(playerData.category || '');
            const lists = isWoman
                ? [{ rankingType: 4, ageGroup: 83 }, { rankingType: 3, ageGroup: 82 }]
                : [{ rankingType: 3, ageGroup: 82 }, { rankingType: 4, ageGroup: 83 }];
            const rankNum = parseInt(playerData.rank_label, 10);
            const take = Number.isFinite(rankNum) ? Math.min(1000, Math.max(50, rankNum + 25)) : 200;
            const rid = String(playerData.rankedin_id);
            const nameKey = (playerData.name || '').trim().toLowerCase();

            for (const list of lists) {
                try {
                    const rows = await getOrganisationRankings(list.rankingType, list.ageGroup, take);
                    const hit = (rows || []).find((r) => String(r.RankedinId) === rid)
                        || (rows || []).find((r) => (r.Name || '').trim().toLowerCase() === nameKey);
                    if (hit && hit.StandingDiff !== undefined && hit.StandingDiff !== null) {
                        return Number(hit.StandingDiff) || 0;
                    }
                } catch (_) { /* try next list */ }
            }
            return null;
        };

        // Same core fields as PlayerProfile so the hero card stays in sync.
        supabase
            .from('players')
            .select('id, name, rank_label, points, region, rankedin_id, category, image_url, license_type, paid_registration')
            .ilike('email', email)
            .maybeSingle()
            .then(async ({ data, error }) => {
                if (!data || error || cancelled) return;
                const rankingChange = await resolveRankingChange(data);
                if (cancelled) return;
                const next = { ...data, rankingChange };
                setPlayer(next);
                try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch (_) { }
            });

        return () => { cancelled = true; };
    }, [session, getOrganisationRankings]);

    useEffect(() => {
        setPastEventSlide(0);
        setPastMatchSlide(0);
    }, [activeHeroTab, scheduleTimeFilter]);

    useEffect(() => {
        setPastEventSlide(0);
    }, [pastEvents.length]);

    useEffect(() => {
        setPastMatchSlide(0);
    }, [pastMatchesList.length]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    const firstName = player?.name ? player.name.split(' ')[0] : null;

    const handleEventClick = (event) => {
        if (event.slug || event.db_id) navigate(`/calendar/${event.slug || event.db_id}`);
        else if (!event.id?.toString().startsWith('local_')) window.open(`https://www.rankedin.com/en/tournament/${event.id}`, '_blank');
    };

    const renderScheduleTimeSwitch = ({ compact = false } = {}) => (
        <div
            className={`flex shrink-0 bg-transparent border border-white/15 rounded-lg p-0.5 ${
                compact ? '' : 'w-full mb-4 rounded-xl p-1'
            }`}
        >
            {[
                { key: 'upcoming', label: 'Upcoming' },
                { key: 'past', label: 'Past' },
            ].map(({ key, label }) => (
                <button
                    key={key}
                    type="button"
                    onClick={() => setScheduleTimeFilter(key)}
                    className={`${
                        compact
                            ? 'px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px]'
                            : 'flex-1 py-2 text-xs'
                    } rounded-md transition-all font-bold whitespace-nowrap ${
                        scheduleTimeFilter === key
                            ? 'bg-white/10 text-white shadow-sm'
                            : 'text-white/45 hover:text-white'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );

    const renderSingleEventCard = (event, keySuffix = '', { showStartCountdown = false } = {}) => {
        const startDate = new Date(event.start_date);
        const day = startDate.getDate();
        const month = startDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
        const weekday = startDate.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
        const location = [event.venue, event.city].filter(Boolean).join(', ');
        const statusColors = getEventStatusColors(event.sapa_status);
        const accent = statusColors.fill;

        return (
            <button
                key={`${event.id}${keySuffix}`}
                type="button"
                onClick={() => handleEventClick(event)}
                className="flex items-center gap-3 sm:gap-4 p-4 hover:bg-white/5 transition-colors text-left group w-full"
            >
                <div className="flex items-center gap-3 shrink-0 self-start pt-0.5">
                    <Calendar size={18} strokeWidth={1.75} className="text-padel-green" />
                    <div className="flex flex-col items-center leading-none">
                        <span className="text-white font-bold text-xl leading-none">{day}</span>
                        <span className="text-padel-green text-[9px] font-black uppercase tracking-widest mt-1.5">{month}</span>
                        <span className="text-white/40 text-[8px] font-bold uppercase tracking-widest mt-0.5">{weekday}</span>
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-2.5 md:gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <p className="text-white text-sm font-bold uppercase truncate min-w-0 flex-1">
                                        {event.event_name}
                                    </p>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${statusColors.border} ${statusColors.text} bg-transparent`}>
                                        {event.sapa_status || 'SAPA'}
                                    </span>
                                </div>
                                {location && (
                                    <p className="text-[11px] text-white/50 mt-1 flex items-center gap-1 min-w-0">
                                        <MapPin size={12} className="text-white/40 shrink-0" />
                                        <span className="truncate">{location}</span>
                                    </p>
                                )}
                            </div>
                            <ChevronRight size={18} className="text-padel-green shrink-0 md:hidden mt-0.5 transition-transform group-hover:translate-x-0.5" />
                        </div>
                    </div>
                    {showStartCountdown && (
                        <div className="w-full md:w-auto md:ml-auto shrink-0">
                            <EventStartsCountdown startDate={event.start_date} accent={accent} />
                        </div>
                    )}
                </div>
                <ChevronRight size={18} className="text-padel-green shrink-0 hidden md:block transition-transform group-hover:translate-x-0.5" />
            </button>
        );
    };

    const renderPastPager = (items, page, setPage, renderItem) => {
        const maxPage = Math.max(0, items.length - 1);

        return (
            <div className="group relative flex flex-col gap-4 w-full bg-white/5 border border-white/10 rounded-2xl animate-fade-in overflow-visible">
                <div className="overflow-hidden rounded-2xl">
                    {items.slice(page, page + 1).map((item, idx) => renderItem(item, `_${page}_${idx}`))}
                </div>
                {items.length > 1 && (
                    <>
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className={`absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/10 bg-[#0a0a0a] flex items-center justify-center transition-all duration-300 md:opacity-0 md:group-hover:opacity-100 text-white shadow-xl z-50 ${page === 0 ? 'opacity-50 cursor-not-allowed md:opacity-0 md:pointer-events-none' : 'hover:bg-padel-green hover:text-black hover:border-padel-green'}`}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                            disabled={page === maxPage}
                            className={`absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/10 bg-[#0a0a0a] flex items-center justify-center transition-all duration-300 md:opacity-0 md:group-hover:opacity-100 text-white shadow-xl z-50 ${page === maxPage ? 'opacity-50 cursor-not-allowed md:opacity-0 md:pointer-events-none' : 'hover:bg-padel-green hover:text-black hover:border-padel-green'}`}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </>
                )}
            </div>
        );
    };

    const renderEventRows = (events) => (
        <div className="w-full bg-white/5 border border-white/10 rounded-2xl overflow-hidden animate-fade-in">
            <div className="flex flex-col">
                {events.map((event, idx) => (
                    <div key={`${event.id}_${idx}`} className={idx !== events.length - 1 ? 'border-b border-white/10' : ''}>
                        {renderSingleEventCard(event, `_${idx}`, { showStartCountdown: true })}
                    </div>
                ))}
            </div>
        </div>
    );

    const renderFeaturedMatchCard = (match) => {
        const info = match.Info || {};
        const team1P1 = info.Challenger?.Name || 'TBD';
        const team1P2 = info.Challenger1?.Name;
        const team2P1 = info.Challenged?.Name || 'TBD';
        const team2P2 = info.Challenged1?.Name;

        return (
            <div
                className="group relative rounded-[16px] p-[1px] overflow-hidden bg-white/5 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(249,115,22,0.15)] cursor-pointer w-full"
                onClick={() => navigate('/profile?tab=matches')}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate('/profile?tab=matches'); }}
                role="button"
                tabIndex={0}
            >
                <div
                    className="absolute inset-0 animate-spin opacity-60 group-hover:opacity-100 transition-opacity duration-300 [animation-duration:6s] pointer-events-none"
                    style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 78%, rgba(249,115,22,0.9) 88%, transparent 96%)' }}
                />
                <div className="relative z-10 w-full bg-[#141414] rounded-[15px] p-3.5 sm:p-4 text-left flex flex-col justify-between min-h-[125px] overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.08)_0%,transparent_75%)] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="flex justify-between items-start gap-3 border-b border-white/5 pb-2 relative z-20">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.8)] shrink-0" />
                            <span className="text-xs font-bold text-orange-400 uppercase tracking-widest truncate">
                                {info.EventName || 'Next Match'}
                            </span>
                        </div>
                        {info.Date && (
                            <span className="text-xs font-medium text-white/70 whitespace-nowrap bg-white/5 border border-white/10 px-1.5 py-0.5 rounded shrink-0">
                                {info.Date}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center justify-center gap-4 sm:gap-6 py-2.5 relative">
                        <div className="flex-1 flex flex-col items-end text-right min-w-0">
                            <span className="text-sm font-semibold text-white truncate w-full uppercase tracking-tight group-hover:text-orange-400 transition-colors">
                                {team1P1}
                            </span>
                            {team1P2 && (
                                <span className="text-xs font-medium text-white/70 truncate w-full uppercase tracking-wider mt-0.5">
                                    {team1P2}
                                </span>
                            )}
                        </div>
                        <div className="relative shrink-0 flex items-center justify-center">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-orange-500 via-amber-500 to-yellow-500 flex items-center justify-center shadow-[0_0_12px_rgba(249,115,22,0.4)] border border-orange-400/30 group-hover:scale-110 transition-transform duration-300">
                                <span className="text-[10px] font-bold text-black tracking-widest font-sans scale-90">VS</span>
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col items-start text-left min-w-0">
                            <span className="text-sm font-semibold text-white truncate w-full uppercase tracking-tight group-hover:text-orange-400 transition-colors">
                                {team2P1}
                            </span>
                            {team2P2 && (
                                <span className="text-xs font-medium text-white/70 truncate w-full uppercase tracking-wider mt-0.5">
                                    {team2P2}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-auto">
                        <div className="flex items-center gap-1.5 min-w-0 max-w-[70%]">
                            <MapPin size={12} className="text-padel-green shrink-0" />
                            <span className="text-xs font-medium text-white/70 truncate uppercase tracking-wider">
                                {info.Location || info.Venue || 'Location TBD'}
                            </span>
                        </div>
                        {info.Court && (
                            <span className="text-[10px] font-bold bg-orange-500/10 border border-orange-500/25 text-orange-400 px-1.5 py-0.5 rounded uppercase tracking-widest whitespace-nowrap scale-95 shrink-0">
                                {info.Court}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderMatchScoreColumn = (match, isWinner) => {
        const sets = match.Score?.Score;
        const hasResult = sets && sets.length > 0;

        if (!hasResult) {
            if (isWinner === undefined) return null;
            return (
                <span className={`shrink-0 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${isWinner ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {isWinner ? 'Win' : 'Loss'}
                </span>
            );
        }

        return (
            <div className="shrink-0 flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                    {sets.map((set, sIdx) => (
                        <div
                            key={sIdx}
                            className="bg-white/[0.04] px-1.5 py-1 rounded-lg text-[9px] font-black text-white border border-white/5 flex flex-col items-center min-w-[20px] leading-tight"
                        >
                            <span className={set.Score1 > set.Score2 ? 'text-padel-green' : 'text-white/60'}>{set.Score1}</span>
                            <div className="w-full h-px bg-white/10 my-0.5" />
                            <span className={set.Score2 > set.Score1 ? 'text-padel-green' : 'text-white/60'}>{set.Score2}</span>
                        </div>
                    ))}
                </div>
                {isWinner !== undefined && (
                    <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${isWinner ? 'bg-padel-green text-black' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                        {isWinner ? 'Victory' : 'Defeat'}
                    </span>
                )}
            </div>
        );
    };

    const renderCompactMatchRow = (match, idx, total) => {
        const info = match.Info || {};
        const matchDate = parseMatchDate(info.Date);
        const day = matchDate.getDate() || '—';
        const month = Number.isNaN(matchDate.getTime()) ? '' : matchDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
        const weekday = Number.isNaN(matchDate.getTime()) ? '' : matchDate.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
        const isWinner = info.IsWinner !== undefined ? info.IsWinner : info.Challenger?.IsWinner;
        const hasResult = match.Score?.Score && match.Score.Score.length > 0;
        const showPastResult = scheduleTimeFilter === 'past' && (hasResult || isWinner !== undefined);

        return (
            <button
                key={`${info.EventName}_${info.Date}_${idx}`}
                type="button"
                onClick={() => navigate('/profile?tab=matches')}
                className={`flex items-center gap-4 p-4 hover:bg-white/5 transition-colors text-left group w-full ${idx !== total - 1 ? 'border-b border-white/10' : ''}`}
            >
                <div className="flex items-center gap-3 shrink-0">
                    <Trophy size={18} strokeWidth={1.75} className="text-orange-400" />
                    <div className="flex flex-col items-center leading-none">
                        <span className="text-white font-bold text-xl leading-none">{day}</span>
                        {month && <span className="text-orange-400 text-[9px] font-black uppercase tracking-widest mt-1.5">{month}</span>}
                        {weekday && <span className="text-white/40 text-[8px] font-bold uppercase tracking-widest mt-0.5">{weekday}</span>}
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-bold uppercase truncate">{info.EventName || 'Match'}</p>
                    <p className="text-[11px] text-white/50 mt-1 truncate">
                        {(info.Challenger?.Name || 'TBD')} vs {(info.Challenged?.Name || 'TBD')}
                    </p>
                </div>
                {showPastResult && renderMatchScoreColumn(match, isWinner)}
                <ChevronRight size={18} className="text-orange-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </button>
        );
    };

    const renderMatchRows = (matches, { featuredFirst = false } = {}) => (
        <div className="w-full bg-white/5 border border-white/10 rounded-2xl overflow-hidden animate-fade-in">
            <div className="flex flex-col">
                {featuredFirst && matches[0] && (
                    <div className="p-4 border-b border-white/10">
                        {renderFeaturedMatchCard(matches[0])}
                    </div>
                )}
                {(featuredFirst ? matches.slice(1) : matches).map((match, idx, arr) => renderCompactMatchRow(match, idx, arr.length))}
            </div>
        </div>
    );

    return (
        <div className="relative w-full bg-black">
            <div
                // Hug content height — especially when My Schedule is collapsed.
                // No bottom padding when logged in so accordion spacing matches Featured / Results / Quick Links below.
                className={`relative w-full overflow-hidden border-t border-white/10 flex flex-col justify-start pb-0`}
                onMouseMove={handleMouseMove}
            >
                {/* Solid base background — text sits on this, never on the photo */}
                <div className="absolute inset-0 z-0 bg-[#0a0a0a]" />

                {/* Photo panel — anchored to the right, shown in the space the text doesn't use (not stretched as a full-bleed cover) */}
                <div
                    className="absolute top-0 right-0 z-0 w-[34%] sm:w-[36%] lg:w-[38%] xl:w-[40%] h-[52%] sm:h-[58%] lg:h-[65%] overflow-hidden"
                >
                    <img
                        src={heroBg}
                        alt="Premium Padel Court"
                        className="w-full h-full object-cover saturate-[0.45] contrast-[1.08]"
                    />
                    {/* Navy colour tint so the photo reads as part of the dark theme rather than its own warm/teal palette */}
                    <div className="absolute inset-0 bg-[#141414]/35 mix-blend-multiply" />
                    <div className="absolute inset-0 bg-[#0a0a0a]/10" />
                    {/* Fade the panel's left edge into the solid background so the crop doesn't read as a hard rectangle */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] from-0% via-[#0a0a0a]/40 via-25% to-transparent to-65%" />
                    {/* Fade the bottom edge so it dissolves into the solid background instead of ending abruptly */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0a0a0a]" />
                </div>

                {/* Floating Orbs (Ambient for Mobile) */}
                {false && (
                    <>
                        <motion.div
                            animate={{
                                scale: [1, 1.5, 1],
                                opacity: [0.3, 0.7, 0.3],
                                x: [0, 300, -150, 0],
                                y: [0, -200, 150, 0]
                            }}
                            transition={{
                                duration: 8,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            className="absolute lg:hidden top-1/4 left-1/4 w-72 h-72 bg-padel-green/80 rounded-full blur-[80px] mix-blend-screen z-10 pointer-events-none"
                        />

                        {/* Mouse Follow Orb (Desktop only) */}
                        <motion.div
                            style={{
                                x: smoothMouseX,
                                y: smoothMouseY,
                                left: -200,
                                top: -200,
                            }}
                            className="absolute hidden lg:block w-[400px] h-[400px] bg-padel-green/60 rounded-full blur-[100px] mix-blend-screen z-10 pointer-events-none"
                        />
                        <motion.div
                            animate={{
                                scale: [1, 1.8, 1],
                                opacity: [0.2, 0.6, 0.2],
                                x: [0, -300, 200, 0],
                                y: [0, 250, -150, 0]
                            }}
                            transition={{
                                duration: 10,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: 1
                            }}
                            className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-white/10 rounded-full blur-[100px] mix-blend-screen z-10 pointer-events-none"
                        />
                    </>
                )}

                {/* Hero Content */}
                <motion.div
                    style={{ opacity: opacityText }}
                    className={`relative z-20 flex flex-col flex-none justify-start pt-20 px-4 lg:pt-24 lg:px-8 w-full max-w-[1500px] mx-auto ${session ? 'pb-2 lg:pb-4' : 'pb-0'}`}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-padel-green/20 text-padel-green bg-padel-green/5 text-[10px] md:text-[11px] font-bold uppercase tracking-widest mb-5 max-w-fit"
                    >
                        <Trophy className="w-3 h-3" />
                        <span>The Home of 4M Padel</span>
                    </motion.div>

                    <div className="overflow-hidden mb-3">
                        <motion.h1
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                            className="text-4xl sm:text-6xl md:text-8xl lg:text-[110px] xl:text-[130px] font-bold text-white leading-[1.1] md:leading-[0.9] tracking-tighter max-w-[100vw] font-display whitespace-nowrap lg:whitespace-normal"
                        >
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-300 to-gray-500">FOR THE PLAYERS.</span>
                        </motion.h1>
                    </div>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8, duration: 0.8 }}
                        className={`text-gray-200 text-sm md:text-lg lg:text-xl max-w-[15rem] sm:max-w-sm md:max-w-md leading-relaxed font-light whitespace-normal tracking-tight sm:tracking-normal ${session ? 'mb-4' : 'mb-0'}`}
                    >
                        <strong className="text-white font-medium">Events, rankings, clubs, players and organisers — all in one place</strong>.
                    </motion.p>

                    {/* Personalized profile card — same source data as /profile */}
                    {session && player && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.9, duration: 0.8 }}
                            className="mb-2 w-full"
                        >
                            <p className="text-white text-base md:text-lg font-bold mb-3">
                                {getGreeting()}{firstName && <>, <span className="text-padel-green">{firstName}</span></>} <span aria-hidden="true">👋</span>
                            </p>
                            <div className="w-full text-left bg-[#0a0a0a]/70 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 sm:p-5">
                                <div className="flex items-stretch gap-4 sm:gap-5">
                                    <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full overflow-hidden border-2 border-white/10 bg-white/5 shrink-0 flex items-center justify-center shadow-lg self-center">
                                        {player.image_url ? (
                                            <img src={player.image_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <User size={32} className="text-white/40" />
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1 flex flex-col justify-start space-y-1.5 sm:space-y-2">
                                        {player.license_type && (
                                            <span className={`inline-flex items-center gap-1.5 border rounded-full px-2 py-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider w-fit ${
                                                player.license_type === 'full'
                                                    ? 'bg-padel-green/10 border-padel-green/30 text-padel-green'
                                                    : player.license_type === 'temporary'
                                                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                                        : 'bg-white/5 border-white/10 text-gray-400'
                                            }`}>
                                                {player.license_type === 'full' && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-padel-green animate-pulse" />
                                                )}
                                                {player.license_type === 'full'
                                                    ? 'Full License Player'
                                                    : player.license_type === 'temporary'
                                                        ? 'Temporary License Player'
                                                        : 'No License'}
                                            </span>
                                        )}

                                        <h3 className="text-white font-extrabold text-lg sm:text-2xl uppercase tracking-tight truncate leading-none">
                                            {player.name || 'Player'}
                                        </h3>

                                        <div className="flex items-stretch pt-0.5 w-full">
                                            <div className="flex flex-col items-start text-left flex-1 min-w-0 pr-3">
                                                <p className="text-yellow-500 font-extrabold text-base sm:text-xl leading-none">
                                                    {player.rank_label && player.rank_label !== 'Unranked' ? `#${player.rank_label}` : '—'}
                                                </p>
                                                {typeof player.rankingChange === 'number' && (
                                                    <span
                                                        className={`inline-flex items-center gap-0.5 text-[9px] font-black leading-none mt-0.5 ${
                                                            player.rankingChange > 0
                                                                ? 'text-padel-green'
                                                                : player.rankingChange < 0
                                                                    ? 'text-red-500'
                                                                    : 'text-gray-500'
                                                        }`}
                                                    >
                                                        {player.rankingChange > 0 && <>▲ {player.rankingChange}</>}
                                                        {player.rankingChange < 0 && <>▼ {Math.abs(player.rankingChange)}</>}
                                                        {player.rankingChange === 0 && <>-</>}
                                                    </span>
                                                )}
                                                <p className="text-gray-500 text-[8px] sm:text-[9px] font-black uppercase tracking-widest mt-0.5">Rank</p>
                                            </div>
                                            <div className="w-px bg-white/10 shrink-0 self-stretch my-0.5" />
                                            <div className="flex flex-col items-start text-left flex-1 min-w-0 px-3">
                                                <p className="text-padel-green font-extrabold text-base sm:text-xl leading-none">
                                                    {player.points !== undefined && player.points !== null
                                                        ? Number(player.points).toLocaleString()
                                                        : '—'}
                                                </p>
                                                <p className="text-gray-500 text-[8px] sm:text-[9px] font-black uppercase tracking-widest mt-0.5">Points</p>
                                            </div>
                                            <div className="w-px bg-white/10 shrink-0 self-stretch my-0.5" />
                                            <div className="flex flex-col items-start text-left flex-1 min-w-0 pl-3">
                                                <p className="text-white font-extrabold text-base sm:text-xl leading-none">
                                                    {typeof winLossStats === 'string'
                                                        ? winLossStats
                                                        : (winLossStats ? `${winLossStats.wins}-${winLossStats.losses}` : '—')}
                                                </p>
                                                <p className="text-gray-500 text-[8px] sm:text-[9px] font-black uppercase tracking-widest mt-0.5">W-L</p>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => navigate('/profile')}
                                        aria-label="View profile"
                                        className="self-center shrink-0 p-2 -mr-1 rounded-full text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        <ChevronRight size={22} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {liveEvent && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1, duration: 0.8 }}
                        className="flex flex-col sm:flex-row items-center gap-4 max-w-[15rem] sm:max-w-none mt-4"
                    >
                            <motion.button
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                whileHover={{ scale: 1.05 }}
                                onClick={() => {
                                    if (liveEvent.live_youtube_url) {
                                        setVideoModal({
                                            isOpen: true,
                                            url: liveEvent.live_youtube_url,
                                            title: liveEvent.event_name
                                        });
                                    } else {
                                        navigate(`/calendar/${liveEvent.slug || liveEvent.id}`);
                                    }
                                }}
                                className="group px-8 py-4 bg-red-600 rounded-full font-bold text-white border border-red-500/50 shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:bg-red-700 transition-all w-full sm:w-auto flex justify-center items-center gap-3 relative overflow-hidden"
                            >
                                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] pointer-events-none" />
                                {liveEvent.live_youtube_url ? (
                                    <>
                                        <div className="relative">
                                            <PlayCircle className="w-5 h-5 animate-pulse" />
                                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-ping" />
                                        </div>
                                        WATCH LIVE NOW
                                    </>
                                ) : (
                                    <>
                                        <PlayCircle className="w-5 h-5 opacity-50" />
                                        WATCH LIVE SOON
                                    </>
                                )}
                            </motion.button>
                    </motion.div>
                    )}
                </motion.div>

                <div className={`relative z-30 px-4 w-full max-w-[1500px] lg:px-8 flex flex-col mx-auto ${session ? 'pb-0' : 'pb-0'}`}>

                    <AnimatePresence>
                        {session && (hasScheduleContent || hasPendingActions) && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                transition={{ delay: 1.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                className="w-full"
                            >
                                {hasPendingActions && (
                                <div className="border-t border-white/5 py-3">
                                <button
                                    type="button"
                                    onClick={() => setPendingActionsOpen((open) => !open)}
                                    aria-expanded={pendingActionsOpen}
                                    className={`flex w-full items-center justify-between px-1 text-left group ${pendingActionsOpen ? 'mb-3' : 'mb-0'}`}
                                >
                                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">Pending Actions</h2>
                                    <ChevronDown
                                        size={16}
                                        className={`text-white/50 shrink-0 transition-transform duration-300 group-hover:text-white/70 ${pendingActionsOpen ? '' : '-rotate-90'}`}
                                    />
                                </button>
                                <AnimatePresence initial={false}>
                                {pendingActionsOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="space-y-2">
                                        {pendingActions.map((action) => (
                                            <a
                                                key={action.key}
                                                href={action.href}
                                                className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/[0.08] transition-colors group"
                                            >
                                                <div className="w-9 h-9 rounded-full border border-padel-green/50 bg-padel-green/10 flex items-center justify-center shrink-0">
                                                    {action.type === 'payment' ? (
                                                        <CreditCard size={16} className="text-padel-green" strokeWidth={2} />
                                                    ) : (
                                                        <MapPin size={16} className="text-padel-green" strokeWidth={2} />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-white leading-tight truncate">{action.title}</p>
                                                    <p className="text-xs text-white/50 font-medium truncate mt-0.5">{action.subtitle}</p>
                                                    <p className="text-xs font-bold text-padel-green truncate mt-0.5">{action.detail}</p>
                                                </div>
                                                <ChevronRight size={16} className="shrink-0 text-padel-green opacity-80 group-hover:translate-x-0.5 transition-transform" />
                                            </a>
                                        ))}
                                    </div>
                                </motion.div>
                                )}
                                </AnimatePresence>
                                </div>
                                )}
                                <HappeningNowWidget />
                                {hasScheduleContent && (
                                <div className="border-t border-white/5 mt-4 pt-4 pb-3">
                                <button
                                    type="button"
                                    onClick={() => setScheduleOpen((open) => !open)}
                                    aria-expanded={scheduleOpen}
                                    className={`flex w-full items-center justify-between px-1 text-left group ${scheduleOpen ? 'mb-3' : 'mb-0'}`}
                                >
                                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">My Schedule</h2>
                                    <ChevronDown
                                        size={16}
                                        className={`text-white/50 shrink-0 transition-transform duration-300 group-hover:text-white/70 ${scheduleOpen ? '' : '-rotate-90'}`}
                                    />
                                </button>
                                <AnimatePresence initial={false}>
                                {scheduleOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                {/* Glass panel */}
                                <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-4 md:p-5 shadow-2xl relative overflow-hidden border border-white/10">
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-0 relative z-10">

                                        {eventsLoading && upcomingEvents.length === 0 && upcomingMatchesList.length === 0 && pastEvents.length === 0 && pastMatchesList.length === 0 ? (
                                            // ── Shimmering Skeleton UI ──
                                            <>
                                                {/* Left Side Skeleton: Upcoming Events */}
                                                <div className="order-2 lg:order-1 lg:col-span-8 lg:pr-5">
                                                    <div className="flex items-center justify-between mb-3.5 px-1 animate-pulse">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-5 h-5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400" />
                                                            <div className="w-24 h-3 bg-white/10 rounded" />
                                                        </div>
                                                        <div className="w-12 h-3 bg-white/10 rounded" />
                                                    </div>

                                                    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                                                        {[1, 2, 3].map((item) => (
                                                            <div
                                                                key={item}
                                                                className="relative flex-shrink-0 w-52 md:w-64 h-[130px] bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-left animate-pulse flex flex-col justify-between overflow-hidden shadow-lg"
                                                            >
                                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />

                                                                <div className="flex justify-between items-start mb-2">
                                                                    <span className="w-12 h-3.5 bg-purple-500/10 border border-purple-500/20 rounded" />
                                                                    <span className="w-6 h-3 bg-white/10 rounded" />
                                                                </div>

                                                                <div className="space-y-1.5 mb-3.5">
                                                                    <div className="w-full h-3 bg-white/10 rounded" />
                                                                    <div className="w-2/3 h-3 bg-white/10 rounded" />
                                                                </div>

                                                                <div className="flex items-center justify-between mt-auto border-t border-white/5 pt-2">
                                                                    <div className="w-20 h-2.5 bg-purple-500/10 rounded" />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>


                                            </>
                                        ) : (
                                            // ── Actual Data ──
                                            <div className="lg:col-span-12">
                                                {/* Tabs + time filter on one compact row */}
                                                <div className="flex w-full mb-4 items-center gap-1.5 sm:gap-2 bg-transparent border border-white/10 rounded-xl p-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveHeroTab('matches')}
                                                        className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 rounded-lg transition-all text-[11px] sm:text-sm font-bold ${activeHeroTab === 'matches' ? 'border border-white/40 bg-white/5 text-white shadow-md' : 'text-white/50 hover:text-white'}`}
                                                    >
                                                        <Trophy size={14} className="sm:w-4 sm:h-4 shrink-0" />
                                                        <span>Matches</span>
                                                        {matchesCount > 0 && (
                                                            <span className="bg-orange-500 text-black text-[10px] sm:text-[11px] font-black px-1.5 py-0.5 rounded-full flex items-center justify-center min-w-[18px] leading-none">
                                                                {matchesCount}
                                                            </span>
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveHeroTab('events')}
                                                        className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 rounded-lg transition-all text-[11px] sm:text-sm font-bold ${activeHeroTab === 'events' ? 'border border-white/40 bg-white/5 text-white shadow-md' : 'text-white/50 hover:text-white'}`}
                                                    >
                                                        <Calendar size={14} className="sm:w-4 sm:h-4 shrink-0" />
                                                        <span>Events</span>
                                                        {upcomingEvents.length > 0 && (
                                                            <span className="bg-padel-green text-black text-[10px] sm:text-[11px] font-black px-1.5 py-0.5 rounded-full flex items-center justify-center min-w-[18px] leading-none">
                                                                {upcomingEvents.length}
                                                            </span>
                                                        )}
                                                    </button>
                                                    <div className="ml-auto min-w-0">
                                                        {renderScheduleTimeSwitch({ compact: true })}
                                                    </div>
                                                </div>

                                                {/* Events */}
                                                {activeHeroTab === 'events' && (
                                                    scheduleTimeFilter === 'upcoming' ? (
                                                        upcomingEvents.length > 0 ? (
                                                            renderEventRows(upcomingEvents)
                                                        ) : (
                                                            <div className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-5 flex flex-col items-center justify-center text-center animate-fade-in">
                                                                <Calendar size={28} strokeWidth={1.5} className="text-white/20 mb-2" />
                                                                <h3 className="text-white font-bold text-sm mb-1">You have no upcoming events.</h3>
                                                                <p className="text-white/50 text-[11px] font-medium mb-3">Explore the calendar to find your next event.</p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => navigate('/calendar')}
                                                                    className="text-padel-green text-xs font-bold flex items-center gap-1 hover:text-padel-green/80 transition-colors"
                                                                >
                                                                    Explore Calendar <ChevronRight size={14} />
                                                                </button>
                                                            </div>
                                                        )
                                                    ) : (
                                                        pastEvents.length > 0 ? (
                                                            renderPastPager(pastEvents, pastEventSlide, setPastEventSlide, renderSingleEventCard)
                                                        ) : (
                                                            <div className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-5 flex flex-col items-center justify-center text-center animate-fade-in">
                                                                <Calendar size={28} strokeWidth={1.5} className="text-white/20 mb-2" />
                                                                <h3 className="text-white font-bold text-sm mb-1">No past events yet.</h3>
                                                                <p className="text-white/50 text-[11px] font-medium">Your completed events will appear here.</p>
                                                            </div>
                                                        )
                                                    )
                                                )}

                                                {/* Matches */}
                                                {activeHeroTab === 'matches' && (
                                                    scheduleTimeFilter === 'upcoming' ? (
                                                        upcomingMatchesList.length > 0 ? (
                                                            <div className="w-full animate-fade-in flex flex-col gap-3">
                                                                {renderMatchRows(upcomingMatchesList, { featuredFirst: true })}
                                                            </div>
                                                        ) : (
                                                            <div className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-5 flex flex-col items-center justify-center text-center animate-fade-in">
                                                                <Trophy size={28} strokeWidth={1.5} className="text-white/20 mb-2" />
                                                                <h3 className="text-white font-bold text-sm mb-1">You have no upcoming matches.</h3>
                                                                <p className="text-white/50 text-[11px] font-medium">Your next match will appear here when draws are published.</p>
                                                            </div>
                                                        )
                                                    ) : (
                                                        pastMatchesList.length > 0 ? (
                                                            renderPastPager(
                                                                pastMatchesList,
                                                                pastMatchSlide,
                                                                setPastMatchSlide,
                                                                (match) => renderCompactMatchRow(match, 0, 1),
                                                            )
                                                        ) : (
                                                            <div className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-5 flex flex-col items-center justify-center text-center animate-fade-in">
                                                                <Trophy size={28} strokeWidth={1.5} className="text-white/20 mb-2" />
                                                                <h3 className="text-white font-bold text-sm mb-1">No past matches yet.</h3>
                                                                <p className="text-white/50 text-[11px] font-medium">Your match history will appear here.</p>
                                                            </div>
                                                        )
                                                    )
                                                )}
                                            </div>
                                        )}

                                    </div>
                                </div>
                                </motion.div>
                                )}
                                </AnimatePresence>
                                </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                </div>
            </div>
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
            <VideoModal
                isOpen={videoModal.isOpen}
                onClose={() => setVideoModal({ ...videoModal, isOpen: false })}
                videoUrl={videoModal.url}
                title={videoModal.title}
            />
        </div>
    );
};

export default Hero;
