import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useRankedin } from '../hooks/useRankedin';
import { supabase } from '../supabaseClient';
import { Calendar, ChevronRight, PlayCircle, Trophy } from 'lucide-react';

const featuredDataTemplate = [
    {
        id: 'featured-tournaments',
        title: 'Featured Tournaments',
        highlight: 'Upcoming',
        description: 'Get ready for the biggest clashes of the season. Top players gather to battle it out for the ultimate prize. Do not miss the action and secure your spot today!',
        cardLabel: 'Major Event',
        cardTitle: 'Loading Featured Event...',
        image: 'https://images.unsplash.com/photo-1622384950482-1a4cbab9bd36?q=80&w=1471&auto=format&fit=crop',
        align: 'left',
        linkPath: '/calendar',
        icon: Calendar
    },
    {
        id: 'recent-results',
        title: 'Recent Tournament',
        highlight: 'Results',
        description: 'Relive the highlights and unbelievable moments from last weekend\'s finals. Upsets, brilliant plays, and unmatched sportsmanship on display.',
        cardLabel: 'Tournament Champions',
        cardTitle: 'Johannesburg Open 2026',
        image: 'https://images.unsplash.com/photo-1554068865-c7211fa4d4ab?q=80&w=1470&auto=format&fit=crop',
        align: 'right',
        linkPath: '/results',
        icon: Trophy
    },
    {
        id: 'live-events',
        title: 'Featured Live',
        highlight: 'Events',
        description: 'Experience the thrill in real-time. Tune in to our live broadcasts and witness Padel history unfold as the best compete on center court.',
        cardLabel: 'Live Now',
        cardTitle: 'SAPA Regional Qualifiers',
        image: 'https://images.unsplash.com/photo-1554068865-c7211fa4d4ab?q=80&w=1470&auto=format&fit=crop', // Reusing a padel image
        align: 'left',
        linkPath: '/calendar',
        icon: PlayCircle
    }
];

const FallbackImage = ({ src, alt, className, title }) => {
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false);
    }, [src]);

    if (hasError || !src) {
        const initials = title ? title.substring(0, 2).toUpperCase() : '4M';
        return (
            <div className={`flex items-center justify-center bg-gradient-to-br from-[#0B1121] to-black absolute inset-0 w-full h-full`}>
                <div className="absolute inset-0 opacity-[0.03] bg-[url('/noise.png')] mix-blend-overlay"></div>
                <span className="text-4xl font-black text-white/5 font-display tracking-widest">{initials}</span>
                <Trophy className="absolute inset-0 m-auto w-24 h-24 text-white/[0.02]" />
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={alt}
            className={className}
            onError={() => setHasError(true)}
        />
    );
};

