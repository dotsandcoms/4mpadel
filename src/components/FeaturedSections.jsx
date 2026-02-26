import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useRankedin } from '../hooks/useRankedin';
import { supabase } from '../supabaseClient';

const featuredDataTemplate = [
    {
        id: 'featured-tournaments',
        title: 'Featured Tournaments',
        highlight: 'Upcoming',
        description: 'Get ready for the biggest clashes of the season. Top players gather to battle it out for the ultimate prize. Do not miss the action and secure your spot today!',
        cardLabel: 'Major Event',
        cardTitle: 'Cape Town Padel Masters',
        image: 'https://images.unsplash.com/photo-1622384950482-1a4cbab9bd36?q=80&w=1471&auto=format&fit=crop',
        align: 'left', // Image on right, text on left
        linkPath: '/calendar'
    },
    {
        id: 'recent-results',
        title: 'Recent Tournament',
        highlight: 'Results',
        description: 'Relive the highlights and unbelievable moments from last weekend\'s finals. Upsets, brilliant plays, and unmatched sportsmanship on display.',
        cardLabel: 'Tournament Champions',
        cardTitle: 'Johannesburg Open 2026',
        image: 'https://images.unsplash.com/photo-1554068865-c7211fa4d4ab?q=80&w=1470&auto=format&fit=crop',
        align: 'right', // Image on left, text on right
        linkPath: '/results'
    },
    {
        id: 'live-events',
        title: 'Featured Live',
        highlight: 'Events',
        description: 'Experience the thrill in real-time. Tune in to our live broadcasts and witness Padel history unfold as the best compete on center court.',
        cardLabel: 'Live Now',
        cardTitle: 'SAPA Regional Qualifiers',
        image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=1453&auto=format&fit=crop',
        align: 'left',
        linkPath: '/calendar'
    },
    {
        id: 'recent-featured',
        title: 'Recent Featured',
        highlight: 'Highlights',
        description: 'A curated selection of the best recent matches, player interviews, and standout performances that defined the week in South African Padel.',
        cardLabel: 'Match of the Week',
        cardTitle: 'Le Grange vs Smith',
        image: 'https://images.unsplash.com/photo-1526678280682-1a733cf8f0f4?q=80&w=1471&auto=format&fit=crop',
        align: 'right',
        linkPath: '/results'
    }
];

