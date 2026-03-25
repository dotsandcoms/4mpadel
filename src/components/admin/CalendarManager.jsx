import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, X, Save, Search, Image as ImageIcon, Star, CalendarDays, Flag, MapPin, Users, RefreshCw, Trophy, PlayCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import {
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

const STAT_COLORS = { 'padel-green': '#beff00', green: '#22c55e', amber: '#f59e0b', slate: '#64748b', purple: '#a855f7' };

const StatCard = ({ title, value, subtext, icon: Icon, color = 'padel-green', delay = 0 }) => {
    const c = STAT_COLORS[color] || STAT_COLORS['padel-green'];
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.3 }}
            className="bg-[#1E293B]/50 backdrop-blur-md p-5 rounded-2xl border border-white/10 hover:border-white/20 transition-colors"
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">{title}</p>
                    <p className="text-3xl font-black text-white">{value}</p>
                    <p className="text-gray-500 text-xs mt-1">{subtext}</p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: c + '20' }}>
                    <Icon size={24} style={{ color: c }} />
                </div>
            </div>
        </motion.div>
    );
};

const formatEventDates = (start, end) => {
    if (!start) return '';
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;

    // Add timezone offset to prevent picking the day before
    const tzOffsetStart = startDate.getTimezoneOffset() * 60000;
    const correctedStart = new Date(startDate.getTime() + tzOffsetStart);

    const startDay = correctedStart.getDate();
    const startMonth = correctedStart.toLocaleString('default', { month: 'long' });
    const startYear = correctedStart.getFullYear();

    if (!endDate || start === end) {
        return `${startDay} ${startMonth} ${startYear}`;
    }

    const tzOffsetEnd = endDate.getTimezoneOffset() * 60000;
    const correctedEnd = new Date(endDate.getTime() + tzOffsetEnd);

    const endDay = correctedEnd.getDate();
    const endMonth = correctedEnd.toLocaleString('default', { month: 'long' });
    const endYear = correctedEnd.getFullYear();

    if (startMonth === endMonth && startYear === endYear) {
        return `${startDay} - ${endDay} ${startMonth}`;
    } else if (startYear === endYear) {
        return `${startDay} ${startMonth.substring(0, 3)} - ${endDay} ${endMonth.substring(0, 3)}`;
    } else {
        return `${startDay} ${startMonth.substring(0, 3)} ${startYear} - ${endDay} ${endMonth.substring(0, 3)} ${endYear}`;
    }
};

