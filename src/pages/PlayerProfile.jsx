import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import LicensePaymentModal from '../components/LicensePaymentModal';
import CoachProfileModal from '../components/CoachProfileModal';
import heroBg from '../assets/hero_bg.png';
import { useRankedin } from '../hooks/useRankedin';
import { usePendingPayments } from '../hooks/usePendingPayments';
import { useClubs } from '../hooks/useClubs';
import SearchableSelect from '../components/SearchableSelect';
import { User, Phone, Save, AlertCircle, CheckCircle, CheckCircle2, Image as PhotoIcon, Briefcase, MapPin, Trophy, ShieldCheck, Shield, Mail, ChevronDown, CreditCard, Lock, Calendar as CalendarIcon, ExternalLink, Users, Instagram, TrendingUp, Edit3, X } from 'lucide-react';

const PlayerProfile = () => {
    const [loading, setLoading] = useState(true);
    const [hasSession, setHasSession] = useState(null);
    const [isMobileAccordionOpen, setIsMobileAccordionOpen] = useState(false);
    const [isCareerAccordionOpen, setIsCareerAccordionOpen] = useState(false);
    const [isSecurityAccordionOpen, setIsSecurityAccordionOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingGalleryImage, setUploadingGalleryImage] = useState(false);
    const [activeLightboxImg, setActiveLightboxImg] = useState(null);
    const [message, setMessage] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [player, setPlayer] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [isImpersonating, setIsImpersonating] = useState(false);
    const [loadingReset, setLoadingReset] = useState(false);
    const [coachApplication, setCoachApplication] = useState(null);
    const [showCoachModal, setShowCoachModal] = useState(false);
    const navigate = useNavigate();
    const [transactions, setTransactions] = useState([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [currentTransactionPage, setCurrentTransactionPage] = useState(1);
    const [transactionsPerPage] = useState(5);
    const [activeTab, setActiveTab] = useState('events');
    const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
    const [isMobileEditingProfile, setIsMobileEditingProfile] = useState(false);
    const [selectedRankingForBreakdown, setSelectedRankingForBreakdown] = useState(null);
    const [tempLicenseDetails, setTempLicenseDetails] = useState(null);
    const [currentMatchPage, setCurrentMatchPage] = useState(1);




    const [isActivationRequired, setIsActivationRequired] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const [pastEvents, setPastEvents] = useState([]);
    const [eventViewTab, setEventViewTab] = useState('upcoming'); // 'upcoming' | 'past' | 'pending'
    const [matchViewTab, setMatchViewTab] = useState('upcoming'); // 'upcoming' | 'past'
    const [matchHistory, setMatchHistory] = useState({ upcoming: [], history: [] });
    const [loadingMatches, setLoadingMatches] = useState(false);
    const { getPlayerEventsAsync, getPlayerMatches, loading: loadingEvents } = useRankedin();
    const { pendingPayments } = usePendingPayments(player?.email, player?.rankedin_id);
    const { clubs } = useClubs();
    const pendingPaymentEvents = upcomingEvents.filter(event => pendingPayments?.some(p => p.id === event.db_id));
    const currentTab = (eventViewTab === 'pending' && pendingPaymentEvents.length === 0) ? 'upcoming' : eventViewTab;
    const filteredEvents = currentTab === 'pending' ? pendingPaymentEvents : (currentTab === 'past' ? pastEvents : upcomingEvents);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        contact_number: '',
        nationality: '',
        gender: '',
        bio: '',
        sponsors: '',
        category: '',
        id_number: '',
        home_club: '',
        club_id: '',
        custom_club: '',
        age: '',
        instagram_link: '',
        region: '',
        racket_brand: '',
        additional_images: []
    });

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 5000);
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (newPassword.length < 6) {
            showMessage('Password must be at least 6 characters', 'error');
            return;
        }
        setIsUpdatingPassword(true);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            showMessage(error.message, 'error');
        } else {
            showMessage('Password set successfully! Your account is now active.', 'success');
            setNewPassword('');
            setIsActivationRequired(false);
            // Clear the URL param
            navigate('/profile', { replace: true });
        }
        setIsUpdatingPassword(false);
    };

    useEffect(() => {
        const checkUserAndFetchProfile = async () => {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setHasSession(false);
                setLoading(false);
                return;
            }

            setHasSession(true);

            // Check if Admin is impersonating a user
            const testEmail = sessionStorage.getItem('admin_test_login_email');
            if (testEmail) {
                setIsImpersonating(true);
            }
            const emailToFetch = testEmail || session.user.email;

            const { data: playerData, error } = await supabase
                .from('players')
                .select('*')
                .ilike('email', emailToFetch)
                .maybeSingle();

            if (error) {
                showMessage(error.message, 'error');
            } else if (playerData) {
                setPlayer(playerData);
                if (playerData.rankings && Array.isArray(playerData.rankings) && playerData.rankings.length > 0) {
                    setSelectedRankingForBreakdown(playerData.rankings[0]);
                }

                if (playerData.license_type === 'temporary') {
                    const { data: tempLicenseData } = await supabase
                        .from('temporary_licenses')
                        .select('*')
                        .eq('player_id', playerData.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (tempLicenseData) {
                        const eventDate = new Date(tempLicenseData.event_date);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        if (eventDate < today) {
                            // License has expired!
                            console.log('Temporary license expired, resetting status...');
                            await supabase
                                .from('players')
                                .update({ license_type: 'none', paid_registration: false })
                                .eq('id', playerData.id);

                            // Update local state
                            setPlayer(prev => ({ ...prev, license_type: 'none', paid_registration: false }));
                            setTempLicenseDetails(null);
                        } else {
                            setTempLicenseDetails(tempLicenseData);
                        }
                    } else {
                        // Marked as temporary but no record found - clean up
                        await supabase
                            .from('players')
                            .update({ license_type: 'none', paid_registration: false })
                            .eq('id', playerData.id);
                        setPlayer(prev => ({ ...prev, license_type: 'none', paid_registration: false }));
                    }
                }

                // Check for activation state
                const isInvite = window.location.search.includes('new_invite=true') || window.location.hash.includes('type=recovery') || window.location.hash.includes('type=invite') || window.location.hash.includes('type=magiclink');
                if (isInvite) {
                    setIsActivationRequired(true);
                }

                // Update last_login timestamp
                await supabase
                    .from('players')
                    .update({ last_login: new Date().toISOString() })
                    .eq('id', playerData.id);

                // Format sponsors back to a comma-separated string for editing
                let sponsorsString = '';
                if (playerData.sponsors) {
                    try {
                        const parsed = JSON.parse(playerData.sponsors);
                        sponsorsString = Array.isArray(parsed) ? parsed.join(', ') : playerData.sponsors;
                    } catch {
                        sponsorsString = playerData.sponsors;
                    }
                }

                let additionalImagesArray = [];
                if (playerData.additional_images) {
                    try {
                        const parsed = typeof playerData.additional_images === 'string'
                            ? JSON.parse(playerData.additional_images)
                            : playerData.additional_images;
                        additionalImagesArray = Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        console.error("Failed to parse additional_images:", e);
                    }
                }

                setFormData({
                    name: playerData.name || '',
                    email: playerData.email || '',
                    contact_number: playerData.contact_number || '',
                    nationality: playerData.nationality || '',
                    gender: playerData.gender || '',
                    bio: playerData.bio || '',
                    home_club: playerData.home_club || '',
                    club_id: playerData.club_id || (playerData.home_club && clubs.length > 0 && !clubs.some(c => c.id === playerData.club_id) ? 'Other' : ''),
                    custom_club: (playerData.home_club && clubs.length > 0 && !clubs.some(c => c.id === playerData.club_id)) ? playerData.home_club : '',
                    sponsors: sponsorsString,
                    image_url: playerData.image_url || '',
                    category: playerData.category || '',
                    id_number: playerData.id_number || '',
                    age: playerData.age || '',
                    instagram_link: playerData.instagram_link || '',
                    region: playerData.region || '',
                    racket_brand: playerData.racket_brand || '',
                    additional_images: additionalImagesArray
                });

                // Fetch associated coach application if any
                const { data: coachData } = await supabase
                    .from('coach_applications')
                    .select('*')
                    .ilike('email', emailToFetch)
                    .maybeSingle();

                if (coachData) {
                    setCoachApplication(coachData);
                }

                // Fetch transactions for this user
                fetchTransactions(emailToFetch);
            }
            setLoading(false);
        };

        const fetchTransactions = async (email) => {
            setTransactionsLoading(true);
            try {
                const { data: pData } = await supabase.from('players').select('id').ilike('email', email).maybeSingle();
                if (!pData) return;

                const { data, error } = await supabase
                    .from('payments')
                    .select('*, calendar(event_name)')
                    .eq('player_id', pData.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                if (data) {
                    setTransactions(data.map(t => ({
                        id: t.reference || t.id,
                        date: t.metadata?.original_trx?.date || new Date(t.created_at).toLocaleDateString(),
                        amount: `R ${t.amount}`,
                        status: t.status.charAt(0).toUpperCase() + t.status.slice(1),
                        payment_type: t.payment_type,
                        event_name: t.calendar?.event_name || t.metadata?.event_name
                    })));
                }
            } catch (err) {
                console.error("Failed to fetch transactions:", err);
            } finally {
                setTransactionsLoading(false);
            }
        };




        checkUserAndFetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('edit') === 'true') {
            setIsEditing(true);
        }
        const tab = params.get('tab');
        if (tab && ['events', 'matches', 'rankings', 'payments'].includes(tab)) {
            setActiveTab(tab);
        }
    }, []);

    const indexOfLastTransaction = currentTransactionPage * transactionsPerPage;
    const indexOfFirstTransaction = indexOfLastTransaction - transactionsPerPage;
    const currentTransactionsList = transactions.slice(indexOfFirstTransaction, indexOfLastTransaction);
    const totalTransactionPages = Math.ceil(transactions.length / transactionsPerPage);

    const matchesPerPage = 5;
    const indexOfLastMatch = currentMatchPage * matchesPerPage;
    const indexOfFirstMatch = indexOfLastMatch - matchesPerPage;
    const currentMatchesHistoryList = (matchHistory.history || []).slice(indexOfFirstMatch, indexOfLastMatch);
    const totalMatchPages = Math.ceil((matchHistory.history || []).length / matchesPerPage);
    const currentMatchesUpcomingList = (matchHistory.upcoming || []).slice(indexOfFirstMatch, indexOfLastMatch);
    const totalUpcomingMatchPages = Math.ceil((matchHistory.upcoming || []).length / matchesPerPage);


    useEffect(() => {
        if (player?.rankedin_id) {
            const fetchEvents = async () => {
                const events = await getPlayerEventsAsync(player.rankedin_id);
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);

                const upcoming = (events || [])
                    .filter(e => {
                        const eventEnd = e.end_date ? new Date(e.end_date) : new Date(e.start_date);
                        eventEnd.setHours(23, 59, 59, 999);
                        return eventEnd >= startOfToday && e.state !== 2;
                    })
                    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

                // Filter for past events (state === 4 or date is in past, excluding state 2)
                const past = (events || [])
                    .filter(e => {
                        const eventEnd = e.end_date ? new Date(e.end_date) : new Date(e.start_date);
                        eventEnd.setHours(23, 59, 59, 999);
                        return e.state === 4 || (eventEnd < startOfToday && e.state !== 2);
                    })
                    .sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

                const allFiltered = [...upcoming, ...past];

                if (allFiltered.length > 0) {
                    const { data: dbEvents } = await supabase
                        .from('calendar')
                        .select('id, slug, rankedin_url, city, venue, registered_players, organizer_name, sapa_status, image_url, entry_fee, category_fees');

                    // Fetch user's paid registrations
                    const { data: paidRegs } = await supabase
                        .from('event_registrations')
                        .select('event_id')
                        .or(`email.ilike.${player.email},email.is.null`) // This is a bit loose, better to check by profile_id if we have it
                        .eq('payment_status', 'paid');

                    const { data: paidParticipants } = await supabase
                        .from('tournament_participants')
                        .select('event_id')
                        .or(`email.ilike.${player.email},profile_id.eq.${player.id}`)
                        .eq('is_paid', true);

                    const { data: directPayments } = await supabase
                        .from('payments')
                        .select('event_id')
                        .eq('player_id', player.id)
                        .eq('status', 'success')
                        .eq('payment_type', 'event_entry_fee');

                    const paidEventIds = new Set([
                        ...(paidRegs || []).map(r => r.event_id),
                        ...(paidParticipants || []).map(p => p.event_id),
                        ...(directPayments || []).map(p => p.event_id)
                    ]);

                    if (dbEvents) {
                        allFiltered.forEach(e => {
                            const match = dbEvents.find(dbE => dbE.rankedin_url && dbE.rankedin_url.includes(`/tournament/${e.id}/`));
                            if (match) {
                                e.db_id = match.id;
                                e.slug = match.slug;
                                e.city = match.city;
                                e.venue = match.venue;
                                e.registered_players = match.registered_players;
                                e.organizer_name = match.organizer_name;
                                e.sapa_status = match.sapa_status;
                                e.entry_fee = match.entry_fee;
                                e.category_fees = match.category_fees;
                                e.isPaid = paidEventIds.has(match.id);
                            }
                        });
                    }
                }

                setUpcomingEvents(upcoming);
                setPastEvents(past);
            };
            fetchEvents();
        }
    }, [player?.rankedin_id, player?.email, getPlayerEventsAsync]);

    useEffect(() => {
        if (player?.rankedin_id && matchHistory.upcoming.length === 0 && matchHistory.history.length === 0) {
            const fetchMatches = async () => {
                setLoadingMatches(true);
                try {
                    // Helper to parse "DD/MM/YYYY HH:MM" date format
                    const parseDate = (dateStr) => {
                        if (!dateStr) return new Date(0);
                        // Handle ISO format (2026-03-13T10:00:00)
                        if (dateStr.includes('T') || dateStr.includes('-')) {
                            return new Date(dateStr);
                        }
                        // Handle Rankedin custom format (DD/MM/YYYY HH:MM)
                        const [datePart, timePart] = dateStr.split(' ');
                        const [day, month, year] = datePart.split('/');
                        return new Date(`${year}-${month}-${day}T${timePart || '00:00'}:00`);
                    };

                    const [upcoming, history] = await Promise.all([
                        getPlayerMatches(player.rankedin_id, false),
                        getPlayerMatches(player.rankedin_id, true)
                    ]);

                    const filterValid = (matches) => {
                        return (matches || []).filter(m => m.Info?.EventName && m.Info.EventName !== 'EventName');
                    };

                    const validUpcoming = filterValid(upcoming);
                    const validHistory = filterValid(history);

                    const sorter = (a, b) => {
                        const dateA = parseDate(a.Info?.Date);
                        const dateB = parseDate(b.Info?.Date);
                        return dateB - dateA;
                    };

                    validUpcoming.sort(sorter);
                    validHistory.sort(sorter);

                    setMatchHistory({ upcoming: validUpcoming, history: validHistory });
                } catch (err) {
                    console.error("Match fetch error:", err);
                } finally {
                    setLoadingMatches(false);
                }
            };
            fetchMatches();
        }
    }, [player?.rankedin_id, getPlayerMatches, matchHistory.upcoming.length, matchHistory.history.length]);

    const handleInitiatePasswordReset = async () => {
        if (!player?.email) return;
        setLoadingReset(true);
        const { error } = await supabase.auth.resetPasswordForEmail(player.email, {
            redirectTo: window.location.origin + '/reset-password',
        });
        if (error) {
            showMessage(error.message, 'error');
        } else {
            showMessage('Password reset email sent! Please check your inbox.', 'success');
        }
        setLoadingReset(false);
    };

    const refetchPlayer = async () => {
        const { data: { session } } = await supabase.auth.getSession();

        // Use impersonated email if available
        const testEmail = sessionStorage.getItem('admin_test_login_email');
        const emailToFetch = testEmail || session?.user?.email;

        if (!emailToFetch) return;
        const { data } = await supabase.from('players').select('*').ilike('email', emailToFetch).maybeSingle();
        if (data) setPlayer(data);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!player) return;
        setSaving(true);
        setMessage(null);

        // Check if email is being changed
        const emailChanged = !isImpersonating && formData.email !== player.email;

        // Parse sponsors back to JSON array before saving
        let sponsorsArray = [];
        if (formData.sponsors && formData.sponsors.trim() !== '') {
            sponsorsArray = formData.sponsors.split(',').map(s => s.trim()).filter(Boolean);
        }
        const sponsorsJson = JSON.stringify(sponsorsArray);

        const updates = {
            name: formData.name,
            email: formData.email,
            contact_number: formData.contact_number,
            nationality: formData.nationality,
            gender: formData.gender,
            bio: formData.bio,
            home_club: formData.club_id === 'Other' ? formData.custom_club : formData.home_club,
            club_id: formData.club_id === 'Other' ? null : (formData.club_id || null),
            sponsors: sponsorsJson,
            image_url: formData.image_url,
            category: formData.category,
            id_number: formData.id_number,
            age: formData.age === '' || formData.age === null ? null : parseInt(formData.age),
            instagram_link: formData.instagram_link,
            region: formData.region,
            racket_brand: formData.racket_brand,
            additional_images: JSON.stringify(formData.additional_images || [])
        };

        try {
            // Update the players table
            const { error: dbError } = await supabase
                .from('players')
                .update(updates)
                .eq('id', player.id);

            if (dbError) throw dbError;

            // If email changed, update it in Supabase Auth as well
            if (emailChanged) {
                const { error: authError } = await supabase.auth.updateUser({ email: formData.email });
                if (authError) {
                    showMessage(`Profile updated, but email change failed: ${authError.message}`, 'error');
                } else {
                    showMessage('Profile updated! Please check your new email for confirmation.', 'success');
                }
            } else {
                showMessage('Profile updated successfully!', 'success');
            }

            setIsEditing(false);
            setIsEditProfileModalOpen(false);
            setIsMobileEditingProfile(false);
            await refetchPlayer();
        } catch (error) {
            console.error("Save profile error:", error);
            if (error.code === '42703') {
                showMessage('Database update required! Please run the SQL migration (add_additional_images_column.sql) in your Supabase SQL editor to support multiple photos.', 'error');
            } else {
                showMessage(error.message, 'error');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleSelectRanking = async (ranking) => {
        if (!player) return;
        setSaving(true);
        try {
            // Store the identifier for the preferred ranking
            // Format: Org|AgeGroup|MatchType
            const rankingId = `${ranking.org}|${ranking.age_group}|${ranking.match_type}`;
            const rankingLabel = `${ranking.org} - ${ranking.age_group || 'Open'}`;

            const { error } = await supabase
                .from('players')
                .update({
                    preferred_ranking: rankingId,
                    rank_label: ranking.rank.toString(),
                    active_ranking_label: rankingLabel,
                    points: parseInt(ranking.points) || 0
                })
                .eq('id', player.id);

            if (error) throw error;

            // Optimistically update local state so header reflects change immediately
            setPlayer(prev => ({
                ...prev,
                preferred_ranking: rankingId,
                rank_label: ranking.rank.toString(),
                active_ranking_label: rankingLabel,
                points: parseInt(ranking.points) || 0
            }));

            showMessage(`Primary ranking updated to ${rankingLabel}`, 'success');
            await refetchPlayer();
        } catch (error) {
            console.error("Failed to update ranking:", error);
            // If the column doesn't exist yet, we still update the labels but won't persist the preference
            if (error.code === '42703') { // undefined_column
                const { error: retryError } = await supabase
                    .from('players')
                    .update({
                        rank_label: ranking.rank.toString(),
                        points: parseInt(ranking.points) || 0
                    })
                    .eq('id', player.id);
                if (retryError) throw retryError;

                setPlayer(prev => ({
                    ...prev,
                    rank_label: ranking.rank.toString(),
                    points: parseInt(ranking.points) || 0
                }));

                showMessage(`Primary ranking updated temporarily.`, 'success');
                await refetchPlayer();
            } else {
                showMessage(error.message, 'error');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleImageUpload = async (event) => {
        try {
            setUploadingImage(true);
            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('You must select an image to upload.');
            }
            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `${player.id}/${fileName}`;

            // Upload to Supabase Storage bucket 'profile-pics'
            let { error: uploadError } = await supabase.storage
                .from('profile-pics')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) {
                console.error("Upload error:", uploadError);
                throw uploadError;
            }

            // Get Public URL
            const { data: publicUrlData } = supabase.storage
                .from('profile-pics')
                .getPublicUrl(filePath);

            if (publicUrlData) {
                console.log("Generated Public URL:", publicUrlData.publicUrl);
                setFormData({ ...formData, image_url: publicUrlData.publicUrl });
                showMessage('Image uploaded successfully! Remember to Save Changes.', 'success');
            }

        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setUploadingImage(false);
        }
    };

    const handleGalleryImageUpload = async (event) => {
        try {
            setUploadingGalleryImage(true);
            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('You must select at least one image to upload.');
            }

            const files = Array.from(event.target.files);
            const currentGallery = formData.additional_images || [];
            const remainingSlots = 5 - currentGallery.length;

            if (remainingSlots <= 0) {
                throw new Error('You can only have up to 5 gallery images.');
            }

            // Take only what fits
            const filesToUpload = files.slice(0, remainingSlots);

            const uploadPromises = filesToUpload.map(async (file, index) => {
                const fileExt = file.name.split('.').pop();
                // Add index and timestamp to ensure unique filename for each uploaded file
                const fileName = `gallery_${Date.now()}_${index}.${fileExt}`;
                const filePath = `${player.id}/${fileName}`;

                // Upload to Supabase Storage bucket 'profile-pics'
                const { error: uploadError } = await supabase.storage
                    .from('profile-pics')
                    .upload(filePath, file, { cacheControl: '3600', upsert: true });

                if (uploadError) throw uploadError;

                // Get Public URL
                const { data: publicUrlData } = supabase.storage
                    .from('profile-pics')
                    .getPublicUrl(filePath);

                if (!publicUrlData) throw new Error('Failed to get public URL');
                return publicUrlData.publicUrl;
            });

            const urls = await Promise.all(uploadPromises);
            const newGallery = [...currentGallery, ...urls].slice(0, 5);

            setFormData(prev => ({
                ...prev,
                additional_images: newGallery
            }));

            // Auto-save to Supabase
            const { error: dbError } = await supabase
                .from('players')
                .update({ additional_images: JSON.stringify(newGallery) })
                .eq('id', player.id);

            if (dbError) throw dbError;

            // Sync main player state to instantly reflect on dashboard
            setPlayer(prev => ({ ...prev, additional_images: newGallery }));

            if (files.length > remainingSlots) {
                showMessage(`Uploaded ${urls.length} images. Some images were ignored because the gallery is limited to 5 images.`, 'success');
            } else {
                showMessage(`Uploaded ${urls.length} gallery image(s) successfully!`, 'success');
            }

        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setUploadingGalleryImage(false);
        }
    };

    const handleDeleteGalleryImage = async (index) => {
        try {
            const currentGallery = formData.additional_images || [];
            const updated = currentGallery.filter((_, i) => i !== index);

            setFormData(prev => ({
                ...prev,
                additional_images: updated
            }));

            // Auto-save to Supabase
            const { error: dbError } = await supabase
                .from('players')
                .update({ additional_images: JSON.stringify(updated) })
                .eq('id', player.id);

            if (dbError) throw dbError;

            // Sync main player state
            setPlayer(prev => ({ ...prev, additional_images: updated }));
            showMessage('Gallery photo removed successfully!', 'success');
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center pt-24">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-padel-green"></div>
            </div>
        );
    }

    if (hasSession === false) {
        return null;
    }

    // Dynamic Performance Statistics Calculations from RankedIn matches history
    const completedMatches = matchHistory.history || [];
    const totalPlayedMatches = completedMatches.length;
    let winsCount = 0;
    completedMatches.forEach((match) => {
        const info = match.Info || {};
        const isWinner = info.IsWinner !== undefined
            ? info.IsWinner
            : info.Challenger?.IsWinner;
        if (isWinner) {
            winsCount++;
        }
    });
    const lossesCount = totalPlayedMatches - winsCount;
    const winRatio = totalPlayedMatches > 0 ? ((winsCount / totalPlayedMatches) * 100).toFixed(1) : "0.0";
    
    // Extract the Last 5 Matches (chronological: index 4 to index 0)
    const recentCompleted = completedMatches.slice(0, 5).reverse();
    const lastFiveForm = recentCompleted.map((match) => {
        const info = match.Info || {};
        const isWinner = info.IsWinner !== undefined
            ? info.IsWinner
            : info.Challenger?.IsWinner;
        return isWinner ? 'W' : 'L';
    });

    if (!player) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center pt-24 text-white">
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-2">No Profile Found</h2>
                    <p className="text-gray-400">We couldn't link your account to a player profile.</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-black text-white selection:bg-padel-green selection:text-black">

                {/* Password Setup Modal (for new invites or recovery) */}
                <AnimatePresence>
                    {isActivationRequired && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="w-full max-w-lg bg-[#0F172A] border border-white/10 p-8 md:p-12 rounded-[2.5rem] shadow-2xl relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-64 h-64 bg-padel-green/5 rounded-full blur-[80px] -mr-32 -mt-32" />

                                <div className="relative z-10 text-center">
                                    <div className="w-20 h-20 bg-padel-green/10 rounded-2xl flex items-center justify-center mx-auto mb-8">
                                        <ShieldCheck className="text-padel-green w-10 h-10" />
                                    </div>

                                    <h3 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter">Secure Your Account</h3>
                                    <p className="text-gray-400 mb-10 font-medium text-lg">Please set a permanent password to complete your profile setup and secure your tournament data.</p>

                                    <form onSubmit={handleUpdatePassword} className="space-y-6">
                                        <div className="relative">
                                            <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-padel-green/75" size={20} />
                                            <input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                placeholder="Enter at least 6 characters"
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl pl-16 pr-6 py-5 text-white focus:border-padel-green outline-none transition-all text-lg font-bold"
                                                required
                                            />
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={isUpdatingPassword}
                                            className="w-full bg-padel-green text-black py-5 rounded-2xl font-black uppercase tracking-widest text-lg hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-padel-green/20 disabled:opacity-50"
                                        >
                                            {isUpdatingPassword ? 'Saving Password...' : 'Initialize Account'}
                                        </button>

                                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest pt-4">
                                            This is a one-time requirement for invited players.
                                        </p>
                                    </form>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* MOBILE VIEW (lg:hidden) */}
                <div className="block lg:hidden">
                    {/* The "Neon Court Arena" Curved Header Banner */}
                    <div className="relative w-full h-[90px] bg-[#090D1A] rounded-b-[40px] overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.85),0_0_35px_rgba(204,255,0,0.03)] border-b border-white/5 flex flex-col justify-between">
                        
                        {/* Thematic Brand Glow Blobs with Random Fluid Floating Animations */}
                        <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-padel-green/20 blur-[50px] animate-blob-1 pointer-events-none" />
                        <div className="absolute -bottom-24 -right-12 w-56 h-56 rounded-full bg-blue-500/15 blur-[60px] animate-blob-2 pointer-events-none" />
                        <div className="absolute top-6 left-1/3 w-40 h-40 rounded-full bg-purple-500/12 blur-[55px] animate-blob-3 pointer-events-none" />

                        {/* Vector Tactical Padel Court Outline Overlay */}
                        <svg className="absolute inset-0 w-full h-full opacity-[0.05] text-white pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                            {/* Outer Boundary */}
                            <rect x="5" y="10" width="90" height="80" rx="8" fill="none" stroke="currentColor" strokeWidth="0.8" />
                            {/* Net Line (Center Vertical) */}
                            <line x1="50" y1="10" x2="50" y2="90" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3,3" />
                            {/* Service Lines (Horizontal boundaries) */}
                            <line x1="25" y1="10" x2="25" y2="90" stroke="currentColor" strokeWidth="0.8" />
                            <line x1="75" y1="10" x2="75" y2="90" stroke="currentColor" strokeWidth="0.8" />
                            {/* Center Service Line (Horizontal divider) */}
                            <line x1="25" y1="50" x2="75" y2="50" stroke="currentColor" strokeWidth="0.8" />
                        </svg>

                        {/* Radial Glow Overlay */}
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-padel-green/5 via-transparent to-transparent pointer-events-none" />
                    </div>

                    {/* Avatar & Player Info card overlap - shifted up to where the title used to be */}
                    <div className="px-5 -mt-14 relative z-20 space-y-4 pb-6">
                        <div className="bg-[#0F172A]/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 shadow-2xl flex items-start gap-4">
                            {/* Avatar Column */}
                            <div className="relative group shrink-0">
                                <div
                                    onClick={() => document.getElementById('imageUploadMobile').click()}
                                    className="w-22 h-22 rounded-full bg-slate-900 border-4 border-slate-950 shadow-xl overflow-hidden cursor-pointer relative transition-transform duration-300 hover:scale-105"
                                >
                                    {formData.image_url ? (
                                        <img src={formData.image_url} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950 text-white/20 text-xl font-bold">
                                            {player.name ? player.name.charAt(0) : 'P'}
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                                        <Edit3 size={12} className="text-padel-green" />
                                    </div>
                                    {uploadingImage && (
                                        <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-full">
                                            <div className="w-5 h-5 border-2 border-padel-green border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    id="imageUploadMobile"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    disabled={uploadingImage}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => setIsEditProfileModalOpen(true)}
                                    className="absolute bottom-0 right-0 bg-[#CCFF00] hover:bg-white text-black p-1.5 rounded-full border border-black shadow-lg cursor-pointer flex items-center justify-center z-10 transition-colors"
                                >
                                    <Edit3 size={10} />
                                </button>
                            </div>

                            {/* Player Info Details */}
                            <div className="flex-1 min-w-0 pt-1 space-y-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {player.license_type && (
                                        <span className={`border rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 ${player.license_type === 'full'
                                            ? 'bg-padel-green/10 border-padel-green/30 text-padel-green'
                                            : player.license_type === 'temporary'
                                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                                : 'bg-white/5 border-white/10 text-gray-400'
                                            }`}>
                                            {player.license_type === 'full' && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-padel-green animate-pulse"></span>
                                            )}
                                            {player.license_type === 'full' ? 'Full License Player' : (player.license_type === 'temporary' ? 'Temporary License Player' : 'No License')}
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-base font-extrabold text-white leading-tight uppercase flex items-center gap-1">
                                    {player.name}
                                </h3>

                                {/* Followers & Matches Stats row */}
                                <div className="flex items-center gap-4 text-xs font-bold text-gray-400 py-1">
                                    <div className="flex flex-col">
                                        <span className="text-yellow-500 font-extrabold">
                                            {player.rank_label && player.rank_label !== 'Unranked' ? `#${player.rank_label}` : '#22'}
                                        </span>
                                        <span className="text-[7.5px] uppercase tracking-widest text-gray-500 font-black">Rank</span>
                                    </div>
                                    <div className="border-l border-white/10 h-6 shrink-0" />
                                    <div className="flex flex-col">
                                        <span className="text-padel-green font-extrabold">
                                            {player.points !== undefined && player.points !== null ? player.points : '1268'}
                                        </span>
                                        <span className="text-[7.5px] uppercase tracking-widest text-gray-500 font-black">Points</span>
                                    </div>
                                    <div className="border-l border-white/10 h-6 shrink-0" />
                                    <div className="flex flex-col">
                                        <span className="text-white font-extrabold">
                                            {loadingMatches && totalPlayedMatches === 0 && matchHistory.upcoming.length === 0
                                                ? '—'
                                                : matchHistory.history.length + matchHistory.upcoming.length}
                                        </span>
                                        <span className="text-[7.5px] uppercase tracking-widest text-gray-500 font-black">Matches</span>
                                    </div>
                                </div>

                                {/* Message & Follow buttons row hidden because functionality is not yet available */}
                            </div>
                        </div>

                        {/* Mobile License Purchase / Upgrade CTA */}
                        {player && player.license_type !== 'full' && (
                            <div className={`bg-[#0F172A]/70 backdrop-blur-2xl border rounded-3xl p-4 shadow-2xl relative overflow-hidden ${
                                player.license_type === 'temporary'
                                    ? 'border-blue-500/30 border-l-2 border-l-blue-500'
                                    : 'border-white/10 border-l-2 border-l-gray-500'
                            }`}>
                                {/* Ambient glow */}
                                <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] pointer-events-none ${
                                    player.license_type === 'temporary' ? 'bg-blue-500/8' : 'bg-white/5'
                                }`} />

                                <div className="relative z-10 space-y-3">
                                    {/* Status Badge + Description */}
                                    <div className="flex items-start gap-2.5">
                                        <span className={`shrink-0 text-[7px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-lg ${
                                            player.license_type === 'temporary'
                                                ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                                                : 'bg-white/5 border border-white/10 text-gray-400'
                                        }`}>
                                            {player.license_type === 'temporary' ? 'Temp License Active' : 'License Inactive'}
                                        </span>
                                    </div>

                                    {/* Description text or event info */}
                                    {player.license_type === 'temporary' ? (
                                        tempLicenseDetails && (
                                            <div className="text-white font-bold bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-[10px] uppercase tracking-wide w-fit">
                                                🏆 {tempLicenseDetails.event_name}
                                                <span className="text-[9px] text-gray-500 font-medium border-l border-white/10 pl-1.5 flex items-center gap-1">
                                                    <CalendarIcon size={9} className="text-gray-400" />
                                                    {new Date(tempLicenseDetails.event_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                            </div>
                                        )
                                    ) : (
                                        <p className="text-[10px] text-gray-400 leading-relaxed">
                                            Activate your elite license to appear on public rankings &amp; track tour statistics.
                                        </p>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2 pt-0.5">
                                        {player.license_type === 'temporary' ? (
                                            <button
                                                onClick={() => setShowPaymentModal(true)}
                                                className="flex-1 text-[9px] font-black uppercase tracking-widest px-3 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all cursor-pointer shadow-md shadow-blue-500/10 active:scale-[0.97] flex items-center justify-center gap-1.5"
                                            >
                                                <ShieldCheck size={12} />
                                                Upgrade to Full License
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => setShowPaymentModal(true)}
                                                    className="flex-1 text-[9px] font-black uppercase tracking-widest px-3 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-all cursor-pointer active:scale-[0.97]"
                                                >
                                                    Buy Temp License
                                                </button>
                                                <button
                                                    onClick={() => setShowPaymentModal(true)}
                                                    className="flex-1 text-[9px] font-black uppercase tracking-widest px-3 py-2.5 bg-[#CCFF00] hover:bg-[#CCFF00]/90 text-black rounded-xl transition-all cursor-pointer shadow-md shadow-[#CCFF00]/10 active:scale-[0.97] flex items-center justify-center gap-1.5"
                                                >
                                                    <ShieldCheck size={12} />
                                                    Pay Now - Full License
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Performance Statistics Card */}
                        <div className="bg-[#0F172A]/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4">
                            <div className="grid grid-cols-4 gap-2 text-center">
                                <div className="flex flex-col p-1.5 bg-white/[0.02] border border-white/5 rounded-xl">
                                    <span className="text-[7px] font-black text-gray-500 uppercase tracking-widest">Total Match</span>
                                    <span className="text-base font-black text-white mt-1">{totalPlayedMatches}</span>
                                </div>
                                <div className="flex flex-col p-1.5 bg-white/[0.02] border border-white/5 rounded-xl">
                                    <span className="text-[7px] font-black text-padel-green uppercase tracking-widest">Won</span>
                                    <span className="text-base font-black text-white mt-1">{winsCount}</span>
                                </div>
                                <div className="flex flex-col p-1.5 bg-white/[0.02] border border-white/5 rounded-xl">
                                    <span className="text-[7px] font-black text-red-400 uppercase tracking-widest">Lost</span>
                                    <span className="text-base font-black text-white mt-1">{lossesCount}</span>
                                </div>
                                <div className="flex flex-col p-1.5 bg-white/[0.02] border border-white/5 rounded-xl justify-center items-center">
                                    <span className="text-[7px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Last 5</span>
                                    <div className="flex gap-0.5 items-center justify-center">
                                        {lastFiveForm.length > 0 ? (
                                            lastFiveForm.map((f, i) => (
                                                <span
                                                    key={i}
                                                    className={`w-2.5 h-2.5 rounded-full flex items-center justify-center text-[5.5px] font-black ${f === 'W' ? 'bg-[#CCFF00] text-black shadow-[0_0_8px_rgba(204,255,0,0.5)]' : 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                                                        }`}
                                                    title={f === 'W' ? 'Win' : 'Loss'}
                                                >
                                                    ●
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest leading-none">None</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Win Ratio Timeline Progress Bar */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-gray-400">
                                    <span>Win Ratio</span>
                                    <span className="text-padel-green font-extrabold">{winRatio}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full relative overflow-visible mt-1">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-600 to-[#CCFF00] rounded-full shadow-[0_0_10px_rgba(204,255,0,0.4)]"
                                        style={{ width: `${winRatio}%` }}
                                    />
                                    {/* Small Padel Ball Icon at end of bar */}
                                    <div
                                        className="w-3.5 h-3.5 bg-[#CCFF00] rounded-full border border-black shadow-[0_2px_8px_rgba(0,0,0,0.5)] absolute -top-1 flex items-center justify-center"
                                        style={{ left: `calc(${winRatio}% - 7px)` }}
                                    >
                                        <span className="w-1.5 h-1.5 bg-black rounded-full" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Mobile Horizontally Scrollable Tabs */}
                        <div className="flex gap-1.5 bg-[#0F172A]/70 backdrop-blur-2xl border border-white/10 p-1 rounded-2xl overflow-x-auto no-scrollbar scrollbar-none">
                            {[
                                { id: 'events', label: 'My Events' },
                                { id: 'matches', label: 'My Matches' },
                                { id: 'rankings', label: 'My Rankings' },
                                { id: 'payments', label: 'Payments' },
                                { id: 'profile', label: 'My Profile' },
                            ].map((tab) => {
                                const isSelected = activeTab === tab.id;
                                let activeStyles = '';
                                let inactiveStyles = '';

                                if (tab.id === 'events') {
                                    activeStyles = 'bg-purple-500 border border-purple-500 text-white shadow-lg shadow-purple-500/20';
                                    inactiveStyles = 'text-white/70 border border-transparent hover:text-white hover:bg-purple-500/10';
                                } else if (tab.id === 'matches') {
                                    activeStyles = 'bg-orange-500 border border-orange-500 text-white shadow-lg shadow-orange-500/20';
                                    inactiveStyles = 'text-white/70 border border-transparent hover:text-white hover:bg-orange-500/10';
                                } else if (tab.id === 'rankings') {
                                    activeStyles = 'bg-yellow-500 border border-yellow-500 text-black shadow-lg shadow-yellow-500/20';
                                    inactiveStyles = 'text-white/70 border border-transparent hover:text-white hover:bg-yellow-500/10';
                                } else if (tab.id === 'payments') {
                                    activeStyles = 'bg-blue-500 border border-blue-500 text-white shadow-lg shadow-blue-500/20';
                                    inactiveStyles = 'text-white/70 border border-transparent hover:text-white hover:bg-blue-500/10';
                                } else {
                                    activeStyles = 'bg-padel-green border border-padel-green text-black shadow-lg shadow-padel-green/20';
                                    inactiveStyles = 'text-white/70 border border-transparent hover:text-white hover:bg-padel-green/10';
                                }

                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex-1 min-w-[90px] whitespace-nowrap text-center py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isSelected
                                            ? activeStyles + ' font-extrabold'
                                            : inactiveStyles
                                            }`}
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Mobile Tab Contents Grid rendering directly underneath */}
                        <div className={`p-4 rounded-3xl bg-[#0F172A]/40 backdrop-blur-2xl border transition-all duration-500 space-y-4 ${
                            activeTab === 'events' ? 'border-purple-500/35 shadow-[0_0_20px_rgba(168,85,247,0.12)]' :
                            activeTab === 'matches' ? 'border-orange-500/35 shadow-[0_0_20px_rgba(249,115,22,0.12)]' :
                            activeTab === 'rankings' ? 'border-yellow-500/35 shadow-[0_0_20px_rgba(234,179,8,0.12)]' :
                            activeTab === 'payments' ? 'border-blue-500/35 shadow-[0_0_20px_rgba(59,130,246,0.12)]' :
                            'border-padel-green/35 shadow-[0_0_20px_rgba(204,255,0,0.12)]'
                        }`}>
                            {/* Events Tab Content */}
                            {activeTab === 'events' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">My Tournaments</h4>
                                    </div>

                                    {/* Secondary view tabs inside Tournaments */}
                                    <div className="flex gap-1 bg-white/[0.03] border border-white/10 p-1 rounded-xl w-fit">
                                        <button
                                            onClick={() => setEventViewTab('upcoming')}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${currentTab === 'upcoming'
                                                ? 'bg-purple-500 text-white shadow-md'
                                                : 'text-white/70 hover:text-white'
                                                }`}
                                        >
                                            Upcoming ({upcomingEvents.length})
                                        </button>
                                        <button
                                            onClick={() => setEventViewTab('past')}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${currentTab === 'past'
                                                ? 'bg-purple-500 text-white shadow-md'
                                                : 'text-white/70 hover:text-white'
                                                }`}
                                        >
                                            Complete ({pastEvents.length})
                                        </button>
                                    </div>

                                    {filteredEvents.length > 0 ? (
                                        <div className="space-y-3">
                                            {filteredEvents.map((event, idx) => {
                                                let badgeColor = 'bg-purple-500/10 border border-purple-500/20 text-purple-400';
                                                const status = event.sapa_status || 'None';
                                                const statusLower = status.toLowerCase();

                                                if (statusLower === 'major') {
                                                    badgeColor = 'bg-red-500/10 border border-red-500/20 text-red-400';
                                                } else if (statusLower === 'super gold' || statusLower === 's gold') {
                                                    badgeColor = 'bg-amber-500/10 border border-amber-500/20 text-amber-400';
                                                } else if (statusLower === 'gold') {
                                                    badgeColor = 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400';
                                                } else if (statusLower === 'silver') {
                                                    badgeColor = 'bg-gray-500/10 border border-gray-500/20 text-gray-300';
                                                } else if (statusLower === 'bronze') {
                                                    badgeColor = 'bg-orange-700/10 border border-orange-700/20 text-orange-400';
                                                } else if (statusLower === 'fip event') {
                                                    badgeColor = 'bg-blue-500/10 border border-blue-500/20 text-blue-400';
                                                } else if (statusLower === 'none' || statusLower === 'unassigned') {
                                                    badgeColor = 'bg-white/5 border border-white/10 text-gray-400';
                                                }

                                                return (
                                                    <div key={idx} className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-lg backdrop-blur-xl relative overflow-hidden group">
                                                        <div className="min-w-0 space-y-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`text-[7.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeColor}`}>
                                                                    {status}
                                                                </span>
                                                                {event.isPaid && (
                                                                    <span className="text-[7.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-padel-green/10 border border-padel-green/20 text-padel-green">
                                                                        Paid
                                                                    </span>
                                                                )}
                                                            </div>
                                                        <h5 className="font-extrabold text-xs text-white uppercase tracking-tight truncate leading-tight group-hover:text-padel-green transition-colors">{event.name}</h5>
                                                        <div className="flex items-center gap-1 text-[8px] text-gray-500 font-bold uppercase tracking-wider">
                                                            <MapPin size={9} className="text-gray-600" />
                                                            <span>{event.venue || 'Club Arena'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0 flex items-center gap-3">
                                                        <div>
                                                            <span className="text-[9px] font-black text-padel-green uppercase tracking-widest block leading-none">
                                                                {new Date(event.start_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                                            </span>
                                                            <span className="text-[8px] text-gray-500 font-bold mt-1 block">R {event.entry_fee || '450'}</span>
                                                        </div>
                                                        <a
                                                            href={event.slug ? `/calendar/${event.slug}` : '#'}
                                                            className="p-2 bg-white/5 border border-white/10 text-white rounded-lg hover:bg-white/10 hover:text-padel-green active:scale-90 transition-all flex items-center justify-center shrink-0"
                                                        >
                                                            <ExternalLink size={10} />
                                                        </a>
                                                    </div>
                                                </div>
                                            ); })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-xs text-gray-500 font-black uppercase bg-slate-900/30 border border-white/5 rounded-2xl relative overflow-hidden">
                                            <CalendarIcon className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                            {currentTab === 'upcoming' ? 'No upcoming tournaments listed' : 'No past tournaments listed'}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Matches Tab Content */}
                            {activeTab === 'matches' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">My Match Log</h4>
                                    </div>

                                    {/* Secondary view tabs inside Matches */}
                                    <div className="flex gap-1 bg-white/[0.03] border border-white/10 p-1 rounded-xl w-fit">
                                        <button
                                            onClick={() => { setMatchViewTab('upcoming'); setCurrentMatchPage(1); }}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${matchViewTab === 'upcoming'
                                                ? 'bg-orange-500 text-white shadow-md'
                                                : 'text-white/70 hover:text-white'
                                                }`}
                                        >
                                            Upcoming ({matchHistory.upcoming.length})
                                        </button>
                                        <button
                                            onClick={() => { setMatchViewTab('past'); setCurrentMatchPage(1); }}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${matchViewTab === 'past'
                                                ? 'bg-orange-500 text-white shadow-md'
                                                : 'text-white/70 hover:text-white'
                                                }`}
                                        >
                                            Past ({matchHistory.history.length})
                                        </button>
                                    </div>

                                    {loadingMatches ? (
                                        <div className="flex items-center justify-center py-12">
                                            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : (matchViewTab === 'upcoming' ? matchHistory.upcoming : currentMatchesHistoryList).length > 0 ? (
                                        <div className="space-y-3">
                                            {(matchViewTab === 'upcoming' ? currentMatchesUpcomingList : currentMatchesHistoryList).map((match, idx) => {
                                                const info = match.Info || {};
                                                const date = info.Date;
                                                const isWinner = info.IsWinner !== undefined ? info.IsWinner : info.Challenger?.IsWinner;
                                                const hasResult = match.Score?.Score && match.Score.Score.length > 0;

                                                return (
                                                    <div key={idx} className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-3.5 shadow-lg backdrop-blur-xl group">
                                                        {/* Header Details */}
                                                        <div className="flex flex-wrap items-center gap-2 text-[7.5px] font-black uppercase tracking-widest border-b border-white/5 pb-2.5">
                                                            {date && (
                                                                <>
                                                                    <span className="text-gray-500 shrink-0 font-bold">{date}</span>
                                                                    <span className="text-white/30">•</span>
                                                                </>
                                                            )}
                                                            <span className="text-amber-500 min-w-0 break-words">{info.EventName || 'Tour Match'}</span>
                                                        </div>

                                                        {/* Teams Grid */}
                                                        <div className="flex justify-between items-center gap-4">
                                                            <div className="flex-1 min-w-0 space-y-2">
                                                                {/* Team 1 */}
                                                                <div className={`p-2.5 rounded-xl border flex items-start justify-between gap-2 ${hasResult && isWinner ? 'bg-padel-green/[0.05] border-padel-green/30' : 'bg-white/[0.02] border-white/5'
                                                                    }`}>
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-[7px] font-black text-gray-500 uppercase tracking-widest mb-1">Team 1</p>
                                                                        <p className="text-xs font-bold text-white break-words leading-snug">
                                                                            {info.Challenger?.Name || 'TBD'}
                                                                            {info.Challenger1?.Name && ` & ${info.Challenger1.Name}`}
                                                                        </p>
                                                                    </div>
                                                                    {hasResult && isWinner && (
                                                                        <Trophy size={11} className="text-padel-green shrink-0 animate-pulse mt-3" />
                                                                    )}
                                                                </div>

                                                                {/* Team 2 */}
                                                                <div className={`p-2.5 rounded-xl border flex items-start justify-between gap-2 ${hasResult && !isWinner ? 'bg-padel-green/[0.05] border-padel-green/30' : 'bg-white/[0.02] border-white/5'
                                                                    }`}>
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-[7px] font-black text-gray-500 uppercase tracking-widest mb-1">Team 2</p>
                                                                        <p className="text-xs font-bold text-gray-300 break-words leading-snug">
                                                                            {info.Challenged?.Name || 'TBD'}
                                                                            {info.Challenged1?.Name && ` & ${info.Challenged1.Name}`}
                                                                        </p>
                                                                    </div>
                                                                    {hasResult && !isWinner && (
                                                                        <Trophy size={11} className="text-padel-green shrink-0 animate-pulse mt-3" />
                                                                    )}
                                                                </div>

                                                                {(info.Court || info.Location || info.Venue) && (
                                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[9px] font-bold text-gray-400 pt-0.5">
                                                                        {(info.Location || info.Venue) && (
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <MapPin size={10} className="text-padel-green shrink-0" />
                                                                                <span className="break-words uppercase tracking-wider">{info.Location || info.Venue || 'Location TBD'}</span>
                                                                            </div>
                                                                        )}
                                                                        {info.Court && (
                                                                            <span className="text-[8px] font-black uppercase tracking-widest text-orange-500 bg-orange-500/10 border border-orange-500/25 px-2 py-0.5 rounded-lg shrink-0">
                                                                                {info.Court}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Right Side Column: Scores & Badge */}
                                                            <div className="shrink-0 flex flex-col items-end justify-center min-w-[70px] border-l border-white/5 pl-4 gap-2">
                                                                {hasResult ? (
                                                                    <>
                                                                        {/* Set Scores */}
                                                                        <div className="flex items-center gap-1.5">
                                                                            {match.Score?.Score?.map((set, sIdx) => (
                                                                                <div key={sIdx} className="bg-white/[0.04] backdrop-blur-md px-1.5 py-1 rounded-lg text-[9px] font-black text-white border border-white/5 flex flex-col items-center min-w-[20px] leading-tight">
                                                                                    <span className={set.Score1 > set.Score2 ? 'text-padel-green' : 'text-white/60'}>{set.Score1}</span>
                                                                                    <div className="w-full h-[0.5px] bg-white/10 my-0.5" />
                                                                                    <span className={set.Score2 > set.Score1 ? 'text-padel-green' : 'text-white/60'}>{set.Score2}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>

                                                                        {/* Status Badge */}
                                                                        <span className={`px-2.5 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-widest shadow-md ${isWinner
                                                                            ? 'bg-padel-green text-black'
                                                                            : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                                                            }`}>
                                                                            {isWinner ? 'Victory' : 'Defeat'}
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-orange-500/10 text-orange-500 border border-orange-500/25">
                                                                        Upcoming
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {(() => {
                                                const isUpcoming = matchViewTab === 'upcoming';
                                                const totalItems = isUpcoming ? matchHistory.upcoming.length : matchHistory.history.length;
                                                const totalPages = isUpcoming ? totalUpcomingMatchPages : totalMatchPages;
                                                if (totalItems <= matchesPerPage) return null;
                                                return (
                                                    <div className="flex justify-between items-center mt-6 px-1">
                                                        <span className="text-gray-500 text-[9px] font-black uppercase tracking-widest">
                                                            Page {currentMatchPage} of {totalPages}
                                                        </span>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => setCurrentMatchPage(prev => Math.max(prev - 1, 1))}
                                                                disabled={currentMatchPage === 1}
                                                                className="px-3.5 py-1.5 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-xl cursor-pointer"
                                                            >
                                                                Prev
                                                            </button>
                                                            <button
                                                                onClick={() => setCurrentMatchPage(prev => Math.min(prev + 1, totalPages))}
                                                                disabled={currentMatchPage === totalPages}
                                                                className="px-3.5 py-1.5 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-xl cursor-pointer"
                                                            >
                                                                Next
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-xs text-gray-500 font-black uppercase bg-slate-900/30 border border-white/5 rounded-2xl relative overflow-hidden">
                                            <Trophy className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                            {matchViewTab === 'upcoming' ? 'No upcoming matches listed' : 'No past matches listed'}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Rankings Tab Content */}
                            {activeTab === 'rankings' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">Rankings Points Breakdown</h4>
                                    </div>

                                    {/* Scrollable organizational pills selection */}
                                    {player.rankings && player.rankings.length > 0 && (
                                        <div className="flex gap-1.5 overflow-x-auto no-scrollbar scrollbar-none pb-1 -mx-2 px-2">
                                            {player.rankings.map((r, i) => {
                                                const isSelected = selectedRankingForBreakdown?.org === r.org && selectedRankingForBreakdown?.age_group === r.age_group && selectedRankingForBreakdown?.match_type === r.match_type;
                                                return (
                                                    <button
                                                        key={i}
                                                        onClick={() => setSelectedRankingForBreakdown(r)}
                                                        className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap border shrink-0 cursor-pointer ${isSelected
                                                            ? 'bg-yellow-500 text-black border-yellow-500 font-extrabold shadow-lg shadow-yellow-500/10'
                                                            : 'bg-white/[0.02] border-white/10 text-white/70 hover:text-white'
                                                            }`}
                                                    >
                                                        {r.org} ({r.age_group || 'Open'})
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {selectedRankingForBreakdown ? (
                                        <div className="space-y-4">
                                            {/* Standings Grid Cards */}
                                            <div className="grid grid-cols-3 gap-2">
                                                <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-3.5 text-center">
                                                    <p className="text-[7.5px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Standing</p>
                                                    <p className="text-lg font-black text-yellow-500">#{selectedRankingForBreakdown.rank}</p>
                                                </div>
                                                <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-3.5 text-center">
                                                    <p className="text-[7.5px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Points</p>
                                                    <p className="text-lg font-black text-white">{selectedRankingForBreakdown.points}</p>
                                                </div>
                                                <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-3.5 text-center flex flex-col justify-center">
                                                    <p className="text-[7.5px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Type</p>
                                                    <p className="text-[9px] font-extrabold text-gray-300 uppercase leading-none mt-1 truncate">{selectedRankingForBreakdown.match_type}</p>
                                                </div>
                                            </div>

                                            {/* Contributions List Table */}
                                            <div className="space-y-3">
                                                <h5 className="text-[9px] font-black uppercase tracking-[0.25em] text-gray-500 pl-1">Detailed Breakdown</h5>
                                                {selectedRankingForBreakdown.details && selectedRankingForBreakdown.details.length > 0 ? (
                                                    selectedRankingForBreakdown.details.map((item, idx) => (
                                                        <div key={idx} className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-3 shadow-lg backdrop-blur-xl">
                                                            <div className="flex justify-between items-start gap-2">
                                                                <div className="min-w-0">
                                                                    <h5 className="font-extrabold text-xs text-white uppercase tracking-tight leading-tight">{item.name}</h5>
                                                                    {item.class && (
                                                                        <span className="inline-block mt-1 text-[7.5px] font-black uppercase tracking-wider text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full">
                                                                            {item.class}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-right shrink-0">
                                                                    <span className="text-xs font-black text-yellow-500">+{item.points} PTS</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between items-center text-[8px] text-gray-500 font-bold uppercase tracking-wider pt-2.5 border-t border-white/5">
                                                                <div>{item.date}</div>
                                                                <div className="flex gap-2">
                                                                    <span>Standing: {item.place}</span>
                                                                    <span>•</span>
                                                                    <span className="bg-white/5 border border-white/10 text-gray-400 px-1.5 py-0.5 rounded">{item.event_type}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-center py-8 text-xs text-gray-500 font-bold uppercase tracking-wider bg-slate-900/30 border border-white/5 rounded-2xl">
                                                        No detailed stand breakdown listed
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-xs text-gray-500 font-black uppercase bg-slate-900/30 border border-white/5 rounded-2xl">
                                            No rankings details available
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Payments Tab Content */}
                            {activeTab === 'payments' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">Transaction History</h4>
                                    </div>
                                    {transactionsLoading ? (
                                        <div className="flex items-center justify-center py-12">
                                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : transactions.length > 0 ? (
                                        <div className="space-y-3">
                                            {currentTransactionsList.map((t, idx) => (
                                                <div key={idx} className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-lg backdrop-blur-xl">
                                                    <div className="min-w-0 space-y-1">
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider inline-block ${t.status?.toLowerCase() === 'success'
                                                            ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                                                            : 'bg-red-500/10 border border-red-500/20 text-red-400'
                                                            }`}>
                                                            {t.status}
                                                        </span>
                                                        <h5 className="font-extrabold text-xs text-white uppercase tracking-tight truncate leading-tight mt-1">{t.event_name || 'License Fee'}</h5>
                                                        <span className="text-[8px] text-gray-500 font-bold uppercase block">{t.date}</span>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className="text-xs font-black text-blue-400">{t.amount}</span>
                                                        <span className="text-[7.5px] text-gray-500 font-semibold block uppercase tracking-widest mt-1">{t.payment_type?.replace(/_/g, ' ')}</span>
                                                    </div>
                                                </div>
                                            ))}
                                            {transactions.length > transactionsPerPage && (
                                                <div className="flex justify-between items-center mt-6 px-1">
                                                    <span className="text-gray-500 text-[9px] font-black uppercase tracking-widest">
                                                        Page {currentTransactionPage} of {totalTransactionPages}
                                                    </span>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setCurrentTransactionPage(prev => Math.max(prev - 1, 1))}
                                                            disabled={currentTransactionPage === 1}
                                                            className="px-3.5 py-1.5 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-xl cursor-pointer"
                                                        >
                                                            Prev
                                                        </button>
                                                        <button
                                                            onClick={() => setCurrentTransactionPage(prev => Math.min(prev + 1, totalTransactionPages))}
                                                            disabled={currentTransactionPage === totalTransactionPages}
                                                            className="px-3.5 py-1.5 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-xl cursor-pointer"
                                                        >
                                                            Next
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-xs text-gray-500 font-black uppercase bg-slate-900/30 border border-white/5 rounded-2xl">
                                            No transactions found
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Profile Tab Content */}
                            {activeTab === 'profile' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Player Profile Details</h4>
                                        {!isMobileEditingProfile && (
                                            <button
                                                onClick={() => setIsMobileEditingProfile(true)}
                                                className="bg-[#CCFF00]/10 border border-[#CCFF00]/30 text-[#CCFF00] hover:bg-[#CCFF00]/20 px-3 py-1.5 rounded-xl text-[8.5px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                                            >
                                                <Edit3 size={10} />
                                                <span>Edit</span>
                                            </button>
                                        )}
                                    </div>

                                    {!isMobileEditingProfile ? (
                                        <div className="space-y-4">
                                            {/* Stats / Info Grid */}
                                            <div className="grid grid-cols-2 gap-3">
                                                {/* Contact Number */}
                                                <div className="bg-[#0F172A]/70 border border-white/10 rounded-2xl p-3.5 flex flex-col justify-between min-h-[75px] shadow-lg backdrop-blur-xl">
                                                    <span className="text-[7.5px] font-black text-padel-green uppercase tracking-widest flex items-center gap-1">
                                                        <Phone size={9} />
                                                        Contact
                                                    </span>
                                                    <p className="text-[11px] font-black text-white truncate mt-1">
                                                        {player.contact_number || 'Not Set'}
                                                    </p>
                                                </div>

                                                {/* Age */}
                                                <div className="bg-[#0F172A]/70 border border-white/10 rounded-2xl p-3.5 flex flex-col justify-between min-h-[75px] shadow-lg backdrop-blur-xl">
                                                    <span className="text-[7.5px] font-black text-padel-green uppercase tracking-widest flex items-center gap-1">
                                                        <CalendarIcon size={9} />
                                                        Age
                                                    </span>
                                                    <p className="text-[11px] font-black text-white truncate mt-1">
                                                        {player.age ? `${player.age} Years` : 'Not Set'}
                                                    </p>
                                                </div>

                                                {/* Home Club */}
                                                <div className="bg-[#0F172A]/70 border border-white/10 rounded-2xl p-3.5 flex flex-col justify-between min-h-[75px] shadow-lg backdrop-blur-xl">
                                                    <span className="text-[7.5px] font-black text-padel-green uppercase tracking-widest flex items-center gap-1">
                                                        <Trophy size={9} />
                                                        Home Club
                                                    </span>
                                                    <p className="text-[11px] font-black text-white truncate mt-1">
                                                        {player.home_club || 'Not Set'}
                                                    </p>
                                                </div>

                                                {/* Racket Brand */}
                                                <div className="bg-[#0F172A]/70 border border-white/10 rounded-2xl p-3.5 flex flex-col justify-between min-h-[75px] shadow-lg backdrop-blur-xl">
                                                    <span className="text-[7.5px] font-black text-padel-green uppercase tracking-widest flex items-center gap-1">
                                                        <ShieldCheck size={9} />
                                                        Racket
                                                    </span>
                                                    <p className="text-[11px] font-black text-white truncate mt-1">
                                                        {player.racket_brand || 'Not Set'}
                                                    </p>
                                                </div>

                                                {/* Region */}
                                                <div className="bg-[#0F172A]/70 border border-white/10 rounded-2xl p-3.5 flex flex-col justify-between min-h-[75px] shadow-lg backdrop-blur-xl">
                                                    <span className="text-[7.5px] font-black text-padel-green uppercase tracking-widest flex items-center gap-1">
                                                        <MapPin size={9} />
                                                        Region
                                                    </span>
                                                    <p className="text-[11px] font-black text-white truncate mt-1">
                                                        {player.region || 'Not Set'}
                                                    </p>
                                                </div>

                                                {/* Category */}
                                                <div className="bg-[#0F172A]/70 border border-white/10 rounded-2xl p-3.5 flex flex-col justify-between min-h-[75px] shadow-lg backdrop-blur-xl">
                                                    <span className="text-[7.5px] font-black text-padel-green uppercase tracking-widest flex items-center gap-1">
                                                        <Briefcase size={9} />
                                                        Division
                                                    </span>
                                                    <p className="text-[11px] font-black text-white truncate mt-1">
                                                        {player.category || 'Not Set'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Biography Block */}
                                            <div className="bg-[#0F172A]/70 border border-white/10 rounded-3xl p-4 shadow-lg backdrop-blur-xl space-y-2">
                                                <span className="text-[7.5px] font-black text-padel-green uppercase tracking-[0.2em] block">Player Biography</span>
                                                <p className="text-[10px] text-gray-300 font-medium leading-relaxed">
                                                    {player.bio || "No biography added yet. Update your profile to tell us about your padel journey!"}
                                                </p>
                                            </div>

                                            {/* Instagram Handle */}
                                            {player.instagram_link && (
                                                <a
                                                    href={player.instagram_link.startsWith('http') ? player.instagram_link : `https://instagram.com/${player.instagram_link.replace('@', '')}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="bg-[#0F172A]/70 border border-white/10 rounded-2xl p-3.5 flex items-center justify-between shadow-lg backdrop-blur-xl hover:bg-white/[0.02] transition-all cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <Instagram size={14} className="text-[#CCFF00]" />
                                                        <span className="text-[10px] font-bold text-gray-300">Instagram Handle</span>
                                                    </div>
                                                    <span className="text-[9.5px] font-extrabold text-padel-green uppercase tracking-wider flex items-center gap-1">
                                                        {player.instagram_link.startsWith('@') ? player.instagram_link : `@${player.instagram_link.split('/').pop().replace('@', '')}`}
                                                        <ExternalLink size={9} />
                                                    </span>
                                                </a>
                                            )}

                                            {/* Sponsors Block */}
                                            <div className="bg-[#0F172A]/70 border border-white/10 rounded-3xl p-4 shadow-lg backdrop-blur-xl space-y-3">
                                                <span className="text-[7.5px] font-black text-padel-green uppercase tracking-[0.2em] block">Sponsors & Partners</span>
                                                {player.sponsors ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(() => {
                                                            try {
                                                                const parsed = JSON.parse(player.sponsors);
                                                                if (Array.isArray(parsed) && parsed.length > 0) {
                                                                    return parsed.map((sponsor, sIdx) => (
                                                                        <span
                                                                            key={sIdx}
                                                                            className="bg-[#CCFF00]/10 border border-[#CCFF00]/25 text-[#CCFF00] px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider"
                                                                        >
                                                                            {sponsor}
                                                                        </span>
                                                                    ));
                                                                }
                                                            } catch {
                                                                // fall back to string display
                                                            }
                                                            return (
                                                                <span className="bg-[#CCFF00]/10 border border-[#CCFF00]/25 text-[#CCFF00] px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider">
                                                                    {player.sponsors}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                ) : (
                                                    <p className="text-[9.5px] text-gray-500 font-bold uppercase tracking-wider">No active sponsors listed</p>
                                                )}
                                            </div>

                                            {/* Edit Button at bottom */}
                                            <button
                                                onClick={() => setIsMobileEditingProfile(true)}
                                                className="w-full bg-[#CCFF00] text-black py-3.5 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-white active:scale-[0.98] transition-all shadow-md shadow-[#CCFF00]/10 flex items-center justify-center gap-2 cursor-pointer mt-2"
                                            >
                                                <Edit3 size={12} />
                                                <span>Edit Profile Details</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <form onSubmit={(e) => {
                                            handleSave(e);
                                            setIsMobileEditingProfile(false);
                                        }} className="space-y-4 bg-slate-900/60 border border-white/10 rounded-3xl p-5 shadow-lg backdrop-blur-xl">
                                            {/* Inline feedback alert */}
                                            <AnimatePresence>
                                                {message && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-md ${message.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-[#CCFF00] text-black font-black'
                                                            } text-[10px] uppercase tracking-widest font-bold`}
                                                    >
                                                        {message.type === 'error' ? <AlertCircle size={13} /> : <CheckCircle size={13} />}
                                                        {message.text}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* Contact Number */}
                                            <div className="space-y-1">
                                                <label className="text-[8.5px] font-black uppercase tracking-wider text-padel-green ml-1">Contact Number</label>
                                                <div className="relative">
                                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-3.5 h-3.5" />
                                                    <input
                                                        type="tel"
                                                        value={formData.contact_number}
                                                        onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                                                        className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                                        placeholder="Phone Number"
                                                    />
                                                </div>
                                            </div>

                                            {/* Age */}
                                            <div className="space-y-1">
                                                <label className="text-[8.5px] font-black uppercase tracking-wider text-padel-green ml-1">Age</label>
                                                <div className="relative">
                                                    <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-3.5 h-3.5" />
                                                    <input
                                                        type="number"
                                                        value={formData.age || ''}
                                                        onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                                        className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                                        placeholder="Your Age"
                                                    />
                                                </div>
                                            </div>

                                            {/* Home Club */}
                                            <div className="space-y-1">
                                                <label className="text-[8.5px] font-black uppercase tracking-wider text-padel-green ml-1">Home Club</label>
                                                <SearchableSelect
                                                    options={[...clubs.map(club => ({ label: club.name, value: club.id })), { label: "Other (Type your own)", value: "Other" }]}
                                                    value={formData.club_id}
                                                    onChange={(e) => setFormData({ ...formData, club_id: e.target.value, home_club: e.target.value !== 'Other' ? clubs.find(c => c.id === e.target.value)?.name || '' : formData.home_club })}
                                                    placeholder="Select Home Club"
                                                    icon={Trophy}
                                                />
                                                {formData.club_id === 'Other' && (
                                                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
                                                        <input
                                                            type="text"
                                                            placeholder="Please specify your club name"
                                                            value={formData.custom_club}
                                                            onChange={(e) => setFormData({ ...formData, custom_club: e.target.value })}
                                                            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-padel-green transition-all text-xs"
                                                            required
                                                        />
                                                    </motion.div>
                                                )}
                                            </div>

                                            {/* Racket Brand */}
                                            <div className="space-y-1">
                                                <label className="text-[8.5px] font-black uppercase tracking-wider text-padel-green ml-1">Racket Brand</label>
                                                <div className="relative space-y-2">
                                                    <div className="relative">
                                                        <select
                                                            value={['Adidas', 'Babolat', 'Bull Padel', 'Nox', 'Varlion', 'Oxdog', 'Wilson', 'Head', 'Siux'].includes(formData.racket_brand) ? formData.racket_brand : (formData.racket_brand ? 'Other' : '')}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (val === 'Other') {
                                                                    setFormData({ ...formData, racket_brand: 'Other' });
                                                                } else {
                                                                    setFormData({ ...formData, racket_brand: val });
                                                                }
                                                            }}
                                                            className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-4 pr-10 py-2.5 text-xs text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold appearance-none cursor-pointer"
                                                        >
                                                            <option value="" disabled className="bg-[#0F172A] text-white">Select Brand</option>
                                                            <option value="Adidas" className="bg-[#0F172A] text-white">Adidas</option>
                                                            <option value="Babolat" className="bg-[#0F172A] text-white">Babolat</option>
                                                            <option value="Bull Padel" className="bg-[#0F172A] text-white">Bull Padel</option>
                                                            <option value="Nox" className="bg-[#0F172A] text-white">Nox</option>
                                                            <option value="Varlion" className="bg-[#0F172A] text-white">Varlion</option>
                                                            <option value="Oxdog" className="bg-[#0F172A] text-white">Oxdog</option>
                                                            <option value="Wilson" className="bg-[#0F172A] text-white">Wilson</option>
                                                            <option value="Head" className="bg-[#0F172A] text-white">Head</option>
                                                            <option value="Siux" className="bg-[#0F172A] text-white">Siux</option>
                                                            <option value="Other" className="bg-[#0F172A] text-white">Other</option>
                                                        </select>
                                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-padel-green/75 pointer-events-none w-3.5 h-3.5" />
                                                    </div>

                                                    {(formData.racket_brand === 'Other' || (!['Adidas', 'Babolat', 'Bull Padel', 'Nox', 'Varlion', 'Oxdog', 'Wilson', 'Head', 'Siux', ''].includes(formData.racket_brand))) && (
                                                        <input
                                                            type="text"
                                                            value={formData.racket_brand === 'Other' ? '' : formData.racket_brand}
                                                            onChange={(e) => setFormData({ ...formData, racket_brand: e.target.value })}
                                                            placeholder="Specify your brand"
                                                            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                                            required
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Region */}
                                            <div className="space-y-1">
                                                <label className="text-[8.5px] font-black uppercase tracking-wider text-padel-green ml-1">Region</label>
                                                <div className="relative">
                                                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-3.5 h-3.5" />
                                                    <select
                                                        value={formData.region}
                                                        onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                                                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-11 pr-10 py-2.5 text-xs text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold appearance-none cursor-pointer"
                                                    >
                                                        <option value="" disabled className="bg-[#0F172A] text-white">Select Region</option>
                                                        <option value="Eastern Cape" className="bg-[#0F172A] text-white">Eastern Cape</option>
                                                        <option value="Free State" className="bg-[#0F172A] text-white">Free State</option>
                                                        <option value="Gauteng" className="bg-[#0F172A] text-white">Gauteng</option>
                                                        <option value="KwaZulu-Natal" className="bg-[#0F172A] text-white">KwaZulu-Natal</option>
                                                        <option value="Limpopo" className="bg-[#0F172A] text-white">Limpopo</option>
                                                        <option value="Mpumalanga" className="bg-[#0F172A] text-white">Mpumalanga</option>
                                                        <option value="Northern Cape" className="bg-[#0F172A] text-white">Northern Cape</option>
                                                        <option value="North West" className="bg-[#0F172A] text-white">North West</option>
                                                        <option value="Western Cape" className="bg-[#0F172A] text-white">Western Cape</option>
                                                    </select>
                                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-padel-green/75 pointer-events-none w-3.5 h-3.5" />
                                                </div>
                                            </div>

                                            {/* Instagram Link / Handle */}
                                            <div className="space-y-1">
                                                <label className="text-[8.5px] font-black uppercase tracking-wider text-padel-green ml-1">Instagram Link / Handle</label>
                                                <div className="relative">
                                                    <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-3.5 h-3.5" />
                                                    <input
                                                        type="text"
                                                        value={formData.instagram_link}
                                                        onChange={(e) => setFormData({ ...formData, instagram_link: e.target.value })}
                                                        className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                                        placeholder="@username or full URL"
                                                    />
                                                </div>
                                            </div>

                                            {/* Bio */}
                                            <div className="space-y-1">
                                                <label className="text-[8.5px] font-black uppercase tracking-wider text-padel-green ml-1">Biography</label>
                                                <div className="relative">
                                                    <textarea
                                                        value={formData.bio}
                                                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                                        className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700 min-h-[70px]"
                                                        placeholder="Tell us about your padel journey..."
                                                    />
                                                </div>
                                            </div>

                                            {/* Save Button */}
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="w-full mt-2 bg-[#CCFF00] text-black py-3.5 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-white hover:scale-[1.01] active:scale-[0.98] transition-all shadow-md shadow-[#CCFF00]/10 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                                            >
                                                {saving ? (
                                                    <>
                                                        <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                                        <span>Saving...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Save size={12} />
                                                        <span>Save Changes</span>
                                                    </>
                                                )}
                                            </button>
                                        </form>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Career Overview Card (Mobile) - Positioned below tab contents */}
                        <div
                            onClick={() => setIsCareerAccordionOpen(!isCareerAccordionOpen)}
                            className="bg-[#0F172A]/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4 cursor-pointer"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-padel-green/10 border border-padel-green/20 text-padel-green flex items-center justify-center shrink-0">
                                        <Trophy size={16} />
                                    </div>
                                    <h4 className="font-black text-white uppercase tracking-wider text-xs">
                                        Career Overview
                                    </h4>
                                </div>
                                <ChevronDown className={`text-padel-green transition-transform duration-300 ${isCareerAccordionOpen ? 'rotate-180' : ''}`} size={16} />
                            </div>

                            <AnimatePresence mode="wait">
                                {isCareerAccordionOpen && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden space-y-4 pt-1"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {player.skill_rating && (
                                            <div className="bg-padel-green/10 border border-padel-green/20 rounded-2xl p-4 flex items-center gap-4">
                                                <div className="min-w-[4.5rem] px-3 h-14 bg-padel-green text-black rounded-xl flex flex-col items-center justify-center">
                                                    <span className="text-[8px] font-black uppercase">Skill</span>
                                                    <span className="text-xl font-black">{player.skill_rating}</span>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-[10px] font-black text-padel-green uppercase tracking-widest">Rankedin Rating</p>
                                                    <div className="h-1.5 w-full bg-white/5 rounded-full mt-1 overflow-hidden">
                                                        <div
                                                            className="h-full bg-padel-green transition-all duration-1000"
                                                            style={{ width: `${Math.min(player.skill_rating * 3.33, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {player.rankings && Array.isArray(player.rankings) && player.rankings.length > 0 && (
                                            <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-4">
                                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Organizational Rankings</p>
                                                <div className="space-y-2">
                                                    {player.rankings.map((r, i) => {
                                                        const isPreferred = player.preferred_ranking === `${r.org}|${r.age_group}|${r.match_type}` || (i === 0 && !player.preferred_ranking);
                                                        const isBroll = r.org?.toLowerCase().includes('broll');

                                                        return (
                                                            <div
                                                                key={i}
                                                                onClick={() => handleSelectRanking(r)}
                                                                className={`group/rank relative p-3 rounded-xl border transition-all cursor-pointer ${isPreferred ? 'bg-padel-green/10 border-padel-green/30' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                                                            >
                                                                <div className="flex justify-between items-start gap-2">
                                                                    <div className="min-w-0">
                                                                        <p className={`text-[8px] font-black uppercase tracking-widest ${isBroll ? 'text-red-500' : 'text-padel-green'}`}>
                                                                            {r.org || 'SAPA RANKING'}
                                                                        </p>
                                                                        <p className="text-xs font-bold text-white truncate uppercase tracking-tight">{r.age_group || r.division || 'Open'}</p>
                                                                        <p className="text-[8px] text-gray-500 font-bold uppercase">{r.match_type}</p>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <div className="flex items-baseline justify-end gap-0.5">
                                                                            <span className="text-[8px] font-black text-padel-green">#</span>
                                                                            <span className="text-sm font-black text-white">{r.rank}</span>
                                                                        </div>
                                                                        <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{r.points} PTS</p>
                                                                    </div>
                                                                </div>
                                                                <div className="mt-2 flex justify-end">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedRankingForBreakdown(r);
                                                                            setActiveTab('rankings');
                                                                        }}
                                                                        className="text-[8px] font-black text-padel-green hover:text-white uppercase tracking-widest transition-colors flex items-center gap-0.5"
                                                                    >
                                                                        Show Details →
                                                                    </button>
                                                                </div>
                                                                {isPreferred && (
                                                                    <div className="absolute -top-1 -right-1">
                                                                        <div className="bg-padel-green text-black rounded-full p-0.5 shadow-lg">
                                                                            <CheckCircle2 size={10} />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest text-center">Click a ranking to set as primary</p>
                                            </div>
                                        )}

                                        {player.match_form && (
                                            <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Recent Form</p>
                                                <div className="flex gap-1.5">
                                                    {player.match_form.split(/\s+/).filter(Boolean).map((f, i) => (
                                                        <div key={i} className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black ${f === 'W' ? 'bg-padel-green text-black' : 'bg-red-500 text-white'}`}>
                                                            {f}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Current Points</p>
                                            <p className="text-3xl font-black text-white">{player.points}</p>
                                        </div>

                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Division</p>
                                            <p className="text-xl font-bold text-padel-green uppercase">{player.category || 'Unassigned'}</p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Player Photo Gallery Row (Mobile) - Positioned below tab contents */}
                        <div className="bg-[#0F172A]/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 shadow-2xl space-y-3">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-padel-green flex items-center gap-1.5">
                                        <PhotoIcon size={12} className="text-padel-green" />
                                        Player Gallery
                                    </h4>
                                    <span className="bg-white/5 border border-white/10 text-white/50 px-2 py-0.5 rounded-full text-[8px] font-bold">
                                        {(formData.additional_images || []).length} / 5
                                    </span>
                                </div>
                                {uploadingGalleryImage && (
                                    <span className="text-[9px] font-bold text-padel-green animate-pulse">
                                        Uploading...
                                    </span>
                                )}
                            </div>

                            <div className="flex overflow-x-auto no-scrollbar flex-nowrap gap-3 pb-1">
                                {/* Existing gallery images */}
                                {(formData.additional_images || []).map((imgUrl, index) => (
                                    <div
                                        key={index}
                                        onClick={() => setActiveLightboxImg(imgUrl)}
                                        className="w-18 h-18 shrink-0 rounded-2xl border border-white/10 overflow-hidden relative group cursor-pointer bg-[#0F172A] transition-all hover:border-padel-green/50"
                                    >
                                        <img src={imgUrl} alt={`Gallery ${index + 1}`} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[7.5px] font-black uppercase tracking-wider text-white bg-black/60 px-1.5 py-0.5 rounded">View</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteGalleryImage(index);
                                            }}
                                            className="absolute top-1 right-1 p-1 rounded-full bg-red-500/80 hover:bg-red-600 text-white transition-all shadow-lg hover:scale-110 active:scale-90"
                                        >
                                            <X size={8} />
                                        </button>
                                    </div>
                                ))}

                                {/* Upload slot card */}
                                {(formData.additional_images || []).length < 5 && (
                                    <div
                                        onClick={() => document.getElementById('galleryImageUploadMobile').click()}
                                        className="w-18 h-18 shrink-0 rounded-2xl border border-dashed border-white/20 hover:border-padel-green bg-white/5 flex flex-col items-center justify-center cursor-pointer transition-all gap-0.5 group"
                                    >
                                        {uploadingGalleryImage ? (
                                            <div className="w-4 h-4 border-2 border-padel-green border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <PhotoIcon className="w-4 h-4 text-white/40 group-hover:text-padel-green transition-colors" />
                                                <span className="text-[7px] font-black uppercase tracking-widest text-white/40 group-hover:text-white transition-colors text-center">
                                                    Upload
                                                </span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            <input
                                type="file"
                                id="galleryImageUploadMobile"
                                accept="image/*"
                                multiple
                                onChange={handleGalleryImageUpload}
                                disabled={uploadingGalleryImage}
                                className="hidden"
                            />
                        </div>
                    </div>
                </div>

                {/* Hero Section */}
                <div className="hidden lg:block relative h-[30vh] md:h-[40vh] min-h-[360px] md:min-h-[400px] overflow-hidden pt-24 md:pt-28">
                    <div className="absolute inset-0">
                        <img
                            src={heroBg}
                            className="w-full h-full object-cover opacity-60 scale-105"
                            alt=""
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                    </div>

                    <div className="container mx-auto px-6 h-full flex flex-col justify-end pb-6 lg:pb-16 relative z-10">
                        <div className="w-full py-6 md:py-10 border-b border-white/10 flex flex-col md:flex-row items-center gap-6 md:gap-10 relative">
                            {/* Ambient Light Backglow */}
                            <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-32 rounded-full bg-gradient-to-r from-padel-green/5 via-white/[0.01] to-transparent blur-[70px] pointer-events-none" />

                            {/* Elegant Circular Avatar Left Column */}
                            <div className="relative group shrink-0">
                                <div
                                    onClick={() => document.getElementById('imageUpload').click()}
                                    className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-neutral-900 border border-white/10 p-1 shadow-xl overflow-hidden cursor-pointer relative transition-transform duration-300 hover:scale-105"
                                >
                                    <div className="w-full h-full rounded-full overflow-hidden border border-white/20 relative">
                                        {formData.image_url ? (
                                            <img src={formData.image_url} alt="Profile" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950">
                                                <User className="w-12 h-12 md:w-18 md:h-18 text-white/20" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="absolute inset-0 rounded-full bg-black/70 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center backdrop-blur-sm z-10">
                                        <PhotoIcon className="w-5 h-5 text-padel-green mb-1" />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-white">Upload</span>
                                    </div>
                                    {uploadingImage && (
                                        <div className="absolute inset-0 rounded-full bg-black/80 flex items-center justify-center z-20">
                                            <div className="w-6 h-6 border-2 border-padel-green border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    id="imageUpload"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    disabled={uploadingImage}
                                    className="hidden"
                                />

                                <button
                                    onClick={() => setIsEditProfileModalOpen(true)}
                                    className="absolute bottom-1 right-1 bg-white text-black hover:bg-padel-green p-2 rounded-full border border-black shadow-lg transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center z-10"
                                    title="Edit Profile"
                                >
                                    <Edit3 size={12} className="md:w-3.5 md:h-3.5" />
                                </button>
                            </div>

                            {/* Content Right Column - Horizontal Flow */}
                            <div className="flex-1 min-w-0 text-center md:text-left relative z-10">
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-3"
                                >
                                    <div className="flex items-center justify-center md:justify-start gap-2">
                                        {player.license_type && (
                                            <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${player.license_type === 'full'
                                                ? 'bg-padel-green/10 border-padel-green/30 text-padel-green'
                                                : player.license_type === 'temporary'
                                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                                    : 'bg-white/5 border-white/10 text-gray-400'
                                                }`}>
                                                {player.license_type === 'full' && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-padel-green animate-pulse"></span>
                                                )}
                                                {player.license_type === 'full' ? 'Full License Player' : (player.license_type === 'temporary' ? 'Temporary License Player' : 'No License')}
                                            </span>
                                        )}
                                        {player.rankedin_id && (
                                            <span className="text-[9px] text-white/30 font-bold uppercase tracking-wider pl-2 border-l border-white/20">
                                                ID: {player.rankedin_id}
                                            </span>
                                        )}
                                    </div>

                                    <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white flex items-center justify-center md:justify-start gap-2">
                                        {player.name}
                                    </h1>

                                    {/* Linear Dot-Separated Metadata Grid */}
                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 text-xs md:text-sm font-semibold text-gray-400">
                                        {player.rank_label && player.rank_label !== 'Unranked' && (
                                            <div className="flex items-center gap-1.5">
                                                <Trophy size={14} className="text-yellow-500 shrink-0" />
                                                <span className="text-yellow-500 font-black">Rank #{player.rank_label}</span>
                                            </div>
                                        )}

                                        <span className="hidden sm:inline text-white/20">•</span>

                                        {player.points !== undefined && player.points !== null && (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-padel-green font-black">{player.points} Points</span>
                                            </div>
                                        )}

                                        <span className="hidden sm:inline text-white/20">•</span>

                                        <div className="flex items-center gap-1.5">
                                            <MapPin size={14} className="text-white/40 shrink-0" />
                                            <span><strong className="text-white">{player.home_club || 'Not set'}</strong></span>
                                        </div>

                                        {player.age && (
                                            <>
                                                <span className="hidden sm:inline text-white/20">•</span>
                                                <div>Age {player.age}</div>
                                            </>
                                        )}
                                    </div>

                                    {player.rank_label && player.rank_label !== 'Unranked' && player.active_ranking_label && (
                                        <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.2em] pt-1">
                                            Active Division: {player.active_ranking_label}
                                        </p>
                                    )}
                                </motion.div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="hidden lg:block container mx-auto px-6 mt-6 lg:-mt-10 pb-24 relative z-20">
                    {/* Payment Required Banner - shown when profile is not visible (none or temporary) */}
                    {player && (player.license_type !== 'full') && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`mb-6 bg-neutral-950/30 backdrop-blur-xl border-y border-r border-white/5 p-4 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden group ${player.license_type === 'temporary'
                                ? 'border-l-2 border-l-blue-500'
                                : 'border-l-2 border-l-gray-500'
                                }`}
                        >
                            {/* Subtle background ambient light */}
                            <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[40px] pointer-events-none ${player.license_type === 'temporary' ? 'bg-blue-500/5' : 'bg-white/5'
                                }`} />

                            <div className="flex flex-col md:flex-row md:items-center gap-3 relative z-10">
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded ${player.license_type === 'temporary'
                                        ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                                        : 'bg-white/5 border border-white/10 text-gray-400'
                                        }`}>
                                        {player.license_type === 'temporary' ? 'Temporary License Active' : 'License Inactive'}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm text-gray-400">
                                    <span>
                                        {player.license_type === 'temporary'
                                            ? ''
                                            : 'Activate your professional elite license to appear on public rankings & track tour statistics.'
                                        }
                                    </span>
                                    {player.license_type === 'temporary' && tempLicenseDetails && (
                                        <span className="text-white font-bold bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl flex items-center gap-1.5 uppercase tracking-wide text-xs">
                                            🏆 {tempLicenseDetails.event_name}
                                            <span className="text-[10px] text-gray-500 font-medium border-l border-white/10 pl-1.5 flex items-center gap-1">
                                                <CalendarIcon size={10} className="text-gray-400" />
                                                {new Date(tempLicenseDetails.event_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="shrink-0 flex flex-wrap items-center justify-between md:justify-end gap-2 relative z-10 w-full md:w-auto border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                                {player.license_type === 'temporary' ? (
                                    <>
                                        <span className="text-[10px] text-gray-500 hidden xl:inline uppercase tracking-widest font-black">

                                        </span>
                                        <button
                                            onClick={() => setShowPaymentModal(true)}
                                            className="text-[11px] font-black uppercase tracking-widest px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all cursor-pointer shadow-md shadow-blue-500/10 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5"
                                        >
                                            <ShieldCheck size={13} />
                                            Upgrade to Full License
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setShowPaymentModal(true)}
                                            className="text-[11px] font-black uppercase tracking-widest px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-all cursor-pointer"
                                        >
                                            Buy Temp License
                                        </button>
                                        <button
                                            onClick={() => setShowPaymentModal(true)}
                                            className="text-[11px] font-black uppercase tracking-widest px-4 py-2 bg-[#CCFF00] hover:bg-[#CCFF00]/90 text-black rounded-xl transition-all cursor-pointer shadow-md shadow-[#CCFF00]/10 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5"
                                        >
                                            <ShieldCheck size={13} />
                                            Pay Now - Full License
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}


                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">

                        {/* Left Panel: Statistics & Quick Updates */}
                        <div className="lg:col-span-4 space-y-6 order-2 lg:order-1">
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 }}
                                onClick={() => {
                                    if (window.innerWidth < 1024 && !isCareerAccordionOpen) {
                                        setIsCareerAccordionOpen(true);
                                    }
                                }}
                                className={`bg-neutral-950/35 backdrop-blur-2xl border-t border-white/12 border-x border-b border-white/5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85)] rounded-[2.5rem] ${isCareerAccordionOpen ? 'p-8' : 'py-5 px-6 lg:p-8 cursor-pointer lg:cursor-default'} transition-all duration-300 relative overflow-hidden`}
                            >
                                <motion.div
                                    animate={{ scale: [1, 1.15, 0.9, 1], x: [0, 20, -15, 0], y: [0, -15, 10, 0] }}
                                    transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                                    className="absolute -top-20 left-10 w-72 h-72 rounded-full bg-[#beff00]/5 blur-[90px] pointer-events-none"
                                />
                                <motion.div
                                    animate={{ scale: [1, 0.9, 1.1, 1], x: [0, -15, 20, 0], y: [0, 15, -10, 0] }}
                                    transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
                                    className="absolute -bottom-20 right-10 w-72 h-72 rounded-full bg-[#beff00]/5 blur-[90px] pointer-events-none"
                                />

                                <div
                                    onClick={(e) => {
                                        if (window.innerWidth < 1024) {
                                            e.stopPropagation();
                                            setIsCareerAccordionOpen(!isCareerAccordionOpen);
                                        }
                                    }}
                                    className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer lg:cursor-default relative z-10 ${isCareerAccordionOpen ? 'mb-6' : 'mb-0'}`}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2.5 rounded-xl bg-[#beff00]/10 border border-[#beff00]/20 text-[#beff00] shadow-[0_0_15px_rgba(190,255,0,0.15)] flex items-center justify-center shrink-0">
                                                <Trophy size={24} />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <h4 className="font-black text-white uppercase tracking-wider text-sm sm:text-base lg:text-lg truncate">
                                                    CAREER OVERVIEW
                                                </h4>
                                            </div>
                                        </div>
                                        <div className="lg:hidden">
                                            <ChevronDown className={`text-padel-green transition-transform duration-300 ${isCareerAccordionOpen ? 'rotate-180' : ''}`} size={24} />
                                        </div>
                                    </div>
                                </div>

                                <AnimatePresence mode="wait">
                                    {(isCareerAccordionOpen || window.innerWidth >= 1024) && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="space-y-4">
                                                {player.skill_rating && (
                                                    <div className="bg-padel-green/10 border border-padel-green/20 rounded-2xl p-4 flex items-center gap-4">
                                                        <div className="min-w-[4.5rem] px-3 h-14 bg-padel-green text-black rounded-xl flex flex-col items-center justify-center">
                                                            <span className="text-[8px] font-black uppercase">Skill</span>
                                                            <span className="text-xl font-black">{player.skill_rating}</span>
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-[10px] font-black text-padel-green uppercase tracking-widest">Rankedin Rating</p>
                                                            <div className="h-1.5 w-full bg-white/5 rounded-full mt-1 overflow-hidden">
                                                                <div
                                                                    className="h-full bg-padel-green transition-all duration-1000"
                                                                    style={{ width: `${Math.min(player.skill_rating * 3.33, 100)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {player.rankings && Array.isArray(player.rankings) && player.rankings.length > 0 && (
                                                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-4">
                                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Organizational Rankings</p>
                                                        <div className="space-y-2">
                                                            {player.rankings.map((r, i) => {
                                                                const isPreferred = player.preferred_ranking === `${r.org}|${r.age_group}|${r.match_type}` || (i === 0 && !player.preferred_ranking);
                                                                const isBroll = r.org?.toLowerCase().includes('broll');

                                                                return (
                                                                    <div
                                                                        key={i}
                                                                        onClick={() => handleSelectRanking(r)}
                                                                        className={`group/rank relative p-3 rounded-xl border transition-all cursor-pointer ${isPreferred ? 'bg-padel-green/10 border-padel-green/30' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                                                                    >
                                                                        <div className="flex justify-between items-start gap-2">
                                                                            <div className="min-w-0">
                                                                                <p className={`text-[8px] font-black uppercase tracking-widest ${isBroll ? 'text-red-500' : 'text-padel-green'}`}>
                                                                                    {r.org || 'SAPA RANKING'}
                                                                                </p>
                                                                                <p className="text-xs font-bold text-white truncate uppercase tracking-tight">{r.age_group || r.division || 'Open'}</p>
                                                                                <p className="text-[8px] text-gray-500 font-bold uppercase">{r.match_type}</p>
                                                                            </div>
                                                                            <div className="text-right shrink-0">
                                                                                <div className="flex items-baseline justify-end gap-0.5">
                                                                                    <span className="text-[8px] font-black text-padel-green">#</span>
                                                                                    <span className="text-sm font-black text-white">{r.rank}</span>
                                                                                </div>
                                                                                <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{r.points} PTS</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-2 flex justify-end">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setSelectedRankingForBreakdown(r);
                                                                                    setActiveTab('rankings');
                                                                                }}
                                                                                className="text-[8px] font-black text-padel-green hover:text-white uppercase tracking-widest transition-colors flex items-center gap-0.5"
                                                                            >
                                                                                Show Details →
                                                                            </button>
                                                                        </div>
                                                                        {isPreferred && (
                                                                            <div className="absolute -top-1 -right-1">
                                                                                <div className="bg-padel-green text-black rounded-full p-0.5 shadow-lg">
                                                                                    <CheckCircle2 size={10} />
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest text-center">Click a ranking to set as primary</p>
                                                    </div>
                                                )}

                                                {player.match_form && (
                                                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Recent Form</p>
                                                        <div className="flex gap-1.5">
                                                            {player.match_form.split(/\s+/).filter(Boolean).map((f, i) => (
                                                                <div key={i} className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black ${f === 'W' ? 'bg-padel-green text-black' : 'bg-red-500 text-white'
                                                                    }`}>
                                                                    {f}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Current Points</p>
                                                    <p className="text-3xl font-black text-white">{player.points}</p>
                                                </div>

                                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Division</p>
                                                    <p className="text-xl font-bold text-padel-green uppercase">{player.category || 'Unassigned'}</p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>

                            <div
                                onClick={() => {
                                    if (window.innerWidth < 1024 && !isSecurityAccordionOpen) {
                                        setIsSecurityAccordionOpen(true);
                                    }
                                }}
                                className={`bg-neutral-950/35 backdrop-blur-2xl border-t border-white/12 border-x border-b border-white/5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85)] rounded-[2.5rem] ${isSecurityAccordionOpen ? 'p-8' : 'py-5 px-6 lg:p-8 cursor-pointer lg:cursor-default'} transition-all duration-300 relative overflow-hidden`}
                            >
                                <motion.div
                                    animate={{ scale: [1, 1.15, 0.9, 1], x: [0, 20, -15, 0], y: [0, -15, 10, 0] }}
                                    transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                                    className="absolute -top-20 left-10 w-72 h-72 rounded-full bg-[#beff00]/5 blur-[90px] pointer-events-none"
                                />
                                <motion.div
                                    animate={{ scale: [1, 0.9, 1.1, 1], x: [0, -15, 20, 0], y: [0, 15, -10, 0] }}
                                    transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
                                    className="absolute -bottom-20 right-10 w-72 h-72 rounded-full bg-[#beff00]/5 blur-[90px] pointer-events-none"
                                />

                                <div
                                    onClick={(e) => {
                                        if (window.innerWidth < 1024) {
                                            e.stopPropagation();
                                            setIsSecurityAccordionOpen(!isSecurityAccordionOpen);
                                        } else {
                                            setIsSecurityAccordionOpen(!isSecurityAccordionOpen);
                                        }
                                    }}
                                    className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer relative z-10 ${isSecurityAccordionOpen ? 'mb-6' : 'mb-0'}`}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2.5 rounded-xl bg-[#beff00]/10 border border-[#beff00]/20 text-[#beff00] shadow-[0_0_15px_rgba(190,255,0,0.15)] flex items-center justify-center shrink-0">
                                                <ShieldCheck size={24} />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <h4 className="font-black text-white uppercase tracking-wider text-sm sm:text-base lg:text-lg truncate">
                                                    ACCOUNT SECURITY
                                                </h4>
                                            </div>
                                        </div>
                                        <div>
                                            <ChevronDown className={`text-padel-green transition-transform duration-300 ${isSecurityAccordionOpen ? 'rotate-180' : ''}`} size={24} />
                                        </div>
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {isSecurityAccordionOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <p className="text-xs text-white/50 leading-relaxed uppercase tracking-wider font-bold mb-6">
                                                To Reset your password, click the button below and follow the instructions on the email.
                                            </p>
                                            <button
                                                onClick={handleInitiatePasswordReset}
                                                disabled={loadingReset}
                                                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                                            >
                                                <Lock size={14} className="text-padel-green" />
                                                {loadingReset ? 'Sending Email...' : 'Reset Password'}
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Right Panel: Content */}
                        <div className="lg:col-span-8 space-y-6 lg:space-y-8 order-1 lg:order-2">

                            {/* Player Photo Gallery Row */}
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="relative"
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[#beff00] flex items-center gap-1.5">
                                            <PhotoIcon size={12} className="text-[#beff00]" />
                                            Player Gallery
                                        </h4>
                                        <span className="bg-white/5 border border-white/10 text-white/50 px-2 py-0.5 rounded-full text-[8px] font-bold">
                                            {(formData.additional_images || []).length} / 5
                                        </span>
                                    </div>
                                    {uploadingGalleryImage && (
                                        <span className="text-[9px] font-bold text-[#beff00] animate-pulse">
                                            Uploading...
                                        </span>
                                    )}
                                </div>

                                <div className="flex overflow-x-auto no-scrollbar flex-nowrap gap-3 pb-1">
                                    {/* Existing gallery images */}
                                    {(formData.additional_images || []).map((imgUrl, index) => (
                                        <div
                                            key={index}
                                            onClick={() => setActiveLightboxImg(imgUrl)}
                                            className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-2xl border border-white/10 overflow-hidden relative group cursor-pointer bg-[#0F172A] transition-all hover:border-[#beff00]/50 hover:shadow-lg hover:shadow-[#beff00]/5"
                                        >
                                            <img src={imgUrl} alt={`Gallery ${index + 1}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="text-[9px] font-black uppercase tracking-wider text-white bg-black/60 px-2 py-1 rounded-md">View</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteGalleryImage(index);
                                                }}
                                                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-red-500/80 hover:bg-red-600 text-white transition-all cursor-pointer opacity-0 group-hover:opacity-100 shadow-lg hover:scale-110 active:scale-90"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Upload slot card */}
                                    {(formData.additional_images || []).length < 5 && (
                                        <div
                                            onClick={() => document.getElementById('galleryImageUploadDashboard').click()}
                                            className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-2xl border border-dashed border-white/20 hover:border-[#beff00] bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center cursor-pointer transition-all gap-1 group"
                                        >
                                            {uploadingGalleryImage ? (
                                                <div className="w-5 h-5 border-2 border-[#beff00] border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <>
                                                    <PhotoIcon className="w-5 h-5 text-white/40 group-hover:text-[#beff00] transition-colors" />
                                                    <span className="text-[8px] font-black uppercase tracking-widest text-white/40 group-hover:text-white transition-colors text-center px-1">
                                                        Upload
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <input
                                    type="file"
                                    id="galleryImageUploadDashboard"
                                    accept="image/*"
                                    multiple
                                    onChange={handleGalleryImageUpload}
                                    disabled={uploadingGalleryImage}
                                    className="hidden"
                                />
                            </motion.div>

                            {/* Tab Navigation */}
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex overflow-x-auto no-scrollbar flex-nowrap gap-2 sm:gap-3 md:gap-4 pb-2 -mx-6 px-6 sm:mx-0 sm:px-0"
                            >
                                <button
                                    onClick={() => setActiveTab('events')}
                                    className={`whitespace-nowrap px-4 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center sm:justify-start gap-3 ${activeTab === 'events' ? 'bg-purple-500 border border-purple-500 text-white shadow-xl shadow-purple-500/20' : 'bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 text-gray-400 hover:bg-purple-500/15 hover:text-purple-300 hover:border-purple-500/40'}`}
                                >
                                    <CalendarIcon size={16} /> My Events
                                </button>
                                <button
                                    onClick={() => setActiveTab('matches')}
                                    className={`whitespace-nowrap px-4 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center sm:justify-start gap-3 ${activeTab === 'matches' ? 'bg-orange-500 border border-orange-500 text-white shadow-xl shadow-orange-500/20' : 'bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 text-gray-400 hover:bg-orange-500/15 hover:text-orange-300 hover:border-orange-500/40'}`}
                                >
                                    <Trophy size={16} /> My Matches
                                </button>
                                <button
                                    onClick={() => {
                                        setActiveTab('rankings');
                                        if (player.rankings && player.rankings.length > 0 && !selectedRankingForBreakdown) {
                                            setSelectedRankingForBreakdown(player.rankings[0]);
                                        }
                                    }}
                                    className={`whitespace-nowrap px-4 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center sm:justify-start gap-3 ${activeTab === 'rankings' ? 'bg-yellow-500 border border-yellow-500 text-black shadow-xl shadow-yellow-500/20' : 'bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 text-gray-400 hover:bg-yellow-500/15 hover:text-yellow-300 hover:border-yellow-500/40'}`}
                                >
                                    <TrendingUp size={16} /> My Rankings
                                </button>
                                <button
                                    onClick={() => setActiveTab('payments')}
                                    className={`whitespace-nowrap px-4 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center sm:justify-start gap-3 ${activeTab === 'payments' ? 'bg-blue-500 border border-blue-500 text-white shadow-xl shadow-blue-500/20' : 'bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 text-gray-400 hover:bg-blue-500/15 hover:text-blue-300 hover:border-blue-500/40'}`}
                                >
                                    <CreditCard size={16} /> Payments
                                </button>
                                {coachApplication && (
                                    <button
                                        onClick={() => setShowCoachModal(true)}
                                        className="whitespace-nowrap px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-[11px] transition-all flex items-center gap-3 bg-padel-green text-black shadow-xl shadow-padel-green/20 hover:bg-white hover:scale-105"
                                    >
                                        <Briefcase size={16} /> Coach Profile
                                    </button>
                                )}
                                <button
                                    onClick={() => setActiveTab('personal')}
                                    className={`whitespace-nowrap px-4 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center sm:justify-start gap-3 ${activeTab === 'personal' ? 'bg-padel-green border border-padel-green text-black shadow-xl shadow-padel-green/20' : 'bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 text-gray-400 hover:bg-padel-green/15 hover:text-[#beff00] hover:border-padel-green/30'}`}
                                >
                                    <User size={16} /> My Profile
                                </button>
                            </motion.div>

                            <AnimatePresence mode="wait">
                                {activeTab === 'personal' && (
                                    <motion.div
                                        key="personal"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.2 }}
                                        onClick={() => {
                                            if (window.innerWidth < 1024 && !isMobileAccordionOpen) {
                                                setIsMobileAccordionOpen(true);
                                            }
                                        }}
                                        className={`bg-neutral-950/35 backdrop-blur-2xl border-t border-[#beff00]/25 border-x border-[#beff00]/15 border-b border-[#beff00]/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85),0_0_40px_rgba(190,255,0,0.08)] rounded-[2.5rem] ${isMobileAccordionOpen ? 'p-8 lg:p-12' : 'py-5 px-6 lg:p-8 cursor-pointer lg:cursor-default'} relative overflow-hidden`}
                                    >
                                        <motion.div
                                            animate={{ scale: [1, 1.15, 0.9, 1], x: [0, 20, -15, 0], y: [0, -15, 10, 0] }}
                                            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute -top-20 left-10 w-72 h-72 rounded-full bg-[#beff00]/10 blur-[90px] pointer-events-none"
                                        />
                                        <motion.div
                                            animate={{ scale: [1, 0.9, 1.1, 1], x: [0, -15, 20, 0], y: [0, 15, -10, 0] }}
                                            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute -bottom-20 right-10 w-72 h-72 rounded-full bg-[#beff00]/10 blur-[90px] pointer-events-none"
                                        />

                                        <AnimatePresence>
                                            {message && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -20 }}
                                                    className={`absolute top-8 right-8 flex items-center gap-3 px-6 py-3 rounded-full shadow-2xl z-50 ${message.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-padel-green text-black'
                                                        } font-black text-xs uppercase tracking-widest`}
                                                >
                                                    {message.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
                                                    {message.text}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        <div
                                            onClick={(e) => {
                                                if (window.innerWidth < 1024) {
                                                    e.stopPropagation();
                                                    setIsMobileAccordionOpen(!isMobileAccordionOpen);
                                                }
                                            }}
                                            className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer lg:cursor-default relative z-10 ${isMobileAccordionOpen ? 'mb-10' : 'mb-0'}`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-2.5 rounded-xl bg-[#beff00]/10 border border-[#beff00]/20 text-[#beff00] shadow-[0_0_15px_rgba(190,255,0,0.15)] flex items-center justify-center shrink-0">
                                                        <User size={24} />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <h4 className="font-black text-white uppercase tracking-wider text-sm sm:text-base lg:text-lg truncate">
                                                            PERSONAL MANAGEMENT
                                                        </h4>
                                                    </div>
                                                </div>
                                                <div className="lg:hidden">
                                                    <ChevronDown className={`text-[#beff00] transition-transform duration-300 ${isMobileAccordionOpen ? 'rotate-180' : ''}`} size={24} />
                                                </div>
                                            </div>
                                        </div>

                                        <AnimatePresence mode="wait">
                                            {(isMobileAccordionOpen || window.innerWidth >= 1024) && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    {!isEditing ? (
                                                        <motion.div
                                                            key="summary"
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -10 }}
                                                            className="space-y-8"
                                                        >
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Full Name</p>
                                                                    <p className="text-lg font-bold text-white">{player.name || 'Not set'}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Email Address</p>
                                                                    <p className="text-lg font-bold text-white truncate">{player.email}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Gender</p>
                                                                    <p className="text-lg font-bold text-white">{player.gender || 'Not set'}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Age</p>
                                                                    <p className="text-lg font-bold text-white">{player.age || 'Not set'}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Nationality</p>
                                                                    <p className="text-lg font-bold text-white">{player.nationality || 'Not set'}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">ID Number</p>
                                                                    <p className="text-lg font-bold text-white">{player.id_number || 'Not set'}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Phone Number</p>
                                                                    <p className="text-lg font-bold text-white">{player.contact_number || 'Not set'}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Home Club</p>
                                                                    <p className="text-lg font-bold text-white">{player.home_club || 'Not set'}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Category / Division</p>
                                                                    <p className="text-lg font-bold text-padel-green uppercase">{player.category || 'Unassigned'}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Region</p>
                                                                    <p className="text-lg font-bold text-white uppercase">{player.region || 'Not set'}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Racket Brand</p>
                                                                    <p className="text-lg font-bold text-white">{player.racket_brand || 'Not set'}</p>
                                                                </div>
                                                                {player.sponsors && (
                                                                    <div className="space-y-1 md:col-span-2 lg:col-span-3">
                                                                        <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Sponsors</p>
                                                                        <p className="text-lg font-bold text-white">{player.sponsors}</p>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {player.bio && (
                                                                <div className="space-y-2">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Biography</p>
                                                                    <p className="text-gray-400 leading-relaxed font-medium">{player.bio}</p>
                                                                </div>
                                                            )}

                                                            <div className="pt-8 border-t border-white/5">
                                                                <div className="flex flex-wrap gap-4">
                                                                    <div className="flex items-center gap-2 bg-white/[0.03] backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all">
                                                                        <Phone size={14} className="text-padel-green" />
                                                                        <span className="text-xs font-bold text-white">{player.contact_number || 'No phone'}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 bg-white/[0.03] backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all">
                                                                        <Mail size={14} className="text-padel-green" />
                                                                        <span className="text-xs font-bold text-white">{player.email}</span>
                                                                    </div>
                                                                    {player.instagram_link && (
                                                                        <a
                                                                            href={player.instagram_link.startsWith('http') ? player.instagram_link : `https://instagram.com/${player.instagram_link.replace('@', '')}`}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="flex items-center gap-2 bg-white/[0.03] backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all group"
                                                                        >
                                                                            <Instagram size={14} className="text-padel-green group-hover:scale-110 transition-transform" />
                                                                            <span className="text-xs font-bold text-white">Instagram</span>
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            </div>


                                                        </motion.div>
                                                    ) : (
                                                        <motion.form
                                                            key="form"
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -10 }}
                                                            onSubmit={handleSave}
                                                            className="space-y-8"
                                                        >
                                                            <fieldset className="space-y-8">
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                    <div className="space-y-2">
                                                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Full Name</label>
                                                                        <div className="relative">
                                                                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75" size={18} />
                                                                            <input
                                                                                type="text"
                                                                                value={formData.name}
                                                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700"
                                                                                placeholder="Enter full name"
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-2">
                                                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Email Address</label>
                                                                        <div className="relative">
                                                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75" size={18} />
                                                                            <input
                                                                                type="email"
                                                                                value={formData.email}
                                                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700"
                                                                                placeholder="Email Address"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                    <div className="space-y-2">
                                                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Gender</label>
                                                                        <div className="relative">
                                                                            <select
                                                                                value={formData.gender}
                                                                                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold appearance-none cursor-pointer"
                                                                            >
                                                                                <option value="" disabled>Select Gender</option>
                                                                                <option value="Male">Male</option>
                                                                                <option value="Female">Female</option>
                                                                            </select>
                                                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-padel-green/75 pointer-events-none" size={18} />
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-2">
                                                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Age</label>
                                                                        <div className="relative">
                                                                            <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75" size={18} />
                                                                            <input
                                                                                type="number"
                                                                                value={formData.age}
                                                                                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700"
                                                                                placeholder="Your Age"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                    <div className="space-y-2">
                                                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Nationality</label>
                                                                        <div className="relative">
                                                                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75" size={18} />
                                                                            <input
                                                                                type="text"
                                                                                value={formData.nationality}
                                                                                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700"
                                                                                placeholder="Nationality"
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-2">
                                                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">ID Number</label>
                                                                        <div className="relative">
                                                                            <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75" size={18} />
                                                                            <input
                                                                                type="text"
                                                                                value={formData.id_number}
                                                                                onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700"
                                                                                placeholder="ID Number"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                    <div className="space-y-2">
                                                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Phone Number</label>
                                                                        <div className="relative">
                                                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75" size={18} />
                                                                            <input
                                                                                type="tel"
                                                                                value={formData.contact_number}
                                                                                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700"
                                                                                placeholder="Phone Number"
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-2">
                                                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Home Club</label>
                                                                        <SearchableSelect
                                                                            options={[...clubs.map(club => ({ label: club.name, value: club.id })), { label: "Other (Type your own)", value: "Other" }]}
                                                                            value={formData.club_id}
                                                                            onChange={(e) => setFormData({ ...formData, club_id: e.target.value, home_club: e.target.value !== 'Other' ? clubs.find(c => c.id === e.target.value)?.name || '' : formData.home_club })}
                                                                            placeholder="Select Home Club"
                                                                            icon={Trophy}
                                                                        />
                                                                        {formData.club_id === 'Other' && (
                                                                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder="Please specify your club name"
                                                                                    value={formData.custom_club}
                                                                                    onChange={(e) => setFormData({ ...formData, custom_club: e.target.value })}
                                                                                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-padel-green transition-all text-xs"
                                                                                    required
                                                                                />
                                                                            </motion.div>
                                                                        )}
                                                                    </div>

                                                                    <div className="space-y-2">
                                                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Instagram Link / Handle</label>
                                                                        <div className="relative">
                                                                            <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75" size={18} />
                                                                            <input
                                                                                type="text"
                                                                                value={formData.instagram_link}
                                                                                onChange={(e) => setFormData({ ...formData, instagram_link: e.target.value })}
                                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700"
                                                                                placeholder="@username or full URL"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <label className="text-[10px] font-black text-padel-green uppercase tracking-[0.2em] ml-2">Region</label>
                                                                        <div className="relative">
                                                                            <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 text-padel-green/75" size={20} />
                                                                            <select
                                                                                value={formData.region}
                                                                                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl pl-16 pr-6 py-5 text-white focus:border-padel-green outline-none hover:border-white/20 transition-all font-bold appearance-none cursor-pointer"
                                                                            >
                                                                                <option value="" disabled>Select Region</option>
                                                                                <option value="Eastern Cape">Eastern Cape</option>
                                                                                <option value="Free State">Free State</option>
                                                                                <option value="Gauteng">Gauteng</option>
                                                                                <option value="KwaZulu-Natal">KwaZulu-Natal</option>
                                                                                <option value="Limpopo">Limpopo</option>
                                                                                <option value="Mpumalanga">Mpumalanga</option>
                                                                                <option value="Northern Cape">Northern Cape</option>
                                                                                <option value="North West">North West</option>
                                                                                <option value="Western Cape">Western Cape</option>
                                                                            </select>
                                                                            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-padel-green/75 pointer-events-none" size={20} />
                                                                        </div>
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <label className="text-[10px] font-black text-padel-green uppercase tracking-[0.2em] ml-2">Racket Brand</label>
                                                                        <div className="relative space-y-3">
                                                                            <select
                                                                                value={['Adidas', 'Babolat', 'Bull Padel', 'Nox', 'Varlion', 'Oxdog', 'Wilson', 'Head', 'Siux'].includes(formData.racket_brand) ? formData.racket_brand : (formData.racket_brand ? 'Other' : '')}
                                                                                onChange={(e) => {
                                                                                    const val = e.target.value;
                                                                                    if (val === 'Other') {
                                                                                        setFormData({ ...formData, racket_brand: 'Other' });
                                                                                    } else {
                                                                                        setFormData({ ...formData, racket_brand: val });
                                                                                    }
                                                                                }}
                                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl px-6 py-5 text-white focus:border-padel-green outline-none hover:border-white/20 transition-all font-bold appearance-none cursor-pointer"
                                                                            >
                                                                                <option value="" disabled>Select Brand</option>
                                                                                <option value="Adidas">Adidas</option>
                                                                                <option value="Babolat">Babolat</option>
                                                                                <option value="Bull Padel">Bull Padel</option>
                                                                                <option value="Nox">Nox</option>
                                                                                <option value="Varlion">Varlion</option>
                                                                                <option value="Oxdog">Oxdog</option>
                                                                                <option value="Wilson">Wilson</option>
                                                                                <option value="Head">Head</option>
                                                                                <option value="Siux">Siux</option>
                                                                                <option value="Other">Other</option>
                                                                            </select>
                                                                            <ChevronDown className="absolute right-6 top-6 text-padel-green/75 pointer-events-none" size={20} />

                                                                            {(formData.racket_brand === 'Other' || (!['Adidas', 'Babolat', 'Bull Padel', 'Nox', 'Varlion', 'Oxdog', 'Wilson', 'Head', 'Siux', ''].includes(formData.racket_brand))) && (
                                                                                <input
                                                                                    type="text"
                                                                                    value={formData.racket_brand === 'Other' ? '' : formData.racket_brand}
                                                                                    onChange={(e) => setFormData({ ...formData, racket_brand: e.target.value })}
                                                                                    placeholder="Specify your brand"
                                                                                    className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-padel-green outline-none hover:border-white/20 transition-all font-bold"
                                                                                    required
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-2">
                                                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Player Biography</label>
                                                                    <div className="relative">
                                                                        <Briefcase className="absolute left-4 top-6 text-padel-green/75" size={18} />
                                                                        <textarea
                                                                            value={formData.bio}
                                                                            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700 min-h-[120px]"
                                                                            placeholder="Tell us about your padel journey..."
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="md:col-span-2 space-y-2">
                                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] ml-2">Sponsors (comma separated)</label>
                                                                    <div className="relative">
                                                                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
                                                                        <input
                                                                            type="text"
                                                                            value={formData.sponsors}
                                                                            onChange={(e) => setFormData({ ...formData, sponsors: e.target.value })}
                                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700"
                                                                            placeholder="Babolat, Nike, Red Bull, etc."
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] ml-2">Category / Division</label>
                                                                    <div className="relative">
                                                                        <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
                                                                        <select
                                                                            value={formData.category}
                                                                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl pl-12 pr-10 py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold appearance-none cursor-pointer"
                                                                        >
                                                                            <option value="" disabled>Select Category</option>
                                                                            <optgroup label="Men's" className="bg-[#0F172A]">
                                                                                <option value="Men's Open (Pro/Elite)">Men's Open (Pro/Elite)</option>
                                                                                <option value="Men's Advanced">Men's Advanced</option>
                                                                                <option value="Men's Intermediate">Men's Intermediate</option>
                                                                            </optgroup>
                                                                            <optgroup label="Ladies" className="bg-[#0F172A]">
                                                                                <option value="Ladies Open (Pro/Elite)">Ladies Open (Pro/Elite)</option>
                                                                                <option value="Ladies Advanced">Ladies Advanced</option>
                                                                                <option value="Ladies Intermediate">Ladies Intermediate</option>
                                                                            </optgroup>
                                                                        </select>
                                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-600">
                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                            </svg>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                                                                    <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest leading-loose">
                                                                        By saving, you agree to updated profile data <br />
                                                                        being displayed on public community leaderboards.
                                                                    </p>
                                                                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setIsEditing(false)}
                                                                            className="w-full sm:w-auto bg-white/5 text-white font-black uppercase tracking-widest px-10 py-5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all font-bold"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                        <button
                                                                            type="submit"
                                                                            disabled={saving}
                                                                            className="w-full sm:w-auto bg-padel-green text-black font-black uppercase tracking-widest px-10 py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-white hover:scale-105 transition-all shadow-xl shadow-padel-green/10 disabled:opacity-50 group active:scale-95 whitespace-nowrap"
                                                                        >
                                                                            <Save size={20} className="group-hover:rotate-12 transition-transform" />
                                                                            {saving ? 'Syncing...' : 'Save Profile'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </fieldset>
                                                        </motion.form>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )}

                                {/* Payment Transactions Section */}
                                {activeTab === 'rankings' && (
                                    <motion.div
                                        key="rankings"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.2 }}
                                        onClick={() => {
                                            if (window.innerWidth < 1024 && !isMobileAccordionOpen) {
                                                setIsMobileAccordionOpen(true);
                                            }
                                        }}
                                        className={`bg-neutral-950/35 backdrop-blur-2xl border-t border-yellow-500/25 border-x border-yellow-500/15 border-b border-yellow-500/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85),0_0_40px_rgba(234,179,8,0.08)] rounded-[2.5rem] ${isMobileAccordionOpen ? 'p-8 lg:p-12' : 'py-5 px-6 lg:p-8 cursor-pointer lg:cursor-default'} relative overflow-hidden`}
                                    >
                                        <motion.div
                                            animate={{ scale: [1, 1.15, 0.9, 1], x: [0, 20, -15, 0], y: [0, -15, 10, 0] }}
                                            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute -top-20 left-10 w-72 h-72 rounded-full bg-yellow-500/10 blur-[90px] pointer-events-none"
                                        />
                                        <motion.div
                                            animate={{ scale: [1, 0.9, 1.1, 1], x: [0, -15, 20, 0], y: [0, 15, -10, 0] }}
                                            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute -bottom-20 right-10 w-72 h-72 rounded-full bg-yellow-500/10 blur-[90px] pointer-events-none"
                                        />

                                        <div
                                            onClick={(e) => {
                                                if (window.innerWidth < 1024) {
                                                    e.stopPropagation();
                                                    setIsMobileAccordionOpen(!isMobileAccordionOpen);
                                                }
                                            }}
                                            className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer lg:cursor-default relative z-10 ${isMobileAccordionOpen ? 'mb-4 lg:mb-8' : 'mb-0'}`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.15)] flex items-center justify-center shrink-0">
                                                        <TrendingUp size={24} />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <h4 className="font-black text-white uppercase tracking-wider text-sm sm:text-base lg:text-lg truncate">
                                                            RANKINGS POINTS BREAKDOWN
                                                        </h4>
                                                    </div>
                                                </div>
                                                <div className="lg:hidden">
                                                    <ChevronDown className={`text-yellow-500 transition-transform duration-300 ${isMobileAccordionOpen ? 'rotate-180' : ''}`} size={24} />
                                                </div>
                                            </div>
                                        </div>

                                        <AnimatePresence mode="wait">
                                            {(isMobileAccordionOpen || window.innerWidth >= 1024) && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden space-y-6 pt-6"
                                                >
                                                    {/* Small ranking list select pills */}
                                                    {player.rankings && player.rankings.length > 0 && (
                                                        <div className="relative z-10 flex flex-wrap gap-1.5 bg-white/[0.03] backdrop-blur-md p-1 rounded-xl w-fit border border-white/10">
                                                            {player.rankings.map((r, i) => {
                                                                const isSelected = selectedRankingForBreakdown?.org === r.org && selectedRankingForBreakdown?.age_group === r.age_group && selectedRankingForBreakdown?.match_type === r.match_type;
                                                                return (
                                                                    <button
                                                                        key={i}
                                                                        onClick={() => setSelectedRankingForBreakdown(r)}
                                                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${isSelected
                                                                            ? 'bg-padel-green text-black font-extrabold shadow-lg shadow-padel-green/20'
                                                                            : 'text-gray-400 hover:text-white hover:bg-white/[0.08]'
                                                                            }`}
                                                                    >
                                                                        {(r.org || 'SAPA').split(' ')[0]} ({r.age_group || 'Open'})
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {selectedRankingForBreakdown ? (
                                                        <div className="relative z-10 space-y-6">
                                                            {/* Header Stats */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                                <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-4 text-center hover:bg-white/[0.06] transition-all duration-300">
                                                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Current Standing</p>
                                                                    <p className="text-2xl font-black text-padel-green">#{selectedRankingForBreakdown.rank}</p>
                                                                </div>
                                                                <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-4 text-center hover:bg-white/[0.06] transition-all duration-300">
                                                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Total Points</p>
                                                                    <p className="text-2xl font-black text-white">{selectedRankingForBreakdown.points}</p>
                                                                </div>
                                                                <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-4 text-center hover:bg-white/[0.06] transition-all duration-300">
                                                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Match Type</p>
                                                                    <p className="text-xs font-bold text-gray-300 uppercase mt-2">{selectedRankingForBreakdown.match_type}</p>
                                                                </div>
                                                            </div>

                                                            {/* Desktop Table View */}
                                                            <div className="hidden md:block bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
                                                                <div className="overflow-x-auto">
                                                                    <table className="w-full text-left border-collapse">
                                                                        <thead>
                                                                            <tr className="bg-white/[0.05] border-b border-white/10">
                                                                                <th className="py-4 px-6 font-black text-[9px] text-gray-400 uppercase tracking-wider">Date</th>
                                                                                <th className="py-4 px-6 font-black text-[9px] text-gray-400 uppercase tracking-wider">Tournament Name | Class</th>
                                                                                <th className="py-4 px-6 font-black text-[9px] text-gray-400 uppercase tracking-wider text-center">Standing</th>
                                                                                <th className="py-4 px-6 font-black text-[9px] text-gray-400 uppercase tracking-wider">Type</th>
                                                                                <th className="py-4 px-6 font-black text-[9px] text-gray-400 uppercase tracking-wider text-right">Points</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {selectedRankingForBreakdown.details && selectedRankingForBreakdown.details.length > 0 ? (
                                                                                selectedRankingForBreakdown.details.map((item, idx) => (
                                                                                    <tr key={idx} className="border-b border-white/10 hover:bg-white/[0.05] transition-colors">
                                                                                        <td className="py-4 px-6 text-xs text-gray-400 font-medium whitespace-nowrap">{item.date}</td>
                                                                                        <td className="py-4 px-6">
                                                                                            <div className="font-bold text-xs text-white">{item.name}</div>
                                                                                            {item.class && <div className="text-[9px] text-padel-green font-bold uppercase mt-0.5">{item.class}</div>}
                                                                                        </td>
                                                                                        <td className="py-4 px-6 text-xs font-black text-center text-white">{item.place}</td>
                                                                                        <td className="py-4 px-6">
                                                                                            <span className="inline-block px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-[9px] font-black text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                                                                                {item.event_type}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="py-4 px-6 text-xs font-black text-right text-padel-green whitespace-nowrap">+{item.points}</td>
                                                                                    </tr>
                                                                                ))
                                                                            ) : (
                                                                                <tr>
                                                                                    <td colSpan="5" className="py-12 text-center text-xs text-gray-500 font-bold uppercase tracking-wider">
                                                                                        No tournaments counted yet or detailed breakdown pending sync.
                                                                                    </td>
                                                                                </tr>
                                                                            )}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>

                                                            {/* Mobile Card list */}
                                                            <div className="block md:hidden space-y-3">
                                                                {selectedRankingForBreakdown.details && selectedRankingForBreakdown.details.length > 0 ? (
                                                                    selectedRankingForBreakdown.details.map((item, idx) => (
                                                                        <div key={idx} className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-4 space-y-3 hover:bg-white/[0.06] transition-all duration-300">
                                                                            <div className="flex justify-between items-start gap-2">
                                                                                <div className="min-w-0">
                                                                                    <h5 className="font-bold text-xs text-white uppercase tracking-tight">{item.name}</h5>
                                                                                    {item.class && <p className="text-[9px] text-padel-green font-black uppercase mt-0.5">{item.class}</p>}
                                                                                </div>
                                                                                <div className="text-right shrink-0">
                                                                                    <span className="text-xs font-black text-padel-green">+{item.points} PTS</span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex justify-between items-center text-[9px] text-gray-400 font-bold uppercase tracking-wider pt-2.5 border-t border-white/10">
                                                                                <div>{item.date}</div>
                                                                                <div className="flex gap-2">
                                                                                    <span>Standing: {item.place}</span>
                                                                                    <span>•</span>
                                                                                    <span className="text-gray-500">{item.event_type}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <div className="text-center py-8 text-xs text-gray-500 font-bold uppercase tracking-wider bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl">
                                                                        No tournaments counted yet or detailed breakdown pending sync.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="relative z-10 py-12 text-center text-xs text-gray-500 font-bold uppercase tracking-wider">
                                                            No rankings details available.
                                                        </div>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )}

                                {activeTab === 'payments' && (
                                    <motion.div
                                        key="payments"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.2 }}
                                        onClick={() => {
                                            if (window.innerWidth < 1024 && !isMobileAccordionOpen) {
                                                setIsMobileAccordionOpen(true);
                                            }
                                        }}
                                        className={`bg-neutral-950/35 backdrop-blur-2xl border-t border-blue-500/25 border-x border-blue-500/15 border-b border-blue-500/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85),0_0_40px_rgba(59,130,246,0.08)] rounded-[2.5rem] ${isMobileAccordionOpen ? 'p-8 lg:p-12' : 'py-5 px-6 lg:p-8 cursor-pointer lg:cursor-default'} relative overflow-hidden`}
                                    >
                                        <motion.div
                                            animate={{ scale: [1, 1.15, 0.9, 1], x: [0, 20, -15, 0], y: [0, -15, 10, 0] }}
                                            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute -top-20 left-10 w-72 h-72 rounded-full bg-blue-500/10 blur-[90px] pointer-events-none"
                                        />
                                        <motion.div
                                            animate={{ scale: [1, 0.9, 1.1, 1], x: [0, -15, 20, 0], y: [0, 15, -10, 0] }}
                                            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute -bottom-20 right-10 w-72 h-72 rounded-full bg-blue-500/10 blur-[90px] pointer-events-none"
                                        />

                                        <div
                                            onClick={(e) => {
                                                if (window.innerWidth < 1024) {
                                                    e.stopPropagation();
                                                    setIsMobileAccordionOpen(!isMobileAccordionOpen);
                                                }
                                            }}
                                            className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer lg:cursor-default relative z-10 ${isMobileAccordionOpen ? 'mb-10' : 'mb-0'}`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)] flex items-center justify-center shrink-0">
                                                        <CreditCard size={24} />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <h4 className="font-black text-white uppercase tracking-wider text-sm sm:text-base lg:text-lg truncate">
                                                            PAYMENT TRANSACTIONS
                                                        </h4>
                                                    </div>
                                                </div>
                                                <div className="lg:hidden">
                                                    <ChevronDown className={`text-blue-400 transition-transform duration-300 ${isMobileAccordionOpen ? 'rotate-180' : ''}`} size={24} />
                                                </div>
                                            </div>
                                        </div>

                                        <AnimatePresence mode="wait">
                                            {(isMobileAccordionOpen || window.innerWidth >= 1024) && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden pt-6"
                                                >
                                                    {transactionsLoading ? (
                                                        <div className="flex flex-col items-center justify-center py-12">
                                                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                                                            <p className="text-gray-500 text-xs font-black uppercase tracking-widest">Fetching payment history...</p>
                                                        </div>
                                                    ) : transactions.length === 0 ? (
                                                        <div className="bg-white/[0.03] backdrop-blur-md rounded-3xl p-12 text-center border border-white/10">
                                                            <AlertCircle className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                                                            <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">No transactions found</p>
                                                            <p className="text-gray-600 text-xs mt-2">Payments are processed securely via Paystack</p>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-4">
                                                            <div className="hidden md:grid grid-cols-5 gap-4 px-6 py-4 bg-white/[0.03] border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-500">
                                                                <div>Reference</div>
                                                                <div>Date</div>
                                                                <div>Type</div>
                                                                <div>Amount</div>
                                                                <div className="text-right">Status</div>
                                                            </div>

                                                            {currentTransactionsList.map((trx) => (
                                                                <div key={trx.id} className="group bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-6 transition-all duration-300 flex flex-col md:grid md:grid-cols-5 md:items-center gap-4 hover:bg-white/[0.08] hover:border-white/20">
                                                                    <div className="flex flex-col text-sm border-b md:border-none border-white/10 pb-2 md:pb-0">
                                                                        <span className="md:hidden text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Reference</span>
                                                                        <span className="font-mono text-gray-400">{trx.id}</span>
                                                                    </div>
                                                                    <div className="flex flex-col text-sm">
                                                                        <span className="md:hidden text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Date</span>
                                                                        <span className="text-gray-200">{trx.date}</span>
                                                                    </div>
                                                                    <div className="flex flex-col text-sm">
                                                                        <span className="md:hidden text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Type</span>
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span className="text-white font-black uppercase text-[10px] tracking-tight">
                                                                                {trx.payment_type?.replace('_', ' ') || 'Payment'}
                                                                            </span>
                                                                            {trx.event_name && (
                                                                                <span className="text-[10px] text-padel-green font-bold">
                                                                                    {trx.event_name}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col text-sm">
                                                                        <span className="md:hidden text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Amount</span>
                                                                        <span className="text-white font-black">{trx.amount}</span>
                                                                    </div>
                                                                    <div className="flex flex-col items-start md:items-end">
                                                                        <span className="md:hidden text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Status</span>
                                                                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${trx.status?.toLowerCase() === 'success'
                                                                            ? 'bg-padel-green text-black'
                                                                            : trx.status?.toLowerCase() === 'failed'
                                                                                ? 'bg-red-500/20 text-red-500 border border-red-500/20'
                                                                                : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/20'
                                                                            }`}>
                                                                            {trx.status}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ))}

                                                            {transactions.length > transactionsPerPage && (
                                                                <div className="flex justify-between items-center mt-8 px-2">
                                                                    <span className="text-gray-500 text-[10px] font-black uppercase tracking-widest">
                                                                        Page {currentTransactionPage} of {totalTransactionPages}
                                                                    </span>
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={() => setCurrentTransactionPage(prev => Math.max(prev - 1, 1))}
                                                                            disabled={currentTransactionPage === 1}
                                                                            className="px-4 py-2 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-xl"
                                                                        >
                                                                            Prev
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setCurrentTransactionPage(prev => Math.min(prev + 1, totalTransactionPages))}
                                                                            disabled={currentTransactionPage === totalTransactionPages}
                                                                            className="px-4 py-2 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-xl"
                                                                        >
                                                                            Next
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em] text-center pt-8">
                                                                Only your 50 most recent transactions are displayed.
                                                            </p>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )}


                                {activeTab === 'events' && (
                                    <motion.div
                                        key="events"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.2 }}
                                        onClick={() => {
                                            if (window.innerWidth < 1024 && !isMobileAccordionOpen) {
                                                setIsMobileAccordionOpen(true);
                                            }
                                        }}
                                        className={`bg-neutral-950/35 backdrop-blur-2xl border-t border-purple-500/25 border-x border-purple-500/15 border-b border-purple-500/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85),0_0_40px_rgba(168,85,247,0.08)] rounded-[2.5rem] ${isMobileAccordionOpen ? 'p-8 lg:p-12' : 'py-5 px-6 lg:p-8 cursor-pointer lg:cursor-default'} relative overflow-hidden`}
                                    >
                                        <motion.div
                                            animate={{ scale: [1, 1.15, 0.9, 1], x: [0, 20, -15, 0], y: [0, -15, 10, 0] }}
                                            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute -top-20 left-10 w-72 h-72 rounded-full bg-purple-500/10 blur-[90px] pointer-events-none"
                                        />
                                        <motion.div
                                            animate={{ scale: [1, 0.9, 1.1, 1], x: [0, -15, 20, 0], y: [0, 15, -10, 0] }}
                                            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute -bottom-20 right-10 w-72 h-72 rounded-full bg-purple-500/10 blur-[90px] pointer-events-none"
                                        />

                                        <div className="relative z-10">
                                            <div
                                                onClick={(e) => {
                                                    if (window.innerWidth < 1024) {
                                                        e.stopPropagation();
                                                        setIsMobileAccordionOpen(!isMobileAccordionOpen);
                                                    }
                                                }}
                                                className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer lg:cursor-default ${isMobileAccordionOpen ? 'mb-4 lg:mb-8' : 'mb-0'}`}
                                            >
                                                <div className="flex items-center justify-between w-full">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)] flex items-center justify-center shrink-0">
                                                            <CalendarIcon size={24} />
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <h4 className="font-black text-white uppercase tracking-wider text-sm sm:text-base lg:text-lg truncate">
                                                                {currentTab === 'upcoming' ? 'MY UPCOMING EVENTS' : currentTab === 'pending' ? 'MY PENDING PAYMENTS' : 'MY PAST EVENTS'}
                                                            </h4>
                                                        </div>
                                                    </div>
                                                    <div className="lg:hidden">
                                                        <ChevronDown className={`text-purple-400 transition-transform duration-300 ${isMobileAccordionOpen ? 'rotate-180' : ''}`} size={24} />
                                                    </div>
                                                </div>
                                            </div>

                                            <AnimatePresence mode="wait">
                                                {(isMobileAccordionOpen || window.innerWidth >= 1024) && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden pt-6"
                                                    >
                                                        {/* Switcher for Upcoming vs Past Events */}
                                                        <div className="flex gap-2 sm:gap-3 md:gap-4 mb-6 border-b border-white/10 pb-4 flex-wrap">
                                                            {pendingPaymentEvents.length > 0 && (
                                                                <button
                                                                    onClick={() => setEventViewTab('pending')}
                                                                    className={`md:px-5 md:py-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentTab === 'pending'
                                                                        ? 'bg-amber-500 border border-amber-500 text-black shadow-lg shadow-amber-500/20'
                                                                        : 'bg-white/[0.03] text-amber-500 hover:bg-white/[0.08] hover:text-amber-400 border border-amber-500/20 hover:border-amber-500/30'
                                                                        }`}
                                                                >
                                                                    Pending Payments ({pendingPaymentEvents.length})
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => setEventViewTab('upcoming')}
                                                                className={`md:px-5 md:py-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentTab === 'upcoming'
                                                                    ? 'bg-purple-500 border border-purple-500 text-white shadow-lg shadow-purple-500/20'
                                                                    : 'bg-white/[0.03] text-gray-400 hover:bg-white/[0.08] hover:text-white border border-white/10 hover:border-white/20'
                                                                    }`}
                                                            >
                                                                Upcoming ({upcomingEvents.length})
                                                            </button>
                                                            <button
                                                                onClick={() => setEventViewTab('past')}
                                                                className={`md:px-5 md:py-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentTab === 'past'
                                                                    ? 'bg-purple-500 border border-purple-500 text-white shadow-lg shadow-purple-500/20'
                                                                    : 'bg-white/[0.03] text-gray-400 hover:bg-white/[0.08] hover:text-white border border-white/10 hover:border-white/20'
                                                                    }`}
                                                            >
                                                                Complete ({pastEvents.length})
                                                            </button>
                                                        </div>

                                                        {loadingEvents ? (
                                                            <div className="flex items-center justify-center py-12">
                                                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-padel-green"></div>
                                                            </div>
                                                        ) : filteredEvents && filteredEvents.length > 0 ? (
                                                            <div className={currentTab === 'past' && pastEvents.length > 6 ? "max-h-[580px] overflow-y-auto pr-3 custom-scrollbar" : ""}>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                    {filteredEvents.map((event) => {
                                                                        let hoverBorder = 'hover:border-padel-green/50';
                                                                        let glowColor = 'bg-padel-green/10';
                                                                        let textColor = 'group-hover:text-padel-green';

                                                                        if (event.sapa_status === 'Major') {
                                                                            hoverBorder = 'hover:border-red-500/50';
                                                                            glowColor = 'bg-red-500/10';
                                                                            textColor = 'group-hover:text-red-400';
                                                                        } else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') {
                                                                            hoverBorder = 'hover:border-amber-500/50';
                                                                            glowColor = 'bg-amber-500/10';
                                                                            textColor = 'group-hover:text-amber-400';
                                                                        } else if (event.sapa_status === 'Gold') {
                                                                            hoverBorder = 'hover:border-yellow-500/50';
                                                                            glowColor = 'bg-yellow-500/10';
                                                                            textColor = 'group-hover:text-yellow-400';
                                                                        } else if (event.sapa_status === 'Silver') {
                                                                            hoverBorder = 'hover:border-gray-400/50';
                                                                            glowColor = 'bg-gray-400/10';
                                                                            textColor = 'group-hover:text-gray-300';
                                                                        } else if (event.sapa_status === 'Bronze') {
                                                                            hoverBorder = 'hover:border-orange-700/50';
                                                                            glowColor = 'bg-orange-700/10';
                                                                            textColor = 'group-hover:text-orange-400';
                                                                        } else if (event.sapa_status === 'FIP event') {
                                                                            hoverBorder = 'hover:border-blue-500/50';
                                                                            glowColor = 'bg-blue-500/10';
                                                                            textColor = 'group-hover:text-blue-400';
                                                                        }

                                                                        const hasPending = pendingPayments?.some(p => p.id === event.db_id);
                                                                        const showPendingRibbon = currentTab !== 'past' && event.isPaid && hasPending;
                                                                        const needsPayment = currentTab !== 'past' && event.db_id && (hasPending || (!event.isPaid && (event.entry_fee > 0 || (event.category_fees && Object.keys(event.category_fees).length > 0))));

                                                                        return (
                                                                            <div key={event.id} className={`bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-6 ${hoverBorder} hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 group relative overflow-hidden flex flex-col justify-between`}>
                                                                                <div className={`absolute top-0 right-0 w-32 h-32 ${glowColor} rounded-full blur-3xl -mr-16 -mt-16 group-hover:opacity-100 opacity-50 transition-all`} />

                                                                                {showPendingRibbon ? (
                                                                                    <div className="absolute top-0 right-0 w-20 h-20 overflow-hidden z-20 pointer-events-none rounded-tr-2xl">
                                                                                        <div className="absolute top-0 right-0 translate-x-[30%] translate-y-[20%] rotate-45 bg-amber-500 text-black text-[7.5px] font-black uppercase tracking-wider py-1 w-[140%] text-center shadow-lg flex items-center justify-center gap-1">
                                                                                            <AlertCircle size={8} strokeWidth={4} />
                                                                                            PENDING
                                                                                        </div>
                                                                                    </div>
                                                                                ) : event.isPaid ? (
                                                                                    <div className="absolute top-0 right-0 w-20 h-20 overflow-hidden z-20 pointer-events-none rounded-tr-2xl">
                                                                                        <div className="absolute top-0 right-0 translate-x-[30%] translate-y-[20%] rotate-45 bg-[#ccff00] text-black text-[8px] font-black uppercase tracking-widest py-1 w-[140%] text-center shadow-lg flex items-center justify-center gap-1">
                                                                                            <CheckCircle2 size={8} strokeWidth={4} />
                                                                                            PAID
                                                                                        </div>
                                                                                    </div>
                                                                                ) : null}

                                                                                <div className="relative z-10 flex-1">
                                                                                    <div className="flex justify-between items-start mb-4">
                                                                                        <div className="flex flex-col">
                                                                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">Date</span>
                                                                                            <span className="text-xs font-bold text-white">
                                                                                                {new Date(event.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                                            </span>
                                                                                        </div>
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                if (event.slug || event.db_id) {
                                                                                                    navigate(`/calendar/${event.slug || event.db_id}`);
                                                                                                } else {
                                                                                                    window.open(`https://www.rankedin.com/en/tournament/${event.id}`, '_blank');
                                                                                                }
                                                                                            }}
                                                                                            className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all hover:bg-padel-green/20 hover:border-padel-green/30 group/btn"
                                                                                        >
                                                                                            <ExternalLink size={14} className="group-hover/btn:scale-110 transition-transform" />
                                                                                        </button>
                                                                                    </div>

                                                                                    <h4 className={`text-lg font-black text-white mb-4 line-clamp-2 uppercase tracking-tight ${textColor} transition-colors`}>
                                                                                        {event.event_name}
                                                                                    </h4>

                                                                                    {needsPayment && (
                                                                                        <motion.button
                                                                                            whileHover={{ scale: 1.02 }}
                                                                                            whileTap={{ scale: 0.98 }}
                                                                                            onClick={() => {
                                                                                                navigate(`/calendar/${event.slug || event.db_id}?register=true`);
                                                                                            }}
                                                                                            className="w-full bg-padel-green text-black font-black uppercase tracking-widest text-[10px] py-3 rounded-xl hover:bg-white transition-all shadow-lg shadow-padel-green/20 flex items-center justify-center gap-2 mt-2 group/pay"
                                                                                        >
                                                                                            <CreditCard size={14} className="group-hover/pay:rotate-12 transition-transform" />
                                                                                            Pay Event Fee
                                                                                        </motion.button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center py-16 bg-white/[0.03] backdrop-blur-md rounded-3xl border border-white/10 relative overflow-hidden">
                                                                <div className="absolute inset-0 bg-gradient-to-br from-padel-green/5 to-transparent opacity-50" />
                                                                <div className="relative z-10">
                                                                    <CalendarIcon className="w-12 h-12 text-white/5 mx-auto mb-4" />
                                                                    <p className="text-gray-500 font-black uppercase tracking-[0.2em] text-[10px]">
                                                                        {currentTab === 'upcoming' ? 'No upcoming events listed' : currentTab === 'pending' ? 'No pending payments listed' : 'No past events listed'}
                                                                    </p>
                                                                    <p className="text-gray-600 text-[9px] mt-2 font-bold uppercase tracking-widest">Connect your Rankedin profile to see your schedule</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'matches' && (
                                    <motion.div
                                        key="matches"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.2 }}
                                        onClick={() => {
                                            if (window.innerWidth < 1024 && !isMobileAccordionOpen) {
                                                setIsMobileAccordionOpen(true);
                                            }
                                        }}
                                        className={`bg-neutral-950/35 backdrop-blur-2xl border-t border-orange-500/25 border-x border-orange-500/15 border-b border-orange-500/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85),0_0_40px_rgba(249,115,22,0.08)] rounded-[2.5rem] ${isMobileAccordionOpen ? 'p-8 lg:p-12' : 'py-5 px-6 lg:p-8 cursor-pointer lg:cursor-default'} relative overflow-hidden`}
                                    >
                                        <motion.div
                                            animate={{ scale: [1, 1.15, 0.9, 1], x: [0, 20, -15, 0], y: [0, -15, 10, 0] }}
                                            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute -top-20 left-10 w-72 h-72 rounded-full bg-orange-500/10 blur-[90px] pointer-events-none"
                                        />
                                        <motion.div
                                            animate={{ scale: [1, 0.9, 1.1, 1], x: [0, -15, 20, 0], y: [0, 15, -10, 0] }}
                                            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute -bottom-20 right-10 w-72 h-72 rounded-full bg-orange-500/10 blur-[90px] pointer-events-none"
                                        />

                                        <div className="relative z-10">
                                            <div
                                                onClick={(e) => {
                                                    if (window.innerWidth < 1024) {
                                                        e.stopPropagation();
                                                        setIsMobileAccordionOpen(!isMobileAccordionOpen);
                                                    }
                                                }}
                                                className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer lg:cursor-default ${isMobileAccordionOpen ? 'mb-4 lg:mb-8' : 'mb-0'}`}
                                            >
                                                <div className="flex items-center justify-between w-full">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.15)] flex items-center justify-center shrink-0">
                                                            <Trophy size={24} />
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <h4 className="font-black text-white uppercase tracking-wider text-sm sm:text-base lg:text-lg truncate">
                                                                {matchViewTab === 'upcoming' ? 'MY UPCOMING MATCHES' : 'MY PAST MATCHES'}
                                                            </h4>
                                                        </div>
                                                    </div>
                                                    <div className="lg:hidden">
                                                        <ChevronDown className={`text-orange-500 transition-transform duration-300 ${isMobileAccordionOpen ? 'rotate-180' : ''}`} size={24} />
                                                    </div>
                                                </div>
                                            </div>

                                            <AnimatePresence mode="wait">
                                                {(isMobileAccordionOpen || window.innerWidth >= 1024) && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden pt-6"
                                                    >
                                                        {loadingMatches ? (
                                                            <div className="flex items-center justify-center py-12">
                                                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {/* Switcher for Upcoming vs Past Matches */}
                                                                <div className="flex gap-2 sm:gap-3 md:gap-4 mb-6 border-b border-white/10 pb-4">
                                                                    <button
                                                                        onClick={() => { setMatchViewTab('upcoming'); setCurrentMatchPage(1); }}
                                                                        className={`md:px-5 md:py-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${matchViewTab === 'upcoming'
                                                                            ? 'bg-orange-500 border border-orange-500 text-white shadow-lg shadow-orange-500/20'
                                                                            : 'bg-white/[0.03] text-gray-400 hover:bg-white/[0.08] hover:text-white border border-white/10 hover:border-white/20'
                                                                            }`}
                                                                    >
                                                                        Upcoming ({matchHistory.upcoming.length})
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setMatchViewTab('past'); setCurrentMatchPage(1); }}
                                                                        className={`md:px-5 md:py-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${matchViewTab === 'past'
                                                                            ? 'bg-orange-500 border border-orange-500 text-white shadow-lg shadow-orange-500/20'
                                                                            : 'bg-white/[0.03] text-gray-400 hover:bg-white/[0.08] hover:text-white border border-white/10 hover:border-white/20'
                                                                            }`}
                                                                    >
                                                                        Past ({matchHistory.history.length})
                                                                    </button>
                                                                </div>

                                                                {(matchViewTab === 'upcoming' ? matchHistory.upcoming : matchHistory.history).length > 0 ? (
                                                                    <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 sm:pr-4 custom-scrollbar scroll-smooth">
                                                                        {matchViewTab === 'upcoming' ? (
                                                                            matchHistory.upcoming.map((match, idx) => {
                                                                                const info = match.Info || {};
                                                                                const date = info.Date;

                                                                                return (
                                                                                    <div key={`upcoming-${idx}`} className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-6 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 group">
                                                                                        <div className="flex flex-col lg:flex-row justify-between gap-6">
                                                                                            <div className="flex-1 min-w-0">
                                                                                                <div className="flex items-center gap-3 mb-3 flex-wrap">
                                                                                                    {date && (
                                                                                                        <>
                                                                                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{date}</span>
                                                                                                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">•</span>
                                                                                                        </>
                                                                                                    )}
                                                                                                    <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest truncate max-w-[400px]">{info.EventName}</span>
                                                                                                </div>

                                                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                                                    <div className="p-3.5 rounded-xl border bg-white/[0.04] border-white/10 transition-colors duration-300 group-hover:bg-white/[0.08]">
                                                                                                        <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Team 1</p>
                                                                                                        <p className="text-sm font-bold text-white truncate">
                                                                                                            {info.Challenger?.Name || 'TBD'}
                                                                                                            {info.Challenger1?.Name && ` & ${info.Challenger1.Name}`}
                                                                                                        </p>
                                                                                                    </div>
                                                                                                    <div className="p-3.5 rounded-xl border bg-white/[0.04] border-white/10 transition-colors duration-300 group-hover:bg-white/[0.08]">
                                                                                                        <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Team 2</p>
                                                                                                        <p className="text-sm font-bold text-white truncate">
                                                                                                            {info.Challenged?.Name || 'TBD'}
                                                                                                            {info.Challenged1?.Name && ` & ${info.Challenged1.Name}`}
                                                                                                        </p>
                                                                                                    </div>
                                                                                                </div>

                                                                                                {(info.Court || info.Location || info.Venue) && (
                                                                                                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-gray-400">
                                                                                                        {(info.Location || info.Venue) && (
                                                                                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                                                                <MapPin size={12} className="text-padel-green shrink-0" />
                                                                                                                <span className="truncate max-w-[500px] uppercase tracking-wider">{info.Location || info.Venue || 'Location TBD'}</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                        {info.Court && (
                                                                                                            <div className="flex items-center gap-1.5 bg-orange-500/[0.08] text-orange-500 px-2.5 py-1 rounded-lg border border-orange-500/30 backdrop-blur-sm shadow-lg shadow-orange-500/5">
                                                                                                                <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{info.Court}</span>
                                                                                                            </div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>

                                                                                            <div className="flex flex-col items-center lg:items-end justify-center min-w-[140px] pt-4 lg:pt-0 border-t lg:border-t-0 border-white/10">
                                                                                                <div className="px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.15em] bg-orange-500/[0.08] text-orange-500 border border-orange-500/30 shadow-lg backdrop-blur-sm">
                                                                                                    Upcoming
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })
                                                                        ) : (
                                                                            <>
                                                                                {currentMatchesHistoryList.map((match, idx) => {
                                                                                    const info = match.Info || {};
                                                                                    const isWinner = info.IsWinner !== undefined
                                                                                        ? info.IsWinner
                                                                                        : info.Challenger?.IsWinner;
                                                                                    const date = info.Date;
                                                                                    const hasResult = match.Score?.Score && match.Score.Score.length > 0;

                                                                                    return (
                                                                                        <div key={`history-${idx}`} className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-6 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 group">
                                                                                            <div className="flex flex-col lg:flex-row justify-between gap-6">
                                                                                                <div className="flex-1 min-w-0">
                                                                                                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                                                                                                        {date && (
                                                                                                            <>
                                                                                                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{date}</span>
                                                                                                                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">•</span>
                                                                                                            </>
                                                                                                        )}
                                                                                                        <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest truncate max-w-[400px]">{info.EventName}</span>
                                                                                                    </div>

                                                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                                                        <div className={`p-3.5 rounded-xl border transition-colors duration-300 ${hasResult && isWinner ? 'bg-padel-green/[0.05] border-padel-green/30 ring-1 ring-padel-green/20' : 'bg-white/[0.04] border-white/10'}`}>
                                                                                                            <div className="flex justify-between items-center mb-1.5">
                                                                                                                <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Team 1</p>
                                                                                                                {hasResult && isWinner && <Trophy size={10} className="text-padel-green" />}
                                                                                                            </div>
                                                                                                            <p className="text-sm font-bold text-white truncate">
                                                                                                                {info.Challenger?.Name || 'TBD'}
                                                                                                                {info.Challenger1?.Name && ` & ${info.Challenger1.Name}`}
                                                                                                            </p>
                                                                                                        </div>
                                                                                                        <div className={`p-3.5 rounded-xl border transition-colors duration-300 ${hasResult && !isWinner ? 'bg-padel-green/[0.05] border-padel-green/30 ring-1 ring-padel-green/20' : 'bg-white/[0.04] border-white/10'}`}>
                                                                                                            <div className="flex justify-between items-center mb-1.5">
                                                                                                                <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Team 2</p>
                                                                                                                {hasResult && !isWinner && <Trophy size={10} className="text-padel-green" />}
                                                                                                            </div>
                                                                                                            <p className="text-sm font-bold text-white truncate">
                                                                                                                {info.Challenged?.Name || 'TBD'}
                                                                                                                {info.Challenged1?.Name && ` & ${info.Challenged1.Name}`}
                                                                                                            </p>
                                                                                                        </div>
                                                                                                    </div>

                                                                                                    {(info.Court || info.Location || info.Venue) && (
                                                                                                        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-gray-400">
                                                                                                            {(info.Location || info.Venue) && (
                                                                                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                                                                    <MapPin size={12} className="text-padel-green shrink-0" />
                                                                                                                    <span className="truncate max-w-[500px] uppercase tracking-wider">{info.Location || info.Venue || 'Location TBD'}</span>
                                                                                                                </div>
                                                                                                            )}
                                                                                                            {info.Court && (
                                                                                                                <div className="flex items-center gap-1.5 bg-white/[0.05] text-gray-300 px-2.5 py-1 rounded-lg border border-white/10 backdrop-blur-sm">
                                                                                                                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{info.Court}</span>
                                                                                                                </div>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>

                                                                                                <div className="flex flex-col items-center lg:items-end justify-center min-w-[140px] pt-4 lg:pt-0 border-t lg:border-t-0 border-white/10">
                                                                                                    {hasResult ? (
                                                                                                        <div className="flex flex-col items-center lg:items-end w-full gap-3">
                                                                                                            <div className="flex items-center gap-1.5">
                                                                                                                {match.Score?.Score?.map((set, sIdx) => (
                                                                                                                    <div key={sIdx} className="bg-white/[0.05] backdrop-blur-md px-2.5 py-1.5 rounded-lg text-xs font-black text-white border border-white/10 shadow-inner flex flex-col items-center min-w-[32px]">
                                                                                                                        <span className={set.Score1 > set.Score2 ? 'text-padel-green' : 'text-white/60'}>{set.Score1}</span>
                                                                                                                        <div className="w-full h-[1px] bg-white/10 my-0.5" />
                                                                                                                        <span className={set.Score2 > set.Score1 ? 'text-padel-green' : 'text-white/60'}>{set.Score2}</span>
                                                                                                                    </div>
                                                                                                                ))}
                                                                                                            </div>
                                                                                                            <div className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.15em] shadow-lg ${isWinner
                                                                                                                ? 'bg-padel-green text-black ring-1 ring-white/20'
                                                                                                                : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                                                                                                }`}>
                                                                                                                {isWinner ? 'Victory' : 'Defeat'}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    ) : (
                                                                                                        <div className="flex items-center gap-2 text-gray-500 bg-white/[0.03] backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                                                                                                            <CheckCircle2 size={12} />
                                                                                                            <span className="text-[10px] font-black uppercase tracking-widest">Played</span>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}

                                                                                {matchHistory.history.length > matchesPerPage && (
                                                                                    <div className="flex justify-between items-center mt-8 px-2">
                                                                                        <span className="text-gray-500 text-[10px] font-black uppercase tracking-widest">
                                                                                            Page {currentMatchPage} of {totalMatchPages}
                                                                                        </span>
                                                                                        <div className="flex gap-2">
                                                                                            <button
                                                                                                onClick={() => setCurrentMatchPage(prev => Math.max(prev - 1, 1))}
                                                                                                disabled={currentMatchPage === 1}
                                                                                                className="px-4 py-2 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-xl cursor-pointer"
                                                                                            >
                                                                                                Prev
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => setCurrentMatchPage(prev => Math.min(prev + 1, totalMatchPages))}
                                                                                                disabled={currentMatchPage === totalMatchPages}
                                                                                                className="px-4 py-2 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-xl cursor-pointer"
                                                                                            >
                                                                                                Next
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-center py-16 bg-white/[0.03] backdrop-blur-md rounded-3xl border border-white/10 relative overflow-hidden">
                                                                        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-50" />
                                                                        <div className="relative z-10">
                                                                            <Trophy className="w-12 h-12 text-white/5 mx-auto mb-4" />
                                                                            <p className="text-gray-500 font-black uppercase tracking-[0.2em] text-[10px]">
                                                                                {matchViewTab === 'upcoming' ? 'No upcoming matches listed' : 'No past matches listed'}
                                                                            </p>
                                                                            <p className="text-gray-600 text-[9px] mt-2 font-bold uppercase tracking-widest">Linked ID: {player?.rankedin_id || 'Not Linked'}</p>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                <LicensePaymentModal
                    isOpen={showPaymentModal}
                    onClose={() => setShowPaymentModal(false)}
                    userEmail={player?.email}
                    userName={player?.name}
                    onPaymentSuccess={refetchPlayer}
                />

                {showCoachModal && coachApplication && (
                    <CoachProfileModal
                        app={coachApplication}
                        isAdmin={false}
                        onClose={() => setShowCoachModal(false)}
                        onUpdate={(updatedApp) => setCoachApplication(updatedApp)}
                    />
                )}

                {/* Edit Profile Modal */}
                <AnimatePresence>
                    {isEditProfileModalOpen && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 md:p-6">
                            {/* Backdrop overlay */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsEditProfileModalOpen(false)}
                                className="absolute inset-0 bg-black/80 backdrop-blur-md"
                            />

                            {/* Modal Container */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                transition={{ type: 'spring', duration: 0.5 }}
                                className="relative w-full max-w-4xl max-h-[85vh] md:max-h-[90vh] bg-[#0F172A]/95 border border-white/10 backdrop-blur-xl rounded-[2rem] md:rounded-[2.5rem] p-5 md:p-10 shadow-2xl z-10 flex flex-col my-auto overflow-hidden"
                            >
                                {/* Glow accent */}
                                <div className="absolute top-0 right-0 w-64 h-64 bg-padel-green/5 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />
                                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-[80px] -ml-32 -mb-32 pointer-events-none" />

                                {/* Header */}
                                <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/5 flex-shrink-0 relative z-10">
                                    <div className="flex flex-col gap-0.5">
                                        <h3 className="text-lg md:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                                            <Edit3 className="text-padel-green w-5 h-5 md:w-6 md:h-6" />
                                            Edit Profile Details
                                        </h3>
                                        <p className="text-gray-500 text-[8px] md:text-xs uppercase tracking-widest">Update your personal information and play preferences</p>
                                    </div>
                                    <button
                                        onClick={() => setIsEditProfileModalOpen(false)}
                                        className="p-2 md:p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer"
                                    >
                                        <X className="w-4 h-4 md:w-5 md:h-5" />
                                    </button>
                                </div>

                                {/* Message alerts */}
                                <AnimatePresence>
                                    {message && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className={`mb-4 flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl flex-shrink-0 ${message.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-padel-green text-black'
                                                } font-black text-[10px] md:text-xs uppercase tracking-widest`}
                                        >
                                            {message.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
                                            {message.text}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Form content */}
                                <form
                                    onSubmit={handleSave}
                                    className="flex flex-col flex-1 overflow-hidden"
                                >
                                    {/* Scrollable inputs container */}
                                    <div className="flex-1 overflow-y-auto pr-1 md:pr-3 space-y-5 custom-scrollbar pb-3">
                                        <fieldset className="space-y-5">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-3 md:ml-4">Full Name</label>
                                                    <div className="relative">
                                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-4 h-4 md:w-5 md:h-5" />
                                                        <input
                                                            type="text"
                                                            value={formData.name}
                                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-4 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700 text-xs md:text-sm"
                                                            placeholder="Enter full name"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-3 md:ml-4">Email Address</label>
                                                    <div className="relative">
                                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-4 h-4 md:w-5 md:h-5" />
                                                        <input
                                                            type="email"
                                                            value={formData.email}
                                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-4 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700 text-xs md:text-sm"
                                                            placeholder="Email Address"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-3 md:ml-4">Gender</label>
                                                    <div className="relative">
                                                        <select
                                                            value={formData.gender}
                                                            onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold appearance-none cursor-pointer text-xs md:text-sm"
                                                        >
                                                            <option value="" disabled className="bg-[#0F172A] text-white">Select Gender</option>
                                                            <option value="Male" className="bg-[#0F172A] text-white">Male</option>
                                                            <option value="Female" className="bg-[#0F172A] text-white">Female</option>
                                                        </select>
                                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-padel-green/75 pointer-events-none w-4 h-4 md:w-5 md:h-5" />
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-3 md:ml-4">Age</label>
                                                    <div className="relative">
                                                        <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-4 h-4 md:w-5 md:h-5" />
                                                        <input
                                                            type="number"
                                                            value={formData.age}
                                                            onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-4 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700 text-xs md:text-sm"
                                                            placeholder="Your Age"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-3 md:ml-4">Nationality</label>
                                                    <div className="relative">
                                                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-4 h-4 md:w-5 md:h-5" />
                                                        <input
                                                            type="text"
                                                            value={formData.nationality}
                                                            onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-4 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700 text-xs md:text-sm"
                                                            placeholder="Nationality"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-3 md:ml-4">ID Number</label>
                                                    <div className="relative">
                                                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-4 h-4 md:w-5 md:h-5" />
                                                        <input
                                                            type="text"
                                                            value={formData.id_number}
                                                            onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-4 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700 text-xs md:text-sm"
                                                            placeholder="ID Number"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-3 md:ml-4">Phone Number</label>
                                                    <div className="relative">
                                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-4 h-4 md:w-5 md:h-5" />
                                                        <input
                                                            type="tel"
                                                            value={formData.contact_number}
                                                            onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-4 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700 text-xs md:text-sm"
                                                            placeholder="Phone Number"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-3 md:ml-4">Home Club</label>
                                                    <SearchableSelect
                                                        options={[...clubs.map(club => ({ label: club.name, value: club.id })), { label: "Other (Type your own)", value: "Other" }]}
                                                        value={formData.club_id}
                                                        onChange={(e) => setFormData({ ...formData, club_id: e.target.value, home_club: e.target.value !== 'Other' ? clubs.find(c => c.id === e.target.value)?.name || '' : formData.home_club })}
                                                        placeholder="Select Home Club"
                                                        icon={Trophy}
                                                    />
                                                    {formData.club_id === 'Other' && (
                                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
                                                            <input
                                                                type="text"
                                                                placeholder="Please specify your club name"
                                                                value={formData.custom_club}
                                                                onChange={(e) => setFormData({ ...formData, custom_club: e.target.value })}
                                                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-padel-green transition-all text-[11px]"
                                                                required
                                                            />
                                                        </motion.div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-3 md:ml-4">Instagram Link / Handle</label>
                                                    <div className="relative">
                                                        <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-4 h-4 md:w-5 md:h-5" />
                                                        <input
                                                            type="text"
                                                            value={formData.instagram_link}
                                                            onChange={(e) => setFormData({ ...formData, instagram_link: e.target.value })}
                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-4 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700 text-xs md:text-sm"
                                                            placeholder="@username or full URL"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black text-padel-green uppercase tracking-[0.2em] ml-3 md:ml-4">Region</label>
                                                    <div className="relative">
                                                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/75 w-4 h-4 md:w-5 md:h-5" />
                                                        <select
                                                            value={formData.region}
                                                            onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-10 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold appearance-none cursor-pointer text-xs md:text-sm"
                                                        >
                                                            <option value="" disabled className="bg-[#0F172A] text-white">Select Region</option>
                                                            <option value="Eastern Cape" className="bg-[#0F172A] text-white">Eastern Cape</option>
                                                            <option value="Free State" className="bg-[#0F172A] text-white">Free State</option>
                                                            <option value="Gauteng" className="bg-[#0F172A] text-white">Gauteng</option>
                                                            <option value="KwaZulu-Natal" className="bg-[#0F172A] text-white">KwaZulu-Natal</option>
                                                            <option value="Limpopo" className="bg-[#0F172A] text-white">Limpopo</option>
                                                            <option value="Mpumalanga" className="bg-[#0F172A] text-white">Mpumalanga</option>
                                                            <option value="Northern Cape" className="bg-[#0F172A] text-white">Northern Cape</option>
                                                            <option value="North West" className="bg-[#0F172A] text-white">North West</option>
                                                            <option value="Western Cape" className="bg-[#0F172A] text-white">Western Cape</option>
                                                        </select>
                                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-padel-green/75 pointer-events-none w-4 h-4 md:w-5 md:h-5" />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black text-padel-green uppercase tracking-[0.2em] ml-3 md:ml-4">Racket Brand</label>
                                                    <div className="relative space-y-2">
                                                        <div className="relative">
                                                            <select
                                                                value={['Adidas', 'Babolat', 'Bull Padel', 'Nox', 'Varlion', 'Oxdog', 'Wilson', 'Head', 'Siux'].includes(formData.racket_brand) ? formData.racket_brand : (formData.racket_brand ? 'Other' : '')}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    if (val === 'Other') {
                                                                        setFormData({ ...formData, racket_brand: 'Other' });
                                                                    } else {
                                                                        setFormData({ ...formData, racket_brand: val });
                                                                    }
                                                                }}
                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold appearance-none cursor-pointer text-xs md:text-sm"
                                                            >
                                                                <option value="" disabled className="bg-[#0F172A] text-white">Select Brand</option>
                                                                <option value="Adidas" className="bg-[#0F172A] text-white">Adidas</option>
                                                                <option value="Babolat" className="bg-[#0F172A] text-white">Babolat</option>
                                                                <option value="Bull Padel" className="bg-[#0F172A] text-white">Bull Padel</option>
                                                                <option value="Nox" className="bg-[#0F172A] text-white">Nox</option>
                                                                <option value="Varlion" className="bg-[#0F172A] text-white">Varlion</option>
                                                                <option value="Oxdog" className="bg-[#0F172A] text-white">Oxdog</option>
                                                                <option value="Wilson" className="bg-[#0F172A] text-white">Wilson</option>
                                                                <option value="Head" className="bg-[#0F172A] text-white">Head</option>
                                                                <option value="Siux" className="bg-[#0F172A] text-white">Siux</option>
                                                                <option value="Other" className="bg-[#0F172A] text-white">Other</option>
                                                            </select>
                                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-padel-green/75 pointer-events-none w-4 h-4 md:w-5 md:h-5" />
                                                        </div>

                                                        {(formData.racket_brand === 'Other' || (!['Adidas', 'Babolat', 'Bull Padel', 'Nox', 'Varlion', 'Oxdog', 'Wilson', 'Head', 'Siux', ''].includes(formData.racket_brand))) && (
                                                            <input
                                                                type="text"
                                                                value={formData.racket_brand === 'Other' ? '' : formData.racket_brand}
                                                                onChange={(e) => setFormData({ ...formData, racket_brand: e.target.value })}
                                                                placeholder="Specify your brand"
                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl px-4 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold text-xs md:text-sm"
                                                                required
                                                            />
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] ml-3 md:ml-4">Category / Division</label>
                                                    <div className="relative">
                                                        <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4 md:w-5 md:h-5" />
                                                        <select
                                                            value={formData.category}
                                                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                                            className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-10 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold appearance-none cursor-pointer text-xs md:text-sm"
                                                        >
                                                            <option value="" disabled className="bg-[#0F172A] text-white">Select Category</option>
                                                            <optgroup label="Men's" className="bg-[#0F172A]">
                                                                <option value="Men's Open (Pro/Elite)" className="bg-[#0F172A] text-white">Men's Open (Pro/Elite)</option>
                                                                <option value="Men's Advanced" className="bg-[#0F172A] text-white">Men's Advanced</option>
                                                                <option value="Men's Intermediate" className="bg-[#0F172A] text-white">Men's Intermediate</option>
                                                            </optgroup>
                                                            <optgroup label="Ladies" className="bg-[#0F172A]">
                                                                <option value="Ladies Open (Pro/Elite)" className="bg-[#0F172A] text-white">Ladies Open (Pro/Elite)</option>
                                                                <option value="Ladies Advanced" className="bg-[#0F172A] text-white">Ladies Advanced</option>
                                                                <option value="Ladies Intermediate" className="bg-[#0F172A] text-white">Ladies Intermediate</option>
                                                            </optgroup>
                                                        </select>
                                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-padel-green/75 pointer-events-none w-4 h-4 md:w-5 md:h-5" />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-3 md:ml-4">Player Biography</label>
                                                <div className="relative">
                                                    <Briefcase className="absolute left-4 top-4 text-padel-green/75 w-4 h-4 md:w-5 md:h-5" />
                                                    <textarea
                                                        value={formData.bio}
                                                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                                        className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-4 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700 min-h-[80px] md:min-h-[100px] text-xs md:text-sm"
                                                        placeholder="Tell us about your padel journey..."
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] ml-3 md:ml-4">Sponsors (comma separated)</label>
                                                <div className="relative">
                                                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4 md:w-5 md:h-5" />
                                                    <input
                                                        type="text"
                                                        value={formData.sponsors}
                                                        onChange={(e) => setFormData({ ...formData, sponsors: e.target.value })}
                                                        className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-4 py-3 md:py-4 text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold placeholder:text-gray-700 text-xs md:text-sm"
                                                        placeholder="Babolat, Nike, Red Bull, etc."
                                                    />
                                                </div>
                                            </div>
                                        </fieldset>
                                    </div>

                                    {/* Fixed Footer */}
                                    <div className="pt-4 mt-3 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0 relative z-10 bg-[#0F172A]/40 backdrop-blur-md">
                                        <p className="text-[8px] md:text-[9px] font-medium text-gray-500 uppercase tracking-widest leading-relaxed text-center sm:text-left">
                                            By saving, you agree to updated profile data being <br className="hidden sm:block" /> displayed on public leaderboards.
                                        </p>
                                        <div className="flex items-center gap-3 w-full sm:w-auto">
                                            <button
                                                type="button"
                                                onClick={() => setIsEditProfileModalOpen(false)}
                                                className="w-1/2 sm:w-auto bg-white/[0.03] text-white font-black uppercase tracking-widest px-6 py-3.5 md:px-8 md:py-4 rounded-lg md:rounded-xl border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all backdrop-blur-md text-[10px] md:text-xs"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="w-1/2 sm:w-auto bg-padel-green text-black font-black uppercase tracking-widest px-6 py-3.5 md:px-8 md:py-4 rounded-lg md:rounded-xl flex items-center justify-center gap-2 hover:bg-white hover:scale-105 transition-all shadow-xl shadow-padel-green/10 disabled:opacity-50 group active:scale-95 text-[10px] md:text-xs whitespace-nowrap"
                                            >
                                                <Save className="w-4 h-4" />
                                                {saving ? 'Syncing...' : 'Save Changes'}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Lightbox for Gallery Photos */}
                <AnimatePresence>
                    {activeLightboxImg && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setActiveLightboxImg(null)}
                            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 md:p-8"
                        >
                            <button
                                onClick={() => setActiveLightboxImg(null)}
                                className="absolute top-6 right-6 p-3 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:scale-105 active:scale-95 transition-all cursor-pointer z-[110]"
                            >
                                <X size={20} />
                            </button>
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                                onClick={(e) => e.stopPropagation()}
                                className="relative max-w-full max-h-[85vh] flex items-center justify-center"
                            >
                                <img
                                    src={activeLightboxImg}
                                    alt="Gallery Preview"
                                    className="max-w-full max-h-[85vh] object-contain block rounded-2xl shadow-2xl shadow-black/80"
                                />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};

export default PlayerProfile;
