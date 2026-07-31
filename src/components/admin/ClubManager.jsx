import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';
import {
    MapPin, Plus, RefreshCw, Users, Building, Save, Loader2, ExternalLink,
    Upload, Trash2, Image as ImageIcon, ChevronDown, Instagram, Facebook,
    Search, Check, X, Clock, Palette, Phone, ArrowLeft, ShieldCheck, UserPlus, User, Mail, Send,
} from 'lucide-react';
import ClubMembersManager from './ClubMembersManager';
import ClubCreateWizard from '../clubs/ClubCreateWizard';
import {
    slugifyClub,
    CLUB_STATUSES,
    clubStatusLabel,
    clubStatusBadgeClass,
    isPublicClubStatus,
    isInReviewClubStatus,
    normalizeClubStatus,
    clubCityLabel,
    clubRegionLabel,
} from '../../utils/club';
import { sendEmail } from '../../utils/emails';
import { attachPlacesAutocomplete } from '../../utils/googleMaps';
import clubsManagerLogo from '../../assets/logo_4m_clubs.png';

const COLOR_PRESETS = ['#CC1414', '#9AE900', '#F97316', '#3B82F6', '#EF4444', '#A855F7', '#14B8A6', '#EAB308', '#EC4899'];
const CLAIM_FILTER_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'claimed', label: 'Claimed' },
    { value: 'unclaimed', label: 'Unclaimed' },
];

const CollapsibleSection = ({
    open,
    onToggle,
    title,
    icon: Icon,
    iconClassName = 'text-padel-green',
    count,
    actions,
    children,
}) => (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl shadow-xl">
        <div className="flex items-center gap-2 p-4 md:p-5">
            <button
                type="button"
                onClick={onToggle}
                className="flex-1 flex items-center justify-between gap-3 text-left hover:opacity-90 transition-opacity cursor-pointer bg-transparent border-0 p-0"
            >
                <h3 className="text-base font-bold text-white flex items-center gap-2 min-w-0">
                    {Icon && <Icon size={16} className={`shrink-0 ${iconClassName}`} />}
                    <span className="truncate">{title}{count !== undefined ? ` (${count})` : ''}</span>
                </h3>
                <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {actions}
        </div>
        {open && (
            <div className="px-4 md:px-5 pb-5 border-t border-white/5 pt-4 space-y-4">
                {children}
            </div>
        )}
    </div>
);

const emptySocials = () => ({ instagram: '', facebook: '', tiktok: '', playtomic: '' });
const emptyCourts = () => ({
    indoor: { count: 0, features: [], image_url: '' },
    outdoor: { count: 0, features: [], image_url: '' },
});
const emptyHours = () => ({
    mon: { open: '06:00', close: '22:00', closed: false },
    tue: { open: '06:00', close: '22:00', closed: false },
    wed: { open: '06:00', close: '22:00', closed: false },
    thu: { open: '06:00', close: '22:00', closed: false },
    fri: { open: '06:00', close: '22:00', closed: false },
    sat: { open: '07:00', close: '21:00', closed: false },
    sun: { open: '07:00', close: '20:00', closed: false },
});

const DAY_LABELS = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

const createClosedSections = () => ({
    profile: false,
    sponsor: false,
    socials: false,
    courts: false,
    cafe: false,
    services: false,
    hours: false,
    gallery: false,
    sponsors: false,
    contacts: false,
    orgs: false,
    federation: false,
});

const emptyForm = () => ({
    name: '',
    short_name: '',
    slug: '',
    about: '',
    website_url: '',
    brand_color: '#CC1414',
    status: 'unclaimed',
    contact_email: '',
    contact_phone: '',
    whatsapp_number: '',
    city: '',
    address: '',
    lat: '',
    lng: '',
    logo_url: '',
    cover_image_url: '',
    verified: false,
    sapa_registered: false,
    federation_id: '',
    socials: emptySocials(),
    contacts: [],
    opening_hours: emptyHours(),
    courts: emptyCourts(),
    services: [],
    cafe: null,
    sponsors: [],
    principal_sponsor: null,
    gallery: [],
    stats: {},
});

const normaliseSocials = (value) => {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        instagram: src.instagram || '',
        facebook: src.facebook || '',
        tiktok: src.tiktok || '',
        playtomic: src.playtomic || '',
    };
};

const normaliseCourts = (value) => {
    const base = emptyCourts();
    if (!value || typeof value !== 'object') return base;
    return {
        indoor: {
            count: Number(value.indoor?.count) || 0,
            features: Array.isArray(value.indoor?.features) ? value.indoor.features : [],
            image_url: value.indoor?.image_url || '',
        },
        outdoor: {
            count: Number(value.outdoor?.count) || 0,
            features: Array.isArray(value.outdoor?.features) ? value.outdoor.features : [],
            image_url: value.outdoor?.image_url || '',
        },
    };
};

const inputClass = 'mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-medium normal-case tracking-normal placeholder:text-gray-500 focus:outline-none focus:border-padel-green';
const labelClass = 'block text-[10px] font-black uppercase tracking-wider text-gray-400';
const ghostBtnClass = 'px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold text-gray-300 hover:bg-white/5 flex items-center gap-1';

const CLUB_LIST_GRID = 'md:grid-cols-[minmax(160px,1.5fr)_minmax(90px,0.85fr)_minmax(150px,1.15fr)_0.85fr_0.65fr_0.7fr_0.7fr_0.8fr_1fr]';

/**
 * @param {string|null|undefined} name
 */
const personInitials = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
};

/**
 * @param {string|null|undefined} role
 */
const roleLabel = (role) => {
    const raw = String(role || '').trim().toLowerCase();
    if (raw === 'owner') return 'Owner';
    if (raw === 'admin') return 'Admin';
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Member';
};

/**
 * @param {Array<{ id: string, name: string, role: string, image_url?: string|null }>} admins
 */
