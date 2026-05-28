import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    GitBranch, Users, Settings, Plus, Play, RefreshCcw, 
    Trash2, AlertTriangle, ShieldCheck, CheckCircle2, ChevronRight,
    Sliders, Save, Award, Info
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';
import { 
    generateAllKnockoutRounds, 
    generateAllPlateRounds, 
    generateGroupDraw 
} from '../../utils/tmsDrawEngine';
import { adaptLocalDrawToKnockoutBracket } from '../../utils/tmsAdapter';
import KnockoutBracket from '../KnockoutBracket';

const EventDraws = ({ allowedEvents = [], isEventManagementModule = false }) => {
    // Event list states
    const [events, setEvents] = useState([]);
    const [selectedEventId, setSelectedEventId] = useState(null);
    const [loading, setLoading] = useState({ events: true, divisions: false, teams: false, generating: false });
    
    // Division states
    const [divisions, setDivisions] = useState([]);
    const [selectedDivId, setSelectedDivId] = useState('');
    
    // Active division team list & details
    const [teams, setTeams] = useState([]);
    const [seedingPoints, setSeedingPoints] = useState({}); // player email -> rolling ranking points
    const [divisionConfig, setDivisionConfig] = useState({
        draw_type: 'single_elimination',
        has_plate: false,
        match_format: 'best_of_3_with_match_tiebreak',
        scoring_format: 'standard',
        max_teams: 16
    });

    // Existing draws in DB
    const [existingDraws, setExistingDraws] = useState([]);
    const [existingMatches, setExistingMatches] = useState([]);
    const [drawPreviewData, setDrawPreviewData] = useState([]);

    // Config form states
    const [groupCount, setGroupCount] = useState(2);
    const [activeSubTab, setActiveSubTab] = useState('setup'); // 'setup' | 'preview'

    const selectedEvent = useMemo(() => 
        events.find(e => e.id === selectedEventId), 
        [events, selectedEventId]
    );

    const activeDivision = useMemo(() => 
        divisions.find(d => d.id === selectedDivId), 
        [divisions, selectedDivId]
    );

    const uniqueDivisions = useMemo(() => {
        const seen = new Set();
        const result = [];
        divisions.forEach(d => {
            if (d.name) {
                const norm = d.name.toLowerCase().replace(/['’]/g, '').trim();
                if (!seen.has(norm)) {
                    seen.add(norm);
                    result.push(d);
                }
            }
        });
        return result;
    }, [divisions]);

    // 1. Initial Load: Fetch Events & Seeding Points Map
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(prev => ({ ...prev, events: true }));
            try {
                // Fetch calendar events
                const { data: eData } = await supabase
                    .from('calendar')
                    .select('id, event_name, start_date, finance_managed')
                    .order('start_date', { ascending: false });
                
                // Filter local/finance managed events
                let filtered = eData || [];
                if (isEventManagementModule) {
                    filtered = filtered.filter(e => e.finance_managed);
                }
                if (allowedEvents && allowedEvents.length > 0) {
                    filtered = filtered.filter(e => allowedEvents.includes(e.id));
                }
                setEvents(filtered);

                // Fetch rolling ranking history to calculate player points (last 12 months)
                const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
                const [{ data: rankingData }, { data: playersData }] = await Promise.all([
                    supabase
                        .from('ranking_history')
                        .select('player_id, points_earned')
                        .gte('created_at', oneYearAgo),
                    supabase
                        .from('players')
                        .select('id, email')
                ]);

                // Map player_id -> active rolling points sum
                const pointsMap = {};
                (rankingData || []).forEach(r => {
                    pointsMap[r.player_id] = (pointsMap[r.player_id] || 0) + r.points_earned;
                });

                // Map player email -> points sum
                const emailPointsMap = {};
                (playersData || []).forEach(p => {
                    if (p.email) {
                        const emailLower = p.email.toLowerCase().trim();
                        emailPointsMap[emailLower] = pointsMap[p.id] || 0;
                    }
                });
                setSeedingPoints(emailPointsMap);

            } catch (err) {
                console.error("Initial load error:", err);
                toast.error("Failed to load initial draws data");
            } finally {
                setLoading(prev => ({ ...prev, events: false }));
            }
        };
        fetchInitialData();
    }, [allowedEvents, isEventManagementModule]);

    // Auto-select first event if permissions restrict
    useEffect(() => {
        if (events.length > 0 && !selectedEventId) {
            setSelectedEventId(events[0].id);
        }
    }, [events, selectedEventId]);

    // 2. Fetch Divisions & Auto-Initialize from Registrations on Event Select
    useEffect(() => {
        if (!selectedEventId) {
            setDivisions([]);
            return;
        }

        const fetchAndInitDivisions = async () => {
            setLoading(prev => ({ ...prev, divisions: true }));
            try {
                // Query current divisions in DB
                const { data: dbDivisions } = await supabase
                    .from('tournament_divisions')
                    .select('*')
                    .eq('event_id', selectedEventId);

                // Fetch unique divisions from paid registrations to auto-create missing ones
                const { data: paidRegs } = await supabase
                    .from('event_registrations')
                    .select('division')
                    .eq('event_id', selectedEventId)
                    .eq('payment_status', 'paid');

                const normalizeDivName = (name) => {
                    if (!name) return '';
                    return name.toLowerCase().replace(/['’]/g, '').trim();
                };

                // Deduplicate registration division names using normalized values
                const regDivNames = [];
                const seenRegDivs = new Set();
                (paidRegs || []).forEach(r => {
                    if (r.division) {
                        const norm = normalizeDivName(r.division);
                        if (!seenRegDivs.has(norm)) {
                            seenRegDivs.add(norm);
                            regDivNames.push(r.division);
                        }
                    }
                });
                
                // Filter out names already represented in DB divisions (normalized check)
                const missingDivs = regDivNames.filter(name => {
                    const norm = normalizeDivName(name);
                    return !(dbDivisions || []).some(dbD => normalizeDivName(dbD.name) === norm);
                });

                if (missingDivs.length > 0) {
                    const toInsert = missingDivs.map(name => ({
                        event_id: selectedEventId,
                        name: name,
                        draw_type: 'single_elimination',
                        has_plate: false,
                        match_format: 'best_of_3_with_match_tiebreak',
                        scoring_format: 'standard',
                        max_teams: 16
                    }));

                    const { data: newDivs, error: insertErr } = await supabase
                        .from('tournament_divisions')
                        .insert(toInsert)
                        .select();

                    if (!insertErr && newDivs) {
                        const allDivs = [...(dbDivisions || []), ...newDivs];
                        setDivisions(allDivs);
                        // Auto-select first unique division
                        const seen = new Set();
                        const unique = allDivs.filter(d => {
                            const norm = normalizeDivName(d.name);
                            if (seen.has(norm)) return false;
                            seen.add(norm);
                            return true;
                        });
                        if (unique.length > 0 && !selectedDivId) {
                            setSelectedDivId(unique[0].id);
                        }
                    } else {
                        setDivisions(dbDivisions || []);
                    }
                } else {
                    setDivisions(dbDivisions || []);
                    // Auto-select first unique division
                    const seen = new Set();
                    const unique = (dbDivisions || []).filter(d => {
                        const norm = normalizeDivName(d.name);
                        if (seen.has(norm)) return false;
                        seen.add(norm);
                        return true;
                    });
                    if (unique.length > 0 && !selectedDivId) {
                        setSelectedDivId(unique[0].id);
                    }
                }
            } catch (err) {
                console.error("Fetch divisions error:", err);
            } finally {
                setLoading(prev => ({ ...prev, divisions: false }));
            }
        };

        fetchAndInitDivisions();
    }, [selectedEventId]);

    // 3. Sync division configuration details when selected division changes
    useEffect(() => {
        if (!selectedDivId || divisions.length === 0) return;
        const active = divisions.find(d => d.id === selectedDivId);
        if (active) {
            setDivisionConfig({
                draw_type: active.draw_type || 'single_elimination',
                has_plate: active.has_plate || false,
                match_format: active.match_format || 'best_of_3_with_match_tiebreak',
                scoring_format: active.scoring_format || 'standard',
                max_teams: active.max_teams || 16
            });
        }
    }, [selectedDivId, divisions]);

    // 4. Fetch Teams and Active Draws for selected Division
    const fetchTeamsAndDraws = async () => {
        if (!selectedDivId || !selectedEventId) return;
        setLoading(prev => ({ ...prev, teams: true }));
        try {
            const activeDiv = divisions.find(d => d.id === selectedDivId);
            if (!activeDiv) return;

            // Fetch paid registrations for this event
            const [{ data: regsData }, { data: drawsData }, { data: matchesData }] = await Promise.all([
                supabase
                    .from('event_registrations')
                    .select('*')
                    .eq('event_id', selectedEventId)
                    .eq('payment_status', 'paid'),
                supabase
                    .from('tournament_draws')
                    .select('*')
                    .eq('division_id', selectedDivId),
                supabase
                    .from('tournament_matches')
                    .select(`
                        *,
                        team_1:team_1_reg_id(id, full_name, partner_name),
                        team_2:team_2_reg_id(id, full_name, partner_name)
                    `)
                    .eq('division_id', selectedDivId)
                    .order('match_index')
            ]);

            setExistingDraws(drawsData || []);
            setExistingMatches(matchesData || []);

            // Filter registrations dynamically matching normalized division name
            const activeNorm = activeDiv.name.toLowerCase().replace(/['’]/g, '').trim();
            const matchedRegs = (regsData || []).filter(r => 
                r.division && r.division.toLowerCase().replace(/['’]/g, '').trim() === activeNorm
            );

            // 4a. Pair registrations into teams and deduplicate per division!
            const paired = [];
            const seen = new Set();

            (regsData || []).forEach(reg => {
                const name1 = reg.full_name?.toLowerCase().trim();
                const name2 = reg.partner_name?.toLowerCase().trim() || '';
                const pairKey = [name1, name2].sort().join('|');

                if (seen.has(pairKey)) return;
                seen.add(pairKey);

                // Calculate Seeding Points
                const email1 = reg.email?.toLowerCase().trim();
                const email2 = reg.partner_email?.toLowerCase().trim();
                const pts1 = seedingPoints[email1] || 0;
                const pts2 = email2 ? (seedingPoints[email2] || 0) : 0;
                const combinedPoints = pts1 + pts2;

                paired.push({
                    id: reg.id,
                    full_name: reg.full_name,
                    partner_name: reg.partner_name || 'TBD',
                    email: reg.email,
                    partner_email: reg.partner_email,
                    points: combinedPoints,
                    seed: null // Will assign seeds sequentially after sort
                });
            });

            // Sort by combined rolling points descending
            const sortedTeams = paired.sort((a, b) => b.points - a.points);
            
            // Assign default seed values to top teams
            const seeded = sortedTeams.map((t, idx) => ({
                ...t,
                seed: idx < 4 ? idx + 1 : null // Default seed top 4
            }));

            setTeams(seeded);

            // 4b. Map visual preview data if draw already exists!
            if (drawsData && drawsData.length > 0 && matchesData && matchesData.length > 0) {
                const mainDraw = drawsData.find(d => d.type === 'bracket' && d.name.toLowerCase().includes('main'));
                const targetDraw = mainDraw || drawsData[0];

                const mainMatches = matchesData.filter(m => m.draw_id === targetDraw.id);
                const bracketSize = Math.max(2, Math.pow(2, Math.ceil(Math.log2(seeded.length))));
                const totalRounds = Math.log2(bracketSize);

                const adapted = adaptLocalDrawToKnockoutBracket(
                    mainMatches, 
                    targetDraw.name, 
                    activeDiv.draw_type, 
                    totalRounds
                );
                setDrawPreviewData(adapted);
                setActiveSubTab('preview');
            } else {
                setDrawPreviewData([]);
                setActiveSubTab('setup');
            }

        } catch (err) {
            console.error("Fetch teams/draws error:", err);
            toast.error("Failed to sync division entries");
        } finally {
            setLoading(prev => ({ ...prev, teams: false }));
        }
    };

    useEffect(() => {
        fetchTeamsAndDraws();
    }, [selectedDivId, seedingPoints]);

    // 5. Update Seeding / Seeds Manually
    const handleUpdateSeed = (teamId, seedValue) => {
        setTeams(prev => prev.map(t => 
            t.id === teamId ? { ...t, seed: seedValue ? parseInt(seedValue, 10) : null } : t
        ));
    };

    // 6. Update Division Config in Database
    const handleSaveConfig = async () => {
        if (!selectedDivId) return;
        try {
            const { error } = await supabase
                .from('tournament_divisions')
                .update(divisionConfig)
                .eq('id', selectedDivId);
            
            if (error) throw error;
            toast.success("Division configuration updated successfully!");
            
            // Update local state
            setDivisions(prev => prev.map(d => 
                d.id === selectedDivId ? { ...d, ...divisionConfig } : d
            ));
        } catch (err) {
            toast.error("Failed to save division configurations");
        }
    };

    // 7. Delete / Reset Existing Draw
    const handleResetDraw = async () => {
        if (!selectedDivId) return;
        if (!confirm("⚠️ WARNING: This will permanently delete all generated draws, match card scores, and schedules for this division. Are you sure you want to completely wipe and reset the draw?")) return;

        setLoading(prev => ({ ...prev, generating: true }));
        try {
            // Because ON DELETE CASCADE is configured, deleting from tournament_draws will auto-delete tournament_matches!
            const { error } = await supabase
                .from('tournament_draws')
                .delete()
                .eq('division_id', selectedDivId);

            if (error) throw error;
            
            toast.success("Draw completely wiped and reset!");
            setExistingDraws([]);
            setExistingMatches([]);
            setDrawPreviewData([]);
            setActiveSubTab('setup');
            fetchTeamsAndDraws();
        } catch (err) {
            console.error("Reset draw error:", err);
            toast.error("Failed to reset division draws");
        } finally {
            setLoading(prev => ({ ...prev, generating: false }));
        }
    };

    // 8. Generate & Publish Local Draw
    const handleGenerateDraw = async () => {
        if (!selectedDivId || teams.length === 0) {
            toast.error("No entries available to generate draw.");
            return;
        }

        setLoading(prev => ({ ...prev, generating: true }));
        try {
            // First save latest configurations to DB
            await handleSaveConfig();

            // Prepare team list sorted by seed (seeds 1, 2, 3... first, then others)
            const sortedSeededTeams = [...teams].sort((a, b) => {
                if (a.seed && !b.seed) return -1;
                if (!a.seed && b.seed) return 1;
                if (a.seed && b.seed) return a.seed - b.seed;
                return b.points - a.points; // Fallback to ranking points
            });

            const activeDiv = divisions.find(d => d.id === selectedDivId);

            if (divisionConfig.draw_type === 'single_elimination') {
                // 8a. Single Elimination Brackets
                // 1. Create Main Draw row
                const { data: mainDrawRow, error: mainDrawErr } = await supabase
                    .from('tournament_draws')
                    .insert({
                        division_id: selectedDivId,
                        name: "Main Draw",
                        type: "bracket",
                        metadata: { seeds: sortedSeededTeams.slice(0, 4) }
                    })
                    .select()
                    .single();

                if (mainDrawErr || !mainDrawRow) throw mainDrawErr;

                // 2. Generate all knockout matches in memory (with BYE auto-propagation)
                const knockoutMatches = generateAllKnockoutRounds(
                    sortedSeededTeams, 
                    selectedDivId, 
                    mainDrawRow.id
                );

                // 3. Save Main Draw matches to DB
                const { error: matchInsertErr } = await supabase
                    .from('tournament_matches')
                    .insert(knockoutMatches);

                if (matchInsertErr) throw matchInsertErr;

                // 4. Create Plate Draw if has_plate is enabled
                if (divisionConfig.has_plate) {
                    const { data: plateDrawRow, error: plateDrawErr } = await supabase
                        .from('tournament_draws')
                        .insert({
                            division_id: selectedDivId,
                            name: "Plate Draw",
                            type: "bracket",
                            metadata: {}
                        })
                        .select()
                        .single();

                    if (plateDrawErr || !plateDrawRow) throw plateDrawErr;

                    // Calculate plate size based on main bracket size
                    const bracketSize = Math.max(2, Math.pow(2, Math.ceil(Math.log2(sortedSeededTeams.length))));
                    const plateMatches = generateAllPlateRounds(
                        bracketSize, 
                        selectedDivId, 
                        plateDrawRow.id
                    );

                    const { error: plateMatchInsertErr } = await supabase
                        .from('tournament_matches')
                        .insert(plateMatches);

                    if (plateMatchInsertErr) throw plateMatchInsertErr;
                }

                toast.success(`Published Main Draw Bracket (${knockoutMatches.length} matches)!`);

            } else {
                // 8b. Round Robin Group Stage
                // 1. Generate Groups in memory snake-style
                const { groups, allMatches } = generateGroupDraw(
                    sortedSeededTeams, 
                    selectedDivId, 
                    groupCount
                );

                // 2. Save each group row to tournament_draws and bulk insert their matches
                for (const group of groups) {
                    const { data: gDrawRow, error: gDrawErr } = await supabase
                        .from('tournament_draws')
                        .insert({
                            division_id: selectedDivId,
                            name: group.name,
                            type: "group",
                            metadata: { teams: group.teams }
                        })
                        .select()
                        .single();

                    if (gDrawErr || !gDrawRow) throw gDrawErr;

                    // Filter matches for this group and set their draw_id
                    const groupMatches = allMatches
                        .filter(m => m.round_name === group.name)
                        .map(m => ({ ...m, draw_id: gDrawRow.id }));

                    const { error: gMatchInsertErr } = await supabase
                        .from('tournament_matches')
                        .insert(groupMatches);

                    if (gMatchInsertErr) throw gMatchInsertErr;
                }

                toast.success(`Published Group Stage Draw with ${groupCount} groups!`);
            }

            // Sync calendar event status to 'in_progress' to unlock visual updates
            await supabase
                .from('calendar')
                .update({ status: 'in_progress' })
                .eq('id', selectedEventId);

            // Reload drawing records
            fetchTeamsAndDraws();

        } catch (err) {
            console.error("Draw generation error:", err);
            toast.error(`Draw Generation Failed: ${err.message}`);
        } finally {
            setLoading(prev => ({ ...prev, generating: false }));
        }
    };

    return (
        <div className="space-y-6">
            {/* Event & Division Selector Card */}
            <div className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-3xl border border-white/10 shadow-xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Select Event */}
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2.5">Active Event</label>
                        <select
                            value={selectedEventId || ''}
                            onChange={(e) => {
                                setSelectedEventId(e.target.value ? parseInt(e.target.value, 10) : null);
                                setSelectedDivId('');
                            }}
                            className="w-full bg-black/30 border border-white/10 text-white rounded-2xl px-5 py-4 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green/30 transition-all font-bold text-sm cursor-pointer appearance-none"
                            disabled={loading.events}
                        >
                            {loading.events && <option>Syncing events list...</option>}
                            {events.map(e => (
                                <option key={e.id} value={e.id}>{e.event_name} ({new Date(e.start_date).toLocaleDateString('en-GB')})</option>
                            ))}
                        </select>
                    </div>

                    {/* Select Division */}
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2.5">Category Division</label>
                        <select
                            value={selectedDivId}
                            onChange={(e) => setSelectedDivId(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 text-white rounded-2xl px-5 py-4 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green/30 transition-all font-bold text-sm cursor-pointer appearance-none"
                            disabled={loading.divisions || uniqueDivisions.length === 0}
                        >
                            {uniqueDivisions.length === 0 && <option>No active paid entries detected.</option>}
                            {uniqueDivisions.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {selectedDivId && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Left Column: Entries Seeding Grid */}
                        <div className="lg:col-span-7 space-y-6">
                            <div className="bg-[#131C2F]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-2xl">
                                <div className="flex justify-between items-center mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-padel-green/10 text-padel-green rounded-xl flex items-center justify-center">
                                            <Users size={18} />
                                        </div>
                                        <div>
                                            <h3 className="text-white font-bold tracking-tight">Paid Entries</h3>
                                            <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{teams.length} Pairs Registered</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={fetchTeamsAndDraws}
                                        className="p-2 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors"
                                    >
                                        <RefreshCcw size={16} />
                                    </button>
                                </div>

                                {loading.teams ? (
                                    <div className="flex flex-col items-center justify-center py-20">
                                        <RefreshCcw className="w-8 h-8 text-padel-green animate-spin mb-4" />
                                        <p className="text-gray-500 font-bold uppercase tracking-wider text-[10px]">Loading active list...</p>
                                    </div>
                                ) : teams.length === 0 ? (
                                    <div className="text-center py-16 bg-black/10 rounded-2xl border border-white/5">
                                        <Info size={32} className="text-gray-600 mx-auto mb-3" />
                                        <p className="text-gray-400 text-sm font-semibold">No paid registrations found in this division.</p>
                                        <p className="text-gray-500 text-xs mt-1">Check Event Finance to confirm entry payment status.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                        {teams.map((team, idx) => (
                                            <div 
                                                key={team.id}
                                                className="flex items-center justify-between p-4 bg-[#1E293B]/40 hover:bg-[#1E293B] rounded-2xl border border-white/5 transition-colors group"
                                            >
                                                <div className="flex items-center gap-4 min-w-0 pr-4">
                                                    <span className="text-[10px] font-black text-gray-500 w-5">#{idx + 1}</span>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-sm text-white truncate">{team.full_name}</p>
                                                        <p className="text-xs text-gray-400 truncate">Partner: {team.partner_name}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6 shrink-0">
                                                    {/* Seeding points indicator */}
                                                    <div className="text-right">
                                                        <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Points</p>
                                                        <div className="flex items-center gap-1 text-padel-green font-black font-display text-sm">
                                                            <Award size={12} />
                                                            {team.points.toLocaleString()}
                                                        </div>
                                                    </div>

                                                    {/* Seed selector inputs */}
                                                    <div className="w-24">
                                                        <select
                                                            value={team.seed || ''}
                                                            onChange={(e) => handleUpdateSeed(team.id, e.target.value)}
                                                            className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-padel-green text-xs font-bold cursor-pointer"
                                                            disabled={existingDraws.length > 0}
                                                        >
                                                            <option value="">No Seed</option>
                                                            <option value="1">Seed 1</option>
                                                            <option value="2">Seed 2</option>
                                                            <option value="3">Seed 3</option>
                                                            <option value="4">Seed 4</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Column: Seeding Format Configurations */}
                        <div className="lg:col-span-5 space-y-6">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-[#131C2F]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-2xl space-y-6 text-left"
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 bg-padel-green/10 text-padel-green rounded-xl flex items-center justify-center">
                                        <Settings size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-white font-bold tracking-tight">Bracket Settings</h3>
                                        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Configure format algorithms</p>
                                    </div>
                                </div>

                                {/* Draw Format */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Tournament Style</label>
                                    <select
                                        value={divisionConfig.draw_type}
                                        onChange={(e) => setDivisionConfig(prev => ({ ...prev, draw_type: e.target.value }))}
                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3 text-xs font-bold"
                                        disabled={existingDraws.length > 0}
                                    >
                                        <option value="single_elimination">Single Elimination Bracket</option>
                                        <option value="group_stage">Round Robin Groups</option>
                                    </select>
                                </div>

                                {/* Plates Toggle (Only for Elimination) */}
                                {divisionConfig.draw_type === 'single_elimination' && (
                                    <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                                        <div>
                                            <p className="text-xs font-bold text-white">Enable Round 1 Plate/Back Draw</p>
                                            <p className="text-[10px] text-gray-400">Losers of Round 1 automatically join Plate draws.</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={divisionConfig.has_plate}
                                            onChange={(e) => setDivisionConfig(prev => ({ ...prev, has_plate: e.target.checked }))}
                                            className="w-4 h-4 text-padel-green bg-black rounded border-white/10 focus:ring-padel-green cursor-pointer"
                                            disabled={existingDraws.length > 0}
                                        />
                                    </div>
                                )}

                                {/* Group count (Only for Group Stage) */}
                                {divisionConfig.draw_type === 'group_stage' && (
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Number of Groups</label>
                                        <select
                                            value={groupCount}
                                            onChange={(e) => setGroupCount(parseInt(e.target.value, 10))}
                                            className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3 text-xs font-bold"
                                            disabled={existingDraws.length > 0}
                                        >
                                            <option value="2">2 Groups</option>
                                            <option value="4">4 Groups</option>
                                            <option value="8">8 Groups</option>
                                        </select>
                                    </div>
                                )}

                                {/* Match Format */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Match Scoring System</label>
                                    <select
                                        value={divisionConfig.match_format}
                                        onChange={(e) => setDivisionConfig(prev => ({ ...prev, match_format: e.target.value }))}
                                        className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3 text-xs font-bold"
                                        disabled={existingDraws.length > 0}
                                    >
                                        <option value="best_of_3_with_match_tiebreak">Best of 3 Sets (with Match Tiebreak)</option>
                                        <option value="best_of_3_full">Best of 3 Full Sets</option>
                                        <option value="two_sets_super_tiebreak">2 Sets & Super Tiebreak (10 Pts)</option>
                                        <option value="single_set">Single Set (to 6 Games)</option>
                                        <option value="pro_set">Pro Set (to 8 Games)</option>
                                    </select>
                                </div>

                                {/* Golden points */}
                                <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                                    <div>
                                        <p className="text-xs font-bold text-white">Golden Point (No-Ad scoring)</p>
                                        <p className="text-[10px] text-gray-400">Golden point determines winners at deuce.</p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={divisionConfig.scoring_format === 'no_ad'}
                                        onChange={(e) => setDivisionConfig(prev => ({ ...prev, scoring_format: e.target.checked ? 'no_ad' : 'standard' }))}
                                        className="w-4 h-4 text-padel-green bg-black rounded border-white/10 focus:ring-padel-green cursor-pointer"
                                        disabled={existingDraws.length > 0}
                                    />
                                </div>

                                {/* Setup Actions buttons */}
                                <div className="pt-4 border-t border-white/5 space-y-3">
                                    {existingDraws.length === 0 ? (
                                        <button
                                            onClick={handleGenerateDraw}
                                            className="w-full bg-padel-green text-black font-black uppercase tracking-wider text-xs py-4 rounded-xl flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(154,233,0,0.3)] hover:scale-[1.02] active:scale-95 transition-all duration-300 shadow-lg"
                                            disabled={loading.generating || teams.length === 0}
                                        >
                                            {loading.generating ? (
                                                <RefreshCcw className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Play size={16} />
                                            )}
                                            Generate & Publish Draw
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleResetDraw}
                                            className="w-full bg-red-500/10 border border-red-500/30 text-red-400 font-black uppercase tracking-wider text-xs py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-red-500 hover:text-black transition-all duration-300 shadow-lg"
                                            disabled={loading.generating}
                                        >
                                            {loading.generating ? (
                                                <RefreshCcw className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2 size={16} />
                                            )}
                                            Wipe / Reset Draw
                                        </button>
                                    )}
                                    
                                    {existingDraws.length === 0 && (
                                        <button
                                            onClick={handleSaveConfig}
                                            className="w-full bg-white/5 border border-white/10 text-white font-black uppercase tracking-wider text-xs py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
                                            disabled={loading.generating}
                                        >
                                            <Save size={16} />
                                            Save Configurations
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    </div>

                    {/* Bottom Full-Width Section: Draw Preview */}
                    {existingDraws.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#131C2F]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl space-y-6 text-left"
                        >
                            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                                <div className="w-10 h-10 bg-padel-green/10 text-padel-green rounded-xl flex items-center justify-center">
                                    <ShieldCheck size={18} />
                                </div>
                                <div>
                                    <h3 className="text-white font-bold tracking-tight">Draw Successfully Published</h3>
                                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Live active tournament bracket</p>
                                </div>
                            </div>

                            {drawPreviewData.length > 0 ? (
                                <div className="w-full overflow-x-auto custom-scrollbar pb-4">
                                    <KnockoutBracket 
                                        matches={drawPreviewData} 
                                        forcedViewMode="bracket" 
                                    />
                                </div>
                            ) : (
                                <div className="text-center py-20 text-gray-400 bg-black/10 rounded-2xl border border-white/5">
                                    <AlertTriangle size={36} className="text-amber-500 mx-auto mb-4" />
                                    <p className="font-bold text-sm">Visual preview only supported for brackets currently.</p>
                                    <p className="text-xs mt-1 text-gray-500">Group standings can be verified on public pages.</p>
                                </div>
                            )}
                        </motion.div>
                    )}
                </div>
            )}
        </div>
    );
};

export default EventDraws;
