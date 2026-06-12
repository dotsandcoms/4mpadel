const tournamentHero = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&q=80';

export const getDefaultEventBackground = (event) => {
    if (!event) return tournamentHero;
    
    const status = (event.sapa_status || event.sapaStatus || '').toLowerCase();
    const name = (event.event_name || event.eventName || '').toLowerCase();

    if (status === 'major' || name.includes('major')) return '/images/events/major_bg.jpg';
    if (status === 'super gold' || name.includes('super gold')) return '/images/events/super_gold_bg.jpg';
    if (status === 'gold' || name.includes('gold')) return '/images/events/gold_bg.jpg';
    if (status === 'silver' || name.includes('silver')) return '/images/events/silver_bg.jpg';
    if (status === 'bronze' || name.includes('bronze')) return '/images/events/bronze_bg.jpg';
    if (status === 'special event' || status === 'key event' || status === 'fip event' || name.includes('special')) return '/images/events/special_event_bg.jpg';
    
    // Default fallback
    if (status === 'social' || name.includes('social')) return '/images/events/social_bg.jpg';
    
    // If no specific tier is identified, use social as the default fallback
    return '/images/events/social_bg.jpg';
};

export const getEventImage = (event) => {
    if (!event) return tournamentHero;
    return event.image || event.custom_image_url || event.image_url || event.poster_url || event.posterUrl || getDefaultEventBackground(event);
};
