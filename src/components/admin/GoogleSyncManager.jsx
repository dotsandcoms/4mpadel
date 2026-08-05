import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    ArrowLeft, Sparkles, MapPin, ExternalLink, Check, X, Loader2,
    AlertTriangle, HelpCircle, Ban, Star, Search, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { searchPlacesText, getPlaceDetails } from '../../utils/googleMaps';

const STATUS_META = {
    conflict: { label: 'Conflict', icon: AlertTriangle, className: 'bg-red-500/10 text-red-300 border-red-500/25' },
    low_confidence: { label: 'Uncertain', icon: HelpCircle, className: 'bg-amber-500/10 text-amber-300 border-amber-500/25' },
    no_match: { label: 'No match', icon: Ban, className: 'bg-white/5 text-gray-400 border-white/10' },
    matched: { label: 'Weak match', icon: HelpCircle, className: 'bg-amber-500/10 text-amber-300 border-amber-500/25' },
};

const FILTER_TABS = [
    { value: 'all', label: 'All pending' },
    { value: 'conflict', label: 'Conflicts' },
    { value: 'matched', label: 'Weak matches' },
    { value: 'low_confidence', label: 'Uncertain' },
    { value: 'no_match', label: 'No match' },
];

const CLUB_SELECT_FIELDS = 'id, name, short_name, city, province, country, address, lat, lng, website_url, contact_phone, opening_hours, slug, logo_url, cover_image_url, gallery';

