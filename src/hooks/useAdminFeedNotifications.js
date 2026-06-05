import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export const useAdminFeedNotifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFeed = async () => {
            setLoading(true);
            try {
                // Fetch recent payments
                const { data: payments } = await supabase
                    .from('payments')
                    .select('id, amount, created_at, player_id, event_id, status')
                    .eq('status', 'success')
                    .order('created_at', { ascending: false })
                    .limit(20);

                // Fetch recent players
                const { data: players } = await supabase
                    .from('players')
                    .select('id, name, email, created_at')
                    .order('created_at', { ascending: false })
                    .limit(20);

                // Fetch recent events
                const { data: events } = await supabase
                    .from('events')
                    .select('id, title, created_at')
                    .order('created_at', { ascending: false })
                    .limit(20);

                // Get player names and event titles for payments
                const playerIds = payments?.map(p => p.player_id).filter(Boolean) || [];
                const eventIds = payments?.map(p => p.event_id).filter(Boolean) || [];

                let playersMap = {};
                if (playerIds.length > 0) {
                    const { data: pData } = await supabase.from('players').select('id, name').in('id', playerIds);
                    playersMap = pData?.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.name }), {}) || {};
                }

                let eventsMap = {};
                if (eventIds.length > 0) {
                    const { data: eData } = await supabase.from('events').select('id, title').in('id', eventIds);
                    eventsMap = eData?.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.title }), {}) || {};
                }

                // Format Feed Items
                let feed = [];

                if (payments) {
                    feed = feed.concat(payments.map(p => ({
                        id: `payment_${p.id}`,
                        type: 'payment',
                        title: 'New Payment Received',
                        subtitle: `${playersMap[p.player_id] || 'A user'} paid R${p.amount}${p.event_id && eventsMap[p.event_id] ? ` for ${eventsMap[p.event_id]}` : ''}`,
                        timestamp: new Date(p.created_at).getTime(),
                        dateObj: new Date(p.created_at),
                        link: '/admin'
                    })));
                }

                if (players) {
                    feed = feed.concat(players.map(p => ({
                        id: `player_${p.id}`,
                        type: 'player',
                        title: 'New User Registered',
                        subtitle: `${p.name || p.email} has joined the platform`,
                        timestamp: new Date(p.created_at).getTime(),
                        dateObj: new Date(p.created_at),
                        link: '/admin'
                    })));
                }

                if (events) {
                    feed = feed.concat(events.map(e => ({
                        id: `event_${e.id}`,
                        type: 'event',
                        title: 'New Event Created',
                        subtitle: `${e.title}`,
                        timestamp: new Date(e.created_at).getTime(),
                        dateObj: new Date(e.created_at),
                        link: '/admin'
                    })));
                }

                // Sort by timestamp desc and limit to 20
                feed.sort((a, b) => b.timestamp - a.timestamp);

                // Helper to format relatively
                const formatTimeAgo = (date) => {
                    const seconds = Math.floor((new Date() - date) / 1000);
                    let interval = seconds / 31536000;
                    if (interval > 1) return Math.floor(interval) + " years ago";
                    interval = seconds / 2592000;
                    if (interval > 1) return Math.floor(interval) + " months ago";
                    interval = seconds / 86400;
                    if (interval > 1) return Math.floor(interval) + " days ago";
                    interval = seconds / 3600;
                    if (interval > 1) return Math.floor(interval) + " hours ago";
                    interval = seconds / 60;
                    if (interval > 1) return Math.floor(interval) + " minutes ago";
                    return Math.floor(seconds) + " seconds ago";
                };

                const finalFeed = feed.slice(0, 20).map(item => ({
                    ...item,
                    timeAgo: formatTimeAgo(item.dateObj)
                }));

                setNotifications(finalFeed);
            } catch (err) {
                console.error("Error fetching admin notifications:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchFeed();
    }, []);

    return { notifications, loading };
};