const CalendarManager = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [timeFilter, setTimeFilter] = useState('Upcoming');
    const [editingEvent, setEditingEvent] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        event_dates: '',
        event_name: '',
        slug: '',
        city: '',
        venue: '',
        address: '',
        sapa_status: 'None',
        description: '',
        start_date: '',
        end_date: '',
        start_time: '',
        end_time: '',
        organizer_name: 'SAPA',
        organizer_phone: '',
        organizer_email: '',
        organizer_website: '',
        image_url: '',
        featured_event: false,
        featured_result: false,
        is_league: false,
        tournament_tag: 'None',
        registered_players: 0,
        rankedin_url: '',
        featured_live: false,
        live_youtube_url: '',
        youtube_playlist_url: '',
        live_players: '',
        next_match: '',
        sponsor_logos: [],
        is_visible: true
    });

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('calendar')
                .select('*')
                .order('start_date', { ascending: true }) // Order by start_date 
                .order('id', { ascending: true }); // Fallback

            if (error) throw error;
            setEvents(data || []);
        } catch (error) {
            console.error('Error fetching events:', error);
            toast.error('Failed to load events');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;

        // Auto-generate slug from event name if slug is empty or user is typing name
        let newFormData = { ...formData, [name]: value };

        if (name === 'event_name' && !editingEvent) {
            const slug = value
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)+/g, '');
            newFormData.slug = slug;
        }

        if (e.target.type === 'checkbox') {
            newFormData[name] = e.target.checked;
        }

        setFormData(newFormData);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Ensure slug exists
            if (!formData.slug && formData.event_name) {
                formData.slug = formData.event_name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)+/g, '');
            }

            // Auto format event_dates based on start and end dates before saving
            formData.event_dates = formatEventDates(formData.start_date, formData.end_date);

            // Clean up empty strings for date/time columns to prevent Supabase type errors
            const payload = { ...formData };
            if (payload.start_date === '') payload.start_date = null;
            if (payload.end_date === '') payload.end_date = null;
            if (payload.start_time === '') payload.start_time = null;
            if (payload.end_time === '') payload.end_time = null;

            if (editingEvent) {
                // Update
                const { error } = await supabase
                    .from('calendar')
                    .update(payload)
                    .eq('id', editingEvent.id);

                if (error) throw error;
                toast.success('Event updated successfully');
            } else {
                // Create
                const { error } = await supabase
                    .from('calendar')
                    .insert([payload]);

                if (error) throw error;
                toast.success('Event created successfully');
            }

            // Reset and refetch
            setIsModalOpen(false);
            setEditingEvent(null);
            resetForm();
            fetchEvents();
        } catch (error) {
            console.error('Error saving event:', error);
            toast.error(`Failed to save event: ${error.message}`);
        }
    };

    const toggleVisibility = async (event) => {
        try {
            const newVisibility = !event.is_visible;
            const { error } = await supabase
                .from('calendar')
                .update({ is_visible: newVisibility })
                .eq('id', event.id);

            if (error) throw error;

            // Optimistic update
            setEvents(prev => prev.map(e => e.id === event.id ? { ...e, is_visible: newVisibility } : e));
            toast.success(`Event is now ${newVisibility ? 'visible' : 'hidden'}`);
        } catch (error) {
            console.error('Error toggling visibility:', error);
            toast.error('Failed to update visibility');
        }
    };

    const resetForm = () => {
        setFormData({
            event_dates: '',
            event_name: '',
            slug: '',
            city: '',
            venue: '',
            address: '',
            sapa_status: 'None',
            description: '',
            start_date: '',
            end_date: '',
            start_time: '',
            end_time: '',
            organizer_name: 'SAPA',
            organizer_phone: '',
            organizer_email: '',
            organizer_website: '',
            image_url: '',
            featured_event: false,
            featured_result: false,
            is_league: false,
            tournament_tag: 'None',
            registered_players: 0,
            rankedin_url: '',
            featured_live: false,
            live_youtube_url: '',
            youtube_playlist_url: '',
            live_players: '',
            next_match: '',
            sponsor_logos: [],
            is_visible: true
        });
    }

    const handleEdit = (event) => {
        setEditingEvent(event);
        setFormData({
            event_dates: event.event_dates || '',
            event_name: event.event_name || '',
            slug: event.slug || '',
            city: event.city || '',
            venue: event.venue || '',
            address: event.address || '',
            sapa_status: event.sapa_status || 'None',
            description: event.description || '',
            start_date: event.start_date ? event.start_date.substring(0, 10) : '',
            end_date: event.end_date ? event.end_date.substring(0, 10) : '',
            start_time: event.start_time || '',
            end_time: event.end_time || '',
            organizer_name: event.organizer_name || 'SAPA',
            organizer_phone: event.organizer_phone || '',
            organizer_email: event.organizer_email || '',
            organizer_website: event.organizer_website || '',
            image_url: event.image_url || '',
            featured_event: event.featured_event || false,
            featured_result: event.featured_result || false,
            is_league: event.is_league || false,
            tournament_tag: event.tournament_tag || 'None',
            registered_players: event.registered_players || 0,
            rankedin_url: event.rankedin_url || '',
            featured_live: event.featured_live || false,
            live_youtube_url: event.live_youtube_url || '',
            youtube_playlist_url: event.youtube_playlist_url || '',
            live_players: event.live_players || '',
            next_match: event.next_match || '',
            sponsor_logos: event.sponsor_logos || [],
            is_visible: event.is_visible !== false // Default to true if undefined
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this event?')) return;

        try {
            const { error } = await supabase
                .from('calendar')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Event deleted successfully');
            fetchEvents();
        } catch (error) {
            console.error('Error deleting event:', error);
            toast.error('Failed to delete event');
        }
    };

    const openNewModal = () => {
        setEditingEvent(null);
        resetForm();
        setIsModalOpen(true);
    };

    const handleSyncRankedin = async () => {
        setIsSyncing(true);
        toast.info('Starting RankedIn Sync...');

        try {
            const API_BASE = 'https://api.rankedin.com/v1';
            const SAPA_ORG_ID = '11331';

            // 1. Fetch from Rankedin (Both finished and upcoming)
            const [finishedRes, upcomingRes] = await Promise.all([
                fetch(`${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=true&Language=en&skip=0&take=100`),
                fetch(`${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=false&Language=en&skip=0&take=100`)
            ]);

            const finishedData = await finishedRes.json();
            const upcomingData = await upcomingRes.json();

            const allRankedinEvents = [
                ...(finishedData.payload || []),
                ...(upcomingData.payload || [])
            ];

            if (allRankedinEvents.length === 0) {
                toast.error('No events found from RankedIn.');
                setIsSyncing(false);
                return;
            }

            let currentProgress = 0;
            const totalToProcess = allRankedinEvents.length;
            let addedCount = 0;
            let updatedCount = 0;

            for (const re of allRankedinEvents) {
                currentProgress++;
                // Determine ID based on different possible RankedIn API response casing
                const rankedinIdStr = (re.eventId || re.Id || re.id)?.toString();
                if (!rankedinIdStr) continue;

                const evName = re.eventName || re.name || re.Name || '';
                const evLink = re.eventUrl || re.link || re.Link || '';
                const sDate = re.startDate || re.StartDate || '';
                const eDate = re.endDate || re.EndDate || sDate;
                const isLeague = re.type === 2;

                if (!evName) continue; // Skip truly blank events

                // Update toast with progress occasionally
                if (currentProgress % 5 === 0 || currentProgress === totalToProcess) {
                    toast.loading(`Syncing details: ${currentProgress}/${totalToProcess}...`, { id: 'sync-progress' });
                }

                // Build rankedin URL
                let fullUrl = '';
                const baseUrlPath = isLeague ? 'clubleague' : 'tournament';
                if (evLink) {
                    fullUrl = evLink.startsWith('http') ? evLink : `https://www.rankedin.com${evLink.startsWith('/') ? '' : '/'}${evLink}`;
                } else if (re.slug || re.Slug) {
                    fullUrl = `https://www.rankedin.com/en/${baseUrlPath}/${rankedinIdStr}/${re.slug || re.Slug}`;
                } else {
                    // Guess URL fallback
                    const guessedSlug = evName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                    fullUrl = `https://www.rankedin.com/en/${baseUrlPath}/${rankedinIdStr}/${guessedSlug}`;
                }

                // --- FETCH RICH DETAILS ---
                let richDetails = {};
                try {
                    const infoUrl = isLeague
                        ? `${API_BASE}/ClubLeague/GetClubleagueInfoAsync?id=${rankedinIdStr}&language=en`
                        : `${API_BASE}/tournament/GetInfoAsync?id=${rankedinIdStr}&language=en`;
                    const regUrl = isLeague
                        ? `${API_BASE}/ClubLeague/GetRegulationsAsync?id=${rankedinIdStr}`
                        : `${API_BASE}/tournament/GetRegulationsAsync?id=${rankedinIdStr}`;

                    const [infoRes, regRes] = await Promise.all([
                        fetch(infoUrl),
                        fetch(regUrl)
                    ]);

                    if (infoRes.ok) {
                        const infoData = await infoRes.json();
                        try {
                            let regText = regRes.ok ? await regRes.text() : '';
                            if (regText.startsWith('"')) regText = JSON.parse(regText);
                            richDetails.description = regText;
                        } catch (e) {
                            richDetails.description = '';
                        }

                        // Handle different key naming in different API types
                        const sidebar = infoData.TournamentSidebarModel || infoData.ClubleagueSidebarModel || infoData;
                        richDetails.address = sidebar.Address || sidebar.address || '';
                        richDetails.registered_players = sidebar.TotalUniquePersonsInTournament || sidebar.PlayersCount || 0;
                        richDetails.venue = sidebar.LocationName || sidebar.locationName || '';

                        // Extract images
                        const logosModel = infoData.EventLogosModel || infoData.ClubleagueLogosModel || infoData.Logos || infoData;
                        const logos = logosModel?.LogoUrls || logosModel?.logoUrls || [];
                        richDetails.sponsor_logos = logos;
                        richDetails.image_url = logosModel?.PosterUrl || logosModel?.posterUrl || (logos.length > 0 ? logos[0] : '');
                    }
                } catch (e) {
                    console.error(`Failed to fetch rich details for ${rankedinIdStr}:`, e);
                }

                // Try to find match in DB
                const matchById = events.find(e => e.rankedin_url && e.rankedin_url.includes(`/${rankedinIdStr}/`));

                // Enhanced matching logic for names that might be slightly different
                const normalizeValue = (str) => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
                const reNameNorm = normalizeValue(evName);

                const matchByName = events.find(e => {
                    if (!e.event_name) return false;
                    const eNameNorm = normalizeValue(e.event_name);
                    // Match if names are identical after removing spaces/punctuation
                    if (eNameNorm === reNameNorm) return true;
                    // Match if both contain "warren" and "pro" (specific catch for the KCC event)
                    if (eNameNorm.includes('warren') && eNameNorm.includes('pro') && reNameNorm.includes('warren') && reNameNorm.includes('pro')) return true;
                    // Match if the slug matches the guessed slug
                    if (e.slug && e.slug === (re.slug || re.Slug)) return true;
                    return false;
                });

                const existingEvent = matchById || matchByName;

                // Dates
                const formattedDates = formatEventDates(sDate, eDate);

                if (existingEvent) {
                    // Update missing or outdated fields safely
                    let updates = {};
                    let needsUpdate = false;

                    if (!existingEvent.rankedin_url || (existingEvent.rankedin_url !== fullUrl && !existingEvent.rankedin_url.includes(rankedinIdStr))) {
                        updates.rankedin_url = fullUrl;
                        needsUpdate = true;
                    }
                    const newSDate = sDate ? sDate.substring(0, 10) : null;
                    const newEDate = eDate ? eDate.substring(0, 10) : newSDate;

                    if (newSDate && existingEvent.start_date !== newSDate) {
                        updates.start_date = newSDate;
                        needsUpdate = true;
                    }
                    if (newEDate && existingEvent.end_date !== newEDate) {
                        updates.end_date = newEDate;
                        needsUpdate = true;
                    }
                    if (existingEvent.event_dates !== formattedDates && formattedDates !== '') {
                        updates.event_dates = formattedDates;
                        needsUpdate = true;
                    }

                    // Update rich details if available
                    if (richDetails.description && (existingEvent.description !== richDetails.description)) {
                        updates.description = richDetails.description;
                        needsUpdate = true;
                    }
                    if (richDetails.image_url && existingEvent.image_url !== richDetails.image_url) {
                        updates.image_url = richDetails.image_url;
                        needsUpdate = true;
                    }
                    if (richDetails.registered_players !== undefined && existingEvent.registered_players !== richDetails.registered_players) {
                        updates.registered_players = richDetails.registered_players;
                        needsUpdate = true;
                    }
                    if (richDetails.address !== undefined && existingEvent.address !== richDetails.address) {
                        updates.address = richDetails.address;
                        needsUpdate = true;
                    }
                    if (richDetails.venue !== undefined && existingEvent.venue !== richDetails.venue) {
                        updates.venue = richDetails.venue;
                        needsUpdate = true;
                    }
                    if (re.city !== undefined && existingEvent.city !== (re.city || '').trim()) {
                        updates.city = (re.city || '').trim();
                        needsUpdate = true;
                    }
                    if (richDetails.sponsor_logos && richDetails.sponsor_logos.length > 0) {
                        updates.sponsor_logos = richDetails.sponsor_logos;
                        needsUpdate = true;
                    }
                    // SMART UPDATES for manual fields:

                    // Only update is_league if it's true on RankedIn
                    // We don't want to overwrite a local manual 'true' with 'false'
                    if (isLeague && !existingEvent.is_league) {
                        updates.is_league = true;
                        needsUpdate = true;
                    }

                    // Inferred status based on name for suggestions
                    const nLower = evName.toLowerCase();
                    let inferredStatus = 'None';
                    if (nLower.includes('fip')) inferredStatus = 'FIP event';
                    else if (nLower.includes('super gold') || nLower.includes('s gold') || nLower.includes('sgold')) inferredStatus = 'Super Gold';
                    else if (nLower.includes('major')) inferredStatus = 'Major';
                    else if (nLower.includes('gold')) inferredStatus = 'Gold';
                    else if (nLower.includes('bronze')) inferredStatus = 'Bronze';
                    else if (nLower.includes('key')) inferredStatus = 'Key Event';

                    // Only update sapa_status if it's currently None, null, or empty
                    if ((!existingEvent.sapa_status || existingEvent.sapa_status === 'None' || existingEvent.sapa_status === '') && inferredStatus !== 'None') {
                        updates.sapa_status = inferredStatus;
                        needsUpdate = true;
                    }

                    if (needsUpdate) {
                        await supabase.from('calendar').update(updates).eq('id', existingEvent.id);
                        updatedCount++;
                    }
                } else {
                    // Insert new
                    const nLower = evName.toLowerCase();
                    let inferredStatus = 'Silver';
                    if (nLower.includes('fip')) inferredStatus = 'FIP event';
                    else if (nLower.includes('super gold') || nLower.includes('s gold') || nLower.includes('sgold')) inferredStatus = 'Super Gold';
                    else if (nLower.includes('major')) inferredStatus = 'Major';
                    else if (nLower.includes('gold')) inferredStatus = 'Gold';
                    else if (nLower.includes('key')) inferredStatus = 'Key Event';

                    const slugValue = nLower.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

                    await supabase.from('calendar').insert([{
                        event_name: evName,
                        slug: slugValue,
                        event_dates: formattedDates,
                        start_date: sDate ? sDate.substring(0, 10) : null,
                        end_date: eDate ? eDate.substring(0, 10) : null,
                        sapa_status: inferredStatus,
                        organizer_name: 'SAPA',
                        rankedin_url: fullUrl,
                        city: (re.city || '').trim(),
                        venue: richDetails.venue || re.club || '',
                        description: richDetails.description || '',
                        image_url: richDetails.image_url || '',
                        registered_players: richDetails.registered_players || 0,
                        address: richDetails.address || '',
                        sponsor_logos: richDetails.sponsor_logos || [],
                        is_league: isLeague,
                        featured_live: false,
                        live_youtube_url: '',
                        youtube_playlist_url: '',
                        is_visible: true
                    }]);
                    addedCount++;
                }
            }

            toast.dismiss('sync-progress');
            toast.success(`Sync complete! Added: ${addedCount}, Updated: ${updatedCount}`);
            fetchEvents();
        } catch (error) {
            console.error('Sync error:', error);
            toast.dismiss('sync-progress');
            toast.error(`Sync failed: ${error.message}`);
        } finally {
            setIsSyncing(false);
        }
    };

    // --- Derived State for Stats & Charts ---
    const today = new Date().toISOString().split('T')[0];

    const stats = useMemo(() => {
        const upcoming = events.filter(e => !e.start_date || e.start_date >= today).length;
        const past = events.length - upcoming;
        const featured = events.filter(e => e.featured_event).length;
        const live = events.filter(e => e.featured_live).length;
        return {
            total: events.length,
            upcoming,
            past,
            featured,
            live
        };
    }, [events, today]);

    const statusChartData = useMemo(() => {
        const map = {};
        events.forEach(e => {
            const status = e.sapa_status || 'None';
            map[status] = (map[status] || 0) + 1;
        });
        const colors = {
            'Major': '#a855f7',
            'Gold': '#eab308',
            'Super Gold': '#f59e0b',
            'S Gold': '#f59e0b',
            'Silver': '#94a3b8',
            'Bronze': '#c2410c',
            'Key Event': '#22c55e',
            'FIP event': '#3b82f6',
        };
        return Object.entries(map).map(([name, value]) => ({
            name,
            value,
            color: colors[name] || '#beff00'
        })).sort((a, b) => b.value - a.value);
    }, [events]);

    const monthChartData = useMemo(() => {
        const map = {};
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        events.forEach(e => {
            if (e.start_date) {
                const date = new Date(e.start_date);
                const month = months[date.getMonth()];
                map[month] = (map[month] || 0) + 1;
            }
        });
        return months.map(month => ({ month, count: map[month] || 0 }));
    }, [events]);

    const filteredEvents = useMemo(() => {
        return events.filter(event => {
            const matchesSearch = event.event_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                event.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
                event.venue.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'All' || event.sapa_status === statusFilter;

            const isUpcoming = !event.start_date || event.start_date >= today;
            const matchesTime = timeFilter === 'All' ||
                (timeFilter === 'Upcoming' && isUpcoming) ||
                (timeFilter === 'Past' && !isUpcoming);

            return matchesSearch && matchesStatus && matchesTime;
        });
    }, [events, searchTerm, statusFilter, timeFilter, today]);

    const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);

    const paginatedEvents = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredEvents.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredEvents, currentPage]);

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, timeFilter]);

    return (
        <div className="space-y-8 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Calendar Dashboard</h2>
                    <p className="text-gray-400 text-sm">Manage upcoming tournaments, leagues, and SAPA events</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSyncRankedin}
                        disabled={isSyncing}
                        className={`bg-[#1E293B] text-white border border-white/20 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-white/10 transition-colors ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                        {isSyncing ? 'Syncing...' : 'Sync from RankedIn'}
                    </button>
                    <button
                        onClick={openNewModal}
                        className="bg-padel-green text-black px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-white transition-colors"
                    >
                        <Plus size={18} /> Add Event
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard title="Total" value={loading ? '—' : stats.total} subtext="Events" icon={CalendarDays} color="padel-green" delay={0} />
                <StatCard title="Upcoming" value={loading ? '—' : stats.upcoming} subtext="Scheduled" icon={Flag} color="green" delay={0.05} />
                <StatCard title="Featured" value={loading ? '—' : stats.featured} subtext="On Hero" icon={Star} color="amber" delay={0.1} />
                <StatCard title="Live" value={loading ? '—' : stats.live} subtext="Featured Live" icon={PlayCircle} color="purple" delay={0.15} />
                <StatCard title="Past" value={loading ? '—' : stats.past} subtext="Completed" icon={MapPin} color="slate" delay={0.2} />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 flex flex-col"
                >
                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Events by Status</h3>
                    {loading ? (
                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie data={statusChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                                    {statusChartData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 flex flex-col"
                >
                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Events by Month (Current Year)</h3>
                    {loading ? (
                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={monthChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                                <Bar dataKey="count" fill="#beff00" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search events by name, city, or venue..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 pl-12 text-white focus:border-padel-green focus:outline-none"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-padel-green focus:outline-none cursor-pointer"
                >
                    <option value="All">All Statuses</option>
                    <option value="Gold">Gold</option>
                    <option value="Major">Major</option>
                    <option value="Silver">Silver</option>
                    <option value="Bronze">Bronze</option>
                    <option value="Key Event">Key Event</option>
                    <option value="FIP event">FIP event</option>
                    <option value="Super Gold">Super Gold</option>
                    <option value="None">None</option>
                </select>
                <select
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-padel-green focus:outline-none cursor-pointer"
                >
                    <option value="All">All Time</option>
                    <option value="Upcoming">Upcoming</option>
                    <option value="Past">Past Events</option>
                </select>
            </div>

            {/* Events Table Container */}
            <div className="bg-[#1E293B]/30 rounded-2xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/50 text-gray-400 border-b border-white/10">
                                <th className="py-3 px-4 font-semibold text-xs uppercase w-48">Dates</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase min-w-[200px]">Event Name</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase">Location</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase">Status</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase text-center text-gray-500" title="League">L</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase text-center text-gray-500" title="Homepage Featured">★</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase text-center text-gray-500" title="Live Event Featured">📺</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase text-center text-gray-500" title="Recent Results Featured">🏆</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase text-center text-gray-500" title="Visible on Website">👁️</th>
                                <th className="py-3 px-4 text-right font-semibold text-xs uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="7" className="text-center py-12 text-gray-500">Loading events...</td></tr>
                            ) : filteredEvents.length === 0 ? (
                                <tr><td colSpan="7" className="text-center py-12 text-gray-500">No events found.</td></tr>
                            ) : (
                                paginatedEvents.map(event => (
                                    <tr key={event.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                        <td className="py-3 px-4 align-top">
                                            <div className="font-bold text-padel-green text-sm">{event.event_dates}</div>
                                            {event.start_date && <div className="text-[10px] text-gray-500 mt-0.5">{event.start_date}</div>}
                                        </td>
                                        <td className="py-3 px-4 align-top">
                                            <div className="font-bold text-white line-clamp-2" title={event.event_name}>{event.event_name}</div>
                                            {event.organizer_name && <div className="text-xs text-gray-500 mt-1">by {event.organizer_name}</div>}
                                        </td>
                                        <td className="py-3 px-4 align-top">
                                            <div className="font-medium text-gray-300 text-sm truncate max-w-[150px]">{event.city}</div>
                                            <div className="text-[10px] text-gray-500 uppercase tracking-wider truncate max-w-[150px] mt-0.5">{event.venue}</div>
                                        </td>
                                        <td className="py-3 px-4 align-middle">
                                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap inline-block
                                                ${event.sapa_status === 'Major' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                                    event.sapa_status === 'Gold' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                                        (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                            event.sapa_status === 'Silver' ? 'bg-gray-500/10 text-gray-300 border-gray-500/20' :
                                                                event.sapa_status === 'Bronze' ? 'bg-orange-700/10 text-orange-500 border-orange-700/20' :
                                                                    'bg-padel-green/10 text-padel-green border-padel-green/20'}`}>
                                                {event.sapa_status || 'Event'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 align-middle text-center">
                                            {event.is_league ? (
                                                <span className="inline-flex w-5 h-5 items-center justify-center bg-blue-500/20 text-blue-400 rounded-sm text-xs font-bold" title="League Event">L</span>
                                            ) : (
                                                <span className="text-gray-600">—</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 align-middle text-center">
                                            {event.featured_event ? (
                                                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 mx-auto" title="Featured Event" />
                                            ) : (
                                                <Star className="w-4 h-4 text-gray-600 mx-auto" />
                                            )}
                                        </td>
                                        <td className="py-3 px-4 align-middle text-center">
                                            {event.featured_live ? (
                                                <PlayCircle className="w-4 h-4 text-purple-400 fill-purple-400/20 mx-auto" title="Live Featured" />
                                            ) : (
                                                <PlayCircle className="w-4 h-4 text-gray-600 mx-auto" />
                                            )}
                                        </td>
                                        <td className="py-3 px-4 align-middle text-center">
                                            {event.featured_result ? (
                                                <Trophy className="w-4 h-4 text-padel-green fill-padel-green/20 mx-auto" title="Featured Result" />
                                            ) : (
                                                <Trophy className="w-4 h-4 text-gray-600 mx-auto" />
                                            )}
                                        </td>
                                        <td className="py-3 px-4 align-middle text-center">
                                            <button
                                                onClick={() => toggleVisibility(event)}
                                                className={`p-1 rounded-md transition-colors ${event.is_visible !== false ? 'text-padel-green bg-padel-green/10' : 'text-gray-600 hover:text-gray-400'}`}
                                                title={event.is_visible !== false ? 'Visible - click to hide' : 'Hidden - click to show'}
                                            >
                                                {event.is_visible !== false ? (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.046m4.596-4.596A9.964 9.964 0 0112 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" /></svg>
                                                )}
                                            </button>
                                        </td>
                                        <td className="py-3 px-4 align-middle text-right">
                                            <div className="flex justify-end gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEdit(event)}
                                                    className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500 hover:text-white"
                                                    title="Edit Event"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(event.id)}
                                                    className="p-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500 hover:text-white"
                                                    title="Delete Event"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#1E293B]/30 p-4 rounded-2xl border border-white/10">
                    <p className="text-sm text-gray-400">
                        Showing <span className="text-white font-bold">{Math.min((currentPage - 1) * itemsPerPage + 1, filteredEvents.length)}</span> to <span className="text-white font-bold">{Math.min(currentPage * itemsPerPage, filteredEvents.length)}</span> of <span className="text-white font-bold">{filteredEvents.length}</span> events
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                            title="Previous Page"
                        >
                            <ChevronLeft size={18} />
                        </button>

                        <div className="flex items-center gap-1 mx-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                .map((p, i, arr) => (
                                    <React.Fragment key={p}>
                                        {i > 0 && arr[i - 1] !== p - 1 && <span className="text-gray-500 px-1">...</span>}
                                        <button
                                            onClick={() => setCurrentPage(p)}
                                            className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors ${currentPage === p
                                                ? 'bg-padel-green text-black'
                                                : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                                                }`}
                                        >
                                            {p}
                                        </button>
                                    </React.Fragment>
                                ))
                            }
                        </div>

                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                            title="Next Page"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Edit/Create Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1100]"
                            onClick={() => setIsModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed inset-0 z-[1100] flex items-center justify-center pointer-events-none p-4"
                        >
                            <div className="bg-[#1E293B] w-full max-w-4xl rounded-2xl border border-white/10 shadow-2xl pointer-events-auto p-6 max-h-[90vh] overflow-y-auto">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-bold text-white">
                                        {editingEvent ? 'Edit Event' : 'Add New Event'}
                                    </h3>
                                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-6">
                                    {/* Basic Info */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Event Name</label>
                                            <input
                                                type="text"
                                                name="event_name"
                                                required
                                                value={formData.event_name}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Slug (URL)</label>
                                            <input
                                                type="text"
                                                name="slug"
                                                value={formData.slug}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">SAPA Status</label>
                                            <select
                                                name="sapa_status"
                                                value={formData.sapa_status}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            >
                                                <option value="None">None</option>
                                                <option value="Gold">Gold</option>
                                                <option value="Major">Major</option>
                                                <option value="Silver">Silver</option>
                                                <option value="Bronze">Bronze</option>
                                                <option value="Key Event">Key Event</option>
                                                <option value="FIP event">FIP event</option>
                                                <option value="Super Gold">Super Gold</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Featured & League Toggles */}
                                    <div className="flex flex-wrap gap-6">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="featured_event"
                                                name="featured_event"
                                                checked={formData.featured_event}
                                                onChange={handleInputChange}
                                                className="w-5 h-5 rounded border-white/10 bg-black/40 text-padel-green focus:ring-padel-green"
                                            />
                                            <label htmlFor="featured_event" className="text-sm font-bold text-white uppercase cursor-pointer">
                                                Feature Event
                                            </label>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="is_visible"
                                                name="is_visible"
                                                checked={formData.is_visible}
                                                onChange={handleInputChange}
                                                className="w-5 h-5 rounded border-white/10 bg-black/40 text-padel-green focus:ring-padel-green"
                                            />
                                            <label htmlFor="is_visible" className="text-sm font-bold text-white uppercase cursor-pointer">
                                                Visible on Website
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="featured_result"
                                                name="featured_result"
                                                checked={formData.featured_result}
                                                onChange={handleInputChange}
                                                className="w-5 h-5 rounded border-white/10 bg-black/40 text-padel-green focus:ring-padel-green"
                                            />
                                            <label htmlFor="featured_result" className="text-sm font-bold text-white uppercase cursor-pointer">
                                                Show in Recent Results
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="featured_live"
                                                name="featured_live"
                                                checked={formData.featured_live}
                                                onChange={handleInputChange}
                                                className="w-5 h-5 rounded border-white/10 bg-black/40 text-purple-500 focus:ring-purple-500"
                                            />
                                            <label htmlFor="featured_live" className="text-sm font-bold text-white uppercase cursor-pointer">
                                                Featured Live
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="is_league"
                                                name="is_league"
                                                checked={formData.is_league}
                                                onChange={handleInputChange}
                                                className="w-5 h-5 rounded border-white/10 bg-black/40 text-blue-400 focus:ring-blue-400"
                                            />
                                            <label htmlFor="is_league" className="text-sm font-bold text-white uppercase cursor-pointer">
                                                League Event
                                            </label>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Tournament Tag</label>
                                        <select
                                            name="tournament_tag"
                                            value={formData.tournament_tag}
                                            onChange={handleInputChange}
                                            className="w-full max-w-[200px] bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                        >
                                            <option value="None">None</option>
                                            <option value="Broll">Broll</option>
                                            <option value="360 Padel">360 Padel</option>
                                            <option value="SA Grand">SA Grand</option>

                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Registered Players</label>
                                        <input
                                            type="number"
                                            name="registered_players"
                                            value={formData.registered_players}
                                            onChange={handleInputChange}
                                            className="w-full max-w-[200px] bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Sponsor Logos (Comma Separated URLs)</label>
                                        <textarea
                                            name="sponsor_logos"
                                            value={formData.sponsor_logos?.join(', ')}
                                            onChange={(e) => setFormData({ ...formData, sponsor_logos: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                            placeholder="https://logo1.png, https://logo2.png..."
                                            rows={2}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Rankedin Tournament URL</label>
                                        <input
                                            type="url"
                                            name="rankedin_url"
                                            value={formData.rankedin_url}
                                            onChange={handleInputChange}
                                            placeholder="https://www.rankedin.com/en/tournament/..."
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                        />
                                    </div>

                                    {formData.featured_live && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="space-y-4"
                                        >
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-purple-400 mb-1 uppercase italic">Current Players / Match</label>
                                                    <input
                                                        type="text"
                                                        name="live_players"
                                                        value={formData.live_players}
                                                        onChange={handleInputChange}
                                                        placeholder="e.g. Player 1 vs Player 2"
                                                        className="w-full bg-black/40 border border-purple-500/30 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none placeholder:text-gray-600"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-purple-400 mb-1 uppercase italic">Up Next / Following Match</label>
                                                    <input
                                                        type="text"
                                                        name="next_match"
                                                        value={formData.next_match}
                                                        onChange={handleInputChange}
                                                        placeholder="e.g. Player 3 vs Player 4"
                                                        className="w-full bg-black/40 border border-purple-500/30 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none placeholder:text-gray-600"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-purple-400 mb-1 uppercase italic">YouTube Live Stream URL (For "Watch Live" Button)</label>
                                                <input
                                                    type="url"
                                                    name="live_youtube_url"
                                                    value={formData.live_youtube_url}
                                                    onChange={handleInputChange}
                                                    placeholder="https://www.youtube.com/watch?v=..."
                                                    className="w-full bg-black/40 border border-purple-500/30 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                                                />
                                            </div>
                                        </motion.div>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">YouTube Playlist URL (For Highlights/Videos)</label>
                                        <input
                                            type="url"
                                            name="youtube_playlist_url"
                                            value={formData.youtube_playlist_url}
                                            onChange={handleInputChange}
                                            placeholder="https://www.youtube.com/playlist?list=..."
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                        />
                                    </div>

                                    {/* Date & Time */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-padel-green mb-1 uppercase">Start Date</label>
                                            <input
                                                type="date"
                                                name="start_date"
                                                required
                                                value={formData.start_date}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-padel-green/50 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-padel-green mb-1 uppercase">End Date</label>
                                            <input
                                                type="date"
                                                name="end_date"
                                                required
                                                value={formData.end_date}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-padel-green/50 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Start Time</label>
                                            <input
                                                type="time"
                                                name="start_time"
                                                value={formData.start_time}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none [color-scheme:dark]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">End Time</label>
                                            <input
                                                type="time"
                                                name="end_time"
                                                value={formData.end_time}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none [color-scheme:dark]"
                                            />
                                        </div>
                                    </div>

                                    {/* Location */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">City</label>
                                            <input
                                                type="text"
                                                name="city"
                                                required
                                                value={formData.city}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Venue Name</label>
                                            <input
                                                type="text"
                                                name="venue"
                                                required
                                                value={formData.venue}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Full Address</label>
                                            <input
                                                type="text"
                                                name="address"
                                                placeholder="Full street address"
                                                value={formData.address}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Details & Image */}
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Description</label>
                                            <textarea
                                                name="description"
                                                rows="3"
                                                value={formData.description}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none resize-none"
                                            ></textarea>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Hero Image URL</label>
                                            <div className="flex gap-2">
                                                <div className="flex-1">
                                                    <input
                                                        type="text"
                                                        name="image_url"
                                                        placeholder="https://..."
                                                        value={formData.image_url}
                                                        onChange={handleInputChange}
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                                    />
                                                </div>
                                                <div className="w-12 h-12 bg-black/40 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden">
                                                    {formData.image_url ? (
                                                        <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <ImageIcon className="text-gray-600" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Organizer Info */}
                                    <div className="border-t border-white/10 pt-4">
                                        <h4 className="text-sm font-bold text-gray-300 mb-3 uppercase">Organizer Details</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Organizer Name</label>
                                                <input
                                                    type="text"
                                                    name="organizer_name"
                                                    value={formData.organizer_name}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Phone</label>
                                                <input
                                                    type="text"
                                                    name="organizer_phone"
                                                    value={formData.organizer_phone}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Email</label>
                                                <input
                                                    type="text"
                                                    name="organizer_email"
                                                    value={formData.organizer_email}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Website</label>
                                                <input
                                                    type="text"
                                                    name="organizer_website"
                                                    value={formData.organizer_website}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-[#1E293B] pb-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsModalOpen(false)}
                                            className="px-4 py-2 rounded-xl font-bold text-gray-400 hover:bg-white/5"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-6 py-2 rounded-xl font-bold bg-padel-green text-black hover:bg-white transition-colors flex items-center gap-2"
                                        >
                                            <Save className="w-4 h-4" />
                                            Save Event
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CalendarManager;
