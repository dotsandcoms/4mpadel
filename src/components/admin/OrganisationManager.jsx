import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { sendEmail } from '../../utils/emails';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    Building, Users, Trophy, DollarSign, Calendar, Plus, Check, X,
    AlertCircle, RefreshCw, Mail, Phone, Edit3, Trash2, ArrowLeft,
    ShieldCheck, CheckCircle2, ChevronRight, MessageSquare, Globe, PlusCircle, HelpCircle,
    ChevronDown, Eye, Edit, ExternalLink
} from 'lucide-react';
import RichTextEditor from './RichTextEditor';

const OrganisationManager = ({ permissions }) => {
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('overview'); // overview, create-event, my-events
    const [orgEvents, setOrgEvents] = useState([]);

    // Super Admin oversight states
    const [allOrgs, setAllOrgs] = useState([]);
    const [pendingEvents, setPendingEvents] = useState([]);
    const [stats, setStats] = useState({
        totalOrgs: 0,
        approvedOrgs: 0,
        pendingOrgs: 0,
        totalEvents: 0,
        totalRevenue: 0
    });

    // Rejection notes modal states
    const [rejectionModal, setRejectionModal] = useState({
        isOpen: false,
        type: '', // 'org' or 'event'
        targetId: null,
        targetEmail: '',
        targetName: '',
        notes: ''
    });

    // Details preview and edit modes states
    const [selectedEventDetails, setSelectedEventDetails] = useState(null);
    const [selectedOrgDetails, setSelectedOrgDetails] = useState(null);
    const [editingEventId, setEditingEventId] = useState(null);
    const [approvedEvents, setApprovedEvents] = useState([]);
    const [approvedEventsSearch, setApprovedEventsSearch] = useState('');

    // Telemetry State Hooks for Tournament Entries & Breakdown Modal
    const [selectedEventEntries, setSelectedEventEntries] = useState(null);
    const [eventEntriesList, setEventEntriesList] = useState([]);
    const [isLoadingEntries, setIsLoadingEntries] = useState(false);
    const [entriesSearchQuery, setEntriesSearchQuery] = useState('');
    const [entriesDivisionFilter, setEntriesDivisionFilter] = useState('all');
    // Live participant counts per event (keyed by event id)
    const [participantCounts, setParticipantCounts] = useState({});

    // Create event state
    const SYSTEM_DIVISIONS = [
        "Men's Open (Pro/Elite)",
        "Men's Advanced",
        "Men's Intermediate",
        "Ladies Open (Pro/Elite)",
        "Ladies Advanced",
        "Ladies Intermediate"
    ];

    const [eventWizardStep, setEventWizardStep] = useState(1);
    const [newEventData, setNewEventData] = useState({
        event_name: '',
        city: '',
        venue: '',
        address: '',
        description: '',
        start_date: '',
        end_date: '',
        start_time: '08:00',
        end_time: '18:00',
        entry_fee: '350',
        sapa_status: 'Silver', // Tier requested
        is_league: false,
        tournament_type: 'Single Elimination',
        registration_deadline: '',
        golden_point: true,
        courts_count: 4,
        allowed_divisions: [...SYSTEM_DIVISIONS],
        max_teams_capacity: 16,
        partner_requirement: 'Required',
        category_fees: {},
        court_map_link: '',
        image_url: '',
        sponsor_logos: [],
        tournament_director_name: '',
        tournament_director_phone: '',
        tournament_director_email: '',
        indoor_outdoor: 'Outdoor',
        court_labels: '',
        prize_money_breakdown: '',
        sponsors_names: '',
        balls_to_be_used: 'Head Tour',
        licences_required: false,
        licence_types: '',
        max_ranking_points: '',
        back_draw_options: 'Plate Included',
        event_co_admins: '',
        additional_notes: ''
    });
    const [isCreatingEvent, setIsCreatingEvent] = useState(false);

    const getTierBadgeClass = (status) => {
        const tier = status || 'Silver';
        switch (tier) {
            case 'Major':
                return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
            case 'Super Gold':
            case 'S Gold':
                return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
            case 'Gold':
                return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
            case 'Silver':
                return 'bg-gray-500/10 text-gray-300 border border-gray-500/20';
            case 'Bronze':
                return 'bg-orange-700/20 text-orange-400 border border-orange-700/30';
            default:
                return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
        }
    };

    // Media upload states & handler functions
    const [isUploadingPoster, setIsUploadingPoster] = useState(false);
    const [isUploadingSponsors, setIsUploadingSponsors] = useState(false);

    const handlePosterUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingPoster(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_poster.${fileExt}`;
            const filePath = `posters/${fileName}`;

            const { data, error } = await supabase.storage
                .from('tournament-media')
                .upload(filePath, file, { cacheControl: '3600', upsert: false });

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from('tournament-media')
                .getPublicUrl(filePath);

            setNewEventData(prev => ({ ...prev, image_url: publicUrl }));
            toast.success('Tournament poster uploaded successfully! 🖼️');
        } catch (err) {
            console.error('Poster upload failed:', err);
            toast.error(`Poster upload failed: ${err.message}`);
        } finally {
            setIsUploadingPoster(false);
        }
    };

    const handleSponsorUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsUploadingSponsors(true);
        try {
            const uploadedUrls = [];
            for (const file of files) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
                const filePath = `sponsors/${fileName}`;

                const { error } = await supabase.storage
                    .from('tournament-media')
                    .upload(filePath, file, { cacheControl: '3600', upsert: false });

                if (error) throw error;

                const { data: { publicUrl } } = supabase.storage
                    .from('tournament-media')
                    .getPublicUrl(filePath);

                uploadedUrls.push(publicUrl);
            }

            setNewEventData(prev => ({
                ...prev,
                sponsor_logos: [...(prev.sponsor_logos || []), ...uploadedUrls]
            }));
            toast.success(`Uploaded ${files.length} sponsor logo(s)! 🚀`);
        } catch (err) {
            console.error('Sponsor upload failed:', err);
            toast.error(`Sponsor upload failed: ${err.message}`);
        } finally {
            setIsUploadingSponsors(false);
        }
    };

    const handleRemoveSponsor = (indexToRemove) => {
        setNewEventData(prev => ({
            ...prev,
            sponsor_logos: prev.sponsor_logos.filter((_, idx) => idx !== indexToRemove)
        }));
    };

    // Address geocoding autocomplete states
    const [addressResults, setAddressResults] = useState([]);
    const [isSearchingAddress, setIsSearchingAddress] = useState(false);
    const [showAddressDropdown, setShowAddressDropdown] = useState(false);

    useEffect(() => {
        const handleOutsideClick = (e) => {
            if (!e.target.closest('.relative')) {
                setShowAddressDropdown(false);
            }
        };
        document.addEventListener('click', handleOutsideClick);
        return () => document.removeEventListener('click', handleOutsideClick);
    }, []);

    const handleAddressSearchChange = async (query) => {
        setNewEventData(prev => ({ ...prev, address: query }));
        if (!query.trim() || query.length < 3) {
            setAddressResults([]);
            setShowAddressDropdown(false);
            return;
        }

        setIsSearchingAddress(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5&countrycodes=za`, {
                headers: {
                    'User-Agent': '4M-Padel-Tournament-Manager-System'
                }
            });
            const data = await res.json();
            setAddressResults(data || []);
            setShowAddressDropdown(true);
        } catch (err) {
            console.error('Failed to geocode address:', err);
        } finally {
            setIsSearchingAddress(false);
        }
    };

    const handleSelectAddress = (item) => {
        const fullAddress = item.display_name;
        const addr = item.address || {};
        const extractedCity = addr.city || addr.town || addr.village || addr.suburb || addr.municipality || addr.county || '';
        const extractedVenue = item.name !== addr.road && item.name !== addr.house_number ? item.name : '';
        const mapLink = `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}`;

        setNewEventData(prev => ({
            ...prev,
            address: fullAddress,
            city: extractedCity ? extractedCity : prev.city,
            venue: extractedVenue ? extractedVenue : prev.venue,
            court_map_link: mapLink
        }));

        setShowAddressDropdown(false);
    };

    // Derived flags
    const isSuperAdmin = permissions?.role === 'super_admin';
    const currentOrg = permissions?.org; // Available if role === 'org_owner'

    const [localOrgState, setLocalOrgState] = useState(null);
    const [isSavingOrgSettings, setIsSavingOrgSettings] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [orgSettingsForm, setOrgSettingsForm] = useState({
        name: '',
        contact_email: '',
        contact_phone: '',
        logo_url: '',
        website_url: ''
    });

    useEffect(() => {
        if (currentOrg) {
            setLocalOrgState(currentOrg);
        }
    }, [currentOrg]);

    useEffect(() => {
        if (localOrgState) {
            setOrgSettingsForm({
                name: localOrgState.name || '',
                contact_email: localOrgState.contact_email || '',
                contact_phone: localOrgState.contact_phone || '',
                logo_url: localOrgState.logo_url || '',
                website_url: localOrgState.website_url || ''
            });
        }
    }, [localOrgState]);

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            return toast.error('Logo file size must be less than 2MB.');
        }

        setIsUploadingLogo(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `logo_${Date.now()}.${fileExt}`;
            const filePath = `organizations/logos/${fileName}`;

            let { error: uploadError } = await supabase.storage
                .from('profile-pics')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from('profile-pics')
                .getPublicUrl(filePath);

            if (publicUrlData) {
                setOrgSettingsForm(prev => ({ ...prev, logo_url: publicUrlData.publicUrl }));
                toast.success('Logo uploaded successfully! 🎨');
            }
        } catch (err) {
            console.error('Logo upload failed:', err);
            toast.error(`Logo upload failed: ${err.message}`);
        } finally {
            setIsUploadingLogo(false);
        }
    };

    const handleSaveOrgSettings = async (e) => {
        e.preventDefault();
        if (!orgSettingsForm.name.trim()) return toast.error('Club name is required.');
        if (!orgSettingsForm.contact_email.trim()) return toast.error('Contact email is required.');

        setIsSavingOrgSettings(true);
        try {
            const { data, error } = await supabase
                .from('organizations')
                .update({
                    name: orgSettingsForm.name.trim(),
                    contact_email: orgSettingsForm.contact_email.trim(),
                    contact_phone: orgSettingsForm.contact_phone.trim(),
                    logo_url: orgSettingsForm.logo_url,
                    website_url: orgSettingsForm.website_url.trim()
                })
                .eq('id', localOrgState.id)
                .select();

            if (error) throw error;

            if (!data || data.length === 0) {
                throw new Error('Permission denied. Please ensure your organization is approved, your RLS update policies are fully applied, and you are the owner.');
            }

            const updatedOrg = data[0];
            setLocalOrgState(updatedOrg);

            // Sync currentOrg so changes propagate instantly
            if (permissions?.org) {
                permissions.org.name = updatedOrg.name;
                permissions.org.contact_email = updatedOrg.contact_email;
                permissions.org.contact_phone = updatedOrg.contact_phone;
                permissions.org.logo_url = updatedOrg.logo_url;
                permissions.org.website_url = updatedOrg.website_url;
            }

            toast.success('Organisation settings updated successfully! 🎾');
        } catch (err) {
            console.error('Failed to update organisation settings:', err);
            toast.error(`Settings update failed: ${err.message}`);
        } finally {
            setIsSavingOrgSettings(false);
        }
    };

    const fetchHostData = async () => {
        if (!currentOrg) return;
        setLoading(true);
        try {
            const { data: events, error } = await supabase
                .from('calendar')
                .select('*')
                .eq('organization_id', currentOrg.id)
                .order('start_date', { ascending: false });

            if (error) throw error;
            const evList = events || [];
            setOrgEvents(evList);

            // Fetch live participant counts from tournament_participants for each event
            if (evList.length > 0) {
                const eventIds = evList.map(e => e.id);
                const { data: countRows } = await supabase
                    .from('tournament_participants')
                    .select('event_id')
                    .in('event_id', eventIds);

                const counts = {};
                (countRows || []).forEach(r => {
                    counts[r.event_id] = (counts[r.event_id] || 0) + 1;
                });
                setParticipantCounts(prev => ({ ...prev, ...counts }));
            }
        } catch (err) {
            console.error('Failed to fetch host events:', err);
            toast.error('Error loading tournament lists.');
        } finally {
            setLoading(false);
        }
    };

    const fetchSuperAdminData = async () => {
        setLoading(true);
        try {
            // 1. Fetch all organizations
            const { data: orgs, error: orgsError } = await supabase
                .from('organizations')
                .select('*, players!created_by(name)')
                .order('created_at', { ascending: false });

            if (orgsError) throw orgsError;
            setAllOrgs(orgs || []);

            // 2. Fetch all events pending sanctioning
            const { data: events, error: eventsError } = await supabase
                .from('calendar')
                .select('*, organizations(name, contact_email)')
                .eq('sanction_status', 'pending')
                .order('id', { ascending: false });

            if (eventsError) throw eventsError;
            setPendingEvents(events || []);

            // 2.5 Fetch all approved events
            const { data: approvedEvs, error: approvedEvsError } = await supabase
                .from('calendar')
                .select('*, organizations(name, contact_email)')
                .eq('sanction_status', 'approved')
                .order('id', { ascending: false });

            if (approvedEvsError) throw approvedEvsError;
            setApprovedEvents(approvedEvs || []);

            // Fetch live participant counts for all calendar events
            const allEventIds = [
                ...(events || []).map(e => e.id),
                ...(approvedEvs || []).map(e => e.id)
            ].filter(Boolean);

            if (allEventIds.length > 0) {
                const { data: countRows } = await supabase
                    .from('tournament_participants')
                    .select('event_id')
                    .in('event_id', allEventIds);

                const counts = {};
                (countRows || []).forEach(r => {
                    counts[r.event_id] = (counts[r.event_id] || 0) + 1;
                });
                setParticipantCounts(counts);
            }

            // 3. Aggregate Stats
            const { data: allCalendarEvents } = await supabase
                .from('calendar')
                .select('id, entry_fee, registered_players');

            const totalRevenue = (allCalendarEvents || []).reduce((sum, ev) => {
                const fee = parseFloat(ev.entry_fee) || 0;
                const players = parseInt(ev.registered_players) || 0;
                return sum + (fee * players);
            }, 0);

            setStats({
                totalOrgs: orgs?.length || 0,
                approvedOrgs: orgs?.filter(o => o.status === 'approved').length || 0,
                pendingOrgs: orgs?.filter(o => o.status === 'pending').length || 0,
                totalEvents: allCalendarEvents?.length || 0,
                totalRevenue
            });

        } catch (err) {
            console.error('Failed to fetch admin data:', err);
            toast.error('Error loading oversight panels.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isSuperAdmin) {
            fetchSuperAdminData();
        } else {
            fetchHostData();
        }
    }, [permissions]);

    // Fetch Tournament Entries Telemetry when selectedEventEntries becomes active
    useEffect(() => {
        const fetchEntries = async () => {
            if (!selectedEventEntries) {
                setEventEntriesList([]);
                return;
            }

            setIsLoadingEntries(true);
            try {
                // Step 1: Fetch participant records directly (no FK join to avoid RLS issues)
                const { data: participants, error } = await supabase
                    .from('tournament_participants')
                    .select('id, profile_id, full_name, email, class_name, is_paid, metadata, rankedin_participant_id')
                    .eq('event_id', selectedEventEntries.id)
                    .order('full_name', { ascending: true });

                if (error) {
                    console.error('tournament_participants query error:', JSON.stringify(error));
                    throw error;
                }

                // Step 2: Enrich with player profile data where profile_id exists
                const profileIds = [...new Set((participants || []).map(p => p.profile_id).filter(Boolean))];
                let playerMap = {};

                if (profileIds.length > 0) {
                    const { data: playerProfiles, error: profileError } = await supabase
                        .from('players')
                        .select('id, contact_number, profile_image')
                        .in('id', profileIds);

                    if (profileError) {
                        console.warn('Could not enrich with player profiles:', profileError.message);
                    } else {
                        (playerProfiles || []).forEach(p => { playerMap[p.id] = p; });
                    }
                }

                // Step 3: Merge participant + profile data
                const enriched = (participants || []).map(p => ({
                    ...p,
                    players: playerMap[p.profile_id] || null
                }));

                setEventEntriesList(enriched);
            } catch (err) {
                console.error('Error loading event entries — full error object:', err);
                console.error('Error code:', err?.code, '| Message:', err?.message, '| Details:', err?.details, '| Hint:', err?.hint);
                toast.error(`Failed to load entries: ${err?.message || 'Unknown error'}`);
            } finally {
                setIsLoadingEntries(false);
            }
        };

        fetchEntries();
    }, [selectedEventEntries]);

    // Computed unique entries count, team counts and paid revenue breakdown metrics
    const entriesMetrics = useMemo(() => {
        if (!selectedEventEntries || eventEntriesList.length === 0) {
            return {
                totalPlayers: 0,
                uniqueTeams: 0,
                estimatedRevenue: 0,
                divisionBreakdown: {}
            };
        }

        const totalPlayers = eventEntriesList.length;
        let uniqueTeams = 0;
        let estimatedRevenue = 0;

        const divisionBreakdown = {};

        // Use per-division seen-team sets so the same pair in two different
        // divisions each count as 1 team per division (not 0 after first div)
        const divisionSeenTeams = {};

        eventEntriesList.forEach(entry => {
            const className = entry.class_name || 'Unassigned';
            if (!divisionBreakdown[className]) {
                divisionBreakdown[className] = { players: 0, teams: 0, revenue: 0 };
            }
            if (!divisionSeenTeams[className]) {
                divisionSeenTeams[className] = new Set();
            }

            // Increment division player count
            divisionBreakdown[className].players += 1;

            // Build a sorted pair key scoped to this division
            const p1 = entry.full_name;
            const p2 = entry.metadata?.partner_name || '';
            const sortedPair = [p1, p2].filter(Boolean).map(n => n.toLowerCase().trim()).sort().join('_with_');
            const divisionTeamKey = `${className}::${sortedPair}`;

            if (!divisionSeenTeams[className].has(sortedPair)) {
                divisionSeenTeams[className].add(sortedPair);
                divisionBreakdown[className].teams += 1;
                uniqueTeams += 1;
            }

            // Estimate entry fee for this player/division
            if (entry.is_paid) {
                const fee = parseFloat(selectedEventEntries.category_fees?.[className]) || parseFloat(selectedEventEntries.entry_fee) || 0;
                estimatedRevenue += fee;
                divisionBreakdown[className].revenue += fee;
            }
        });

        return {
            totalPlayers,
            uniqueTeams,
            estimatedRevenue,
            divisionBreakdown
        };
    }, [selectedEventEntries, eventEntriesList]);

    // Search-filtered + division-filtered entries datagrid results
    const filteredEntries = useMemo(() => {
        let list = eventEntriesList;
        // Division filter
        if (entriesDivisionFilter !== 'all') {
            list = list.filter(e => e.class_name === entriesDivisionFilter);
        }
        // Text search
        if (!entriesSearchQuery.trim()) return list;
        const q = entriesSearchQuery.toLowerCase().trim();
        return list.filter(entry => {
            const nameMatch = entry.full_name?.toLowerCase().includes(q);
            const emailMatch = entry.email?.toLowerCase().includes(q);
            const classMatch = entry.class_name?.toLowerCase().includes(q);
            const partnerMatch = entry.metadata?.partner_name?.toLowerCase().includes(q);
            return nameMatch || emailMatch || classMatch || partnerMatch;
        });
    }, [eventEntriesList, entriesSearchQuery, entriesDivisionFilter]);

    // Host - Submit Tourney for Sanctioning
    const handleCreateEventSubmit = async (e) => {
        e.preventDefault();
        if (!newEventData.event_name.trim()) return toast.error('Please specify an event name.');
        if (!newEventData.start_date || !newEventData.end_date) return toast.error('Please complete tournament dates.');

        setIsCreatingEvent(true);
        try {
            const slug = newEventData.event_name
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');

            const dateStr = formatEventDates(newEventData.start_date, newEventData.end_date);

            let regDeadline = newEventData.registration_deadline;
            if (!regDeadline && newEventData.start_date) {
                const d = new Date(newEventData.start_date);
                d.setDate(d.getDate() - 3);
                d.setHours(23, 59, 0, 0);
                regDeadline = d.toISOString();
            }

            // Compute minimum entry fee or fallback to 0
            const feesList = Object.values(newEventData.category_fees).map(f => parseFloat(f) || 0);
            const computedMinFee = feesList.length > 0 ? Math.min(...feesList) : 0;

            const payload = {
                event_name: (newEventData.event_name || '').trim(),
                slug,
                event_dates: dateStr,
                start_date: newEventData.start_date,
                end_date: newEventData.end_date,
                start_time: newEventData.start_time,
                end_time: newEventData.end_time,
                sapa_status: newEventData.sapa_status,
                city: (newEventData.city || '').trim(),
                venue: (newEventData.venue || '').trim(),
                address: (newEventData.address || '').trim(),
                court_map_link: (newEventData.court_map_link || '').trim(),
                description: (newEventData.description || '').trim(),
                entry_fee: computedMinFee,
                category_fees: newEventData.category_fees,
                image_url: newEventData.image_url,
                sponsor_logos: newEventData.sponsor_logos,
                organization_id: currentOrg.id,
                organizer_name: currentOrg.name,
                organizer_email: currentOrg.contact_email,
                organizer_phone: currentOrg.contact_phone || '',
                is_league: newEventData.is_league,
                is_visible: false, // Hidden until sanctioned
                sanction_status: 'pending',
                tournament_type: newEventData.tournament_type,
                registration_deadline: regDeadline,
                golden_point: newEventData.golden_point,
                courts_count: parseInt(newEventData.courts_count) || 4,
                allowed_divisions: newEventData.allowed_divisions,
                max_teams_capacity: parseInt(newEventData.max_teams_capacity) || 16,
                partner_requirement: newEventData.partner_requirement,
                tournament_director_name: (newEventData.tournament_director_name || '').trim(),
                tournament_director_phone: (newEventData.tournament_director_phone || '').trim(),
                tournament_director_email: (newEventData.tournament_director_email || '').trim(),
                indoor_outdoor: newEventData.indoor_outdoor || 'Outdoor',
                court_labels: newEventData.court_labels ? newEventData.court_labels.split(',').map(s => s.trim()).filter(Boolean) : [],
                prize_money_breakdown: (newEventData.prize_money_breakdown || '').trim(),
                sponsors_names: newEventData.sponsors_names ? newEventData.sponsors_names.split(',').map(s => s.trim()).filter(Boolean) : [],
                balls_to_be_used: (newEventData.balls_to_be_used || 'Head Tour').trim(),
                licences_required: !!newEventData.licences_required,
                licence_types: newEventData.licence_types ? newEventData.licence_types.split(',').map(s => s.trim()).filter(Boolean) : [],
                max_ranking_points: newEventData.max_ranking_points ? parseInt(newEventData.max_ranking_points) : null,
                back_draw_options: (newEventData.back_draw_options || 'Plate Included').trim(),
                event_co_admins: newEventData.event_co_admins ? newEventData.event_co_admins.split(',').map(s => s.trim()).filter(Boolean) : [],
                additional_notes: (newEventData.additional_notes || '').trim()
            };

            if (editingEventId) {
                const existing = orgEvents.find(e => e.id === editingEventId);
                const currentStatus = existing ? existing.sanction_status : 'pending';
                const nextStatus = currentStatus === 'rejected' ? 'pending' : currentStatus;

                const { error } = await supabase
                    .from('calendar')
                    .update({
                        ...payload,
                        sanction_status: nextStatus,
                        is_visible: nextStatus === 'approved'
                    })
                    .eq('id', editingEventId);

                if (error) throw error;
                toast.success('Tournament updated successfully! 🎾');
            } else {
                const { error } = await supabase
                    .from('calendar')
                    .insert([payload]);

                if (error) throw error;
                toast.success('Tournament submitted for sanctioning! 🏆');

                // Queue notification email to host owner
                sendEmail(currentOrg.contact_email, 'event_pending_sanction', {
                    eventName: payload.event_name,
                    orgName: currentOrg.name,
                    date: dateStr,
                    venue: payload.venue
                });

                // Alert Super Admin
                sendEmail('admin@4mpadel.co.za', 'event_pending_sanction', {
                    eventName: payload.event_name,
                    orgName: currentOrg.name,
                    date: dateStr,
                    venue: payload.venue
                });
            }

            // Reset Form and View
            setNewEventData({
                event_name: '',
                city: '',
                venue: '',
                address: '',
                description: '',
                start_date: '',
                end_date: '',
                start_time: '08:00',
                end_time: '18:00',
                entry_fee: '350',
                sapa_status: 'Silver',
                is_league: false,
                tournament_type: 'Single Elimination',
                registration_deadline: '',
                golden_point: true,
                courts_count: 4,
                allowed_divisions: [...SYSTEM_DIVISIONS],
                max_teams_capacity: 16,
                partner_requirement: 'Required',
                category_fees: {},
                court_map_link: '',
                image_url: '',
                sponsor_logos: [],
                tournament_director_name: '',
                tournament_director_phone: '',
                tournament_director_email: '',
                indoor_outdoor: 'Outdoor',
                court_labels: '',
                prize_money_breakdown: '',
                sponsors_names: '',
                balls_to_be_used: 'Head Tour',
                licences_required: false,
                licence_types: '',
                max_ranking_points: '',
                back_draw_options: 'Plate Included',
                event_co_admins: '',
                additional_notes: ''
            });
            setEditingEventId(null);
            setEventWizardStep(1);
            setActiveSection('my-events');
            fetchHostData();

        } catch (err) {
            console.error('Failed to submit event:', err);
            toast.error(`Sanction submission failed: ${err.message}`);
        } finally {
            setIsCreatingEvent(false);
        }
    };

    // helper: format event dates
    const formatEventDates = (start, end) => {
        if (!start) return '';
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const s = new Date(start);
        const e = new Date(end || start);

        if (s.getTime() === e.getTime()) {
            return `${s.getDate()} ${months[s.getMonth()]} ${s.getFullYear()}`;
        }
        if (s.getMonth() === e.getMonth()) {
            return `${s.getDate()}-${e.getDate()} ${months[s.getMonth()]} ${s.getFullYear()}`;
        }
        return `${s.getDate()} ${months[s.getMonth()]} - ${e.getDate()} ${months[e.getMonth()]} ${s.getFullYear()}`;
    };

    // Super Admin - Approve Host Organisation
    const handleApproveOrg = async (orgId, applicantEmail, orgName) => {
        try {
            const { error } = await supabase
                .from('organizations')
                .update({
                    status: 'approved',
                    approved_at: new Date().toISOString()
                })
                .eq('id', orgId);

            if (error) throw error;

            toast.success(`Approved organisation: ${orgName}! 🎉`);
            fetchSuperAdminData();

            // Dispatch welcome alert
            sendEmail(applicantEmail, 'org_approved', { orgName });
        } catch (err) {
            console.error('Approve organization error:', err);
            toast.error('Failed to approve organization.');
        }
    };

    // Super Admin - Approve Tournament Sanction
    const handleApproveEvent = async (event) => {
        try {
            const { error } = await supabase
                .from('calendar')
                .update({
                    sanction_status: 'approved',
                    is_visible: true // Make live instantly
                })
                .eq('id', event.id);

            if (error) throw error;

            toast.success(`Sanctioned tournament: ${event.event_name}! 🏆`);
            fetchSuperAdminData();

            // Dispatch alert to host club email
            if (event.organizations?.contact_email) {
                sendEmail(event.organizations.contact_email, 'event_sanctioned', {
                    eventName: event.event_name
                });
            }
        } catch (err) {
            console.error('Approve tournament error:', err);
        }
    };

    // Host Organiser - Start and Cancel Edit modes
    const handleStartEditEvent = (ev) => {
        setEditingEventId(ev.id);
        setNewEventData({
            event_name: ev.event_name || '',
            city: ev.city || '',
            venue: ev.venue || '',
            address: ev.address || '',
            description: ev.description || '',
            start_date: ev.start_date || '',
            end_date: ev.end_date || '',
            start_time: ev.start_time || '08:00',
            end_time: ev.end_time || '18:00',
            sapa_status: ev.sapa_status || 'Bronze',
            entry_fee: ev.entry_fee || 0,
            category_fees: ev.category_fees || {},
            image_url: ev.image_url || '',
            sponsor_logos: ev.sponsor_logos || [],
            is_league: ev.is_league || false,
            tournament_type: ev.tournament_type || 'Single Elimination',
            registration_deadline: ev.registration_deadline || '',
            golden_point: ev.golden_point !== undefined ? ev.golden_point : true,
            courts_count: ev.courts_count || 4,
            allowed_divisions: ev.allowed_divisions || [],
            max_teams_capacity: ev.max_teams_capacity || 16,
            partner_requirement: ev.partner_requirement || 'Required',
            court_map_link: ev.court_map_link || '',
            tournament_director_name: ev.tournament_director_name || '',
            tournament_director_phone: ev.tournament_director_phone || '',
            tournament_director_email: ev.tournament_director_email || '',
            indoor_outdoor: ev.indoor_outdoor || 'Outdoor',
            court_labels: Array.isArray(ev.court_labels) ? ev.court_labels.join(', ') : '',
            prize_money_breakdown: ev.prize_money_breakdown || '',
            sponsors_names: Array.isArray(ev.sponsors_names) ? ev.sponsors_names.join(', ') : '',
            balls_to_be_used: ev.balls_to_be_used || 'Head Tour',
            licences_required: ev.licences_required || false,
            licence_types: Array.isArray(ev.licence_types) ? ev.licence_types.join(', ') : '',
            max_ranking_points: ev.max_ranking_points !== null && ev.max_ranking_points !== undefined ? String(ev.max_ranking_points) : '',
            back_draw_options: ev.back_draw_options || 'Plate Included',
            event_co_admins: Array.isArray(ev.event_co_admins) ? ev.event_co_admins.join(', ') : '',
            additional_notes: ev.additional_notes || ''
        });
        setEventWizardStep(1);
        setActiveSection('create-event');
    };

    const handleCancelEdit = () => {
        setEditingEventId(null);
        setNewEventData({
            event_name: '',
            city: '',
            venue: '',
            address: '',
            description: '',
            start_date: '',
            end_date: '',
            start_time: '08:00',
            end_time: '18:00',
            entry_fee: '350',
            sapa_status: 'Silver',
            is_league: false,
            tournament_type: 'Single Elimination',
            registration_deadline: '',
            golden_point: true,
            courts_count: 4,
            allowed_divisions: [...SYSTEM_DIVISIONS],
            max_teams_capacity: 16,
            partner_requirement: 'Required',
            category_fees: {},
            court_map_link: '',
            image_url: '',
            sponsor_logos: [],
            tournament_director_name: '',
            tournament_director_phone: '',
            tournament_director_email: '',
            indoor_outdoor: 'Outdoor',
            court_labels: '',
            prize_money_breakdown: '',
            sponsors_names: '',
            balls_to_be_used: 'Head Tour',
            licences_required: false,
            licence_types: '',
            max_ranking_points: '',
            back_draw_options: 'Plate Included',
            event_co_admins: '',
            additional_notes: ''
        });
        setEventWizardStep(1);
        setActiveSection('my-events');
    };

    // Super Admin - Reject Trigger (Open notes modal)
    const openRejectionModal = (type, targetId, email, name) => {
        setRejectionModal({
            isOpen: true,
            type,
            targetId,
            targetEmail: email,
            targetName: name,
            notes: ''
        });
    };

    // Super Admin - Submit Rejection
    const handleRejectionSubmit = async (e) => {
        e.preventDefault();
        const { type, targetId, targetEmail, targetName, notes } = rejectionModal;

        if (!notes.trim()) {
            return toast.error('Please specify rejection feedback notes.');
        }

        try {
            if (type === 'org') {
                const { error } = await supabase
                    .from('organizations')
                    .update({
                        status: 'rejected',
                        rejection_notes: notes.trim()
                    })
                    .eq('id', targetId);

                if (error) throw error;

                toast.error(`Rejected application: ${targetName}`);
                sendEmail(targetEmail, 'org_rejected', {
                    orgName: targetName,
                    notes: notes.trim()
                });

            } else if (type === 'event') {
                const { error } = await supabase
                    .from('calendar')
                    .update({
                        sanction_status: 'rejected',
                        rejection_notes: notes.trim(),
                        is_visible: false
                    })
                    .eq('id', targetId);

                if (error) throw error;

                toast.error(`Declined sanction request: ${targetName}`);
                sendEmail(targetEmail, 'event_rejected', {
                    eventName: targetName,
                    notes: notes.trim()
                });
            }

            setRejectionModal({ isOpen: false, type: '', targetId: null, targetEmail: '', targetName: '', notes: '' });
            fetchSuperAdminData();

        } catch (err) {
            console.error('Rejection submission error:', err);
            toast.error('Action failed.');
        }
    };

    // Statistics aggregates for host — uses live participant counts from tournament_participants
    const hostStats = useMemo(() => {
        const approved = orgEvents.filter(e => e.sanction_status === 'approved');
        const pendingCount = orgEvents.filter(e => e.sanction_status === 'pending').length;

        const totalRegistrations = approved.reduce((sum, e) => {
            // Prefer live count from tournament_participants, fall back to calendar column
            return sum + (participantCounts[e.id] ?? parseInt(e.registered_players) ?? 0);
        }, 0);

        const totalEarned = approved.reduce((sum, e) => {
            const fee = parseFloat(e.entry_fee) || 0;
            const players = participantCounts[e.id] ?? parseInt(e.registered_players) ?? 0;
            return sum + (fee * players);
        }, 0);

        return {
            eventCount: orgEvents.length,
            approvedCount: approved.length,
            pendingCount,
            totalRegistrations,
            totalEarned
        };
    }, [orgEvents, participantCounts]);

    const filteredApprovedEvents = useMemo(() => {
        if (!approvedEventsSearch.trim()) return approvedEvents;
        const searchLower = approvedEventsSearch.toLowerCase().trim();
        return approvedEvents.filter(ev =>
            ev.event_name?.toLowerCase().includes(searchLower) ||
            ev.venue?.toLowerCase().includes(searchLower) ||
            ev.city?.toLowerCase().includes(searchLower) ||
            ev.organizations?.name?.toLowerCase().includes(searchLower) ||
            ev.organizer_name?.toLowerCase().includes(searchLower) ||
            ev.sapa_status?.toLowerCase().includes(searchLower)
        );
    }, [approvedEvents, approvedEventsSearch]);

    if (loading && orgEvents.length === 0 && allOrgs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-gray-500">
                <RefreshCw size={36} className="animate-spin text-padel-green mb-4" />
                <p className="text-sm">Retrieving Organisation Records...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-12">
            {/* Header banner */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-white flex items-center gap-2">
                        <Building className="text-padel-green" />
                        {isSuperAdmin ? 'Federation Oversight Portal' : currentOrg?.name}
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                        {isSuperAdmin
                            ? 'Sanction host clubs, approve events, and review platform telemetry'
                            : 'Host Dashboard - Create tournaments, configure entry seeds, and inspect entries'}
                    </p>
                </div>

                {!isSuperAdmin && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                setActiveSection(activeSection === 'create-event' ? 'overview' : 'create-event');
                                setEventWizardStep(1);
                            }}
                            className="bg-padel-green text-black font-black uppercase tracking-widest text-xs px-5 py-3 rounded-xl hover:bg-white transition-all flex items-center gap-2 cursor-pointer shadow-lg hover:shadow-padel-green/10"
                        >
                            {activeSection === 'create-event' ? (
                                <>Cancel <X size={14} /></>
                            ) : (
                                <>Sanction Event <Plus size={14} /></>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* ========================================================
                SUPER ADMIN OVERSIGHT VIEW
               ======================================================== */}
            {isSuperAdmin && (
                <div className="space-y-8">
                    {/* Platform Summary Stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-slate-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-slate-500/10 transition-colors" />
                            <div className="w-8 h-8 rounded-lg bg-slate-400/10 text-slate-300 flex items-center justify-center mb-3 border border-slate-400/20">
                                <Building size={16} />
                            </div>
                            <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">Total Hosts</span>
                            <div className="text-2xl font-black text-white mt-1">{stats.totalOrgs}</div>
                            <span className="text-[9px] text-slate-500 font-bold block mt-1">SAPA Clubs</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-amber-500/10 transition-colors" />
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3 border border-amber-500/20">
                                <AlertCircle size={16} />
                            </div>
                            <span className="text-[10px] uppercase font-black text-amber-400 tracking-wider block">Pending Hosts</span>
                            <div className="text-2xl font-black text-amber-500 mt-1">{stats.pendingOrgs}</div>
                            <span className="text-[9px] text-amber-400/60 font-bold block mt-1">Need Review</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-padel-green/5 blur-xl rounded-full pointer-events-none group-hover:bg-padel-green/10 transition-colors" />
                            <div className="w-8 h-8 rounded-lg bg-padel-green/10 text-padel-green flex items-center justify-center mb-3 border border-padel-green/20">
                                <ShieldCheck size={16} />
                            </div>
                            <span className="text-[10px] uppercase font-black text-padel-green tracking-wider block">Approved Hosts</span>
                            <div className="text-2xl font-black text-padel-green mt-1">{stats.approvedOrgs}</div>
                            <span className="text-[9px] text-padel-green/60 font-bold block mt-1">Active Sanctions</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-purple-500/10 transition-colors" />
                            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3 border border-purple-500/20">
                                <Trophy size={16} />
                            </div>
                            <span className="text-[10px] uppercase font-black text-purple-400 tracking-wider block">Sanctioned Events</span>
                            <div className="text-2xl font-black text-purple-400 mt-1">{stats.totalEvents}</div>
                            <span className="text-[9px] text-purple-400/60 font-bold block mt-1">Live Tournaments</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3 border border-emerald-500/20">
                                <DollarSign size={16} />
                            </div>
                            <span className="text-[10px] uppercase font-black text-emerald-400 tracking-wider block">Gross Entry Revenue</span>
                            <div className="text-2xl font-black text-emerald-400 mt-1">R {stats.totalRevenue.toLocaleString()}</div>
                            <span className="text-[9px] text-emerald-400/60 font-bold block mt-1">Platform Total</span>
                        </div>
                    </div>

                    {/* Pending Organisation Applications */}
                    <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Building size={18} className="text-amber-500" />
                            Pending Host Applications ({allOrgs.filter(o => o.status === 'pending').length})
                        </h3>

                        {allOrgs.filter(o => o.status === 'pending').length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">
                                No organisation applications pending review.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {allOrgs.filter(o => o.status === 'pending').map((org) => (
                                    <motion.div
                                        key={org.id}
                                        layoutId={org.id}
                                        className="bg-black/40 border border-white/10 p-5 rounded-2xl relative overflow-hidden"
                                    >
                                        <div className="flex justify-between items-start gap-4">
                                            <div>
                                                <h4 className="font-extrabold text-white text-md">{org.name}</h4>
                                                <p className="text-xs text-gray-500 mt-1">Applicant: {org.players?.name || 'Unknown User'}</p>

                                                <div className="space-y-1.5 mt-4 text-xs text-gray-400">
                                                    <div className="flex items-center gap-2">
                                                        <Mail size={12} className="text-gray-600" />
                                                        <span>{org.contact_email}</span>
                                                    </div>
                                                    {org.contact_phone && (
                                                        <div className="flex items-center gap-2">
                                                            <Phone size={12} className="text-gray-600" />
                                                            <span>{org.contact_phone}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {org.logo_url && (
                                                <img
                                                    src={org.logo_url}
                                                    alt={org.name}
                                                    className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0"
                                                    onError={(e) => e.target.style.display = 'none'}
                                                />
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2.5 mt-5 pt-4 border-t border-white/5">
                                            <button
                                                onClick={() => handleApproveOrg(org.id, org.contact_email, org.name)}
                                                className="flex-1 bg-padel-green text-black font-bold text-xs py-2.5 rounded-lg hover:bg-white transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                            >
                                                <Check size={14} /> Approve Host
                                            </button>
                                            <button
                                                onClick={() => openRejectionModal('org', org.id, org.contact_email, org.name)}
                                                className="bg-red-500/10 hover:bg-red-500 hover:text-black border border-red-500/20 text-red-400 font-bold text-xs px-4 py-2.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                            >
                                                <X size={14} /> Decline
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pending Tournament Sanctioning Requests */}
                    <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Trophy size={18} className="text-purple-400" />
                            Pending Tournament Sanction Requests ({pendingEvents.length})
                        </h3>

                        {pendingEvents.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">
                                No tournament sanction requests pending review.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="border-b border-white/5 text-gray-500 text-xs font-black uppercase">
                                            <th className="py-3 px-4">Event & Dates</th>
                                            <th className="py-3 px-4">Venue & City</th>
                                            <th className="py-3 px-4">Requesting Host</th>
                                            <th className="py-3 px-4">Tier Request</th>
                                            <th className="py-3 px-4">Entry Fee</th>
                                            <th className="py-3 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingEvents.map((ev) => (
                                            <tr key={ev.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                <td className="py-4 px-4">
                                                    <span className="font-bold text-white block">{ev.event_name}</span>
                                                    <span className="text-xs text-padel-green mt-0.5 block">{ev.event_dates}</span>
                                                </td>
                                                <td className="py-4 px-4 text-gray-300">
                                                    <span className="font-semibold block">{ev.venue}</span>
                                                    <span className="text-xs text-gray-500 block mt-0.5">{ev.city}</span>
                                                </td>
                                                <td className="py-4 px-4">
                                                    <span className="font-medium text-white block">{ev.organizations?.name || 'Unknown Club'}</span>
                                                    <span className="text-xs text-gray-500 block mt-0.5">{ev.organizations?.contact_email}</span>
                                                </td>
                                                <td className="py-4 px-4 align-middle">
                                                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase border ${getTierBadgeClass(ev.sapa_status)}`}>
                                                        {ev.sapa_status || 'Silver'}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 font-black text-padel-green">
                                                    R {ev.entry_fee || 0}
                                                </td>
                                                <td className="py-4 px-4 align-middle text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => setSelectedEventDetails(ev)}
                                                            className="bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 font-black uppercase tracking-wider text-[10px] px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                                                        >
                                                            <Eye size={12} /> Details
                                                        </button>
                                                        <button
                                                            onClick={() => handleApproveEvent(ev)}
                                                            className="bg-padel-green text-black font-black uppercase tracking-wider text-[10px] px-3.5 py-2 rounded-lg hover:bg-white transition-all cursor-pointer flex items-center gap-1"
                                                        >
                                                            <Check size={12} /> Sanction
                                                        </button>
                                                        <button
                                                            onClick={() => openRejectionModal('event', ev.id, ev.organizations?.contact_email || '', ev.event_name)}
                                                            className="bg-red-500/10 hover:bg-red-500 hover:text-black border border-red-500/20 text-red-400 font-black uppercase tracking-wider text-[10px] px-3 py-2 rounded-lg transition-all cursor-pointer"
                                                        >
                                                            Decline
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Sanctioned & Live Tournaments */}
                    <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Trophy size={18} className="text-padel-green" />
                                Sanctioned & Live Tournaments ({filteredApprovedEvents.length})
                            </h3>
                            <div className="relative max-w-xs w-full">
                                <input
                                    type="text"
                                    placeholder="Search by name, city, venue, host..."
                                    value={approvedEventsSearch}
                                    onChange={(e) => setApprovedEventsSearch(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-padel-green transition-colors"
                                />
                            </div>
                        </div>

                        {filteredApprovedEvents.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">
                                {approvedEvents.length === 0 ? 'No approved live tournaments on the platform.' : 'No tournaments match your search filter.'}
                            </div>
                        ) : (
                            <div className="overflow-x-auto max-h-[450px] custom-scrollbar">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead className="sticky top-0 bg-[#070b14]/90 backdrop-blur-md z-10">
                                        <tr className="border-b border-white/5 text-gray-500 text-xs font-black uppercase">
                                            <th className="py-3 px-4">Event & Dates</th>
                                            <th className="py-3 px-4">Venue & City</th>
                                            <th className="py-3 px-4">Requesting Host</th>
                                            <th className="py-3 px-4">Tier</th>
                                            <th className="py-3 px-4">Entry Fee</th>
                                            <th className="py-3 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredApprovedEvents.map((ev) => (
                                            <tr key={ev.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                <td className="py-4 px-4">
                                                    <span className="font-bold text-white block">{ev.event_name}</span>
                                                    <span className="text-xs text-padel-green mt-0.5 block">{ev.event_dates}</span>
                                                </td>
                                                <td className="py-4 px-4 text-gray-300">
                                                    <span className="font-semibold block">{ev.venue}</span>
                                                    <span className="text-xs text-gray-500 block mt-0.5">{ev.city}</span>
                                                </td>
                                                <td className="py-4 px-4">
                                                    <span className="font-medium text-white block">{ev.organizations?.name || ev.organizer_name || 'Unknown Club'}</span>
                                                    <span className="text-xs text-gray-500 block mt-0.5">{ev.organizations?.contact_email || ev.organizer_email}</span>
                                                </td>
                                                <td className="py-4 px-4 align-middle">
                                                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase border ${getTierBadgeClass(ev.sapa_status)}`}>
                                                        {ev.sapa_status || 'Silver'}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 font-black text-padel-green">
                                                    R {ev.entry_fee || 0}
                                                </td>
                                                <td className="py-4 px-4 align-middle text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => setSelectedEventEntries(ev)}
                                                            className="bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500 hover:text-white text-purple-400 font-black uppercase tracking-wider text-[10px] px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                                                        >
                                                            <Users size={12} /> Entries ({participantCounts[ev.id] ?? ev.registered_players ?? 0})
                                                        </button>
                                                        <button
                                                            onClick={() => setSelectedEventDetails(ev)}
                                                            className="bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 font-black uppercase tracking-wider text-[10px] px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                                                        >
                                                            <Eye size={12} /> View Details
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                openRejectionModal('event', ev.id, ev.organizations?.contact_email || ev.organizer_email || '', ev.event_name);
                                                                setSelectedEventDetails(null);
                                                            }}
                                                            className="bg-red-500/10 hover:bg-red-500 hover:text-black border border-red-500/20 text-red-400 font-black uppercase tracking-wider text-[10px] px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                                                        >
                                                            Revoke Sanction
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Complete Registered Host List */}
                    <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl">
                        <h3 className="text-lg font-bold text-white mb-4">All 4M Padel Sanctioned Host Clubs ({allOrgs.filter(o => o.status === 'approved').length})</h3>

                        {allOrgs.filter(o => o.status === 'approved').length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">No approved clubs register.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {allOrgs.filter(o => o.status === 'approved').map(org => (
                                    <button
                                        key={org.id}
                                        onClick={() => setSelectedOrgDetails(org)}
                                        className="bg-black/30 hover:bg-black/50 border border-white/5 hover:border-padel-green/30 p-4 rounded-xl flex items-center gap-3 w-full text-left transition-all duration-200 cursor-pointer"
                                    >
                                        {org.logo_url ? (
                                            <img src={org.logo_url} alt={org.name} className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0" />
                                        ) : (
                                            <div className="w-10 h-10 bg-padel-green/10 text-padel-green rounded-lg flex items-center justify-center shrink-0">
                                                <Building size={16} />
                                            </div>
                                        )}
                                        <div className="truncate flex-1">
                                            <span className="font-bold text-sm text-white block truncate">{org.name}</span>
                                            <span className="text-[10px] text-gray-500 block truncate">{org.contact_email}</span>
                                        </div>
                                        <ChevronRight size={14} className="text-gray-600 shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================
                ORGANISATION HOST VIEW
               ======================================================== */}
            {!isSuperAdmin && (
                <div className="space-y-8">
                    {/* View Switcher Tabs */}
                    {activeSection !== 'create-event' && (
                        <div className="flex border-b border-white/5 gap-6">
                            <button
                                onClick={() => setActiveSection('overview')}
                                className={`pb-4 text-sm font-extrabold uppercase tracking-wider relative transition-colors cursor-pointer ${activeSection === 'overview' ? 'text-padel-green' : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                Dashboard Overview
                                {activeSection === 'overview' && (
                                    <motion.div layoutId="hostTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-padel-green" />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveSection('my-events')}
                                className={`pb-4 text-sm font-extrabold uppercase tracking-wider relative transition-colors cursor-pointer ${activeSection === 'my-events' ? 'text-padel-green' : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                Tournaments Scoped ({orgEvents.length})
                                {activeSection === 'my-events' && (
                                    <motion.div layoutId="hostTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-padel-green" />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveSection('org-settings')}
                                className={`pb-4 text-sm font-extrabold uppercase tracking-wider relative transition-colors cursor-pointer ${activeSection === 'org-settings' ? 'text-padel-green' : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                Host Club Settings
                                {activeSection === 'org-settings' && (
                                    <motion.div layoutId="hostTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-padel-green" />
                                )}
                            </button>
                        </div>
                    )}

                    {/* 1. Host Dashboard Metrics & Recent Summary */}
                    {activeSection === 'overview' && (
                        <div className="space-y-8">
                            {/* Metrics Cards */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-padel-green/5 blur-xl rounded-full pointer-events-none group-hover:bg-padel-green/10 transition-colors" />
                                    <div className="w-8 h-8 rounded-lg bg-padel-green/10 text-padel-green flex items-center justify-center mb-3 border border-padel-green/20">
                                        <Trophy size={16} />
                                    </div>
                                    <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">Total Tournaments</span>
                                    <div className="text-2xl font-black text-white mt-1">{hostStats.eventCount}</div>
                                    <span className="text-[9px] text-slate-500 font-bold block mt-1">Host aggregate</span>
                                </div>
                                <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-amber-500/10 transition-colors" />
                                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3 border border-amber-500/20">
                                        <AlertCircle size={16} />
                                    </div>
                                    <span className="text-[10px] uppercase font-black text-amber-400 tracking-wider block">Pending Sanction</span>
                                    <div className="text-2xl font-black text-amber-500 mt-1">{hostStats.pendingCount}</div>
                                    <span className="text-[9px] text-amber-400/60 font-bold block mt-1">Awaiting Review</span>
                                </div>
                                <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-purple-500/10 transition-colors" />
                                    <div className="w-8 h-8 rounded-lg bg-purple-400/10 text-purple-400 flex items-center justify-center mb-3 border border-purple-500/20">
                                        <Users size={16} />
                                    </div>
                                    <span className="text-[10px] uppercase font-black text-purple-400 tracking-wider block">Total Registrants</span>
                                    <div className="text-2xl font-black text-purple-400 mt-1">{hostStats.totalRegistrations}</div>
                                    <span className="text-[9px] text-purple-400/60 font-bold block mt-1">Sanctioned events only</span>
                                </div>
                                <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                                    <div className="w-8 h-8 rounded-lg bg-emerald-400/10 text-emerald-400 flex items-center justify-center mb-3 border border-emerald-500/20">
                                        <DollarSign size={16} />
                                    </div>
                                    <span className="text-[10px] uppercase font-black text-emerald-400 tracking-wider block">Entry Revenue</span>
                                    <div className="text-2xl font-black text-emerald-400 mt-1">R {hostStats.totalEarned.toLocaleString()}</div>
                                    <span className="text-[9px] text-emerald-400/60 font-bold block mt-1">Direct pay payouts</span>
                                </div>
                            </div>

                            {/* Main Body */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Left: Profile overview */}
                                <div className="lg:col-span-1 bg-white/[0.02] border border-white/10 backdrop-blur-md p-6 rounded-2xl space-y-6 shadow-xl">
                                    <h3 className="font-extrabold text-white text-sm uppercase tracking-wider">Organisation Settings</h3>

                                    <div className="flex flex-col items-center text-center p-4 bg-black/40 border border-white/5 rounded-xl">
                                        {localOrgState?.logo_url ? (
                                            <img src={localOrgState.logo_url} alt={localOrgState.name} className="w-16 h-16 rounded-2xl object-cover border border-white/10 shadow-lg" />
                                        ) : (
                                            <div className="w-16 h-16 bg-padel-green/10 text-padel-green rounded-2xl flex items-center justify-center shadow-lg border border-padel-green/20">
                                                <Building size={28} />
                                            </div>
                                        )}
                                        <h4 className="font-extrabold text-white text-md mt-4">{localOrgState?.name}</h4>
                                        <span className="text-[9px] uppercase tracking-widest px-3 py-1 mt-1 bg-padel-green/10 border border-padel-green/25 text-padel-green font-black rounded-full">4M Padel Approved</span>
                                    </div>

                                    <div className="space-y-4 text-xs text-gray-400">
                                        <div>
                                            <span className="text-gray-500 font-bold block mb-1">Slug Domain:</span>
                                            <span className="font-mono bg-black/40 px-2 py-1 rounded border border-white/5">{localOrgState?.slug}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 font-bold block mb-1">Contact Email:</span>
                                            <div className="flex items-center gap-2">
                                                <Mail size={12} className="text-gray-600" />
                                                <span>{localOrgState?.contact_email}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 font-bold block mb-1">Contact Phone:</span>
                                            <div className="flex items-center gap-2">
                                                <Phone size={12} className="text-gray-600" />
                                                <span>{localOrgState?.contact_phone || 'None provided'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Scoped Events lists */}
                                <div className="lg:col-span-2 bg-white/[0.02] border border-white/10 backdrop-blur-md p-6 rounded-2xl flex flex-col justify-between shadow-xl">
                                    <div>
                                        <h3 className="font-extrabold text-white text-sm uppercase tracking-wider mb-4">Upcoming Schedule</h3>

                                        {orgEvents.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-gray-600 text-center">
                                                <Trophy size={32} className="opacity-20 mb-2" />
                                                <p className="text-xs">No tournaments requested yet.</p>
                                                <button
                                                    onClick={() => setActiveSection('create-event')}
                                                    className="mt-4 text-xs font-bold text-padel-green hover:underline cursor-pointer"
                                                >
                                                    Sanction your first event &rarr;
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-3.5">
                                                {orgEvents.slice(0, 4).map(ev => (
                                                    <div
                                                        key={ev.id}
                                                        className="bg-white/[0.015] border border-white/10 p-4 rounded-xl flex items-center justify-between gap-4"
                                                    >
                                                        <div>
                                                            <span className="font-bold text-sm text-white block">{ev.event_name}</span>
                                                            <span className="text-[10px] text-gray-500 block mt-1">{ev.event_dates} ({ev.city})</span>
                                                        </div>

                                                        <div className="flex items-center gap-3 shrink-0">
                                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border
                                                                ${ev.sanction_status === 'approved'
                                                                    ? 'bg-padel-green/10 text-padel-green border-padel-green/20'
                                                                    : ev.sanction_status === 'pending'
                                                                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                                }`}
                                                            >
                                                                {ev.sanction_status}
                                                            </span>
                                                            <ChevronRight size={14} className="text-gray-600" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {orgEvents.length > 4 && (
                                        <button
                                            onClick={() => setActiveSection('my-events')}
                                            className="text-xs font-bold text-padel-green hover:underline text-left mt-4 cursor-pointer"
                                        >
                                            View all tournaments &rarr;
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3. Host Club Settings Panel */}
                    {activeSection === 'org-settings' && (
                        <div className="w-full bg-white/[0.02] border border-white/10 backdrop-blur-md rounded-2xl p-6 md:p-8 space-y-6 text-left shadow-xl relative overflow-hidden">
                            {/* Accent Glow Circles */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-padel-green/5 blur-3xl rounded-full pointer-events-none" />
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full pointer-events-none" />
                            <div className="flex items-center gap-3 pb-4 border-b border-white/5">
                                <div className="w-10 h-10 bg-padel-green/10 text-padel-green rounded-xl flex items-center justify-center shrink-0 border border-padel-green/20">
                                    <Building size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Host Club Settings</h3>
                                    <p className="text-gray-500 text-xs mt-0.5">Manage your public organization profile, logos, and contact channels</p>
                                </div>
                            </div>

                            <form onSubmit={handleSaveOrgSettings} className="space-y-5">
                                {/* Logo Uploader Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center bg-black/20 border border-white/5 p-5 rounded-2xl">
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider block mb-1">Club Logo Preview</span>
                                        {orgSettingsForm.logo_url ? (
                                            <img
                                                src={orgSettingsForm.logo_url}
                                                alt="Club Logo"
                                                className="w-24 h-24 rounded-2xl object-cover bg-black/20 border border-white/10 shadow-lg"
                                            />
                                        ) : (
                                            <div className="w-24 h-24 bg-padel-green/10 text-padel-green rounded-2xl flex items-center justify-center border border-padel-green/20 shadow-lg">
                                                <Building size={36} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="md:col-span-2 space-y-2">
                                        <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider">Upload New Logo</label>
                                        <label className="flex flex-col items-center justify-center py-5 border border-dashed border-white/10 hover:border-padel-green/50 rounded-xl bg-black/40 hover:bg-black/60 cursor-pointer transition-all">
                                            <span className="text-xs text-gray-400 font-medium group-hover:text-padel-green transition-colors">
                                                {isUploadingLogo ? 'Uploading logo...' : 'Click to upload brand logo'}
                                            </span>
                                            <span className="text-[10px] text-gray-600 font-bold block mt-1">PNG, JPG, or SVG up to 2MB</span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleLogoUpload}
                                                disabled={isUploadingLogo}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>
                                </div>

                                {/* Club Profile Details */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Club / Organisation Name</label>
                                        <input
                                            type="text"
                                            required
                                            value={orgSettingsForm.name}
                                            onChange={(e) => setOrgSettingsForm(prev => ({ ...prev, name: e.target.value }))}
                                            className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                            placeholder="e.g. Kyalami Padel Club"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Contact Email Address</label>
                                            <input
                                                type="email"
                                                required
                                                value={orgSettingsForm.contact_email}
                                                onChange={(e) => setOrgSettingsForm(prev => ({ ...prev, contact_email: e.target.value }))}
                                                className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                placeholder="e.g. info@clubname.co.za"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Contact Phone Number</label>
                                            <input
                                                type="tel"
                                                value={orgSettingsForm.contact_phone}
                                                onChange={(e) => setOrgSettingsForm(prev => ({ ...prev, contact_phone: e.target.value }))}
                                                className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                placeholder="e.g. +27 11 123 4567"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Club Website URL (Optional)</label>
                                        <input
                                            type="text"
                                            value={orgSettingsForm.website_url}
                                            onChange={(e) => setOrgSettingsForm(prev => ({ ...prev, website_url: e.target.value }))}
                                            className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                            placeholder="e.g. www.kyalamipadel.co.za"
                                        />
                                    </div>
                                </div>

                                {/* Form Action Buttons */}
                                <div className="pt-4 border-t border-white/5 flex gap-3.5 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setActiveSection('overview')}
                                        className="px-6 py-3.5 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSavingOrgSettings || isUploadingLogo}
                                        className="px-8 py-3.5 bg-padel-green text-black font-black uppercase tracking-widest text-xs rounded-xl hover:shadow-[0_0_20px_rgba(154,233,0,0.3)] hover:scale-105 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                                    >
                                        {isSavingOrgSettings ? 'Saving changes...' : 'Save Settings Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* 2. My Scoped Tournaments List Grid */}
                    {activeSection === 'my-events' && (
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl">
                            <h3 className="text-lg font-bold text-white mb-6">Manage Your Tournaments</h3>

                            {orgEvents.length === 0 ? (
                                <div className="text-center py-12 text-gray-500 text-sm">
                                    No tournaments hosted yet. Click "Sanction Event" at the top to build your first event.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {orgEvents.map((ev) => (
                                        <div key={ev.id} className="bg-white/[0.015] border border-white/10 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden shadow-lg hover:border-white/20 transition-colors">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-white/2 blur-[40px] rounded-full pointer-events-none" />

                                            <div>
                                                <div className="flex justify-between items-start gap-4 mb-3">
                                                    <span className="text-xs text-padel-green font-bold">{ev.event_dates}</span>

                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border
                                                        ${ev.sanction_status === 'approved'
                                                            ? 'bg-padel-green/10 text-padel-green border-padel-green/20'
                                                            : ev.sanction_status === 'pending'
                                                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                        }`}
                                                    >
                                                        {ev.sanction_status === 'approved' ? 'Sanctioned' : ev.sanction_status}
                                                    </span>
                                                </div>

                                                <h4 className="font-extrabold text-white text-md leading-snug">{ev.event_name}</h4>

                                                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-400 bg-black/35 p-3 rounded-xl border border-white/5">
                                                    <div>
                                                        <span className="text-gray-500 font-bold block text-[9px] uppercase tracking-wider">Venue</span>
                                                        <span className="truncate block font-semibold text-gray-300">{ev.venue || 'TBD'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500 font-bold block text-[9px] uppercase tracking-wider">Entry Price</span>
                                                        <span className="block font-black text-padel-green">R {ev.entry_fee || 0}</span>
                                                    </div>
                                                </div>

                                                {/* Rejection notice banner if rejected */}
                                                {ev.sanction_status === 'rejected' && ev.rejection_notes && (
                                                    <div className="mt-3.5 bg-red-500/5 border border-red-500/15 p-3 rounded-xl flex items-start gap-2">
                                                        <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                                                        <div>
                                                            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest block">Rejection Feedback</span>
                                                            <p className="text-[11px] text-gray-400 leading-relaxed mt-1 font-semibold">{ev.rejection_notes}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex gap-2 mt-5 pt-3.5 border-t border-white/5 justify-between items-center">
                                                {ev.sanction_status === 'approved' ? (
                                                    <button 
                                                        onClick={() => setSelectedEventEntries(ev)}
                                                        className="text-[10px] text-purple-400 font-black hover:text-white flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 px-2.5 py-1 rounded-md transition-all cursor-pointer"
                                                    >
                                                        <Users size={12} /> {participantCounts[ev.id] ?? ev.registered_players ?? 0} Entries & Breakdown
                                                    </button>
                                                ) : (
                                                    <span className="text-[10px] text-gray-500 font-bold">
                                                        ID: {ev.id}
                                                    </span>
                                                )}

                                                <div className="flex items-center gap-4">
                                                    {ev.sanction_status === 'approved' && (
                                                        <a
                                                            href={`/calendar/${ev.slug}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[10px] font-black text-gray-400 hover:text-white uppercase tracking-widest flex items-center gap-1"
                                                        >
                                                            View Bracket &rarr;
                                                        </a>
                                                    )}
                                                    <button
                                                        onClick={() => handleStartEditEvent(ev)}
                                                        className="text-[10px] font-black text-padel-green hover:text-white uppercase tracking-widest flex items-center gap-1.5 cursor-pointer bg-transparent border-0"
                                                    >
                                                        <Edit size={12} /> Edit Details
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 3. Create Tournament Wizard / Form */}
                    {activeSection === 'create-event' && (
                        <div className="w-full bg-white/[0.02] border border-white/10 backdrop-blur-md rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden shadow-padel-green/5">
                            {/* Visual design overlays */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-padel-green/5 blur-3xl rounded-full" />
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-padel-green/5 blur-3xl rounded-full" />

                            <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
                                <div>
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        {editingEventId ? 'Edit Tournament Details' : 'Create Sanctioned Tournament'}
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {editingEventId ? 'Update your tournament settings' : 'Submit your event to 4M Padel for sanctioning'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3.5">
                                    {editingEventId && (
                                        <button
                                            type="button"
                                            onClick={handleCancelEdit}
                                            className="text-[10px] bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-red-400 font-bold uppercase tracking-wider rounded-lg hover:bg-red-500 hover:text-black transition-all cursor-pointer"
                                        >
                                            Cancel Edit
                                        </button>
                                    )}
                                    <span className="text-xs bg-padel-green/10 border border-padel-green/20 px-2.5 py-1 text-padel-green font-black rounded-lg">
                                        Step {eventWizardStep} of 4
                                    </span>
                                </div>
                            </div>

                            <form onSubmit={handleCreateEventSubmit} className="space-y-6 text-left">
                                <AnimatePresence mode="wait">
                                    {eventWizardStep === 1 && (
                                        <motion.div
                                            key="step1"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="space-y-4"
                                        >
                                            {/* Tournament Name */}
                                            <div>
                                                <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Tournament Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={newEventData.event_name}
                                                    onChange={(e) => setNewEventData(prev => ({ ...prev, event_name: e.target.value }))}
                                                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                    placeholder="e.g. Cape Town Open Gold Tournament"
                                                />
                                            </div>

                                            {/* Tier Request, Draw Type & League check */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Requested Sanction Tier</label>
                                                    <div className="relative">
                                                        <select
                                                            value={newEventData.sapa_status}
                                                            onChange={(e) => setNewEventData(prev => ({ ...prev, sapa_status: e.target.value }))}
                                                            className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 pr-10 focus:outline-none focus:border-padel-green text-sm transition-colors cursor-pointer appearance-none"
                                                        >
                                                            <option value="Bronze">Bronze Tier</option>
                                                            <option value="Silver">Silver Tier</option>
                                                            <option value="Gold">Gold Tier</option>
                                                            <option value="Super Gold">Super Gold</option>
                                                            <option value="Major">Major</option>
                                                        </select>
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                            <ChevronDown size={16} />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Tournament Draw Type</label>
                                                    <div className="relative">
                                                        <select
                                                            value={newEventData.tournament_type}
                                                            onChange={(e) => setNewEventData(prev => ({ ...prev, tournament_type: e.target.value }))}
                                                            className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 pr-10 focus:outline-none focus:border-padel-green text-sm transition-colors cursor-pointer appearance-none"
                                                        >
                                                            <option value="Single Elimination">Single Elimination (Knockout)</option>
                                                            <option value="Single Elimination + Plate">Elimination + Plates</option>
                                                            <option value="Group Stage -> Upper / Lower Bracket">Group Stage &rarr; Upper / Lower Bracket</option>
                                                            <option value="Double Elimination">Double Elimination</option>
                                                            <option value="Compass Draw">Compass Draw (Guaranteed Matches)</option>
                                                        </select>
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                            <ChevronDown size={16} />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col justify-end pb-1">
                                                    <label className="flex items-center gap-3 cursor-pointer text-sm text-gray-300 bg-black/20 border border-white/5 px-4 py-3.5 rounded-xl select-none hover:border-white/15 transition-all">
                                                        <input
                                                            type="checkbox"
                                                            checked={newEventData.is_league}
                                                            onChange={(e) => setNewEventData(prev => ({ ...prev, is_league: e.target.checked }))}
                                                            className="accent-padel-green w-4 h-4"
                                                        />
                                                        <span>League Tournament</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Tournament Director Info */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Tournament Director Name</label>
                                                    <input
                                                        type="text"
                                                        value={newEventData.tournament_director_name}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, tournament_director_name: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="e.g. John Doe"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Director Contact Number</label>
                                                    <input
                                                        type="text"
                                                        value={newEventData.tournament_director_phone}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, tournament_director_phone: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="e.g. +27 82 123 4567"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Director Email Address</label>
                                                    <input
                                                        type="email"
                                                        value={newEventData.tournament_director_email}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, tournament_director_email: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="e.g. john@4mpadel.co.za"
                                                    />
                                                </div>
                                            </div>

                                            {/* Tournament Description */}
                                            <div>
                                                <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Details & Regulations</label>
                                                <RichTextEditor
                                                    value={newEventData.description}
                                                    onChange={(html) => setNewEventData(prev => ({ ...prev, description: html }))}
                                                    placeholder="Rules, match rules, seeding information..."
                                                />
                                            </div>

                                            {/* Balls & Sponsors Names */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Balls to be Used (Brand & Model)</label>
                                                    <input
                                                        type="text"
                                                        value={newEventData.balls_to_be_used}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, balls_to_be_used: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="e.g. Head Tour"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Sponsors Names (Comma-separated)</label>
                                                    <input
                                                        type="text"
                                                        value={newEventData.sponsors_names}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, sponsors_names: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="e.g. Bullpadel, Adidas, Wilson"
                                                    />
                                                </div>
                                            </div>

                                            {/* Media & Sponsors */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/5">
                                                {/* Tournament Poster Upload */}
                                                <div className="space-y-3 text-left">
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider">Tournament Poster</label>

                                                    {newEventData.image_url ? (
                                                        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 aspect-[4/3] max-h-48 flex items-center justify-center">
                                                            <img
                                                                src={newEventData.image_url}
                                                                alt="Tournament Poster"
                                                                className="w-full h-full object-cover"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setNewEventData(prev => ({ ...prev, image_url: '' }))}
                                                                className="absolute top-2 right-2 bg-black/75 hover:bg-red-600 text-white rounded-full p-2.5 transition-colors shadow-lg cursor-pointer"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/10 hover:border-padel-green/50 rounded-2xl bg-black/20 hover:bg-black/45 cursor-pointer transition-all aspect-[4/3] max-h-48 group">
                                                            <div className="flex flex-col items-center text-center space-y-2">
                                                                <PlusCircle size={24} className="text-gray-500 group-hover:text-padel-green transition-colors" />
                                                                <span className="text-xs text-white font-bold">Upload Poster</span>
                                                                <span className="text-[10px] text-gray-500">PNG, JPG up to 5MB</span>
                                                            </div>
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                onChange={handlePosterUpload}
                                                                className="hidden"
                                                                disabled={isUploadingPoster}
                                                            />
                                                        </label>
                                                    )}
                                                    {isUploadingPoster && (
                                                        <div className="flex items-center gap-2 text-[10px] text-padel-green font-bold justify-center">
                                                            <RefreshCw size={10} className="animate-spin" />
                                                            <span>Uploading poster...</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Sponsors Logos Upload */}
                                                <div className="space-y-3 text-left">
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider">Sponsors Logos</label>

                                                    <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/10 hover:border-padel-green/50 rounded-2xl bg-black/20 hover:bg-black/45 cursor-pointer transition-all aspect-[4/3] max-h-48 group">
                                                        <div className="flex flex-col items-center text-center space-y-2">
                                                            <PlusCircle size={24} className="text-gray-500 group-hover:text-padel-green transition-colors" />
                                                            <span className="text-xs text-white font-bold">Upload Sponsor Logos</span>
                                                            <span className="text-[10px] text-gray-500">Upload multiple brands</span>
                                                        </div>
                                                        <input
                                                            type="file"
                                                            multiple
                                                            accept="image/*"
                                                            onChange={handleSponsorUpload}
                                                            className="hidden"
                                                            disabled={isUploadingSponsors}
                                                        />
                                                    </label>

                                                    {isUploadingSponsors && (
                                                        <div className="flex items-center gap-2 text-[10px] text-padel-green font-bold justify-center">
                                                            <RefreshCw size={10} className="animate-spin" />
                                                            <span>Uploading logo(s)...</span>
                                                        </div>
                                                    )}

                                                    {newEventData.sponsor_logos && newEventData.sponsor_logos.length > 0 && (
                                                        <div className="flex flex-wrap gap-2 pt-2 custom-scrollbar max-h-24 overflow-y-auto">
                                                            {newEventData.sponsor_logos.map((logo, idx) => (
                                                                <div key={idx} className="relative group w-11 h-11 bg-black/30 border border-white/10 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                                                                    <img src={logo} alt="Sponsor Logo" className="w-full h-full object-contain p-1" />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveSponsor(idx)}
                                                                        className="absolute inset-0 bg-red-600/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity duration-200 cursor-pointer"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="pt-4 flex justify-end gap-3">
                                                <button
                                                    type="submit"
                                                    disabled={isCreatingEvent || !newEventData.event_name.trim()}
                                                    className="bg-padel-green/10 border border-padel-green/20 hover:border-padel-green hover:bg-padel-green hover:text-black text-padel-green font-bold text-xs px-6 py-4 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                                                >
                                                    {isCreatingEvent ? 'Saving...' : 'Quick Save'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEventWizardStep(2)}
                                                    className="bg-white/10 hover:bg-white/20 text-white font-black uppercase tracking-widest text-xs px-6 py-4 rounded-xl transition-all cursor-pointer"
                                                >
                                                    Next Step &rarr;
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}

                                    {eventWizardStep === 2 && (
                                        <motion.div
                                            key="step2"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="space-y-4"
                                        >
                                            {/* Dates */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Start Date</label>
                                                    <input
                                                        type="date"
                                                        required
                                                        value={newEventData.start_date}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, start_date: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors cursor-pointer"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">End Date</label>
                                                    <input
                                                        type="date"
                                                        required
                                                        value={newEventData.end_date}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, end_date: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors cursor-pointer"
                                                    />
                                                </div>
                                            </div>

                                            {/* Daily Times */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Daily Match Start Time</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={newEventData.start_time}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, start_time: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="08:00"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Daily Match End Time</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={newEventData.end_time}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, end_time: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="18:00"
                                                    />
                                                </div>
                                            </div>

                                            {/* Registration Deadline */}
                                            <div>
                                                <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Registration Closing Deadline</label>
                                                <p className="text-[10px] text-gray-500 mb-2">A default deadline of 3 days prior to start date will be set if left blank.</p>
                                                <input
                                                    type="datetime-local"
                                                    value={newEventData.registration_deadline}
                                                    onChange={(e) => setNewEventData(prev => ({ ...prev, registration_deadline: e.target.value }))}
                                                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors cursor-pointer"
                                                />
                                            </div>

                                            <div className="pt-4 flex justify-between gap-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setEventWizardStep(1)}
                                                    className="bg-[#1E293B] hover:bg-white/10 text-white font-bold text-xs px-5 py-4 rounded-xl transition-all cursor-pointer"
                                                >
                                                    &larr; Back
                                                </button>
                                                <div className="flex gap-3">
                                                    <button
                                                        type="submit"
                                                        disabled={isCreatingEvent || !newEventData.event_name.trim()}
                                                        className="bg-padel-green/10 border border-padel-green/20 hover:border-padel-green hover:bg-padel-green hover:text-black text-padel-green font-bold text-xs px-6 py-4 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                                                    >
                                                        {isCreatingEvent ? 'Saving...' : 'Quick Save'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEventWizardStep(3)}
                                                        className="bg-white/10 hover:bg-white/20 text-white font-black uppercase tracking-widest text-xs px-6 py-4 rounded-xl transition-all cursor-pointer"
                                                    >
                                                        Next Step &rarr;
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {eventWizardStep === 3 && (
                                        <motion.div
                                            key="step3"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="space-y-4"
                                        >
                                            {/* City & Venue */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">City</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={newEventData.city}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, city: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="Cape Town"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Venue / Club Name</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={newEventData.venue}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, venue: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="Cape Padel Club"
                                                    />
                                                </div>
                                            </div>

                                            {/* Full Address (with Autocomplete) */}
                                            <div className="relative">
                                                <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Full Address</label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        required
                                                        value={newEventData.address}
                                                        onChange={(e) => handleAddressSearchChange(e.target.value)}
                                                        onFocus={() => {
                                                            if (addressResults.length > 0) setShowAddressDropdown(true);
                                                        }}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="Start typing address or club name... (e.g. Kyalami Country Club)"
                                                    />
                                                    {isSearchingAddress && (
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                            <RefreshCw size={14} className="animate-spin text-padel-green" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Autocomplete Results Dropdown */}
                                                <AnimatePresence>
                                                    {showAddressDropdown && addressResults.length > 0 && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 5 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: 5 }}
                                                            className="absolute left-0 right-0 top-full mt-2 bg-[#0F172A] border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-[100] max-h-60 overflow-y-auto custom-scrollbar"
                                                        >
                                                            {addressResults.map((item, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    type="button"
                                                                    onClick={() => handleSelectAddress(item)}
                                                                    className="w-full text-left px-4 py-3 hover:bg-padel-green/10 border-b border-white/5 transition-colors cursor-pointer block last:border-0"
                                                                >
                                                                    <span className="text-xs font-bold text-white block truncate">{item.name}</span>
                                                                    <span className="text-[10px] text-gray-400 block truncate mt-0.5">{item.display_name}</span>
                                                                </button>
                                                            ))}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            {/* Court Map Link */}
                                            <div>
                                                <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    Google Maps / Court Map URL
                                                    <span className="text-[10px] text-padel-green bg-padel-green/10 border border-padel-green/20 px-1.5 py-0.5 rounded font-black uppercase">Auto-Generated</span>
                                                </label>
                                                <input
                                                    type="url"
                                                    value={newEventData.court_map_link || ''}
                                                    onChange={(e) => setNewEventData(prev => ({ ...prev, court_map_link: e.target.value }))}
                                                    className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                    placeholder="https://www.google.com/maps/..."
                                                />
                                            </div>

                                            {/* Court Count & Golden Point format */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Available Padel Courts ({newEventData.courts_count})</label>
                                                    <div className="flex items-center gap-4 bg-black/20 border border-white/5 rounded-xl p-3.5">
                                                        <input
                                                            type="range"
                                                            min="1"
                                                            max="20"
                                                            value={newEventData.courts_count}
                                                            onChange={(e) => setNewEventData(prev => ({ ...prev, courts_count: parseInt(e.target.value) }))}
                                                            className="flex-1 accent-padel-green h-1.5 rounded-lg cursor-pointer bg-white/10"
                                                        />
                                                        <span className="font-extrabold text-sm text-padel-green w-6 text-center">{newEventData.courts_count}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col justify-end">
                                                    <label className="flex items-center justify-between cursor-pointer p-3.5 bg-black/20 border border-white/5 rounded-xl select-none group hover:border-white/10 transition-all">
                                                        <div className="flex flex-col text-left">
                                                            <span className="text-xs font-bold text-white group-hover:text-padel-green transition-colors">Golden Point Plays</span>
                                                            <span className="text-[9px] text-gray-500 mt-0.5">Sudden-death deuce games</span>
                                                        </div>
                                                        <div className="relative">
                                                            <input
                                                                type="checkbox"
                                                                checked={newEventData.golden_point}
                                                                onChange={(e) => setNewEventData(prev => ({ ...prev, golden_point: e.target.checked }))}
                                                                className="sr-only"
                                                            />
                                                            <div className={`w-11 h-6 bg-white/10 border border-white/10 rounded-full transition-all duration-300 ${newEventData.golden_point ? 'bg-padel-green/30 border-padel-green/50' : ''}`} />
                                                            <div className={`absolute left-1 top-1 w-4 h-4 bg-gray-400 rounded-full transition-all duration-300 ${newEventData.golden_point ? 'translate-x-5 bg-padel-green' : ''}`} />
                                                        </div>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Indoor/Outdoor & Court Labels */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Indoor / Outdoor</label>
                                                    <div className="relative">
                                                        <select
                                                            value={newEventData.indoor_outdoor}
                                                            onChange={(e) => setNewEventData(prev => ({ ...prev, indoor_outdoor: e.target.value }))}
                                                            className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 pr-10 focus:outline-none focus:border-padel-green text-sm transition-colors cursor-pointer appearance-none"
                                                        >
                                                            <option value="Outdoor">Outdoor Courts</option>
                                                            <option value="Indoor">Indoor Courts</option>
                                                            <option value="Both">Both (Indoor & Outdoor)</option>
                                                        </select>
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                            <ChevronDown size={16} />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
                                                        <span>Court Labels (Best to worst)</span>
                                                        <span className="text-[9px] text-gray-500 font-normal">Ranked for AI scheduling</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={newEventData.court_labels}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, court_labels: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="e.g. Court 1 (Center), Court 2, Court 3"
                                                    />
                                                </div>
                                            </div>

                                            <div className="pt-4 flex justify-between gap-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setEventWizardStep(2)}
                                                    className="bg-[#1E293B] hover:bg-white/10 text-white font-bold text-xs px-5 py-4 rounded-xl transition-all cursor-pointer"
                                                >
                                                    &larr; Back
                                                </button>
                                                <div className="flex gap-3">
                                                    <button
                                                        type="submit"
                                                        disabled={isCreatingEvent || !newEventData.event_name.trim()}
                                                        className="bg-padel-green/10 border border-padel-green/20 hover:border-padel-green hover:bg-padel-green hover:text-black text-padel-green font-bold text-xs px-6 py-4 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                                                    >
                                                        {isCreatingEvent ? 'Saving...' : 'Quick Save'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEventWizardStep(4)}
                                                        className="bg-white/10 hover:bg-white/20 text-white font-black uppercase tracking-widest text-xs px-6 py-4 rounded-xl transition-all cursor-pointer"
                                                    >
                                                        Next Step &rarr;
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {eventWizardStep === 4 && (
                                        <motion.div
                                            key="step4"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="space-y-4"
                                        >
                                            {/* Capacity and partners */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Base Entry Fee (R)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        required
                                                        value={newEventData.entry_fee}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setNewEventData(prev => {
                                                                // Automatically update unchecked/default category fees to match base if they haven't been customized!
                                                                const updatedFees = { ...prev.category_fees };
                                                                prev.allowed_divisions.forEach(div => {
                                                                    if (!updatedFees[div] || updatedFees[div] === prev.entry_fee) {
                                                                        updatedFees[div] = val;
                                                                    }
                                                                });
                                                                return {
                                                                    ...prev,
                                                                    entry_fee: val,
                                                                    category_fees: updatedFees
                                                                };
                                                            });
                                                        }}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="350"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Max Teams / Capacity</label>
                                                    <input
                                                        type="number"
                                                        required
                                                        value={newEventData.max_teams_capacity}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, max_teams_capacity: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="16"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Partner Requirement</label>
                                                    <div className="relative">
                                                        <select
                                                            value={newEventData.partner_requirement}
                                                            onChange={(e) => setNewEventData(prev => ({ ...prev, partner_requirement: e.target.value }))}
                                                            className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 pr-10 focus:outline-none focus:border-padel-green text-sm transition-colors cursor-pointer appearance-none"
                                                        >
                                                            <option value="Required">Required (Doubles)</option>
                                                            <option value="Optional">Optional (Free Agent)</option>
                                                            <option value="Single Entry">Single (No Partner)</option>
                                                        </select>
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                            <ChevronDown size={16} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Allowed divisions checklist with per-division pricing */}
                                            <div>
                                                <div className="flex justify-between items-center mb-3">
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider">Allowed Divisions & Entry Fees</label>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const defaultFees = {};
                                                                SYSTEM_DIVISIONS.forEach(div => {
                                                                    defaultFees[div] = newEventData.entry_fee || '350';
                                                                });
                                                                setNewEventData(prev => ({
                                                                    ...prev,
                                                                    allowed_divisions: [...SYSTEM_DIVISIONS],
                                                                    category_fees: defaultFees
                                                                }));
                                                            }}
                                                            className="text-[10px] font-bold text-padel-green hover:underline cursor-pointer"
                                                        >
                                                            Select All
                                                        </button>
                                                        <span className="text-[10px] text-gray-600">|</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setNewEventData(prev => ({ ...prev, allowed_divisions: [], category_fees: {} }))}
                                                            className="text-[10px] font-bold text-red-400 hover:underline cursor-pointer"
                                                        >
                                                            Clear All
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {SYSTEM_DIVISIONS.map(div => {
                                                        const isChecked = newEventData.allowed_divisions.includes(div);
                                                        return (
                                                            <div
                                                                key={div}
                                                                className={`flex items-center justify-between p-3.5 bg-black/20 border rounded-xl transition-all select-none ${isChecked ? 'bg-padel-green/5 border-padel-green/20' : 'border-white/5 hover:border-white/10'}`}
                                                            >
                                                                <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isChecked}
                                                                        onChange={(e) => {
                                                                            const isCheckedNow = e.target.checked;
                                                                            const next = isCheckedNow
                                                                                ? [...newEventData.allowed_divisions, div]
                                                                                : newEventData.allowed_divisions.filter(d => d !== div);

                                                                            setNewEventData(prev => {
                                                                                const updatedFees = { ...prev.category_fees };
                                                                                if (isCheckedNow) {
                                                                                    if (!updatedFees[div]) updatedFees[div] = prev.entry_fee || '350';
                                                                                } else {
                                                                                    delete updatedFees[div];
                                                                                }
                                                                                return {
                                                                                    ...prev,
                                                                                    allowed_divisions: next,
                                                                                    category_fees: updatedFees
                                                                                };
                                                                            });
                                                                        }}
                                                                        className="accent-padel-green w-4 h-4 shrink-0 cursor-pointer"
                                                                    />
                                                                    <span className={`text-xs font-semibold truncate ${isChecked ? 'text-white font-bold' : 'text-gray-400'}`}>{div}</span>
                                                                </label>

                                                                {isChecked && (
                                                                    <div className="flex items-center gap-1.5 shrink-0 ml-3">
                                                                        <span className="text-[10px] font-bold text-gray-500 font-mono">R</span>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            placeholder={newEventData.entry_fee || "350"}
                                                                            value={newEventData.category_fees[div] ?? newEventData.entry_fee ?? '350'}
                                                                            onChange={(e) => {
                                                                                const val = e.target.value;
                                                                                setNewEventData(prev => ({
                                                                                    ...prev,
                                                                                    category_fees: {
                                                                                        ...prev.category_fees,
                                                                                        [div]: val
                                                                                    }
                                                                                }));
                                                                            }}
                                                                            className="w-16 bg-black/40 border border-white/10 text-white text-xs font-black rounded-lg px-2 py-1 focus:outline-none focus:border-padel-green text-center transition-all"
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Section 4.1 Tournament Details Forms Additions */}
                                            <div className="border-t border-white/5 pt-4 space-y-4">
                                                {/* Prize Money & Breakdown */}
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Prize Money & Breakdown</label>
                                                    <textarea
                                                        value={newEventData.prize_money_breakdown}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, prize_money_breakdown: e.target.value }))}
                                                        rows={2}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-padel-green text-sm transition-colors custom-scrollbar resize-none"
                                                        placeholder="e.g. Winner: R5,000, Runner-up: R2,500, Semifinalists: R1,000"
                                                    />
                                                </div>

                                                {/* Max Ranking Points & Back Draw / Plate Options */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Max Ranking Points per Team to Qualify</label>
                                                        <input
                                                            type="number"
                                                            value={newEventData.max_ranking_points}
                                                            onChange={(e) => setNewEventData(prev => ({ ...prev, max_ranking_points: e.target.value }))}
                                                            className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                            placeholder="e.g. 1500 (leave blank for no limit)"
                                                        />
                                                        <p className="text-[9px] text-gray-500 mt-1">Teams above this threshold cannot enter.</p>
                                                    </div>
                                                    <div>
                                                        <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Back Draw / Plate Options</label>
                                                        <div className="relative">
                                                            <select
                                                                value={newEventData.back_draw_options}
                                                                onChange={(e) => setNewEventData(prev => ({ ...prev, back_draw_options: e.target.value }))}
                                                                className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 pr-10 focus:outline-none focus:border-padel-green text-sm transition-colors cursor-pointer appearance-none"
                                                            >
                                                                <option value="Plate Included">Plate Included (Guaranteed 2 Matches)</option>
                                                                <option value="No Plate">No Plate (Direct Elimination Only)</option>
                                                                <option value="Consolation Draw">Consolation Draw</option>
                                                                <option value="Compass Format">Compass Draw format</option>
                                                            </select>
                                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                                <ChevronDown size={16} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Licences required toggle & Licence Types */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="flex flex-col justify-center">
                                                        <label className="flex items-center justify-between cursor-pointer p-3.5 bg-black/20 border border-white/5 rounded-xl select-none group hover:border-white/10 transition-all">
                                                            <div className="flex flex-col text-left">
                                                                <span className="text-xs font-bold text-white group-hover:text-padel-green transition-colors">Licence Required</span>
                                                                <span className="text-[9px] text-gray-500 mt-0.5">Require specific organization licence</span>
                                                            </div>
                                                            <div className="relative">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={newEventData.licences_required}
                                                                    onChange={(e) => setNewEventData(prev => ({ ...prev, licences_required: e.target.checked }))}
                                                                    className="sr-only"
                                                                />
                                                                <div className={`w-11 h-6 bg-white/10 border border-white/10 rounded-full transition-all duration-300 ${newEventData.licences_required ? 'bg-padel-green/30 border-padel-green/50' : ''}`} />
                                                                <div className={`absolute left-1 top-1 w-4 h-4 bg-gray-400 rounded-full transition-all duration-300 ${newEventData.licences_required ? 'translate-x-5 bg-padel-green' : ''}`} />
                                                            </div>
                                                        </label>
                                                    </div>
                                                    {newEventData.licences_required && (
                                                        <motion.div
                                                            initial={{ opacity: 0, x: -10 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            className="flex flex-col justify-center"
                                                        >
                                                            <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Required Licence Types (Comma-separated)</label>
                                                            <input
                                                                type="text"
                                                                value={newEventData.licence_types}
                                                                onChange={(e) => setNewEventData(prev => ({ ...prev, licence_types: e.target.value }))}
                                                                className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                                placeholder="e.g. SAPA Player, SAPA Pro"
                                                            />
                                                        </motion.div>
                                                    )}
                                                </div>

                                                {/* Event Co-Admins */}
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Event Co-Admins (Comma-separated emails)</label>
                                                    <input
                                                        type="text"
                                                        value={newEventData.event_co_admins}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, event_co_admins: e.target.value }))}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                                                        placeholder="e.g. coadmin1@4mpadel.co.za, coadmin2@4mpadel.co.za"
                                                    />
                                                    <p className="text-[9px] text-gray-500 mt-1">Specify co-admins by entering their registered email addresses.</p>
                                                </div>

                                                {/* Additional Notes */}
                                                <div>
                                                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Additional Notes</label>
                                                    <textarea
                                                        value={newEventData.additional_notes}
                                                        onChange={(e) => setNewEventData(prev => ({ ...prev, additional_notes: e.target.value }))}
                                                        rows={2}
                                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-padel-green text-sm transition-colors custom-scrollbar resize-none"
                                                        placeholder="e.g. Please bring dry clothing. Catering available on-site..."
                                                    />
                                                    <p className="text-[9px] text-gray-500 mt-1">Visible to players on the entry/registration page.</p>
                                                </div>
                                            </div>

                                            <div className="pt-4 flex justify-between gap-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setEventWizardStep(3)}
                                                    className="bg-[#1E293B] hover:bg-white/10 text-white font-bold text-xs px-5 py-4 rounded-xl transition-all cursor-pointer"
                                                >
                                                    &larr; Back
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={isCreatingEvent || newEventData.allowed_divisions.length === 0}
                                                    className="flex-1 bg-padel-green text-black font-black uppercase tracking-widest text-xs py-4 rounded-xl hover:shadow-[0_0_20px_rgba(154,233,0,0.3)] hover:scale-[1.01] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                                                >
                                                    {isCreatingEvent
                                                        ? 'Saving changes...'
                                                        : editingEventId
                                                            ? 'Update Tournament Details 🎾'
                                                            : 'Sanction Tournament 🏆'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================
                SUPER ADMIN DETAILED TOURNAMENT PREVIEW MODAL
               ======================================================== */}
            <AnimatePresence>
                {selectedEventDetails && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4 overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            className="max-w-3xl w-full bg-[#0F172A] border border-white/10 rounded-3xl p-6 md:p-8 relative shadow-2xl my-8 max-h-[90vh] overflow-y-auto custom-scrollbar text-left"
                        >
                            {/* Close Button */}
                            <button
                                onClick={() => setSelectedEventDetails(null)}
                                className="absolute top-5 right-5 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                            >
                                <X size={16} />
                            </button>

                            {/* Header */}
                            <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-white/5">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${getTierBadgeClass(selectedEventDetails.sapa_status)}`}>
                                    <Trophy size={22} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-extrabold text-white text-lg">{selectedEventDetails.event_name}</h3>
                                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${getTierBadgeClass(selectedEventDetails.sapa_status)}`}>
                                            {selectedEventDetails.sapa_status || 'Silver'}
                                        </span>
                                        <span className="px-2.5 py-0.5 rounded bg-white/5 text-gray-400 border border-white/10 text-[10px] font-bold capitalize">
                                            {selectedEventDetails.tournament_type || 'knockout'}
                                        </span>
                                    </div>
                                    <p className="text-gray-500 text-xs mt-1">
                                        Requested by{' '}
                                        {selectedEventDetails.organization_id ? (
                                            <button
                                                onClick={() => {
                                                    const org = allOrgs.find(o => o.id === selectedEventDetails.organization_id);
                                                    if (org) setSelectedOrgDetails(org);
                                                }}
                                                className="text-padel-green hover:underline font-extrabold cursor-pointer transition-colors"
                                            >
                                                {selectedEventDetails.organizations?.name || 'View Host Club'}
                                            </button>
                                        ) : (
                                            <span className="text-gray-300 font-bold">
                                                {selectedEventDetails.organizer_name || 'Unknown Club'}
                                            </span>
                                        )}{' '}
                                        ({selectedEventDetails.organizations?.contact_email || selectedEventDetails.organizer_email})
                                    </p>
                                </div>
                            </div>

                            {/* Two-Column Grid for Metadata details */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left Column: Logistics */}
                                <div className="space-y-4">
                                    <div>
                                        <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1.5">Schedule & Dates</span>
                                        <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-2">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Tournament Dates:</span>
                                                <span className="text-white font-bold">{selectedEventDetails.event_dates}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Daily Hours:</span>
                                                <span className="text-gray-300 font-medium">{selectedEventDetails.start_time || '08:00'} - {selectedEventDetails.end_time || '18:00'}</span>
                                            </div>
                                            <div className="flex justify-between text-xs border-t border-white/5 pt-2 mt-1">
                                                <span className="text-gray-500">Registration Deadline:</span>
                                                <span className="text-padel-green font-extrabold">
                                                    {selectedEventDetails.registration_deadline
                                                        ? new Date(selectedEventDetails.registration_deadline).toLocaleString('en-ZA', {
                                                            dateStyle: 'medium',
                                                            timeStyle: 'short'
                                                        })
                                                        : 'TBD'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1.5">Venue & Coordinates</span>
                                        <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-2">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Club / Venue:</span>
                                                <span className="text-white font-bold">{selectedEventDetails.venue}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">City / Suburb:</span>
                                                <span className="text-gray-300 font-semibold">{selectedEventDetails.city}</span>
                                            </div>
                                            {selectedEventDetails.address && (
                                                <div className="text-xs pt-2 border-t border-white/5">
                                                    <span className="text-gray-500 block mb-1">Full Autocompleted Address:</span>
                                                    <span className="text-gray-400 font-medium block leading-relaxed">{selectedEventDetails.address}</span>
                                                </div>
                                            )}
                                            {selectedEventDetails.court_map_link && (
                                                <div className="pt-2">
                                                    <a
                                                        href={selectedEventDetails.court_map_link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 text-xs text-padel-green hover:text-white font-bold transition-colors"
                                                    >
                                                        <ExternalLink size={12} /> Open Google Maps Link
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1.5">Rules & Capacity</span>
                                        <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-2">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Total Playable Courts:</span>
                                                <span className="text-white font-bold">{selectedEventDetails.courts_count || 4} Courts</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Max Teams Capacity:</span>
                                                <span className="text-white font-bold">{selectedEventDetails.max_teams_capacity || 16} Teams</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Sudden Death Golden Point:</span>
                                                <span className={`font-bold ${selectedEventDetails.golden_point ? 'text-padel-green' : 'text-gray-400'}`}>
                                                    {selectedEventDetails.golden_point ? 'Enabled ✓' : 'Disabled'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-xs border-t border-white/5 pt-2 mt-1">
                                                <span className="text-gray-500">Partner Mandated:</span>
                                                <span className="text-gray-300 font-bold capitalize">{selectedEventDetails.partner_requirement || 'any'}</span>
                                            </div>
                                            <div className="flex justify-between text-xs border-t border-white/5 pt-2 mt-1">
                                                <span className="text-gray-500">Base Entry Fee:</span>
                                                <span className="text-padel-green font-extrabold">R {selectedEventDetails.entry_fee || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Poster, Sponsors & Divisions */}
                                <div className="space-y-4">
                                    {/* Poster Visual Preview */}
                                    {selectedEventDetails.image_url && (
                                        <div>
                                            <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1.5">Tournament Poster</span>
                                            <div className="bg-black/30 border border-white/5 p-3 rounded-2xl flex justify-center">
                                                <img
                                                    src={selectedEventDetails.image_url}
                                                    alt="Tournament Poster"
                                                    className="max-h-48 rounded-xl object-contain border border-white/10"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Divisions & Price Selector Grid */}
                                    <div>
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider">Allowed Divisions & Category Fees</span>
                                            {selectedEventDetails.entry_fee != null && (
                                                <span className="text-[10px] text-padel-green bg-padel-green/10 border border-padel-green/20 px-2 py-0.5 rounded font-bold uppercase tracking-wide">
                                                    BASE: R {selectedEventDetails.entry_fee}
                                                </span>
                                            )}
                                        </div>
                                        <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-2">
                                            {selectedEventDetails.allowed_divisions && selectedEventDetails.allowed_divisions.length > 0 ? (
                                                <div className="space-y-2 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                                                    {selectedEventDetails.allowed_divisions.map((div) => {
                                                        const fee = selectedEventDetails.category_fees?.[div] || selectedEventDetails.entry_fee || 0;
                                                        return (
                                                            <div key={div} className="flex justify-between items-center text-xs bg-black/40 border border-white/5 px-3 py-2 rounded-lg">
                                                                <span className="text-gray-300 font-semibold">{div}</span>
                                                                <span className="text-padel-green font-black">R {fee}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-gray-500 italic py-2 text-center">
                                                    No explicit divisions selected. Fallback entry fee: R {selectedEventDetails.entry_fee || 0}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Live Entries Live Badge Inspector (Federation / Super Admin oversight) */}
                                    <div className="bg-gradient-to-r from-purple-500/10 to-indigo-500/5 border border-purple-500/20 p-5 rounded-3xl relative overflow-hidden shadow-md">
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 blur-[25px] rounded-full pointer-events-none" />
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div className="flex-1 min-w-0">
                                                <span className="block text-purple-400 text-[10px] font-black uppercase tracking-widest mb-1">Live Registration Feed</span>
                                                <h4 className="font-extrabold text-white text-base flex items-center gap-1.5 leading-snug">
                                                    <Users size={16} className="text-purple-400 shrink-0" />
                                                    {participantCounts[selectedEventDetails.id] ?? selectedEventDetails.registered_players ?? 0} Registered Entries
                                                </h4>
                                                <p className="text-[11px] text-gray-400 mt-1 leading-normal">
                                                    Inspect individual entries, contact credentials, partner pairs and division fees.
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setSelectedEventEntries(selectedEventDetails);
                                                }}
                                                className="mt-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-black uppercase tracking-wider text-[10px] rounded-xl hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all shrink-0 cursor-pointer"
                                            >
                                                👁️ View Entries
                                            </button>
                                        </div>
                                    </div>

                                    {/* Sponsor Logos Badges */}
                                    {selectedEventDetails.sponsor_logos && selectedEventDetails.sponsor_logos.length > 0 && (
                                        <div>
                                            <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1.5">Event Corporate Sponsors</span>
                                            <div className="bg-black/30 border border-white/5 p-3 rounded-2xl overflow-x-auto custom-scrollbar">
                                                <div className="flex gap-3.5 py-1 min-w-max">
                                                    {selectedEventDetails.sponsor_logos.map((logo, idx) => (
                                                        <img
                                                            key={idx}
                                                            src={logo}
                                                            alt={`Sponsor ${idx + 1}`}
                                                            className="h-10 w-auto rounded-lg object-contain bg-white/5 border border-white/10 px-2"
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Section 4.1 Additional Details Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 border-t border-white/5 pt-6">
                                <div className="space-y-4">
                                    <div>
                                        <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1.5">Director & Balls Info</span>
                                        <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-2">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Director Name:</span>
                                                <span className="text-white font-bold">{selectedEventDetails.tournament_director_name || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Director Phone:</span>
                                                <span className="text-gray-300 font-semibold">{selectedEventDetails.tournament_director_phone || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Director Email:</span>
                                                <span className="text-gray-300 font-semibold">{selectedEventDetails.tournament_director_email || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Balls to be Used:</span>
                                                <span className="text-white font-bold">{selectedEventDetails.balls_to_be_used || 'Head Tour'}</span>
                                            </div>
                                            {selectedEventDetails.event_co_admins && selectedEventDetails.event_co_admins.length > 0 && (
                                                <div className="text-xs border-t border-white/5 pt-2 mt-1">
                                                    <span className="text-gray-500 block mb-1">Event Co-Admins:</span>
                                                    <span className="text-gray-300 font-semibold">{Array.isArray(selectedEventDetails.event_co_admins) ? selectedEventDetails.event_co_admins.join(', ') : selectedEventDetails.event_co_admins}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1.5">Court Priority & Setup</span>
                                        <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-2">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Indoor / Outdoor:</span>
                                                <span className="text-white font-bold">{selectedEventDetails.indoor_outdoor || 'Outdoor'}</span>
                                            </div>
                                            {selectedEventDetails.court_labels && selectedEventDetails.court_labels.length > 0 && (
                                                <div className="text-xs">
                                                    <span className="text-gray-500 block mb-1">Court Priority Labels (Best &rarr; Worst):</span>
                                                    <span className="text-gray-400 font-semibold block leading-relaxed">{Array.isArray(selectedEventDetails.court_labels) ? selectedEventDetails.court_labels.join(', ') : selectedEventDetails.court_labels}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1.5">Prizes & Licensing</span>
                                        <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-2">
                                            {selectedEventDetails.max_ranking_points && (
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-gray-500">Max Points Limit:</span>
                                                    <span className="text-white font-extrabold">{selectedEventDetails.max_ranking_points} pts</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Back Draw / Plate:</span>
                                                <span className="text-gray-300 font-bold">{selectedEventDetails.back_draw_options || 'Plate Included'}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Licence Required:</span>
                                                <span className="text-white font-bold">{selectedEventDetails.licences_required ? 'Yes' : 'No'}</span>
                                            </div>
                                            {selectedEventDetails.licences_required && selectedEventDetails.licence_types && selectedEventDetails.licence_types.length > 0 && (
                                                <div className="text-xs border-t border-white/5 pt-2 mt-1">
                                                    <span className="text-gray-500 block mb-1">Required Licences:</span>
                                                    <span className="text-gray-300 font-semibold">{Array.isArray(selectedEventDetails.licence_types) ? selectedEventDetails.licence_types.join(', ') : selectedEventDetails.licence_types}</span>
                                                </div>
                                            )}
                                            {selectedEventDetails.prize_money_breakdown && (
                                                <div className="text-xs border-t border-white/5 pt-2 mt-1">
                                                    <span className="text-gray-500 block mb-1">Prize Breakdown:</span>
                                                    <span className="text-gray-400 font-medium block leading-relaxed">{selectedEventDetails.prize_money_breakdown}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {selectedEventDetails.sponsors_names && selectedEventDetails.sponsors_names.length > 0 && (
                                        <div>
                                            <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1.5">Sponsor Brands</span>
                                            <div className="bg-black/30 border border-white/5 p-4 rounded-2xl">
                                                <span className="text-xs text-white font-bold">{Array.isArray(selectedEventDetails.sponsors_names) ? selectedEventDetails.sponsors_names.join(', ') : selectedEventDetails.sponsors_names}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Additional Notes Render */}
                            {selectedEventDetails.additional_notes && (
                                <div className="mt-6 text-left">
                                    <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1.5">Additional Notes (For Players)</span>
                                    <div className="bg-black/40 border border-white/5 p-5 rounded-2xl text-xs text-gray-300 leading-relaxed font-semibold">
                                        {selectedEventDetails.additional_notes}
                                    </div>
                                </div>
                            )}

                            {/* Details & Regulations Rich Text Render */}
                            {selectedEventDetails.description && (
                                <div className="mt-6 text-left">
                                    <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1.5">Tournament Regulations & Overview</span>
                                    <div className="bg-black/40 border border-white/5 p-5 rounded-2xl text-sm text-gray-300 max-h-48 overflow-y-auto custom-scrollbar leading-relaxed">
                                        <div
                                            dangerouslySetInnerHTML={{ __html: selectedEventDetails.description }}
                                            className="prose prose-invert max-w-none text-gray-300 text-xs"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Actions Footer */}
                            <div className="mt-8 pt-5 border-t border-white/5 flex flex-col sm:flex-row gap-3 justify-end">
                                <button
                                    onClick={() => setSelectedEventDetails(null)}
                                    className="px-6 py-3.5 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
                                >
                                    Close Preview
                                </button>
                                <button
                                    onClick={() => {
                                        openRejectionModal('event', selectedEventDetails.id, selectedEventDetails.organizations?.contact_email || selectedEventDetails.organizer_email || '', selectedEventDetails.event_name);
                                        setSelectedEventDetails(null);
                                    }}
                                    className="px-6 py-3.5 bg-red-500/10 hover:bg-red-500 hover:text-black border border-red-500/20 text-red-400 font-bold uppercase tracking-wider text-xs rounded-xl transition-all cursor-pointer"
                                >
                                    Decline Request
                                </button>
                                <button
                                    onClick={() => {
                                        handleApproveEvent(selectedEventDetails);
                                        setSelectedEventDetails(null);
                                    }}
                                    className="px-8 py-3.5 bg-padel-green text-black font-black uppercase tracking-widest text-xs rounded-xl hover:shadow-[0_0_20px_rgba(154,233,0,0.3)] hover:scale-105 transition-all cursor-pointer"
                                >
                                    ✓ Sanction & Publish Live
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ========================================================
                SUPER ADMIN VIEW HOST CLUB INFORMATION MODAL
               ======================================================== */}
            <AnimatePresence>
                {selectedOrgDetails && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            className="max-w-md w-full bg-[#0F172A] border border-white/10 rounded-3xl p-6 relative shadow-2xl space-y-6 text-left"
                        >
                            <button
                                onClick={() => setSelectedOrgDetails(null)}
                                className="absolute top-5 right-5 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                            >
                                <X size={16} />
                            </button>

                            {/* Logo & Header */}
                            <div className="flex items-center gap-4">
                                {selectedOrgDetails.logo_url ? (
                                    <img
                                        src={selectedOrgDetails.logo_url}
                                        alt={selectedOrgDetails.name}
                                        className="w-16 h-16 rounded-2xl object-cover bg-black/20 border border-white/10 shrink-0 shadow-lg"
                                    />
                                ) : (
                                    <div className="w-16 h-16 bg-padel-green/10 text-padel-green rounded-2xl flex items-center justify-center shrink-0 border border-padel-green/20 shadow-lg">
                                        <Building size={28} />
                                    </div>
                                )}
                                <div className="truncate">
                                    <h3 className="font-extrabold text-white text-lg truncate">{selectedOrgDetails.name}</h3>
                                    <span className={`inline-flex px-2 py-0.5 mt-1 rounded text-[10px] font-black uppercase tracking-wider border ${selectedOrgDetails.status === 'approved'
                                        ? 'bg-padel-green/10 text-padel-green border-padel-green/20'
                                        : selectedOrgDetails.status === 'pending'
                                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                                        }`}>
                                        {selectedOrgDetails.status || 'pending'}
                                    </span>
                                </div>
                            </div>

                            {/* Details List */}
                            <div className="space-y-4 pt-2">
                                <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider">Host Club Information</span>
                                <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-3.5">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-500">Applicant / Owner:</span>
                                        <span className="text-white font-bold">{selectedOrgDetails.players?.name || 'Unknown User'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs border-t border-white/5 pt-3">
                                        <span className="text-gray-500">Contact Email:</span>
                                        <a href={`mailto:${selectedOrgDetails.contact_email}`} className="text-padel-green hover:underline font-semibold">
                                            {selectedOrgDetails.contact_email}
                                        </a>
                                    </div>
                                    {selectedOrgDetails.contact_phone && (
                                        <div className="flex justify-between items-center text-xs border-t border-white/5 pt-3">
                                            <span className="text-gray-500">Contact Phone:</span>
                                            <a href={`tel:${selectedOrgDetails.contact_phone}`} className="text-white hover:text-padel-green font-semibold transition-colors">
                                                {selectedOrgDetails.contact_phone}
                                            </a>
                                        </div>
                                    )}
                                    {selectedOrgDetails.website_url && (
                                        <div className="flex justify-between items-center text-xs border-t border-white/5 pt-3">
                                            <span className="text-gray-500">Website:</span>
                                            <a
                                                href={selectedOrgDetails.website_url.startsWith('http') ? selectedOrgDetails.website_url : `https://${selectedOrgDetails.website_url}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-padel-green hover:underline font-semibold"
                                            >
                                                {selectedOrgDetails.website_url.replace(/^https?:\/\/(www\.)?/, '')} <ExternalLink size={10} />
                                            </a>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-xs border-t border-white/5 pt-3">
                                        <span className="text-gray-500">Registered Date:</span>
                                        <span className="text-gray-300 font-medium">
                                            {new Date(selectedOrgDetails.created_at).toLocaleDateString('en-ZA', {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric'
                                            })}
                                        </span>
                                    </div>
                                    {selectedOrgDetails.approved_at && (
                                        <div className="flex justify-between items-center text-xs border-t border-white/5 pt-3">
                                            <span className="text-gray-500">Approved Date:</span>
                                            <span className="text-gray-300 font-medium">
                                                {new Date(selectedOrgDetails.approved_at).toLocaleDateString('en-ZA', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Rejection notes if applicable */}
                            {selectedOrgDetails.status === 'rejected' && selectedOrgDetails.rejection_notes && (
                                <div className="space-y-2">
                                    <span className="block text-red-400 text-[10px] font-black uppercase tracking-wider">Federation Review Feedback</span>
                                    <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-2xl text-xs text-red-200 leading-relaxed font-medium">
                                        {selectedOrgDetails.rejection_notes}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="pt-2">
                                <button
                                    onClick={() => setSelectedOrgDetails(null)}
                                    className="w-full py-3.5 bg-white/5 hover:bg-white/10 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer text-center"
                                >
                                    Close Details
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ========================================================
                SUPER ADMIN REJECTION NOTES MODAL
               ======================================================== */}
            <AnimatePresence>
                {rejectionModal.isOpen && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            className="max-w-md w-full bg-[#0F172A] border border-white/10 rounded-3xl p-6 relative shadow-2xl"
                        >
                            <button
                                onClick={() => setRejectionModal({ isOpen: false, type: '', targetId: null, targetEmail: '', targetName: '', notes: '' })}
                                className="absolute top-5 right-5 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                            >
                                <X size={16} />
                            </button>

                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center shrink-0">
                                    <AlertCircle size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-md">Provide Feedback Notes</h3>
                                    <p className="text-gray-500 text-xs mt-0.5">Explain review requirements to the host</p>
                                </div>
                            </div>

                            <form onSubmit={handleRejectionSubmit} className="space-y-4 text-left">
                                <div>
                                    <span className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Target Item</span>
                                    <div className="bg-black/30 border border-white/5 p-3.5 rounded-xl">
                                        <span className="font-bold text-white block text-sm">{rejectionModal.targetName}</span>
                                        <span className="text-xs text-gray-500 block mt-0.5">{rejectionModal.targetEmail}</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Reviewer Notes</label>
                                    <textarea
                                        rows={4}
                                        required
                                        value={rejectionModal.notes}
                                        onChange={(e) => setRejectionModal(prev => ({ ...prev, notes: e.target.value }))}
                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 text-sm transition-colors resize-none"
                                        placeholder="Specific instructions or notes about the rejection details..."
                                    />
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setRejectionModal({ isOpen: false, type: '', targetId: null, targetEmail: '', targetName: '', notes: '' })}
                                        className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold text-xs py-3.5 rounded-xl transition-all cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 bg-red-500 hover:bg-red-600 text-black font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-all cursor-pointer"
                                    >
                                        Send Decline Email
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ========================================================
                TOURNAMENT ENTRIES & BREAKDOWN INSPECTOR MODAL
               ======================================================== */}
            <AnimatePresence>
                {selectedEventEntries && (
                    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[210] flex items-center justify-center p-4 overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="max-w-4xl w-full bg-[#0B0F19]/95 border border-white/10 rounded-3xl p-6 md:p-8 relative shadow-2xl my-8 max-h-[90vh] overflow-y-auto custom-scrollbar text-left flex flex-col gap-6"
                        >
                            {/* Ambient Glows */}
                            <div className="absolute -top-12 -right-12 w-48 h-48 bg-purple-500/10 blur-[80px] rounded-full pointer-events-none" />
                            <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-padel-green/5 blur-[80px] rounded-full pointer-events-none" />

                            {/* Close Button */}
                            <button
                                onClick={() => {
                                    setSelectedEventEntries(null);
                                    setEntriesSearchQuery('');
                                }}
                                className="absolute top-5 right-5 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>

                            {/* Header details */}
                            <div className="flex flex-col gap-1 pr-8">
                                <span className="text-[10px] text-padel-green font-black uppercase tracking-widest">Tournament Administration</span>
                                <h3 className="text-xl md:text-2xl font-black text-white leading-tight">
                                    {selectedEventEntries.event_name}
                                </h3>
                                <p className="text-xs text-gray-400 mt-1">
                                    Entries Breakdown, Categories Analysis and Registered Players for the tournament
                                </p>
                            </div>

                            {/* Core Performance / Admin Metrics Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex items-center gap-4 shadow-inner relative overflow-hidden">
                                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                                        <Users size={20} />
                                    </div>
                                    <div>
                                        <span className="text-gray-500 text-[10px] font-black uppercase tracking-wider block">Total Registrations</span>
                                        <span className="text-2xl font-black text-white mt-1 block">
                                            {entriesMetrics.totalPlayers} <span className="text-xs text-gray-500 font-bold">players</span>
                                        </span>
                                    </div>
                                </div>

                                <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex items-center gap-4 shadow-inner relative overflow-hidden">
                                    <div className="w-12 h-12 rounded-xl bg-padel-green/10 border border-padel-green/20 flex items-center justify-center text-padel-green">
                                        <Trophy size={20} />
                                    </div>
                                    <div>
                                        <span className="text-gray-500 text-[10px] font-black uppercase tracking-wider block">Unique Teams</span>
                                        <span className="text-2xl font-black text-white mt-1 block">
                                            {entriesMetrics.uniqueTeams} <span className="text-xs text-gray-500 font-bold">pairs</span>
                                        </span>
                                    </div>
                                </div>

                                <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex items-center gap-4 shadow-inner relative overflow-hidden">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                                        <DollarSign size={20} />
                                    </div>
                                    <div>
                                        <span className="text-gray-500 text-[10px] font-black uppercase tracking-wider block">Est. Revenue (Paid)</span>
                                        <span className="text-2xl font-black text-emerald-400 mt-1 block">
                                            R {entriesMetrics.estimatedRevenue.toLocaleString('en-ZA')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Category Breakdown badging list */}
                            <div className="space-y-2.5">
                                <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider">Division Entry Analysis</span>
                                {Object.keys(entriesMetrics.divisionBreakdown).length === 0 ? (
                                    <div className="text-xs text-gray-500 font-medium py-2">
                                        No player registrations recorded under any categories yet.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                        {Object.entries(entriesMetrics.divisionBreakdown).map(([divName, data]) => (
                                            <div 
                                                key={divName} 
                                                className="bg-black/35 border border-white/5 p-3 rounded-xl flex flex-col justify-between gap-1 shadow"
                                            >
                                                <span className="text-xs font-extrabold text-white truncate block">{divName}</span>
                                                <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1.5 pt-1.5 border-t border-white/5">
                                                    <span>{data.players} Players ({data.teams} Teams)</span>
                                                    <span className="text-emerald-400 font-black">R {data.revenue}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Registered Players searchable datagrid */}
                            <div className="space-y-4 pt-2">
                                {/* Top bar: label + search */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <span className="text-gray-500 text-[10px] font-black uppercase tracking-wider shrink-0">
                                        Live Registered Entries ({filteredEntries.length})
                                    </span>
                                    {/* Search input */}
                                    <div className="relative w-full sm:max-w-xs shrink-0">
                                        <input
                                            type="text"
                                            value={entriesSearchQuery}
                                            onChange={(e) => setEntriesSearchQuery(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 text-white rounded-xl pl-4 pr-10 py-2 focus:outline-none focus:border-padel-green text-xs transition-colors placeholder:text-gray-600 font-semibold"
                                            placeholder="Search name, email..."
                                        />
                                        {entriesSearchQuery && (
                                            <button
                                                onClick={() => setEntriesSearchQuery('')}
                                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Division filter pills */}
                                {Object.keys(entriesMetrics.divisionBreakdown).length > 1 && (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setEntriesDivisionFilter('all')}
                                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                                                entriesDivisionFilter === 'all'
                                                    ? 'bg-padel-green text-black border-padel-green'
                                                    : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/25'
                                            }`}
                                        >
                                            All Divisions
                                        </button>
                                        {Object.keys(entriesMetrics.divisionBreakdown).map(div => (
                                            <button
                                                key={div}
                                                onClick={() => setEntriesDivisionFilter(div === entriesDivisionFilter ? 'all' : div)}
                                                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                                                    entriesDivisionFilter === div
                                                        ? 'bg-purple-500 text-white border-purple-500'
                                                        : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/25'
                                                }`}
                                            >
                                                {div}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Entry cards — no table, fully responsive */}
                                <div className="space-y-2">
                                    {isLoadingEntries ? (
                                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500 text-xs">
                                            <RefreshCw size={24} className="animate-spin text-padel-green" />
                                            <span>Loading entry breakdown datasets...</span>
                                        </div>
                                    ) : filteredEntries.length === 0 ? (
                                        <div className="text-center py-10 text-gray-500 text-xs font-semibold border border-white/5 rounded-2xl">
                                            {entriesSearchQuery || entriesDivisionFilter !== 'all'
                                                ? 'No registrations match your filters.'
                                                : 'No entries found for this tournament yet.'}
                                        </div>
                                    ) : (
                                        filteredEntries.map((entry) => {
                                            const initials = entry.full_name
                                                ? entry.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                                                : 'P';
                                            return (
                                                <div
                                                    key={entry.id}
                                                    className="bg-black/30 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all"
                                                >
                                                    {/* Row 1: Avatar + Name + Payment badge */}
                                                    <div className="flex items-center gap-3 mb-3">
                                                        {entry.players?.profile_image ? (
                                                            <img
                                                                src={entry.players.profile_image}
                                                                alt={entry.full_name}
                                                                className="w-10 h-10 rounded-xl object-cover border border-white/10 shrink-0"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-extrabold text-[11px] shrink-0">
                                                                {initials}
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <span className="font-extrabold text-white text-sm block truncate leading-tight">{entry.full_name}</span>
                                                            <span className="text-[10px] text-gray-500 block truncate leading-tight mt-0.5">{entry.email}</span>
                                                        </div>
                                                        <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                                                            entry.is_paid
                                                                ? 'bg-padel-green/10 text-padel-green border-padel-green/20'
                                                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                        }`}>
                                                            {entry.is_paid ? 'Paid ✓' : 'Unpaid'}
                                                        </span>
                                                    </div>

                                                    {/* Row 2: Division + Contact + Partner */}
                                                    <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                                        {/* Division pill */}
                                                        <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 font-bold text-gray-300 whitespace-nowrap">
                                                            {entry.class_name}
                                                        </span>
                                                        {/* Contact */}
                                                        {entry.players?.contact_number && (
                                                            <span className="text-gray-500 font-semibold whitespace-nowrap">
                                                                📞 {entry.players.contact_number}
                                                            </span>
                                                        )}
                                                        {/* Partner */}
                                                        {entry.metadata?.partner_name && (
                                                            <span className="text-gray-400 font-bold whitespace-nowrap">
                                                                🤝 {entry.metadata.partner_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Footer block */}
                            <div className="border-t border-white/5 pt-4 flex justify-end">
                                <button
                                    onClick={() => {
                                        setSelectedEventEntries(null);
                                        setEntriesSearchQuery('');
                                        setEntriesDivisionFilter('all');
                                    }}
                                    className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer"
                                >
                                    Close Entries Panel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default OrganisationManager;
