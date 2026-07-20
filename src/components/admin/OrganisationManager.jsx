import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { sendEmail } from '../../utils/emails';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    Building, Users, Trophy, Calendar, Plus, Check, X,
    AlertCircle, RefreshCw, Mail, Phone, Edit3, Trash2, ArrowLeft,
    ShieldCheck, CheckCircle2, ChevronRight, MessageSquare, Globe, PlusCircle, HelpCircle,
    ChevronDown, Eye, Edit, ExternalLink, ScrollText, LayoutDashboard
} from 'lucide-react';
import RichTextEditor from './RichTextEditor';
import OrgMembersManager from './OrgMembersManager';
import EventBuilder from './EventBuilder';
import OrgProfileEditor from './OrgProfileEditor';
import CreateOrganisationModal from './CreateOrganisationModal';
import OrgAuditLog from './OrgAuditLog';
import ManualEventRegistrations from './ManualEventRegistrations';
import { sanitizeHtml } from '../../utils/sanitizeHtml';

const CollapsibleSection = ({
    open,
    onToggle,
    title,
    icon: Icon,
    iconClassName = 'text-padel-green',
    count,
    badge,
    subtitle,
    borderClassName = 'border-white/10',
    children,
}) => (
    <div className={`bg-white/[0.02] border ${borderClassName} backdrop-blur-md rounded-2xl shadow-xl overflow-hidden`}>
        <button
            type="button"
            onClick={onToggle}
            className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
            <h3 className="text-lg font-bold text-white flex items-center gap-2 min-w-0 flex-wrap">
                {Icon && <Icon size={18} className={`shrink-0 ${iconClassName}`} />}
                <span>{title}{count !== undefined ? ` (${count})` : ''}</span>
                {badge && (
                    <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                        {badge}
                    </span>
                )}
                {subtitle && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        {subtitle}
                    </span>
                )}
            </h3>
            <ChevronDown
                size={18}
                className={`text-gray-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            />
        </button>
        <AnimatePresence initial={false}>
            {open && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                >
                    <div className="px-6 pb-6 border-t border-white/5 pt-4">
                        {children}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
);

const OrganisationManager = ({ permissions, initialView = 'platform', onViewChange }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('overview'); // overview, create-event, my-events
    const [orgEvents, setOrgEvents] = useState([]);
    const [membersOrg, setMembersOrg] = useState(null); // org whose members are being managed

    // New EventBuilder modal (replaces the legacy inline wizard for org hosts)
    const [builderOpen, setBuilderOpen] = useState(false);
    const [builderEvent, setBuilderEvent] = useState(null);

    // Super Admin oversight states
    const [allOrgs, setAllOrgs] = useState([]);
    const [pendingEvents, setPendingEvents] = useState([]);
    const [pendingAmendments, setPendingAmendments] = useState([]);
    const [amendmentDiff, setAmendmentDiff] = useState(null); // event whose amendment is being reviewed
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
    const [orgDetailsMode, setOrgDetailsMode] = useState('view'); // 'view' | 'edit'
    const [createOrgOpen, setCreateOrgOpen] = useState(false);
    const [editingEventId, setEditingEventId] = useState(null);
    const [approvedEvents, setApprovedEvents] = useState([]);
    const [approvedEventsSearch, setApprovedEventsSearch] = useState('');

    // Telemetry State Hooks for Tournament Entries & Breakdown Modal
    const [selectedEventEntries, setSelectedEventEntries] = useState(null);
    const [managingEvent, setManagingEvent] = useState(null); // full Event Manager for org hosts
    const [eventEntriesList, setEventEntriesList] = useState([]);
    const [isLoadingEntries, setIsLoadingEntries] = useState(false);
    const [entriesSearchQuery, setEntriesSearchQuery] = useState('');
    const [entriesDivisionFilter, setEntriesDivisionFilter] = useState('all');
    // Live participant counts per event (keyed by event id)
    const [participantCounts, setParticipantCounts] = useState({});

    /** Open the full event manager for an org-hosted event (no separate Event Manager module access needed). */
    const openEventManager = (ev) => {
        if (!ev?.id) return;
        setSelectedEventDetails(null);
        setSelectedEventEntries(null);
        setManagingEvent(ev);
    };

    const [sectionOpen, setSectionOpen] = useState({
        pendingOrgs: true,
        pendingEvents: true,
        pendingAmendments: true,
        approvedEvents: false,
        approvedHosts: false,
        auditLog: false,
    });

    const toggleSection = (key) => {
        setSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    };

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





    // Address geocoding autocomplete states




    // Derived flags
    // Oversight view: super admins OR custom 4M admins granted the Organisations tab
    const canAccessPlatformOversight = permissions?.role === 'super_admin'
        || (permissions?.role !== 'org_owner' && (permissions?.allowed_tabs || []).includes('organisations'));
    // Linked membership org (host membership), including for super admins
    const membershipOrg = permissions?.org;
    // Platform admins can temporarily open any approved org's host dashboard
    const [impersonatedOrg, setImpersonatedOrg] = useState(null);
    const currentOrg = impersonatedOrg || membershipOrg;
    const hasLinkedOrg = Boolean(currentOrg?.id);
    const isImpersonatingOrg = Boolean(impersonatedOrg?.id)
        && impersonatedOrg.id !== membershipOrg?.id;
    const [portalMode, setPortalMode] = useState(() => {
        if (initialView === 'host' && (membershipOrg?.id || impersonatedOrg?.id)) return 'host';
        if (!canAccessPlatformOversight && membershipOrg?.id) return 'host';
        return 'platform';
    });

    // Keep portal mode in sync when permissions / deep-link view arrive
    useEffect(() => {
        if (initialView === 'host' && (membershipOrg?.id || impersonatedOrg?.id)) {
            setPortalMode('host');
        } else if (!canAccessPlatformOversight && membershipOrg?.id) {
            setPortalMode('host');
        } else if (canAccessPlatformOversight && !membershipOrg?.id && !impersonatedOrg?.id) {
            setPortalMode('platform');
        }
    }, [initialView, membershipOrg?.id, impersonatedOrg?.id, canAccessPlatformOversight]);

    const handlePortalModeChange = (mode) => {
        setPortalMode(mode);
        setManagingEvent(null);
        if (mode === 'platform') setImpersonatedOrg(null);
        onViewChange?.(mode);
        try {
            const params = new URLSearchParams(window.location.search);
            params.set('tab', 'organisations');
            if (mode === 'host') params.set('view', 'host');
            else {
                params.delete('view');
                params.delete('org');
            }
            const next = `${window.location.pathname}?${params.toString()}`;
            window.history.replaceState({}, '', next);
        } catch (_) { /* ignore */ }
    };

    /** Open an organisation's host dashboard (create events, manage entries, settings). */
    const openOrgDashboard = (org) => {
        if (!org?.id) return;
        if (org.status && org.status !== 'approved') {
            toast.error('Only approved organisations have a host dashboard.');
            return;
        }
        setManagingEvent(null);
        setImpersonatedOrg(org);
        setPortalMode('host');
        setActiveSection('overview');
        setSelectedOrgDetails(null);
        setOrgDetailsMode('view');
        onViewChange?.('host');
        try {
            const params = new URLSearchParams(window.location.search);
            params.set('tab', 'organisations');
            params.set('view', 'host');
            params.set('org', org.slug || org.id);
            const next = `${window.location.pathname}?${params.toString()}`;
            window.history.replaceState({}, '', next);
        } catch (_) { /* ignore */ }
        toast.success(`Opened ${org.name} dashboard`);
    };

    // True when currently rendering the platform oversight panels
    const isSuperAdmin = canAccessPlatformOversight && portalMode === 'platform';
    // True when currently rendering the host org dashboard
    const isHostView = portalMode === 'host' && hasLinkedOrg;

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
            const filePath = `organisations/logos/${fileName}`;

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
                .from('organisations')
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

    // Paginate through participant tables to build accurate per-event counts
    // (avoids Supabase 1000-row default limit breaking bulk .in() queries)
    const fetchAllParticipantCounts = async () => {
        const tpCounts = {};
        const regCounts = {};
        const pageSize = 1000;

        let from = 0;
        while (true) {
            const { data, error } = await supabase
                .from('tournament_participants')
                .select('event_id')
                .range(from, from + pageSize - 1);

            if (error) throw error;
            (data || []).forEach(r => {
                tpCounts[r.event_id] = (tpCounts[r.event_id] || 0) + 1;
            });
            if (!data || data.length < pageSize) break;
            from += pageSize;
        }

        from = 0;
        while (true) {
            const { data, error } = await supabase
                .from('event_registrations')
                .select('event_id')
                .eq('payment_status', 'paid')
                .range(from, from + pageSize - 1);

            if (error) throw error;
            (data || []).forEach(r => {
                regCounts[r.event_id] = (regCounts[r.event_id] || 0) + 1;
            });
            if (!data || data.length < pageSize) break;
            from += pageSize;
        }

        const merged = { ...tpCounts };
        Object.entries(regCounts).forEach(([eventId, count]) => {
            const id = Number(eventId);
            merged[id] = Math.max(merged[id] || 0, count);
        });

        return merged;
    };

    const fetchHostData = async () => {
        if (!currentOrg) return;
        setLoading(true);
        try {
            const { data: events, error } = await supabase
                .from('calendar')
                .select('*')
                .eq('organisation_id', currentOrg.id)
                .order('start_date', { ascending: false });

            if (error) throw error;
            const evList = events || [];
            setOrgEvents(evList);

            // Fetch live participant counts (paginated — not limited to first 1000 rows)
            if (evList.length > 0) {
                const allCounts = await fetchAllParticipantCounts();
                const eventIds = new Set(evList.map(e => e.id));
                const counts = {};
                eventIds.forEach(id => {
                    if (allCounts[id]) counts[id] = allCounts[id];
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
            // 1. Fetch all organisations
            const { data: orgs, error: orgsError } = await supabase
                .from('organisations')
                .select('*, players!created_by(name, account_type)')
                .order('created_at', { ascending: false });

            if (orgsError) throw orgsError;
            setAllOrgs(orgs || []);

            // 2. Fetch all events pending sanctioning
            const { data: events, error: eventsError } = await supabase
                .from('calendar')
                .select('*, organisations(name, contact_email)')
                .eq('sanction_status', 'pending')
                .order('id', { ascending: false });

            if (eventsError) throw eventsError;
            setPendingEvents(events || []);

            // 2.5 Fetch all approved events
            const { data: approvedEvs, error: approvedEvsError } = await supabase
                .from('calendar')
                .select('*, organisations(name, contact_email)')
                .eq('sanction_status', 'approved')
                .order('id', { ascending: false });

            if (approvedEvsError) throw approvedEvsError;
            setApprovedEvents(approvedEvs || []);

            // 2.6 Pending amendment requests on approved org events
            const { data: amendments, error: amendmentsError } = await supabase
                .from('calendar')
                .select('*, organisations(name, contact_email)')
                .eq('pending_changes_status', 'pending')
                .order('pending_changes_submitted_at', { ascending: true });

            if (amendmentsError) throw amendmentsError;
            setPendingAmendments(amendments || []);

            // Fetch live participant counts (paginated — not limited to first 1000 rows)
            const allCounts = await fetchAllParticipantCounts();
            setParticipantCounts(allCounts);

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
        } else if (isHostView) {
            fetchHostData();
        } else if (canAccessPlatformOversight) {
            fetchSuperAdminData();
        } else {
            fetchHostData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permissions, portalMode, currentOrg?.id]);

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
                        .select('id, contact_number, image_url')
                        .in('id', profileIds);

                    if (profileError) {
                        console.warn('Could not enrich with player profiles:', profileError.message);
                    } else {
                        (playerProfiles || []).forEach(p => { playerMap[p.id] = p; });
                    }
                }

                // Step 3: Merge participant + profile data
                let enriched = (participants || []).map(p => ({
                    ...p,
                    players: playerMap[p.profile_id] || null
                }));

                // Also include paid event_registrations (merge, not replace)
                const { data: legacyRegs, error: legacyError } = await supabase
                    .from('event_registrations')
                    .select('id, full_name, email, division, payment_status, partner_name')
                    .eq('event_id', selectedEventEntries.id)
                    .eq('payment_status', 'paid')
                    .order('full_name', { ascending: true });

                if (legacyError) {
                    console.warn('Could not load event_registrations fallback:', legacyError.message);
                }

                const existingKeys = new Set(
                    enriched.map(e => `${(e.email || '').toLowerCase()}|${e.class_name || ''}`)
                );

                (legacyRegs || []).forEach(r => {
                    const key = `${(r.email || '').toLowerCase()}|${r.division || ''}`;
                    if (!existingKeys.has(key)) {
                        enriched.push({
                            id: r.id,
                            profile_id: null,
                            full_name: r.full_name,
                            email: r.email,
                            class_name: r.division,
                            is_paid: true,
                            metadata: { partner_name: r.partner_name },
                            rankedin_participant_id: null,
                            players: null
                        });
                        existingKeys.add(key);
                    }
                });

                enriched.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

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

    // Super Admin only — permanently delete an organisation
    const handleDeleteOrganisation = async (org) => {
        if (permissions?.role !== 'super_admin') {
            toast.error('Only super admins can delete organisations.');
            return;
        }
        if (!org?.id) return;

        if (!window.confirm(`Permanently delete "${org.name}"?\n\nLinked events will be unlinked (not deleted). Members will be removed. This cannot be undone.`)) {
            return;
        }
        const typed = window.prompt(`Type the organisation name to confirm:\n${org.name}`);
        if (typed !== org.name) {
            if (typed != null) toast.error('Name did not match. Delete cancelled.');
            return;
        }

        try {
            await supabase.from('albums').update({ organisation_id: null }).eq('organisation_id', org.id);
            await supabase.from('calendar').update({ organisation_id: null }).eq('organisation_id', org.id);
            await supabase.from('organisation_members').delete().eq('organisation_id', org.id);

            const { error } = await supabase
                .from('organisations')
                .delete()
                .eq('id', org.id);
            if (error) throw error;

            toast.success(`"${org.name}" has been deleted.`);
            setSelectedOrgDetails(null);
            setOrgDetailsMode('view');
            fetchSuperAdminData();
        } catch (err) {
            console.error('Organisation delete failed:', err);
            toast.error(`Delete failed: ${err.message}`);
        }
    };

    // Super Admin - Approve Host Organisation
    const handleApproveOrg = async (orgId, applicantEmail, orgName) => {
        try {
            const { error } = await supabase
                .from('organisations')
                .update({
                    status: 'approved',
                    approved_at: new Date().toISOString(),
                    // Approval = verification (badges on the public org page)
                    verified: true,
                    sapa_sanctioned: true
                })
                .eq('id', orgId);

            if (error) throw error;

            // Auto-assign the applicant as the organisation OWNER in organisation_members
            try {
                const approvedOrg = allOrgs.find(o => o.id === orgId);
                const { error: memberError } = await supabase
                    .from('organisation_members')
                    .upsert({
                        organisation_id: orgId,
                        player_id: approvedOrg?.created_by || null,
                        user_email: applicantEmail,
                        role: 'owner'
                    }, { onConflict: 'organisation_id,user_email' });
                if (memberError) console.warn('Owner membership assignment warning:', memberError);
            } catch (memberErr) {
                console.warn('Owner membership assignment failed (non-fatal):', memberErr);
            }

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
            if (event.organisations?.contact_email) {
                sendEmail(event.organisations.contact_email, 'event_sanctioned', {
                    eventName: event.event_name
                });
            }
        } catch (err) {
            console.error('Approve tournament error:', err);
        }
    };

    // SECURITY: only these keys from an org's amendment draft are ever applied.
    // Privileged fields (visibility, featuring, sanctioning, org linkage) are
    // excluded so a crafted draft cannot escalate via the admin's session.
    const AMENDMENT_ALLOWED_KEYS = [
        'event_name', 'slug', 'organizer_name', 'organizer_logo_url', 'organizer_badge_text',
        'city', 'venue', 'venues', 'address', 'start_date', 'end_date', 'start_time', 'end_time',
        'sapa_status', 'tournament_tag', 'description', 'points', 'points_breakdown',
        'prize_money_total', 'prize_money_breakdown', 'balls', 'courts', 'tournament_director',
        'referees', 'sanctioning_details', 'rules_regs', 'withdrawal_substitution',
        'cut_off_times', 'draw_released', 'contact_details', 'organizer_phone',
        'organizer_email', 'organizer_website', 'custom_image_url', 'poster_image_url', 'sponsor_logos',
        'registration_closes_at', 'registration_opens_at', 'event_dates', 'golden_point', 'scoring_point', 'is_league',
        'max_teams_capacity', 'partner_requirement', 'back_draw_options', 'event_co_admins',
        'allow_payments', 'allow_temporary_license', 'license_required_default', 'collect_tshirt_size', 'entry_fee_notes',
        'indoor_outdoor', 'courts_count'
    ];

    // Super Admin - Approve a draft amendment: apply payload + divisions
    const handleApproveAmendment = async (ev) => {
        const draft = ev.pending_changes;
        if (!draft?.payload) return toast.error('No amendment draft found on this event.');
        try {
            // 1. Apply ONLY whitelisted drafted fields and clear the draft
            const safePayload = Object.fromEntries(
                Object.entries(draft.payload).filter(([k]) => AMENDMENT_ALLOWED_KEYS.includes(k))
            );
            const { error } = await supabase
                .from('calendar')
                .update({
                    ...safePayload,
                    pending_changes: null,
                    pending_changes_status: null,
                    pending_changes_notes: null,
                    pending_changes_submitted_at: null
                })
                .eq('id', ev.id);
            if (error) throw error;

            // 2. Apply division changes
            const removedIds = (draft.removed_division_ids || []).filter(Boolean);
            if (removedIds.length) {
                await supabase.from('tournament_divisions').delete().in('id', removedIds);
            }
            const DIVISION_ALLOWED_KEYS = ['name', 'entry_fee', 'format', 'entries_close_at', 'license_required', 'age_category', 'gender', 'suggested_level', 'entry_limit', 'details', 'sort_order', 'is_active'];
            const rows = draft.divisions || [];
            for (const d of rows) {
                const record = {
                    ...Object.fromEntries(Object.entries(d).filter(([k]) => DIVISION_ALLOWED_KEYS.includes(k))),
                    event_id: ev.id
                };
                if (d.id) {
                    const { error: upErr } = await supabase.from('tournament_divisions').update(record).eq('id', d.id);
                    if (upErr) throw upErr;
                } else {
                    const { error: insErr } = await supabase.from('tournament_divisions').insert([record]);
                    if (insErr) throw insErr;
                }
            }

            toast.success(`Amendment approved & applied: ${ev.event_name} ✅`);
            setAmendmentDiff(null);
            fetchSuperAdminData();

            if (ev.organisations?.contact_email) {
                sendEmail(ev.organisations.contact_email, 'event_sanctioned', {
                    eventName: `Amendment approved — ${draft.payload.event_name || ev.event_name}`
                });
            }
        } catch (err) {
            console.error('Approve amendment error:', err);
            toast.error(`Failed to apply amendment: ${err.message}`);
        }
    };

    // Fields worth surfacing in the amendment review diff
    const AMENDMENT_DIFF_FIELDS = [
        ['event_name', 'Event Name'], ['venue', 'Venue'], ['venues', 'Venues'], ['city', 'City'], ['address', 'Address'],
        ['start_date', 'Start Date'], ['end_date', 'End Date'], ['start_time', 'Start Time'], ['end_time', 'End Time'],
        ['sapa_status', 'Tier'], ['points', 'Points'], ['prize_money_total', 'Prize Money'],
        ['registration_closes_at', 'Registration Closes'], ['description', 'Description'],
        ['balls', 'Balls'], ['courts', 'Courts'], ['tournament_director', 'Tournament Director'],
        ['organizer_phone', 'Organiser Phone'], ['organizer_email', 'Organiser Email'],
    ];

    const getAmendmentChanges = (ev) => {
        const p = ev?.pending_changes?.payload || {};
        const changes = [];
        AMENDMENT_DIFF_FIELDS.forEach(([key, label]) => {
            const oldVal = ev[key];
            const newVal = p[key];
            const norm = (v) => (v === null || v === undefined || v === '') ? '—' : String(v);
            if (key in p && norm(oldVal) !== norm(newVal)) {
                changes.push({ label, from: norm(oldVal), to: norm(newVal) });
            }
        });
        const draftDivs = ev?.pending_changes?.divisions;
        if (draftDivs) {
            changes.push({ label: 'Divisions', from: 'current setup', to: `${draftDivs.length} division(s) in draft` });
        }
        return changes;
    };

    // Host Organiser - open the new EventBuilder (replaces legacy wizard)
    const handleStartEditEvent = (ev) => {
        setBuilderEvent(ev);
        setBuilderOpen(true);
    };

    // Fired when the EventBuilder saves an org event
    const handleBuilderSaved = ({ isNew, isAmendment, eventName, stayOpen } = {}) => {
        // Keep the builder open when the user is save-and-continuing.
        if (!stayOpen) setBuilderEvent(null);
        fetchHostData();
        if (!currentOrg) return;
        if (isNew) {
            // Notify org + 4M admin that a sanction request is in
            sendEmail(currentOrg.contact_email, 'event_pending_sanction', {
                eventName: eventName || 'New event',
                orgName: currentOrg.name
            });
            sendEmail('markstillerman@gmail.com', 'event_pending_sanction', {
                eventName: eventName || 'New event',
                orgName: currentOrg.name
            });
        } else if (isAmendment) {
            // Notify 4M admin an amendment needs review
            sendEmail('markstillerman@gmail.com', 'event_pending_sanction', {
                eventName: `Amendment — ${eventName || 'event'}`,
                orgName: currentOrg.name
            });
        }
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
                    .from('organisations')
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
            } else if (type === 'amendment') {
                // Reject the draft amendment — the live event is untouched;
                // the org keeps the draft (marked rejected) so they can revise.
                const { error } = await supabase
                    .from('calendar')
                    .update({
                        pending_changes_status: 'rejected',
                        pending_changes_notes: notes.trim()
                    })
                    .eq('id', targetId);

                if (error) throw error;

                toast.error(`Declined amendment: ${targetName}`);
                sendEmail(targetEmail, 'event_rejected', {
                    eventName: `Amendment — ${targetName}`,
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
            ev.organisations?.name?.toLowerCase().includes(searchLower) ||
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
                        {isHostView ? (currentOrg?.name || 'Organisation Dashboard') : 'Organisation Portal'}
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                        {isHostView
                            ? (isImpersonatingOrg
                                ? `Managing ${currentOrg?.name} — create events, review entries, and update host settings`
                                : 'Host Dashboard - Create tournaments, configure entry seeds, and inspect entries')
                            : 'Sanction host clubs, approve events, and review platform telemetry'}
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {canAccessPlatformOversight && (membershipOrg || impersonatedOrg) && (
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                            <button
                                type="button"
                                onClick={() => handlePortalModeChange('platform')}
                                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                    portalMode === 'platform'
                                        ? 'bg-amber-500 text-black'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                Platform Overview
                            </button>
                            {(membershipOrg || impersonatedOrg) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (impersonatedOrg) {
                                            handlePortalModeChange('host');
                                        } else if (membershipOrg) {
                                            setImpersonatedOrg(null);
                                            handlePortalModeChange('host');
                                        }
                                    }}
                                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        portalMode === 'host'
                                            ? 'bg-padel-green text-black'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    {isImpersonatingOrg ? currentOrg?.name : 'My Organisation'}
                                </button>
                            )}
                        </div>
                    )}
                    {isImpersonatingOrg && isHostView && (
                        <button
                            type="button"
                            onClick={() => handlePortalModeChange('platform')}
                            className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"
                        >
                            Exit Dashboard
                        </button>
                    )}
                    {permissions?.role === 'super_admin' && isSuperAdmin && (
                        <button
                            type="button"
                            onClick={() => setCreateOrgOpen(true)}
                            className="bg-padel-green text-black font-black uppercase tracking-widest text-xs px-5 py-3 rounded-xl hover:bg-white transition-all flex items-center gap-2 cursor-pointer shadow-lg hover:shadow-padel-green/10"
                        >
                            Create Organisation <Plus size={14} />
                        </button>
                    )}
                    {isHostView && !managingEvent && (
                        <button
                            onClick={() => {
                                setBuilderEvent(null);
                                setBuilderOpen(true);
                            }}
                            className="bg-padel-green text-black font-black uppercase tracking-widest text-xs px-5 py-3 rounded-xl hover:bg-white transition-all flex items-center gap-2 cursor-pointer shadow-lg hover:shadow-padel-green/10"
                        >
                            Create Event <Plus size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* ========================================================
                SUPER ADMIN OVERSIGHT VIEW
               ======================================================== */}
            {isSuperAdmin && !managingEvent && (
                <div className="space-y-8">
                    {/* Platform Summary Stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-slate-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-slate-500/10 transition-colors" />
                            <div className="w-8 h-8 rounded-lg bg-slate-400/10 text-slate-300 flex items-center justify-center mb-3 border border-slate-400/20">
                                <Building size={16} />
                            </div>
                            <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">Total Organisations</span>
                            <div className="text-2xl font-black text-white mt-1">{stats.totalOrgs}</div>
                            <span className="text-[9px] text-slate-500 font-bold block mt-1">SAPA Clubs</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-amber-500/10 transition-colors" />
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3 border border-amber-500/20">
                                <AlertCircle size={16} />
                            </div>
                            <span className="text-[10px] uppercase font-black text-amber-400 tracking-wider block">Pending Organisations</span>
                            <div className="text-2xl font-black text-amber-500 mt-1">{stats.pendingOrgs}</div>
                            <span className="text-[9px] text-amber-400/60 font-bold block mt-1">Need Review</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-padel-green/5 blur-xl rounded-full pointer-events-none group-hover:bg-padel-green/10 transition-colors" />
                            <div className="w-8 h-8 rounded-lg bg-padel-green/10 text-padel-green flex items-center justify-center mb-3 border border-padel-green/20">
                                <ShieldCheck size={16} />
                            </div>
                            <span className="text-[10px] uppercase font-black text-padel-green tracking-wider block">Approved Organisations</span>
                            <div className="text-2xl font-black text-padel-green mt-1">{stats.approvedOrgs}</div>
                            <span className="text-[9px] text-padel-green/60 font-bold block mt-1">Active Approvals</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-purple-500/10 transition-colors" />
                            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3 border border-purple-500/20">
                                <Trophy size={16} />
                            </div>
                            <span className="text-[10px] uppercase font-black text-purple-400 tracking-wider block">Approved Events</span>
                            <div className="text-2xl font-black text-purple-400 mt-1">{stats.totalEvents}</div>
                            <span className="text-[9px] text-purple-400/60 font-bold block mt-1">Live Tournaments</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3 border border-emerald-500/20">
                                <span className="text-sm font-black leading-none">R</span>
                            </div>
                            <span className="text-[10px] uppercase font-black text-emerald-400 tracking-wider block">Gross Entry Revenue</span>
                            <div className="text-2xl font-black text-emerald-400 mt-1">R {stats.totalRevenue.toLocaleString()}</div>
                            <span className="text-[9px] text-emerald-400/60 font-bold block mt-1">Platform Total</span>
                        </div>
                    </div>

                    {/* All organisations — listed first for quick access */}
                    <CollapsibleSection
                        open={sectionOpen.approvedHosts}
                        onToggle={() => toggleSection('approvedHosts')}
                        title="All Organisations"
                        icon={Building}
                        count={allOrgs.length}
                    >
                        {allOrgs.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">No organisations registered yet.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {allOrgs.map((org) => (
                                    <button
                                        key={org.id}
                                        type="button"
                                        onClick={() => {
                                            setOrgDetailsMode('view');
                                            setSelectedOrgDetails(org);
                                        }}
                                        className="bg-black/30 hover:bg-black/50 border border-white/5 hover:border-padel-green/30 p-4 rounded-xl flex items-center gap-3 w-full text-left transition-all duration-200 cursor-pointer"
                                    >
                                        {org.logo_url ? (
                                            <img src={org.logo_url} alt={org.name} className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0" />
                                        ) : (
                                            <div className="w-10 h-10 bg-padel-green/10 text-padel-green rounded-lg flex items-center justify-center shrink-0">
                                                <Building size={16} />
                                            </div>
                                        )}
                                        <div className="truncate flex-1 min-w-0">
                                            <span className="font-bold text-sm text-white block truncate">{org.name}</span>
                                            <span className="text-[10px] text-gray-500 block truncate">{org.contact_email}</span>
                                            <span className={`inline-block mt-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                                                org.status === 'approved'
                                                    ? 'bg-padel-green/10 text-padel-green border-padel-green/20'
                                                    : org.status === 'pending'
                                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                                            }`}>
                                                {org.status || 'pending'}
                                            </span>
                                        </div>
                                        <ChevronRight size={14} className="text-gray-600 shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </CollapsibleSection>

                    {/* Pending Organisation Applications */}
                    <CollapsibleSection
                        open={sectionOpen.pendingOrgs}
                        onToggle={() => toggleSection('pendingOrgs')}
                        title="Pending Organisation Applications"
                        icon={Building}
                        iconClassName="text-amber-500"
                        count={allOrgs.filter(o => o.status === 'pending').length}
                    >
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
                    </CollapsibleSection>

                    {/* Pending Tournament Sanctioning Requests */}
                    <CollapsibleSection
                        open={sectionOpen.pendingEvents}
                        onToggle={() => toggleSection('pendingEvents')}
                        title="Pending Tournament Requests"
                        icon={Trophy}
                        iconClassName="text-purple-400"
                        count={pendingEvents.length}
                    >
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
                                                    <span className="font-medium text-white block">{ev.organisations?.name || 'Unknown Club'}</span>
                                                    <span className="text-xs text-gray-500 block mt-0.5">{ev.organisations?.contact_email}</span>
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
                                                            onClick={() => openRejectionModal('event', ev.id, ev.organisations?.contact_email || '', ev.event_name)}
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
                    </CollapsibleSection>

                    {/* Pending Amendment Requests on approved events */}
                    {pendingAmendments.length > 0 && (
                        <CollapsibleSection
                            open={sectionOpen.pendingAmendments}
                            onToggle={() => toggleSection('pendingAmendments')}
                            title="Amendment Requests"
                            icon={Edit3}
                            iconClassName="text-amber-400"
                            count={pendingAmendments.length}
                            subtitle="Live events — changes held until approved"
                            borderClassName="border-amber-500/20"
                        >
                            <div className="space-y-3">
                                {pendingAmendments.map((ev) => (
                                    <div key={ev.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-black/30 border border-white/5 p-4 rounded-xl">
                                        <div className="min-w-0">
                                            <span className="font-bold text-white block truncate">{ev.event_name}</span>
                                            <span className="text-xs text-gray-500 block mt-0.5">
                                                {ev.organisations?.name || 'Unknown host'} · submitted {ev.pending_changes_submitted_at ? new Date(ev.pending_changes_submitted_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—'}
                                                · {getAmendmentChanges(ev).length} change(s)
                                            </span>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <button
                                                onClick={() => setAmendmentDiff(ev)}
                                                className="bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 font-black uppercase tracking-wider text-[10px] px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                                            >
                                                <Eye size={12} /> Review Changes
                                            </button>
                                            <button
                                                onClick={() => handleApproveAmendment(ev)}
                                                className="bg-padel-green text-black font-black uppercase tracking-wider text-[10px] px-3.5 py-2 rounded-lg hover:bg-white transition-all cursor-pointer flex items-center gap-1"
                                            >
                                                <Check size={12} /> Approve & Apply
                                            </button>
                                            <button
                                                onClick={() => openRejectionModal('amendment', ev.id, ev.organisations?.contact_email || '', ev.event_name)}
                                                className="bg-red-500/10 hover:bg-red-500 hover:text-black border border-red-500/20 text-red-400 font-black uppercase tracking-wider text-[10px] px-3 py-2 rounded-lg transition-all cursor-pointer"
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    {/* Approved Live Tournaments */}
                    <CollapsibleSection
                        open={sectionOpen.approvedEvents}
                        onToggle={() => toggleSection('approvedEvents')}
                        title="Approved Live Tournaments"
                        icon={Trophy}
                        count={filteredApprovedEvents.length}
                    >
                        <div className="flex flex-col md:flex-row md:items-center justify-end gap-4 mb-5">
                            <div className="relative max-w-xs w-full md:ml-auto">
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
                                                    <span className="font-medium text-white block">{ev.organisations?.name || ev.organizer_name || 'Unknown Club'}</span>
                                                    <span className="text-xs text-gray-500 block mt-0.5">{ev.organisations?.contact_email || ev.organizer_email}</span>
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
                                                            type="button"
                                                            onClick={() => openEventManager(ev)}
                                                            className="bg-padel-green/10 border border-padel-green/20 hover:bg-padel-green hover:text-black text-padel-green font-black uppercase tracking-wider text-[10px] px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                                                        >
                                                            <LayoutDashboard size={12} /> Manage Event
                                                        </button>
                                                        <button
                                                            onClick={() => setSelectedEventDetails(ev)}
                                                            className="bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 font-black uppercase tracking-wider text-[10px] px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                                                        >
                                                            <Eye size={12} /> View Details
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                openRejectionModal('event', ev.id, ev.organisations?.contact_email || ev.organizer_email || '', ev.event_name);
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
                    </CollapsibleSection>

                    {/* Immutable activity trail (DB-trigger driven) */}
                    <CollapsibleSection
                        open={sectionOpen.auditLog}
                        onToggle={() => toggleSection('auditLog')}
                        title="Activity Log"
                        icon={ScrollText}
                        iconClassName="text-gray-400"
                        badge="Immutable"
                    >
                        <OrgAuditLog embedded />
                    </CollapsibleSection>
                </div>
            )}

            {/* ========================================================
                FULL EVENT MANAGER — org hosts (and platform admins opening
                an org event) get the same manager without needing the
                separate Event Manager module permission.
               ======================================================== */}
            {managingEvent && (
                <ManualEventRegistrations
                    variant="inline"
                    isOpen
                    event={managingEvent}
                    onBack={() => setManagingEvent(null)}
                    backLabel="← Back to Organisation Dashboard"
                />
            )}

            {/* ========================================================
                ORGANISATION HOST VIEW
               ======================================================== */}
            {isHostView && !managingEvent && (
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
                                Approved Tournaments ({orgEvents.length})
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
                                    <span className="text-[10px] uppercase font-black text-amber-400 tracking-wider block">Pending Events</span>
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
                                    <span className="text-[9px] text-purple-400/60 font-bold block mt-1">Approved events only</span>
                                </div>
                                <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md p-5 rounded-2xl hover:border-white/20 transition-all shadow-xl relative overflow-hidden group text-left">
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 blur-xl rounded-full pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                                    <div className="w-8 h-8 rounded-lg bg-emerald-400/10 text-emerald-400 flex items-center justify-center mb-3 border border-emerald-500/20">
                                        <span className="text-sm font-black leading-none">R</span>
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
                                                    onClick={() => { setBuilderEvent(null); setBuilderOpen(true); }}
                                                    className="mt-4 text-xs font-bold text-padel-green hover:underline cursor-pointer"
                                                >
                                                    Create your first event &rarr;
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-3.5">
                                                {orgEvents.slice(0, 4).map(ev => (
                                                    <button
                                                        key={ev.id}
                                                        type="button"
                                                        onClick={() => setActiveSection('my-events')}
                                                        className="w-full bg-white/[0.015] hover:bg-white/[0.04] border border-white/10 hover:border-padel-green/30 p-4 rounded-xl flex items-center justify-between gap-4 text-left transition-all cursor-pointer"
                                                    >
                                                        <div className="min-w-0">
                                                            <span className="font-bold text-sm text-white block truncate">{ev.event_name}</span>
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
                                                                {ev.sanction_status === 'approved' ? 'Approved' : ev.sanction_status}
                                                            </span>
                                                            <ChevronRight size={14} className="text-gray-600" />
                                                        </div>
                                                    </button>
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
                        <div className="w-full bg-white/[0.02] border border-white/10 backdrop-blur-md rounded-2xl p-6 md:p-8 text-left shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-padel-green/5 blur-3xl rounded-full pointer-events-none" />
                            <OrgProfileEditor
                                org={localOrgState || currentOrg}
                                onSaved={(updatedOrg) => {
                                    setLocalOrgState(updatedOrg);
                                    if (permissions?.org) Object.assign(permissions.org, updatedOrg);
                                }}
                            />
                        </div>
                    )}

                    {/* 2. My Scoped Tournaments List Grid */}
                    {activeSection === 'my-events' && (
                        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl">
                            <h3 className="text-lg font-bold text-white mb-6">Manage Your Tournaments</h3>

                            {orgEvents.length === 0 ? (
                                <div className="text-center py-12 text-gray-500 text-sm">
                                    No tournaments hosted yet. Click "Create Event" at the top to build your first event.
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
                                                        {ev.sanction_status === 'approved' ? 'Approved' : ev.sanction_status}
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
                                                        type="button"
                                                        onClick={() => openEventManager(ev)}
                                                        className="text-[10px] text-padel-green font-black hover:text-white flex items-center gap-1.5 bg-padel-green/10 hover:bg-padel-green/20 border border-padel-green/20 px-2.5 py-1 rounded-md transition-all cursor-pointer"
                                                    >
                                                        <LayoutDashboard size={12} /> Manage Event
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
                                                            View Event &rarr;
                                                        </a>
                                                    )}
                                                    {ev.sanction_status !== 'approved' ? (
                                                        <button
                                                            onClick={() => handleStartEditEvent(ev)}
                                                            className="text-[10px] font-black text-padel-green hover:text-white uppercase tracking-widest flex items-center gap-1.5 cursor-pointer bg-transparent border-0"
                                                        >
                                                            <Edit size={12} /> Edit Details
                                                        </button>
                                                    ) : ev.pending_changes_status === 'pending' ? (
                                                        <button
                                                            onClick={() => handleStartEditEvent(ev)}
                                                            title="Your amendment is awaiting 4M Padel approval. Click to revise your draft."
                                                            className="text-[10px] font-black text-amber-400 hover:text-amber-300 uppercase tracking-widest flex items-center gap-1.5 cursor-pointer bg-transparent border-0 animate-pulse"
                                                        >
                                                            <Edit3 size={12} /> Amendment Pending
                                                        </button>
                                                    ) : ev.pending_changes_status === 'rejected' ? (
                                                        <button
                                                            onClick={() => handleStartEditEvent(ev)}
                                                            title={`Amendment declined: ${ev.pending_changes_notes || 'see email for feedback'}. Click to revise and resubmit.`}
                                                            className="text-[10px] font-black text-red-400 hover:text-red-300 uppercase tracking-widest flex items-center gap-1.5 cursor-pointer bg-transparent border-0"
                                                        >
                                                            <AlertCircle size={12} /> Amendment Declined — Revise
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleStartEditEvent(ev)}
                                                            title="Propose changes to this sanctioned event. Changes only go live once 4M Padel approves them."
                                                            className="text-[10px] font-black text-gray-400 hover:text-padel-green uppercase tracking-widest flex items-center gap-1.5 cursor-pointer bg-transparent border-0"
                                                        >
                                                            <Edit size={12} /> Request Changes
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 3. Create Tournament Wizard / Form */}
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
                            className="max-w-6xl w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 md:p-10 relative shadow-2xl my-8 max-h-[90vh] overflow-y-auto custom-scrollbar text-left"
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
                                        {selectedEventDetails.organisation_id ? (
                                            <button
                                                onClick={() => {
                                                    const org = allOrgs.find(o => o.id === selectedEventDetails.organisation_id);
                                                    if (org) {
                                                        setOrgDetailsMode('view');
                                                        setSelectedOrgDetails(org);
                                                    }
                                                }}
                                                className="text-padel-green hover:underline font-extrabold cursor-pointer transition-colors"
                                            >
                                                {selectedEventDetails.organisations?.name || 'View Host Club'}
                                            </button>
                                        ) : (
                                            <span className="text-gray-300 font-bold">
                                                {selectedEventDetails.organizer_name || 'Unknown Club'}
                                            </span>
                                        )}{' '}
                                        ({selectedEventDetails.organisations?.contact_email || selectedEventDetails.organizer_email})
                                    </p>
                                </div>
                            </div>

                            {/* Two-Column Grid for Metadata details */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
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
                                                <span className="text-gray-500">Deciding Point:</span>
                                                <span className="font-bold text-padel-green">
                                                    {{
                                                        golden: 'Golden Point',
                                                        silver: 'Silver Point',
                                                        star: 'Star Point',
                                                        advantage: 'Advantage',
                                                    }[selectedEventDetails.scoring_point]
                                                        || (selectedEventDetails.golden_point === false ? 'Advantage' : 'Golden Point')}
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
                                                type="button"
                                                onClick={() => openEventManager(selectedEventDetails)}
                                                className="mt-1 px-4 py-2 bg-padel-green hover:bg-white text-black font-black uppercase tracking-wider text-[10px] rounded-xl transition-all shrink-0 cursor-pointer"
                                            >
                                                Manage Event
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 mt-6 border-t border-white/5 pt-6">
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
                                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedEventDetails.description) }}
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
                                        openRejectionModal('event', selectedEventDetails.id, selectedEventDetails.organisations?.contact_email || selectedEventDetails.organizer_email || '', selectedEventDetails.event_name);
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
                            className={`w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 relative shadow-2xl space-y-6 text-left ${
                                orgDetailsMode === 'edit' ? 'max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar' : 'max-w-md'
                            }`}
                        >
                            <button
                                onClick={() => {
                                    setSelectedOrgDetails(null);
                                    setOrgDetailsMode('view');
                                }}
                                className="absolute top-5 right-5 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer z-10"
                            >
                                <X size={16} />
                            </button>

                            {orgDetailsMode === 'edit' ? (
                                <div className="pt-1">
                                    <OrgProfileEditor
                                        org={selectedOrgDetails}
                                        adminMode
                                        canDelete={permissions?.role === 'super_admin'}
                                        onSaved={(updated) => {
                                            setSelectedOrgDetails(updated);
                                            setOrgDetailsMode('view');
                                            fetchSuperAdminData();
                                        }}
                                        onDeleted={() => {
                                            setSelectedOrgDetails(null);
                                            setOrgDetailsMode('view');
                                            fetchSuperAdminData();
                                        }}
                                    />
                                </div>
                            ) : (
                                <>
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
                                        <span className="text-white font-bold">
                                            {selectedOrgDetails.players?.name || 'Unknown User'}
                                            {selectedOrgDetails.players?.account_type === 'organisation' && (
                                                <span className="ml-2 text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                                                    Org account
                                                </span>
                                            )}
                                        </span>
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
                            <div className="pt-2 space-y-2">
                                {selectedOrgDetails.status === 'approved' && (
                                    <button
                                        type="button"
                                        onClick={() => openOrgDashboard(selectedOrgDetails)}
                                        className="w-full py-3.5 bg-padel-green hover:bg-white text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-2"
                                    >
                                        <LayoutDashboard size={14} /> Open Organisation Dashboard
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setOrgDetailsMode('edit')}
                                    className="w-full py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-2"
                                >
                                    <Edit size={14} /> Edit Organisation
                                </button>
                                {selectedOrgDetails.status === 'approved' && selectedOrgDetails.slug && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const slug = selectedOrgDetails.slug;
                                            setSelectedOrgDetails(null);
                                            navigate(`/organisations/${slug}`);
                                        }}
                                        className="w-full py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-2"
                                    >
                                        <Eye size={14} /> View Public Page
                                    </button>
                                )}
                                <button
                                    onClick={() => setMembersOrg(selectedOrgDetails)}
                                    className="w-full py-3.5 bg-padel-green/10 hover:bg-padel-green hover:text-black border border-padel-green/20 text-padel-green font-extrabold text-xs rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-2"
                                >
                                    <Users size={14} /> Manage Members & Admins
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedOrgDetails(null);
                                        setOrgDetailsMode('view');
                                    }}
                                    className="w-full py-3.5 bg-white/5 hover:bg-white/10 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer text-center"
                                >
                                    Close Details
                                </button>
                                {permissions?.role === 'super_admin' && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteOrganisation(selectedOrgDetails)}
                                        className="w-full py-3.5 bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/20 text-red-400 font-extrabold text-xs rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-2"
                                    >
                                        <Trash2 size={14} /> Delete Organisation
                                    </button>
                                )}
                            </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <CreateOrganisationModal
                isOpen={createOrgOpen}
                onClose={() => setCreateOrgOpen(false)}
                onCreated={() => fetchSuperAdminData()}
            />

            {/* ========================================================
                ORG MEMBERS MANAGEMENT MODAL
               ======================================================== */}
            <AnimatePresence>
                {membersOrg && (
                    <OrgMembersManager
                        org={membersOrg}
                        onClose={() => setMembersOrg(null)}
                    />
                )}
            </AnimatePresence>

            {/* ========================================================
                AMENDMENT REVIEW (DIFF) MODAL — super admin
               ======================================================== */}
            <AnimatePresence>
                {amendmentDiff && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[240] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            className="max-w-2xl w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 relative shadow-2xl space-y-5 text-left max-h-[90vh] overflow-y-auto custom-scrollbar"
                        >
                            <button
                                onClick={() => setAmendmentDiff(null)}
                                className="absolute top-5 right-5 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                            >
                                <X size={16} />
                            </button>

                            <div className="pr-8">
                                <span className="text-[10px] text-amber-400 font-black uppercase tracking-widest">Amendment Review</span>
                                <h3 className="text-xl font-black text-white mt-1 leading-tight">{amendmentDiff.event_name}</h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    Requested by {amendmentDiff.organisations?.name || 'Unknown host'} — the live event keeps its current details until you approve.
                                </p>
                            </div>

                            <div className="space-y-2">
                                {getAmendmentChanges(amendmentDiff).length === 0 ? (
                                    <p className="text-xs text-gray-500 py-2">No visible field changes detected (may be division-only or rich-text changes).</p>
                                ) : getAmendmentChanges(amendmentDiff).map((c, i) => (
                                    <div key={i} className="bg-black/30 border border-white/5 p-3.5 rounded-xl">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">{c.label}</span>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 text-xs">
                                            <span className="text-red-400/80 line-through break-all">{c.from}</span>
                                            <span className="text-gray-600 hidden sm:inline">→</span>
                                            <span className="text-padel-green font-bold break-all">{c.to}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2.5 pt-2">
                                <button
                                    onClick={() => handleApproveAmendment(amendmentDiff)}
                                    className="flex-1 bg-padel-green text-black font-black uppercase tracking-widest text-xs py-3.5 rounded-xl hover:bg-white transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <Check size={14} /> Approve & Apply Changes
                                </button>
                                <button
                                    onClick={() => {
                                        openRejectionModal('amendment', amendmentDiff.id, amendmentDiff.organisations?.contact_email || '', amendmentDiff.event_name);
                                        setAmendmentDiff(null);
                                    }}
                                    className="bg-red-500/10 hover:bg-red-500 hover:text-black border border-red-500/20 text-red-400 font-black uppercase tracking-widest text-xs px-6 py-3.5 rounded-xl transition-all cursor-pointer"
                                >
                                    Decline
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ========================================================
                NEW EVENT BUILDER (org-scoped) — creates manual events with
                divisions, per-division deadlines & ManualEventRegistration
               ======================================================== */}
            <EventBuilder
                isOpen={builderOpen}
                onClose={() => { setBuilderOpen(false); setBuilderEvent(null); }}
                onSaved={handleBuilderSaved}
                editingEvent={builderEvent}
                organization={isHostView ? currentOrg : null}
            />

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
                            className="max-w-md w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 relative shadow-2xl"
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
                                        <span className="text-lg font-black leading-none">R</span>
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
                                                        {entry.players?.image_url ? (
                                                            <img
                                                                src={entry.players.image_url}
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
