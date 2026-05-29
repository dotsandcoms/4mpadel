import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Bell, X, Building, Trophy, UserPlus, DollarSign, 
    Calendar, Check, Sparkles, User, RefreshCw, AlertCircle
} from 'lucide-react';

const AdminNotificationsBell = ({ permissions, onNavigate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef(null);

    const isSuperAdmin = permissions?.role === 'super_admin';
    const isOrgOwner = permissions?.role === 'org_owner';

    const fetchNotifications = async () => {
        if (!isSuperAdmin && !isOrgOwner) return;
        setLoading(true);
        try {
            const feed = [];
            let criticalCount = 0;

            if (isSuperAdmin) {
                // Fetch in parallel to keep things highly responsive
                const [
                    { data: pendingOrgs },
                    { data: pendingEvents },
                    { data: pendingCoaches },
                    { data: recentPayments }
                ] = await Promise.all([
                    supabase
                        .from('organizations')
                        .select('id, name, created_at')
                        .eq('status', 'pending')
                        .limit(5),
                    supabase
                        .from('calendar')
                        .select('id, event_name, created_at, sapa_status')
                        .eq('sanction_status', 'pending')
                        .limit(5),
                    supabase
                        .from('coach_applications')
                        .select('id, full_name, created_at')
                        .eq('status', 'pending')
                        .limit(5),
                    supabase
                        .from('payments')
                        .select('id, amount, created_at, players(name)')
                        .eq('status', 'success')
                        .order('created_at', { ascending: false })
                        .limit(5)
                ]);

                // 1. Map Pending Organisations
                (pendingOrgs || []).forEach(org => {
                    feed.push({
                        id: `org_${org.id}`,
                        type: 'org',
                        title: 'Club Host Request 🏢',
                        text: `${org.name} is awaiting SAPA approval.`,
                        date: new Date(org.created_at),
                        tab: 'organizations',
                        severity: 'critical'
                    });
                });

                // 2. Map Pending Tournament Sanctions
                (pendingEvents || []).forEach(ev => {
                    feed.push({
                        id: `ev_${ev.id}`,
                        type: 'event',
                        title: 'Event Sanction Request 🏆',
                        text: `"${ev.event_name}" requested ${ev.sapa_status || 'Silver'} sanctioning.`,
                        date: new Date(ev.created_at || Date.now()),
                        tab: 'organizations',
                        severity: 'critical'
                    });
                });

                // 3. Map Pending Coaches
                (pendingCoaches || []).forEach(coach => {
                    feed.push({
                        id: `coach_${coach.id}`,
                        type: 'coach',
                        title: 'New Coach Application 🎾',
                        text: `${coach.full_name} submitted a coaching application.`,
                        date: new Date(coach.created_at),
                        tab: 'coaches',
                        severity: 'warning'
                    });
                });

                // 4. Map Recent Payments
                (recentPayments || []).forEach(pay => {
                    feed.push({
                        id: `pay_${pay.id}`,
                        type: 'payment',
                        title: 'Payment Confirmed 💳',
                        text: `R${pay.amount} received from ${pay.players?.name || 'Player'}.`,
                        date: new Date(pay.created_at),
                        tab: 'finance',
                        severity: 'info'
                    });
                });

                criticalCount = (pendingOrgs?.length || 0) + (pendingEvents?.length || 0) + (pendingCoaches?.length || 0);

            } else if (isOrgOwner && permissions?.org?.id) {
                const orgId = permissions.org.id;

                // 1. Fetch organisation's events
                const { data: myEvents } = await supabase
                    .from('calendar')
                    .select('id, event_name, created_at, updated_at, sanction_status, sapa_status')
                    .eq('organization_id', orgId)
                    .order('updated_at', { ascending: false })
                    .limit(10);

                const myEventsList = myEvents || [];
                const eventIds = myEventsList.map(ev => ev.id);

                // 2. Fetch payments for those events if any exist
                let myPayments = [];
                if (eventIds.length > 0) {
                    const { data: paymentsData } = await supabase
                        .from('payments')
                        .select('id, amount, created_at, event_id, players(name)')
                        .eq('status', 'success')
                        .in('event_id', eventIds)
                        .order('created_at', { ascending: false })
                        .limit(10);
                    myPayments = paymentsData || [];
                }

                // 3. Map events to notifications based on status changes or pending states
                myEventsList.forEach(ev => {
                    if (ev.sanction_status === 'approved') {
                        feed.push({
                            id: `ev_approved_${ev.id}`,
                            type: 'event',
                            title: 'Tournament Sanctioned! 🏆',
                            text: `"${ev.event_name}" is approved & live on the calendar.`,
                            date: new Date(ev.updated_at || ev.created_at || Date.now()),
                            tab: 'dashboard',
                            severity: 'info'
                        });
                    } else if (ev.sanction_status === 'rejected') {
                        feed.push({
                            id: `ev_rejected_${ev.id}`,
                            type: 'event',
                            title: 'Sanction Declined ⚠️',
                            text: `"${ev.event_name}" was declined. Please adjust details inside your portal.`,
                            date: new Date(ev.updated_at || ev.created_at || Date.now()),
                            tab: 'dashboard',
                            severity: 'critical'
                        });
                        criticalCount++;
                    } else if (ev.sanction_status === 'pending') {
                        feed.push({
                            id: `ev_pending_${ev.id}`,
                            type: 'event',
                            title: 'Sanction Pending ⌛',
                            text: `"${ev.event_name}" is awaiting SAPA sanction review.`,
                            date: new Date(ev.created_at || Date.now()),
                            tab: 'dashboard',
                            severity: 'warning'
                        });
                    }
                });

                // 4. Map payments to notifications
                myPayments.forEach(pay => {
                    const matchedEvent = myEventsList.find(e => e.id === pay.event_id);
                    const eventName = matchedEvent ? matchedEvent.event_name : 'Tournament';
                    feed.push({
                        id: `pay_${pay.id}`,
                        type: 'payment',
                        title: 'New Player Entry Paid 💳',
                        text: `R${pay.amount} received from ${pay.players?.name || 'Player'} for "${eventName}".`,
                        date: new Date(pay.created_at),
                        tab: 'dashboard',
                        severity: 'info'
                    });
                });
            }

            // Sort chronologically (newest first)
            feed.sort((a, b) => b.date - a.date);
            setNotifications(feed);
            setUnreadCount(criticalCount);

        } catch (err) {
            console.error('Failed to compile admin notifications:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isSuperAdmin || isOrgOwner) {
            fetchNotifications();
            // Poll for notifications every 30 seconds
            const interval = setInterval(fetchNotifications, 30000);
            return () => clearInterval(interval);
        }
    }, [permissions]);

    // Handle clicking outside to close
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleItemClick = (tab) => {
        setIsOpen(false);
        if (onNavigate) onNavigate(tab);
    };

    if (!isSuperAdmin && !isOrgOwner) return null;

    return (
        <div className="relative shrink-0" ref={dropdownRef}>
            {/* Bell Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 flex items-center justify-center cursor-pointer group ${
                    isOpen ? 'bg-white/10 border-padel-green/30' : ''
                }`}
            >
                <Bell size={18} className={`text-white transition-transform duration-300 group-hover:rotate-12 ${unreadCount > 0 ? 'animate-bounce' : ''}`} />
                
                {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 bg-amber-500 text-black text-[9px] font-black rounded-full flex items-center justify-center border-2 border-black px-1.5 shadow-[0_4px_15px_rgba(245,158,11,0.4)]">
                        {unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-3 w-80 md:w-96 bg-[#0F172A]/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden z-[500] shadow-black/80"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/20">
                            <div>
                                <h4 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                                    Admin Alerts <Sparkles size={13} className="text-padel-green animate-pulse" />
                                </h4>
                                <p className="text-[10px] text-gray-500 mt-0.5">Telemetry & review logs require action</p>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* List Feed */}
                        <div className="max-h-80 overflow-y-auto divide-y divide-white/5 custom-scrollbar text-left">
                            {loading && notifications.length === 0 ? (
                                <div className="py-12 flex flex-col items-center justify-center text-gray-500">
                                    <RefreshCw className="animate-spin w-6 h-6 text-padel-green mb-2" />
                                    <span className="text-xs">Fetching live actions...</span>
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="py-12 text-center text-gray-500 text-xs">
                                    All clear! No active pending items.
                                </div>
                            ) : (
                                notifications.map((item) => {
                                    // Custom color mapping based on type
                                    const iconColors = {
                                        org: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                                        event: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                                        coach: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                                        payment: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    };

                                    const IconType = {
                                        org: Building,
                                        event: Trophy,
                                        coach: UserPlus,
                                        payment: DollarSign
                                    }[item.type] || Bell;

                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => handleItemClick(item.tab)}
                                            className="w-full p-4 flex gap-3 text-left hover:bg-white/5 transition-all group relative cursor-pointer"
                                        >
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${iconColors[item.type]}`}>
                                                <IconType size={16} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start gap-2">
                                                    <span className="font-extrabold text-xs text-white group-hover:text-padel-green transition-colors">{item.title}</span>
                                                    <span className="text-[9px] text-gray-600 shrink-0 mt-0.5">
                                                        {formatTimeAgo(item.date)}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">
                                                    {item.text}
                                                </p>
                                                <span className="text-[9px] font-black text-padel-green uppercase tracking-widest mt-2 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    Resolve Alert &rarr;
                                                </span>
                                            </div>

                                            {/* Pulsing indicator for critical items */}
                                            {item.severity === 'critical' && (
                                                <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse pointer-events-none" />
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// helper: format time ago
const formatTimeAgo = (date) => {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${days}d ago`;
};

export default AdminNotificationsBell;
