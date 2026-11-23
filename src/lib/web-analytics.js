import posthog from 'posthog-js';
import { analyticsIdentityInput, posthogHost } from '../../mobile/src/lib/telemetry-privacy.js';

const STATIC_ROUTES = new Map(Object.entries({
    '/': 'home', '/calendar': 'events', '/rankings': 'rankings', '/players': 'players',
    '/pro': 'pro_padel', '/pro/live': 'pro_live', '/pro/rankings': 'pro_rankings',
    '/pro/results': 'pro_results', '/pro/tournaments': 'pro_tournaments',
    '/pro/calendar': 'pro_calendar', '/pro/players': 'pro_players', '/pro/following': 'pro_following',
    '/gallery': 'media', '/blog': 'blog', '/clubs': 'clubs',
    '/organisations': 'organisations', '/federations': 'federations', '/groups': 'groups',
    '/academy/coaches': 'coaches', '/academy/videos': 'coaching_videos', '/tournaments/all': 'tournaments',
    '/tournaments/broll': 'broll', '/tournaments/kit-kat-league': 'kit_kat_league',
    '/tournaments/north-vs-south': 'north_vs_south', '/tournaments/ladies': 'ladies',
    '/tournaments/juniors': 'juniors', '/tournaments/mens40': 'mens_40',
    '/privacy-policy': 'privacy_policy', '/contact': 'contact',
}));
const ROUTE_PATTERNS = [
    [/^\/calendar\/[^/]+$/, '/calendar/:event', 'event_details'],
    [/^\/pro\/players\/[^/]+(?:\/[^/]+)?$/, '/pro/players/:id', 'pro_player'],
    [/^\/gallery\/[^/]+$/, '/gallery/:album', 'media_album'],
    [/^\/blog\/[^/]+$/, '/blog/:post', 'blog_post'],
    [/^\/clubs\/[^/]+$/, '/clubs/:club', 'club'],
    [/^\/organisations\/[^/]+$/, '/organisations/:organisation', 'organisation'],
    [/^\/federations\/[^/]+$/, '/federations/:federation', 'federation'],
    [/^\/groups\/[^/]+$/, '/groups/:group', 'club_group'],
    [/^\/(?:draws|results|native-draws)\/[^/]+$/, '/results/:event', 'draws'],
];
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
const EVENT_NAMES = new Set(['content_view', 'engagement_time', 'registration_step', 'registration_complete',
    'begin_checkout', 'payment_confirmed', 'checkout_outcome', 'checkout_exit', 'action_error',
    'feature_interaction', 'app_store_click']);
const SDK_FIELDS = new Set(['token', 'distinct_id', '$device_id', '$session_id', '$window_id', '$lib', '$lib_version',
    '$anon_distinct_id', '$is_identified', '$process_person_profile', '$browser', '$browser_version', '$os', '$os_version', '$device_type']);
const PRODUCT_FIELDS = new Set(['platform', 'environment', '$current_url', '$pathname', '$host',
    'screen', 'engagement_seconds', 'content_type', 'content_id', 'feature', 'action', 'selection',
    'flow', 'step', 'item_category', 'payment_state', 'item_count', 'currency', 'value', 'status',
    'store', 'source', 'transaction_id', ...CAMPAIGN_KEYS]);
const ENVIRONMENT = import.meta.env.VITE_TELEMETRY_ENV || 'production';
let enabled = false;
let campaign = {};
let currentAccount;
let authRevision = 0;
let accountReady = false;
const sentPayments = new Set();

async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function webAnalyticsRoute(pathname) {
    const path = pathname.replace(/\/+$/, '') || '/';
    const screen = STATIC_ROUTES.get(path);
    if (screen) return { path, screen };
    const match = ROUTE_PATTERNS.find(([pattern]) => pattern.test(path));
    return match ? { path: match[1], screen: match[2] } : null;
}

function incomingCampaign(search, referrer) {
    const params = new URLSearchParams(search);
    const values = Object.fromEntries(CAMPAIGN_KEYS.flatMap(key => {
        const value = params.get(key);
        return value && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value) ? [[key, value]] : [];
    }));
    let referrerHost = '';
    try { referrerHost = new URL(referrer).hostname; } catch { /* Direct visit. */ }
    const socialSource = [
        ['google.com', 'google'], ['bing.com', 'bing'], ['instagram.com', 'instagram'],
        ['facebook.com', 'facebook'], ['whatsapp.com', 'whatsapp'], ['wa.me', 'whatsapp'],
    ].find(([domain]) => referrerHost === domain || referrerHost.endsWith('.' + domain))?.[1];
    const source = values.utm_source || socialSource
        || (referrerHost && referrerHost !== location.hostname ? 'referral' : 'direct');
    return { ...values, source };
}

