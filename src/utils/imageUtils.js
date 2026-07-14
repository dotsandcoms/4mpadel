const tournamentHero = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&q=80';

/** Tier default hero backgrounds (B&W) keyed by normalised SAPA status. */
const TIER_BG_VERSION = '20260714b';

export const SAPA_TIER_DEFAULT_BACKGROUNDS = {
    major: `/images/events/major_bg.jpg?v=${TIER_BG_VERSION}`,
    'super gold': `/images/events/super_gold_bg.jpg?v=${TIER_BG_VERSION}`,
    's gold': `/images/events/super_gold_bg.jpg?v=${TIER_BG_VERSION}`,
    gold: `/images/events/gold_bg.jpg?v=${TIER_BG_VERSION}`,
    silver: `/images/events/silver_bg.jpg?v=${TIER_BG_VERSION}`,
    bronze: `/images/events/bronze_bg.jpg?v=${TIER_BG_VERSION}`,
    'special event': `/images/events/special_event_bg.jpg?v=${TIER_BG_VERSION}`,
    'key event': `/images/events/special_event_bg.jpg?v=${TIER_BG_VERSION}`,
    'fip event': `/images/events/special_event_bg.jpg?v=${TIER_BG_VERSION}`,
    social: `/images/events/social_bg.jpg?v=${TIER_BG_VERSION}`,
};

/**
 * Resolve the default event hero image for a SAPA status string.
 * @param {string} status
 * @returns {string}
 */
export const getDefaultBackgroundForStatus = (status) => {
    const key = (status || '').toLowerCase().trim();
    if (!key || key === 'none') return SAPA_TIER_DEFAULT_BACKGROUNDS.social;
    if (SAPA_TIER_DEFAULT_BACKGROUNDS[key]) return SAPA_TIER_DEFAULT_BACKGROUNDS[key];
    if (key.includes('super gold') || key.includes('s gold')) return SAPA_TIER_DEFAULT_BACKGROUNDS['super gold'];
    if (key.includes('major')) return SAPA_TIER_DEFAULT_BACKGROUNDS.major;
    if (key.includes('gold')) return SAPA_TIER_DEFAULT_BACKGROUNDS.gold;
    if (key.includes('silver')) return SAPA_TIER_DEFAULT_BACKGROUNDS.silver;
    if (key.includes('bronze')) return SAPA_TIER_DEFAULT_BACKGROUNDS.bronze;
    if (key.includes('special') || key.includes('key') || key.includes('fip')) return SAPA_TIER_DEFAULT_BACKGROUNDS['special event'];
    return SAPA_TIER_DEFAULT_BACKGROUNDS.social;
};

export const getDefaultEventBackground = (event) => {
    if (!event) return tournamentHero;

    const status = (event.sapa_status || event.sapaStatus || '').toLowerCase();
    const name = (event.event_name || event.eventName || '').toLowerCase();

    if (status === 'major' || name.includes('major')) return SAPA_TIER_DEFAULT_BACKGROUNDS.major;
    if (status === 'super gold' || status === 's gold' || name.includes('super gold')) return SAPA_TIER_DEFAULT_BACKGROUNDS['super gold'];
    if (status === 'gold' || name.includes('gold')) return SAPA_TIER_DEFAULT_BACKGROUNDS.gold;
    if (status === 'silver' || name.includes('silver')) return SAPA_TIER_DEFAULT_BACKGROUNDS.silver;
    if (status === 'bronze' || name.includes('bronze')) return SAPA_TIER_DEFAULT_BACKGROUNDS.bronze;
    if (status === 'special event' || status === 'key event' || status === 'fip event' || name.includes('special')) {
        return SAPA_TIER_DEFAULT_BACKGROUNDS['special event'];
    }
    if (status === 'social' || name.includes('social')) return SAPA_TIER_DEFAULT_BACKGROUNDS.social;

    return SAPA_TIER_DEFAULT_BACKGROUNDS.social;
};

export const getEventImage = (event) => {
    if (!event) return tournamentHero;
    return event.image || event.custom_image_url || getDefaultEventBackground(event);
};
