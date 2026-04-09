import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Calendar, Users, CheckCircle, XCircle, Search, Download, 
    RefreshCcw, Loader2, AlertCircle, UserPlus, Link2, ExternalLink, Trophy
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useRankedin } from '../../hooks/useRankedin';
import { toast } from 'sonner';
import ExcelJS from 'exceljs';
import logo4m from '../../assets/logo_4m_lowercase.png';

const EventFinance = ({ allowedEvents = [] }) => {
    const [events, setEvents] = useState([]);
    const [selectedEventId, setSelectedEventId] = useState(null);
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

    const { getTournamentPlayerTabs, getTournamentParticipants } = useRankedin();

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

        // Filter by allowedEvents permissions if any
        if (allowedEvents && allowedEvents.length > 0) {
            sorted = sorted.filter(e => allowedEvents.includes(e.id));
        }

        if (!eventSearch) return sorted;
        return sorted.filter(e => e.event_name.toLowerCase().includes(eventSearch.toLowerCase()));
    }, [events, eventSearch, allowedEvents]);
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(prev => ({ ...prev, events: true }));
            try {
                const { data: eData } = await supabase
                    .from('calendar')
                    .select('id, event_name, start_date, rankedin_id, rankedin_url, entry_fee, category_fees')
                    .order('start_date', { ascending: false });
                setEvents(eData || []);

                const { data: pData } = await supabase
                    .from('players')
                    .select('id, name, email, license_type, paid_registration');
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
            const { data, error } = await supabase
                .from('tournament_participants')
                .select('*, players(id, name, email, license_type, paid_registration)')
                .eq('event_id', eventId)
                .order('full_name');
            if (error) throw error;
            setLocalParticipants(data || []);
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

            // Deduplicate
            const seenIds = new Map();
            externalParticipants.forEach(p => seenIds.set(p.rankedin_participant_id, p));
            externalParticipants = Array.from(seenIds.values());

            // Step 3: Fetch existing participants and PAID registrations
            const [{ data: existingRows }, { data: paidRegs }] = await Promise.all([
                supabase.from('tournament_participants').select('id, rankedin_participant_id').eq('event_id', eventId),
                supabase.from('event_registrations').select('full_name, email, payment_status').eq('event_id', eventId).eq('payment_status', 'paid')
            ]);

            const existingMap = new Map((existingRows || []).map(r => [r.rankedin_participant_id, r.id]));
            const paidRegNames = new Set((paidRegs || []).map(r => r.full_name.toLowerCase().trim()));

            console.info(`Found ${paidRegNames.size} paid registrations in system for ${eventName}. Checking for matches...`);

            // Step 4: Upsert participants
            for (const p of externalParticipants) {
                // Auto-match system profile
                const nameLower = p.full_name.toLowerCase().trim();
                let autoProfileId = null;
                const matchedProfile = systemProfiles.find(sp => 
                    sp.name && (sp.name.toLowerCase().includes(nameLower) || nameLower.includes(sp.name.toLowerCase()))
                );
                if (matchedProfile) autoProfileId = matchedProfile.id;

                // SPECIAL FIX: Check if this player already PAID in our system
                const alreadyPaidInSystem = paidRegNames.has(nameLower);

                const participantData = {
                    event_id: eventId,
                    rankedin_participant_id: p.rankedin_participant_id,
                    full_name: p.full_name,
                    class_name: p.class_name,
                    ...(autoProfileId ? { profile_id: autoProfileId } : {}),
                    ...(alreadyPaidInSystem ? { is_paid: true } : {}) // AUTO-MARK PAID if registration exists
                };

                const existingId = existingMap.get(p.rankedin_participant_id);
                const { error: dbError } = existingId 
                    ? await supabase.from('tournament_participants').update(participantData).eq('id', existingId)
                    : await supabase.from('tournament_participants').insert(participantData);

                if (dbError) {
                    console.error('Sync DB Error:', dbError);
                    errorCount++;
                } else {
                    successCount++;
                }
            }

            return { success: successCount, error: errorCount };
        } catch (err) {
            console.error(`Core sync error for ${eventName}:`, err);
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
            // Update local participant table
            const { error: pError } = await supabase
                .from('tournament_participants')
                .update({ is_paid: true })
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
        if (!confirm(`Are you sure you want to unmark ${participant.full_name} as paid? This will not delete the payment record but will reset their status for this event.`)) return;
        
        setMarkingPaid(participant.id);
        try {
            const { error: pError } = await supabase
                .from('tournament_participants')
                .update({ is_paid: false })
                .eq('id', participant.id);
            if (pError) throw pError;

            toast.success(`Reset ${participant.full_name} status to unpaid`);
            fetchParticipants(selectedEventId);
        } catch (err) {
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
            sheet.mergeCells('A1:E1');

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
            const headers = ['Participant Name', 'Division', 'System Profile', 'Email', 'License Type', 'Event Payment Status'];
            const headerRow = sheet.addRow(headers);
            headerRow.font = { bold: true };
            
            // Add auto-filter to header row
            sheet.autoFilter = 'A3:F3';

            // Add Data Rows
            sortedParticipants.forEach(p => {
                sheet.addRow([
                    p.full_name,
                    p.class_name || 'N/A',
                    p.players?.name || 'Unlinked',
                    p.players?.email || 'N/A',
                    p.players?.license_type || 'None',
                    p.is_paid ? 'PAID' : 'UNPAID'
                ]);
            });

            // Expand columns to fit content
            for (let i = 1; i <= 6; i++) {
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

    const filteredParticipants = localParticipants.filter(p => {
        const matchesSearch = p.full_name.toLowerCase().includes(searchQuery.toLowerCase());
        
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

        return matchesSearch && matchesProfile && matchesLicense && matchesPayment && matchesDivision;
    });

    return (
        <div className="space-y-6">
            {/* Header & Managed Events List */}
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
                                    <th className="px-6 py-3 text-right">Status / Quick View</th>
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
                                                onClick={() => setSelectedEventId(e.id)}
                                                className={`group cursor-pointer transition-all ${isSelected ? 'bg-padel-green/10' : 'hover:bg-white/5'}`}
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <p className={`text-[11px] font-bold ${isSelected ? 'text-padel-green' : 'text-gray-400'}`}>
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
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-3 translate-x-2">
                                                        <button
                                                            onClick={(ev) => {
                                                                    ev.stopPropagation();
                                                                    handleSyncFromRankedin(e);
                                                            }}
                                                            disabled={loading.syncing}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
                                                                isSelected 
                                                                ? 'bg-black/20 border-black/10 hover:bg-black/30' 
                                                                : 'bg-white/5 border-white/10 hover:bg-padel-green hover:text-black hover:border-padel-green'
                                                            }`}
                                                        >
                                                            {loading.syncing && isSelected ? <Loader2 className="animate-spin" size={10} /> : <RefreshCcw size={10} />}
                                                            Sync
                                                        </button>
                                                        <div className={`p-2 rounded-lg transition-colors ${isSelected ? 'bg-padel-green text-black shadow-inner' : 'bg-white/5 text-padel-green opacity-0 group-hover:opacity-100'}`}>
                                                            <ExternalLink size={14} />
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {selectedEventId && (
                <div className="space-y-6 text-white pt-8 border-t border-white/5">
                    {/* Active Event Indicator */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">
                                {events.find(e => e.id === selectedEventId)?.event_name}
                            </h2>
                            <div className="flex items-center gap-2 px-3 py-1 bg-padel-green text-black text-[10px] font-black uppercase rounded-lg shadow-lg shadow-padel-green/20">
                                <Trophy size={12} /> Selected Tournament
                            </div>
                        </div>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-[0.3em] flex items-center gap-2">
                            <Calendar size={12} />
                            {new Date(events.find(e => e.id === selectedEventId)?.start_date).toLocaleDateString(undefined, { 
                                weekday: 'long', 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                            })}
                        </p>
                    </div>

                    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                            <div className="relative w-full sm:w-64 shrink-0">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search synced participants..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-padel-green"
                                />
                            </div>
                            
                            <select 
                                value={filterProfile}
                                onChange={(e) => setFilterProfile(e.target.value)}
                                className="bg-black/20 border border-white/10 rounded-xl py-2 px-3 text-xs text-gray-300 focus:outline-none focus:border-padel-green h-[38px] cursor-pointer"
                            >
                                <option value="all">Profiles: All</option>
                                <option value="linked">Profiles: Linked</option>
                                <option value="unlinked">Profiles: Unlinked</option>
                            </select>

                            <select 
                                value={filterDivision}
                                onChange={(e) => setFilterDivision(e.target.value)}
                                className="bg-black/20 border border-white/10 rounded-xl py-2 px-3 text-xs text-gray-300 focus:outline-none focus:border-padel-green h-[38px] cursor-pointer"
                            >
                                <option value="all">Division: All</option>
                                {uniqueDivisions.map(div => (
                                    <option key={div} value={div}>{div}</option>
                                ))}
                            </select>

                            <select 
                                value={filterLicense}
                                onChange={(e) => setFilterLicense(e.target.value)}
                                className="bg-black/20 border border-white/10 rounded-xl py-2 px-3 text-xs text-gray-300 focus:outline-none focus:border-padel-green h-[38px] cursor-pointer"
                            >
                                <option value="all">Licenses: All</option>
                                <option value="full">Licenses: Full</option>
                                <option value="temporary">Licenses: Temp</option>
                                <option value="none">Licenses: None</option>
                            </select>

                            <select 
                                value={filterPayment}
                                onChange={(e) => setFilterPayment(e.target.value)}
                                className="bg-black/20 border border-white/10 rounded-xl py-2 px-3 text-xs text-gray-300 focus:outline-none focus:border-padel-green h-[38px] cursor-pointer"
                            >
                                <option value="all">Fees: All</option>
                                <option value="paid">Fees: Paid</option>
                                <option value="unpaid">Fees: Unpaid</option>
                            </select>
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={handleExportExcel}
                                className="flex items-center gap-2 bg-[#beff00] hover:bg-[#beff00]/90 text-black px-4 py-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest shadow-lg sm:shrink-0"
                            >
                                <Download size={14} />
                                Export Excel
                            </button>
                            <div className="bg-white/5 px-4 py-2 rounded-xl text-center">
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Total Players</p>
                                <p className="text-xl font-black text-white">{localParticipants.length}</p>
                            </div>
                            <div className="bg-padel-green/10 px-4 py-2 rounded-xl text-center border border-padel-green/20">
                                <p className="text-[10px] text-padel-green font-bold uppercase">Paid</p>
                                <p className="text-xl font-black text-padel-green">{localParticipants.filter(p => p.is_paid).length}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#1E293B]/50 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-black/20 text-gray-400 text-[10px] uppercase font-black">
                                <tr>
                                    <th className="px-6 py-4">Participant (Rankedin)</th>
                                    <th className="px-6 py-4">Division</th>
                                    <th className="px-6 py-4">System Profile Match</th>
                                    <th className="px-6 py-4">License Status</th>
                                    <th className="px-6 py-4">Entry Fee</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading.matching ? (
                                    <tr>
                                        <td colSpan="6" className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-padel-green" /></td>
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
                                            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">{p.class_name}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
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
                                                    <span className="text-[10px] text-gray-500 ml-6 font-bold truncate max-w-[150px]">{p.players.email}</span>
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
                                        <td className="px-6 py-4">
                                            {p.players ? (
                                                <div className="flex flex-col gap-1">
                                                    <span className={`text-[10px] font-black px-2 py-1 rounded-md max-w-fit uppercase ${
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
                                            {p.is_paid ? (
                                                <div className="flex flex-col gap-1">
                                                    <span className="bg-padel-green/10 text-padel-green px-3 py-1 rounded-full text-[10px] font-black border border-padel-green/20 max-w-fit">PAID</span>
                                                    <span className="text-[8px] text-gray-500 italic">Confirmed</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    <span className="bg-red-500/10 text-red-400 px-3 py-1 rounded-full text-[10px] font-black border border-red-500/10 max-w-fit">UNPAID</span>
                                                    <span className="text-[8px] text-gray-600 italic">No record</span>
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
                                                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase bg-white/5 hover:bg-padel-green hover:text-black px-3 py-2 rounded-lg border border-white/10 transition-all font-medium"
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
                </div>
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