const TournamentCard = ({ index, title, label, image, linkPath }) => {
    const navigate = useNavigate();

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: index * 0.15 }}
            className="relative h-[300px] md:h-[400px] rounded-3xl overflow-hidden group shadow-2xl cursor-pointer"
            onClick={() => navigate(linkPath)}
        >
            <img
                src={image}
                alt={title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1554068865-c7211fa4d4ab?q=80&w=1470&auto=format&fit=crop'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent transition-opacity duration-300 group-hover:opacity-90" />

            <div className="absolute bottom-6 left-6 right-6">
                <div className="glass-panel p-5 rounded-2xl flex justify-between items-end border border-white/10 bg-white/5 backdrop-blur-md transform transition-transform duration-300 group-hover:translate-y-[-5px]">
                    <div className="pr-4">
                        <p className="text-xs font-bold text-padel-green mb-1 uppercase tracking-widest">{label}</p>
                        <h3 className="text-xl font-bold text-white line-clamp-2">{title}</h3>
                    </div>
                    <button className="flex-shrink-0 w-10 h-10 bg-padel-green rounded-full flex items-center justify-center text-black shadow-lg group-hover:bg-white transition-colors">
                        <span className="text-lg font-bold">↗</span>
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

const FeaturedSectionBlock = ({ data, index, liveTournaments }) => {
    const navigate = useNavigate();
    const isLeft = data.align === 'left';
    const isRecentResults = data.id === 'recent-results';

    const bgColors = [
        'bg-[#0F172A]',
        'bg-black',
        'bg-[#0F172A]',
        'bg-black'
    ];
    const bgColor = bgColors[index % bgColors.length];

    const textContent = (
        <div className="relative">
            <motion.div
                initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
            >
                <h2 className="text-4xl md:text-5xl font-bold relative z-10 mb-6 font-display">
                    {data.title} <br />
                    <span className="text-padel-green">{data.highlight}</span>
                </h2>
                <p className="text-gray-400 text-lg leading-relaxed mb-8">
                    {data.description}
                </p>
            </motion.div>
        </div>
    );

    const imageContent = isRecentResults ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 col-span-1 lg:col-span-2 mt-8 md:mt-0">
            {liveTournaments && liveTournaments.length > 0 ? (
                liveTournaments.map((t, i) => (
                    <TournamentCard
                        key={t.eventId}
                        index={i}
                        title={t.eventName}
                        label={t.city || 'Tournament'}
                        image={`https://rankedin-prod-cdn-adavg8d3dwfegkbd.z01.azurefd.net/images/upload/tournament/${t.eventId}.png`}
                        linkPath={`/results/${t.eventId}`}
                    />
                ))
            ) : (
                <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center py-12 border border-white/10 rounded-3xl bg-white/5">
                    <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-padel-green animate-pulse">●</span>
                    </div>
                    <p className="text-gray-400 font-medium">Loading live results from Rankedin...</p>
                </div>
            )}
        </div>
    ) : (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="relative h-[400px] md:h-[500px] rounded-3xl overflow-hidden group shadow-2xl cursor-pointer"
            onClick={() => data.linkPath && navigate(data.linkPath)}
        >
            <img
                src={data.image}
                alt={data.cardTitle}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

            <div className="absolute bottom-6 left-6 right-6">
                <div className="glass-panel p-6 rounded-2xl flex justify-between items-end border border-white/10 bg-white/5 backdrop-blur-md">
                    <div>
                        <p className="text-sm font-bold text-padel-green mb-1 uppercase tracking-widest">{data.cardLabel}</p>
                        <h3 className="text-2xl font-bold text-white">{data.cardTitle}</h3>
                    </div>
                    <button className="w-12 h-12 bg-padel-green rounded-full flex items-center justify-center text-black hover:scale-110 transition-transform shadow-lg group-hover:bg-white group-hover:text-black">
                        <span className="text-xl font-bold">↗</span>
                    </button>
                </div>
            </div>
        </motion.div>
    );

    return (
        <section className={`relative py-24 border-t border-white/5 ${bgColor}`} id={data.id}>
            <div className={`container mx-auto px-6 md:px-20 ${isRecentResults ? 'flex flex-col' : 'grid md:grid-cols-2 gap-12 md:gap-20 items-center'}`}>
                {isRecentResults ? (
                    <>
                        {textContent}
                        {imageContent}
                    </>
                ) : isLeft ? (
                    <>
                        {textContent}
                        {imageContent}
                    </>
                ) : (
                    <>
                        {/* On mobile, text should always be on top even if image aligns left visually on desktop */}
                        <div className="order-2 md:order-1">
                            {imageContent}
                        </div>
                        <div className="order-1 md:order-2">
                            {textContent}
                        </div>
                    </>
                )}
            </div>
        </section>
    );
};

const FeaturedSections = () => {
    const { getRecentTournaments } = useRankedin();
    const [liveTournaments, setLiveTournaments] = useState([]);
    const [featuredData, setFeaturedData] = useState(featuredDataTemplate);

    useEffect(() => {
        const fetchTours = async () => {
            const data = await getRecentTournaments(3);
            setLiveTournaments(data);
        };
        fetchTours();

        const fetchFeaturedEvent = async () => {
            try {
                const { data, error } = await supabase
                    .from('calendar')
                    .select('*')
                    .eq('featured_event', true)
                    .order('start_date', { ascending: true })
                    .limit(1)
                    .single();

                if (data && !error) {
                    setFeaturedData(prevData => {
                        const newData = [...prevData];
                        const featuredIndex = newData.findIndex(item => item.id === 'featured-tournaments');
                        if (featuredIndex !== -1) {
                            newData[featuredIndex] = {
                                ...newData[featuredIndex],
                                cardTitle: data.event_name,
                                cardLabel: data.sapa_status,
                                description: data.description || newData[featuredIndex].description,
                                image: data.image_url || newData[featuredIndex].image,
                                linkPath: `/calendar/${data.slug || data.id}`
                            };
                        }
                        return newData;
                    });
                }
            } catch (err) {
                console.error("Error fetching featured event:", err);
            }
        };

        fetchFeaturedEvent();
    }, [getRecentTournaments]);

    return (
        <div className="flex flex-col w-full">
            {featuredData.map((section, index) => (
                <FeaturedSectionBlock
                    key={section.id}
                    data={section}
                    index={index}
                    liveTournaments={section.id === 'recent-results' ? liveTournaments : null}
                />
            ))}
        </div>
    );
};

export default FeaturedSections;
