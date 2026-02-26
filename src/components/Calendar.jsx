import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, MapPin, Clock } from 'lucide-react';
import tournamentBg from '../assets/tournament_bg.png';

const Calendar = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        const { data, error } = await supabase
            .from('calendar')
            .select('*, rankedin_url')
            .eq('featured_event', true)
            .order('start_date', { ascending: true })
            .limit(3);

        if (error) {
            console.error('Error fetching events:', error);
        } else {
            const formattedEvents = data.map(event => {
                const dateObj = new Date(event.start_date);
                return {
                    day: dateObj.getDate().toString(),
                    month: dateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
                    title: event.event_name,
                    time: event.start_time || 'TBA',
                    location: event.venue || `${event.city ? `(${event.city})` : ''}`.trim() || 'TBA',
                    category: event.sapa_status || 'Tournament',
                    rankedin_url: event.rankedin_url || ''
                };
            });
            setEvents(formattedEvents);
        }
        setLoading(false);
    };

    if (loading) return null;

    return (
        <section className="py-24 bg-black relative">
            <div className="absolute inset-0 opacity-20">
                <img src={tournamentBg} alt="" className="w-full h-full object-cover" />
            </div>

            <div className="container mx-auto px-6 md:px-20 relative z-10">
                <div className="flex flex-col md:flex-row justify-between items-end mb-12">
                    <div>
                        <span className="text-padel-green font-bold tracking-widest uppercase text-sm">Upcoming Events</span>
                        <h2 className="text-4xl md:text-5xl font-bold text-white mt-4">Calendar</h2>
                    </div>
                    <button className="hidden md:block px-6 py-3 border border-white/20 rounded-full text-white hover:bg-white/10 transition-colors">
                        View Full Calendar
                    </button>
                </div>

                <div className="grid gap-6">
                    {events.map((event, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="bg-gray-900/80 backdrop-blur-md border border-white/10 p-6 rounded-2xl flex flex-col md:flex-row items-center gap-8 group hover:border-padel-green/50 transition-colors"
                        >
                            <div className="flex flex-col items-center bg-white/5 p-4 rounded-xl min-w-[80px]">
                                <span className="text-sm font-bold text-padel-green uppercase">{event.month}</span>
                                <span className="text-3xl font-black text-white">{event.day}</span>
                            </div>

                            <div className="flex-1 text-center md:text-left">
                                <span className="inline-block px-3 py-1 bg-padel-green/20 text-padel-green text-xs font-bold rounded-full mb-2">
                                    {event.category}
                                </span>
                                <h3 className="text-2xl font-bold text-white mb-2">{event.title}</h3>
                                <div className="flex flex-wrap justify-center md:justify-start gap-4 text-gray-400 text-sm">
                                    <div className="flex items-center gap-1">
                                        <Clock size={16} />
                                        {event.time}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <MapPin size={16} />
                                        {event.location}
                                    </div>
                                </div>
                            </div>

                            <a
                                href={event.rankedin_url || `https://www.rankedin.com/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-8 py-3 bg-white !text-[#0F172A] font-black rounded-full hover:bg-padel-green transition-all hover:scale-105 w-full md:w-auto text-center text-sm uppercase tracking-widest block"
                            >
                                Register
                            </a>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Calendar;
