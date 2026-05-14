import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { supabase } from '../supabaseClient';
import { useRankedin } from '../hooks/useRankedin';
import { Calendar as CalendarIcon, MapPin, Loader, Phone, Mail, Globe, Share2, ArrowLeft, ArrowRight, X, CheckCircle, CreditCard, Cloud, CloudRain, CloudLightning, CloudSnow, GitBranch, PlayCircle, Play, ImageIcon, ChevronDown, FileText, User, Users, Trophy, AlertCircle } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { usePaystackPayment } from 'react-paystack';
import { toPaystackAmount, FEES } from '../constants/fees';
import { toast } from 'sonner';

const PAYSTACK_PUBLIC_KEY = String(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '')
    .trim()
    .replace(/['"]/g, '')
    .split(/\s+/)[0]
    .replace(/[^a-zA-Z0-9_]/g, '');

const isTestMode = PAYSTACK_PUBLIC_KEY.startsWith('pk_test');

const tournamentHero = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&q=80';

const EVENT_CATEGORIES = [
    "Men's Open (Pro/Elite)",
    "Men's Advanced",
    "Men's Intermediate",
    "Ladies Open (Pro/Elite)",
    "Ladies Advanced",
    "Ladies Intermediate"
];

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
                    <h3 className={`text-xl md:text-2xl font-bold transition-colors duration-300 ${isOpen ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
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
    const getPlaylistEmbedUrl = (url) => {
        if (!url) return null;
        const match = url.match(/[&?]list=([^&]+)/);
        const playlistId = match ? match[1] : null;
        return playlistId ? `https://www.youtube.com/embed/videoseries?list=${playlistId}` : null;
    };

    const { slug } = useParams(); // changed from id to slug
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

    // New State for Tabs & Enhanced Data
    const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'divisions', 'media'
    const [tournamentClasses, setTournamentClasses] = useState([]);
    const [upcomingMatches, setUpcomingMatches] = useState([]);
    const [fetchingRankedinData, setFetchingRankedinData] = useState(false);

    const [videoModal, setVideoModal] = useState({ isOpen: false, url: '', title: '' });
    const [participants, setParticipants] = useState({});
    const [playerDivisions, setPlayerDivisions] = useState([]);
    const [fourMPlayers, setFourMPlayers] = useState({});
    const [fetchingParticipants, setFetchingParticipants] = useState(false);
    const { getTournamentClasses, getTournamentWinners, getTournamentMatches, getTournamentParticipants, getTournamentPlayerTabs } = useRankedin();

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

    const stripHtml = (html) => {
        if (!html) return '';
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    };

    // Registration Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCalendarMenuOpen, setIsCalendarMenuOpen] = useState(false);
    const [regStep, setRegStep] = useState(1); // 1: Form, 2: Success/Payment
    const [loggedInPlayer, setLoggedInPlayer] = useState(null);
    const [isRegistered, setIsRegistered] = useState(false);
    const [isPaid, setIsPaid] = useState(false);
    const [paidDivisions, setPaidDivisions] = useState([]);
    const [registeredDivisions, setRegisteredDivisions] = useState([]);
    const [selectedDivisions, setSelectedDivisions] = useState([]);
    const [isCheckingReg, setIsCheckingReg] = useState(false);

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

    // Prefill form from logged-in player profile when modal opens
    useEffect(() => {
        if (!isModalOpen) return;
        const prefillFromSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;

            const { data: playerData } = await supabase
                .from('players')
                .select('name, email, contact_number, category, license_type, paid_registration')
                .ilike('email', session.user.email)
                .maybeSingle();

            if (playerData) {
                setLoggedInPlayer(playerData);
                setFormData(prev => ({
                    ...prev,
                    full_name: prev.full_name || playerData.name || '',
                    email: prev.email || playerData.email || session.user.email || '',
                    phone: prev.phone || playerData.contact_number || '',
                    division: prev.division || playerData.category || ''
                }));
            } else {
                // Not a registered player yet, at least fill email
                setFormData(prev => ({
                    ...prev,
                    email: prev.email || session.user.email || ''
                }));
            }

            // check for existing registration to prevent duplicates early
            const checkEmail = (playerData?.email || session.user.email || '').toLowerCase().trim();
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
            const userEmail = session?.user?.email?.toLowerCase().trim() || formData.email?.toLowerCase().trim();
            
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
            const { data: localParts } = await supabase
                .from('tournament_participants')
                .select('class_name, is_paid')
                .eq('event_id', event.id)
                .or(profile?.id ? `profile_id.eq.${profile.id},email.ilike.${userEmail}` : `email.ilike.${userEmail}`);

            // 1b. Check legacy event_registrations table
            const { data: legacyRegs } = await supabase
                .from('event_registrations')
                .select('division, payment_status')
                .eq('event_id', event.id)
                .ilike('email', userEmail);

            // 1c. Check Direct Payments table
            const { data: directPayments } = await supabase
                .from('payments')
                .select('metadata')
                .eq('event_id', event.id)
                .eq('status', 'success')
                .eq('payment_type', 'event_entry_fee')
                .or(profile?.id ? `player_id.eq.${profile.id},metadata->>email.ilike.${userEmail}` : `metadata->>email.ilike.${userEmail}`);

            const paidDivs = Array.from(new Set([
                ...(legacyRegs || []).filter(r => r.payment_status === 'paid').map(r => (r.division || '').trim()),
                ...(localParts || []).filter(p => p.is_paid).map(p => (p.class_name || '').trim()),
                ...(directPayments || []).map(p => (p.metadata?.division || '').trim())
            ].filter(Boolean)));
            
            const unpaidLocalDivs = (localParts || [])
                .filter(p => !p.is_paid)
                .map(p => (p.class_name || '').trim());

            setPaidDivisions(paidDivs);
            setIsPaid(paidDivs.length > 0);

            // 2. Check Registration Status (Rankedin Live Player List fallback)
            const regDivs = [...unpaidLocalDivs];
            
            if (rId && regDivs.length === 0) {
                setIsCheckingReg(true);
                try {
                    const divisions = await getTournamentPlayerTabs(rId);
                    // ... scraper logic follows if needed, but we already have local ones
                    await Promise.all(divisions.map(async (cls) => {
                        const teams = await getTournamentParticipants(rId, cls.Id);
                        const isMatch = teams.some(t => {
                            const p = t.Participant || t;
                            const players = p.Players || [p.FirstPlayer, p.SecondPlayer].filter(Boolean);
                            if (players.length === 0) players.push(p);

                            return players.some(player => {
                                const pEmail = (player.Email || '').toLowerCase().trim();
                                const pName = (player.Name || player.FullName || '').toLowerCase().trim();
                                const pRID = player.RankedinId?.toString() || player.Id?.toString();

                                return (pEmail && pEmail === userEmail) ||
                                    (userRID && pRID === userRID?.toString()) ||
                                    (userName && pName === userName);
                            });
                        });
                        
                        const divName = (cls.Name || '').trim();
                        if (isMatch && !regDivs.includes(divName)) regDivs.push(divName);
                    }));
                } catch (e) {
                    console.error("Registration check failed:", e);
                } finally {
                    setIsCheckingReg(false);
                }
            }

            setRegisteredDivisions(Array.from(new Set(regDivs)));
            setIsRegistered(regDivs.length > 0);
            
            // Default select the first division if only one found and not yet paid
            if (regDivs.length === 1 && !paidDivs.includes(regDivs[0])) {
                setSelectedDivisions([regDivs[0]]);
            }
                } catch (e) {
                    console.error("Registration check failed:", e);
                } finally {
                    setIsCheckingReg(false);
                }
            }
        };
        checkStatus();
    }, [event?.id, formData.email, loggedInPlayer, getTournamentParticipants, getTournamentPlayerTabs]);

    // Debounced email lookup
    useEffect(() => {
        const checkEmail = async () => {
            if (!formData.email || formData.email.length < 5 || !formData.email.includes('@')) {
                setEmailCheckStatus('idle');
                setPlayerProfileData(null);
                return;
            }
            setEmailCheckStatus('checking');
            try {
                const { data } = await supabase
                    .from('players')
                    .select('id, name, email, paid_registration, license_type')
                    .ilike('email', formData.email.trim())
                    .maybeSingle();

                if (data) {
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
    }, [formData.email]);

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

                // Check if the parameter looks like a UUID (simple check)
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug);

                // Alternatively, just check if it's numeric (ID) vs string (Slug)
                // Since our IDs seem to be integers in some contexts or UUIDs... 
                // Wait, in CalendarManager it uses auto-increment ID? "order('id')" suggests int.
                // The previous code had `id` param.
                // If ID is numeric:
                const isNumeric = /^\d+$/.test(slug);

                if (isNumeric) {
                    query = query.eq('id', slug);
                } else if (isUuid) {
                    query = query.eq('id', slug);
                } else {
                    // Assume it's a slug
                    query = query.eq('slug', slug);
                }

                const { data, error } = await query
                    .neq('is_visible', false)
                    .single();

                if (error) throw error;
                setEvent(data);

                // Auto-open registration modal if URL param is present
                const params = new URLSearchParams(window.location.search);
                if (params.get('register') === 'true') {
                    setIsModalOpen(true);
                }
            } catch (error) {
                console.error('Error fetching event details:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchEventDetails();
    }, [slug]);

    useEffect(() => {
        const checkRankedinStatus = async () => {
            if (!event) return;
            const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);

            if (rId) {
                setFetchingRankedinData(true);
                try {
                    // 1. Check DB Cache first
                    const { data: cacheRow, error: cacheError } = await supabase
                        .from('rankedin_results_cache')
                        .select('*')
                        .eq('event_id', event.id)
                        .maybeSingle();

                    const isPassed = new Date(event.end_date || event.start_date) < new Date();
                    const MIN_SYNC_DATE = new Date('2026-04-02T08:50:00Z');




                    let useCache = false;
                    if (cacheRow) {
                        const lastSynced = new Date(cacheRow.last_synced_at);
                        const isCacheValid = lastSynced >= MIN_SYNC_DATE;

                        if (isPassed) {
                            // If event is passed, use cache only if it's from after our latest logic fix
                            useCache = isCacheValid;
                        } else {
                            // If event is live, use cache only if it's less than 1 hour old AND from after our fix
                            const now = new Date();
                            const diffHrs = Math.abs(now - lastSynced) / 36e5;
                            if (diffHrs < 1 && isCacheValid) {
                                useCache = true;
                            }
                        }
                    }

                    if (useCache && cacheRow) {
                        setTournamentClasses(cacheRow.classes || []);
                        setWinners(cacheRow.winners || []);
                        setHasDraw(cacheRow.has_draw || false);
                        setHasResults(cacheRow.has_results || false);
                        setUpcomingMatches(cacheRow.upcoming_matches || []);
                    } else {
                        // 2. Fetch from Live API
                        const classes = await getTournamentClasses(rId);
                        let drawAvailable = false;
                        let apiWinners = [];
                        let apiHasResults = false;
                        let apiUpcomingMatches = [];

                        if (classes) {
                            setTournamentClasses(classes);
                            drawAvailable = classes.some(c =>
                                c.IsPublished &&
                                Array.isArray(c.TournamentDraws) &&
                                c.TournamentDraws.length > 0
                            );
                            setHasDraw(drawAvailable);
                        }

                        if (isPassed) {
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
                                }
                            }
                        } else {
                            // Fetch upcoming matches for live/upcoming events
                            const matchesPreview = await getTournamentMatches({ tournamentId: rId, isFinished: false });
                            if (matchesPreview && matchesPreview.length > 0) {
                                apiUpcomingMatches = matchesPreview.slice(0, 15);
                                setUpcomingMatches(apiUpcomingMatches);
                            }
                        }

                        // 3. Upsert back to Database Cache
                        console.log("Upserting Rankedin Cache to Database...");
                        await supabase
                            .from('rankedin_results_cache')
                            .upsert({
                                event_id: event.id,
                                rankedin_id: rId.toString(),
                                classes: classes || [],
                                winners: apiWinners,
                                has_draw: drawAvailable,
                                has_results: apiHasResults,
                                upcoming_matches: apiUpcomingMatches,
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
    }, [event, getTournamentClasses, getTournamentWinners, getTournamentMatches]);

    useEffect(() => {
        const fetchParticipantsData = async () => {
            if (activeTab !== 'players' || !event) return;
            const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
            if (!rId) return;

            setFetchingParticipants(true);
            try {
                // First get the divisions (tabs) specifically from the players view
                let divisions = playerDivisions;
                if (divisions.length === 0) {
                    divisions = await getTournamentPlayerTabs(rId);
                    setPlayerDivisions(divisions);
                }

                if (divisions.length > 0) {
                    const participantsMap = {};
                    for (const cls of divisions) {
                        const data = await getTournamentParticipants(rId, cls.Id);
                        participantsMap[cls.Id] = data;
                    }
                    setParticipants(prev => ({ ...prev, ...participantsMap }));
                }
            } catch (err) {
                console.error("Error fetching participants:", err);
            } finally {
                setFetchingParticipants(false);
            }
        };

        fetchParticipantsData();
    }, [activeTab, event, getTournamentParticipants, getTournamentPlayerTabs, playerDivisions]);

    useEffect(() => {
        const fetchFourMPlayers = async () => {
            try {
                const { data, error } = await supabase
                    .from('players')
                    .select('name, rankedin_id, image_url')
                    .not('image_url', 'is', null);

                if (data && !error) {
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

    useEffect(() => {
        const fetchAlbumPhotos = async () => {
            if (!event) return;

            // Check if there's an album linked to this event in our DB
            try {
                const { data: albumData, error: albumError } = await supabase
                    .from('albums')
                    .select('id, title, description, slug')
                    .eq('event_id', event.id)
                    .single();

                if (albumData?.id && !albumError) {
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
        if (event?.category_fees && event.category_fees[category]) {
            return Number(event.category_fees[category]);
        }
        return Number(event?.entry_fee || 0);
    };

    const calculateTotalAmount = () => {
        let entryFeesTotal = selectedDivisions.reduce((sum, div) => sum + getEntryFeeForCategory(div), 0);
        let total = entryFeesTotal;

        // Add Temp License or Full License fee if player doesn't have a valid license
        if (playerProfileData && !playerProfileData.paid_registration) {
            total += licenseChoice === 'full' ? FEES.FULL_LICENSE : FEES.TEMPORARY_LICENSE;
        }

        // Add Partner costs if paying for them and partner registration is enabled
        if (hasPartner && payForPartner && partnerProfile) {
            total += entryFeesTotal; // Same divisions assumed for partners usually
            if (!partnerProfile.paid_registration) {
                total += partnerLicenseChoice === 'full' ? FEES.FULL_LICENSE : FEES.TEMPORARY_LICENSE;
            }
        }

        return total;
    };

    const [firstname, ...lastnameParts] = (formData.full_name || '').split(' ');
    const lastname = lastnameParts.join(' ');

    const paystackConfig = {
        reference: paymentReference || `REGEV-${event?.id}-${Date.now()}`,
        email: formData.email,
        firstname: firstname || '',
        lastname: lastname || '',
        amount: toPaystackAmount(calculateTotalAmount()),
        currency: 'ZAR',
        publicKey: PAYSTACK_PUBLIC_KEY,
        metadata: {
            event_id: event?.id,
            event_name: event?.event_name,
            full_name: formData.full_name,
            partner_name: formData.partner_name,
            partner_id: partnerProfile?.id,
            division: formData.division,
            is_test: isTestMode,
            includes_license: playerProfileData && !playerProfileData.paid_registration,
            license_type: licenseChoice,
            paying_for_partner: hasPartner && payForPartner,
            partner_needs_license: hasPartner && payForPartner && partnerProfile && !partnerProfile.paid_registration,
            partner_license_type: hasPartner && payForPartner && partnerProfile && !partnerProfile.paid_registration ? partnerLicenseChoice : null
        }
    };

    const initializePayment = usePaystackPayment(paystackConfig);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        if (name === 'partner_name') {
            handlePartnerSearch(value);
        }
    };

    const handlePartnerSearch = (name) => {
        if (searchTimeout) clearTimeout(searchTimeout);

        // Immediate cleanup for better UX
        setPartnerProfile(null);
        setPartnerLookupError(null);
        setPayForPartner(false);

        if (!name || name.length < 2) {
            setPartnerSearchResults([]);
            return;
        }

        const timeout = setTimeout(async () => {
            setIsLookingUpPartner(true);
            try {
                const { data, error } = await supabase
                    .from('players')
                    .select('id, name, email, paid_registration, license_type, category')
                    .ilike('name', `%${name.trim()}%`)
                    .limit(8);

                if (data && data.length > 0) {
                    setPartnerSearchResults(data);
                    setPartnerLookupError(null);
                } else {
                    setPartnerSearchResults([]);
                    setPartnerLookupError("Profile not found. Partner must register to be paid for.");
                }
            } catch (err) {
                console.error("Partner lookup error:", err);
            } finally {
                setIsLookingUpPartner(false);
            }
        }, 500);
        setSearchTimeout(timeout);
    };

    const handleSelectPartner = (player) => {
        setPartnerProfile(player);
        setFormData(prev => ({ ...prev, partner_name: player.name }));
        setPartnerSearchResults([]);
        setPartnerLookupError(null);
    };

    const handleRegister = () => {
        // Validation — must be synchronous to avoid popup blocking/redirects
        if (!formData.full_name.trim() || !formData.email.trim()) {
            toast.error('Please fill in your name and email.');
            return;
        }

        if (emailCheckStatus === 'not_found') {
            toast.error('Profile not found. Please create a profile first.');
            return;
        }

        // Only block if they have already paid for ALL their registered divisions 
        // AND they haven't selected any new ones to pay for now
        const hasUnpaidSelections = selectedDivisions.some(div => !paidDivisions.some(pd => pd.trim().toLowerCase() === div.trim().toLowerCase()));
        const isFullyPaid = isRegistered && registeredDivisions.length > 0 && registeredDivisions.every(div => paidDivisions.some(pd => pd.trim().toLowerCase() === div.trim().toLowerCase()));

        if (isFullyPaid && !hasUnpaidSelections) {
            toast.error('You have already paid for all your registered divisions!');
            return;
        }

        if (!PAYSTACK_PUBLIC_KEY.startsWith('pk_')) {
            toast.error('Payment system not configured. Please contact support.');
            return;
        }

        // Open Paystack inline popup directly using the exact pattern from License Modal
        initializePayment({
            onSuccess: (ref) => handlePaymentSuccess(ref),
            onClose: () => {
                console.log("Paystack payment cancelled.");
                toast.info('Payment cancelled.');
            }
        });
    };

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

        // Move to success step immediately for UX closure (matches License Modal's immediate reaction)
        setRegStep(2);
        setIsPaid(true);
        setIsRegistered(true);
        toast.success("Payment Received! Recording your registration...");

        try {
            const paystackRef = typeof reference === 'string' ? reference : (reference?.reference || reference?.trxref || 'Unknown');
            
            // 1. Create registrations for EACH selected division
            const registrationsToUpsert = [];
            
            selectedDivisions.forEach(division => {
                registrationsToUpsert.push({
                    event_id: event.id,
                    full_name: formData.full_name,
                    email: formData.email,
                    phone: formData.phone,
                    partner_name: formData.partner_name,
                    division: division,
                    payment_status: 'paid',
                    is_test: isTestMode
                });

                if (payForPartner && partnerProfile) {
                    registrationsToUpsert.push({
                        event_id: event.id,
                        full_name: partnerProfile.name,
                        email: partnerProfile.email,
                        partner_name: formData.full_name,
                        division: division,
                        payment_status: 'paid',
                        is_test: isTestMode
                    });
                }
            });

            // Ensure unique registrations by email + division
            const uniqueRegistrations = Array.from(new Map(registrationsToUpsert.map(r => [`${r.email.toLowerCase()}_${r.division}`, r])).values());

            const { error: regError } = await supabase
                .from('event_registrations')
                .upsert(uniqueRegistrations, { onConflict: 'event_id, email, division' });

            if (regError) {
                console.error("Reg Error:", regError);
                toast.error(`Database Error: ${regError.message}`);
            }

            // 2. Record Payment Records
            const { data: pData } = await supabase.from('players').select('id').ilike('email', formData.email).maybeSingle();
            const playerId = pData?.id || null;

            const paymentsToInsert = [];

            // Entry Fees for each division
            selectedDivisions.forEach(division => {
                const fee = getEntryFeeForCategory(division);
                const partnerEntryFee = (payForPartner && partnerProfile) ? fee : 0;
                
                // Main Player (gets the combined fee for the pair)
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
                            ...(payForPartner ? [{ type: 'entry_fee', amount: fee, player: partnerProfile.name }] : [])
                        ]
                    }
                });

                // Partner (gets R0 record with attribution)
                if (payForPartner && partnerProfile) {
                    paymentsToInsert.push({
                        player_id: partnerProfile.id,
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
                            line_items: [
                                { type: 'entry_fee', amount: 0, player: partnerProfile.name, paid_by: formData.full_name }
                            ]
                        }
                    });
                }
            });

            // Main Player: License (if applicable)
            if (playerProfileData && !playerProfileData.paid_registration) {
                const isFull = licenseChoice === 'full';
                const licenseAmount = isFull ? FEES.FULL_LICENSE : FEES.TEMPORARY_LICENSE;

                paymentsToInsert.push({
                    player_id: playerId,
                    event_id: event.id,
                    amount: licenseAmount,
                    status: 'success',
                    payment_type: isFull ? 'full_license' : 'temp_license',
                    payment_method: 'paystack',
                    reference: `License - ${formData.full_name}`,
                    is_test: isTestMode,
                    metadata: { paystack_ref: paystackRef }
                });

                if (!isFull) {
                    // Add to temporary_licenses table
                    await supabase.from('temporary_licenses').insert({
                        player_id: playerId,
                        event_id: event.id,
                        event_name: event.event_name,
                        event_date: event.start_date
                    });
                }

                await supabase.from('players').update({ paid_registration: true, approved: true, license_type: isFull ? 'full' : 'temporary' }).eq('id', playerId);
            }

            // Partner side
            if (payForPartner && partnerProfile) {
                // Partner: Entry Fee (handled in selectedDivisions loop above)
                
                // Partner License
                if (!partnerProfile.paid_registration) {
                    const isPartnerFull = partnerLicenseChoice === 'full';
                    const partnerLicenseAmount = isPartnerFull ? FEES.FULL_LICENSE : FEES.TEMPORARY_LICENSE;

                    // Main player pays for the partner's license
                    paymentsToInsert.push({
                        player_id: playerId,
                        event_id: event.id,
                        amount: partnerLicenseAmount,
                        status: 'success',
                        payment_type: isPartnerFull ? 'full_license' : 'temp_license',
                        payment_method: 'paystack',
                        reference: `LIC-FOR-PARTNER-${paystackRef}`,
                        is_test: isTestMode,
                        metadata: { paystack_ref: paystackRef, paid_for_name: partnerProfile.name }
                    });

                    // Partner gets R0 license record
                    paymentsToInsert.push({
                        player_id: partnerProfile.id,
                        event_id: event.id,
                        amount: 0,
                        status: 'success',
                        payment_type: isPartnerFull ? 'full_license' : 'temp_license',
                        payment_method: 'paystack',
                        reference: `LIC-PARTNER-${paystackRef}`,
                        is_test: isTestMode,
                        metadata: { 
                            paystack_ref: paystackRef,
                            paid_by_name: formData.full_name,
                            paid_by_id: playerId
                        }
                    });

                    if (!isPartnerFull) {
                        // Add to temporary_licenses table
                        await supabase.from('temporary_licenses').insert({
                            player_id: partnerProfile.id,
                            event_id: event.id,
                            event_name: event.event_name,
                            event_date: event.start_date
                        });
                    }

                    await supabase.from('players').update({ paid_registration: true, approved: true, license_type: isPartnerFull ? 'full' : 'temporary' }).eq('id', partnerProfile.id);
                }
            }

            console.log("Saving payments...");
            await supabase.from('payments').insert(paymentsToInsert);

            // 3. Mark in participants list
            console.log("Updating participants...");

            // Sync Main Player
            const mainPlayerFilters = [];
            if (playerId) mainPlayerFilters.push(`profile_id.eq.${playerId}`);
            if (formData.email) mainPlayerFilters.push(`email.ilike.${formData.email}`);
            if (formData.full_name) mainPlayerFilters.push(`full_name.ilike.%${formData.full_name}%`);

            // 3. Mark in participants list (Improved Sync)
            console.log("Updating participants for Event ID:", event.id);

            const syncParticipant = async (pId, pEmail, pName, label, targetDivisions = []) => {
                try {
                    const filters = [];
                    if (pId) filters.push(`profile_id.eq.${pId}`);
                    if (pName) filters.push(`full_name.ilike.%${pName}%`);

                    if (filters.length === 0) {
                        console.warn(`No sync data provided for ${label}`);
                        return;
                    }

                    console.info(`Searching for ${label} participant...`, filters.join(','));

                    // 1. Try finding with combined filters (OR)
                    let { data: matches, error: fetchError } = await supabase
                        .from('tournament_participants')
                        .select('id, full_name, profile_id, event_id, class_name')
                        .eq('event_id', Number(event.id))
                        .or(filters.join(','));

                    // 1b. Fallback: If no match and we have a name, try searching for name match in this event specifically
                    if ((!matches || matches.length === 0) && pName) {
                        console.info(`No filters match for ${label}. Trying direct name match in event...`);
                        const { data: nameMatch } = await supabase
                            .from('tournament_participants')
                            .select('id, full_name, profile_id')
                            .eq('event_id', Number(event.id))
                            .ilike('full_name', `%${pName}%`);

                        if (nameMatch && nameMatch.length > 0) {
                            matches = nameMatch;
                        }
                    }

                    if (fetchError) {
                        console.error(`${label} Participant Sync Fetch Error:`, fetchError);
                        return;
                    }

                    if (!matches || matches.length === 0) {
                        console.warn(`CRITICAL: No participant record found for ${label} (${pName}) in event ${event.id}. Check if Rankedin sync is complete.`);
                        return;
                    }

                    console.info(`Found ${matches.length} matching record(s) for ${label}:`, matches);

                    // 2. Update each match by its unique UUID (filtering by division if provided)
                    for (const match of matches) {
                        if (targetDivisions && targetDivisions.length > 0) {
                            const normalizedMatchDiv = (match.class_name || '').toLowerCase().trim().replace(/[^a-z]/g, '');
                            const isTargetDiv = targetDivisions.some(d => {
                                const normalizedTarget = (d || '').toLowerCase().trim().replace(/[^a-z]/g, '');
                                return normalizedMatchDiv.includes(normalizedTarget) || normalizedTarget.includes(normalizedMatchDiv);
                            });
                            if (!isTargetDiv) {
                                console.info(`Skipping sync for division ${match.class_name} as it was not part of this payment.`);
                                continue;
                            }
                        }

                        const { error: updateError } = await supabase
                            .from('tournament_participants')
                            .update({
                                is_paid: true,
                                is_test: isTestMode,
                                last_synced_at: new Date().toISOString()
                            })
                            .eq('id', match.id);

                        if (updateError) {
                            console.error(`Update Error for ${label} (Row: ${match.id}):`, updateError);
                        } else {
                            console.info(`MATCH SUCCESS: ${label} marked as PAID. Row ID: ${match.id}`);
                        }
                    }
                } catch (sErr) {
                    console.error(`${label} sync logic failure:`, sErr);
                }
            };

            // Get logged in player profile details for sync
            const mainPId = loggedInPlayer?.profile_id || loggedInPlayer?.id;
            const mainPEmail = loggedInPlayer?.email || formData.email;
            const mainPName = loggedInPlayer?.name || formData.full_name;

            if (!mainPId && !mainPEmail && !mainPName) {
                console.error("FATAL: No registrant information available for sync!");
            } else {
                console.info("Starting sync for Main Player:", { id: mainPId, email: mainPEmail, name: mainPName, divisions: selectedDivisions });
                await syncParticipant(mainPId, mainPEmail, mainPName, "Main Player", selectedDivisions);
            }

            // Sync Partner
            if (payForPartner && partnerProfile) {
                console.info("Starting sync for Partner:", { id: partnerProfile.id, name: partnerProfile.name, divisions: selectedDivisions });
                await syncParticipant(partnerProfile.id, partnerProfile.email, partnerProfile.name, "Partner", selectedDivisions);
            }

            console.log("Registration Save Complete!");

        } catch (err) {
            console.error("Critical Save Error:", err);
            toast.error(`Error saving registration: ${err.message}`);
        }
    };

    const handlePayNow = () => {
        if (!PAYSTACK_PUBLIC_KEY.startsWith('pk_')) {
            toast.error('Payment system not configured correctly');
            return;
        }
        initializePayment(handlePaymentSuccess, () => {
            toast.info('Payment cancelled');
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0F172A] flex items-center justify-center text-white">
                <Loader className="w-10 h-10 animate-spin text-padel-green" />
            </div>
        );
    }

    if (!event) {
        return (
            <div className="min-h-screen bg-[#0F172A] flex items-center justify-center text-white">
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-4">Event not found</h2>
                    <Link to="/calendar" className="text-padel-green hover:underline">Back to Calendar</Link>
                </div>
            </div>
        );
    }

    return (
        <>
            <Helmet>
                <title>{`${event.event_name} | 4M Padel`}</title>
                <meta property="og:title" content={`${event.event_name} | 4M Padel`} />
                <meta property="og:description" content={`${event.event_dates} at ${event.venue}. View draws, results, and registration info on 4M Padel.`} />
                <meta property="og:image" content={event.custom_image_url || event.image_url || tournamentHero} />
                <meta property="og:type" content="article" />
            </Helmet>
            <main className="bg-slate-50 min-h-screen text-slate-900 relative font-sans pb-24 md:pb-0">
                {/* Hero Section with Image */}
                <div className="relative h-[20vh] md:h-[45vh] min-h-[140px] md:min-h-[400px] w-full overflow-hidden bg-slate-900 flex items-center justify-center">
                    <img
                        src={event.custom_image_url || event.image_url || tournamentHero}
                        alt={event.event_name}
                        className="absolute inset-0 w-full h-full object-cover opacity-60 contrast-125 saturate-50 blur-sm scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-slate-50" />

                    {/* Background Big Text Inside Hero */}
                    <div className="relative z-10 w-full overflow-hidden select-none pointer-events-none translate-y-1/3">
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-[70px] md:text-[220px] font-black text-white/[0.07] uppercase leading-none whitespace-nowrap text-center tracking-tighter"
                        >
                            {event.event_name.split(' ').slice(0, 3).join(' ')}
                        </motion.h1>
                    </div>
                </div>

                <div className="container mx-auto px-4 lg:px-6 relative z-10 -mt-20 md:-mt-32 pb-32">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mb-6"
                    >
                        <Link
                            to="/calendar"
                            className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md text-white px-4 py-2 rounded-full hover:bg-white hover:text-black transition-all duration-300 border border-white/20 group"
                        >
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                            <span className="text-xs font-black uppercase tracking-[0.2em]">Back to Calendar</span>
                        </Link>
                    </motion.div>
                    <div className="flex flex-col lg:flex-row gap-8 relative">
                        {/* Background Glow Effect */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-full opacity-30 blur-[100px] pointer-events-none z-0">
                            <div
                                className="w-full h-full rounded-full bg-padel-green/40"
                                style={{
                                    background: event.image_url ? `url(${event.image_url})` : undefined,
                                    backgroundSize: 'cover',
                                    filter: 'blur(80px) saturate(2)'
                                }}
                            />
                        </div>

                        {/* Ticket Card (Floating & Glassmorphic) */}
                        <motion.div
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            className="bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col md:flex-row max-w-6xl w-full mx-auto border border-white/50 relative z-10"
                        >
                            {/* Left Side: Event Info */}
                            <div className="p-8 md:p-12 flex-1 md:border-r border-dashed border-gray-300/50 relative">
                                {/* Punch hole effect top/bottom on border */}
                                <div className="hidden md:block absolute -top-4 -right-4 w-8 h-8 bg-slate-50 rounded-full z-10 shadow-inner" />
                                <div className="hidden md:block absolute -bottom-4 -right-4 w-8 h-8 bg-slate-50 rounded-full z-10 shadow-inner" />

                                <motion.div variants={itemVariants}>
                                    {isLive && (
                                        <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 border border-red-500/20">
                                            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                                            Live Now
                                        </div>
                                    )}
                                    <h1 className="text-2xl md:text-4xl font-black text-slate-900 mb-8 tracking-tighter leading-tight">{event.event_name}</h1>
                                </motion.div>

                                <div className="space-y-8">
                                    {/* Date & Time */}
                                    <motion.div variants={itemVariants} className="flex items-start gap-5">
                                        <div className="w-12 h-12 rounded-2xl bg-padel-green/10 flex items-center justify-center text-padel-green shrink-0 shadow-sm border border-padel-green/5">
                                            <CalendarIcon className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mb-1.5 opacity-70">Date and Time</p>
                                            <p className="font-bold text-xl text-slate-900 tracking-tight">{event.event_dates}</p>
                                            {(event.start_time || event.end_time) && (
                                                <p className="text-slate-500 font-medium text-sm mt-1 bg-slate-100/50 inline-block px-2 py-0.5 rounded-md">
                                                    {event.start_time} {event.end_time ? `- ${event.end_time}` : ''}
                                                </p>
                                            )}
                                        </div>
                                    </motion.div>

                                    {/* Location */}
                                    <motion.div variants={itemVariants} className="flex items-start gap-5">
                                        <div className="w-12 h-12 rounded-2xl bg-padel-green/10 flex items-center justify-center text-padel-green shrink-0 shadow-sm border border-padel-green/5">
                                            <MapPin className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mb-1.5 opacity-70">Address</p>
                                            <p className="font-bold text-xl text-slate-900 tracking-tight">{event.venue}</p>
                                            <p className="text-slate-500 font-medium text-sm mt-1">{event.address || event.city}</p>
                                        </div>
                                    </motion.div>
                                </div>
                            </div>

                            {/* Middle Side: Registration Action */}
                            <div className="p-6 md:p-12 w-full md:w-[340px] bg-slate-50/50 flex flex-col items-center justify-center gap-4 md:gap-8 relative overflow-hidden md:border-r border-dashed border-gray-300/50">
                                <div className="absolute -top-4 -left-4 w-8 h-8 bg-slate-50 rounded-full z-10 shadow-inner md:block hidden" />
                                <div className="absolute -bottom-4 -left-4 w-8 h-8 bg-slate-50 rounded-full z-10 shadow-inner md:block hidden" />
                                <div className="absolute -top-4 -right-4 w-8 h-8 bg-slate-50 rounded-full z-10 shadow-inner md:block hidden" />
                                <div className="absolute -bottom-4 -right-4 w-8 h-8 bg-slate-50 rounded-full z-10 shadow-inner md:block hidden" />

                                <motion.div variants={itemVariants} className="text-center w-full relative z-10">
                                    <div className="flex flex-col items-center mb-8">
                                        <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl shadow-sm border border-gray-100">
                                            <span className="text-3xl font-black text-slate-900 tabular-nums">
                                                <CountUp end={event.registered_players || 0} />
                                            </span>
                                            <div className="text-left leading-none">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Registered</p>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Players</p>
                                            </div></div></div><h3 className="font-black text-slate-900 text-2xl mb-2 tracking-tight uppercase">
                                        {isEventPassed ? 'Results' : 'Join In'}
                                    </h3>
                                    <p className="text-xs font-bold text-gray-400 mb-8 uppercase tracking-widest">
                                        {isEventPassed ? 'Tournament concluded' : 'Secure your spot'}
                                    </p>

                                    {!isEventPassed && (
                                        <div className="space-y-4">
                                            {isRegistered ? (
                                                <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-slate-900 w-full shadow-xl shadow-slate-200 border border-white/5">
                                                    <div className="w-10 h-10 rounded-full bg-padel-green flex items-center justify-center text-slate-900 shadow-lg shadow-padel-green/40">
                                                        <CheckCircle size={24} strokeWidth={3} />
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-[10px] font-black text-padel-green uppercase tracking-[0.2em] mb-1">Registered on Rankedin</p>
                                                        <p className="text-xs font-bold text-white leading-tight">You're on the player list! Good luck on the court.</p>
                                                    </div>
                                                </div>
                                            ) : slug === 'guardrisk-north-vs-south-2026' ? (
                                                <div
                                                    className="flex items-center justify-center w-full bg-padel-green text-[#0F172A] font-black py-4 rounded-2xl shadow-xl shadow-padel-green/20 uppercase tracking-[0.2em] text-xs ring-1 ring-inset ring-black/5"
                                                >
                                                    Invitation Only
                                                </div>
                                            ) : (
                                                <motion.a
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    href={event.rankedin_url || `https://www.rankedin.com/`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center justify-center w-full bg-padel-green !text-[#0F172A] font-black py-4 rounded-2xl shadow-xl shadow-padel-green/20 hover:bg-slate-900 hover:!text-white transition-all duration-300 uppercase tracking-[0.2em] text-xs ring-1 ring-inset ring-black/5"
                                                >
                                                    Register Now
                                                </motion.a>
                                            )}

                                            {/* Pay Entry Fee button — only shown when entry_fee or category_fees are configured AND there is something to pay */}
                                            {(event.entry_fee > 0 || (event.category_fees && Object.keys(event.category_fees).length > 0)) && 
                                             (!isPaid || (isRegistered && !registeredDivisions.every(div => 
                                                 paidDivisions.some(pd => pd.trim().toLowerCase() === div.trim().toLowerCase())
                                             ))) && (
                                                <motion.button
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => { setRegStep(1); setIsModalOpen(true); }}
                                                    className="flex items-center justify-center gap-2 w-full bg-slate-900 text-padel-green font-black py-4 rounded-2xl shadow-xl hover:bg-padel-green hover:text-slate-900 transition-all duration-300 uppercase tracking-[0.2em] text-xs ring-1 ring-inset ring-white/5"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>
                                                    Pay Entry Fee
                                                </motion.button>
                                            )}

                                            {isPaid && (
                                                <div className="flex flex-col items-center gap-2 w-full bg-slate-900 p-4 rounded-2xl border border-white/10 shadow-lg">
                                                    <div className="flex items-center justify-center gap-2 text-padel-green font-black uppercase tracking-[0.2em] text-[10px]">
                                                        <CheckCircle size={16} strokeWidth={3} />
                                                        Payment Received
                                                    </div>
                                                    <div className="flex flex-wrap justify-center gap-1">
                                                        {paidDivisions.map(div => (
                                                            <span key={div} className="px-2 py-0.5 bg-padel-green/10 text-padel-green border border-padel-green/20 rounded text-[8px] font-black uppercase tracking-widest">{div}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="relative">
                                                <motion.button
                                                    whileHover={{ border: '2px solid #0F172A' }}
                                                    className="w-full bg-white border-2 border-slate-200 text-slate-600 font-black py-4 rounded-2xl hover:text-slate-900 transition-all duration-300 uppercase tracking-[0.1em] text-[10px] flex items-center justify-center gap-2"
                                                    onClick={handleMainCalendarClick}
                                                >
                                                    Add to Calendar
                                                    {/* Show chevron only on desktop where menu is used */}
                                                    <div className="hidden md:block">
                                                        <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isCalendarMenuOpen ? 'rotate-180' : ''}`} />
                                                    </div>
                                                </motion.button>


                                                <AnimatePresence>
                                                    {isCalendarMenuOpen && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            className="absolute left-0 right-0 bottom-full mb-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[100]"
                                                        >
                                                            <button
                                                                onClick={handleGoogleCalendar}
                                                                className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-3 border-b border-slate-50"
                                                            >
                                                                <div className="w-2 h-2 rounded-full bg-[#4285F4]" />
                                                                Google Calendar (Android)
                                                            </button>
                                                            <button
                                                                onClick={handleAppleCalendar}
                                                                className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-3 border-b border-slate-50"
                                                            >
                                                                <div className="w-2 h-2 rounded-full bg-slate-900" />
                                                                Apple Calendar (iPhone)
                                                            </button>
                                                            <button
                                                                onClick={handleOutlookCalendar}
                                                                className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-3"
                                                            >
                                                                <div className="w-2 h-2 rounded-full bg-[#0078D4]" />
                                                                Outlook / Other
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                        </div>
                                    )}

                                    {(() => {
                                        const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
                                        if ((!hasDraw && !hasResults) || (!rId && !event.slug)) return null;

                                        return (
                                            <div className="w-full space-y-4">
                                                {(hasDraw || hasResults) && (
                                                    <motion.div whileHover={{ y: -2 }} whileTap={{ y: 0 }}>
                                                        <Link
                                                            to={`/draws/${event.slug || rId}`}
                                                            className="w-full flex items-center justify-center gap-3 bg-slate-900 !text-padel-green font-black py-4 rounded-2xl shadow-xl hover:bg-padel-green hover:!text-black transition-all duration-300 uppercase tracking-[0.2em] text-xs"
                                                        >
                                                            <GitBranch className="w-4 h-4" />
                                                            View Draws & Results
                                                        </Link>
                                                    </motion.div>
                                                )}

                                            </div>
                                        );
                                    })()}
                                </motion.div>

                                <div className="text-center pt-4 md:pt-8 border-t border-gray-200/50 w-full relative z-10">
                                    <p className="text-[10px] text-gray-300 uppercase tracking-[0.3em] font-black">Powered by 4M Padel</p>
                                </div>
                            </div>

                            {/* Right Side: Poster */}
                            {(event.custom_image_url || event.image_url) && (
                                <div className="p-4 md:p-12 w-full md:w-[300px] bg-white/40 flex flex-col items-center justify-center relative overflow-hidden">
                                    <motion.div
                                        variants={itemVariants}
                                        whileHover={{ scale: 1.05 }}
                                        className="w-2/3 md:w-full aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border-4 border-white transition-all duration-500 hover:shadow-padel-green/20 bg-black flex items-center justify-center"
                                    >
                                        <img
                                            src={event.custom_image_url || event.image_url}
                                            alt="Event Poster"
                                            className="w-full h-full object-contain"
                                        />
                                    </motion.div>
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {/* Sticky Action Bar for Mobile */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-[100] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] flex items-center justify-between gap-4">
                        <div className="flex-1">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{event.registered_players || 0} Registered</p>
                            <p className="font-bold text-slate-900 line-clamp-1">{event.event_name}</p>
                        </div>
                        <div className="shrink-0 flex gap-2">
                            {(() => {
                                const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
                                if (!isEventPassed) {
                                    return (
                                        <div className="flex gap-2">
                                            {isRegistered && isPaid && registeredDivisions.every(div => paidDivisions.some(pd => pd.trim().toLowerCase() === div.trim().toLowerCase())) ? (
                                                <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-xl border border-white/10">
                                                    <CheckCircle size={14} className="text-padel-green" />
                                                    <span className="text-[10px] font-black text-padel-green uppercase tracking-widest">Paid</span>
                                                </div>
                                            ) : (
                                                <>
                                                    {!isRegistered && (
                                                        <a
                                                            href={event.rankedin_url || `https://www.rankedin.com/`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="bg-padel-green !text-[#0F172A] font-black py-3 px-6 rounded-xl hover:bg-slate-900 hover:!text-white transition-all duration-300 shadow-md whitespace-nowrap text-sm tracking-wide uppercase"
                                                        >
                                                            Register
                                                        </a>
                                                    )}
                                                    {isRegistered && !isPaid && (
                                                        <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-xl border border-white/10">
                                                            <CheckCircle size={14} className="text-padel-green" />
                                                            <span className="text-[10px] font-black text-padel-green uppercase tracking-widest">Registered</span>
                                                        </div>
                                                    )}
                                                    {(!isPaid || (isRegistered && !registeredDivisions.every(div => paidDivisions.some(pd => pd.trim().toLowerCase() === div.trim().toLowerCase())))) && (event.entry_fee > 0 || Object.keys(event.category_fees || {}).length > 0) && (
                                                        <button
                                                            onClick={() => { setRegStep(1); setIsModalOpen(true); }}
                                                            className="bg-slate-900 text-padel-green font-black py-3 px-5 rounded-xl hover:bg-padel-green hover:text-slate-900 transition-all duration-300 shadow-md whitespace-nowrap text-sm tracking-wide uppercase"
                                                        >
                                                            Pay Entry Fee
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                } else if ((hasResults || hasDraw) && (rId || event.slug)) {
                                    return (
                                        <Link
                                            to={`/draws/${event.slug || rId}`}
                                            className="bg-padel-green !text-[#0F172A] font-black py-3 px-6 rounded-xl hover:bg-slate-900 hover:!text-white transition-all duration-300 shadow-md whitespace-nowrap text-sm tracking-wide uppercase"
                                        >
                                            Draws & Results
                                        </Link>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                    </div>

                    {/* Content Component: Tabs Area */}
                    <div className="mt-8 md:mt-12 max-w-6xl mx-auto space-y-8">

                        {/* Tab Navigation */}
                        <div className="flex overflow-x-auto hide-scrollbar space-x-2 bg-white/50 backdrop-blur-md p-2 rounded-2xl md:rounded-full border border-gray-200/50 shadow-sm mx-auto max-w-fit">
                            {(() => {
                                const tabs = ['overview', 'players', 'divisions', 'media'];
                                // Hide 'divisions' if upcoming, hide 'players' if past
                                const filteredTabs = tabs.filter(tab => {
                                    if (tab === 'divisions') {
                                        const isUpcoming = !isEventPassed;
                                        const noData = !hasDraw && !hasResults;
                                        // Hide Champions if it is upcoming AND we want to show Player List instead
                                        return !isUpcoming || !noData;
                                    }
                                    if (tab === 'players') {
                                        return !isEventPassed && (event.rankedin_id || extractRankedinId(event.rankedin_url));
                                    }
                                    return true;
                                });

                                return filteredTabs.map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`relative px-6 py-3 rounded-full font-bold text-sm tracking-wide uppercase transition-all duration-300 whitespace-nowrap ${activeTab === tab ? 'text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-gray-100/50'
                                            }`}
                                    >
                                        {activeTab === tab && (
                                            <motion.div
                                                layoutId="activeTabPill"
                                                className="absolute inset-0 bg-slate-900 rounded-full shadow-md"
                                                initial={false}
                                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                            />
                                        )}
                                        <span className="relative z-10">
                                            {tab === 'divisions' ? 'Results' :
                                                tab === 'players' ? 'Player List' :
                                                    tab === 'media' ? 'Media' : 'Overview'}
                                        </span>
                                    </button>
                                ));
                            })()}
                        </div>


                        {/* Tab Content Container */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="min-h-[400px]"
                            >
                                {activeTab === 'overview' && (
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                        {/* Left Column: Event Details & Map */}
                                        <div className="lg:col-span-2 space-y-8">
                                            <ModuleAccordion title="Event Details" icon={FileText} defaultOpen={false}>
                                                <div
                                                    className="text-slate-600 leading-relaxed md:text-lg event-rich-description"
                                                    dangerouslySetInnerHTML={{
                                                        __html: event.description || "Join us for this exciting event! More details will be announced soon. Expect high-level competition and a great atmosphere."
                                                    }}
                                                />
                                            </ModuleAccordion>

                                            {(event.address || event.venue) && (
                                                <ModuleAccordion title="Location" icon={MapPin} defaultOpen={false}>
                                                    <div className="flex items-center justify-between mb-4">
                                                        <p className="text-sm text-gray-500">{event.address || event.venue} {event.city || ''}</p>
                                                        <a
                                                            href={`https://maps.google.com/?q=${encodeURIComponent(`${event.venue || ''} ${event.address || ''} ${event.city || ''}`.trim())}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-padel-green font-bold text-sm tracking-wide hover:underline flex items-center gap-1"
                                                        >
                                                            Get Directions <ArrowLeft className="w-4 h-4 rotate-135" />
                                                        </a>
                                                    </div>
                                                    <div className="h-[300px] w-full relative rounded-2xl overflow-hidden border border-gray-100">
                                                        <iframe
                                                            width="100%"
                                                            height="100%"
                                                            frameBorder="0"
                                                            scrolling="no"
                                                            marginHeight="0"
                                                            marginWidth="0"
                                                            src={`https://maps.google.com/maps?q=${encodeURIComponent(`${event.venue || ''} ${event.address || ''} ${event.city || ''}`.trim())}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                                            className="w-full h-full grayscale hover:grayscale-0 transition-all duration-700 ease-in-out"
                                                            title="Event Location"
                                                        ></iframe>
                                                    </div>
                                                </ModuleAccordion>
                                            )}
                                        </div>

                                        {/* Right Column: Sidebar Widgets */}
                                        <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-32">
                                            {/* Organizer Widget */}
                                            <ModuleAccordion title="Event Organiser" icon={User} defaultOpen={false}>
                                                <div className="flex items-center gap-4 mb-6 pt-2">
                                                    <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xl flex-shrink-0">
                                                        {event.organizer_name ? event.organizer_name.charAt(0) : '4M'}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-lg text-slate-900">{event.organizer_name || '4M Padel'}</h4>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    {event.organizer_phone && (
                                                        <div>
                                                            <p className="text-xs text-gray-400 font-bold uppercase mb-1">Phone Number</p>
                                                            <a href={`tel:${event.organizer_phone}`} className="text-padel-green font-medium hover:underline flex items-center gap-2">
                                                                <Phone className="w-4 h-4" /> {event.organizer_phone}
                                                            </a>
                                                        </div>
                                                    )}
                                                    {event.organizer_email && (
                                                        <div>
                                                            <p className="text-xs text-gray-400 font-bold uppercase mb-1">Email</p>
                                                            <a href={`mailto:${event.organizer_email}`} className="text-padel-green font-medium hover:underline flex items-center gap-2">
                                                                <Mail className="w-4 h-4" /> {event.organizer_email}
                                                            </a>
                                                        </div>
                                                    )}
                                                    {event.organizer_website && (
                                                        <div>
                                                            <p className="text-xs text-gray-400 font-bold uppercase mb-1">Website</p>
                                                            <a href={`https://${event.organizer_website}`} target="_blank" rel="noopener noreferrer" className="text-padel-green font-medium hover:underline flex items-center gap-2 break-all">
                                                                <Globe className="w-4 h-4 flex-shrink-0" /> {event.organizer_website}
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            </ModuleAccordion>

                                            {/* Weather Widget */}
                                            {weather && (
                                                <ModuleAccordion title="Event Forecast" icon={Cloud} defaultOpen={false}>
                                                    <div className="flex items-center justify-between pt-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${weather.iconType === 'sun' ? 'bg-orange-100 text-orange-500' :
                                                                weather.iconType === 'cloud' ? 'bg-gray-100 text-gray-500' :
                                                                    weather.iconType === 'rain' ? 'bg-blue-100 text-blue-500' :
                                                                        weather.iconType === 'thunder' ? 'bg-purple-100 text-purple-600' :
                                                                            'bg-blue-50 text-blue-400'
                                                                }`}>
                                                                {weather.iconType === 'sun' && <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sun"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>}
                                                                {weather.iconType === 'cloud' && <Cloud className="w-6 h-6" />}
                                                                {weather.iconType === 'rain' && <CloudRain className="w-6 h-6" />}
                                                                {weather.iconType === 'thunder' && <CloudLightning className="w-6 h-6" />}
                                                                {weather.iconType === 'snow' && <CloudSnow className="w-6 h-6" />}
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-slate-900">{weather.condition}</p>
                                                                <p className="text-xs text-gray-500">{Math.round(weather.temp)}°C | Precip: {weather.precip}%</p>
                                                            </div></div></div></ModuleAccordion>
                                            )}

                                            {/* Sponsors Widget */}
                                            <ModuleAccordion title="Event Sponsors" icon={ImageIcon} defaultOpen={false}>
                                                <div className="grid grid-cols-2 gap-3 pt-2">
                                                    {event.sponsor_logos && event.sponsor_logos.length > 0 ? (
                                                        event.sponsor_logos.map((logo, i) => (
                                                            <div key={i} className="aspect-[3/2] bg-gray-50 rounded-lg flex items-center justify-center border border-gray-100 hover:scale-105 transition-all duration-300 p-2">
                                                                <img src={logo} alt={`Sponsor ${i + 1}`} className="max-w-full max-h-full object-contain" />
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="col-span-2 py-8 text-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                                            <p className="text-gray-400 text-xs italic font-medium">No sponsors listed for this event</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </ModuleAccordion>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'players' && (
                                    <div className="space-y-8">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/50 backdrop-blur-md p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                                            <div>
                                                <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Registered Players</h2>
                                                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Tournament Field by Division</p>
                                            </div>
                                            <div className="flex items-center gap-3 bg-padel-green/10 px-4 py-2 rounded-xl border border-padel-green/30">
                                                <User className="w-5 h-5 text-padel-green" />
                                                <span className="font-black text-slate-900 text-sm uppercase tracking-wider">{event.registered_players || 0} Total</span>
                                            </div>
                                        </div>

                                        {fetchingParticipants && playerDivisions.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-20 bg-white/50 rounded-3xl border border-dashed border-gray-200">
                                                <Loader className="w-10 h-10 animate-spin text-padel-green mb-4" />
                                                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Syncing athletes...</p>
                                            </div>
                                        ) : playerDivisions.length > 0 ? (
                                            <div className="space-y-4">
                                                {playerDivisions.map((cls, idx) => {
                                                    const clsParticipants = participants[cls.Id] || [];
                                                    return (
                                                        <ModuleAccordion
                                                            key={cls.Id}
                                                            title={`${cls.Name} (${clsParticipants.length} Teams)`}
                                                            icon={User}
                                                            defaultOpen={idx === 0}
                                                        >
                                                            <div className="pt-4">
                                                                {clsParticipants.length > 0 ? (
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                                                                        {clsParticipants.map((item, pIdx) => {
                                                                            const p = item.Participant || {};
                                                                            const isTeam = p.Players && p.Players.length > 0 && !p.FirstPlayer;
                                                                            const fPlayer = p.FirstPlayer || {};
                                                                            const sPlayer = p.SecondPlayer || {};
                                                                            const seed = p.Seed;
                                                                            const rank = item.Ranking;

                                                                            const getProfileImage = (playerObj) => {
                                                                                if (!playerObj) return null;
                                                                                const rId = playerObj.RankedinId || playerObj.Id?.toString();
                                                                                const pName = (playerObj.Name || '').toLowerCase();
                                                                                if (rId && fourMPlayers[rId]) return fourMPlayers[rId];
                                                                                if (pName && fourMPlayers[pName]) return fourMPlayers[pName];
                                                                                return playerObj.Image;
                                                                            };

                                                                            if (isTeam) {
                                                                                return (
                                                                                    <motion.div
                                                                                        key={pIdx}
                                                                                        initial={{ opacity: 0, y: 10 }}
                                                                                        animate={{ opacity: 1, y: 0 }}
                                                                                        transition={{ delay: pIdx * 0.05 }}
                                                                                        className="bg-gray-50/50 rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all group col-span-1 md:col-span-2 lg:col-span-3"
                                                                                    >
                                                                                        <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-4">
                                                                                            <div className="flex items-center gap-3">
                                                                                                {p.Image && (
                                                                                                    <div className="w-10 h-10 rounded-full overflow-hidden bg-white border border-gray-100 shrink-0 shadow-sm">
                                                                                                        <img src={p.Image} alt={p.Name} className="w-full h-full object-cover" />
                                                                                                    </div>
                                                                                                )}
                                                                                                <div>
                                                                                                    <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">{p.Name}</h3>
                                                                                                    {rank && <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mt-0.5">Rank: {rank}</span>}
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="flex flex-col items-end">
                                                                                                <span className="bg-padel-green/10 border border-padel-green/20 text-padel-green text-[10px] font-black px-3 py-1 rounded-full uppercase">{p.Players.length} Players</span>
                                                                                                {seed && <span className="bg-slate-900 text-padel-green text-[9px] font-black px-2 py-0.5 rounded-full uppercase mt-2">Seed {seed}</span>}
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                                                            {p.Players.map((player, idx) => (
                                                                                                <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:border-padel-green/30 transition-colors">
                                                                                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-50 shrink-0">
                                                                                                        <img src={getProfileImage(player) || "https://cdn.rankedin.com/images/rin_logo_sm.png"} alt={player.Name} className="w-full h-full object-cover" />
                                                                                                    </div>
                                                                                                    <div className="flex flex-col min-w-0">
                                                                                                        <span className="font-bold text-slate-700 text-sm truncate">{player.Name}</span>
                                                                                                        {player.Rating && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Rating: {player.Rating}</span>}
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </motion.div>
                                                                                );
                                                                            }

                                                                            return (
                                                                                <motion.div
                                                                                    key={pIdx}
                                                                                    initial={{ opacity: 0, y: 10 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    transition={{ delay: pIdx * 0.05 }}
                                                                                    className="bg-gray-50/50 rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all group"
                                                                                >
                                                                                    <div className="flex items-center justify-between mb-4">
                                                                                        <div className="flex flex-col">
                                                                                            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest leading-none mb-1">Team #{pIdx + 1}</span>
                                                                                            {rank && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Rank: {rank}</span>}
                                                                                        </div>
                                                                                        {seed && (
                                                                                            <span className="bg-slate-900 text-padel-green text-[9px] font-black px-2 py-0.5 rounded-full uppercase">Seed {seed}</span>
                                                                                        )}
                                                                                    </div>

                                                                                    <div className="space-y-3">
                                                                                        <div className="flex items-center gap-3">
                                                                                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 group-hover:bg-padel-green/10 group-hover:text-padel-green transition-colors overflow-hidden shrink-0">
                                                                                                {getProfileImage(fPlayer) ? (
                                                                                                    <img src={getProfileImage(fPlayer)} alt={fPlayer.Name} className="w-full h-full object-cover" />
                                                                                                ) : (
                                                                                                    <User className="w-4 h-4" />
                                                                                                )}
                                                                                            </div>
                                                                                            <span className="font-bold text-slate-700">{fPlayer.Name}</span>
                                                                                        </div>
                                                                                        {sPlayer.Name && (
                                                                                            <div className="flex items-center gap-3">
                                                                                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 group-hover:bg-padel-green/10 group-hover:text-padel-green transition-colors overflow-hidden shrink-0">
                                                                                                    {getProfileImage(sPlayer) ? (
                                                                                                        <img src={getProfileImage(sPlayer)} alt={sPlayer.Name} className="w-full h-full object-cover" />
                                                                                                    ) : (
                                                                                                        <User className="w-4 h-4" />
                                                                                                    )}
                                                                                                </div>
                                                                                                <span className="font-bold text-slate-700">{sPlayer.Name}</span>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </motion.div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ) : fetchingParticipants ? (
                                                                    <div className="py-12 text-center">
                                                                        <Loader className="w-6 h-6 animate-spin text-padel-green mx-auto mb-2" />
                                                                        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Updating field...</p>
                                                                    </div>
                                                                ) : (
                                                                    <div className="py-12 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                                                        <p className="text-gray-400 text-sm italic font-medium">No players registered in this division yet</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </ModuleAccordion>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-12 text-center">
                                                <User className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                                                <h3 className="text-2xl font-bold text-slate-800 mb-2">No Players Registered Yet</h3>
                                                <p className="text-gray-500">The player list for this tournament will be available soon.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'divisions' && (
                                    <div className="space-y-6">
                                        <ModuleAccordion title="Champions" icon={Trophy} defaultOpen={false}>
                                            <div className="py-4 space-y-4">
                                                {fetchingRankedinData ? (
                                                    <div className="flex flex-col items-center justify-center py-12">
                                                        <Loader className="w-8 h-8 animate-spin text-padel-green mb-4" />
                                                        <p className="text-gray-400 font-bold">Syncing data...</p>
                                                    </div>
                                                ) : tournamentClasses.length > 0 ? (
                                                    <div className="grid grid-cols-1 gap-4">
                                                        {tournamentClasses.map((cls, idx) => (
                                                            <motion.div
                                                                key={idx}
                                                                initial={{ opacity: 0, x: -10 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                transition={{ delay: idx * 0.05 }}
                                                                className="bg-white/70 backdrop-blur-sm border border-slate-100 rounded-2xl p-5 flex flex-col md:flex-row items-center gap-5 group hover:shadow-xl hover:border-padel-green/30 transition-all duration-300"
                                                            >
                                                                {/* Icon Column */}
                                                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${isEventPassed && winners.some(w => w.className === cls.Name) ? 'bg-padel-green/10 text-padel-green' : 'bg-slate-100 text-slate-400'}`}>
                                                                    <Trophy className={isEventPassed && winners.some(w => w.className === cls.Name) ? 'w-7 h-7 drop-shadow-[0_0_8px_rgba(154,233,0,0.4)]' : 'w-6 h-6'} />
                                                                </div>

                                                                {/* Content Column */}
                                                                <div className="flex-1 text-center md:text-left">
                                                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 block">
                                                                        {cls.Name}
                                                                    </span>

                                                                    {isEventPassed && winners.some(w => w.className === cls.Name) ? (
                                                                        <div className="space-y-4">
                                                                            {winners.filter(w => w.className === cls.Name).map((w, wi) => (
                                                                                <div key={wi} className={wi > 0 ? "pt-3 border-t border-slate-100" : ""}>
                                                                                    {w.drawName && !w.drawName.toLowerCase().includes('main') && (
                                                                                        <span className="text-[10px] font-black text-padel-green uppercase tracking-wider mb-1 block">
                                                                                            {w.drawName}
                                                                                        </span>
                                                                                    )}
                                                                                    <h4 className="text-xl md:text-2xl font-black text-slate-900 leading-tight">
                                                                                        {w.winners}
                                                                                    </h4>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : !isEventPassed && upcomingMatches.some(m => m.MatchClass?.Id === cls.Id) ? (
                                                                        <p className="text-sm font-bold text-slate-600 flex items-center justify-center md:justify-start gap-2">
                                                                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                                                            Tournament In Progress
                                                                        </p>
                                                                    ) : (
                                                                        <p className="text-gray-400 text-sm font-medium italic">No results available yet</p>
                                                                    )}
                                                                </div>

                                                                {/* Tag Column */}
                                                                {isEventPassed && winners.some(w => w.className === cls.Name) && (
                                                                    <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-full shadow-lg shrink-0">
                                                                        <span className="text-padel-green font-black text-[10px] uppercase tracking-widest">
                                                                            Champions
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </motion.div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-12 bg-white/50 rounded-2xl border border-dashed border-slate-200">
                                                        <p className="text-gray-400 font-bold italic">No division data available for this event.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </ModuleAccordion>

                                        <div className="pt-2">
                                            {(() => {
                                                const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
                                                if (hasDraw || hasResults) {
                                                    return (
                                                        <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 400, damping: 10 }}>
                                                            <Link
                                                                to={`/draws/${event.slug || rId}`}
                                                                className="w-full flex items-center justify-between p-6 md:p-8 bg-white rounded-3xl shadow-sm border border-gray-100 hover:bg-gray-50/80 hover:border-padel-green/30 transition-all group"
                                                            >
                                                                <div className="flex items-center gap-4">
                                                                    <GitBranch className="w-6 h-6 text-padel-green" />
                                                                    <h3 className="text-xl md:text-2xl font-bold text-slate-900">View Draws & Full Results</h3>
                                                                </div>
                                                                <ChevronDown className="w-6 h-6 text-gray-400 -rotate-90 group-hover:text-padel-green transition-colors" />
                                                            </Link>
                                                        </motion.div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>

                                    </div>
                                )}

                                {activeTab === 'media' && (
                                    <div className="space-y-12 pb-20">
                                        {/* Simplified Media Header + Link to Full Gallery */}
                                        {albumInfo ? (
                                            <div className="bg-slate-900 rounded-[3rem] shadow-2xl border border-white/5 p-8 md:p-14 overflow-hidden relative">
                                                {/* Background wording */}
                                                <div className="absolute top-0 -left-10 select-none overflow-hidden h-full flex items-center transform -rotate-12 pointer-events-none opacity-[0.03]">
                                                    <h2 className="text-[12vw] font-black text-white uppercase tracking-tighter w-[200%] leading-none whitespace-nowrap">
                                                        {albumInfo.title}
                                                    </h2>
                                                </div>

                                                <div className="relative z-10 flex flex-col items-center text-center">
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 20 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-padel-green/10 border border-padel-green/20 text-padel-green text-xs font-black uppercase tracking-[0.4em] mb-8"
                                                    >
                                                        <ImageIcon size={14} />
                                                        <span>Official Media Available</span>
                                                    </motion.div>

                                                    <motion.h2
                                                        initial={{ opacity: 0, scale: 0.9 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        className="text-4xl md:text-7xl font-black text-white tracking-tighter uppercase mb-8 drop-shadow-2xl max-w-4xl leading-[0.9]"
                                                    >
                                                        {albumInfo.title}
                                                    </motion.h2>

                                                    {albumInfo.description && (
                                                        <p className="text-gray-400 text-lg md:text-xl max-w-2xl font-medium leading-relaxed italic opacity-80 mb-10 border-l border-padel-green/30 pl-6 mx-auto">
                                                            {albumInfo.description}
                                                        </p>
                                                    )}

                                                    <div className="flex flex-col items-center gap-8">
                                                        <div className="flex items-center gap-4 text-white font-black text-xs uppercase tracking-[0.3em] bg-black/40 px-6 py-2.5 rounded-full border border-white/10">
                                                            <span className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-padel-green animate-pulse" />
                                                                {albumPhotos.length} High-Res Moments
                                                            </span>
                                                        </div>

                                                        <motion.div
                                                            initial={{ opacity: 0, y: 20 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ delay: 0.2 }}
                                                        >
                                                            <Link
                                                                to={`/gallery/${albumInfo.slug || albumInfo.id}`}
                                                                className="group relative inline-flex items-center gap-10 pl-10 pr-4 py-4 bg-padel-green text-slate-950 rounded-full font-black uppercase tracking-widest text-base hover:bg-white hover:scale-105 transition-all duration-500 shadow-[0_0_50px_rgba(150,250,50,0.3)]"
                                                            >
                                                                <span className="relative z-10 !text-slate-950">Enter Full Gallery</span>
                                                                <div className="w-14 h-14 rounded-full bg-slate-950 flex items-center justify-center text-padel-green group-hover:translate-x-2 transition-transform duration-500">
                                                                    <ArrowLeft size={24} className="rotate-180" />
                                                                </div>
                                                            </Link>
                                                        </motion.div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            !event.youtube_playlist_url && (
                                                <div className="bg-slate-900 shadow-2xl border border-white/5 rounded-3xl p-12 text-center opacity-60">
                                                    <ImageIcon className="w-16 h-16 text-slate-700 mx-auto mb-6" />
                                                    <h3 className="text-2xl font-bold text-white mb-2">No Media Available Yet</h3>
                                                    <p className="text-gray-500">Media from this event will be posted shortly after completion.</p>
                                                </div>
                                            )
                                        )}

                                        {/* YouTube Highlights Section */}
                                        {event.youtube_playlist_url && (
                                            <div className="bg-slate-900 rounded-[3rem] shadow-2xl border border-slate-800 p-8 md:p-14 overflow-hidden relative">
                                                {/* Background wording */}
                                                <div className="absolute top-0 -left-10 select-none overflow-hidden h-full flex items-center transform -rotate-12 pointer-events-none opacity-[0.03]">
                                                    <h2 className="text-[120px] font-black text-white uppercase tracking-tighter w-[200%] leading-none">
                                                        Highlights Highlights
                                                    </h2>
                                                </div>

                                                <div className="relative z-10">
                                                    <div className="flex items-center gap-4 mb-10">
                                                        <div className="w-16 h-16 rounded-2xl bg-padel-green/10 flex items-center justify-center">
                                                            <PlayCircle className="text-padel-green w-10 h-10" />
                                                        </div>
                                                        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">Event Highlights</h2>
                                                    </div>

                                                    {fetchingVideos ? (
                                                        <div className="flex flex-col items-center justify-center py-20 bg-slate-800/50 rounded-2xl border border-dashed border-slate-700">
                                                            <Loader className="w-10 h-10 animate-spin text-padel-green mb-4" />
                                                            <p className="text-gray-400 font-bold">Loading videos...</p>
                                                        </div>
                                                    ) : playlistVideos.length > 0 ? (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                            {playlistVideos.map((video) => (
                                                                <motion.div
                                                                    key={video.id}
                                                                    whileHover={{ y: -8 }}
                                                                    className="group relative cursor-pointer"
                                                                    onClick={() => setVideoModal({ isOpen: true, url: video.id, title: video.title })}
                                                                >
                                                                    <div className="aspect-video rounded-2xl overflow-hidden bg-slate-800 relative shadow-md group-hover:shadow-xl transition-all">
                                                                        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                                                        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors" />
                                                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100">
                                                                            <div className="w-14 h-14 rounded-full bg-padel-green text-black flex items-center justify-center shadow-2xl backdrop-blur-sm">
                                                                                <Play className="w-8 h-8 fill-current ml-1" />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-4">
                                                                        <h3 className="font-bold text-white line-clamp-2 group-hover:text-padel-green transition-colors leading-snug">{video.title}</h3>
                                                                    </div>
                                                                </motion.div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="aspect-video w-full rounded-2xl overflow-hidden shadow-xl bg-slate-800 border-2 border-slate-700">
                                                            {getPlaylistEmbedUrl(event.youtube_playlist_url) ? (
                                                                <iframe
                                                                    src={getPlaylistEmbedUrl(event.youtube_playlist_url)}
                                                                    title="YouTube playlist player"
                                                                    className="w-full h-full border-0"
                                                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                                    allowFullScreen
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                                                                    <PlayCircle className="w-16 h-16 mb-4 opacity-20 text-padel-green" />
                                                                    <p className="font-bold text-xl text-white mb-2">Watch the highlights</p>
                                                                    <p className="text-sm max-w-sm mx-auto">Could not load playlist grid. Please check back later.</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
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
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="fixed inset-0 z-[1100] flex items-center justify-center pointer-events-none p-6 md:p-8"
                            >
                                <div className="bg-[#0F172A] w-full max-w-xl rounded-3xl shadow-2xl pointer-events-auto flex flex-col max-h-[92vh] border border-white/10 overflow-hidden mt-8 md:mt-0">
                                    {/* Modal Header */}
                                    <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                                        <h3 className="text-white font-bold text-lg">
                                            {regStep === 1 ? 'Event Payment' : 'Payment Successful'}
                                        </h3>
                                        <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                                            <X className="w-6 h-6" />
                                        </button>
                                    </div>

                                    {/* Modal Content */}
                                    <div className="p-4 md:p-6 overflow-y-auto flex-1 custom-scrollbar">
                                        {regStep === 1 ? (
                                            <>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 ml-3">Full Name</label>
                                                        <div className="relative group">
                                                            <User className="absolute left-5 top-1/2 -translate-y-1/2 text-padel-green group-focus-within:text-white transition-colors" size={16} />
                                                            <input
                                                                type="text"
                                                                name="full_name"
                                                                value={formData.full_name}
                                                                onChange={handleInputChange}
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all font-bold placeholder:text-gray-600"
                                                                placeholder="Player Full Name"
                                                                required
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 ml-3">Email Address</label>
                                                        <div className="relative">
                                                            <Mail className={`absolute left-5 top-1/2 -translate-y-1/2 ${emailCheckStatus === 'not_found' ? 'text-red-500' : 'text-padel-green'}`} size={16} />
                                                            <input
                                                                type="email"
                                                                name="email"
                                                                value={formData.email}
                                                                onChange={handleInputChange}
                                                                className={`w-full bg-white/5 border ${emailCheckStatus === 'not_found' ? 'border-red-500/50' : 'border-white/10'} rounded-xl pl-12 pr-10 py-3 text-sm text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all font-bold placeholder:text-gray-600`}
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
                                                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 ml-3">Phone Number</label>
                                                        <div className="relative">
                                                            <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-padel-green" size={16} />
                                                            <input
                                                                type="tel"
                                                                name="phone"
                                                                value={formData.phone}
                                                                onChange={handleInputChange}
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all font-bold placeholder:text-gray-600"
                                                                placeholder="+27 00 000 0000"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between ml-3 mb-1">
                                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Select Divisions</label>
                                                            {registeredDivisions.length > 0 && (
                                                                <span className="text-[9px] font-black uppercase tracking-widest bg-padel-green/10 text-padel-green px-2 py-0.5 rounded-md border border-padel-green/20">
                                                                    {selectedDivisions.length} / {registeredDivisions.length} Selected
                                                                </span>
                                                            )}
                                                        </div>
                                                        
                                                        {isCheckingReg ? (
                                                            <div className="flex items-center gap-4 bg-slate-900/50 border border-white/5 rounded-2xl px-6 py-4 animate-pulse">
                                                                <Loader className="w-5 h-5 animate-spin text-padel-green" />
                                                                <span className="text-sm text-gray-400 font-bold uppercase tracking-widest">Syncing Rankedin Status...</span>
                                                            </div>
                                                        ) : registeredDivisions.length > 0 ? (
                                                            <div className="grid grid-cols-1 gap-2.5">
                                                                {registeredDivisions.map(divName => {
                                                                    const alreadyPaid = paidDivisions.includes(divName);
                                                                    const isSelected = selectedDivisions.includes(divName);
                                                                    
                                                                    return (
                                                                        <button
                                                                            key={divName}
                                                                            type="button"
                                                                            disabled={alreadyPaid}
                                                                            onClick={() => {
                                                                                setSelectedDivisions(prev => 
                                                                                    prev.includes(divName) 
                                                                                        ? prev.filter(d => d !== divName) 
                                                                                        : [...prev, divName]
                                                                                );
                                                                            }}
                                                                            className={`group relative flex items-center justify-between px-5 py-4 rounded-2xl border transition-all duration-300 ${
                                                                                alreadyPaid 
                                                                                    ? 'bg-padel-green/5 border-padel-green/20 opacity-60 cursor-not-allowed' 
                                                                                    : isSelected
                                                                                        ? 'bg-padel-green border-padel-green shadow-lg shadow-padel-green/20 scale-[1.02]'
                                                                                        : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.07]'
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center gap-4">
                                                                                <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all duration-300 ${
                                                                                    alreadyPaid ? 'bg-padel-green border-padel-green' :
                                                                                    isSelected ? 'bg-white border-white' : 'border-white/20 bg-black/20'
                                                                                }`}>
                                                                                    {alreadyPaid && <CheckCircle size={14} className="text-white" />}
                                                                                    {isSelected && !alreadyPaid && <CheckCircle size={14} className="text-padel-green" />}
                                                                                </div>
                                                                                <div className="text-left">
                                                                                    <span className={`text-[13px] font-black uppercase tracking-tight block ${
                                                                                        isSelected && !alreadyPaid ? 'text-black' : alreadyPaid ? 'text-padel-green' : 'text-white'
                                                                                    }`}>
                                                                                        {divName}
                                                                                    </span>
                                                                                    <span className={`text-[9px] font-bold uppercase tracking-widest ${
                                                                                        isSelected && !alreadyPaid ? 'text-black/60' : 'text-white/30'
                                                                                    }`}>
                                                                                        Tournament Entry
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex flex-col items-end gap-1">
                                                                                {alreadyPaid ? (
                                                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] bg-padel-green/20 text-padel-green px-3 py-1 rounded-full border border-padel-green/30">Already Paid</span>
                                                                                ) : (
                                                                                    <span className={`text-sm font-black ${isSelected ? 'text-black' : 'text-padel-green'}`}>
                                                                                        R{getEntryFeeForCategory(divName)}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : formData.email && (
                                                            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6 text-center">
                                                                <Trophy className="w-8 h-8 text-orange-500/40 mx-auto mb-3" />
                                                                <p className="text-xs text-orange-400 font-black uppercase tracking-[0.2em] mb-1">Entry Not Found</p>
                                                                <p className="text-[10px] text-orange-400/60 font-bold uppercase tracking-widest leading-relaxed">
                                                                    Please ensure you are registered on Rankedin <br />for this specific event.
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>

                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between bg-slate-900/80 p-5 rounded-2xl border border-white/5 shadow-2xl group">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-padel-green/10 rounded-xl flex items-center justify-center text-padel-green group-hover:bg-padel-green group-hover:text-black transition-all duration-500">
                                                                <Users size={20} />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-black text-white uppercase tracking-tight">Register with a Partner?</p>
                                                                <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Optional Entry Fee Payment</p>
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
                                                            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${hasPartner ? 'bg-padel-green' : 'bg-white/10'}`}
                                                        >
                                                            <span
                                                                aria-hidden="true"
                                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xl ring-0 transition duration-300 ease-in-out ${hasPartner ? 'translate-x-5' : 'translate-x-0'}`}
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
                                                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 ml-3">Partner Name</label>
                                                                    <div className="relative group">
                                                                        <Users className="absolute left-5 top-1/2 -translate-y-1/2 text-padel-green" size={16} />
                                                                        <input
                                                                            type="text"
                                                                            name="partner_name"
                                                                            value={formData.partner_name}
                                                                            onChange={handleInputChange}
                                                                            autoComplete="off"
                                                                            className={`w-full bg-white/5 border ${partnerLookupError ? 'border-red-500/50' : 'border-white/10'} rounded-xl pl-12 pr-20 py-3 text-sm text-white focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 outline-none transition-all font-bold placeholder:text-gray-600`}
                                                                            placeholder="Type 2+ characters to search..."
                                                                        />
                                                                        {isLookingUpPartner && (
                                                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                                                <Loader className="w-4 h-4 animate-spin text-padel-green" />
                                                                            </div>
                                                                        )}
                                                                        {partnerProfile && !isLookingUpPartner && (
                                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-padel-green text-black px-2 py-1 rounded-lg shadow-sm font-black uppercase tracking-widest text-[8px]">
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
                                                                                    className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-2xl z-[1200] overflow-hidden p-1 max-h-48 overflow-y-auto"
                                                                                >
                                                                                    {partnerSearchResults.map((player) => (
                                                                                        <button
                                                                                            key={player.id}
                                                                                            type="button"
                                                                                            onClick={() => handleSelectPartner(player)}
                                                                                            className="w-full flex items-center justify-between p-2.5 hover:bg-slate-50 rounded-lg transition-all text-left group/item"
                                                                                        >
                                                                                            <div className="flex items-center gap-2">
                                                                                                <div className="w-6 h-6 rounded-full bg-padel-green/20 flex items-center justify-center text-padel-green group-hover/item:bg-padel-green group-hover/item:text-black transition-colors">
                                                                                                    <User size={12} />
                                                                                                </div>
                                                                                                <div>
                                                                                                    <p className="text-xs font-bold text-slate-900">{player.name}</p>
                                                                                                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{player.category || 'No Category'}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                            <CheckCircle className="w-3 h-3 text-padel-green opacity-0 group-hover/item:opacity-100 transition-opacity" />
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
                                                                            className="bg-padel-green/5 border border-padel-green/10 p-4 rounded-[1.5rem] flex items-center justify-between group hover:bg-padel-green/10 transition-colors"
                                                                        >
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-padel-green shadow-sm">
                                                                                    <CreditCard className="w-5 h-5" />
                                                                                </div>
                                                                                <div>
                                                                                    <h5 className="font-black text-white text-[11px] uppercase tracking-tight">Pay for {partnerProfile.name}?</h5>
                                                                                    <p className="text-[8px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                                                                                        Multi-Division Fee Auto-Calculated
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setPayForPartner(!payForPartner)}
                                                                                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${payForPartner ? 'bg-padel-green' : 'bg-slate-200'}`}
                                                                            >
                                                                                <span
                                                                                    aria-hidden="true"
                                                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${payForPartner ? 'translate-x-5' : 'translate-x-0'}`}
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
                                                                                    <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner group">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <div className="w-8 h-8 bg-padel-green/10 rounded-lg flex items-center justify-center text-padel-green">
                                                                                                <CreditCard size={16} />
                                                                                            </div>
                                                                                            <div>
                                                                                                <p className="text-xs font-bold text-white uppercase tracking-tight">Partner License</p>
                                                                                                <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Choose License Type</p>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="flex bg-slate-800 rounded-full p-1 border border-white/5">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => setPartnerLicenseChoice('temporary')}
                                                                                                className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${partnerLicenseChoice === 'temporary' ? 'bg-padel-green text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
                                                                                            >
                                                                                                Temp <span className="opacity-70">(R{FEES.TEMPORARY_LICENSE})</span>
                                                                                            </button>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => setPartnerLicenseChoice('full')}
                                                                                                className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${partnerLicenseChoice === 'full' ? 'bg-white text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
                                                                                            >
                                                                                                Full <span className="opacity-70">(R{FEES.FULL_LICENSE})</span>
                                                                                            </button>
                                                                                        </div>
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
                                                            className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner group mt-3"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-8 h-8 bg-padel-green/10 rounded-lg flex items-center justify-center text-padel-green">
                                                                    <CreditCard size={16} />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-white uppercase tracking-tight">License Required</p>
                                                                    <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Choose License Type</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex bg-slate-800 rounded-full p-1 border border-white/5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setLicenseChoice('temporary')}
                                                                    className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${licenseChoice === 'temporary' ? 'bg-padel-green text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
                                                                >
                                                                    Temp <span className="opacity-70">(R{FEES.TEMPORARY_LICENSE})</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setLicenseChoice('full')}
                                                                    className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all flex items-center gap-1 ${licenseChoice === 'full' ? 'bg-white text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
                                                                >
                                                                    Full <span className="opacity-70">(R{FEES.FULL_LICENSE})</span>
                                                                </button>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </div>

                                                <div className="pt-3 border-t border-white/10">
                                                    <div className="bg-slate-900/50 rounded-[1.5rem] p-4 text-white overflow-hidden relative group border border-white/5 shadow-2xl">
                                                        {/* Decorative Background Glow */}
                                                        <div className="absolute top-0 right-0 w-48 h-48 bg-padel-green/5 rounded-full blur-3xl -mr-24 -mt-24 group-hover:bg-padel-green/10 transition-colors duration-1000" />

                                                        <div className="relative z-10 space-y-4">
                                                            {/* Itemized list */}
                                                            <div className="space-y-3">
                                                                <div className="space-y-2">
                                                                    {/* Registrant Section */}
                                                                    <div className="space-y-2">
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green mb-1">Your Entries</p>
                                                                        {selectedDivisions.map(div => (
                                                                            <div key={`reg-${div}`} className="flex justify-between items-start gap-4 bg-white/[0.03] p-2.5 rounded-xl border border-white/5">
                                                                                <div className="space-y-0.5">
                                                                                    <p className="text-[9px] font-bold uppercase tracking-widest text-white/90">{formData.full_name || 'You'}</p>
                                                                                    <p className="text-[8px] font-black text-padel-green uppercase tracking-wider italic">{div}</p>
                                                                                </div>
                                                                                <span className="text-[10px] font-black tracking-tight whitespace-nowrap pt-0.5">R{getEntryFeeForCategory(div)}</span>
                                                                            </div>
                                                                        ))}
                                                                        {selectedDivisions.length === 0 && (
                                                                            <div className="flex justify-between items-start gap-4 opacity-30 p-3">
                                                                                <div className="space-y-0.5">
                                                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/90">{formData.full_name || 'You'}</p>
                                                                                    <p className="text-[9px] font-medium text-white/40 uppercase tracking-wider">No Category Selected</p>
                                                                                </div>
                                                                                <span className="text-xs font-black tracking-tight whitespace-nowrap pt-0.5">R0</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {playerProfileData && !playerProfileData.paid_registration && (
                                                                        <div className="flex justify-between items-center bg-padel-green/10 p-2.5 rounded-xl border border-padel-green/20">
                                                                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-padel-green">4M Padel {licenseChoice === 'full' ? 'Full' : 'Temp'} License</span>
                                                                            <span className="text-[10px] font-black text-padel-green">R{licenseChoice === 'full' ? FEES.FULL_LICENSE : FEES.TEMPORARY_LICENSE}</span>
                                                                        </div>
                                                                    )}

                                                                    {/* Partner Section - Conditional */}
                                                                    {hasPartner && partnerProfile && (
                                                                        <div className="space-y-2 pt-1">
                                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-0.5">Partner Entries</p>
                                                                            {selectedDivisions.map(div => (
                                                                                <div key={`par-${div}`} className="flex justify-between items-start gap-4 bg-white/[0.03] p-2.5 rounded-xl border border-white/5">
                                                                                    <div className="space-y-0.5">
                                                                                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/90">{partnerProfile.name} <span className="opacity-50">(Partner)</span></p>
                                                                                        <p className="text-[8px] font-black text-blue-400 uppercase tracking-wider italic">{div}</p>
                                                                                    </div>
                                                                                    <span className="text-[10px] font-black tracking-tight whitespace-nowrap pt-0.5">R{getEntryFeeForCategory(div)}</span>
                                                                                </div>
                                                                            ))}
                                                                            {payForPartner && !partnerProfile.paid_registration && (
                                                                                <div className="flex justify-between items-center bg-blue-400/10 p-2.5 rounded-xl border border-blue-400/20 mt-1">
                                                                                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-blue-400">Partner {partnerLicenseChoice === 'full' ? 'Full' : 'Temp'} License</span>
                                                                                    <span className="text-[10px] font-black text-blue-400">R{partnerLicenseChoice === 'full' ? FEES.FULL_LICENSE : FEES.TEMPORARY_LICENSE}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                </div>
                                                            </div>

                                                             {/* Bottom Action Area */}
                                                            <div className="pt-4 border-t border-white/10 mt-1">
                                                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 w-full">
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-padel-green mb-0.5">Grand Total</p>
                                                                        <div className="space-y-1">
                                                                            <p className="text-3xl font-black tracking-tighter leading-none text-white">R {calculateTotalAmount()}</p>
                                                                            <p className="text-[7px] font-black uppercase tracking-[0.2em] text-white/20 whitespace-nowrap">SECURE PAYSTACK</p>
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleRegister}
                                                                        disabled={isSubmitting || emailCheckStatus === 'not_found' || selectedDivisions.length === 0}
                                                                        className="h-16 md:h-14 px-12 bg-padel-green text-black rounded-xl flex items-center justify-center gap-3 hover:bg-white hover:scale-[1.03] active:scale-95 transition-all duration-500 shadow-2xl shadow-padel-green/30 disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed font-black uppercase tracking-[0.15em] text-[11px] flex-1 md:flex-none group mb-2 md:mb-0"
                                                                    >
                                                                        <CreditCard className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                                                        <span>Complete Payment</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        </div>
                                                        </>
                                        ) : (
                                             <>
                                                {/* Ambient Glows */}
                                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-padel-green/10 blur-[120px] rounded-full pointer-events-none" />
                                                <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/10 blur-[80px] rounded-full pointer-events-none" />

                                                <div className="relative mb-10">
                                                    <div className="w-28 h-28 bg-padel-green/20 rounded-full flex items-center justify-center mx-auto relative z-10 animate-in zoom-in duration-500 delay-150 shadow-2xl shadow-padel-green/40">
                                                        <CheckCircle className="w-14 h-14 text-padel-green" />
                                                    </div>
                                                    <div className="absolute inset-0 bg-padel-green/30 blur-2xl rounded-full scale-110 animate-pulse" />
                                                </div>

                                                <h3 className="text-4xl font-black text-white mb-4 tracking-tight uppercase leading-none italic animate-in fade-in slide-in-from-bottom duration-700">
                                                    Registration <br />
                                                    <span className="text-padel-green">Confirmed</span>
                                                </h3>

                                                <p className="text-gray-400 text-sm mb-12 max-w-xs mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom duration-1000">
                                                    You've been successfully registered for <span className="text-white font-bold">{event.event_name}</span>.
                                                    Your payment was confirmed and your profile is updated.
                                                </p>

                                                <div className="flex flex-col gap-4 w-full max-w-xs animate-in fade-in slide-in-from-bottom duration-1000 delay-300">
                                                    <button
                                                        onClick={() => {
                                                            setIsModalOpen(false);
                                                            window.location.reload();
                                                        }}
                                                        className="w-full h-16 bg-padel-green hover:bg-white text-black font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 rounded-2xl transition-all duration-300 shadow-2xl shadow-padel-green/30 hover:scale-[1.03] active:scale-95"
                                                    >
                                                        <span>Close & Refresh</span>
                                                        <ArrowRight className="w-4 h-4" />
                                                    </button>
                                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">Data Syncing Complete</p>
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
            </main>
        </>
    );
};

export default EventDetails;