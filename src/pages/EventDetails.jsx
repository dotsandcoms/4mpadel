import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { supabase } from '../supabaseClient';
import { useRankedin } from '../hooks/useRankedin';
import { Calendar as CalendarIcon, MapPin, Loader, Phone, Mail, Globe, Share2, ArrowLeft, X, CheckCircle, CreditCard, Cloud, CloudRain, CloudLightning, CloudSnow, GitBranch, PlayCircle, Play, ImageIcon } from 'lucide-react';
import heroBg from '../assets/hero_bg.png'; // Fallback image
import tournamentHero from '../assets/tournament_hero.jpg'; // Specific tournament hero

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
    const [weather, setWeather] = useState(null);
    const [hasDraw, setHasDraw] = useState(false);
    const [hasResults, setHasResults] = useState(false);
    const [winners, setWinners] = useState([]);
    
    // New State for Tabs & Enhanced Data
    const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'divisions', 'media'
    const [tournamentClasses, setTournamentClasses] = useState([]);
    const [upcomingMatches, setUpcomingMatches] = useState([]);
    const [albumPhotos, setAlbumPhotos] = useState([]);
    const [fetchingRankedinData, setFetchingRankedinData] = useState(false);

    const [videoModal, setVideoModal] = useState({ isOpen: false, url: '', title: '' });
    const { getTournamentClasses, getTournamentWinners, getTournamentMatches } = useRankedin();

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
    const [regStep, setRegStep] = useState(1); // 1: Form, 2: Success/Payment
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        partner_name: '',
        division: 'Gold'
    });

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
                    // Fetch all classes
                    const classes = await getTournamentClasses(rId);
                    if (classes) {
                        setTournamentClasses(classes);
                        const drawAvailable = classes.some(c =>
                            c.IsPublished &&
                            Array.isArray(c.TournamentDraws) &&
                            c.TournamentDraws.length > 0
                        );
                        setHasDraw(drawAvailable);
                    }

                    // Check Results/Winners (Only if event is passed)
                    const isPassed = new Date(event.end_date || event.start_date) < new Date();
                    if (isPassed) {
                        const tournamentWinners = await getTournamentWinners(rId);
                        if (tournamentWinners && tournamentWinners.length > 0) {
                            setWinners(tournamentWinners);
                            setHasResults(true);
                        } else {
                            const tournamentMatchesCompleted = await getTournamentMatches({ tournamentId: rId, isFinished: true });
                            if (tournamentMatchesCompleted && tournamentMatchesCompleted.length > 0) {
                                setHasResults(true);
                            }
                        }
                    } else {
                        // Fetch upcoming matches for live/upcoming events
                        const matchesPreview = await getTournamentMatches({ tournamentId: rId, isFinished: false });
                        if (matchesPreview && matchesPreview.length > 0) {
                            // Filter specifically for matches that are actually scheduled/upcoming
                            setUpcomingMatches(matchesPreview.slice(0, 15)); // Get top 15 matches to avoid overwhelming
                        }
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
        const fetchAlbumPhotos = async () => {
            if (!event) return;
            
            // Check if there's an album linked to this event in our DB
            try {
                const { data: albumData, error: albumError } = await supabase
                    .from('albums')
                    .select('id')
                    .eq('event_id', event.id)
                    .single();

                if (albumData?.id && !albumError) {
                    const { data: images, error: imageError } = await supabase
                        .from('gallery_images')
                        .select('image_url, id')
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

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const { error } = await supabase
                .from('event_registrations')
                .insert([{
                    event_id: event.id,
                    ...formData,
                    payment_status: 'pending'
                }]);

            if (error) throw error;

            // Success -> Move to Step 2 (Payment Redirect Mock)
            setRegStep(2);
        } catch (error) {
            console.error('Registration error:', error);
            alert('Registration failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddToCalendar = () => {
        if (!event) return;

        // 1. Parse Start Date (YYYY-MM-DD)
        const dateParts = event.start_date ? event.start_date.split('-') : [];
        let year = dateParts[0];
        let month = dateParts[1];
        let day = dateParts[2];

        // Fallback if start_date is missing (try to guess from event_dates string or default to today)
        if (!year) {
            const now = new Date();
            year = now.getFullYear();
            month = String(now.getMonth() + 1).padStart(2, '0');
            day = String(now.getDate()).padStart(2, '0');
        }

        // 2. Parse Start Time (e.g., "08:00 AM" or "14:00")
        let startHour = '09';
        let startMinute = '00';

        if (event.start_time) {
            const timeMatch = event.start_time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (timeMatch) {
                let h = parseInt(timeMatch[1], 10);
                const m = timeMatch[2];
                const ampm = timeMatch[3];

                if (ampm) {
                    if (ampm.toLowerCase() === 'pm' && h < 12) h += 12;
                    if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
                }
                startHour = String(h).padStart(2, '0');
                startMinute = m;
            }
        }

        // Format: YYYYMMDDTHHmm00
        const dtStart = `${year}${month}${day}T${startHour}${startMinute}00`;
        const dtEnd = `${year}${month}${day}T${String(parseInt(startHour) + 2).padStart(2, '0')}${startMinute}00`; // Default 2 hours duration

        // 3. Construct ICS Content
        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//SAPA//Event Calendar//EN',
            'BEGIN:VEVENT',
            `UID:${event.id}@padelsa.co.za`,
            `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
            `DTSTART:${dtStart}`,
            `DTEND:${dtEnd}`,
            `SUMMARY:${event.event_name}`,
            `DESCRIPTION:${stripHtml(event.description || 'Padel Tournament Event')}`,
            `LOCATION:${event.venue} ${event.address ? `, ${event.address}` : ''}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        // 4. Trigger Download
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${event.event_name.replace(/\s+/g, '_')}.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePaymentRedirect = () => {
        // Mock payment redirection
        alert('Redirecting to Payment Gateway...');
        // In a real app: window.location.href = 'https://paystack.com/...' 
        setIsModalOpen(false);
        setRegStep(1);
        setFormData({ full_name: '', email: '', phone: '', partner_name: '', division: 'Gold' });
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
            <main className="bg-slate-50 min-h-screen text-slate-900 relative font-sans pb-24 md:pb-0">
                {/* Hero Section with Image */}
                <div className="relative h-[35vh] md:h-[45vh] min-h-[300px] md:min-h-[400px] w-full overflow-hidden bg-slate-900 flex items-center justify-center">
                    <img
                        src={event.image_url || tournamentHero}
                        alt={event.event_name}
                        className="absolute inset-0 w-full h-full object-cover opacity-60 contrast-125 saturate-50"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-slate-50" />

                    {/* Background Big Text Inside Hero */}
                    <div className="relative z-10 w-full overflow-hidden select-none pointer-events-none translate-y-1/3">
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-[120px] md:text-[220px] font-black text-white/[0.07] uppercase leading-none whitespace-nowrap text-center tracking-tighter"
                        >
                            {event.event_name.split(' ').slice(0, 3).join(' ')}
                        </motion.h1>
                    </div>

                    <Link
                        to="/calendar"
                        className="absolute top-24 left-6 z-20 bg-white/10 backdrop-blur-md text-white p-2 rounded-full hover:bg-white hover:text-black transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                </div>


                <div className="container mx-auto px-4 lg:px-6 relative z-10 -mt-32 pb-32">
                    <div className="flex flex-col lg:flex-row gap-8 relative z-10">

                        {/* Ticket Card (Floating) */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-w-4xl w-full mx-auto border border-gray-100"
                        >
                            {/* Left Side: Event Info */}
                            <div className="p-8 flex-1 md:border-r border-dashed border-gray-300 relative">
                                {/* Punch hole effect top/bottom on border */}
                                <div className="hidden md:block absolute -top-3 -right-3 w-6 h-6 bg-slate-50 rounded-full z-10" />
                                <div className="hidden md:block absolute -bottom-3 -right-3 w-6 h-6 bg-slate-50 rounded-full z-10" />

                                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">{event.event_name}</h1>

                                <div className="space-y-6">
                                    {/* Date & Time */}
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-full bg-padel-green/10 flex items-center justify-center text-padel-green shrink-0">
                                            <CalendarIcon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-1">Date and Time</p>
                                            <p className="font-bold text-lg text-slate-800">{event.event_dates}</p>
                                            {(event.start_time || event.end_time) && (
                                                <p className="text-slate-500 text-sm mt-1">
                                                    {event.start_time} {event.end_time ? `- ${event.end_time}` : ''}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Location */}
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-full bg-padel-green/10 flex items-center justify-center text-padel-green shrink-0">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-1">Address</p>
                                            <p className="font-bold text-lg text-slate-800">{event.venue}</p>
                                            <p className="text-slate-500 text-sm mt-1">{event.address || event.city}</p>
                                        </div>
                                    </div>

                                    {/* Map and Champions have been moved to Tabs */}

                                    {/* Social Share */}
                                    <div className="pt-2 flex gap-4">
                                        <button className="text-gray-400 hover:text-slate-900 transition-colors"><Share2 className="w-5 h-5" /></button>
                                    </div>
                                </div>
                            </div>

                            {/* Right Side: Registration Action */}
                            <div className="hidden md:flex p-8 w-80 bg-gray-50 flex-col items-center justify-center gap-6 border-l border-dashed border-gray-300 relative">
                                <div className="absolute -top-3 -left-3 w-6 h-6 bg-slate-50 rounded-full z-10" />
                                <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-slate-50 rounded-full z-10" />

                                <div className="text-center w-full">
                                    <div className="flex flex-col items-center mb-6">
                                        <div className="flex items-center gap-2 bg-slate-200/50 px-4 py-2 rounded-full mb-2">
                                            <span className="text-2xl font-black text-slate-900">{event.registered_players || 0}</span>
                                            <div className="text-left leading-tight">
                                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">registered</p>
                                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">players</p>
                                            </div>
                                        </div>
                                    </div>

                                    <h3 className="font-bold text-slate-900 text-xl mb-2">
                                        {isEventPassed ? 'View Results' : 'Join the Action'}
                                    </h3>
                                    <p className="text-xs text-gray-500 mb-6">
                                        {isEventPassed ? 'The tournament has concluded.' : 'Secure your spot in the tournament.'}
                                    </p>

                                    {!isEventPassed && (
                                        <>
                                            <a
                                                href={event.rankedin_url || `https://www.rankedin.com/`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-block w-full bg-padel-green !text-[#0F172A] font-black py-4 rounded-xl shadow-lg shadow-padel-green/30 hover:bg-slate-900 hover:!text-white hover:scale-105 transition-all duration-300 uppercase tracking-widest text-sm mb-4 text-center ring-1 ring-inset ring-black/5"
                                            >
                                                Register Now
                                            </a>

                                            <button
                                                className="w-full bg-white border-2 border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:border-slate-900 hover:text-slate-900 transition-all duration-300 uppercase tracking-wide text-xs mb-3"
                                                onClick={handleAddToCalendar}
                                            >
                                                Add to Calendar
                                            </button>
                                        </>
                                    )}

                                    {(() => {
                                        const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
                                        if ((!hasDraw && !hasResults) || (!rId && !event.slug)) return null;
                                        
                                        return (
                                            <div className="w-full space-y-3">
                                                {hasDraw && (
                                                    <Link
                                                        to={`/draws/${event.slug || rId}`}
                                                        className="w-full flex items-center justify-center gap-2 bg-slate-900 !text-padel-green font-black py-4 rounded-xl shadow-lg hover:bg-padel-green hover:!text-black transition-all duration-300 uppercase tracking-widest text-sm"
                                                    >
                                                        <GitBranch className="w-4 h-4" />
                                                        View Draw
                                                    </Link>
                                                )}
                                                {hasResults && (
                                                    <Link
                                                        to={`/results/${event.slug || rId}`}
                                                        className="w-full flex items-center justify-center gap-2 bg-padel-green !text-black font-black py-4 rounded-xl shadow-lg hover:bg-slate-900 hover:!text-padel-green transition-all duration-300 uppercase tracking-widest text-sm"
                                                    >
                                                        <CheckCircle className="w-4 h-4" />
                                                        View Results
                                                    </Link>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Event Poster Image */}
                                {event.image_url && (
                                    <div className="w-full aspect-[3/4] rounded-xl overflow-hidden shadow-md border border-gray-100">
                                        <img src={event.image_url} alt="Event Poster" className="w-full h-full object-cover" />
                                    </div>
                                )}

                                <div className="text-center pt-4 border-t border-gray-200 w-full">
                                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Powered by 4M PADEL</p>
                                </div>
                            </div>
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
                                        <a
                                            href={event.rankedin_url || `https://www.rankedin.com/`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="bg-padel-green text-black font-black py-3 px-6 rounded-xl hover:bg-slate-900 hover:text-white transition-all duration-300 shadow-md whitespace-nowrap text-sm tracking-wide uppercase"
                                        >
                                            Register
                                        </a>
                                    );
                                } else if (hasResults && (rId || event.slug)) {
                                    return (
                                        <Link
                                            to={`/results/${event.slug || rId}`}
                                            className="bg-padel-green text-black font-black py-3 px-6 rounded-xl hover:bg-slate-900 hover:text-white transition-all duration-300 shadow-md whitespace-nowrap text-sm tracking-wide uppercase"
                                        >
                                            Results
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
                            {['overview', 'divisions', 'media'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`relative px-6 py-3 rounded-full font-bold text-sm tracking-wide uppercase transition-all duration-300 whitespace-nowrap ${
                                        activeTab === tab ? 'text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-gray-100/50'
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
                                    <span className="relative z-10">{tab === 'divisions' ? 'Divisions & Results' : tab === 'media' ? 'Media Showcase' : 'Overview'}</span>
                                </button>
                            ))}
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
                                        <div className="lg:col-span-2 space-y-8 h-full">
                                            <motion.div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                                <div className="p-6 md:p-8 border-b border-gray-50 bg-gray-50/50">
                                                    <h3 className="text-2xl font-bold text-slate-900">Event Details</h3>
                                                </div>
                                                <div className="p-6 md:p-8">
                                                    <div
                                                        className="text-slate-600 leading-relaxed md:text-lg event-rich-description"
                                                        dangerouslySetInnerHTML={{
                                                            __html: event.description || "Join us for this exciting event! More details will be announced soon. Expect high-level competition and a great atmosphere."
                                                        }}
                                                    />
                                                </div>
                                            </motion.div>

                                            {/* Moved Google Map here */}
                                            {(event.address || event.venue) && (
                                                <motion.div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                                    <div className="p-6 md:p-8 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                                                        <h3 className="text-xl font-bold text-slate-900">Location</h3>
                                                        <a 
                                                            href={`https://maps.google.com/?q=${encodeURIComponent(`${event.venue || ''} ${event.address || ''} ${event.city || ''}`.trim())}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-padel-green font-bold text-sm tracking-wide hover:underline flex items-center gap-1"
                                                        >
                                                            Get Directions <ArrowLeft className="w-4 h-4 rotate-135" />
                                                        </a>
                                                    </div>
                                                    <div className="h-[300px] w-full relative">
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
                                                </motion.div>
                                            )}
                                        </div>

                            {/* Right Column: Sidebar Widgets */}
                            <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-32">
                                {/* Organizer Widget */}
                                <motion.div
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.5 }}
                                    className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 p-6"
                                >
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 rounded-full bg-white text-slate-900 flex items-center justify-center font-bold text-xl">
                                            {event.organizer_name ? event.organizer_name.charAt(0) : 'S'}
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-400 font-bold uppercase">Event Organizer</p>
                                            <h4 className="font-bold text-lg text-white">{event.organizer_name || 'SAPA'}</h4>
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
                                </motion.div>

                                {/* Weather Widget */}
                                {weather && (
                                    <motion.div
                                        initial={{ opacity: 0, x: 20 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.1 }}
                                        className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
                                    >
                                        <h4 className="font-bold text-lg text-slate-900 mb-4">Event Forecast</h4>
                                        <div className="flex items-center justify-between">
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
                                                    <p className="text-xs text-gray-500">Event Weather</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-bold text-slate-900">{Math.round(weather.temp)}°C</p>
                                                <p className="text-xs text-gray-400">Precip: {weather.precip}%</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {/* Sponsors Widget */}
                                <motion.div
                                    initial={{ opacity: 0, x: 20 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.2 }}
                                    className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
                                >
                                    <h4 className="font-bold text-lg text-slate-900 mb-4">Event Sponsors</h4>
                                    <div className="grid grid-cols-2 gap-4">
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
                                </motion.div>
                            </div>
                        </div>
                                )}

                                {activeTab === 'divisions' && (
                                    <div className="space-y-8">
                                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                            <div className="p-6 md:p-8 border-b border-gray-50 bg-gray-50/50">
                                                <h3 className="text-2xl font-bold text-slate-900">Divisions & Results</h3>
                                                <p className="text-sm text-gray-500 mt-2">Data synced directly from Rankedin</p>
                                            </div>
                                            
                                            <div className="p-6 md:p-8 bg-slate-50">
                                                {fetchingRankedinData ? (
                                                    <div className="flex flex-col items-center justify-center py-12">
                                                        <Loader className="w-8 h-8 animate-spin text-padel-green mb-4" />
                                                        <p className="text-gray-400 font-bold">Syncing data...</p>
                                                    </div>
                                                ) : tournamentClasses.length > 0 ? (
                                                    <div className="space-y-4">
                                                        {tournamentClasses.map((cls, idx) => (
                                                            <div key={idx} className="bg-white border text-center border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                                                                <h4 className="font-black text-xl text-slate-900 mb-4">{cls.Name}</h4>
                                                                {/* Check if there are winners specifically for this class */}
                                                                {isEventPassed && winners.some(w => w.className === cls.Name) ? (
                                                                    <div className="bg-slate-900 p-4 rounded-xl inline-block mx-auto">
                                                                        <span className="text-padel-green font-bold text-xs uppercase tracking-widest block mb-1">Champions</span>
                                                                        <span className="text-white font-black text-lg">
                                                                            {winners.find(w => w.className === cls.Name)?.winners}
                                                                        </span>
                                                                    </div>
                                                                ) : !isEventPassed && upcomingMatches.some(m => m.MatchClass?.Id === cls.Id) ? (
                                                                    <div className="bg-gray-50 p-4 rounded-xl">
                                                                        <span className="text-slate-500 font-bold text-xs uppercase tracking-widest block mb-2">Upcoming Match Preview</span>
                                                                        <p className="text-sm font-medium text-slate-700">Matches are scheduled. View Draws for full details.</p>
                                                                    </div>
                                                                ) : (
                                                                     <p className="text-gray-400 text-sm">No results available yet.</p>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-12">
                                                        <p className="text-gray-400 font-bold italic">No division data available for this event.</p>
                                                    </div>
                                                )}

                                                <div className="mt-8 text-center pt-8 border-t border-gray-200">
                                                    {(() => {
                                                        const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
                                                        if (hasDraw && !isEventPassed) {
                                                            return (
                                                                <Link to={`/draws/${event.slug || rId}`} className="inline-flex items-center gap-2 bg-slate-900 text-padel-green font-black py-4 px-8 rounded-xl shadow-lg hover:bg-padel-green hover:text-black transition-all uppercase tracking-widest text-sm">
                                                                    <GitBranch className="w-5 h-5" /> View Full Draws
                                                                </Link>
                                                            );
                                                        } else if (hasResults) {
                                                            return (
                                                                <Link to={`/results/${event.slug || rId}`} className="inline-flex items-center gap-2 bg-slate-900 text-padel-green font-black py-4 px-8 rounded-xl shadow-lg hover:bg-padel-green hover:text-black transition-all uppercase tracking-widest text-sm">
                                                                    <CheckCircle className="w-5 h-5" /> View Full Results
                                                                </Link>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'media' && (
                                    <div className="space-y-8">
                                        {/* Gallery Photos */}
                                        {albumPhotos.length > 0 && (
                                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                                <div className="p-6 md:p-8 border-b border-gray-50 bg-gray-50/50">
                                                    <h3 className="text-2xl font-bold text-slate-900">Event Gallery</h3>
                                                </div>
                                                <div className="p-6 md:p-8">
                                                    <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                                                        {albumPhotos.map((photo, i) => (
                                                            <div key={photo.id} className="break-inside-avoid relative group rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all">
                                                                <img src={photo.image_url} alt="Event Gallery" className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500" />
                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* YouTube Highlights inside Media */}
                                        {event.youtube_playlist_url && (
                                            <div className="bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 p-8 md:p-14 overflow-hidden relative">
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
                                        
                                        {!event.youtube_playlist_url && albumPhotos.length === 0 && (
                                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-12 text-center">
                                                <ImageIcon className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                                                <h3 className="text-2xl font-bold text-slate-800 mb-2">No Media Available</h3>
                                                <p className="text-gray-500">Photos and videos from the event will be posted here soon.</p>
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
                        <>
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
                                className="fixed inset-0 z-[1100] flex items-center justify-center pointer-events-none p-4"
                            >
                                <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl pointer-events-auto overflow-hidden">
                                    {/* Modal Header */}
                                    <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                                        <h3 className="text-white font-bold text-lg">
                                            {regStep === 1 ? 'Event Registration' : 'Registration Successful'}
                                        </h3>
                                        <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                                            <X className="w-6 h-6" />
                                        </button>
                                    </div>

                                    {/* Modal Content */}
                                    <div className="p-8">
                                        {regStep === 1 ? (
                                            <form onSubmit={handleRegister} className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
                                                    <input
                                                        type="text"
                                                        name="full_name"
                                                        required
                                                        value={formData.full_name}
                                                        onChange={handleInputChange}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all"
                                                        placeholder="Enter your full name"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-slate-700 mb-1">Email Address</label>
                                                    <input
                                                        type="email"
                                                        name="email"
                                                        required
                                                        value={formData.email}
                                                        onChange={handleInputChange}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all"
                                                        placeholder="name@example.com"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-bold text-slate-700 mb-1">Phone</label>
                                                        <input
                                                            type="tel"
                                                            name="phone"
                                                            value={formData.phone}
                                                            onChange={handleInputChange}
                                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all"
                                                            placeholder="+27..."
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-bold text-slate-700 mb-1">Category</label>
                                                        <select
                                                            name="division"
                                                            value={formData.division}
                                                            onChange={handleInputChange}
                                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all appearance-none cursor-pointer"
                                                        >
                                                            <option value="Gold">Gold</option>
                                                            <option value="Silver">Silver</option>
                                                            <option value="Bronze">Bronze</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-slate-700 mb-1">Partner's Name (Optional)</label>
                                                    <input
                                                        type="text"
                                                        name="partner_name"
                                                        value={formData.partner_name}
                                                        onChange={handleInputChange}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all"
                                                        placeholder="Enter partner's name"
                                                    />
                                                </div>

                                                <button
                                                    type="submit"
                                                    disabled={submitting}
                                                    className="w-full bg-padel-green text-black font-bold py-4 rounded-xl shadow-lg shadow-padel-green/20 hover:bg-black hover:text-padel-green transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {submitting ? 'Processing...' : 'Proceed to Payment'}
                                                </button>
                                            </form>
                                        ) : (
                                            <div className="text-center py-8">
                                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                                    <CheckCircle className="w-10 h-10 text-green-600" />
                                                </div>
                                                <h4 className="text-2xl font-bold text-slate-900 mb-2">Registration Confirmed!</h4>
                                                <p className="text-slate-500 mb-8">Your details have been saved. Please proceed to payment to finalize your booking.</p>

                                                <button
                                                    onClick={handlePaymentRedirect}
                                                    className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-padel-green hover:text-black transition-all flex items-center justify-center gap-2"
                                                >
                                                    <CreditCard className="w-5 h-5" />
                                                    Pay Now
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        </>
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