const TournamentCard = ({ index, title, label, image, linkPath, isLive = false }) => {
    const navigate = useNavigate();

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: index * 0.15 }}
            className={`relative w-full h-[280px] xl:h-[320px] rounded-[24px] overflow-hidden group cursor-pointer border border-white/5 hover:border-padel-green/30 transition-all duration-500 bg-[#060913]`}
            onClick={() => navigate(linkPath)}
        >
            <div className="absolute inset-0 w-full h-full mix-blend-luminosity opacity-40 group-hover:opacity-60 transition-all duration-700">
                <FallbackImage
                    src={image}
                    alt={title}
                    title={title}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                />
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-[#05070A] via-[#05070A]/80 to-transparent transition-opacity duration-300 pointer-events-none" />

            {isLive && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500/90 backdrop-blur-md px-2 py-1 rounded-full z-10">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[9px] font-bold text-white uppercase tracking-wider">Live</span>
                </div>
            )}

            <div className="absolute inset-x-0 bottom-0 p-5 xl:p-6 z-10 flex flex-col justify-end">
                <div className="flex items-center gap-1.5 mb-2 opacity-90">
                    <Calendar className="w-3 h-3 text-padel-green" />
                    <p className="text-[9px] font-bold text-padel-green uppercase tracking-widest truncate">{label}</p>
                </div>
                <h3 className="text-xl xl:text-2xl leading-tight font-bold text-white line-clamp-2 mb-5 group-hover:text-padel-green transition-colors duration-300 tracking-tight">{title}</h3>

                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center group-hover:border-padel-green transition-colors">
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-padel-green" />
                    </div>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-white transition-colors duration-300">VIEW DETAILS</span>
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
        'bg-[#080C17]',
        'bg-[#05070A]',
        'bg-[#080C17]'
    ];
    const bgColor = bgColors[index % bgColors.length];
    const Icon = data.icon;

    const textContent = (
        <div className={`relative z-10 ${!isRecentResults ? 'lg:pr-8' : ''}`}>
            <motion.div
                initial={{ opacity: 0, x: isLeft ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
            >
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/10 text-padel-green text-[10px] font-bold uppercase tracking-widest mb-4">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{data.highlight}</span>
                </div>

                <h2 className={`font-bold mb-4 font-display leading-[1.0] tracking-tighter text-white ${isRecentResults ? 'text-4xl xl:text-[42px]' : 'text-5xl lg:text-[56px] xl:text-[64px]'}`}>
                    {data.title.split(' ')[0]} <br className={isRecentResults ? 'hidden lg:block' : ''} />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-300 to-gray-600">
                        {data.title.split(' ').slice(1).join(' ')}
                    </span>
                </h2>
                <p className={`text-gray-400 leading-relaxed mb-8 ${isRecentResults ? 'text-xs md:text-sm' : 'text-sm md:text-base max-w-sm'}`}>
                    {data.description}
                </p>

                <button
                    onClick={() => navigate(data.linkPath)}
                    className="group inline-flex items-center gap-3 text-white font-bold hover:text-padel-green transition-colors uppercase text-[10px] tracking-[0.2em]"
                >
                    EXPLORE ALL
                    <div className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center group-hover:border-padel-green transition-colors flex-shrink-0">
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-padel-green" />
                    </div>
                </button>
            </motion.div>
        </div>
    );

    const imageContent = isRecentResults ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 relative z-10 w-full mt-8 lg:mt-0">
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
                <div className="col-span-1 md:col-span-3 text-center py-20 border border-white/5 rounded-[24px] bg-white/[0.02]">
                    <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                        <span className="text-padel-green animate-ping absolute inline-flex h-3 w-3 rounded-full opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-padel-green"></span>
                    </div>
                    <p className="text-gray-400 text-sm font-medium">Loading tournament data...</p>
                </div>
            )}
        </div>
    ) : (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            whileInView={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`relative w-full aspect-[4/3] sm:aspect-video lg:aspect-square max-h-[360px] lg:max-h-[420px] max-w-[480px] mx-auto lg:mx-0 ${isLeft ? 'lg:ml-auto' : 'lg:mr-auto'} rounded-[24px] overflow-hidden group cursor-pointer border border-white/10 hover:border-padel-green/30 transition-all duration-700 bg-[#05070A] z-10 mt-8 lg:mt-0`}
            onClick={() => data.linkPath && navigate(data.linkPath)}
        >
            <div className="absolute inset-0 w-full h-full mix-blend-luminosity opacity-40 group-hover:opacity-60 transition-all duration-1000">
                <FallbackImage
                    src={data.image}
                    alt={data.cardTitle}
                    title={data.cardTitle}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                />
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-[#05070A] via-[#05070A]/80 to-transparent transition-opacity duration-500 pointer-events-none" />

            {data.id === 'live-events' && (
                <div className="absolute top-5 left-5 flex items-center gap-2 bg-red-500/90 backdrop-blur-md px-3 py-1.5 rounded-full z-20">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">Live</span>
                </div>
            )}

            <div className="absolute inset-x-0 bottom-0 p-6 md:p-8 z-20 flex flex-col justify-end pointer-events-none">
                <div className="flex items-center gap-2 mb-2">
                    {data.id === 'live-events' ? (
                        <PlayCircle className="w-3.5 h-3.5 text-padel-green" />
                    ) : (
                        <Calendar className="w-3.5 h-3.5 text-padel-green" />
                    )}
                    <p className="text-[10px] font-bold text-padel-green uppercase tracking-widest">{data.cardLabel}</p>
                </div>

                <h3 className="text-2xl md:text-4xl font-bold text-white leading-[1.1] mb-6 group-hover:text-padel-green transition-colors duration-500 tracking-tight">{data.cardTitle}</h3>

                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center group-hover:border-padel-green transition-colors">
                        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-padel-green transform group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 group-hover:text-white transition-colors uppercase tracking-[0.2em]">VIEW DETAILS</span>
                </div>
            </div>
        </motion.div>
    );

    return (
        <section className={`relative py-12 lg:py-16 border-t border-white/5 overflow-hidden ${bgColor}`} id={data.id}>
            <div className={`w-full ${isRecentResults ? 'max-w-[1500px]' : 'max-w-[1200px]'} mx-auto px-6 md:px-8 relative z-10 ${isRecentResults ? 'grid lg:grid-cols-4 gap-8 xl:gap-12 items-center' : 'grid lg:grid-cols-2 gap-10 lg:gap-16 items-center'}`}>
                {isRecentResults ? (
                    <>
                        {/* Text takes 1 column on the left */}
                        <div className="lg:col-span-1">
                            {textContent}
                        </div>
                        {/* Cards take 3 columns on the right */}
                        <div className="lg:col-span-3 w-full">
                            {imageContent}
                        </div>
                    </>
                ) : isLeft ? (
                    <>
                        <div className="lg:col-span-1 border border-transparent">
                            {textContent}
                        </div>
                        <div className="lg:col-span-1 border border-transparent">
                            {imageContent}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="order-2 lg:order-1 lg:col-span-1 border border-transparent">
                            {imageContent}
                        </div>
                        <div className="order-1 lg:order-2 lg:col-span-1 border border-transparent">
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
                                cardLabel: data.sapa_status || 'Major Event',
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
