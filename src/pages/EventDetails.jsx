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
import logo4m from '../assets/logo_4m_lowercase.png';

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
                primary: 'bg-amber-500 hover:bg-amber-600 text-[#0F172A]',
                primaryText: 'text-[#0F172A]',
                accentText: 'text-amber-500',
                accentBg: 'bg-amber-500/10 border-amber-500/20',
                badgeBg: 'bg-amber-500 text-[#0F172A]',
                badgeText: 'text-[#0F172A]',
                glow: 'shadow-lg shadow-amber-500/20',
                border: 'border-amber-500',
                fill: '#F59E0B'
            };
        }
        if (status === 'Gold') {
            return {
                primary: 'bg-yellow-500 hover:bg-yellow-600 text-[#0F172A]',
                primaryText: 'text-[#0F172A]',
                accentText: 'text-yellow-500',
                accentBg: 'bg-yellow-500/10 border-yellow-500/20',
                badgeBg: 'bg-yellow-500 text-[#0F172A]',
                badgeText: 'text-[#0F172A]',
                glow: 'shadow-lg shadow-yellow-500/20',
                border: 'border-yellow-500',
                fill: '#EAB308'
            };
        }
        if (status === 'Silver') {
            return {
                primary: 'bg-gray-400 hover:bg-gray-500 text-[#0F172A]',
                primaryText: 'text-[#0F172A]',
                accentText: 'text-gray-400',
                accentBg: 'bg-gray-400/10 border-gray-400/20',
                badgeBg: 'bg-gray-400 text-[#0F172A]',
                badgeText: 'text-[#0F172A]',
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
            primary: 'bg-[#CCFF00] hover:bg-[#CCFF00]/80 text-[#0F172A]',
            primaryText: 'text-[#0F172A]',
            accentText: 'text-[#CCFF00]',
            accentBg: 'bg-[#CCFF00]/10 border-[#CCFF00]/20',
            badgeBg: 'bg-[#CCFF00] text-[#0F172A]',
            badgeText: 'text-[#0F172A]',
            glow: 'shadow-lg shadow-[#CCFF00]/20',
            border: 'border-[#CCFF00]',
            fill: '#CCFF00'
        };
    };

    const theme = getTierTheme();


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
                const { data } = await supabase
                    .from('players')
                    .select('id, name, email, paid_registration, license_type')
                    .ilike('email', formData.email.trim())
                    .maybeSingle();

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
                        const query = supabase.from('players').select('name, image_url, rankedin_id');

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
            division: selectedDivisions.length > 0 ? selectedDivisions.join(', ') : formData.division,
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
                    .select('id, name, email, paid_registration, license_type, category, temporary_licenses(event_id)')
                    .ilike('name', `%${name.trim()}%`)
                    .limit(8);

                if (data && data.length > 0) {
                    const enrichedData = data.map(player => {
                        if (player.license_type === 'temporary') {
                            const hasTempForEvent = player.temporary_licenses?.some(lic => lic.event_id === event?.id);
                            return {
                                ...player,
                                paid_registration: hasTempForEvent ? player.paid_registration : false
                            };
                        }
                        return player;
                    });
                    setPartnerSearchResults(enrichedData);
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

    const registrationBlock = (isRegistered || isPaid) && (
        <div className="bg-[#0F172A] rounded-2xl shadow-lg overflow-hidden p-5 border border-white/5 space-y-5">
            {isRegistered && (
                <div className="flex flex-col items-center text-center pb-4 border-b border-white/10">
                    <div className="w-12 h-12 rounded-full bg-[#A3E635]/10 border border-[#A3E635]/25 flex items-center justify-center mb-2.5 relative">
                        <div className="absolute inset-0 rounded-full bg-[#A3E635]/10 filter blur-md animate-pulse" />
                        <CheckCircle className="w-6 h-6 text-[#A3E635] relative z-10" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#A3E635] mb-1">Registered on RankedIn</p>
                    <p className="text-white text-xs font-semibold leading-relaxed max-w-[240px]">You're on the player list! Good luck on the court.</p>
                </div>
            )}
            <div>
                <p className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: theme.fill }}>Your Registration</p>
                <div className="space-y-1">
                    {registeredDivisions.length > 0 ? (
                        registeredDivisions.map((div, i) => (
                            <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                <span className="text-xs font-bold text-white">{div}</span>
                                {paidDivisions.some(pd => pd.trim().toLowerCase() === div.trim().toLowerCase()) ? (
                                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: theme.fill + '20', borderColor: theme.fill + '30', color: theme.fill }}>Paid</span>
                                ) : (
                                    <button
                                        onClick={() => { setRegStep(1); setIsModalOpen(true); }}
                                        className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full font-bold ${theme.primary}`}
                                        style={{ color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0f172a' }}
                                    >
                                        Pay Now
                                    </button>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="flex items-center justify-between py-2">
                            <span className="text-xs font-bold text-white">Main Event Entry</span>
                            {isPaid ? (
                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: theme.fill + '20', borderColor: theme.fill + '30', color: theme.fill }}>Paid</span>
                            ) : (
                                <button
                                    onClick={() => { setRegStep(1); setIsModalOpen(true); }}
                                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full font-bold ${theme.primary}`}
                                    style={{ color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0f172a' }}
                                >
                                    Pay Now
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const readyToCompeteBlock = !isEventPassed && !isPaid && (
        <div className="bg-[#0F172A] rounded-2xl p-5 shadow-lg border border-white/5 animate-fade-in">
            <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: theme.fill }}>Ready to compete?</p>
            <p className="text-xs text-gray-400 mb-4">Secure your spot at {event.event_name}.</p>
            <div className="space-y-2">
                {!isRegistered && (
                    <a
                        href={event.rankedin_url || 'https://www.rankedin.com/'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full block text-center text-[10px] font-black uppercase tracking-widest px-4 py-3 bg-white text-[#0F172A] rounded-xl hover:bg-gray-100 transition-all font-bold"
                        style={{ color: '#0F172A' }}
                    >
                        Register Now
                    </a>
                )}
                {(event.entry_fee > 0 || Object.keys(event.category_fees || {}).length > 0) && (
                    <button
                        onClick={() => { setRegStep(1); setIsModalOpen(true); }}
                        className={`w-full text-center text-[10px] font-black uppercase tracking-widest px-4 py-3 rounded-xl transition-all ${theme.primary} ${theme.glow}`}
                        style={{ color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0f172a' }}
                    >
                        Pay Entry Fee
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
                <meta property="og:image" content={event.custom_image_url || event.image_url || tournamentHero} />
                <meta property="og:type" content="article" />
            </Helmet>

            {/* ===== MAIN PAGE ===== */}
            <div className="min-h-screen bg-gray-50 font-sans">

                {/* ── HERO ── */}
                <div className="relative w-full h-[65vw] max-h-[520px] min-h-[320px] overflow-hidden bg-[#0F172A] flex items-center justify-center">
                    {/* Blurred background flyer */}
                    <img
                        src={event.custom_image_url || event.image_url || tournamentHero}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-105 saturate-125 select-none pointer-events-none"
                    />

                    {/* Gradient overlay for blending and text readability */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-[#0F172A]/40 to-[#0F172A] z-0" />

                    {/* Centered actual un-cropped flyer image */}
                    <div className="absolute inset-0 flex items-center justify-center z-10 p-4 md:p-6 pb-24 md:pb-28">
                        <img
                            src={event.custom_image_url || event.image_url || tournamentHero}
                            alt={event.event_name}
                            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/10 animate-fade-in"
                        />
                    </div>

                    {/* Floating nav bar */}
                    <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-safe pt-24 md:pt-28">
                        <Link
                            to="/calendar"
                            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/40 transition-all shadow-lg"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>

                        {/* Add to Calendar Button */}
                        <div className="relative">
                            <button
                                onClick={() => setIsCalendarMenuOpen(!isCalendarMenuOpen)}
                                className="h-9 px-4 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center gap-2 text-white hover:bg-white/40 transition-all shadow-lg text-[10px] font-black uppercase tracking-widest"
                                title="Add to Calendar / Share"
                            >
                                <CalendarIcon className="w-3.5 h-3.5 text-white" />
                                <span>Add to Calendar</span>
                            </button>
                            <AnimatePresence>
                                {isCalendarMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                        className="absolute top-11 right-0 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-scale-up"
                                    >
                                        <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                            <p className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md inline-block" style={{ backgroundColor: theme.fill + '20', color: theme.fill }}>Add to Calendar</p>
                                        </div>
                                        {[
                                            { label: 'Google Calendar', color: '#4285F4', fn: handleGoogleCalendar },
                                            { label: 'Apple Calendar', color: '#999', fn: handleAppleCalendar },
                                            { label: 'Outlook / Other', color: '#0078D4', fn: handleOutlookCalendar },
                                        ].map(({ label, color, fn }) => (
                                            <button
                                                key={label}
                                                onClick={() => { fn(); setIsCalendarMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-800 hover:bg-gray-50 transition-colors text-left"
                                            >
                                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                                                {label}
                                            </button>
                                        ))}
                                        <div className="border-t border-gray-100 p-2 bg-gray-50/20">
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(window.location.href);
                                                    toast.success('Link copied!');
                                                    setIsCalendarMenuOpen(false);
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-800 hover:bg-gray-50 transition-colors rounded-xl text-left"
                                            >
                                                <Share2 className="w-4 h-4 text-gray-400" /> Copy Link
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Live badge */}
                    {isLive && (
                        <div className="absolute top-20 left-4 z-20">
                            <span className="inline-flex items-center gap-1.5 bg-red-500 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live Now
                            </span>
                        </div>
                    )}

                    {/* Hero text overlay */}
                    <div className="absolute bottom-0 left-0 right-0 z-20 pb-8 md:pb-10 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/75 to-transparent pt-12">
                        <div className="max-w-5xl mx-auto px-5 w-full flex flex-col md:items-center md:text-center">
                            {event.sapa_status && event.sapa_status !== 'None' && (
                                <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3 shadow-md w-fit ${theme.badgeBg}`} style={{ color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0f172a' }}>
                                    {event.sapa_status}
                                </span>
                            )}
                            <h1 className="text-2xl md:text-4xl font-black text-white leading-tight uppercase tracking-tight mb-2 drop-shadow-lg w-full">
                                {event.event_name}
                            </h1>
                            <div className="flex flex-wrap gap-3 items-center md:justify-center">
                                <span className="flex items-center gap-1.5 text-white/80 text-xs font-bold">
                                    <CalendarIcon className="w-3.5 h-3.5" style={{ color: theme.fill }} />
                                    {event.event_dates || (event.start_date ? new Date(event.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBC')}
                                </span>
                                {event.city && (
                                    <span className="flex items-center gap-1.5 text-white/80 text-xs font-bold">
                                        <MapPin className="w-3.5 h-3.5" style={{ color: theme.fill }} />
                                        {event.venue ? `${event.venue}, ` : ''}{event.city}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── REGISTRATION / ACTION BAR ── */}
                {/* Sits right below the hero, navy strip */}
                <div className="bg-[#0F172A] px-5 py-4 border-b border-white/5">
                    <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                        {/* Player count pill */}
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ backgroundColor: theme.fill + '15', borderColor: theme.fill + '30' }}>
                                <Users className="w-4 h-4" style={{ color: theme.fill }} />
                            </div>
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Registered</p>
                                <p className="text-base font-black text-white leading-none">{event.registered_players || 0} <span className="text-xs text-gray-500 font-bold">players</span></p>
                            </div>
                            {event.entry_fee > 0 && (
                                <>
                                    <div className="w-px h-8 bg-white/10 mx-2" />
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Entry Fee</p>
                                        <p className="text-base font-black leading-none" style={{ color: theme.fill }}>R{event.entry_fee}</p>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Primary CTAs */}
                        <div className="flex items-center gap-2.5 w-full sm:w-auto">
                            {(() => {
                                const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
                                if (!isEventPassed) {
                                    if (isRegistered && isPaid && registeredDivisions.every(div => paidDivisions.some(pd => pd.trim().toLowerCase() === div.trim().toLowerCase()))) {
                                        return (
                                            <div className="flex items-center gap-2 px-5 py-3 rounded-xl w-full sm:w-auto justify-center border" style={{ backgroundColor: theme.fill + '15', borderColor: theme.fill + '30' }}>
                                                <CheckCircle className="w-4 h-4" style={{ color: theme.fill }} />
                                                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: theme.fill }}>Paid & Registered</span>
                                            </div>
                                        );
                                    }
                                    return (
                                        <>
                                            {!isRegistered && (
                                                <a
                                                    href={event.rankedin_url || 'https://www.rankedin.com/'}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1 sm:flex-none text-center text-[10px] font-black uppercase tracking-widest px-6 py-3 bg-white text-[#0F172A] rounded-xl hover:bg-gray-100 transition-all font-bold"
                                                    style={{ color: '#0F172A' }}
                                                >
                                                    Register Now
                                                </a>
                                            )}
                                            {(event.entry_fee > 0 || Object.keys(event.category_fees || {}).length > 0) && (!isPaid || (isRegistered && !registeredDivisions.every(div => paidDivisions.some(pd => pd.trim().toLowerCase() === div.trim().toLowerCase())))) && (
                                                <button
                                                    onClick={() => { setRegStep(1); setIsModalOpen(true); }}
                                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl transition-all ${theme.primary} ${theme.glow}`}
                                                    style={{ color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0f172a' }}
                                                >
                                                    <CreditCard className="w-4 h-4" />
                                                    Pay Entry Fee
                                                </button>
                                            )}
                                        </>
                                    );
                                } else if ((hasResults || hasDraw) && (rId || event.slug)) {
                                    return (
                                        <Link
                                            to={`/draws/${event.slug || rId}`}
                                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl transition-all ${theme.primary} ${theme.glow}`}
                                            style={{ color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0f172a' }}
                                        >
                                            <GitBranch className="w-4 h-4" />
                                            View Draws & Results
                                        </Link>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                    </div>
                </div>

                {/* ── EVENT DETAILS QUICK SPECS (shown prominently at top of page) ── */}
                <div className="bg-white border-b border-gray-100 py-4 shadow-sm relative z-30">
                    <div className="max-w-5xl mx-auto px-5">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[
                                { label: 'Date', value: event.event_dates || (event.start_date ? new Date(event.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBC'), icon: CalendarIcon, color: theme.fill },
                                { label: 'Venue', value: event.venue || 'TBC', icon: MapPin, color: theme.fill },
                                { label: 'City', value: event.city || 'TBC', icon: Globe, color: theme.fill },
                                { label: 'Entry Fee', value: event.entry_fee > 0 ? `R${event.entry_fee}` : 'Free', icon: CreditCard, color: theme.fill },
                                { label: 'Organiser', value: event.organizer_name || '4M Padel', icon: User, color: theme.fill },
                                { label: 'Status', value: isLive ? 'Live Now' : isEventPassed ? 'Completed' : 'Upcoming', icon: AlertCircle, color: isLive ? '#EF4444' : isEventPassed ? '#94A3B8' : theme.fill },
                            ].map(({ label, value, icon: Icon, color }) => (
                                <div key={label} className="bg-gray-50/50 rounded-xl p-3 border border-gray-100/60 flex flex-col justify-center min-h-[58px]">
                                    <div className="flex items-center gap-1.5 mb-1.5 text-gray-400">
                                        <Icon className="w-3.5 h-3.5" style={{ color }} />
                                        <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
                                    </div>
                                    <p className="text-xs font-bold text-[#0F172A] leading-none truncate" title={value}>{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── TAB BAR ── */}
                <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
                    <div className="max-w-5xl mx-auto px-4 flex gap-0 overflow-x-auto no-scrollbar">
                        {[
                            { id: 'overview', label: 'Info', icon: FileText },
                            { id: 'players', label: 'Players', icon: Users },
                            { id: 'results', label: 'Results', icon: Trophy },
                            { id: 'media', label: 'Media', icon: ImageIcon },
                        ].map(({ id, label, icon: Icon }) => {
                            const active = activeTab === id;
                            return (
                                <button
                                    key={id}
                                    onClick={() => setActiveTab(id)}
                                    className={`flex items-center gap-2 px-5 py-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${active
                                        ? 'text-[#0F172A]'
                                        : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                    style={{ borderBottomColor: active ? theme.fill : 'transparent' }}
                                >
                                    <Icon className={`w-4 h-4 ${active ? 'text-[#0F172A]' : ''}`} />
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
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                                    {/* MOBILE ONLY: Registration & Compete Blocks at the top */}
                                    {(registrationBlock || readyToCompeteBlock) && (
                                        <div className="lg:hidden space-y-5">
                                            {registrationBlock}
                                            {readyToCompeteBlock}
                                        </div>
                                    )}

                                    {/* LEFT: Event Info */}
                                    <div className="lg:col-span-2 space-y-5">

                                        {/* Event Description */}
                                        {event.description && (
                                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200">
                                                <div
                                                    onClick={() => toggleSection('about')}
                                                    className="flex items-center justify-between px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.fill + '20' }}>
                                                            <FileText className="w-4 h-4 text-[#0F172A]" />
                                                        </div>
                                                        <h2 className="font-black text-[#0F172A] uppercase tracking-tight text-sm">About This Event</h2>
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
                                                                    className="text-slate-600 leading-relaxed text-sm prose max-w-none"
                                                                    dangerouslySetInnerHTML={{ __html: event.description }}
                                                                />
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
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
                                                            <MapPin className="w-4 h-4 text-[#0F172A]" />
                                                        </div>
                                                        <h2 className="font-black text-[#0F172A] uppercase tracking-tight text-sm">Location</h2>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <a
                                                            href={`https://maps.google.com/?q=${encodeURIComponent(`${event.venue || ''} ${event.address || ''} ${event.city || ''}`.trim())}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors hidden sm:inline-block ${theme.primary}`}
                                                            style={{ color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0f172a' }}
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
                                                            <div className="px-6 py-3 bg-gray-50/30 flex justify-between items-center border-b border-gray-100">
                                                                <p className="text-sm font-bold text-slate-700">{[event.venue, event.address, event.city].filter(Boolean).join(' · ')}</p>
                                                                <a
                                                                    href={`https://maps.google.com/?q=${encodeURIComponent(`${event.venue || ''} ${event.address || ''} ${event.city || ''}`.trim())}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors sm:hidden ${theme.primary}`}
                                                                    style={{ color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0f172a' }}
                                                                >
                                                                    Directions
                                                                </a>
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

                                        {/* Sponsors */}
                                        {event.sponsor_logos && event.sponsor_logos.length > 0 && (
                                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200">
                                                <div
                                                    onClick={() => toggleSection('sponsors')}
                                                    className="flex items-center justify-between px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.fill + '20' }}>
                                                            <ImageIcon className="w-4 h-4 text-[#0F172A]" />
                                                        </div>
                                                        <h2 className="font-black text-[#0F172A] uppercase tracking-tight text-sm">Sponsors</h2>
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
                                                                {event.sponsor_logos.map((logo, i) => (
                                                                    <div key={i} className="aspect-[3/2] bg-gray-50 rounded-xl flex items-center justify-center p-3 border border-gray-100 hover:scale-[1.03] transition-transform">
                                                                        <img src={logo} alt={`Sponsor ${i + 1}`} className="max-w-full max-h-full object-contain" />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        )}
                                    </div>

                                    {/* RIGHT SIDEBAR */}
                                    <div className="space-y-5">

                                        {/* Registration Status Card (for logged-in users, hidden on mobile) */}
                                        {registrationBlock && (
                                            <div className="hidden lg:block">
                                                {registrationBlock}
                                            </div>
                                        )}

                                        {/* Quick Register / Pay button (sidebar, hidden on mobile) */}
                                        {readyToCompeteBlock && (
                                            <div className="hidden lg:block">
                                                {readyToCompeteBlock}
                                            </div>
                                        )}

                                        {/* Weather Card */}
                                        {weather && (
                                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200">
                                                <div
                                                    onClick={() => toggleSection('weather')}
                                                    className="flex items-center justify-between px-5 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.fill + '20' }}>
                                                            <Cloud className="w-4 h-4 text-[#0F172A]" />
                                                        </div>
                                                        <h2 className="font-black text-[#0F172A] uppercase tracking-tight text-sm">Weather Forecast</h2>
                                                    </div>
                                                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${collapsedSections.weather ? '-rotate-90' : ''}`} slopes="" />
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
                                                            <div className="px-5 py-4 flex items-center gap-4">
                                                                <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: theme.fill + '15' }}>
                                                                    <Cloud className="w-7 h-7 text-[#0F172A]" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-2xl font-black text-[#0F172A]">{Math.round(weather.temp)}°C</p>
                                                                    <p className="text-xs font-bold text-gray-500 capitalize">{weather.condition}</p>
                                                                    {weather.humidity && <p className="text-[10px] text-gray-400 font-bold mt-0.5">Humidity: {weather.humidity}%</p>}
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        )}

                                        {/* Organiser Card */}
                                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200">
                                            <div
                                                onClick={() => toggleSection('organiser')}
                                                className="flex items-center justify-between px-5 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.fill + '20' }}>
                                                        <User className="w-4 h-4 text-[#0F172A]" />
                                                    </div>
                                                    <h2 className="font-black text-[#0F172A] uppercase tracking-tight text-sm">Organiser</h2>
                                                </div>
                                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${collapsedSections.organiser ? '-rotate-90' : ''}`} />
                                            </div>
                                            <AnimatePresence initial={false}>
                                                {!collapsedSections.organiser && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="px-5 py-4 space-y-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-[#0F172A] flex items-center justify-center font-black text-sm" style={{ color: theme.fill }}>
                                                                    {(event.organizer_name || '4M').charAt(0)}
                                                                </div>
                                                                <p className="font-bold text-[#0F172A] text-sm">{event.organizer_name || '4M Padel'}</p>
                                                            </div>
                                                            {event.organizer_phone && (
                                                                <a href={`tel:${event.organizer_phone}`} className="flex items-center gap-3 text-sm text-slate-600 hover:text-[#0F172A] transition-colors">
                                                                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center"><Phone className="w-3.5 h-3.5" /></div>
                                                                    {event.organizer_phone}
                                                                </a>
                                                            )}
                                                            {event.organizer_email && (
                                                                <a href={`mailto:${event.organizer_email}`} className="flex items-center gap-3 text-sm text-slate-600 hover:text-[#0F172A] transition-colors">
                                                                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center"><Mail className="w-3.5 h-3.5" /></div>
                                                                    <span className="truncate">{event.organizer_email}</span>
                                                                </a>
                                                            )}
                                                            {event.organizer_website && (
                                                                <a href={`https://${event.organizer_website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-slate-600 hover:text-[#0F172A] transition-colors">
                                                                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center"><Globe className="w-3.5 h-3.5" /></div>
                                                                    <span className="truncate">{event.organizer_website}</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ══ PLAYERS TAB ══ */}
                            {activeTab === 'players' && (
                                <div className="space-y-6">
                                    {fetchingParticipants && playerDivisions.length === 0 ? (
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 flex flex-col items-center">
                                            <Loader className="w-8 h-8 animate-spin text-[#0F172A] mb-4" />
                                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Loading Players...</p>
                                        </div>
                                    ) : playerDivisions.length > 0 ? (
                                        playerDivisions.map((cls) => {
                                            const clsParticipants = participants[cls.Id] || [];
                                            const isExpanded = !!expandedDivisions[cls.Id];
                                            return (
                                                <div key={cls.Id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                                    <div 
                                                        onClick={() => toggleDivision(cls.Id)}
                                                        className="flex items-center justify-between px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                                                    >
                                                        <h3 className="font-black text-[#0F172A] uppercase tracking-tight text-base">{cls.Name}</h3>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-[9px] font-black uppercase tracking-widest bg-[#CCFF00] text-[#0F172A] px-3 py-1.5 rounded-full">
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
                                                                    <div className="divide-y divide-gray-50">
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
                                                                                    <div key={pIdx} className="px-6 py-4">
                                                                                        <div className="flex items-center justify-between mb-3">
                                                                                            <h4 className="text-sm font-black text-[#0F172A] uppercase">{p.Name}</h4>
                                                                                            <div className="flex gap-2">
                                                                                                {rank && <span className="text-[8px] font-black uppercase tracking-widest bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Rank {rank}</span>}
                                                                                                {seed && <span className="text-[8px] font-black uppercase tracking-widest bg-[#CCFF00] text-[#0F172A] px-2 py-0.5 rounded-full">Seed {seed}</span>}
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="flex flex-wrap gap-2">
                                                                                            {p.Players.map((player, idx) => (
                                                                                                <div key={idx} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                                                                                                    <div className="w-7 h-7 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                                                                        {getProfileImage(player) ? (
                                                                                                            <img src={getProfileImage(player)} alt={player.Name} className="w-full h-full object-cover" />
                                                                                                        ) : (
                                                                                                            <User className="w-4 h-4 text-gray-500" />
                                                                                                        )}
                                                                                                    </div>
                                                                                                    <span className="text-xs font-bold text-[#0F172A]">{player.Name}</span>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            }

                                                                            return (
                                                                                <div key={pIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/30 transition-colors">
                                                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                                        <span className="w-5 text-[10px] font-black text-gray-400 flex-shrink-0">{pIdx + 1}</span>
                                                                                        <div className="flex flex-wrap gap-2.5">
                                                                                            {/* Player 1 */}
                                                                                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-2.5 py-1.5 shadow-sm">
                                                                                                <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 border border-white flex items-center justify-center">
                                                                                                    {getProfileImage(fPlayer) ? (
                                                                                                        <img src={getProfileImage(fPlayer)} alt={fPlayer.Name} className="w-full h-full object-cover" />
                                                                                                    ) : (
                                                                                                        <User className="w-3.5 h-3.5 text-gray-500" />
                                                                                                    )}
                                                                                                </div>
                                                                                                <span className="text-xs font-bold text-[#0F172A]">{fPlayer.Name}</span>
                                                                                            </div>

                                                                                            {/* Player 2 */}
                                                                                            {sPlayer.Name && (
                                                                                                <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-2.5 py-1.5 shadow-sm">
                                                                                                    <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 border border-white flex items-center justify-center">
                                                                                                        {getProfileImage(sPlayer) ? (
                                                                                                            <img src={getProfileImage(sPlayer)} alt={sPlayer.Name} className="w-full h-full object-cover" />
                                                                                                        ) : (
                                                                                                            <User className="w-3.5 h-3.5 text-gray-500" />
                                                                                                        )}
                                                                                                    </div>
                                                                                                    <span className="text-xs font-bold text-[#0F172A]">{sPlayer.Name}</span>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                                                                                        {rank && <span className="text-[8px] font-black uppercase tracking-widest bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Rank {rank}</span>}
                                                                                        {seed && <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-gray-200" style={{ backgroundColor: theme.fill + '15', color: theme.fill, borderColor: theme.fill + '25' }}>Seed {seed}</span>}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
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
                                    ) : (
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center text-center">
                                            <Users className="w-12 h-12 text-gray-200 mb-4" />
                                            <h3 className="text-lg font-black text-[#0F172A] mb-2">No Players Yet</h3>
                                            <p className="text-sm text-gray-400">The player list will populate closer to the event.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ══ RESULTS & DRAWS TAB ══ */}
                            {activeTab === 'results' && (
                                <div className="space-y-6">
                                    {/* Draws link */}
                                    {(() => {
                                        const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
                                        if (hasDraw || hasResults) {
                                            return (
                                                <Link
                                                    to={`/draws/${event.slug || rId}`}
                                                    className="flex items-center justify-between p-6 bg-[#0F172A] rounded-2xl shadow-lg hover:bg-[#0F172A]/90 transition-all group"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl bg-[#CCFF00]/10 flex items-center justify-center">
                                                            <GitBranch className="w-6 h-6 text-[#CCFF00]" />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-base font-black text-white uppercase tracking-tight">Tournament Draws</h3>
                                                            <p className="text-[10px] font-bold text-[#CCFF00] uppercase tracking-widest mt-0.5">View Live Brackets & Match Results</p>
                                                        </div>
                                                    </div>
                                                    <ArrowRight className="w-5 h-5 text-[#CCFF00] group-hover:translate-x-1 transition-transform" />
                                                </Link>
                                            );
                                        }
                                        return null;
                                    })()}

                                    {/* Winners */}
                                    {(isEventPassed || hasResults) && (
                                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
                                                <div className="w-8 h-8 rounded-lg bg-[#CCFF00]/20 flex items-center justify-center">
                                                    <Trophy className="w-4 h-4 text-[#0F172A]" />
                                                </div>
                                                <h2 className="font-black text-[#0F172A] uppercase tracking-tight text-sm">Champions</h2>
                                            </div>
                                            {winners.length > 0 ? (
                                                <div className="divide-y divide-gray-50">
                                                    {winners.map((winner, idx) => (
                                                        <div key={idx} className="px-6 py-5">
                                                            <p className="text-[9px] font-black uppercase tracking-widest text-[#CCFF00] bg-[#0F172A] px-2 py-1 rounded-md inline-block mb-3">{winner.CategoryName}</p>
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between bg-[#CCFF00]/5 border border-[#CCFF00]/20 p-3 rounded-xl">
                                                                    <div>
                                                                        <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-0.5">1st Place</p>
                                                                        <p className="text-sm font-black text-[#0F172A]">{winner.Winner?.Name || 'TBD'}</p>
                                                                    </div>
                                                                    <span className="text-2xl">🥇</span>
                                                                </div>
                                                                {winner.RunnerUp?.Name && (
                                                                    <div className="flex items-center justify-between bg-gray-50 border border-gray-100 p-3 rounded-xl">
                                                                        <div>
                                                                            <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-0.5">2nd Place</p>
                                                                            <p className="text-sm font-bold text-slate-700">{winner.RunnerUp.Name}</p>
                                                                        </div>
                                                                        <span className="text-2xl">🥈</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="px-6 py-10 text-center">
                                                    <Trophy className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                                                    <p className="text-xs font-bold text-gray-400">Results pending</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {!hasDraw && !hasResults && !isEventPassed && (
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center text-center">
                                            <GitBranch className="w-12 h-12 text-gray-200 mb-4" />
                                            <h3 className="text-lg font-black text-[#0F172A] mb-2">Draws Coming Soon</h3>
                                            <p className="text-sm text-gray-400">Draws will be released shortly before the tournament begins.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ══ MEDIA TAB ══ */}
                            {activeTab === 'media' && (
                                <div className="space-y-6">
                                    {/* Gallery card */}
                                    {albumInfo && (
                                        <div className="bg-[#0F172A] rounded-2xl shadow-lg overflow-hidden">
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
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-[#CCFF00] mb-1">Official Gallery</p>
                                                    <h3 className="text-xl font-black text-white uppercase tracking-tight">{albumInfo.title}</h3>
                                                    <p className="text-xs text-gray-400 mt-1 font-bold">{albumPhotos.length} Photos</p>
                                                </div>
                                                <Link
                                                    to={`/gallery/${albumInfo.slug || albumInfo.id}`}
                                                    className="px-6 py-3 bg-[#CCFF00] text-[#0F172A] rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white transition-colors flex-shrink-0 ml-4"
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
                                                    <PlayCircle className="w-4 h-4 text-[#0F172A]" />
                                                </div>
                                                <h2 className="font-black text-[#0F172A] uppercase tracking-tight text-sm">Event Highlights</h2>
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
                                                                        <Play className="w-5 h-5 text-[#0F172A] fill-current ml-0.5" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="p-3">
                                                                <p className="text-xs font-bold text-[#0F172A] line-clamp-2 leading-tight group-hover:text-gray-600 transition-colors">{video.title}</p>
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
                                            <h3 className="text-lg font-black text-[#0F172A] mb-2">No Media Yet</h3>
                                            <p className="text-sm text-gray-400">Media will be added after the event.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* ── FLOATING BOTTOM CTA CARD (mobile, sits above bottom nav) ── */}
                {!isEventPassed && (
                    <div className="fixed bottom-[88px] inset-x-4 z-50 md:hidden bg-white/95 backdrop-blur-md border border-gray-200/80 p-3.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                        <div className="flex gap-2.5">
                            {!isRegistered && (
                                <a
                                    href={event.rankedin_url || 'https://www.rankedin.com/'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 text-center text-[10px] font-black uppercase tracking-widest py-3.5 bg-[#0F172A] text-white rounded-xl hover:bg-[#0F172A]/90 transition-all font-bold"
                                >
                                    Register
                                </a>
                            )}
                            {(event.entry_fee > 0 || Object.keys(event.category_fees || {}).length > 0) && !isPaid && (
                                <button
                                    onClick={() => { setRegStep(1); setIsModalOpen(true); }}
                                    className={`flex-1 text-center text-[10px] font-black uppercase tracking-widest py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 ${theme.primary} ${theme.glow}`}
                                    style={{ color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0f172a' }}
                                >
                                    <CreditCard className="w-4 h-4" />
                                    Pay R{event.entry_fee} Entry
                                </button>
                            )}
                            {isPaid && (
                                <div className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-green-50 border border-green-200 rounded-xl">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-green-700">Paid & Registered</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {isEventPassed && (hasResults || hasDraw) && (
                    <div className="fixed bottom-[88px] inset-x-4 z-50 md:hidden bg-white/95 backdrop-blur-md border border-gray-200/80 p-3.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                        {(() => {
                            const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
                            return (
                                <Link
                                    to={`/draws/${event.slug || rId}`}
                                    className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${theme.primary} ${theme.glow}`}
                                    style={{ color: theme.primaryText.includes('text-white') ? '#ffffff' : '#0f172a' }}
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
                                                                    className={`group relative flex items-center justify-between px-5 py-4 rounded-2xl border transition-all duration-300 ${alreadyPaid
                                                                        ? 'bg-padel-green/5 border-padel-green/20 opacity-60 cursor-not-allowed'
                                                                        : isSelected
                                                                            ? 'bg-padel-green border-padel-green shadow-lg shadow-padel-green/20 scale-[1.02]'
                                                                            : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.07]'
                                                                        }`}
                                                                >
                                                                    <div className="flex items-center gap-4">
                                                                        <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all duration-300 ${alreadyPaid ? 'bg-padel-green border-padel-green' :
                                                                            isSelected ? 'bg-white border-white' : 'border-white/20 bg-black/20'
                                                                            }`}>
                                                                            {alreadyPaid && <CheckCircle size={14} className="text-white" />}
                                                                            {isSelected && !alreadyPaid && <CheckCircle size={14} className="text-padel-green" />}
                                                                        </div>
                                                                        <div className="text-left">
                                                                            <span className={`text-[13px] font-black uppercase tracking-tight block ${isSelected && !alreadyPaid ? 'text-black' : alreadyPaid ? 'text-padel-green' : 'text-white'
                                                                                }`}>
                                                                                {divName}
                                                                            </span>
                                                                            <span className={`text-[9px] font-bold uppercase tracking-widest ${isSelected && !alreadyPaid ? 'text-black/60' : 'text-white/30'
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
        </>
    );
};

export default EventDetails;