const OwnersAdminsCell = ({ admins, onInvite }) => {
    if (!admins?.length) {
        return (
            <div className="space-y-1">
                <p className="text-xs text-gray-500">No owners</p>
                {onInvite && (
                    <button type="button" onClick={onInvite} className="inline-flex items-center gap-1 text-[10px] font-bold text-padel-green hover:underline">
                        <Mail size={10} /> Invite to claim club
                    </button>
                )}
            </div>
        );
    }
    const visible = admins.slice(0, 2);
    const extra = admins.length - visible.length;
    return (
        <div className="space-y-2 min-w-0">
            {visible.map((person) => (
                <div key={person.id} className="flex items-center gap-2.5 min-w-0">
                    {person.image_url ? (
                        <img
                            src={person.image_url}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black text-gray-400 shrink-0">
                            {personInitials(person.name) === '?'
                                ? <User size={12} />
                                : personInitials(person.name)}
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate leading-tight">{person.name}</p>
                        <p className="text-xs text-gray-500 truncate leading-tight mt-0.5">{roleLabel(person.role)}</p>
                    </div>
                </div>
            ))}
            {extra > 0 && (
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">+{extra} more</p>
            )}
        </div>
    );
};

/**
 * Platform Clubs admin — full club card content editor.
 */
const ClubManager = ({ permissions }) => {
    const isSuper = permissions?.role === 'super_admin';
    // Platform / My Clubs switcher — mirrors the Organisations portal toggle.
    // Only super admins see the toggle (scoped roles already only load their clubs).
    const [viewMode, setViewMode] = useState(() => {
        try {
            return new URLSearchParams(window.location.search).get('view') === 'mine' ? 'mine' : 'platform';
        } catch {
            return 'platform';
        }
    });
    const [clubs, setClubs] = useState([]);
    const [federations, setFederations] = useState([]);
    const [approvedOrgs, setApprovedOrgs] = useState([]);
    const [linkedOrgIds, setLinkedOrgIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [managerView, setManagerView] = useState('list');
    const [form, setForm] = useState(emptyForm());
    const [slugManual, setSlugManual] = useState(false);
    const [membersClub, setMembersClub] = useState(null);
    const [showWizard, setShowWizard] = useState(false);
    const [assignOrgId, setAssignOrgId] = useState('');
    const [listSearch, setListSearch] = useState('');
    const [claimFilter, setClaimFilter] = useState('all');
    const [inviteClub, setInviteClub] = useState(null);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteSearchQuery, setInviteSearchQuery] = useState('');
    const [invitePlayerResults, setInvitePlayerResults] = useState([]);
    const [inviteIsSearching, setInviteIsSearching] = useState(false);
    const [inviteSelectedPlayer, setInviteSelectedPlayer] = useState(null);
    const [inviteSending, setInviteSending] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pendingClaims, setPendingClaims] = useState([]);
    const [rejectClaimTarget, setRejectClaimTarget] = useState(null);
    const [rejectClaimNotes, setRejectClaimNotes] = useState('');
    const [rejectClaimSaving, setRejectClaimSaving] = useState(false);
    const [memberCounts, setMemberCounts] = useState({});
    const [linkedOrgCounts, setLinkedOrgCounts] = useState({});
    const [clubAdminsById, setClubAdminsById] = useState({});
    const addressInputRef = useRef(null);
    const autocompleteRef = useRef(null);
    const [sectionOpen, setSectionOpen] = useState(createClosedSections);

    useEffect(() => {
        if (!inviteClub) return;

        const q = inviteSearchQuery.trim();
        if (q.length < 2) {
            setInvitePlayerResults([]);
            return;
        }

        let cancelled = false;
        const t = setTimeout(async () => {
            setInviteIsSearching(true);
            try {
                const { data, error } = await supabase
                    .from('players')
                    .select('id, name, email, image_url')
                    .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
                    .not('email', 'is', null)
                    .limit(8);
                if (error) throw error;
                if (cancelled) return;
                setInvitePlayerResults(data || []);
            } catch (err) {
                console.error(err);
                if (cancelled) return;
                setInvitePlayerResults([]);
            } finally {
                if (!cancelled) setInviteIsSearching(false);
            }
        }, 350);

        return () => {
            cancelled = true;
            clearTimeout(t);
            setInviteIsSearching(false);
        };
    }, [inviteSearchQuery, inviteClub?.id]);

    const selected = useMemo(
        () => clubs.find((c) => c.id === selectedId) || null,
        [clubs, selectedId],
    );

    const myClubIds = useMemo(
        () => new Set((permissions?.clubs || []).map((c) => c.id)),
        [permissions?.clubs],
    );
    const showViewToggle = isSuper && myClubIds.size > 0;
    const effectiveView = showViewToggle ? viewMode : 'platform';

    const handleViewModeChange = (mode) => {
        setViewMode(mode);
        try {
            const params = new URLSearchParams(window.location.search);
            params.set('tab', 'clubs');
            if (mode === 'mine') params.set('view', 'mine');
            else params.delete('view');
            window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
        } catch { /* ignore */ }
    };

    const visibleClubs = useMemo(() => {
        const base = clubs.filter((c) => {
            const rawStatus = String(c.status || '').toLowerCase();
            if (rawStatus === 'rejected') return false;
            // Keep the main table focused on "Published" and "In review".
            return isInReviewClubStatus(c.status) || isPublicClubStatus(c.status);
        });
        if (effectiveView !== 'mine') return base;
        return base.filter((c) => myClubIds.has(c.id));
    }, [clubs, effectiveView, myClubIds]);

    const filteredClubs = useMemo(() => {
        const q = listSearch.trim().toLowerCase();
        const claimFiltered = claimFilter === 'all'
            ? visibleClubs
            : visibleClubs.filter((c) => {
                const admins = clubAdminsById[c.id] || [];
                const isClaimed = admins.length > 0;
                return claimFilter === 'claimed' ? isClaimed : !isClaimed;
            });

        if (!q) return claimFiltered;

        return claimFiltered.filter((c) => {
            const hay = [
                c.name,
                c.short_name,
                c.slug,
                c.city,
                c.status,
                c.address,
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [visibleClubs, listSearch, claimFilter, clubAdminsById]);

    const clubRows = useMemo(() => {
        return filteredClubs.map((club) => {
            const indoor = Number(club.courts?.indoor?.count) || 0;
            const outdoor = Number(club.courts?.outdoor?.count) || 0;
            const totalCourts = indoor + outdoor;
            return {
                ...club,
                totalCourts,
                members: memberCounts[club.id] || Number(club.stats?.members) || 0,
                linkedOrgs: linkedOrgCounts[club.id] || 0,
                cityLabel: clubCityLabel(club),
                regionLabel: clubRegionLabel(club),
                admins: clubAdminsById[club.id] || [],
            };
        });
    }, [filteredClubs, memberCounts, linkedOrgCounts, clubAdminsById]);

    const ITEMS_PER_PAGE = 50;

    const totalPages = Math.max(1, Math.ceil(clubRows.length / ITEMS_PER_PAGE));

    const paginatedClubRows = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return clubRows.slice(start, start + ITEMS_PER_PAGE);
    }, [clubRows, currentPage]);

    const managerStats = useMemo(() => {
        // Use the full clubs list (excluding only rejected) so counts like
        // "In review" and "Claimed" reflect reality, not just the visible table.
        const scopedClubs = effectiveView === 'mine'
            ? clubs.filter((c) => myClubIds.has(c.id))
            : clubs;
        const all = scopedClubs.filter((c) => String(c.status || '').toLowerCase() !== 'rejected');

        const rows = visibleClubs.map((club) => ({
            ...club,
            members: memberCounts[club.id] || Number(club.stats?.members) || 0,
            linkedOrgs: linkedOrgCounts[club.id] || 0,
            totalCourts: (Number(club.courts?.indoor?.count) || 0) + (Number(club.courts?.outdoor?.count) || 0),
        }));
        return {
            total: visibleClubs.length,
            published: all.filter((club) => isPublicClubStatus(club.status)).length,
            inReview: pendingClaims.length,
            claimed: all.filter((club) => (clubAdminsById[club.id] || []).length > 0).length,
            totalMembers: rows.reduce((sum, club) => sum + club.members, 0),
            totalCourts: rows.reduce((sum, club) => sum + club.totalCourts, 0),
            totalLinkedOrgs: rows.reduce((sum, club) => sum + club.linkedOrgs, 0),
        };
    }, [clubs, visibleClubs, effectiveView, myClubIds, memberCounts, linkedOrgCounts, clubAdminsById, pendingClaims]);

    const selectedSummary = useMemo(() => {
        if (!selected && !isCreating) return null;
        const source = selected || form;
        const indoor = Number(source?.courts?.indoor?.count) || 0;
        const outdoor = Number(source?.courts?.outdoor?.count) || 0;
        const logo = source?.logo_url || '';
        return {
            logo,
            name: source?.short_name || source?.name || 'New club',
            fullName: source?.name || 'New club',
            city: source?.city || 'City not set',
            status: source?.status || 'unclaimed',
            verified: !!source?.verified,
            sapaRegistered: !!source?.sapa_registered,
            totalCourts: indoor + outdoor,
            indoor,
            outdoor,
            members: selected ? (memberCounts[selected.id] || Number(selected.stats?.members) || 0) : 0,
            linkedOrgs: selected ? (linkedOrgCounts[selected.id] || linkedOrgIds.length) : linkedOrgIds.length,
            hasPublicPage: !!(selected?.slug && isPublicClubStatus(selected?.status)),
        };
    }, [selected, isCreating, form, memberCounts, linkedOrgCounts, linkedOrgIds.length]);

    const pendingClubs = useMemo(() => {
        const base = clubs.filter((c) => isInReviewClubStatus(c.status));
        if (effectiveView !== 'mine') return base;
        return base.filter((c) => myClubIds.has(c.id));
    }, [clubs, effectiveView, myClubIds]);

    useEffect(() => {
        setCurrentPage(1);
    }, [listSearch, effectiveView, claimFilter]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    // Keep the selection inside the active view when switching to My Clubs.
    useEffect(() => {
        if (effectiveView !== 'mine' || isCreating) return;
        if (selectedId && myClubIds.has(selectedId)) return;
        const first = clubs.find((c) => myClubIds.has(c.id) && !isInReviewClubStatus(c.status));
        setSelectedId(first ? first.id : null);
    }, [effectiveView, selectedId, myClubIds, clubs, isCreating]);

    const applicantEmail = (club) => {
        if (club?.contact_email) return club.contact_email;
        const primary = (Array.isArray(club?.contacts) ? club.contacts : []).find((c) => c.is_primary)
            || (Array.isArray(club?.contacts) ? club.contacts[0] : null);
        return primary?.email || '';
    };

    const handleApproveClub = async (club) => {
        try {
            const { error } = await supabase
                .from('clubs')
                .update({
                    status: 'published',
                    verified: true,
                    approved_at: new Date().toISOString(),
                    rejection_notes: null,
                })
                .eq('id', club.id);
            if (error) throw error;

            const email = applicantEmail(club);
            if (email) {
                const { error: memberError } = await supabase
                    .from('club_members')
                    .upsert({
                        club_id: club.id,
                        player_id: club.created_by || null,
                        user_email: email.toLowerCase(),
                        role: 'owner',
                    }, { onConflict: 'club_id,user_email' });
                if (memberError) console.warn('Owner membership assignment warning:', memberError);
                sendEmail(email, 'club_approved', { clubName: club.name });
            }

            toast.success(`Approved club: ${club.name}`);
            loadClubs();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to approve club');
        }
    };

    const handleRejectClub = async (club) => {
        const notes = window.prompt(`Rejection notes for ${club.name}:`);
        if (notes == null) return;
        if (!String(notes).trim()) {
            toast.error('Please provide rejection feedback.');
            return;
        }
        try {
            const { error } = await supabase
                .from('clubs')
                .update({
                    status: 'rejected',
                    rejection_notes: String(notes).trim(),
                })
                .eq('id', club.id);
            if (error) throw error;

            const email = applicantEmail(club);
            if (email) {
                sendEmail(email, 'club_rejected', {
                    clubName: club.name,
                    notes: String(notes).trim(),
                });
            }
            toast.success(`Rejected club application: ${club.name}`);
            loadClubs();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to reject club');
        }
    };

    const loadPendingClaims = useCallback(async () => {
        if (!isSuper) {
            setPendingClaims([]);
            return;
        }
        try {
            const { data, error } = await supabase
                .from('club_claim_requests')
                .select('*, clubs(id, name, short_name, city, logo_url, status)')
                .eq('status', 'pending')
                .order('created_at', { ascending: true });
            if (error) throw error;
            setPendingClaims(data || []);
        } catch (err) {
            console.warn('Failed to load club claims:', err.message);
            setPendingClaims([]);
        }
    }, [isSuper]);

    const handleApproveClaim = async (claim) => {
        try {
            const clubName = claim.clubs?.name || 'Club';
            const email = (claim.requester_email || '').toLowerCase();
            if (!email) throw new Error('Claim is missing requester email');

            const { error: memberError } = await supabase
                .from('club_members')
                .upsert({
                    club_id: claim.club_id,
                    player_id: claim.requester_player_id || null,
                    user_email: email,
                    role: 'owner',
                }, { onConflict: 'club_id,user_email' });
            if (memberError) throw memberError;

            // Claiming an unclaimed club promotes it to published.
            const claimClubStatus = String(claim.clubs?.status || '').toLowerCase();
            if (['unclaimed', 'draft', 'archived'].includes(claimClubStatus)) {
                const { error: clubStatusError } = await supabase
                    .from('clubs')
                    .update({
                        status: 'published',
                        verified: true,
                        approved_at: new Date().toISOString(),
                    })
                    .eq('id', claim.club_id);
                if (clubStatusError) throw clubStatusError;
            }

            const { error } = await supabase
                .from('club_claim_requests')
                .update({
                    status: 'approved',
                    reviewed_at: new Date().toISOString(),
                    rejection_notes: null,
                })
                .eq('id', claim.id);
            if (error) throw error;

            sendEmail(email, 'club_claim_approved', { clubName });
            toast.success(`Approved club claim for ${clubName}`);
            loadPendingClaims();
            loadClubs();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to approve club claim');
        }
    };

    const openRejectClaim = (claim) => {
        setRejectClaimTarget(claim);
        setRejectClaimNotes('');
    };

    const handleRejectClaim = async () => {
        if (!rejectClaimTarget) return;
        const claim = rejectClaimTarget;
        const clubName = claim.clubs?.name || 'Club';
        const notes = String(rejectClaimNotes || '').trim();
        if (!notes) {
            toast.error('Please provide rejection feedback.');
            return;
        }
        setRejectClaimSaving(true);
        try {
            const { error } = await supabase
                .from('club_claim_requests')
                .update({
                    status: 'rejected',
                    rejection_notes: notes,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', claim.id);
            if (error) throw error;

            if (claim.requester_email) {
                sendEmail(claim.requester_email, 'club_claim_rejected', {
                    clubName,
                    notes,
                });
            }
            toast.success(`Rejected club claim for ${clubName}`);
            setRejectClaimTarget(null);
            setRejectClaimNotes('');
            loadPendingClaims();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to reject club claim');
        } finally {
            setRejectClaimSaving(false);
        }
    };

    const handleSendClaimInvite = async () => {
        if (!inviteClub) return;
        const email = inviteEmail.trim().toLowerCase();
        if (!email) return;
        setInviteSending(true);
        try {
            const { data: session } = await supabase.auth.getSession();
            const userId = session?.session?.user?.id || null;

            let existingPlayer = inviteSelectedPlayer || null;
            if (!existingPlayer) {
                const { data: player } = await supabase
                    .from('players')
                    .select('id')
                    .ilike('email', email)
                    .maybeSingle();
                existingPlayer = player || null;
            }

            const { data: invite, error } = await supabase
                .from('club_claim_invites')
                .insert({
                    club_id: inviteClub.id,
                    email,
                    invited_by: userId,
                })
                .select('token')
                .single();
            if (error) throw error;

            const acceptUrl = `${window.location.origin}/claim-club?token=${invite.token}`;
            await sendEmail(email, 'club_claim_invite', {
                clubName: inviteClub.name,
                inviterName: session?.session?.user?.user_metadata?.full_name || '4M Padel Admin',
                accept_url: acceptUrl,
            });

            // If they don't have a player profile yet, invite them to create it first.
            if (!existingPlayer?.id) {
                const redirectTo = `${window.location.origin}/profile?new_invite=true&claim_token=${invite.token}`;
                const { error: otpError } = await supabase.auth.signInWithOtp({
                    email,
                    options: { emailRedirectTo: redirectTo },
                });
                if (otpError) throw otpError;
            }

            toast.success(`Invite sent to ${email}${existingPlayer?.id ? '' : ' (profile invite also sent)'}`);
            setInviteClub(null);
            setInviteEmail('');
            setInviteSearchQuery('');
            setInviteSelectedPlayer(null);
            setInvitePlayerResults([]);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to send invite');
        } finally {
            setInviteSending(false);
        }
    };

    const openClubDetail = useCallback((clubId) => {
        setSelectedId(clubId);
        setIsCreating(false);
        setManagerView('detail');
    }, []);

    const backToClubList = useCallback(() => {
        setManagerView('list');
        setMembersClub(null);
        if (!isCreating) return;
        setIsCreating(false);
        setSelectedId(null);
        setForm(emptyForm());
        setSlugManual(false);
        setLinkedOrgIds([]);
        setSectionOpen(createClosedSections());
    }, [isCreating]);

    const quickEditCity = async (club) => {
        const next = window.prompt(`City for ${club.short_name || club.name}:`, club.city || '');
        if (next == null) return;
        const city = next.trim();
        try {
            const { error } = await supabase
                .from('clubs')
                .update({ city: city || null })
                .eq('id', club.id);
            if (error) throw error;
            setClubs((prev) => prev.map((c) => (c.id === club.id ? { ...c, city: city || null } : c)));
            if (selectedId === club.id) {
                setForm((prev) => ({ ...prev, city: city || '' }));
            }
            toast.success(city ? `City set to ${city}` : 'City cleared');
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to update city');
        }
    };

    const handleDeleteClub = async (club) => {
        const label = club.short_name || club.name;
        if (!window.confirm(`Delete club "${label}"? This cannot be undone.`)) return;
        try {
            const { error } = await supabase.from('clubs').delete().eq('id', club.id);
            if (error) throw error;
            toast.success(`Deleted ${label}`);
            setMembersClub((current) => (current?.id === club.id ? null : current));
            if (selectedId === club.id) {
                setSelectedId(null);
                setIsCreating(false);
                setForm(emptyForm());
                setManagerView('list');
                setSectionOpen(createClosedSections());
            }
            loadClubs();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to delete club');
        }
    };

    const toggleSection = (key) => {
        setSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const loadClubMetrics = useCallback(async (clubIds) => {
        if (!clubIds.length) {
            setMemberCounts({});
            setLinkedOrgCounts({});
            setClubAdminsById({});
            return;
        }

        const fetchAll = async (query) => {
            const PAGE = 1000;
            let all = [];
            let from = 0;
            while (true) {
                const { data, error } = await query.range(from, from + PAGE - 1);
                if (error) throw error;
                all = all.concat(data || []);
                if (!data || data.length < PAGE) break;
                from += PAGE;
            }
            return all;
        };

        try {
            const [members, orgLinks, clubMembers] = await Promise.all([
                fetchAll(supabase.from('players').select('club_id').in('club_id', clubIds)),
                fetchAll(supabase.from('club_organisations').select('club_id').in('club_id', clubIds)),
                fetchAll(
                    supabase
                        .from('club_members')
                        .select('club_id, role, user_email, players!player_id(id, name, image_url, email)')
                        .in('club_id', clubIds)
                        .in('role', ['owner', 'admin']),
                ),
            ]);

            const nextMemberCounts = {};
            (members || []).forEach((row) => {
                if (!row.club_id) return;
                nextMemberCounts[row.club_id] = (nextMemberCounts[row.club_id] || 0) + 1;
            });

            const nextLinkedCounts = {};
            (orgLinks || []).forEach((row) => {
                if (!row.club_id) return;
                nextLinkedCounts[row.club_id] = (nextLinkedCounts[row.club_id] || 0) + 1;
            });

            const missingEmails = [...new Set(
                (clubMembers || [])
                    .filter((row) => !row.players?.name && row.user_email)
                    .map((row) => String(row.user_email).toLowerCase()),
            )];

            let playersByEmail = {};
            if (missingEmails.length) {
                const { data: emailPlayers } = await supabase
                    .from('players')
                    .select('id, name, image_url, email')
                    .in('email', missingEmails);
                playersByEmail = Object.fromEntries(
                    (emailPlayers || [])
                        .filter((p) => p.email)
                        .map((p) => [String(p.email).toLowerCase(), p]),
                );
            }

            const nextAdmins = {};
            (clubMembers || []).forEach((row) => {
                if (!row.club_id) return;
                const email = String(row.user_email || row.players?.email || '').toLowerCase();
                const player = row.players || playersByEmail[email] || null;
                const entry = {
                    id: row.players?.id || email || `${row.club_id}-${row.role}`,
                    name: player?.name || email || 'Unknown',
                    role: row.role,
                    image_url: player?.image_url || null,
                    email,
                };
                if (!nextAdmins[row.club_id]) nextAdmins[row.club_id] = [];
                nextAdmins[row.club_id].push(entry);
            });

            Object.keys(nextAdmins).forEach((clubId) => {
                nextAdmins[clubId].sort((a, b) => {
                    if (a.role === b.role) return String(a.name).localeCompare(String(b.name));
                    if (a.role === 'owner') return -1;
                    if (b.role === 'owner') return 1;
                    return 0;
                });
            });

            setMemberCounts(nextMemberCounts);
            setLinkedOrgCounts(nextLinkedCounts);
            setClubAdminsById(nextAdmins);
        } catch (err) {
            console.warn('Failed to load club metrics:', err.message);
            setMemberCounts({});
            setLinkedOrgCounts({});
            setClubAdminsById({});
        }
    }, []);

    const loadClubs = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase.from('clubs').select('*').order('name', { ascending: true });

            // Scoped: club members only see their clubs (unless super/custom with clubs tab)
            if (!isSuper && permissions?.clubs?.length) {
                const ids = permissions.clubs.map((c) => c.id);
                query = query.in('id', ids);
            }

            const { data, error } = await query;
            if (error) throw error;
            setClubs(data || []);
            loadClubMetrics((data || []).map((club) => club.id));
            if (!selectedId && (data || []).length > 0 && !isCreating) {
                const params = new URLSearchParams(window.location.search);
                const fromUrl = params.get('club');
                const match = fromUrl && (data || []).find((c) => c.id === fromUrl);
                setSelectedId(match ? match.id : data[0].id);
            }
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load clubs');
        } finally {
            setLoading(false);
        }
    }, [isSuper, permissions?.clubs, selectedId, isCreating, loadClubMetrics]);

    const loadLookups = useCallback(async () => {
        const [{ data: feds }, { data: orgs }] = await Promise.all([
            supabase.from('federations').select('id, name, short_name, slug').order('name'),
            supabase.from('organisations').select('id, name, slug, logo_url').eq('status', 'approved').order('name'),
        ]);
        setFederations(feds || []);
        setApprovedOrgs(orgs || []);
    }, []);

    const loadLinkedOrgs = useCallback(async (clubId) => {
        if (!clubId) {
            setLinkedOrgIds([]);
            return;
        }
        const { data, error } = await supabase
            .from('club_organisations')
            .select('organisation_id')
            .eq('club_id', clubId);
        if (error) {
            console.warn(error);
            return;
        }
        setLinkedOrgIds((data || []).map((r) => r.organisation_id));
    }, []);

    // Load on mount / permission-scope change only. loadClubs' identity changes with
    // selectedId, and re-running it on every selection unmounts the editor (loading
    // spinner), which detaches the Google Places widget from the address input.
    useEffect(() => {
        loadClubs();
        loadLookups();
        loadPendingClaims();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSuper, permissions?.clubs, loadLookups, loadPendingClaims]);

    useEffect(() => {
        if (!selectedId) return;
        const club = clubs.find((c) => c.id === selectedId);
        if (!club) return;
        setForm({
            ...emptyForm(),
            ...club,
            status: normalizeClubStatus(club.status),
            lat: club.lat ?? '',
            lng: club.lng ?? '',
            federation_id: club.federation_id || '',
            socials: normaliseSocials(club.socials),
            contacts: Array.isArray(club.contacts) ? club.contacts : [],
            opening_hours: { ...emptyHours(), ...(club.opening_hours || {}) },
            courts: normaliseCourts(club.courts),
            services: Array.isArray(club.services) ? club.services : [],
            cafe: club.cafe || null,
            sponsors: Array.isArray(club.sponsors) ? club.sponsors : [],
            principal_sponsor: club.principal_sponsor || null,
            gallery: Array.isArray(club.gallery) ? club.gallery : [],
            stats: club.stats && typeof club.stats === 'object' ? club.stats : {},
        });
        setSlugManual(true);
        setIsCreating(false);
        loadLinkedOrgs(selectedId);
        setSectionOpen(createClosedSections());
        // Only re-hydrate when the selected club id changes — not on every clubs[] refresh.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, loadLinkedOrgs]);

    // "New Club" opens the step-by-step wizard in a modal (same pattern as
    // EventBuilder); the collapsible editor remains the tool for editing.
    const startCreate = () => {
        setIsCreating(false);
        setShowWizard(true);
    };

    const handleWizardComplete = (club) => {
        setShowWizard(false);
        setClubs((prev) => [...prev.filter((c) => c.id !== club.id), club].sort((a, b) => a.name.localeCompare(b.name)));
        openClubDetail(club.id);
        loadClubs();
    };

    // Google Places autocomplete — shared helper with EventBuilder.
    // Depend on selectedId (not selected object) so club list refreshes don't tear this down.
    useEffect(() => {
        if ((!selectedId && !isCreating) || !sectionOpen.profile) return undefined;
        let cancelled = false;
        let attached = null;

        const timer = setTimeout(() => {
            const input = addressInputRef.current;
            if (!input) return;

            attachPlacesAutocomplete(input, {
                country: 'za',
                onPlace: (place) => {
                    const comps = place.address_components || [];
                    const get = (type) => comps.find((c) => c.types.includes(type))?.long_name || '';
                    const city = get('locality')
                        || get('sublocality')
                        || get('administrative_area_level_2')
                        || get('administrative_area_level_1');
                    const loc = place.geometry?.location;
                    const formatted = place.formatted_address || '';
                    if (formatted && addressInputRef.current) {
                        addressInputRef.current.value = formatted;
                    }
                    setForm((prev) => ({
                        ...prev,
                        address: formatted || prev.address,
                        city: city || prev.city,
                        lat: loc ? String(loc.lat()) : prev.lat,
                        lng: loc ? String(loc.lng()) : prev.lng,
                    }));
                },
            })
                .then((api) => {
                    if (cancelled) {
                        api.destroy();
                        return;
                    }
                    attached = api;
                    autocompleteRef.current = api;
                })
                .catch((err) => {
                    console.warn('Google Maps failed to load:', err);
                });
        }, 0);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            attached?.destroy();
            autocompleteRef.current = null;
        };
    }, [selectedId, isCreating, sectionOpen.profile]);

    const handleUpload = async (e, kind) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(kind);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const idPart = selectedId || 'new';
            const path = `clubs/${kind}/${idPart}_${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from('profile-pics').upload(path, file, { upsert: true });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('profile-pics').getPublicUrl(path);
            if (kind === 'logo') updateField('logo_url', publicUrl);
            else if (kind === 'cover') updateField('cover_image_url', publicUrl);
            else if (kind === 'gallery') {
                updateField('gallery', [
                    ...(form.gallery || []),
                    { url: publicUrl, category: 'other', caption: '' },
                ]);
            } else if (kind === 'indoor') {
                updateField('courts', {
                    ...form.courts,
                    indoor: { ...form.courts.indoor, image_url: publicUrl },
                });
            } else if (kind === 'outdoor') {
                updateField('courts', {
                    ...form.courts,
                    outdoor: { ...form.courts.outdoor, image_url: publicUrl },
                });
            } else if (kind === 'cafe') {
                updateField('cafe', { ...(form.cafe || { name: '', description: '', tags: [] }), image_url: publicUrl });
            } else if (kind === 'principal') {
                updateField('principal_sponsor', {
                    ...(form.principal_sponsor || { name: '', url: '' }),
                    logo_url: publicUrl,
                });
            }
            toast.success('Uploaded — save to keep');
        } catch (err) {
            toast.error(`Upload failed: ${err.message}`);
        } finally {
            setUploading(null);
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        if (!form.name.trim() || !form.slug.trim()) {
            toast.error('Name and slug are required');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                short_name: form.short_name?.trim() || null,
                slug: slugifyClub(form.slug),
                about: form.about || null,
                website_url: form.website_url || null,
                brand_color: form.brand_color || null,
                status: normalizeClubStatus(form.status) || 'unclaimed',
                contact_email: form.contact_email || null,
                contact_phone: form.contact_phone || null,
                whatsapp_number: form.whatsapp_number || null,
                city: form.city || null,
                address: form.address || null,
                lat: form.lat === '' || form.lat == null ? null : Number(form.lat),
                lng: form.lng === '' || form.lng == null ? null : Number(form.lng),
                logo_url: form.logo_url || null,
                cover_image_url: form.cover_image_url || null,
                verified: !!form.verified,
                sapa_registered: !!form.sapa_registered,
                federation_id: form.federation_id || null,
                socials: normaliseSocials(form.socials),
                contacts: Array.isArray(form.contacts) ? form.contacts : [],
                opening_hours: form.opening_hours || emptyHours(),
                courts: normaliseCourts(form.courts),
                services: Array.isArray(form.services) ? form.services : [],
                cafe: form.cafe || null,
                sponsors: Array.isArray(form.sponsors) ? form.sponsors : [],
                principal_sponsor: form.principal_sponsor || null,
                gallery: Array.isArray(form.gallery) ? form.gallery : [],
                stats: form.stats || {},
                updated_at: new Date().toISOString(),
            };

            if (isCreating || !selectedId) {
                const { data, error } = await supabase.from('clubs').insert([payload]).select('*').single();
                if (error) throw error;
                toast.success('Club created');
                setClubs((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                setSelectedId(data.id);
                setIsCreating(false);
            } else {
                const { data, error } = await supabase
                    .from('clubs')
                    .update(payload)
                    .eq('id', selectedId)
                    .select('*')
                    .single();
                if (error) throw error;
                toast.success('Club saved');
                setClubs((prev) => prev.map((c) => (c.id === data.id ? data : c)));
            }
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleAssignOrg = async () => {
        if (!selectedId || !assignOrgId) return;
        try {
            const { error } = await supabase.from('club_organisations').insert({
                club_id: selectedId,
                organisation_id: assignOrgId,
            });
            if (error) throw error;
            toast.success('Organisation linked');
            setAssignOrgId('');
            loadLinkedOrgs(selectedId);
        } catch (err) {
            toast.error(err.code === '23505' ? 'Already linked.' : err.message);
        }
    };

    const handleUnlinkOrg = async (orgId) => {
        try {
            const { error } = await supabase
                .from('club_organisations')
                .delete()
                .eq('club_id', selectedId)
                .eq('organisation_id', orgId);
            if (error) throw error;
            toast.success('Organisation unlinked');
            loadLinkedOrgs(selectedId);
        } catch (err) {
            toast.error(err.message);
        }
    };

    // Full-screen spinner only before the first load — swapping the editor out for
    // the spinner on refreshes detaches the Places autocomplete from the address input.
    if (loading && clubs.length === 0) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                <Loader2 className="animate-spin" size={18} /> Loading clubs…
            </div>
        );
    }

    const featuresText = (side) => (form.courts?.[side]?.features || []).join(', ');
    const setFeaturesText = (side, text) => {
        const features = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
        updateField('courts', {
            ...form.courts,
            [side]: { ...form.courts[side], features },
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                        <MapPin className="text-padel-green" size={22} /> Clubs
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        {effectiveView === 'mine'
                            ? 'Manage the clubs linked to your account.'
                            : 'Club cards linked to federations, organisations and players.'}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {showViewToggle && (
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                            <button
                                type="button"
                                onClick={() => handleViewModeChange('platform')}
                                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                    effectiveView === 'platform'
                                        ? 'bg-amber-500 text-black'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                Platform Overview
                            </button>
                            <button
                                type="button"
                                onClick={() => handleViewModeChange('mine')}
                                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                    effectiveView === 'mine'
                                        ? 'bg-padel-green text-black'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                My Clubs
                            </button>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => loadClubs()}
                        className="px-3 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-bold flex items-center gap-2"
                    >
                        <RefreshCw size={14} /> Refresh
                    </button>
                    {(isSuper || permissions?.allowed_tabs?.includes('clubs')) && (
                        <button
                            type="button"
                            onClick={startCreate}
                            className="px-3 py-2 rounded-xl bg-padel-green text-black text-sm font-black flex items-center gap-2"
                        >
                            <Plus size={14} /> New Club
                        </button>
                    )}
                </div>
            </div>

            {isSuper && pendingClubs.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Clock size={16} className="text-amber-400" />
                        <h3 className="text-sm font-black uppercase tracking-wider text-amber-300">
                            Clubs in review ({pendingClubs.length})
                        </h3>
                    </div>
                    <ul className="space-y-2">
                        {pendingClubs.map((club) => (
                            <li
                                key={club.id}
                                className="flex flex-wrap items-center gap-3 bg-black/40 border border-white/10 rounded-xl px-3 py-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white truncate">{club.name}</p>
                                    <p className="text-[11px] text-gray-400 truncate">
                                        {[club.city, applicantEmail(club)].filter(Boolean).join(' · ') || 'No contact email'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => openClubDetail(club.id)}
                                        className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-wider text-gray-300 hover:bg-white/5"
                                    >
                                        Review
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleApproveClub(club)}
                                        className="px-2.5 py-1.5 rounded-lg bg-padel-green text-black text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                                    >
                                        <Check size={12} /> Approve
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRejectClub(club)}
                                        className="px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                                    >
                                        <X size={12} /> Reject
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {isSuper && pendingClaims.length > 0 && (
                <div className="bg-sky-500/10 border border-sky-500/25 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Building size={16} className="text-sky-400" />
                        <h3 className="text-sm font-black uppercase tracking-wider text-sky-300">
                            Pending club claims ({pendingClaims.length})
                        </h3>
                    </div>
                    <ul className="space-y-2">
                        {pendingClaims.map((claim) => (
                            <li
                                key={claim.id}
                                className="flex flex-wrap items-center gap-3 bg-black/40 border border-white/10 rounded-xl px-3 py-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white truncate">
                                        {claim.clubs?.name || 'Club'}
                                    </p>
                                    <p className="text-[11px] text-gray-400 truncate">
                                        {[
                                            claim.full_name,
                                            claim.requester_email,
                                            claim.primary_role,
                                            claim.clubs?.city,
                                        ].filter(Boolean).join(' · ')}
                                    </p>
                                    {claim.notes && (
                                        <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{claim.notes}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {claim.club_id && (
                                        <button
                                            type="button"
                                            onClick={() => openClubDetail(claim.club_id)}
                                            className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-wider text-gray-300 hover:bg-white/5"
                                        >
                                            View club
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleApproveClaim(claim)}
                                        className="px-2.5 py-1.5 rounded-lg bg-padel-green text-black text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                                    >
                                        <Check size={12} /> Approve club claim
                                    </button>
                                        <button
                                            type="button"
                                            onClick={() => openRejectClaim(claim)}
                                            className="px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                                        >
                                            <X size={12} /> Reject club claim
                                        </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <AnimatePresence>
                {showWizard && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1100] overflow-y-auto"
                        onClick={() => setShowWizard(false)}
                    >
                        <div className="flex min-h-full items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.97, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.97, y: 20 }}
                                className="w-full max-w-xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <ClubCreateWizard
                                    mode="admin"
                                    onCancel={() => setShowWizard(false)}
                                    onOpenExisting={(clubId) => {
                                        setShowWizard(false);
                                        openClubDetail(clubId);
                                    }}
                                    onComplete={handleWizardComplete}
                                />
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {managerView === 'list' ? (
                <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {[
                            { label: 'Visible Clubs', value: managerStats.total, tone: 'text-white', helper: 'Shown in this list' },
                            { label: 'Claimed', value: managerStats.claimed, tone: 'text-padel-green', helper: 'Has owner/admin' },
                            { label: 'Published', value: managerStats.published, tone: 'text-sky-400', helper: 'Public directory' },
                            { label: 'In review', value: managerStats.inReview, tone: 'text-violet-400', helper: 'Pending club claim requests' },
                        ].map((stat) => (
                            <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 shadow-xl">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{stat.label}</p>
                                <p className={`mt-3 text-3xl font-display font-bold tracking-tighter ${stat.tone}`}>{stat.value}</p>
                                <p className="mt-1 text-xs text-gray-500">{stat.helper}</p>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden shadow-2xl">
                        <div className="flex flex-col gap-3 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                                <img
                                    src={clubsManagerLogo}
                                    alt="4M Padel Clubs"
                                    className="h-11 md:h-12 w-auto object-contain shrink-0"
                                />
                                <div className="min-w-0">
                                    <p className="text-sm text-gray-500">
                                        {listSearch.trim() || claimFilter !== 'all'
                                            ? `Showing ${Math.min(clubRows.length, ITEMS_PER_PAGE)} of ${clubRows.length} matching clubs`
                                            : `${visibleClubs.length} clubs available`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 w-full md:w-[520px] justify-end">
                                <div className="relative w-full md:w-[320px]">
                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                    <input
                                        type="search"
                                        value={listSearch}
                                        onChange={(e) => setListSearch(e.target.value)}
                                        placeholder="Search clubs..."
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-padel-green"
                                    />
                                </div>
                                <select
                                    value={claimFilter}
                                    onChange={(e) => setClaimFilter(e.target.value)}
                                    className="w-full md:w-[200px] bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-padel-green"
                                >
                                    {CLAIM_FILTER_OPTIONS.map((s) => (
                                        <option key={s.value} value={s.value}>
                                            {s.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {visibleClubs.length === 0 && !isCreating ? (
                            <div className="p-10 text-center text-sm text-gray-500">
                                {effectiveView === 'mine'
                                    ? 'No clubs linked to your account yet.'
                                    : 'No clubs yet. Create one or apply the clubs migration.'}
                            </div>
                        ) : clubRows.length === 0 ? (
                            <div className="p-10 text-center text-sm text-gray-500">
                                No clubs match your current filters.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <div className={`hidden md:grid ${CLUB_LIST_GRID} gap-3 px-4 py-3 border-b border-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 min-w-[1100px]`}>
                                    <div>Club</div>
                                    <div>City</div>
                                    <div>Owner / Admin</div>
                                    <div>Club Status</div>
                                    <div>Courts</div>
                                    <div>Members</div>
                                    <div>Linked Orgs</div>
                                    <div>Status</div>
                                    <div>Actions</div>
                                </div>
                                <div className="divide-y divide-white/5 md:min-w-[1100px]">
                                    {paginatedClubRows.map((club) => {
                                        const isClaimed = (club.admins || []).length > 0;
                                        const claimedBadgeClass = isClaimed
                                            ? 'bg-padel-green/10 text-padel-green border-padel-green/20'
                                            : 'bg-white/5 text-gray-400 border-white/10';
                                        const inReview = isInReviewClubStatus(club.status);
                                        const approvalBadgeClass = inReview
                                            ? 'bg-violet-500/10 text-violet-300 border-violet-500/20'
                                            : 'bg-padel-green/10 text-padel-green border-padel-green/20';
                                        const approvalLabel = inReview ? 'In review' : 'Published';
                                        return (
                                            <div
                                                key={club.id}
                                                className="group w-full px-4 py-4 hover:bg-white/[0.04] transition-all duration-200 hover:shadow-[inset_0_0_0_1px_rgba(204,255,0,0.18)]"
                                            >
                                                <div className="md:hidden space-y-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => openClubDetail(club.id)}
                                                        className="w-full flex items-start gap-3 text-left bg-transparent border-0 p-0 cursor-pointer"
                                                    >
                                                        {club.logo_url ? (
                                                            <img src={club.logo_url} alt="" className="w-12 h-12 rounded-2xl object-cover border border-white/10 shrink-0 transition-transform duration-200 group-hover:scale-[1.03]" />
                                                        ) : (
                                                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0 transition-colors duration-200 group-hover:border-padel-green/20 group-hover:text-padel-green">
                                                                <MapPin size={16} />
                                                            </div>
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="text-sm font-bold text-white truncate transition-colors duration-200 group-hover:text-padel-green">{club.short_name || club.name}</p>
                                                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${claimedBadgeClass}`}>
                                                                    {isClaimed ? 'Claimed' : 'Unclaimed'}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                {[club.cityLabel, club.regionLabel].filter(Boolean).join(' · ') || 'No city set'}
                                                            </p>
                                                            <div className="mt-3">
                                                                <OwnersAdminsCell
                                                                    admins={club.admins}
                                                                    onInvite={!club.admins?.length ? () => {
                                                                        setInviteClub(club);
                                                                        setInviteEmail('');
                                                                        setInviteSearchQuery('');
                                                                        setInviteSelectedPlayer(null);
                                                                        setInvitePlayerResults([]);
                                                                    } : undefined}
                                                                />
                                                            </div>
                                                            <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                                                <span>{club.totalCourts} courts</span>
                                                                <span>{club.members} members</span>
                                                                <span>{club.linkedOrgs} orgs</span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <button type="button" onClick={() => quickEditCity(club)} className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10">
                                                            City
                                                        </button>
                                                        <button type="button" onClick={() => setMembersClub(club)} className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 inline-flex items-center gap-1">
                                                            <UserPlus size={10} /> Owner
                                                        </button>
                                                        <button type="button" onClick={() => handleDeleteClub(club)} className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 inline-flex items-center gap-1">
                                                            <Trash2 size={10} /> Delete
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className={`hidden md:grid ${CLUB_LIST_GRID} gap-3 items-center`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => openClubDetail(club.id)}
                                                        className="flex items-center gap-3 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer"
                                                    >
                                                        {club.logo_url ? (
                                                            <img src={club.logo_url} alt="" className="w-12 h-12 rounded-2xl object-cover border border-white/10 shrink-0 transition-transform duration-200 group-hover:scale-[1.03]" />
                                                        ) : (
                                                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0 transition-colors duration-200 group-hover:border-padel-green/20 group-hover:text-padel-green">
                                                                <MapPin size={16} />
                                                            </div>
                                                        )}
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-white truncate transition-colors duration-200 group-hover:text-padel-green">{club.short_name || club.name}</p>
                                                            {club.short_name && club.short_name !== club.name && (
                                                                <p className="text-xs text-gray-500 truncate">{club.name}</p>
                                                            )}
                                                        </div>
                                                    </button>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-white truncate">{club.cityLabel || '—'}</p>
                                                        <p className="text-xs text-gray-500 truncate mt-0.5">{club.regionLabel || 'Region unset'}</p>
                                                    </div>
                                                    <OwnersAdminsCell
                                                        admins={club.admins}
                                                        onInvite={!club.admins?.length ? () => {
                                                            setInviteClub(club);
                                                            setInviteEmail('');
                                                            setInviteSearchQuery('');
                                                            setInviteSelectedPlayer(null);
                                                            setInvitePlayerResults([]);
                                                        } : undefined}
                                                    />
                                                    <div>
                                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${claimedBadgeClass}`}>
                                                            {isClaimed ? 'Claimed' : 'Unclaimed'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{club.totalCourts}</p>
                                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">In {Number(club.courts?.indoor?.count) || 0} / Out {Number(club.courts?.outdoor?.count) || 0}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{club.members}</p>
                                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Players linked</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{club.linkedOrgs}</p>
                                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Approved orgs</p>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5 justify-start">
                                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${approvalBadgeClass}`}>
                                                            {approvalLabel}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => quickEditCity(club)}
                                                            className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                                                            title="Set city"
                                                        >
                                                            City
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setMembersClub(club)}
                                                            className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white inline-flex items-center gap-1"
                                                            title="Add owner or admin"
                                                        >
                                                            <UserPlus size={10} /> Owner
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteClub(club)}
                                                            className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 inline-flex items-center gap-1"
                                                            title="Delete club"
                                                        >
                                                            <Trash2 size={10} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {clubRows.length > ITEMS_PER_PAGE && (
                                    <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 md:flex-row md:items-center md:justify-between">
                                        <p className="text-xs text-gray-500">
                                            Showing <span className="text-white">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
                                            <span className="text-white">{Math.min(currentPage * ITEMS_PER_PAGE, clubRows.length)}</span> of{' '}
                                            <span className="text-white">{clubRows.length}</span> clubs
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                                                disabled={currentPage === 1}
                                                className="px-3 py-2 rounded-xl border border-white/10 text-xs font-black uppercase tracking-wider text-gray-300 hover:bg-white/5 disabled:opacity-40"
                                            >
                                                Previous
                                            </button>
                                            <span className="text-xs font-black uppercase tracking-wider text-gray-500">
                                                Page {currentPage} of {totalPages}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                                                disabled={currentPage === totalPages}
                                                className="px-3 py-2 rounded-xl border border-white/10 text-xs font-black uppercase tracking-wider text-gray-300 hover:bg-white/5 disabled:opacity-40"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-4 min-w-0">
                    {(selected || isCreating) ? (
                        <>
                            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 md:p-5 shadow-2xl">
                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                    <div className="flex items-start gap-4 min-w-0">
                                        {selectedSummary?.logo ? (
                                            <img src={selectedSummary.logo} alt="" className="w-16 h-16 rounded-3xl object-cover border border-white/10 shrink-0" />
                                        ) : (
                                            <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                                <MapPin size={22} />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={backToClubList}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-widest text-padel-green hover:bg-padel-green/10 hover:border-padel-green/30"
                                                >
                                                    <ArrowLeft size={12} /> Back to clubs
                                                </button>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${clubStatusBadgeClass(selectedSummary?.status)}`}>
                                                    {clubStatusLabel(selectedSummary?.status)}
                                                </span>
                                            </div>
                                            <h3 className="mt-2 text-2xl md:text-3xl font-display font-bold tracking-tighter text-white truncate">
                                                {selectedSummary?.name}
                                            </h3>
                                            <p className="text-sm text-gray-400 mt-1">
                                                {isCreating ? 'Set up the new club profile and publish when ready.' : (selectedSummary?.city || 'No city set')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedSummary?.hasPublicPage && (
                                            <a
                                                href={`/clubs/${selected.slug}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className={ghostBtnClass}
                                            >
                                                <ExternalLink size={12} /> Public
                                            </a>
                                        )}
                                        {selected && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => quickEditCity(selected)}
                                                    className={ghostBtnClass}
                                                >
                                                    <MapPin size={12} /> City
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMembersClub(selected)}
                                                    className={ghostBtnClass}
                                                >
                                                    <UserPlus size={12} /> Owner / Admin
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteClub(selected)}
                                                    className="px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-xs font-bold text-red-400 hover:bg-red-500/20 flex items-center gap-1"
                                                >
                                                    <Trash2 size={12} /> Delete
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            disabled={saving || !!uploading}
                                            onClick={handleSave}
                                            className="px-3 py-1.5 rounded-lg bg-padel-green text-black text-xs font-black flex items-center gap-1 disabled:opacity-50"
                                        >
                                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                            Save
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                    {[
                                        { label: 'Members', value: selectedSummary?.members ?? 0, icon: Users, tone: 'text-padel-green' },
                                        { label: 'Courts', value: selectedSummary?.totalCourts ?? 0, icon: MapPin, tone: 'text-white' },
                                        { label: 'Linked Orgs', value: selectedSummary?.linkedOrgs ?? 0, icon: Building, tone: 'text-amber-300' },
                                        { label: 'Verified', value: selectedSummary?.verified ? 'Yes' : 'No', icon: ShieldCheck, tone: selectedSummary?.verified ? 'text-sky-300' : 'text-gray-400' },
                                    ].map((card) => {
                                        const Icon = card.icon;
                                        return (
                                            <div key={card.label} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                                                <div className="flex items-center gap-2">
                                                    <Icon size={14} className={card.tone} />
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{card.label}</p>
                                                </div>
                                                <p className={`mt-3 text-2xl font-display font-bold tracking-tighter ${card.tone}`}>{card.value}</p>
                                                {card.label === 'Courts' && (
                                                    <p className="text-[11px] text-gray-500 mt-1">
                                                        Indoor {selectedSummary?.indoor ?? 0} / Outdoor {selectedSummary?.outdoor ?? 0}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-4">

                            <CollapsibleSection
                                open={sectionOpen.profile}
                                onToggle={() => toggleSection('profile')}
                                title="Profile"
                                icon={MapPin}
                            >
                                <div className="grid md:grid-cols-2 gap-3">
                                    <label className={labelClass}>
                                        Name
                                        <input
                                            value={form.name ?? ''}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setForm((prev) => ({
                                                    ...prev,
                                                    name: v,
                                                    ...(isCreating && !slugManual
                                                        ? { slug: slugifyClub(v) }
                                                        : {}),
                                                }));
                                            }}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Short name
                                        <input
                                            value={form.short_name ?? ''}
                                            onChange={(e) => updateField('short_name', e.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Status
                                        <select
                                            value={normalizeClubStatus(form.status)}
                                            onChange={(e) => updateField('status', e.target.value)}
                                            className={inputClass}
                                        >
                                            {normalizeClubStatus(form.status) === 'rejected' && (
                                                <option value="rejected">Rejected</option>
                                            )}
                                            {CLUB_STATUSES.map((status) => (
                                                <option key={status.value} value={status.value}>
                                                    {status.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <div className="flex items-center gap-4 pt-6">
                                        <label className="flex items-center gap-2 text-xs text-gray-300 font-bold">
                                            <input type="checkbox" checked={!!form.verified} onChange={(e) => updateField('verified', e.target.checked)} />
                                            Verified
                                        </label>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={labelClass}>Address</label>
                                        <input
                                            key={selectedId || (isCreating ? 'new-club' : 'no-club')}
                                            ref={addressInputRef}
                                            value={form.address || ''}
                                            onChange={(e) => updateField('address', e.target.value)}
                                            placeholder="Start typing to search Google..."
                                            autoComplete="off"
                                            className={inputClass}
                                        />
                                        <p className="text-[10px] text-gray-500 mt-1 normal-case tracking-normal font-medium">
                                            Powered by Google — selecting a result auto-fills city, latitude and longitude.
                                        </p>
                                    </div>
                                    <label className={labelClass}>
                                        City
                                        <input
                                            value={form.city ?? ''}
                                            onChange={(e) => updateField('city', e.target.value)}
                                            className={inputClass}
                                            placeholder="Auto from address"
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        About
                                        <textarea
                                            value={form.about || ''}
                                            onChange={(e) => updateField('about', e.target.value)}
                                            rows={3}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Website
                                        <input
                                            value={form.website_url ?? ''}
                                            onChange={(e) => updateField('website_url', e.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Contact email
                                        <input
                                            value={form.contact_email ?? ''}
                                            onChange={(e) => updateField('contact_email', e.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Contact phone
                                        <input
                                            value={form.contact_phone ?? ''}
                                            onChange={(e) => updateField('contact_phone', e.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        WhatsApp
                                        <input
                                            value={form.whatsapp_number ?? ''}
                                            onChange={(e) => updateField('whatsapp_number', e.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Latitude
                                        <input
                                            value={form.lat ?? ''}
                                            onChange={(e) => updateField('lat', e.target.value)}
                                            className={inputClass}
                                            placeholder="Auto from address"
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Longitude
                                        <input
                                            value={form.lng ?? ''}
                                            onChange={(e) => updateField('lng', e.target.value)}
                                            className={inputClass}
                                            placeholder="Auto from address"
                                        />
                                    </label>
                                </div>

                                <div className="grid md:grid-cols-2 gap-3">
                                    <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                                        {form.logo_url ? (
                                            <img src={form.logo_url} alt="logo" className="w-16 h-16 rounded-2xl object-cover bg-white border border-white/10 shrink-0" />
                                        ) : (
                                            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                                <MapPin size={24} />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-white">Club Logo</p>
                                            <label className="inline-flex items-center gap-1.5 mt-2 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer">
                                                <Upload size={11} /> {uploading === 'logo' ? 'Uploading…' : 'Upload'}
                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'logo')} disabled={!!uploading} />
                                            </label>
                                        </div>
                                    </div>
                                    <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                                        {form.cover_image_url ? (
                                            <img src={form.cover_image_url} alt="cover" className="w-24 h-16 rounded-xl object-cover border border-white/10 shrink-0" />
                                        ) : (
                                            <div className="w-24 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                                <ImageIcon size={22} />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-white">Hero Cover</p>
                                            <label className="inline-flex items-center gap-1.5 mt-2 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer">
                                                <Upload size={11} /> {uploading === 'cover' ? 'Uploading…' : 'Upload'}
                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'cover')} disabled={!!uploading} />
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Palette size={14} style={{ color: form.brand_color || '#CC1414' }} />
                                        <p className="text-xs font-bold text-white">Brand colour</p>
                                        <span className="text-[10px] text-gray-500">— accents on the public club page</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {COLOR_PRESETS.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => updateField('brand_color', c)}
                                                className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                                                    form.brand_color === c ? 'border-white scale-110' : 'border-transparent'
                                                }`}
                                                style={{ background: c }}
                                                title={c}
                                            />
                                        ))}
                                        <input
                                            type="color"
                                            value={/^#[0-9A-Fa-f]{6}$/.test(form.brand_color || '') ? form.brand_color : '#CC1414'}
                                            onChange={(e) => updateField('brand_color', e.target.value)}
                                            className="w-8 h-8 rounded-full border border-white/20 bg-transparent cursor-pointer"
                                            title="Custom colour"
                                        />
                                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 ml-1">
                                            {form.brand_color || '#CC1414'}
                                        </span>
                                    </div>
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.sponsor} onToggle={() => toggleSection('sponsor')} title="Principal Sponsor Banner" icon={Building}>
                                <div className="grid md:grid-cols-2 gap-3">
                                    <label className={labelClass}>
                                        Sponsor name
                                        <input
                                            value={form.principal_sponsor?.name || ''}
                                            onChange={(e) => updateField('principal_sponsor', { ...(form.principal_sponsor || {}), name: e.target.value })}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Sponsor URL
                                        <input
                                            value={form.principal_sponsor?.url || ''}
                                            onChange={(e) => updateField('principal_sponsor', { ...(form.principal_sponsor || {}), url: e.target.value })}
                                            className={inputClass}
                                            placeholder="https://..."
                                        />
                                    </label>
                                </div>
                                <div className="flex items-center gap-3">
                                    {form.principal_sponsor?.logo_url && (
                                        <img src={form.principal_sponsor.logo_url} alt="" className="h-10 object-contain bg-white/5 rounded-lg px-2" />
                                    )}
                                    <label className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer">
                                        <Upload size={11} /> {uploading === 'principal' ? 'Uploading…' : 'Logo'}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'principal')} disabled={!!uploading} />
                                    </label>
                                    {form.principal_sponsor && (
                                        <button type="button" onClick={() => updateField('principal_sponsor', null)} className="text-red-400 text-xs font-bold">Clear</button>
                                    )}
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.socials}
                                onToggle={() => toggleSection('socials')}
                                title="Social Media"
                                icon={Instagram}
                                count={
                                    Object.values(normaliseSocials(form.socials)).filter((v) => String(v || '').trim()).length
                                    + (String(form.whatsapp_number || '').trim() ? 1 : 0)
                                }
                            >
                                <div className="grid md:grid-cols-2 gap-3">
                                    {[
                                        ['instagram', 'Instagram', Instagram, 'https://instagram.com/...'],
                                        ['facebook', 'Facebook', Facebook, 'https://facebook.com/...'],
                                        ['tiktok', 'TikTok', ExternalLink, 'https://tiktok.com/@...'],
                                        ['playtomic', 'Playtomic', ExternalLink, 'https://playtomic.com/...'],
                                    ].map((entry) => {
                                        const key = entry[0];
                                        const label = entry[1];
                                        const SocialIcon = entry[2];
                                        const placeholder = entry[3];
                                        return (
                                        <label key={key} className={labelClass}>
                                            {label}
                                            <div className="relative mt-1">
                                                <SocialIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                                <input
                                                    value={form.socials?.[key] || ''}
                                                    onChange={(e) => updateField('socials', { ...normaliseSocials(form.socials), [key]: e.target.value })}
                                                    className={`${inputClass} !mt-0 pl-9`}
                                                    placeholder={placeholder}
                                                />
                                            </div>
                                        </label>
                                        );
                                    })}
                                    <label className={labelClass}>
                                        WhatsApp
                                        <div className="relative mt-1">
                                            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                            <input
                                                value={form.whatsapp_number ?? ''}
                                                onChange={(e) => updateField('whatsapp_number', e.target.value)}
                                                className={`${inputClass} !mt-0 pl-9`}
                                                placeholder="0XX XXX XXXX"
                                            />
                                        </div>
                                    </label>
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.courts} onToggle={() => toggleSection('courts')} title="Courts" icon={MapPin}>
                                {['indoor', 'outdoor'].map((side) => (
                                    <div key={side} className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-3">
                                        <p className="text-xs font-black uppercase tracking-wider text-white">{side} courts</p>
                                        <div className="grid sm:grid-cols-2 gap-3">
                                            <label className={labelClass}>
                                                Count
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={form.courts?.[side]?.count ?? 0}
                                                    onChange={(e) => updateField('courts', {
                                                        ...form.courts,
                                                        [side]: { ...form.courts[side], count: Number(e.target.value) || 0 },
                                                    })}
                                                    className={inputClass}
                                                />
                                            </label>
                                            <label className={labelClass}>
                                                Features (comma-separated)
                                                <input
                                                    value={featuresText(side)}
                                                    onChange={(e) => setFeaturesText(side, e.target.value)}
                                                    className={inputClass}
                                                    placeholder="Panoramic glass, LED lighting"
                                                />
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {form.courts?.[side]?.image_url && (
                                                <img src={form.courts[side].image_url} alt="" className="w-20 h-14 rounded-lg object-cover" />
                                            )}
                                            <label className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer">
                                                <Upload size={11} /> {uploading === side ? 'Uploading…' : 'Photo'}
                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, side)} disabled={!!uploading} />
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.cafe} onToggle={() => toggleSection('cafe')} title="Café / Restaurant" icon={Building}>
                                <div className="grid md:grid-cols-2 gap-3">
                                    <label className={labelClass}>
                                        Name
                                        <input
                                            value={form.cafe?.name || ''}
                                            onChange={(e) => updateField('cafe', { ...(form.cafe || {}), name: e.target.value })}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Hours note
                                        <input
                                            value={form.cafe?.hours_note || ''}
                                            onChange={(e) => updateField('cafe', { ...(form.cafe || {}), hours_note: e.target.value })}
                                            className={inputClass}
                                            placeholder="Daily · On-site"
                                        />
                                    </label>
                                </div>
                                <label className={labelClass}>
                                    Description
                                    <textarea
                                        value={form.cafe?.description || ''}
                                        onChange={(e) => updateField('cafe', { ...(form.cafe || {}), description: e.target.value })}
                                        rows={2}
                                        className={inputClass}
                                    />
                                </label>
                                <label className={labelClass}>
                                    Tags (comma-separated)
                                    <input
                                        value={(form.cafe?.tags || []).join(', ')}
                                        onChange={(e) => updateField('cafe', {
                                            ...(form.cafe || {}),
                                            tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                                        })}
                                        className={inputClass}
                                    />
                                </label>
                                <label className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer">
                                    <Upload size={11} /> {uploading === 'cafe' ? 'Uploading…' : 'Photo'}
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'cafe')} disabled={!!uploading} />
                                </label>
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.services}
                                onToggle={() => toggleSection('services')}
                                title="Services"
                                icon={Building}
                                count={(form.services || []).length}
                                actions={(
                                    <button
                                        type="button"
                                        onClick={() => updateField('services', [...(form.services || []), { title: '', description: '', tags: [] }])}
                                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-wider text-white"
                                    >
                                        <Plus size={12} className="inline" /> Add
                                    </button>
                                )}
                            >
                                {(form.services || []).length === 0 ? (
                                    <p className="text-sm text-gray-500">No services yet — e.g. Pro shop, Coaching, Parking.</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {(form.services || []).map((svc, idx) => (
                                            <li key={idx} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 bg-black/30 border border-white/5 rounded-xl p-2.5">
                                                <input
                                                    value={svc.title || ''}
                                                    onChange={(e) => {
                                                        const next = [...form.services];
                                                        next[idx] = { ...next[idx], title: e.target.value };
                                                        updateField('services', next);
                                                    }}
                                                    placeholder="Title"
                                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                                />
                                                <input
                                                    value={svc.description || ''}
                                                    onChange={(e) => {
                                                        const next = [...form.services];
                                                        next[idx] = { ...next[idx], description: e.target.value };
                                                        updateField('services', next);
                                                    }}
                                                    placeholder="Description"
                                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => updateField('services', form.services.filter((_, i) => i !== idx))}
                                                    className="text-red-400 p-2"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.hours} onToggle={() => toggleSection('hours')} title="Opening Hours" icon={Building}>
                                <div className="space-y-2">
                                    {Object.keys(DAY_LABELS).map((day) => (
                                        <div key={day} className="grid grid-cols-[100px_1fr_1fr_auto] gap-2 items-center">
                                            <span className="text-xs font-bold text-gray-400">{DAY_LABELS[day]}</span>
                                            <input
                                                type="time"
                                                disabled={!!form.opening_hours?.[day]?.closed}
                                                value={form.opening_hours?.[day]?.open || ''}
                                                onChange={(e) => updateField('opening_hours', {
                                                    ...form.opening_hours,
                                                    [day]: { ...form.opening_hours[day], open: e.target.value },
                                                })}
                                                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
                                            />
                                            <input
                                                type="time"
                                                disabled={!!form.opening_hours?.[day]?.closed}
                                                value={form.opening_hours?.[day]?.close || ''}
                                                onChange={(e) => updateField('opening_hours', {
                                                    ...form.opening_hours,
                                                    [day]: { ...form.opening_hours[day], close: e.target.value },
                                                })}
                                                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
                                            />
                                            <label className="text-[10px] text-gray-500 font-bold flex items-center gap-1">
                                                <input
                                                    type="checkbox"
                                                    checked={!!form.opening_hours?.[day]?.closed}
                                                    onChange={(e) => updateField('opening_hours', {
                                                        ...form.opening_hours,
                                                        [day]: { ...form.opening_hours[day], closed: e.target.checked },
                                                    })}
                                                />
                                                Closed
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.gallery}
                                onToggle={() => toggleSection('gallery')}
                                title="Gallery"
                                icon={ImageIcon}
                                count={(form.gallery || []).length}
                                actions={(
                                    <label className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-wider text-white cursor-pointer flex items-center gap-1">
                                        <Upload size={12} /> {uploading === 'gallery' ? '…' : 'Add'}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'gallery')} disabled={!!uploading} />
                                    </label>
                                )}
                            >
                                {(form.gallery || []).length === 0 ? (
                                    <p className="text-sm text-gray-500">No gallery images yet.</p>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {(form.gallery || []).map((img, idx) => (
                                            <div key={idx} className="relative group rounded-xl overflow-hidden border border-white/10">
                                                <img src={img.url} alt="" className="w-full h-28 object-cover" />
                                                <select
                                                    value={img.category || 'other'}
                                                    onChange={(e) => {
                                                        const next = [...form.gallery];
                                                        next[idx] = { ...next[idx], category: e.target.value };
                                                        updateField('gallery', next);
                                                    }}
                                                    className="absolute bottom-2 left-2 bg-black/80 text-[10px] text-white rounded px-1.5 py-0.5 border border-white/20"
                                                >
                                                    {['courts', 'cafe', 'facilities', 'events', 'other'].map((c) => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => updateField('gallery', form.gallery.filter((_, i) => i !== idx))}
                                                    className="absolute top-2 right-2 p-1 rounded bg-black/70 text-red-400"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.sponsors}
                                onToggle={() => toggleSection('sponsors')}
                                title="Sponsors & Partners"
                                icon={Building}
                                count={(form.sponsors || []).length}
                                actions={(
                                    <button
                                        type="button"
                                        onClick={() => updateField('sponsors', [...(form.sponsors || []), { name: '', tier: 'Partner', logo_url: '' }])}
                                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-wider text-white"
                                    >
                                        Add
                                    </button>
                                )}
                            >
                                {(form.sponsors || []).map((sp, idx) => (
                                    <div key={idx} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
                                        <input
                                            value={sp.name || ''}
                                            onChange={(e) => {
                                                const next = [...form.sponsors];
                                                next[idx] = { ...next[idx], name: e.target.value };
                                                updateField('sponsors', next);
                                            }}
                                            placeholder="Name"
                                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                        />
                                        <input
                                            value={sp.tier || ''}
                                            onChange={(e) => {
                                                const next = [...form.sponsors];
                                                next[idx] = { ...next[idx], tier: e.target.value };
                                                updateField('sponsors', next);
                                            }}
                                            placeholder="Tier"
                                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                        />
                                        <button type="button" onClick={() => updateField('sponsors', form.sponsors.filter((_, i) => i !== idx))} className="text-red-400 p-2">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.contacts}
                                onToggle={() => toggleSection('contacts')}
                                title="Contacts"
                                icon={Users}
                                count={(form.contacts || []).length}
                                actions={(
                                    <button
                                        type="button"
                                        onClick={() => updateField('contacts', [...(form.contacts || []), { name: '', role: '', email: '', phone: '', whatsapp: '' }])}
                                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-wider text-white"
                                    >
                                        Add
                                    </button>
                                )}
                            >
                                {(form.contacts || []).map((c, idx) => (
                                    <div key={idx} className="grid sm:grid-cols-2 gap-2 bg-black/30 border border-white/5 rounded-xl p-3">
                                        {['name', 'role', 'email', 'phone', 'whatsapp'].map((key) => (
                                            <input
                                                key={key}
                                                value={c[key] || ''}
                                                onChange={(e) => {
                                                    const next = [...form.contacts];
                                                    next[idx] = { ...next[idx], [key]: e.target.value };
                                                    updateField('contacts', next);
                                                }}
                                                placeholder={key}
                                                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white capitalize"
                                            />
                                        ))}
                                        <button type="button" onClick={() => updateField('contacts', form.contacts.filter((_, i) => i !== idx))} className="text-red-400 text-xs font-bold text-left">
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.orgs} onToggle={() => toggleSection('orgs')} title="Linked Organisations" icon={Building} count={linkedOrgIds.length}>
                                {!selectedId ? (
                                    <p className="text-sm text-gray-500">Save the club first, then link organisations.</p>
                                ) : (
                                    <>
                                        <div className="flex gap-2">
                                            <select
                                                value={assignOrgId}
                                                onChange={(e) => setAssignOrgId(e.target.value)}
                                                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                                            >
                                                <option value="">Select organisation…</option>
                                                {approvedOrgs
                                                    .filter((o) => !linkedOrgIds.includes(o.id))
                                                    .map((o) => (
                                                        <option key={o.id} value={o.id}>{o.name}</option>
                                                    ))}
                                            </select>
                                            <button type="button" onClick={handleAssignOrg} disabled={!assignOrgId} className="px-3 py-2 rounded-xl bg-padel-green text-black text-xs font-black disabled:opacity-40">
                                                Link
                                            </button>
                                        </div>
                                        <ul className="space-y-2">
                                            {linkedOrgIds.map((oid) => {
                                                const org = approvedOrgs.find((o) => o.id === oid);
                                                if (!org) return null;
                                                return (
                                                    <li key={oid} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                                                        <span className="text-sm text-white font-bold">{org.name}</span>
                                                        <button type="button" onClick={() => handleUnlinkOrg(oid)} className="text-red-400 text-xs font-bold">Unlink</button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </>
                                )}
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.federation} onToggle={() => toggleSection('federation')} title="Federation" icon={Building}>
                                <label className={labelClass}>
                                    Linked federation
                                    <select
                                        value={form.federation_id || ''}
                                        onChange={(e) => updateField('federation_id', e.target.value)}
                                        className={inputClass}
                                    >
                                        <option value="">None</option>
                                        {federations.map((f) => (
                                            <option key={f.id} value={f.id}>{f.short_name || f.name}</option>
                                        ))}
                                    </select>
                                </label>
                            </CollapsibleSection>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-20 text-gray-500 text-sm border border-white/5 rounded-2xl">
                            Select a club or create a new one.
                        </div>
                    )}
                </div>
            )}

            {membersClub && (
                <ClubMembersManager
                    club={membersClub}
                    onClose={() => {
                        const clubId = membersClub.id;
                        setMembersClub(null);
                        loadClubMetrics(clubs.map((c) => c.id).filter(Boolean));
                        if (clubId) loadLinkedOrgs(clubId);
                    }}
                />
            )}

            {inviteClub && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => {
                        setInviteClub(null);
                        setInviteEmail('');
                        setInviteSearchQuery('');
                        setInviteSelectedPlayer(null);
                        setInvitePlayerResults([]);
                    }}
                >
                    <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black text-white uppercase tracking-wide">Invite to Claim Club</h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setInviteClub(null);
                                    setInviteEmail('');
                                    setInviteSearchQuery('');
                                    setInviteSelectedPlayer(null);
                                    setInvitePlayerResults([]);
                                }}
                                className="text-gray-500 hover:text-white"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-sm text-gray-400 mb-4">
                            Send an email invite for <span className="text-white font-bold">{inviteClub.name}</span>. The recipient will be able to accept and become the club owner.
                        </p>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Search user (name or email)</label>
                        <input
                            type="text"
                            value={inviteSearchQuery || inviteEmail}
                            onChange={(e) => {
                                const next = e.target.value;
                                setInviteSearchQuery(next);
                                setInviteEmail(next);
                                setInviteSelectedPlayer(null);
                            }}
                            placeholder="Start typing…"
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-padel-green/50 mb-3"
                            onKeyDown={(e) => e.key === 'Enter' && handleSendClaimInvite()}
                        />

                        {(inviteIsSearching || invitePlayerResults.length > 0) && inviteSearchQuery.trim().length >= 2 && (
                            <div className="bg-black/40 border border-white/10 rounded-xl divide-y divide-white/5 mb-4">
                                {invitePlayerResults.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => {
                                            setInviteSelectedPlayer(p);
                                            setInviteEmail(p.email || '');
                                            setInviteSearchQuery(p.email || '');
                                            setInvitePlayerResults([]);
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between gap-2"
                                    >
                                        <span className="text-sm text-white truncate">
                                            {p.name || p.email}
                                        </span>
                                        <span className="text-[10px] text-gray-500 flex items-center gap-1 truncate">
                                            <Mail size={12} /> {p.email}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {!inviteSelectedPlayer?.id && inviteSearchQuery.trim() && inviteSearchQuery.trim().length >= 2 && invitePlayerResults.length === 0 && !inviteIsSearching && (
                            <p className="text-[11px] text-gray-500 mb-4">
                                No matching player found. We&apos;ll invite them to create their profile first, then they can accept the claim invite.
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={handleSendClaimInvite}
                            disabled={inviteSending || !inviteEmail.trim()}
                            className="w-full py-3 rounded-xl bg-padel-green text-black font-black uppercase tracking-wider text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                        >
                            {inviteSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            {inviteSending ? 'Sending...' : 'Send Invite'}
                        </button>
                    </div>
                </div>
            )}

            {rejectClaimTarget && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={() => {
                        if (rejectClaimSaving) return;
                        setRejectClaimTarget(null);
                        setRejectClaimNotes('');
                    }}
                >
                    <div
                        className="bg-[#141414] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black text-white uppercase tracking-wide">Reject Club Claim</h3>
                            <button
                                type="button"
                                disabled={rejectClaimSaving}
                                onClick={() => {
                                    setRejectClaimTarget(null);
                                    setRejectClaimNotes('');
                                }}
                                className="text-gray-500 hover:text-white disabled:opacity-40"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-sm text-gray-400 mb-4">
                            Reject the club claim for{' '}
                            <span className="text-white font-bold">{rejectClaimTarget.clubs?.name || 'this club'}</span>
                            {rejectClaimTarget.full_name ? (
                                <> from <span className="text-white font-bold">{rejectClaimTarget.full_name}</span></>
                            ) : null}
                            . Please add a short reason — this is emailed to the requester.
                        </p>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                            Rejection notes
                        </label>
                        <textarea
                            value={rejectClaimNotes}
                            onChange={(e) => setRejectClaimNotes(e.target.value)}
                            rows={4}
                            placeholder="Why is this club claim being rejected?"
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 mb-4 resize-none"
                        />
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={rejectClaimSaving}
                                onClick={() => {
                                    setRejectClaimTarget(null);
                                    setRejectClaimNotes('');
                                }}
                                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-300 font-black uppercase tracking-wider text-sm hover:bg-white/5 disabled:opacity-40"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRejectClaim}
                                disabled={rejectClaimSaving || !rejectClaimNotes.trim()}
                                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black uppercase tracking-wider text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                            >
                                {rejectClaimSaving ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                                {rejectClaimSaving ? 'Rejecting...' : 'Reject Club Claim'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClubManager;
