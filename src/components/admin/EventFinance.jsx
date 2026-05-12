import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Calendar, Users, CheckCircle, XCircle, Search, Download, 
    RefreshCcw, Loader2, AlertCircle, UserPlus, Link2, ExternalLink, Trophy, DollarSign,
    MessageCircle, Check
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useRankedin } from '../../hooks/useRankedin';
import { toast } from 'sonner';
import ExcelJS from 'exceljs';
import logo4m from '../../assets/logo_4m_lowercase.png';

const EventFinance = ({ allowedEvents = [], isEventManagementModule = false }) => {
    const [events, setEvents] = useState([]);
    const [selectedEventId, setSelectedEventId] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'dashboard' | 'table'
    const [localParticipants, setLocalParticipants] = useState([]);
    const [systemProfiles, setSystemProfiles] = useState([]);
    const [loading, setLoading] = useState({ events: true, matching: false, syncing: false });
    const [searchQuery, setSearchQuery] = useState('');
    const [eventSearch, setEventSearch] = useState('');
    const [isEventSearchOpen, setIsEventSearchOpen] = useState(false);
    const [markingPaid, setMarkingPaid] = useState(null);
    const [matchingProfile, setMatchingProfile] = useState(null); // Participant being matched
    const [profileSearchQuery, setProfileSearchQuery] = useState('');
    const [filterProfile, setFilterProfile] = useState('all');
    const [filterLicense, setFilterLicense] = useState('all');
    const [filterPayment, setFilterPayment] = useState('all');
    const [filterDivision, setFilterDivision] = useState('all');
    const [filterWhatsApp, setFilterWhatsApp] = useState('all');
    const [updatingWhatsApp, setUpdatingWhatsApp] = useState(null);

    const { getTournamentPlayerTabs, getTournamentParticipants } = useRankedin();

    const selectedEvent = useMemo(() => 
        events.find(e => e.id === selectedEventId), 
        [events, selectedEventId]
    );

    const filteredEvents = useMemo(() => {
        let sorted = [...events].sort((a, b) => {
            const dateA = new Date(a.start_date);
            const dateB = new Date(b.start_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const isUpcomingA = dateA >= today;
            const isUpcomingB = dateB >= today;

            if (isUpcomingA && !isUpcomingB) return -1;
            if (!isUpcomingA && isUpcomingB) return 1;

            if (isUpcomingA) return dateA - dateB; // Upcoming: Soonest first
            return dateB - dateA; // Past: Most recent first
        });

        // Filter by finance_managed if this is the management module
        if (isEventManagementModule) {
            sorted = sorted.filter(e => e.finance_managed);
        }

        // Filter by allowedEvents permissions if any
        if (allowedEvents && allowedEvents.length > 0) {
            sorted = sorted.filter(e => allowedEvents.includes(e.id));
        }

        if (!eventSearch) return sorted;
        return sorted.filter(e => e.event_name.toLowerCase().includes(eventSearch.toLowerCase()));
    }, [events, eventSearch, allowedEvents, isEventManagementModule]);

    const playerEntryCounts = useMemo(() => {
        const counts = {};
        localParticipants.forEach(p => {
            const name = p.full_name?.toLowerCase().trim();
            if (name) counts[name] = (counts[name] || 0) + 1;
        });
        return counts;
    }, [localParticipants]);
    
    const totalCollected = useMemo(() => {
        if (!selectedEvent) return 0;
        
        return localParticipants
            .filter(p => p.is_paid)
            .reduce((sum, p) => {
                const divFee = selectedEvent.category_fees?.[p.class_name] || selectedEvent.entry_fee || 0;
                return sum + Number(divFee);
            }, 0);
    }, [localParticipants, selectedEvent]);

    const dashboardStats = useMemo(() => {
        if (!selectedEvent) return { expected: 0, outstanding: 0, licenses: { full: 0, temp: 0, none: 0 }, uniquePlayers: 0 };
        
        let expected = 0;
        const uniqueProfiles = new Set();
        const licenseCounts = { full: 0, temp: 0, none: 0 };

        localParticipants.forEach(p => {
            const divFee = selectedEvent.category_fees?.[p.class_name] || selectedEvent.entry_fee || 0;
            expected += Number(divFee);
            
            const profileKey = p.profile_id || p.full_name?.toLowerCase().trim();
            if (profileKey && !uniqueProfiles.has(profileKey)) {
                uniqueProfiles.add(profileKey);
                const lic = p.players?.license_type?.toLowerCase() || 'none';
                if (lic === 'full') licenseCounts.full++;
                else if (lic === 'temporary' || lic === 'temp') licenseCounts.temp++;
                else licenseCounts.none++;
            }
        });

        const outstanding = Math.max(0, expected - totalCollected);

        return {
            expected,
            outstanding,
            licenses: licenseCounts,
            uniquePlayers: uniqueProfiles.size
        };
    }, [localParticipants, selectedEvent, totalCollected]);

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(prev => ({ ...prev, events: true }));
            try {
                const { data: eData } = await supabase
                    .from('calendar')
                    .select('id, event_name, start_date, rankedin_id, rankedin_url, entry_fee, category_fees, finance_managed')
                    .order('start_date', { ascending: false });
                setEvents(eData || []);

                const { data: pData } = await supabase
                    .from('players')
                    .select('id, name, email, contact_number, license_type, paid_registration');
                setSystemProfiles(pData || []);
            } finally {
                setLoading(prev => ({ ...prev, events: false }));
            }
        };
        fetchInitialData();
    }, []);

    // 2. Fetch Local Participants for Selected Event
    const fetchParticipants = useCallback(async (eventId) => {
        if (!eventId) return;
        setLoading(prev => ({ ...prev, matching: true }));
        try {
            const [{ data: pData, error: pError }, { data: payData, error: payError }] = await Promise.all([
                supabase
                    .from('tournament_participants')
                    .select('*, players(id, name, email, contact_number, license_type, paid_registration)')
                    .eq('event_id', eventId)
                    .order('full_name'),
                supabase
                    .from('payments')
                    .select('*')
                    .eq('event_id', eventId)
                    .eq('status', 'success')
            ]);

            if (pError) throw pError;
            if (payError) throw payError;

            // Enrich participants with their actual payment records
            const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

            const enriched = (pData || []).map(p => {
                // Find payment by metadata participant_id OR by profile_id + division match
                const pDiv = normalize(p.class_name);

                const payment = (payData || []).find(pay => {
                    // Highest priority: direct link
                    if (pay.metadata?.participant_id === p.id) return true;

                    // Fallback: player_id + event_id match
                    const isOwnPayment = p.profile_id && pay.player_id === p.profile_id && pay.payment_type === 'event_entry_fee';
                    if (!isOwnPayment) return false;

                    // If we have a division in payment metadata, it MUST match (fuzzy)
                    const payDiv = normalize(pay.metadata?.division);
                    if (payDiv && pDiv) {
                        return payDiv.includes(pDiv) || pDiv.includes(payDiv);
                    }

                    // If no division in metadata, we assume it's a match if they only have one entry, 
                    // or we check if there are other payments. For now, if no div in metadata, we match.
                    return true;
                });
                
                return {
                    ...p,
                    actual_payment: payment || null
                };
            });

            setLocalParticipants(enriched);
        } catch (err) {
            console.error("Fetch participants error:", err);
            toast.error("Failed to load local participants");
        } finally {
            setLoading(prev => ({ ...prev, matching: false }));
        }
    }, []);

    useEffect(() => {
        if (selectedEventId) {
            fetchParticipants(selectedEventId);
        } else if (allowedEvents && allowedEvents.length > 0 && filteredEvents.length > 0 && !selectedEventId) {
            // Auto-select first event if locked by permissions
            setSelectedEventId(filteredEvents[0].id);
        }
    }, [selectedEventId, fetchParticipants, allowedEvents, filteredEvents]);

    // 3. Sync from Rankedin (Core Engine)
    const runSyncForEvent = async (eventId, rId, eventName) => {
        let successCount = 0;
        let createdCount = 0;
        let errorCount = 0;

        try {
            // Step 1: Get all class tabs for this tournament
            const tabs = await getTournamentPlayerTabs(rId);

            if (!tabs || !Array.isArray(tabs) || tabs.length === 0) {
                console.warn(`No player tabs for ${eventName}`);
                return { success: 0, error: 1, message: "No tabs found" };
            }

            // Step 2: For each class tab, get participants
            let externalParticipants = [];
            for (const tab of tabs) {
                try {
                    const parts = await getTournamentParticipants(rId, tab.Id);
                    if (!Array.isArray(parts)) continue;

                    parts.forEach(p => {
                        const participant = p.Participant || p;
                        const fp = participant.FirstPlayer;
                        const sp = participant.SecondPlayer;

                        if (fp?.Name?.trim()) {
                            externalParticipants.push({
                                rankedin_participant_id: String(fp.Id),
                                full_name: fp.Name.trim(),
                                class_name: tab.Name
                            });
                        }
                        if (sp?.Name?.trim() && sp.Id && sp.Id !== 0) {
                            externalParticipants.push({
                                rankedin_participant_id: String(sp.Id),
                                full_name: sp.Name.trim(),
                                class_name: tab.Name
                            });
                        }
                    });
                } catch (tabErr) {
                    console.warn(`Could not fetch participants for tab ${tab.Name}:`, tabErr);
                }
            }

            if (externalParticipants.length === 0) return { success: 0, error: 0, message: "No players found" };

            // Deduplicate by Participant ID AND Class (Division)
            const seenKeys = new Map();
            externalParticipants.forEach(p => {
                const key = `${p.rankedin_participant_id}_${p.class_name}`;
                seenKeys.set(key, p);
            });
            externalParticipants = Array.from(seenKeys.values());

            // Step 3: Fetch existing participants and confirm payments from BOTH registrations and payments tables
            const [{ data: existingRows }, { data: paidRegs }, { data: paidPayments }] = await Promise.all([
                supabase.from('tournament_participants').select('id, rankedin_participant_id, class_name, is_paid, email, metadata').eq('event_id', eventId),
                supabase.from('event_registrations').select('full_name, email, division, partner_name, payment_status, payment_method').eq('event_id', eventId).eq('payment_status', 'paid'),
                supabase.from('payments').select('player_id, amount, status, payment_type, metadata, payment_method').eq('event_id', eventId).eq('status', 'success').eq('payment_type', 'event_entry_fee')
            ]);

            // Map existing records by ID + Class
            const existingMap = new Map((existingRows || []).map(r => [`${r.rankedin_participant_id}_${r.class_name}`, r]));
            
            // Helper for matching
            const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

            // Create a unified list of confirmed payments
            const confirmedPayments = [];
            
            // From local registrations table
            (paidRegs || []).forEach(r => {
                confirmedPayments.push({
                    name: r.full_name,
                    email: r.email,
                    partner: r.partner_name,
                    division: r.division,
                    method: r.payment_method || 'system'
                });
            });

            // From master payments table
            (paidPayments || []).forEach(p => {
                // If it has line items, it's a newer granular payment
                if (p.metadata?.line_items && Array.isArray(p.metadata.line_items)) {
                    p.metadata.line_items.forEach(item => {
                        if (item.type === 'entry_fee') {
                            confirmedPayments.push({
                                profileId: p.player_id, // Main player ID
                                name: item.player,      // Specific player for this line item
                                division: p.metadata.division,
                                method: p.payment_method || 'paystack'
                            });
                        }
                    });
                } else {
                    // Legacy/Bulk payment without explicit line items
                    confirmedPayments.push({
                        profileId: p.player_id,
                        name: p.metadata?.paid_by_name || p.metadata?.player_name,
                        division: p.metadata?.division,
                        method: p.payment_method || 'paystack'
                    });
                }
            });

            // Step 4: Upsert participants
            for (const p of externalParticipants) {
                const nameLower = p.full_name.toLowerCase().trim();
                const nDiv = normalize(p.class_name);

                // Auto-match system profile
                let autoProfileId = null;
                let matchedEmail = null;
                const matchedProfile = systemProfiles.find(sp => 
                    sp.name && (sp.name.toLowerCase().includes(nameLower) || nameLower.includes(sp.name.toLowerCase()))
                );
                if (matchedProfile) {
                    autoProfileId = matchedProfile.id;
                    matchedEmail = matchedProfile.email?.toLowerCase().trim();
                }

                const existingRecord = existingMap.get(`${p.rankedin_participant_id}_${p.class_name}`);
                const currentMetadata = existingRecord?.metadata || {};
                const isManualUnpaid = currentMetadata.manual_unpaid === true;
                const isManualPaid = currentMetadata.payment_method === 'manual';

                // Match with ALL confirmed payments
                const detectedPayment = confirmedPayments.find(reg => {
                    const rName = normalize(reg.name);
                    const rEmail = normalize(reg.email);
                    const rPartner = normalize(reg.partner);
                    const rDiv = normalize(reg.division);
                    const rProfileId = reg.profileId;

                    // Identity match
                    // 1. Check if the payment belongs to this participant's linked profile
                    const linkedProfileId = existingRecord?.profile_id || autoProfileId;
                    const idMatch = (rProfileId && linkedProfileId && String(rProfileId) === String(linkedProfileId));
                    
                    // 2. Check name or email or partner name
                    const nameMatch = (normalize(p.full_name) === rName) || (rPartner && normalize(p.full_name) === rPartner);
                    const emailMatch = matchedEmail && rEmail && (matchedEmail === rEmail);
                    
                    if (!idMatch && !nameMatch && !emailMatch) return false;

                    // Division Match Logic:
                    if (rDiv && nDiv) {
                        return rDiv.includes(nDiv) || nDiv.includes(rDiv);
                    }
                    if (!rDiv) return true;
                    return false;
                });

                const detectedPaymentMethod = detectedPayment?.method;
                const alreadyPaidInSystem = !!detectedPaymentMethod;

                const participantData = {
                    event_id: eventId,
                    rankedin_participant_id: p.rankedin_participant_id,
                    full_name: p.full_name,
                    class_name: p.class_name,
                    email: matchedEmail || null,
                    ...(autoProfileId ? { profile_id: autoProfileId } : {}),
                    // If not manually marked/unmarked, sync status with the system's payment records
                    ...(!isManualUnpaid && !isManualPaid ? { 
                        is_paid: alreadyPaidInSystem,
                        metadata: { 
                            ...currentMetadata, 
                            payment_method: alreadyPaidInSystem ? (detectedPaymentMethod || currentMetadata.payment_method || 'system') : null
                        }
                    } : {}) 
                };

                const { error: dbError } = existingRecord 
                    ? await supabase.from('tournament_participants').update(participantData).eq('id', existingRecord.id)
                    : await supabase.from('tournament_participants').insert(participantData);

                if (dbError) {
                    console.error(`Sync DB Error for ${p.full_name} (${p.class_name}):`, dbError);
                    errorCount++;
                } else {
                    if (existingRecord) successCount++;
                    else createdCount++;
                }
            }
            
            // Step 5: Cleanup Stale Participants (REMOVALS & DUPLICATE FIX)
            // We fetch the current state and explicitly delete any ID not in the fresh list.
            const { data: currentInDb } = await supabase
                .from('tournament_participants')
                .select('id, rankedin_participant_id, class_name')
                .eq('event_id', eventId);
            
            const validKeys = externalParticipants.map(p => `${p.rankedin_participant_id}_${p.class_name}`);
            const toDelete = (currentInDb || [])
                .filter(row => !validKeys.includes(`${row.rankedin_participant_id}_${row.class_name}`))
                .map(row => row.id);
            
            if (toDelete.length > 0) {
                console.info(`Cleaning up ${toDelete.length} stale/duplicate entries for event ${eventId}...`);
                const { error: deleteError } = await supabase
                    .from('tournament_participants')
                    .delete()
                    .in('id', toDelete);
                
                if (deleteError) {
                    console.error('Sync Cleanup Error:', deleteError);
                }
            }

            fetchParticipants(eventId);
            toast.success(`Sync complete: ${createdCount} new entries, ${successCount} updated. ${errorCount > 0 ? `${errorCount} failed.` : ''}`);
            return { success: successCount + createdCount, error: errorCount };
        } catch (err) {
            console.error(`Core sync error for ${eventName}:`, err);
            toast.error(`Sync failed: ${err.message}`);
            return { success: 0, error: 1, message: err.message };
        }
    };

    const handleSyncFromRankedin = async (targetEvent = null) => {
        const eventToSync = targetEvent || events.find(e => e.id === selectedEventId);
        if (!eventToSync) return;
        
        const rId = eventToSync?.rankedin_id || eventToSync?.rankedin_url?.match(/\/(\d+)(?:\/|$)/)?.[1];

        if (!rId) {
            toast.error("No Rankedin ID found for this event.");
            return;
        }

        setLoading(prev => ({ ...prev, syncing: true }));
        const result = await runSyncForEvent(eventToSync.id, rId, eventToSync.event_name);
        
        if (result.error === 0) {
            toast.success(`✅ Synced ${result.success} participants for ${eventToSync.event_name}!`);
        } else {
            toast.warning(`Sync complete. ${result.success} ok, ${result.error} failed.`);
        }

        setLoading(prev => ({ ...prev, syncing: false }));
        // If it was the currently selected event, refresh the participant list
        if (selectedEventId === eventToSync.id) {
            fetchParticipants(selectedEventId);
        }
    };

    const handleBulkSync = async () => {
        const syncableFiltered = filteredEvents
            .filter(e => e.rankedin_id || e.rankedin_url?.match(/\/(\d+)(?:\/|$)/)?.[1]);

        if (syncableFiltered.length === 0) {
            toast.error("No events in current view have Rankedin IDs.");
            return;
        }

        const count = syncableFiltered.length;
        if (!confirm(`Are you sure you want to bulk sync the ${count} event${count === 1 ? '' : 's'} in your current view?`)) return;

        setLoading(prev => ({ ...prev, syncing: true }));
        let totalSuccess = 0;
        let totalError = 0;

        for (const event of syncableFiltered) {
            const rId = event.rankedin_id || event.rankedin_url?.match(/\/(\d+)(?:\/|$)/)?.[1];
            const result = await runSyncForEvent(event.id, rId, event.event_name);
            totalSuccess += result.success;
            totalError += result.error;
        }

        toast.success(`Bulk Sync Complete: ${totalSuccess} players updated across ${syncableFiltered.length} events.`);
        setLoading(prev => ({ ...prev, syncing: false }));
        if (selectedEventId) fetchParticipants(selectedEventId);
    };

    // 4. Mark as Paid (Explicit Manual Marking)
    const handleMarkAsPaid = async (participant) => {
        setMarkingPaid(participant.id);
        const selEvent = events.find(e => e.id === selectedEventId);
        const amountToCharge = selEvent.entry_fee || 0;
        
        try {
            // Update local participant table - also clear manual_unpaid flag
            const newMetadata = { 
                ...(participant.metadata || {}), 
                manual_unpaid: false,
                payment_method: 'manual'
            };
            const { error: pError } = await supabase
                .from('tournament_participants')
                .update({ is_paid: true, metadata: newMetadata })
                .eq('id', participant.id);
            if (pError) throw pError;

            // Record transaction record
            await supabase.from('payments').insert([{
                player_id: participant.profile_id,
                event_id: selectedEventId,
                amount: amountToCharge,
                status: 'success',
                payment_type: 'event_entry_fee',
                payment_method: 'manual',
                reference: `Manual - ${participant.full_name} - ${selEvent.event_name}`,
                metadata: { participant_id: participant.id }
            }]);

            toast.success(`Marked ${participant.full_name} as paid (R${amountToCharge})`);
            fetchParticipants(selectedEventId);
        } catch (err) {
            toast.error("Failed to mark as paid");
        } finally {
            setMarkingPaid(null);
        }
    };

    // 5. Unmark as Paid (Correcting Errors)
    const handleUnmarkPaid = async (participant) => {
        if (!confirm(`Are you sure you want to unmark ${participant.full_name} as paid? This will also update any linked registration records to 'unpaid' and ensure the sync doesn't re-mark them.`)) return;
        
        setMarkingPaid(participant.id);
        try {
            // 1. Update the participant status + set manual override in metadata
            const newMetadata = { ...(participant.metadata || {}), manual_unpaid: true };
            const { error: pError } = await supabase
                .from('tournament_participants')
                .update({ is_paid: false, metadata: newMetadata })
                .eq('id', participant.id);
            if (pError) throw pError;

            // 2. Also try to update system registration records to prevent re-sync issues
            const searchName = participant.full_name.trim();
            const searchEmail = participant.players?.email?.toLowerCase().trim();

            let regQuery = supabase
                .from('event_registrations')
                .update({ payment_status: 'unpaid' })
                .eq('event_id', selectedEventId)
                .eq('division', participant.class_name);
            
            if (searchEmail) {
                regQuery = regQuery.or(`full_name.ilike.%${searchName}%,email.ilike.${searchEmail}`);
            } else {
                regQuery = regQuery.ilike('full_name', `%${searchName}%`);
            }

            await regQuery;

            // 3. Update any manual payment records for this participant
            await supabase
                .from('payments')
                .update({ status: 'cancelled' })
                .eq('event_id', selectedEventId)
                .contains('metadata', { participant_id: participant.id });

            toast.success(`Reset ${participant.full_name} status to unpaid`);
            fetchParticipants(selectedEventId);
        } catch (err) {
            console.error("Unmark error:", err);
            toast.error("Failed to reset status");
        } finally {
            setMarkingPaid(null);
        }
    };

    // 5. Link Profile Manual Match
    const handleMatchProfile = async (participantId, profileId) => {
        try {
            const { error } = await supabase
                .from('tournament_participants')
                .update({ profile_id: profileId })
                .eq('id', participantId);
            if (error) throw error;
            toast.success("Profile linked successfully");
            setMatchingProfile(null);
            fetchParticipants(selectedEventId);
        } catch (err) {
            toast.error("Failed to link profile");
        }
    };

    const handleToggleWhatsApp = async (participant) => {
        setUpdatingWhatsApp(participant.id);
        const newState = !participant.whatsapp_added;
        try {
            const { error } = await supabase
                .from('tournament_participants')
                .update({ whatsapp_added: newState })
                .eq('id', participant.id);
            
            if (error) throw error;
            
            // Update local state to avoid full re-fetch if possible, but fetchParticipants is safer
            setLocalParticipants(prev => prev.map(p => 
                p.id === participant.id ? { ...p, whatsapp_added: newState } : p
            ));
            
            toast.success(`${participant.full_name} ${newState ? 'marked as added to WhatsApp' : 'unmarked from WhatsApp'}`);
        } catch (err) {
            console.error("WhatsApp toggle error:", err);
            toast.error("Failed to update WhatsApp status");
        } finally {
            setUpdatingWhatsApp(null);
        }
    };

    const handleExportExcel = async () => {
        try {
            const selEvent = events.find(e => e.id === selectedEventId);
            if (!selEvent) return;

            // Use FILTERED participants for export to respect user's current view
            const sortedParticipants = [...filteredParticipants].sort((a, b) => 
                a.full_name.localeCompare(b.full_name)
            );

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Event Finance');

            // Add Event Title at the top
            const titleRow = sheet.addRow([`Event: ${selEvent.event_name}`]);
            titleRow.font = { bold: true, size: 14 };
            titleRow.height = 45;
            titleRow.alignment = { vertical: 'middle' };
            sheet.mergeCells('A1:G1');

            try {
                // Fetch the image from the bundled URL
                const response = await fetch(logo4m);
                const buffer = await response.arrayBuffer();
                const imageId = workbook.addImage({
                    buffer: buffer,
                    extension: 'png',
                });
                
                // Add the image to the sheet (tl: col 5 is column F)
                sheet.addImage(imageId, {
                    tl: { col: 5, row: 0 },
                    ext: { width: 120, height: 40 }
                });
            } catch (imgErr) {
                console.warn('Could not load logo for Excel export', imgErr);
            }
            
            // Blank separator row
            sheet.addRow([]);

            // Add Headers
            const headers = ['Participant Name', 'Division', 'System Profile', 'Email', 'Contact Number', 'License Type', 'Event Payment Status', 'Payment Method', 'Amount Paid', 'WhatsApp Added'];
            const headerRow = sheet.addRow(headers);
            headerRow.font = { bold: true };
            
            // Add auto-filter to header row
            sheet.autoFilter = 'A3:I3';

            // Add Data Rows
            sortedParticipants.forEach(p => {
                const amountPaid = p.is_paid ? (p.actual_payment?.amount || 0) : 0;
                sheet.addRow([
                    p.full_name,
                    p.class_name || 'N/A',
                    p.players?.name || 'Unlinked',
                    p.players?.email || 'N/A',
                    p.players?.contact_number || 'N/A',
                    p.players?.license_type || 'None',
                    p.is_paid ? 'PAID' : 'UNPAID',
                    p.is_paid ? (p.actual_payment?.metadata?.paid_by_name ? `Paid by ${p.actual_payment.metadata.paid_by_name}` : (p.actual_payment?.payment_method || 'System')) : 'N/A',
                    amountPaid,
                    p.whatsapp_added ? 'YES' : 'NO'
                ]);
            });

            // Add Total Revenue row at the bottom
            sheet.addRow([]);
            const totalRow = sheet.addRow(['', '', '', '', '', '', '', 'TOTAL REVENUE:', totalCollected]);
            totalRow.getCell(8).font = { bold: true };
            totalRow.getCell(9).font = { bold: true };
            totalRow.getCell(9).numFmt = '"R"#,##0.00';

            // Expand columns to fit content
            for (let i = 1; i <= 10; i++) {
                const column = sheet.getColumn(i);
                let maxLen = 0;
                column.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
                    // Start checking length from Header row (row 3)
                    if (rowNumber >= 3 && cell.value) {
                        const colLen = cell.value.toString().length;
                        if (colLen > maxLen) {
                            maxLen = colLen;
                        }
                    }
                });
                column.width = maxLen + 2 > 10 ? maxLen + 2 : 10;
            }

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Finance_Report_${selEvent.event_name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            toast.success("Excel report downloaded successfully");
        } catch (err) {
            console.error("Export error:", err);
            toast.error("Failed to generate Excel report");
        }
    };

    const uniqueDivisions = useMemo(() => {
        const divisions = new Set(localParticipants.map(p => p.class_name).filter(Boolean));
        return Array.from(divisions).sort();
    }, [localParticipants]);

    const divisionCounts = useMemo(() => {
        const counts = {};
        localParticipants.forEach(p => {
            if (p.class_name) {
                counts[p.class_name] = (counts[p.class_name] || 0) + 1;
            }
        });
        return counts;
    }, [localParticipants]);

    const filteredParticipants = localParticipants.filter(p => {
        const matchesSearch = p.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (p.players?.email?.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (p.players?.name?.toLowerCase().includes(searchQuery.toLowerCase()));
        
        const isLinked = !!p.players;
        const matchesProfile = filterProfile === 'all' || 
            (filterProfile === 'linked' && isLinked) || 
            (filterProfile === 'unlinked' && !isLinked);
            
        const lic = p.players?.license_type || 'none';
        const matchesLicense = filterLicense === 'all' || lic === filterLicense;
        
        const matchesPayment = filterPayment === 'all' || 
            (filterPayment === 'paid' && p.is_paid) || 
            (filterPayment === 'unpaid' && !p.is_paid);
            
        const matchesDivision = filterDivision === 'all' || p.class_name === filterDivision;

        const matchesWhatsApp = filterWhatsApp === 'all' || 
            (filterWhatsApp === 'added' && p.whatsapp_added) || 
            (filterWhatsApp === 'not_added' && !p.whatsapp_added);

        return matchesSearch && matchesProfile && matchesLicense && matchesPayment && matchesDivision && matchesWhatsApp;
    });

    return (
        <div className="space-y-6">
            {/* Header & Managed Events List - Only visible in 'list' mode */}
            {viewMode === 'list' && (
            <div className="bg-[#1E293B]/50 backdrop-blur-md p-8 rounded-3xl border border-white/10">
                {/* Search & Bulk Action Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-padel-green/20 text-padel-green rounded-xl flex items-center justify-center">
                            <Calendar size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white uppercase tracking-tight italic">Event Finance Manager</h3>
                            <p className="text-gray-400 text-xs font-medium uppercase tracking-widest">{events.length} system events tracked</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            <input
                                type="text"
                                placeholder="Search through 98+ events..."
                                value={eventSearch}
                                onChange={(e) => setEventSearch(e.target.value)}
                                className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-600"
                            />
                        </div>
                        <button
                            onClick={handleBulkSync}
                            disabled={loading.syncing}
                            className="flex items-center gap-2 bg-padel-green/10 hover:bg-padel-green text-padel-green hover:text-black px-8 py-3.5 rounded-2xl border border-padel-green/20 transition-all font-black uppercase tracking-widest text-[10px] disabled:opacity-30 whitespace-nowrap"
                        >
                            {loading.syncing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                            Bulk Sync All
                        </button>
                    </div>
                </div>

                {/* High-Density Event List */}
                <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                    <div className="max-h-[320px] overflow-y-auto no-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-[#1E293B] text-[10px] font-black uppercase text-gray-500 border-b border-white/5">
                                <tr>
                                    <th className="px-6 py-3">Event Date</th>
                                    <th className="px-6 py-3">Tournament Name</th>
                                    <th className="px-6 py-3">Rankedin ID</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredEvents.map(e => {
                                        const isSelected = selectedEventId === e.id;
                                        const rId = e.rankedin_id || e.rankedin_url?.match(/\/(\d+)(?:\/|$)/)?.[1];
                                        const eventDate = new Date(e.start_date);
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        const isUpcoming = eventDate >= today;
                                        
                                        return (
                                            <tr 
                                                key={e.id}
                                                onClick={() => {
                                                    setSelectedEventId(e.id);
                                                    setViewMode('dashboard');
                                                }}
                                                className={`group cursor-pointer transition-all hover:bg-white/5`}
                                            >
                                                <td className="px-4 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <p className={`text-[11px] font-bold text-white group-hover:text-padel-green`}>
                                                            {eventDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </p>
                                                        <span className={`text-[8px] font-black uppercase tracking-widest ${isUpcoming ? 'text-padel-green/60' : 'text-gray-600'}`}>
                                                            {isUpcoming ? 'Upcoming' : 'Past'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <p className={`font-black uppercase tracking-tight text-sm ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                                                            {e.event_name}
                                                        </p>
                                                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-padel-green animate-pulse" />}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-[10px] font-mono text-gray-600 bg-white/5 px-2 py-0.5 rounded uppercase">{rId || 'NO ID'}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            )}

            {selectedEventId && viewMode !== 'list' && (
                <React.Fragment>
                <div className="space-y-6 text-white pt-2">
                    {/* Navigation Bar */}
                    <div className="flex items-center justify-between mb-2">
                        <button 
                            onClick={() => {
                                setSelectedEventId(null);
                                setViewMode('list');
                            }}
                            className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white flex items-center gap-2 transition-colors"
                        >
                            ← Back to Events List
                        </button>
                        
                        {viewMode === 'table' && (
                            <button 
                                onClick={() => setViewMode('dashboard')}
                                className="text-xs font-bold uppercase tracking-widest text-padel-green hover:text-white flex items-center gap-2 transition-colors"
                            >
                                View Dashboard Cards
                            </button>
                        )}
                    </div>

                    {/* Active Event Indicator */}
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-white uppercase tracking-tighter italic leading-none truncate max-w-full">
                                {events.find(e => e.id === selectedEventId)?.event_name}
                            </h2>
                            <div className="flex items-center gap-3">
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-padel-green text-black text-[9px] sm:text-[10px] font-black uppercase rounded-lg shadow-lg shadow-padel-green/20 w-fit shrink-0">
                                    <Trophy size={12} /> Selected Tournament
                                </div>
                                
                                <button
                                    onClick={() => handleSyncFromRankedin()}
                                    disabled={loading.syncing}
                                    className="flex items-center justify-center gap-2 bg-black/40 hover:bg-black/60 border border-white/10 text-white px-4 py-1.5 rounded-lg transition-all font-black uppercase tracking-widest text-[9px] sm:text-[10px] disabled:opacity-30 h-fit"
                                >
                                    {loading.syncing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCcw size={14} />}
                                    SYNC
                                </button>
                                
                                {selectedEvent?.rankedin_url && (
                                    <a 
                                        href={selectedEvent.rankedin_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 bg-padel-green text-black rounded-lg hover:bg-padel-green/90 transition-all flex items-center justify-center w-fit h-fit shrink-0"
                                        title="View on Rankedin"
                                    >
                                        <ExternalLink size={16} className="text-black" />
                                    </a>
                                )}
                            </div>
                        </div>
                        <p className="text-gray-500 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] sm:tracking-[0.3em] flex items-center gap-2">
                            <Calendar size={12} className="shrink-0" />
                            {new Date(events.find(e => e.id === selectedEventId)?.start_date).toLocaleDateString(undefined, { 
                                weekday: 'long', 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                            })}
                        </p>
                    </div>

                    {/* Dashboard Stats */}
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, staggerChildren: 0.1 }}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
                    >
                        <motion.div 
                            whileHover={{ y: -5, scale: 1.02 }}
                            className="bg-gradient-to-br from-[#1E293B]/80 to-[#0F172A]/80 backdrop-blur-xl p-6 rounded-3xl border border-white/10 flex flex-col gap-2 relative overflow-hidden group shadow-2xl"
                        >
                            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 group-hover:rotate-12 transition-all duration-500">
                                <Users size={120} />
                            </div>
                            <p className="text-xs font-black uppercase text-gray-400 tracking-widest relative z-10">Total Entries</p>
                            <div className="flex items-baseline gap-2 mt-2 relative z-10">
                                <h3 className="text-4xl md:text-5xl font-black text-white drop-shadow-md">{localParticipants.length}</h3>
                                <span className="text-xs text-padel-green font-bold uppercase">{dashboardStats.uniquePlayers} Unique</span>
                            </div>
                        </motion.div>
                        
                        <motion.div 
                            whileHover={{ y: -5, scale: 1.02 }}
                            className="bg-gradient-to-br from-padel-green/20 via-[#1E293B]/80 to-[#0F172A]/80 backdrop-blur-xl p-6 rounded-3xl border border-padel-green/30 flex flex-col gap-2 relative overflow-hidden group shadow-[0_0_30px_rgba(190,255,0,0.1)]"
                        >
                            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500 text-padel-green">
                                <DollarSign size={120} />
                            </div>
                            <div className="flex justify-between items-start relative z-10">
                                <p className="text-[10px] font-black uppercase text-padel-green/80 tracking-widest whitespace-nowrap">
                                    Total amount Billed
                                </p>
                                <p className="text-[10px] font-black text-white bg-black/40 px-2 py-0.5 rounded border border-white/5">
                                    R {dashboardStats.expected.toLocaleString()}
                                </p>
                            </div>
                            <div className="flex flex-col mt-auto relative z-10">
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-3xl md:text-4xl font-black text-padel-green drop-shadow-[0_0_15px_rgba(190,255,0,0.3)] whitespace-nowrap">
                                        R {totalCollected.toLocaleString()}
                                    </h3>
                                    <span className="text-[9px] text-padel-green font-black uppercase tracking-widest opacity-70">Collected</span>
                                </div>
                                <p className="text-[10px] text-red-400 font-bold uppercase mt-1">Outstanding R {dashboardStats.outstanding.toLocaleString()}</p>
                            </div>
                        </motion.div>
                        
                        <motion.div 
                            whileHover={{ y: -5, scale: 1.02 }}
                            className="bg-gradient-to-br from-[#1E293B]/80 to-[#0F172A]/80 backdrop-blur-xl p-6 rounded-3xl border border-white/10 flex flex-col gap-2 relative overflow-hidden group shadow-2xl"
                        >
                            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 group-hover:-rotate-12 transition-all duration-500">
                                <Trophy size={120} />
                            </div>
                            <p className="text-xs font-black uppercase text-gray-400 tracking-widest relative z-10">Player Licenses</p>
                            <div className="flex items-center justify-between gap-3 mt-4 w-full relative z-10">
                                <div className="flex flex-col items-center">
                                    <span className="text-2xl font-black text-padel-green">{dashboardStats.licenses.full}</span>
                                    <span className="text-[10px] text-gray-400 uppercase font-bold mt-1">Full</span>
                                    <div className="w-full h-1 bg-padel-green/20 rounded-full mt-1 overflow-hidden"><div className="h-full bg-padel-green" style={{ width: `${(dashboardStats.licenses.full / dashboardStats.uniquePlayers) * 100}%` }}></div></div>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-2xl font-black text-sky-400">{dashboardStats.licenses.temp}</span>
                                    <span className="text-[10px] text-gray-400 uppercase font-bold mt-1">Temp</span>
                                    <div className="w-full h-1 bg-sky-400/20 rounded-full mt-1 overflow-hidden"><div className="h-full bg-sky-400" style={{ width: `${(dashboardStats.licenses.temp / dashboardStats.uniquePlayers) * 100}%` }}></div></div>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-2xl font-black text-red-400">{dashboardStats.licenses.none}</span>
                                    <span className="text-[10px] text-gray-400 uppercase font-bold mt-1">None</span>
                                    <div className="w-full h-1 bg-red-400/20 rounded-full mt-1 overflow-hidden"><div className="h-full bg-red-400" style={{ width: `${(dashboardStats.licenses.none / dashboardStats.uniquePlayers) * 100}%` }}></div></div>
                                </div>
                            </div>
                        </motion.div>
                        
                        <motion.div 
                            whileHover={{ y: -5, scale: 1.02 }}
                            className="bg-gradient-to-br from-[#1E293B]/80 to-[#0F172A]/80 backdrop-blur-xl p-6 rounded-3xl border border-white/10 flex flex-col gap-2 relative overflow-hidden group shadow-2xl"
                        >
                            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
                                <CheckCircle size={120} />
                            </div>
                            <p className="text-xs font-black uppercase text-gray-400 tracking-widest relative z-10">Paid Status</p>
                            <div className="flex items-baseline gap-2 mt-2 relative z-10">
                                <h3 className="text-4xl md:text-5xl font-black text-white drop-shadow-md">{localParticipants.filter(p => p.is_paid).length}</h3>
                                <span className="text-xs text-gray-400 font-bold uppercase">/ {localParticipants.length} Paid</span>
                            </div>
                            {/* Visual Progress Bar */}
                            <div className="w-full h-2 bg-black/40 rounded-full mt-auto relative z-10 overflow-hidden border border-white/5">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(localParticipants.filter(p => p.is_paid).length / (localParticipants.length || 1)) * 100}%` }}
                                    transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                                    className="h-full bg-gradient-to-r from-padel-green/50 to-padel-green rounded-full shadow-[0_0_10px_rgba(190,255,0,0.5)]"
                                />
                            </div>
                        </motion.div>
                    </motion.div>

                    {viewMode === 'dashboard' && (
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.3 }}
                            className="flex justify-center mt-12 relative z-20"
                        >
                            <button 
                                onClick={() => setViewMode('table')}
                                className="group relative flex items-center justify-center gap-3 bg-padel-green text-black px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-white hover:scale-105 transition-all shadow-[0_0_40px_rgba(190,255,0,0.15)] hover:shadow-[0_0_60px_rgba(255,255,255,0.3)] overflow-hidden"
                            >
                                <span className="relative z-10">View Full Table Data & Filters</span>
                                <div className="absolute inset-0 bg-white/20 -translate-x-[150%] group-hover:animate-[shimmer_1.5s_infinite] skew-x-12 z-0" />
                            </button>
                        </motion.div>
                    )}

                    {viewMode === 'table' && (
                    <div className="flex flex-col gap-6 mt-8 border-t border-white/5 pt-8">
                        {/* Search & Filters Grid */}
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col lg:flex-row gap-4">
                                <div className="relative w-full lg:w-72 shrink-0">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search synced participants..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-3 text-sm text-white focus:outline-none focus:border-padel-green font-bold"
                                />
                            </div>

                            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 w-full">
                                <select 
                                    value={filterProfile}
                                    onChange={(e) => setFilterProfile(e.target.value)}
                                    className="bg-black/20 border border-white/10 rounded-xl py-2 px-3 text-[10px] sm:text-xs text-gray-300 focus:outline-none focus:border-padel-green h-[44px] sm:h-[38px] cursor-pointer"
                                >
                                    <option value="all">Profiles: All</option>
                                    <option value="linked">Profiles: Linked</option>
                                    <option value="unlinked">Profiles: Unlinked</option>
                                </select>

                                <select 
                                    value={filterDivision}
                                    onChange={(e) => setFilterDivision(e.target.value)}
                                    className="bg-black/20 border border-white/10 rounded-xl py-2 px-3 text-[10px] sm:text-xs text-gray-300 focus:outline-none focus:border-padel-green h-[44px] sm:h-[38px] cursor-pointer"
                                >
                                    <option value="all">Division: All ({localParticipants.length})</option>
                                    {uniqueDivisions.map(div => (
                                        <option key={div} value={div}>{div} ({divisionCounts[div] || 0})</option>
                                    ))}
                                </select>

                                <select 
                                    value={filterLicense}
                                    onChange={(e) => setFilterLicense(e.target.value)}
                                    className="bg-black/20 border border-white/10 rounded-xl py-2 px-3 text-[10px] sm:text-xs text-gray-300 focus:outline-none focus:border-padel-green h-[44px] sm:h-[38px] cursor-pointer"
                                >
                                    <option value="all">Licenses: All</option>
                                    <option value="full">Licenses: Full</option>
                                    <option value="temporary">Licenses: Temp</option>
                                    <option value="none">Licenses: None</option>
                                </select>

                                <select 
                                    value={filterPayment}
                                    onChange={(e) => setFilterPayment(e.target.value)}
                                    className="bg-black/20 border border-white/10 rounded-xl py-2 px-3 text-[10px] sm:text-xs text-gray-300 focus:outline-none focus:border-padel-green h-[44px] sm:h-[38px] cursor-pointer"
                                >
                                    <option value="all">Fees: All</option>
                                    <option value="paid">Fees: Paid</option>
                                    <option value="unpaid">Fees: Unpaid</option>
                                </select>

                                <select 
                                    value={filterWhatsApp}
                                    onChange={(e) => setFilterWhatsApp(e.target.value)}
                                    className="bg-black/20 border border-white/10 rounded-xl py-2 px-3 text-[10px] sm:text-xs text-gray-300 focus:outline-none focus:border-padel-green h-[44px] sm:h-[38px] cursor-pointer"
                                >
                                    <option value="all">WhatsApp: All</option>
                                    <option value="added">WhatsApp: Added</option>
                                    <option value="not_added">WhatsApp: Pending</option>
                                </select>

                                {/* Sync buttons moved to header */}
                            </div>
                        </div>
                    </div>

                        {/* Top Stats & Export */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                            <button
                                onClick={handleExportExcel}
                                className="flex items-center justify-center gap-2 bg-[#beff00] hover:bg-[#beff00]/90 text-black px-6 py-3 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest shadow-lg sm:shrink-0 order-2 sm:order-1"
                            >
                                <Download size={14} />
                                Export Excel
                            </button>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 order-1 sm:order-2">
                                <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-start">
                                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest leading-tight">Total Entries</p>
                                    <p className="text-xl font-black text-white leading-none mt-1">{localParticipants.length}</p>
                                </div>
                                <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between items-start">
                                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest leading-tight">Unique Players</p>
                                    <p className="text-xl font-black text-white leading-none mt-1">{Object.keys(playerEntryCounts).length}</p>
                                </div>
                                <div className="bg-padel-green/5 p-3 rounded-xl border border-padel-green/10 flex flex-col justify-between items-start text-padel-green">
                                     <p className="text-[9px] font-black uppercase tracking-widest leading-tight">Paid Entries</p>
                                     <p className="text-xl font-black leading-none mt-1">{localParticipants.filter(p => p.is_paid).length}</p>
                                 </div>
                                 <div className="bg-padel-green p-3 rounded-xl border border-padel-green/20 flex flex-col justify-between items-start text-black shadow-lg shadow-padel-green/20">
                                     <p className="text-[9px] font-black uppercase tracking-widest opacity-70 leading-tight">Total Revenue</p>
                                     <p className="text-xl font-black leading-none mt-1">R {totalCollected}</p>
                                 </div>
                            </div>
                        </div>

                        <div className="bg-[#1E293B]/50 backdrop-blur-md rounded-3xl border border-white/10">
                        {/* DESKTOP TABLE VIEW */}
                        <div className="hidden lg:block overflow-x-auto max-h-[75vh] overflow-y-auto custom-scrollbar border border-white/5 rounded-2xl">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-20">
                                    <tr className="bg-[#1E293B]">
                                        <th className="sticky top-0 bg-[#1E293B] px-6 py-4 text-gray-400 text-[10px] uppercase font-black shadow-sm w-full">Participant (Rankedin)</th>
                                        <th className="sticky top-0 bg-[#1E293B] px-6 py-4 text-gray-400 text-[10px] uppercase font-black shadow-sm">Division</th>
                                        <th className="sticky top-0 bg-[#1E293B] px-2 py-4 text-gray-400 text-[10px] uppercase font-black shadow-sm w-[160px]">System Profile Match</th>
                                        <th className="sticky top-0 bg-[#1E293B] px-2 py-4 text-gray-400 text-[10px] uppercase font-black shadow-sm w-[120px]">Contact Number</th>
                                        <th className="sticky top-0 bg-[#1E293B] px-6 py-4 text-gray-400 text-[10px] uppercase font-black shadow-sm">License Status</th>
                                        <th className="sticky top-0 bg-[#1E293B] px-6 py-4 text-gray-400 text-[10px] uppercase font-black shadow-sm">WhatsApp</th>
                                        <th className="sticky top-0 bg-[#1E293B] px-6 py-4 text-gray-400 text-[10px] uppercase font-black shadow-sm">Entry Fee</th>
                                        <th className="sticky top-0 bg-[#1E293B] px-6 py-4 text-gray-400 text-[10px] uppercase font-black shadow-sm text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {loading.matching ? (
                                        <tr>
                                            <td colSpan="6" className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-padel-green" /></td>
                                        </tr>
                                    ) : filteredParticipants.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="py-12 text-center text-gray-500 font-bold italic">No matching participants found</td>
                                        </tr>
                                    ) : filteredParticipants.map(p => (
                                        <tr key={p.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-white">{p.full_name}</p>
                                                    {p.is_test && (
                                                        <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[8px] font-black uppercase rounded border border-orange-500/20">TEST</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest">{p.class_name}</span>
                                            </td>
                                            <td className="px-2 py-4 whitespace-nowrap">
                                                {p.players ? (
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2 text-padel-green font-bold text-sm">
                                                            <CheckCircle size={14} /> {p.players.name}
                                                            <button 
                                                                onClick={() => { setMatchingProfile(p); setProfileSearchQuery(''); }}
                                                                className="text-gray-600 hover:text-white transition-colors"
                                                            >
                                                                <Link2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button 
                                                        onClick={() => { setMatchingProfile(p); setProfileSearchQuery(''); }}
                                                        className="flex items-center gap-2 text-gray-600 hover:text-white transition-colors italic text-sm"
                                                    >
                                                        <UserPlus size={14} /> Link Profile
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-2 py-4 whitespace-nowrap">
                                                <span className="text-gray-300 font-mono text-[11px]">{p.players?.contact_number || '-'}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {p.players ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md max-w-fit uppercase ${
                                                            p.players.license_type === 'full' ? 'bg-padel-green/10 text-padel-green border border-padel-green/20' :
                                                            p.players.license_type === 'temporary' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                                            'bg-red-500/10 text-red-400 border border-red-500/20'
                                                        }`}>
                                                            {p.players.license_type || 'None'}
                                                        </span>
                                                        {!p.players.paid_registration && (
                                                            <span className="text-[8px] text-red-500 font-bold uppercase">Payment Required</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-600 text-[10px] font-bold uppercase italic">Unlinked</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => handleToggleWhatsApp(p)}
                                                    disabled={updatingWhatsApp === p.id}
                                                    className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                                                        p.whatsapp_added 
                                                        ? 'bg-green-500/10 border-green-500/20 text-green-500' 
                                                        : 'bg-white/5 border-white/10 text-gray-500 hover:text-white hover:border-white/20'
                                                    }`}
                                                    title={p.whatsapp_added ? "Mark as not added" : "Mark as added to WhatsApp"}
                                                >
                                                    {updatingWhatsApp === p.id ? (
                                                        <Loader2 size={14} className="animate-spin" />
                                                    ) : p.whatsapp_added ? (
                                                        <Check size={14} className="group-hover:hidden" />
                                                    ) : (
                                                        <MessageCircle size={14} />
                                                    )}
                                                    {p.whatsapp_added && <XCircle size={14} className="hidden group-hover:block text-red-500" />}
                                                    <span className="text-[10px] font-black uppercase tracking-tight">
                                                        {p.whatsapp_added ? 'On Group' : 'Add to WhatsApp'}
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                {p.is_paid ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="bg-padel-green/10 text-padel-green px-3 py-1 rounded-full text-[10px] font-black border border-padel-green/20 max-w-fit tracking-tighter">PAID</span>
                                                        <span className="text-[8px] text-gray-400 italic uppercase font-black tracking-wider">
                                                            {p.actual_payment?.metadata?.paid_by_name 
                                                                ? `By ${p.actual_payment.metadata.paid_by_name}`
                                                                : (p.actual_payment?.payment_method || p.metadata?.payment_method || 'System')}
                                                        </span>
                                                        {p.actual_payment && (
                                                            <span className="text-[8px] text-white font-black">
                                                                {Number(p.actual_payment.amount) === 0 ? 'PARTNER FEE' : `R ${p.actual_payment.amount}`}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="bg-red-500/10 text-red-400 px-3 py-1 rounded-full text-[10px] font-black border border-red-500/10 max-w-fit tracking-tighter">UNPAID</span>
                                                        <span className="text-[8px] text-gray-600 italic font-black uppercase">No record</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {p.is_paid ? (
                                                    <button
                                                        onClick={() => handleUnmarkPaid(p)}
                                                        disabled={markingPaid === p.id}
                                                        className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-red-400/50 hover:text-red-500 transition-colors"
                                                    >
                                                        {markingPaid === p.id ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />}
                                                        Unmark
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleMarkAsPaid(p)}
                                                        disabled={markingPaid === p.id}
                                                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase bg-white/5 hover:bg-padel-green hover:text-black px-4 py-2.5 rounded-xl border border-white/10 transition-all"
                                                    >
                                                        {markingPaid === p.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                                        {markingPaid === p.id ? '...' : 'Mark Entry Paid'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* MOBILE CARD VIEW */}
                        <div className="lg:hidden p-4 space-y-4">
                            {loading.matching ? (
                                <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-padel-green" /></div>
                            ) : filteredParticipants.length === 0 ? (
                                <div className="py-12 text-center text-gray-500 font-bold italic">No matching participants</div>
                            ) : filteredParticipants.map(p => (
                                <div 
                                    key={p.id} 
                                    className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                                        p.is_paid 
                                        ? 'bg-padel-green/5 border-padel-green/20' 
                                        : 'bg-[#1E293B]/80 border-white/5 shadow-xl'
                                    }`}
                                >
                                    {/* Top Status Bar */}
                                    <div className="p-5 pb-0 flex justify-between items-start mb-4">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-extrabold text-white text-lg truncate tracking-tight">{p.full_name}</p>
                                                {p.is_test && <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[7px] font-black uppercase rounded shrink-0">TEST</span>}
                                            </div>
                                            <p className="text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] mt-1 truncate opacity-70">{p.class_name}</p>
                                        </div>
                                        <div className="shrink-0 ml-4 flex flex-col items-end gap-2">
                                            <div className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${
                                                p.is_paid 
                                                ? 'bg-padel-green text-black border-padel-green' 
                                                : 'bg-red-500/10 text-red-500 border-red-500/20'
                                            }`}>
                                                {p.is_paid ? 'PAID' : 'UNPAID'}
                                            </div>
                                            <button
                                                onClick={() => handleToggleWhatsApp(p)}
                                                disabled={updatingWhatsApp === p.id}
                                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all shadow-sm ${
                                                    p.whatsapp_added 
                                                    ? 'bg-green-500/20 border-green-500/20 text-green-400' 
                                                    : 'bg-black/20 border-white/5 text-gray-500'
                                                }`}
                                            >
                                                {updatingWhatsApp === p.id ? (
                                                    <Loader2 size={10} className="animate-spin" />
                                                ) : (
                                                    <MessageCircle size={10} />
                                                )}
                                                <span className="text-[8px] font-black uppercase tracking-widest">
                                                    {p.whatsapp_added ? 'On Group' : 'Add to WhatsApp'}
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Info Grid */}
                                    <div className={`mx-5 p-4 rounded-xl grid grid-cols-2 gap-4 ${p.is_paid ? 'bg-black/20' : 'bg-black/40'}`}>
                                        <div className="space-y-1">
                                            <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">System Profile</p>
                                            {p.players ? (
                                                <div className="flex items-center gap-1.5 text-padel-green font-bold text-xs truncate">
                                                    <CheckCircle size={12} className="shrink-0" />
                                                    <span className="truncate">{p.players.name}</span>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => { setMatchingProfile(p); setProfileSearchQuery(''); }}
                                                    className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors italic text-xs font-medium"
                                                >
                                                    <UserPlus size={12} /> Link Profile
                                                </button>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Contact</p>
                                            <p className="text-[10px] text-white font-mono">{p.players?.contact_number || '-'}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Division</p>
                                            <p className="text-[10px] text-gray-300 font-bold uppercase truncate">{p.class_name}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">License</p>
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${
                                                p.players?.license_type === 'full' ? 'text-padel-green' :
                                                p.players?.license_type === 'temporary' ? 'text-sky-400' :
                                                'text-red-500'
                                            }`}>
                                                {p.players?.license_type || 'No License'}
                                            </span>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Payment Info</p>
                                            {p.is_paid ? (
                                                <div className="space-y-0.5">
                                                    <p className="text-[10px] text-padel-green font-black uppercase italic tracking-wider">
                                                        {p.actual_payment?.metadata?.paid_by_name 
                                                           ? `By ${p.actual_payment.metadata.paid_by_name}` 
                                                           : (p.actual_payment?.payment_method || p.metadata?.payment_method || 'System')}
                                                    </p>
                                                    {p.actual_payment && (
                                                        <p className="text-[10px] text-white font-black">R {p.actual_payment.amount}</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-[10px] text-gray-500 italic">No record</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="p-5 pt-4">
                                        {p.is_paid ? (
                                            <button
                                                onClick={() => handleUnmarkPaid(p)}
                                                disabled={markingPaid === p.id}
                                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-red-500/10 text-red-500/40 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/5 transition-all"
                                            >
                                                {markingPaid === p.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                                Revoke Payment Record
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleMarkAsPaid(p)}
                                                disabled={markingPaid === p.id}
                                                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-padel-green text-black hover:scale-[1.02] active:scale-[0.98] transition-all text-xs font-black uppercase tracking-[0.1em] shadow-xl shadow-padel-green/10"
                                            >
                                                {markingPaid === p.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                                {markingPaid === p.id ? 'Processing...' : 'Confirm Cash Received'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    </div>
                    )}
                </div>
                </React.Fragment>
            )}


            {/* Profile Matching Modal */}
            <AnimatePresence>
                {matchingProfile && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                            onClick={() => setMatchingProfile(null)}
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0F172A] border border-white/10 rounded-3xl p-8 w-full max-w-xl relative overflow-hidden"
                        >
                            <h3 className="text-2xl font-black text-white mb-2">Link 4m Padel Profile</h3>
                            <p className="text-gray-400 text-sm mb-6">Linking: <span className="text-padel-green font-bold">{matchingProfile.full_name}</span></p>
                            
                            <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
                                {systemProfiles
                                    .filter(sp => sp.name.toLowerCase().includes(matchingProfile.full_name.toLowerCase()) || matchingProfile.full_name.toLowerCase().includes(sp.name.toLowerCase()))
                                    .map(sp => (
                                        <button
                                            key={sp.id}
                                            onClick={() => handleMatchProfile(matchingProfile.id, sp.id)}
                                            className="w-full bg-white/5 hover:bg-padel-green hover:text-black p-4 rounded-2xl border border-white/5 text-left transition-all group"
                                        >
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-bold">{sp.name}</p>
                                                    <p className="text-xs opacity-60">{sp.email}</p>
                                                </div>
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <CheckCircle size={20} />
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                }
                                <div className="pt-4 border-t border-white/5">
                                    <p className="text-gray-600 text-xs uppercase font-black mb-4 tracking-widest">Other Profiles</p>
                                    <div className="relative mb-4">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                                        <input 
                                            type="text" placeholder="Search all players..." 
                                            className="w-full bg-black/40 border border-white/5 rounded-xl py-2 pl-10 text-sm text-white"
                                            value={profileSearchQuery}
                                            onChange={(e) => setProfileSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {systemProfiles
                                            .filter(sp => !profileSearchQuery || (sp.name && sp.name.toLowerCase().includes(profileSearchQuery.toLowerCase())) || (sp.email && sp.email.toLowerCase().includes(profileSearchQuery.toLowerCase())))
                                            .slice(0, profileSearchQuery ? 20 : 5)
                                            .map(sp => (
                                            <button
                                                key={sp.id}
                                                onClick={() => handleMatchProfile(matchingProfile.id, sp.id)}
                                                className="w-full bg-white/5 hover:bg-white/10 p-3 rounded-xl text-left transition-all flex justify-between items-center"
                                            >
                                                <span className="text-sm">{sp.name}</span>
                                                <span className="text-gray-600 text-[10px]">{sp.email}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={() => setMatchingProfile(null)}
                                className="w-full mt-6 py-3 text-gray-500 hover:text-white transition-colors font-bold"
                            >
                                Cancel
                            </button>
                        </motion.div>
                        </div>
                    )}
            </AnimatePresence>
        </div>
    );
};

export default EventFinance;