const mapsLinkForRow = (row) => {
    if (row.google_place_id) {
        return `https://www.google.com/maps/place/?q=place_id:${row.google_place_id}`;
    }
    const q = [row.clubs?.name, row.clubs?.city, 'padel', 'South Africa'].filter(Boolean).join(' ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
};

const fieldLabels = {
    address: 'Address', city: 'City', province: 'Province', country: 'Country',
    lat: 'Lat', lng: 'Lng', website_url: 'Website', contact_phone: 'Phone', opening_hours: 'Opening hours',
    cover_image_url: 'Cover image', gallery: 'Gallery photos',
};

// Photos that scripts/google-enrich-clubs.mjs --with-photos already downloaded and
// re-hosted in Supabase Storage — safe to preview directly, no Google API key needed.
const photoUrlsFromFillFields = (fillFields) => {
    if (!fillFields) return [];
    const urls = [];
    if (fillFields.cover_image_url) urls.push(fillFields.cover_image_url);
    if (Array.isArray(fillFields.gallery)) {
        fillFields.gallery.forEach((g) => { if (g?.url) urls.push(g.url); });
    }
    return urls;
};

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const hhmm = (t) => (!t || t.length !== 4 ? null : `${t.slice(0, 2)}:${t.slice(2)}`);

function mapOpeningHours(periods) {
    if (!Array.isArray(periods) || periods.length === 0) return null;
    const result = {};
    DAY_KEYS.forEach((k) => { result[k] = { open: '00:00', close: '00:00', closed: true }; });
    periods.forEach((period) => {
        const openDay = period.open?.day;
        if (openDay === undefined || openDay === null) return;
        const open = hhmm(period.open?.time);
        const close = period.close ? hhmm(period.close.time) : '23:59';
        if (!open) return;
        result[DAY_KEYS[openDay]] = { open, close: close || '23:59', closed: false };
    });
    return result;
}

function extractAddressParts(components = []) {
    const find = (type) => components.find((c) => c.types.includes(type))?.long_name || null;
    return {
        city: find('locality') || find('sublocality') || find('postal_town'),
        province: find('administrative_area_level_1'),
        country: find('country'),
    };
}

function buildFillFields(club, details) {
    const addressParts = extractAddressParts(details.address_components);
    const openingHours = mapOpeningHours(details.opening_hours?.periods);
    const lat = typeof details.geometry?.location?.lat === 'function' ? details.geometry.location.lat() : details.geometry?.location?.lat;
    const lng = typeof details.geometry?.location?.lng === 'function' ? details.geometry.location.lng() : details.geometry?.location?.lng;
    const fill = {};
    if (!club?.address && details.formatted_address) fill.address = details.formatted_address;
    if (!club?.city && addressParts.city) fill.city = addressParts.city;
    if (!club?.province && addressParts.province) fill.province = addressParts.province;
    if (!club?.country && addressParts.country) fill.country = addressParts.country;
    if (!club?.lat && lat) fill.lat = lat;
    if (!club?.lng && lng) fill.lng = lng;
    if (!club?.website_url && details.website) fill.website_url = details.website;
    if (!club?.contact_phone && details.international_phone_number) fill.contact_phone = details.international_phone_number;
    if ((!club?.opening_hours || Object.keys(club.opening_hours).length === 0) && openingHours) fill.opening_hours = openingHours;
    return fill;
}

const buildMetaFields = (details) => ({
    google_place_id: details.place_id,
    google_maps_url: details.url || null,
    google_rating: details.rating ?? null,
    google_ratings_total: details.user_ratings_total ?? null,
    google_synced_at: new Date().toISOString(),
});

const defaultQueryFor = (club) => [club?.name, 'padel', club?.city, 'South Africa'].filter(Boolean).join(' ');

/**
 * Review queue for Google Places matches produced by scripts/google-enrich-clubs.mjs.
 * Lets an admin approve (write to clubs) or dismiss uncertain/conflicting matches,
 * or manually search Google Places live for cases the automated matcher missed.
 */
const GoogleSyncManager = ({ onBack }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [busyId, setBusyId] = useState(null);
    const [totalClubs, setTotalClubs] = useState(0);

    const [searchRowId, setSearchRowId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [candidate, setCandidate] = useState(null); // { placeId, name, address, fillFields, metaFields, details }
    const [candidateLoading, setCandidateLoading] = useState(false);
    const [applyingManual, setApplyingManual] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [{ data: matches, error }, { count }] = await Promise.all([
                supabase
                    .from('club_google_matches')
                    .select(`*, clubs(${CLUB_SELECT_FIELDS})`)
                    .order('created_at', { ascending: true }),
                supabase.from('clubs').select('id', { count: 'exact', head: true }),
            ]);
            if (error) throw error;
            setRows(matches || []);
            setTotalClubs(count || 0);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load Google Sync data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const stats = useMemo(() => {
        const applied = rows.filter((r) => r.review_status === 'applied').length;
        const pending = rows.filter((r) => r.review_status === 'pending');
        return {
            applied,
            pending: pending.length,
            conflict: pending.filter((r) => r.match_status === 'conflict').length,
            weak: pending.filter((r) => r.match_status === 'matched').length,
            uncertain: pending.filter((r) => r.match_status === 'low_confidence').length,
            noMatch: pending.filter((r) => r.match_status === 'no_match').length,
        };
    }, [rows]);

    const pendingRows = useMemo(() => {
        const pending = rows.filter((r) => r.review_status === 'pending');
        if (filter === 'all') return pending;
        return pending.filter((r) => r.match_status === filter);
    }, [rows, filter]);

    const closeFindMatch = () => {
        setSearchRowId(null);
        setSearchQuery('');
        setSearchResults([]);
        setCandidate(null);
    };

    const runSearch = async (query) => {
        const q = query.trim();
        if (!q) return;
        setSearching(true);
        setCandidate(null);
        try {
            const results = await searchPlacesText(q);
            setSearchResults(results);
            if (results.length === 0) toast.info('No Google results for that search — try a different phrasing.');
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Google search failed');
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    const openFindMatch = (row) => {
        const q = defaultQueryFor(row.clubs);
        setSearchRowId(row.id);
        setSearchQuery(q);
        setSearchResults([]);
        setCandidate(null);
        runSearch(q);
    };

    const pickCandidate = async (row, place) => {
        setCandidateLoading(true);
        setCandidate({ placeId: place.place_id, name: place.name, address: place.formatted_address });
        try {
            const details = await getPlaceDetails(place.place_id);
            const fillFields = buildFillFields(row.clubs, details);
            const metaFields = buildMetaFields(details);
            setCandidate({
                placeId: place.place_id,
                name: details.name,
                address: details.formatted_address,
                fillFields,
                metaFields,
                details,
            });
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load place details');
            setCandidate(null);
        } finally {
            setCandidateLoading(false);
        }
    };

    const confirmManualMatch = async (row) => {
        if (!candidate?.fillFields || !candidate?.metaFields) return;
        setApplyingManual(true);
        try {
            const payload = { ...candidate.fillFields, ...candidate.metaFields };
            const { data: updatedClubs, error: clubErr } = await supabase
                .from('clubs')
                .update(payload)
                .eq('id', row.club_id)
                .select('id');
            if (clubErr) {
                if (clubErr.code === '23505') {
                    throw new Error('This Google listing is already assigned to another club — resolve the duplicate first.');
                }
                throw clubErr;
            }
            if (!updatedClubs || updatedClubs.length === 0) {
                throw new Error('Nothing was saved — the club row could not be updated (likely a permissions issue). No data was written.');
            }
            const { error: matchErr } = await supabase
                .from('club_google_matches')
                .update({
                    match_status: 'matched',
                    review_status: 'applied',
                    google_place_id: candidate.placeId,
                    google_name: candidate.name,
                    google_address: candidate.address,
                    confidence: 1,
                    fill_fields: candidate.fillFields,
                    meta_fields: candidate.metaFields,
                    business_status: candidate.details?.business_status || null,
                    conflict_note: null,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', row.id);
            if (matchErr) throw matchErr;

            toast.success(`Applied — ${row.clubs?.name} matched to "${candidate.name}"`);
            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, review_status: 'applied' } : r)));
            closeFindMatch();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to apply manual match');
        } finally {
            setApplyingManual(false);
        }
    };

    const handleApprove = async (row) => {
        const hasData = row.fill_fields && Object.keys(row.fill_fields).length > 0;
        const payload = { ...(row.fill_fields || {}), ...(row.meta_fields || {}) };
        if (!hasData && !row.meta_fields?.google_place_id) {
            toast.error('No data to apply yet — use "Find match" to search Google directly.');
            return;
        }
        setBusyId(row.id);
        try {
            const { data: updatedClubs, error: clubErr } = await supabase
                .from('clubs')
                .update(payload)
                .eq('id', row.club_id)
                .select('id');
            if (clubErr) {
                if (clubErr.code === '23505') {
                    throw new Error('This Google listing is already assigned to another club — resolve the duplicate first.');
                }
                throw clubErr;
            }
            if (!updatedClubs || updatedClubs.length === 0) {
                throw new Error('Nothing was saved — the club row could not be updated (likely a permissions issue). No data was written.');
            }
            const { error: matchErr } = await supabase
                .from('club_google_matches')
                .update({ review_status: 'applied', reviewed_at: new Date().toISOString() })
                .eq('id', row.id);
            if (matchErr) throw matchErr;

            toast.success(`Applied Google data to ${row.clubs?.name || 'club'}`);
            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, review_status: 'applied' } : r)));
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to apply');
        } finally {
            setBusyId(null);
        }
    };

    const handleDismiss = async (row) => {
        setBusyId(row.id);
        try {
            const { error } = await supabase
                .from('club_google_matches')
                .update({ review_status: 'dismissed', reviewed_at: new Date().toISOString() })
                .eq('id', row.id);
            if (error) throw error;
            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, review_status: 'dismissed' } : r)));
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to dismiss');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white"
                >
                    <ArrowLeft size={14} /> Back to Clubs
                </button>
                <button
                    type="button"
                    onClick={load}
                    className="px-3 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-bold flex items-center gap-2"
                >
                    Refresh
                </button>
            </div>

            <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <Sparkles className="text-padel-green" size={22} /> Google Sync
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                    Review club data pulled from the Google Places API. Only currently-empty fields are
                    ever filled — approving a row never overwrites data a club owner already entered.
                    Google's API doesn't always surface small or low-review listings, so uncertain and
                    no-match rows can be resolved manually with "Find match".
                </p>
            </div>

            <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
                {[
                    { label: 'Total clubs', value: totalClubs, tone: 'text-white' },
                    { label: 'Applied', value: stats.applied, tone: 'text-padel-green' },
                    { label: 'Conflicts', value: stats.conflict, tone: 'text-red-400' },
                    { label: 'Weak matches', value: stats.weak, tone: 'text-amber-300' },
                    { label: 'Uncertain', value: stats.uncertain, tone: 'text-amber-300' },
                    { label: 'No match', value: stats.noMatch, tone: 'text-gray-400' },
                ].map((s) => (
                    <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 shadow-xl">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{s.label}</p>
                        <p className={`mt-2 text-2xl font-display font-bold tracking-tighter ${s.tone}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {FILTER_TABS.map((tab) => (
                    <button
                        key={tab.value}
                        type="button"
                        onClick={() => setFilter(tab.value)}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors ${
                            filter === tab.value
                                ? 'bg-padel-green text-black border-padel-green'
                                : 'border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden shadow-2xl">
                {loading ? (
                    <div className="p-10 text-center text-gray-500 flex items-center justify-center gap-2">
                        <Loader2 size={16} className="animate-spin" /> Loading…
                    </div>
                ) : pendingRows.length === 0 ? (
                    <div className="p-10 text-center text-sm text-gray-500">
                        Nothing here — every club in this filter has been reviewed.
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {pendingRows.map((row) => {
                            const meta = STATUS_META[row.match_status] || STATUS_META.no_match;
                            const StatusIcon = meta.icon;
                            const canApply = Boolean(
                                (row.fill_fields && Object.keys(row.fill_fields).length > 0) || row.meta_fields?.google_place_id,
                            );
                            const filledKeys = Object.keys(row.fill_fields || {});
                            const previewPhotos = photoUrlsFromFillFields(row.fill_fields);
                            const isBusy = busyId === row.id;
                            const panelOpen = searchRowId === row.id;
                            return (
                                <div key={row.id} className="p-4 space-y-3">
                                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                            {row.clubs?.logo_url ? (
                                                <img src={row.clubs.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover border border-white/10 shrink-0" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                                    <MapPin size={14} />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1 space-y-1.5">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-bold text-white truncate">{row.clubs?.name || 'Unknown club'}</p>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${meta.className}`}>
                                                        <StatusIcon size={10} /> {meta.label}
                                                    </span>
                                                    {row.confidence != null && (
                                                        <span className="text-[10px] text-gray-500">
                                                            {Math.round(row.confidence * 100)}% name match
                                                        </span>
                                                    )}
                                                </div>
                                                {row.google_name && (
                                                    <p className="text-xs text-gray-400 truncate">
                                                        Google: <span className="text-gray-300">{row.google_name}</span>
                                                        {row.google_address ? ` — ${row.google_address}` : ''}
                                                    </p>
                                                )}
                                                {row.conflict_note && (
                                                    <p className="text-[11px] text-red-300/90">{row.conflict_note}</p>
                                                )}
                                                {filledKeys.length > 0 && (
                                                    <p className="text-[11px] text-gray-500">
                                                        Would fill: {filledKeys.map((k) => fieldLabels[k] || k).join(', ')}
                                                    </p>
                                                )}
                                                {previewPhotos.length > 0 && (
                                                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                                        {previewPhotos.slice(0, 6).map((url, i) => (
                                                            <img
                                                                key={url + i}
                                                                src={url}
                                                                alt=""
                                                                className="w-10 h-10 rounded-lg object-cover border border-white/10"
                                                            />
                                                        ))}
                                                        {previewPhotos.length > 6 && (
                                                            <span className="text-[10px] text-gray-500">+{previewPhotos.length - 6} more</span>
                                                        )}
                                                    </div>
                                                )}
                                                <a
                                                    href={mapsLinkForRow(row)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-padel-green hover:underline"
                                                >
                                                    <ExternalLink size={10} /> View on Google Maps
                                                </a>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                            <button
                                                type="button"
                                                disabled={isBusy || !canApply}
                                                onClick={() => handleApprove(row)}
                                                title={canApply ? 'Apply this data to the club' : 'No data available to apply'}
                                                className="px-3 py-2 rounded-xl bg-padel-green text-black text-xs font-black flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => (panelOpen ? closeFindMatch() : openFindMatch(row))}
                                                className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 disabled:opacity-30 ${
                                                    panelOpen
                                                        ? 'border-padel-green/40 bg-padel-green/10 text-padel-green'
                                                        : 'border-white/10 text-gray-300 hover:bg-white/5'
                                                }`}
                                            >
                                                <Search size={12} /> Find match
                                                <ChevronDown size={12} className={`transition-transform ${panelOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => handleDismiss(row)}
                                                className="px-3 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-bold flex items-center gap-1.5 disabled:opacity-30"
                                            >
                                                <X size={12} /> Dismiss
                                            </button>
                                        </div>
                                    </div>

                                    {panelOpen && (
                                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="relative flex-1">
                                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                                    <input
                                                        value={searchQuery}
                                                        onChange={(e) => setSearchQuery(e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') runSearch(searchQuery); }}
                                                        placeholder="Search Google Places…"
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-padel-green"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => runSearch(searchQuery)}
                                                    disabled={searching}
                                                    className="px-3 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-bold disabled:opacity-40"
                                                >
                                                    {searching ? <Loader2 size={12} className="animate-spin" /> : 'Search'}
                                                </button>
                                            </div>

                                            {searchResults.length > 0 && (
                                                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                                    {searchResults.map((place) => {
                                                        const isSelected = candidate?.placeId === place.place_id;
                                                        return (
                                                            <button
                                                                key={place.place_id}
                                                                type="button"
                                                                onClick={() => pickCandidate(row, place)}
                                                                className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-colors ${
                                                                    isSelected
                                                                        ? 'border-padel-green/50 bg-padel-green/10'
                                                                        : 'border-white/10 hover:bg-white/5'
                                                                }`}
                                                            >
                                                                <p className="text-white font-bold truncate">{place.name}</p>
                                                                <p className="text-gray-500 truncate">{place.formatted_address}</p>
                                                                {place.rating != null && (
                                                                    <p className="text-gray-500">
                                                                        {place.rating}★ ({place.user_ratings_total || 0} reviews)
                                                                    </p>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {candidateLoading && (
                                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                                    <Loader2 size={12} className="animate-spin" /> Loading place details…
                                                </div>
                                            )}

                                            {candidate?.fillFields && !candidateLoading && (
                                                <div className="rounded-xl border border-padel-green/30 bg-padel-green/5 p-3 space-y-2">
                                                    <p className="text-xs text-white font-bold">
                                                        Confirm: {candidate.name}
                                                    </p>
                                                    <p className="text-[11px] text-gray-400">{candidate.address}</p>
                                                    <p className="text-[11px] text-gray-500">
                                                        {Object.keys(candidate.fillFields).length > 0
                                                            ? `Will fill: ${Object.keys(candidate.fillFields).map((k) => fieldLabels[k] || k).join(', ')}`
                                                            : 'No empty fields to fill — will still link this club to the Google listing.'}
                                                    </p>
                                                    <div className="flex items-center gap-2 pt-1">
                                                        <button
                                                            type="button"
                                                            disabled={applyingManual}
                                                            onClick={() => confirmManualMatch(row)}
                                                            className="px-3 py-2 rounded-xl bg-padel-green text-black text-xs font-black flex items-center gap-1.5 disabled:opacity-40"
                                                        >
                                                            {applyingManual ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Confirm &amp; apply
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={applyingManual}
                                                            onClick={() => setCandidate(null)}
                                                            className="px-3 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-bold"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {stats.applied > 0 && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Star size={12} className="text-padel-green" /> {stats.applied} clubs already auto-filled from Google — visible directly on their club edit page.
                </p>
            )}
        </div>
    );
};

export default GoogleSyncManager;
