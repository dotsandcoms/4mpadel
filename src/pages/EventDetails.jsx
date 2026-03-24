import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { supabase } from '../supabaseClient';
import { useRankedin } from '../hooks/useRankedin';
import { Calendar as CalendarIcon, MapPin, Loader, Phone, Mail, Globe, Share2, ArrowLeft, X, CheckCircle, CreditCard, Cloud, CloudRain, CloudLightning, CloudSnow, GitBranch, PlayCircle, Play } from 'lucide-react';
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
    const [videoModal, setVideoModal] = useState({ isOpen: false, url: '', title: '' });
    const { getTournamentClasses, getTournamentWinners, getTournamentMatches } = useRankedin();

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

                const { data, error } = await query.single();

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
                // Check Draws
                const classes = await getTournamentClasses(rId);
                const drawAvailable = classes && classes.some(c =>
                    c.IsPublished &&
                    Array.isArray(c.TournamentDraws) &&
                    c.TournamentDraws.length > 0
                );
                setHasDraw(drawAvailable);

                // Check Results/Winners
                const tournamentWinners = await getTournamentWinners(rId);
                if (tournamentWinners && tournamentWinners.length > 0) {
                    setWinners(tournamentWinners);
                    setHasResults(true);
                } else {
                    // Try matches to be sure
                    const tournamentMatches = await getTournamentMatches({ tournamentId: rId, isFinished: true });
                    if (tournamentMatches && tournamentMatches.length > 0) {
                        setHasResults(true);
                    }
                }
            } else if (event.slug) {
                setHasDraw(false);
                setHasResults(false);
            }
        };
        checkRankedinStatus();
    }, [event, getTournamentClasses, getTournamentWinners, getTournamentMatches]);

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
            <main className="bg-slate-50 min-h-screen text-slate-900 relative font-sans">
                {/* Hero Section with Image */}
                <div className="relative h-[45vh] min-h-[400px] w-full overflow-hidden bg-slate-900 flex items-center justify-center">
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

                                    {/* Google Map Embed (New Location) */}
                                    {(event.address || event.venue) && (
                                        <div className="rounded-xl overflow-hidden shadow-sm h-[180px] w-full relative group border border-gray-100 my-4">
                                            <iframe
                                                width="100%"
                                                height="100%"
                                                frameBorder="0"
                                                scrolling="no"
                                                marginHeight="0"
                                                marginWidth="0"
                                                src={`https://maps.google.com/maps?q=${encodeURIComponent(`${event.venue || ''} ${event.address || ''} ${event.city || ''}`.trim())}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                                className="w-full h-full grayscale group-hover:grayscale-0 transition-all duration-700 ease-in-out"
                                                title="Event Location"
                                            ></iframe>
                                            <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-slate-900 pointer-events-none shadow-sm flex items-center gap-1 border border-gray-100/50">
                                                <div className="w-1.5 h-1.5 rounded-full bg-padel-green animate-pulse"></div>
                                                {event.city || 'Club'}
                                            </div>
                                        </div>
                                    )}

                                    {/* Tournament Champions Section */}
                                    {hasResults && winners.length > 0 && (
                                        <motion.div 
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="mb-8 p-6 bg-slate-900 rounded-2xl border border-padel-green/20 relative overflow-hidden"
                                        >
                                            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                                <CheckCircle size={80} className="text-padel-green" />
                                            </div>
                                            <h4 className="text-padel-green font-black uppercase tracking-widest text-xs mb-4 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-padel-green animate-pulse" />
                                                Tournament Champions
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {winners.map((w, idx) => (
                                                    <div key={idx} className="flex flex-col">
                                                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{w.className}</span>
                                                        <span className="text-white font-bold text-lg leading-tight">{w.winners}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Social Share */}
                                    <div className="pt-2 flex gap-4">
                                        <button className="text-gray-400 hover:text-slate-900 transition-colors"><Share2 className="w-5 h-5" /></button>
                                    </div>
                                </div>
                            </div>

                            {/* Right Side: Registration Action */}
                            <div className="p-8 md:w-80 bg-gray-50 flex flex-col items-center justify-center gap-6 border-t md:border-t-0 md:border-l border-dashed border-gray-300 relative">
                                <div className="hidden md:block absolute -top-3 -left-3 w-6 h-6 bg-slate-50 rounded-full z-10" />
                                <div className="hidden md:block absolute -bottom-3 -left-3 w-6 h-6 bg-slate-50 rounded-full z-10" />

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

                                    <h3 className="font-bold text-slate-900 text-xl mb-2">Join the Action</h3>
                                    <p className="text-xs text-gray-500 mb-6">Secure your spot in the tournament.</p>

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

                    {/* Content Component */}
                    <div className="mt-12 max-w-6xl mx-auto space-y-8">


                        {/* Top Section: Details + Sidebar */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                            {/* Left Column: Event Details & Map */}
                            <div className="lg:col-span-2 h-full">
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5 }}
                                    className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden max-h-[800px]"
                                >
                                    <div className="p-8 pb-4 shrink-0 border-b border-gray-50 bg-gray-50/50">
                                        <h3 className="text-2xl font-bold text-slate-900">Event Details</h3>
                                    </div>

                                    <div className="p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">

                                        <div
                                            className="text-slate-600 leading-relaxed text-lg mb-8 event-rich-description"
                                            dangerouslySetInnerHTML={{
                                                __html: event.description || "Join us for this exciting event! More details will be announced soon. Expect high-level competition and a great atmosphere."
                                            }}
                                        />


                                    </div>
                                </motion.div>
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


                    </div>
                </div>

                {/* YouTube Playlist / Highlights Section with Navy Background - Spans across the page */}
                {event.youtube_playlist_url && (
                    <section className="bg-slate-900 py-24 my-16 border-y border-slate-800 relative overflow-hidden">
                        {/* Background Wording Effect */}
                        <motion.h2
                            initial={{ opacity: 0, x: -50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8 }}
                            className="text-[100px] md:text-[180px] font-black text-white/[0.03] absolute top-0 -left-10 select-none uppercase tracking-tighter z-0"
                        >
                            Highlights
                        </motion.h2>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 relative z-10"
                        >
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                                <h2 className="text-4xl md:text-5xl font-black flex items-center gap-4 text-white tracking-tight">
                                    <div className="w-16 h-16 rounded-2xl bg-padel-green/10 flex items-center justify-center">
                                        <PlayCircle className="text-padel-green w-10 h-10" />
                                    </div>
                                    Event Highlights
                                </h2>
                            </div>

                            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 p-8 md:p-14 overflow-hidden relative">


                                {fetchingVideos ? (
                                    <div className="flex flex-col items-center justify-center py-24 bg-gray-50 rounded-[2rem] border border-dashed border-gray-200">
                                        <Loader className="w-10 h-10 animate-spin text-padel-green mb-6" />
                                        <p className="text-gray-400 font-bold text-xl italic">Fetching latest highlights...</p>
                                    </div>
                                ) : playlistVideos.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
                                        {playlistVideos.map((video) => (
                                            <motion.div
                                                key={video.id}
                                                whileHover={{ y: -8 }}
                                                className="group relative cursor-pointer"
                                                onClick={() => setVideoModal({ isOpen: true, url: video.id, title: video.title })}
                                            >
                                                <div className="aspect-video rounded-[1.5rem] overflow-hidden bg-slate-100 relative shadow-md group-hover:shadow-2xl transition-all duration-500">
                                                    <img
                                                        src={video.thumbnail}
                                                        alt={video.title}
                                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                                    />
                                                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors duration-500" />
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform scale-90 group-hover:scale-100">
                                                        <div className="w-16 h-16 rounded-full bg-padel-green text-black flex items-center justify-center shadow-2xl backdrop-blur-sm">
                                                            <Play className="w-10 h-10 fill-current ml-1" />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-5 px-1">
                                                    <h3 className="font-bold text-slate-900 line-clamp-2 group-hover:text-padel-green transition-colors text-xl leading-snug">
                                                        {video.title}
                                                    </h3>
                                                    <div className="flex items-center gap-3 mt-3">
                                                        <div className="w-8 h-px bg-padel-green/30" />
                                                        <p className="text-xs text-gray-400 uppercase font-black tracking-[0.2em]">
                                                            {new Date(video.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                                        </p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="aspect-video w-full rounded-[2rem] overflow-hidden border border-gray-100 shadow-2xl" id="event-highlights">
                                        {getPlaylistEmbedUrl(event.youtube_playlist_url) ? (
                                            <iframe
                                                src={getPlaylistEmbedUrl(event.youtube_playlist_url)}
                                                title="YouTube playlist player"
                                                className="w-full h-full border-0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                allowFullScreen
                                            />
                                        ) : (                                            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 p-12 text-center rounded-[2rem]">
                                                <PlayCircle className="w-16 h-16 mb-6 opacity-20 text-padel-green" />
                                                <p className="font-bold text-xl text-slate-900">Watch the highlights</p>
                                                <p className="text-gray-500 mt-2 max-w-md mx-auto">We couldn't load the dynamic grid right now. Please try again later or contact the organizer.</p>
                                            </div>

                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </section>
                )}


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