function cleanEvent(event) {
    if (!event || !['$identify', '$pageview', ...EVENT_NAMES].includes(event.event)) return null;
    const properties = Object.fromEntries(Object.entries(event.properties ?? {})
        .filter(([key]) => SDK_FIELDS.has(key) || PRODUCT_FIELDS.has(key)));
    if (event.event !== '$identify') {
        const page = webAnalyticsRoute(properties.$pathname || '');
        if (!page || !accountReady) return null;
        // The SDK may attach properties derived from the real browser URL.
        properties.$current_url = location.origin + page.path;
        properties.$pathname = page.path;
        properties.$host = location.hostname;
    } else {
        delete properties.$current_url;
        delete properties.$pathname;
        delete properties.$host;
    }
    delete event.$set;
    delete event.$set_once;
    return { ...event, properties };
}

export function initializeWebAnalytics() {
    const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim();
    if (enabled || !token?.startsWith('phc_') || navigator.globalPrivacyControl === true) return;
    campaign = incomingCampaign(location.search, document.referrer);
    try {
        posthog.init(token, {
            api_host: posthogHost(import.meta.env.VITE_POSTHOG_HOST),
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            capture_dead_clicks: false,
            capture_web_vitals: false,
            disable_session_recording: true,
            disable_external_dependency_loading: true,
            disable_surveys: true,
            disable_web_experiments: true,
            advanced_disable_feature_flags: true,
            save_referrer: false,
            save_campaign_params: false,
            person_profiles: 'identified_only',
            before_send: cleanEvent,
        });
        enabled = true;
    } catch { /* Analytics is independent of the website. */ }
}

function capture(name, properties, page) {
    if (!enabled || !accountReady || !page) return;
    const sendImmediately = ['$pageview', 'engagement_time', 'app_store_click'].includes(name)
        || (name === 'feature_interaction' && properties.action === 'external_registration');
    try {
        posthog.capture(name, {
            ...properties, ...campaign, $pathname: page.path,
            screen: page.screen, platform: 'web', environment: ENVIRONMENT,
        }, sendImmediately ? { send_instantly: true } : undefined);
    } catch { /* Analytics is independent of the user action. */ }
}

export function viewWebPage(pathname) {
    const newCampaign = incomingCampaign(location.search, '');
    if (newCampaign.utm_source || newCampaign.utm_campaign) campaign = newCampaign;
    capture('$pageview', {}, webAnalyticsRoute(pathname));
}

export function trackWebEvent(name, properties = {}, page = webAnalyticsRoute(location.pathname)) {
    if (EVENT_NAMES.has(name)) capture(name, properties, page);
}

export function trackWebPaymentConfirmed(reference, amount) {
    const page = webAnalyticsRoute(location.pathname);
    const account = currentAccount;
    if (!enabled || !accountReady || !page || typeof reference !== 'string' || !/^[a-z0-9_-]{8,180}$/i.test(reference)) return;
    void sha256('4m:analytics:v1:payment:' + reference).then(transactionId => {
        if (!accountReady || currentAccount !== account || sentPayments.has(transactionId)) return;
        const key = '4m:analytics:payment:' + transactionId;
        try {
            if (sessionStorage.getItem(key)) return;
            sessionStorage.setItem(key, '1');
        } catch { /* The in-memory guard still applies. */ }
        sentPayments.add(transactionId);
        trackWebEvent('payment_confirmed', {
            item_category: 'event_registration', transaction_id: transactionId,
            ...(Number.isFinite(amount) && amount > 0 ? { value: amount, currency: 'ZAR' } : {}),
        }, page);
    }).catch(() => {});
}

export async function identifyWebAccount(id) {
    if (!enabled) return;
    const revision = ++authRevision;
    const input = analyticsIdentityInput(id);
    if (accountReady && input === currentAccount) return;
    accountReady = false;
    try {
        const nextId = input ? await sha256(input) : null;
        if (revision !== authRevision) return;
        const saved = posthog.get_distinct_id();
        if (/^[a-f0-9]{64}$/.test(saved) && nextId !== saved) posthog.reset();
        if (nextId) posthog.identify(nextId);
        currentAccount = input;
    } catch {
        if (revision === authRevision) {
            try { posthog.reset(); } catch { /* Discard measurements if reset also fails. */ return; }
            currentAccount = null;
        }
    }
    if (revision === authRevision) accountReady = true;
}
