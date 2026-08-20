import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    ArrowLeft, Sparkles, MapPin, ExternalLink, Check, X, Loader2,
    AlertTriangle, HelpCircle, Ban, Star, Search, ChevronDown, Unlink, Pencil, GitMerge,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { searchPlacesText, getPlaceDetails } from '../../utils/googleMaps';
import MergeClubModal from './MergeClubModal';

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
    { value: 'applied', label: 'Applied' },
];

const META_KEYS = ['google_place_id', 'google_maps_url', 'google_rating', 'google_ratings_total', 'google_synced_at'];

/** True if a club's current field value is still exactly what a past sync wrote —
 * used by Delist to only clear fields nobody has manually edited since. */
const valuesMatch = (a, b) => {
    if (a && typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
    if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
    return a === b;
};

const CLUB_SELECT_FIELDS = 'id, name, short_name, city, province, country, address, lat, lng, website_url, contact_phone, opening_hours, slug, logo_url, cover_image_url, gallery, google_place_id, google_maps_url, google_rating, google_ratings_total, google_synced_at';

const mapsLinkForRow = (row) => {
    if (row.clubs?.google_maps_url) return row.clubs.google_maps_url;
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
    const [syncing, setSyncing] = useState(false);

    const [searchRowId, setSearchRowId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [manualMapsUrl, setManualMapsUrl] = useState('');
    const [searching, setSearching] = useState(false);
    const [candidate, setCandidate] = useState(null); // { placeId, name, address, fillFields, metaFields, details }
    const [candidateLoading, setCandidateLoading] = useState(false);
    const [applyingManual, setApplyingManual] = useState(false);
    const [renamingRowId, setRenamingRowId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameBusy, setRenameBusy] = useState(false);
    const [mergeSourceClub, setMergeSourceClub] = useState(null);
    const [mergeInitialQuery, setMergeInitialQuery] = useState('');

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

    const syncFromGoogle = async () => {
        setSyncing(true);
        try {
            const { data, error } = await supabase.functions.invoke('sync-club-google', {
                body: { limit: 50 },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            const failed = data?.errors?.length || 0;
            toast.success(`Google sync checked ${data?.processed || 0} clubs and queued ${data?.queued || 0}${failed ? ` (${failed} failed)` : ''}.`);
            await load();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Google sync failed');
        } finally {
            setSyncing(false);
        }
    };

    // "Applied" = the club actually has a Google link right now (ground truth on
    // clubs.google_place_id/google_maps_url), not just review_status — a club can end up linked
    // without its review row ever being marked applied (e.g. edited outside this
    // flow), and Delist needs to find those too.
    const isRowApplied = (r) => Boolean(r.clubs?.google_place_id || r.clubs?.google_maps_url);

    const stats = useMemo(() => {
        const applied = rows.filter(isRowApplied).length;
        const pending = rows.filter((r) => r.review_status === 'pending' && !isRowApplied(r));
        return {
            applied,
            pending: pending.length,
            conflict: pending.filter((r) => r.match_status === 'conflict').length,
            weak: pending.filter((r) => r.match_status === 'matched').length,
            uncertain: pending.filter((r) => r.match_status === 'low_confidence').length,
            noMatch: pending.filter((r) => r.match_status === 'no_match').length,
        };
    }, [rows]);

    const visibleRows = useMemo(() => {
        if (filter === 'applied') return rows.filter(isRowApplied);
        const pending = rows.filter((r) => r.review_status === 'pending' && !isRowApplied(r));
        if (filter === 'all') return pending;
        return pending.filter((r) => r.match_status === filter);
    }, [rows, filter]);

    const closeFindMatch = () => {
        setSearchRowId(null);
        setSearchQuery('');
        setSearchResults([]);
        setManualMapsUrl('');
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
        setManualMapsUrl(row.clubs?.google_maps_url || '');
        setCandidate(null);
        runSearch(q);
    };

    const saveManualMapsLink = async (row) => {
        const value = manualMapsUrl.trim();
        let parsed;
        try {
            parsed = new URL(value);
        } catch {
            toast.error('Paste a complete Google Maps URL.');
            return;
        }
        const host = parsed.hostname.toLowerCase();
        const isGoogleMaps = (host === 'maps.app.goo.gl')
            || ((host === 'google.com' || host.endsWith('.google.com')) && parsed.pathname.includes('/maps'));
        if (!isGoogleMaps) {
            toast.error('That does not look like a Google Maps URL.');
            return;
        }

        setApplyingManual(true);
        try {
            const syncedAt = new Date().toISOString();
            const { error: clubError } = await supabase
                .from('clubs')
                .update({ google_maps_url: value, google_synced_at: syncedAt })
                .eq('id', row.club_id);
            if (clubError) throw clubError;

            const { error: matchError } = await supabase
                .from('club_google_matches')
                .update({
                    review_status: 'applied',
                    meta_fields: { google_maps_url: value, google_synced_at: syncedAt },
                    reviewed_at: syncedAt,
                    conflict_note: 'Maps link saved manually because the listing is not returned by the Places API.',
                })
                .eq('id', row.id);
            if (matchError) throw matchError;

            toast.success(`Saved the Google Maps link for ${row.clubs?.name}.`);
            closeFindMatch();
            await load();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to save Google Maps link');
        } finally {
            setApplyingManual(false);
        }
    };

    const pickCandidate = async (row, place) => {
        setCandidateLoading(true);
        setCandidate({ placeId: place.place_id, name: place.name, address: place.formatted_address });
        try {
            const [details, assignmentResult] = await Promise.all([
                getPlaceDetails(place.place_id),
                supabase
                    .from('clubs')
                    .select('id, name, short_name, slug')
                    .eq('google_place_id', place.place_id)
                    .neq('id', row.club_id)
                    .maybeSingle(),
            ]);
            if (assignmentResult.error) throw assignmentResult.error;
            const fillFields = buildFillFields(row.clubs, details);
            const metaFields = buildMetaFields(details);
            setCandidate({
                placeId: place.place_id,
                name: details.name,
                address: details.formatted_address,
                fillFields,
                metaFields,
                details,
                assignedClub: assignmentResult.data || null,
            });
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load place details');
            setCandidate(null);
        } finally {
            setCandidateLoading(false);
        }
    };

    const confirmManualMatch = async (row, { moveExisting = false } = {}) => {
        if (!candidate?.fillFields || !candidate?.metaFields) return;
        const selectedCandidate = candidate;
        if (selectedCandidate.assignedClub && !moveExisting) {
            toast.error(`This listing belongs to "${selectedCandidate.assignedClub.name}". Move it or merge the duplicate first.`);
            return;
        }
        if (selectedCandidate.assignedClub && moveExisting && !window.confirm(
            `Move this Google listing from "${selectedCandidate.assignedClub.name}" to "${row.clubs?.name}"? Google-synced fields on the other club will be cleared when they have not been edited.`,
        )) return;
        setApplyingManual(true);
        try {
            if (selectedCandidate.assignedClub && moveExisting) {
                const otherRow = rows.find((item) => item.club_id === selectedCandidate.assignedClub.id);
                if (otherRow) {
                    await delistRow(otherRow);
                } else {
                    const clearPayload = {};
                    META_KEYS.forEach((key) => { clearPayload[key] = null; });
                    const { error: clearError } = await supabase
                        .from('clubs')
                        .update(clearPayload)
                        .eq('id', selectedCandidate.assignedClub.id);
                    if (clearError) throw clearError;
                }
            }

            const payload = { ...selectedCandidate.fillFields, ...selectedCandidate.metaFields };
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
                    google_place_id: selectedCandidate.placeId,
                    google_name: selectedCandidate.name,
                    google_address: selectedCandidate.address,
                    confidence: 1,
                    fill_fields: selectedCandidate.fillFields,
                    meta_fields: selectedCandidate.metaFields,
                    business_status: selectedCandidate.details?.business_status || null,
                    conflict_note: null,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', row.id);
            if (matchErr) throw matchErr;

            toast.success(`Applied — ${row.clubs?.name} matched to "${selectedCandidate.name}"`);
            closeFindMatch();
            await load();
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
                .update({
                    match_status: 'matched',
                    review_status: 'applied',
                    conflict_note: null,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', row.id);
            if (matchErr) throw matchErr;

            toast.success(`Applied Google data to ${row.clubs?.name || 'club'}`);
            await load();
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

    /** Core of "delist": clear a club's Google link and revert any fields
     * nobody has touched since (fields already edited manually are left alone),
     * then reset its review row to a clean slate. Shared by delisting a club's
     * own wrong match and by removing a *conflicting* club's claim so a
     * different club can correctly take the listing instead. */
    const delistRow = async (targetRow) => {
        const { data: freshClub, error: fetchErr } = await supabase
            .from('clubs')
            .select(CLUB_SELECT_FIELDS)
            .eq('id', targetRow.club_id)
            .maybeSingle();
        if (fetchErr) throw fetchErr;

        const revertPayload = {};
        META_KEYS.forEach((k) => { revertPayload[k] = null; });
        Object.entries(targetRow.fill_fields || {}).forEach(([key, val]) => {
            if (freshClub && valuesMatch(freshClub[key], val)) revertPayload[key] = null;
        });

        const { error: clubErr } = await supabase.from('clubs').update(revertPayload).eq('id', targetRow.club_id);
        if (clubErr) throw clubErr;

        const { error: matchErr } = await supabase
            .from('club_google_matches')
            .update({
                match_status: 'no_match',
                review_status: 'pending',
                google_place_id: null,
                google_name: null,
                google_address: null,
                confidence: null,
                fill_fields: {},
                meta_fields: {},
                business_status: null,
                conflict_note: null,
                reviewed_at: null,
            })
            .eq('id', targetRow.id);
        if (matchErr) throw matchErr;
    };

    /** Undo a wrongly-applied match on this row, then re-open Find match so
     * the admin can search for the correct listing right away. */
    const handleDelist = async (row) => {
        if (!window.confirm(
            `Remove the Google link for ${row.clubs?.name || 'this club'}? Fields that came from this match and haven't been edited since will be cleared too.`,
        )) return;
        setBusyId(row.id);
        try {
            await delistRow(row);
            toast.success(`Delisted — cleared the Google link for ${row.clubs?.name}. Search again below.`);
            await load();
            openFindMatch(row);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to delist');
        } finally {
            setBusyId(null);
        }
    };

    /** For a conflict row: the OTHER club is holding the listing this row
     * matched too. If that other match is genuinely wrong (not a duplicate —
     * use Merge for that), this frees the listing from the other club so it
     * can be approved here instead. */
    const handleRemoveConflictingListing = async (row) => {
        if (!row.google_place_id) {
            toast.error('No Google listing on record for this conflict.');
            return;
        }
        setBusyId(row.id);
        try {
            const { data: otherClub, error: findErr } = await supabase
                .from('clubs')
                .select('id, name')
                .eq('google_place_id', row.google_place_id)
                .neq('id', row.club_id)
                .maybeSingle();
            if (findErr) throw findErr;
            if (!otherClub) {
                toast.info('That listing is already free — try Approve again.');
                await load();
                return;
            }
            if (!window.confirm(
                `Remove the Google link from "${otherClub.name}"? This treats "${row.clubs?.name || 'this club'}" as the correct match instead. Fields on "${otherClub.name}" that came from that match and haven't been edited since will be cleared.`,
            )) return;

            const otherRow = rows.find((r) => r.club_id === otherClub.id);
            if (otherRow) {
                await delistRow(otherRow);
            } else {
                const clearPayload = {};
                META_KEYS.forEach((k) => { clearPayload[k] = null; });
                const { error } = await supabase.from('clubs').update(clearPayload).eq('id', otherClub.id);
                if (error) throw error;
            }

            toast.success(`Removed the Google link from "${otherClub.name}" — you can now approve this match.`);
            await load();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to remove the conflicting listing');
        } finally {
            setBusyId(null);
        }
    };

    const startRename = (row) => {
        setRenamingRowId(row.id);
        setRenameValue(row.clubs?.name || '');
    };

    const cancelRename = () => {
        setRenamingRowId(null);
        setRenameValue('');
    };

    const saveRename = async (row) => {
        const name = renameValue.trim();
        if (!name) {
            toast.error('Club name cannot be empty');
            return;
        }
        if (name === row.clubs?.name) {
            cancelRename();
            return;
        }
        setRenameBusy(true);
        try {
            const { error } = await supabase.from('clubs').update({ name }).eq('id', row.club_id);
            if (error) throw error;
            setRows((prev) => prev.map((r) => (
                r.id === row.id ? { ...r, clubs: { ...r.clubs, name } } : r
            )));
            toast.success(`Renamed to "${name}"`);
            cancelRename();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to rename club');
        } finally {
            setRenameBusy(false);
        }
    };

    /** Conflict rows already know the place_id another club is holding —
     * look that club up so the merge picker opens pre-filled with its name. */
    const openMergeForConflict = async (row) => {
        setMergeSourceClub(row.clubs);
        setMergeInitialQuery('');
        if (row.google_place_id) {
            try {
                const { data } = await supabase
                    .from('clubs')
                    .select('name')
                    .eq('google_place_id', row.google_place_id)
                    .neq('id', row.club_id)
                    .maybeSingle();
                if (data?.name) setMergeInitialQuery(data.name);
            } catch (err) {
                console.error(err);
            }
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
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={syncFromGoogle}
                        disabled={syncing}
                        className="px-3 py-2 rounded-xl bg-padel-green text-black hover:bg-white text-xs font-black flex items-center gap-2 disabled:opacity-50"
                    >
                        {syncing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        {syncing ? 'Syncing…' : 'Sync next 50'}
                    </button>
                    <button
                        type="button"
                        onClick={load}
                        disabled={loading || syncing}
                        className="px-3 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                    >
                        Refresh list
                    </button>
                </div>
            </div>

            <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <Sparkles className="text-padel-green" size={22} /> Google Sync
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                    Review club data pulled from the Google Places API. Only currently-empty fields are
                    ever filled — approving a row never overwrites data a club owner already entered.
                    Google's API doesn't always surface small or low-review listings, so uncertain and
                    no-match rows can be resolved manually with "Find match". “Sync next 50” calls Google and
                    rebuilds the review queue; “Refresh list” only reloads what is already saved.
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
                ) : visibleRows.length === 0 ? (
                    <div className="p-10 text-center text-sm text-gray-500">
                        Nothing here — every club in this filter has been reviewed.
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {visibleRows.map((row) => {
                            const isApplied = isRowApplied(row);
                            const meta = STATUS_META[row.match_status] || STATUS_META.no_match;
                            const StatusIcon = meta.icon;
                            const canApply = Boolean(
                                (row.fill_fields && Object.keys(row.fill_fields).length > 0) || row.meta_fields?.google_place_id,
                            );
                            const filledKeys = Object.keys(row.fill_fields || {});
                            const previewPhotos = photoUrlsFromFillFields(row.fill_fields);
                            const isBusy = busyId === row.id;
                            const panelOpen = searchRowId === row.id;
                            const isRenaming = renamingRowId === row.id;
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
                                                {isRenaming ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <input
                                                            autoFocus
                                                            value={renameValue}
                                                            onChange={(e) => setRenameValue(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') saveRename(row);
                                                                if (e.key === 'Escape') cancelRename();
                                                            }}
                                                            disabled={renameBusy}
                                                            className="min-w-0 flex-1 bg-black/40 border border-padel-green/40 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-padel-green"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={renameBusy}
                                                            onClick={() => saveRename(row)}
                                                            className="p-1.5 rounded-lg bg-padel-green text-black disabled:opacity-40"
                                                            title="Save name"
                                                        >
                                                            {renameBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={renameBusy}
                                                            onClick={cancelRename}
                                                            className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40"
                                                            title="Cancel"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="text-sm font-bold text-white truncate">{row.clubs?.name || 'Unknown club'}</p>
                                                        <button
                                                            type="button"
                                                            onClick={() => startRename(row)}
                                                            title="Rename club"
                                                            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 shrink-0"
                                                        >
                                                            <Pencil size={11} />
                                                        </button>
                                                        {isApplied ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-padel-green/10 text-padel-green border-padel-green/25">
                                                                <Check size={10} /> Applied
                                                            </span>
                                                        ) : (
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${meta.className}`}>
                                                                <StatusIcon size={10} /> {meta.label}
                                                            </span>
                                                        )}
                                                        {row.confidence != null && (
                                                            <span className="text-[10px] text-gray-500">
                                                                {Math.round(row.confidence * 100)}% name match
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
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
                                                        {isApplied ? 'Filled' : 'Would fill'}: {filledKeys.map((k) => fieldLabels[k] || k).join(', ')}
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
                                            {isApplied ? (
                                                <button
                                                    type="button"
                                                    disabled={isBusy}
                                                    onClick={() => handleDelist(row)}
                                                    title="Synced to the wrong listing? Clear it and search again."
                                                    className="px-3 py-2 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-xs font-bold flex items-center gap-1.5 disabled:opacity-30"
                                                >
                                                    {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />} Delist
                                                </button>
                                            ) : (
                                                <>
                                                    {row.match_status === 'conflict' && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                disabled={isBusy}
                                                                onClick={() => openMergeForConflict(row)}
                                                                title="Merge this club with the one already holding the listing"
                                                                className="px-3 py-2 rounded-xl border border-sky-500/25 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-xs font-bold flex items-center gap-1.5 disabled:opacity-30"
                                                            >
                                                                <GitMerge size={12} /> Merge
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={isBusy}
                                                                onClick={() => handleRemoveConflictingListing(row)}
                                                                title="Not a duplicate — the other club's match is just wrong. Free the listing so this club can take it."
                                                                className="px-3 py-2 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-xs font-bold flex items-center gap-1.5 disabled:opacity-30"
                                                            >
                                                                {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />} Remove listing
                                                            </button>
                                                        </>
                                                    )}
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
                                                </>
                                            )}
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

                                            {!searching && searchResults.length === 0 && (
                                                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 space-y-2">
                                                    <div>
                                                        <p className="text-xs font-bold text-amber-300">Listing visible on Maps but missing from Places?</p>
                                                        <p className="mt-1 text-[11px] text-gray-500">
                                                            Google Maps and the Places API can return different listings. Paste the Maps link to keep a working directions link; ratings, reviews and Google photos will become available only if Google later exposes a Place ID through the API.
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col sm:flex-row gap-2">
                                                        <input
                                                            value={manualMapsUrl}
                                                            onChange={(e) => setManualMapsUrl(e.target.value)}
                                                            placeholder="https://www.google.com/maps/place/…"
                                                            className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500/50"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={applyingManual || !manualMapsUrl.trim()}
                                                            onClick={() => saveManualMapsLink(row)}
                                                            className="px-3 py-2 rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300 text-xs font-bold disabled:opacity-40"
                                                        >
                                                            {applyingManual ? 'Saving…' : 'Save Maps link'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {candidateLoading && (
                                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                                    <Loader2 size={12} className="animate-spin" /> Loading place details…
                                                </div>
                                            )}

                                            {candidate?.fillFields && !candidateLoading && (
                                                <div className={`rounded-xl border p-3 space-y-2 ${
                                                    candidate.assignedClub
                                                        ? 'border-red-500/30 bg-red-500/5'
                                                        : 'border-padel-green/30 bg-padel-green/5'
                                                }`}>
                                                    <p className="text-xs text-white font-bold">
                                                        Confirm: {candidate.name}
                                                    </p>
                                                    <p className="text-[11px] text-gray-400">{candidate.address}</p>
                                                    <p className="text-[11px] text-gray-500">
                                                        {Object.keys(candidate.fillFields).length > 0
                                                            ? `Will fill: ${Object.keys(candidate.fillFields).map((k) => fieldLabels[k] || k).join(', ')}`
                                                            : 'No empty fields to fill — will still link this club to the Google listing.'}
                                                    </p>
                                                    {candidate.assignedClub && (
                                                        <div className="rounded-lg border border-red-500/20 bg-black/20 p-2.5">
                                                            <p className="text-xs font-bold text-red-300">Already linked to {candidate.assignedClub.name}</p>
                                                            <p className="mt-1 text-[11px] text-gray-500">
                                                                If these are the same club, merge the duplicate records. If the other club has the wrong Google listing, move it here.
                                                            </p>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-2 pt-1">
                                                        {candidate.assignedClub ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    disabled={applyingManual}
                                                                    onClick={() => {
                                                                        setMergeSourceClub(row.clubs);
                                                                        setMergeInitialQuery(candidate.assignedClub.name);
                                                                    }}
                                                                    className="px-3 py-2 rounded-xl bg-padel-green text-black text-xs font-black flex items-center gap-1.5 disabled:opacity-40"
                                                                >
                                                                    <GitMerge size={12} /> Merge duplicate
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={applyingManual}
                                                                    onClick={() => confirmManualMatch(row, { moveExisting: true })}
                                                                    className="px-3 py-2 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
                                                                >
                                                                    {applyingManual ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />} Move listing here
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                disabled={applyingManual}
                                                                onClick={() => confirmManualMatch(row)}
                                                                className="px-3 py-2 rounded-xl bg-padel-green text-black text-xs font-black flex items-center gap-1.5 disabled:opacity-40"
                                                            >
                                                                {applyingManual ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Confirm &amp; apply
                                                            </button>
                                                        )}
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

            {mergeSourceClub && (
                <MergeClubModal
                    sourceClub={mergeSourceClub}
                    initialQuery={mergeInitialQuery}
                    onClose={() => { setMergeSourceClub(null); setMergeInitialQuery(''); }}
                    onMerged={() => { setMergeSourceClub(null); setMergeInitialQuery(''); load(); }}
                />
            )}
        </div>
    );
};

export default GoogleSyncManager;
