import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, BadgeCheck, ShieldCheck, ChevronRight, Search, Filter, X, ChevronDown, Globe } from 'lucide-react';
import { fetchPublishedClubs } from '../utils/club';
import heroCourt from '../assets/home.jpeg';

const SA_REGIONS = [
    'Eastern Cape',
    'Free State',
    'Gauteng',
    'KwaZulu-Natal',
    'Limpopo',
    'Mpumalanga',
    'Northern Cape',
    'North West',
    'Western Cape',
];

/** Common SA locality → province map for clubs without an explicit region field. */
const CITY_TO_REGION = {
    johannesburg: 'Gauteng',
    sandton: 'Gauteng',
    pretoria: 'Gauteng',
    centurion: 'Gauteng',
    midrand: 'Gauteng',
    randburg: 'Gauteng',
    roodepoort: 'Gauteng',
    fourways: 'Gauteng',
    midstream: 'Gauteng',
    benoni: 'Gauteng',
    kempton: 'Gauteng',
    'cape town': 'Western Cape',
    claremont: 'Western Cape',
    'camps bay': 'Western Cape',
    stellenbosch: 'Western Cape',
    somerset: 'Western Cape',
    paarl: 'Western Cape',
    durban: 'KwaZulu-Natal',
    umhlanga: 'KwaZulu-Natal',
    pietermaritzburg: 'KwaZulu-Natal',
    bloemfontein: 'Free State',
    polokwane: 'Limpopo',
    nelspuit: 'Mpumalanga',
    mbombela: 'Mpumalanga',
    'port elizabeth': 'Eastern Cape',
    gqeberha: 'Eastern Cape',
    'east london': 'Eastern Cape',
};

/**
 * @param {string|null|undefined} value
 */
const normalize = (value) => String(value || '').trim().toLowerCase();

/**
 * Best-effort city label from club city field or address.
 * @param {{ city?: string|null, address?: string|null }} club
 */
const clubCityLabel = (club) => {
    const city = String(club?.city || '').trim();
    if (city) return city;
    const parts = String(club?.address || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    // Prefer locality before postal code / country.
    const locality = parts.find((p) => !/^\d{4,}$/.test(p) && !/^south africa$/i.test(p) && !/\d/.test(p));
    return locality || '';
};

/**
 * Infer SA region from city, address, or club name.
 * @param {{ name?: string|null, city?: string|null, address?: string|null }} club
 */
const clubRegionLabel = (club) => {
    const city = normalize(clubCityLabel(club));
    if (city && CITY_TO_REGION[city]) return CITY_TO_REGION[city];

    const hay = normalize([club?.city, club?.address, club?.name].filter(Boolean).join(' '));
    if (!hay) return '';

    for (const region of SA_REGIONS) {
        if (hay.includes(normalize(region))) return region;
    }
    for (const [place, region] of Object.entries(CITY_TO_REGION)) {
        if (hay.includes(place)) return region;
    }
    return '';
};

/**
 * Public directory of published clubs — /clubs
 */
const Clubs = () => {
    const [clubs, setClubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [regionFilter, setRegionFilter] = useState('All');
    const [cityFilter, setCityFilter] = useState('All');
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchPublishedClubs();
                setClubs(data);
            } catch (err) {
                console.error('Failed to load clubs:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const clubsWithMeta = useMemo(
        () => clubs.map((c) => ({
            ...c,
            _city: clubCityLabel(c),
            _region: clubRegionLabel(c),
        })),
        [clubs],
    );

    const uniqueRegions = useMemo(() => ['All', ...SA_REGIONS], []);

    const uniqueCities = useMemo(() => {
        const cities = clubsWithMeta
            .filter((c) => regionFilter === 'All' || c._region === regionFilter)
            .map((c) => c._city)
            .filter(Boolean);
        return ['All', ...[...new Set(cities)].sort((a, b) => a.localeCompare(b))];
    }, [clubsWithMeta, regionFilter]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return clubsWithMeta.filter((c) => {
            const matchesSearch = !q
                || c.name?.toLowerCase().includes(q)
                || c.short_name?.toLowerCase().includes(q)
                || c._city?.toLowerCase().includes(q)
                || c._region?.toLowerCase().includes(q)
                || c.address?.toLowerCase().includes(q);
            const matchesRegion = regionFilter === 'All' || c._region === regionFilter;
            const matchesCity = cityFilter === 'All' || c._city === cityFilter;
            return matchesSearch && matchesRegion && matchesCity;
        });
    }, [clubsWithMeta, search, regionFilter, cityFilter]);

    const activeFilterCount = (regionFilter !== 'All' ? 1 : 0) + (cityFilter !== 'All' ? 1 : 0);

    const clearFilters = () => {
        setRegionFilter('All');
        setCityFilter('All');
    };

    return (
        <div className="min-h-screen bg-black text-white pb-24">
            <Helmet>
                <title>Clubs | 4M Padel</title>
                <meta name="description" content="Padel clubs on 4M Padel — courts, facilities, organisations and events." />
            </Helmet>

            <div className="relative overflow-hidden border-b border-white/5 bg-gradient-to-br from-black via-[#0B0F19] to-black">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-0 w-screen h-[62vw] max-h-[420px] md:h-[38vw] md:max-h-[520px] lg:max-h-[560px] min-h-[260px] overflow-hidden">
                    <div className="absolute inset-0">
                        <img
                            src={heroCourt}
                            alt=""
                            className="w-full h-full object-cover object-[78%_center] md:object-[82%_center] grayscale contrast-[1.35] brightness-[0.95]"
                        />
                    </div>
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black via-black/75 to-transparent" />
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/25 via-black/45 to-black" />
                </div>
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-padel-green/5 blur-[100px] rounded-full pointer-events-none" />
                <div className="container mx-auto px-4 md:px-6 pt-28 md:pt-36 pb-10 md:pb-14 relative z-10">
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.25em] text-padel-green">4M Padel Ecosystem</span>
                    <h1 className="text-3xl md:text-5xl font-bold font-display tracking-tighter mt-2 leading-[1.05]">
                        Padel <span className="text-padel-green">Clubs</span>
                    </h1>
                    <p className="text-gray-400 text-sm md:text-base mt-3 max-w-xl">
                        Venues across South Africa — courts, facilities, and links to tournament organisers.
                    </p>

                    <div className="relative z-10 flex gap-1.5 md:gap-2 items-center max-w-2xl mt-6">
                        <div className="relative flex-1 bg-[#181818] border border-white/5 rounded-full shadow-lg">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 md:w-5 md:h-5" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search clubs..."
                                className="w-full bg-transparent py-3 md:py-3.5 pl-12 md:pl-14 pr-4 text-[14px] md:text-base text-white focus:outline-none placeholder-gray-500 rounded-full"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowFilters(true)}
                            className="relative flex items-center justify-center gap-2 bg-[#181818] border border-white/5 hover:bg-white/10 rounded-full px-5 md:px-6 py-3 md:py-3.5 text-gray-300 hover:text-white transition-all font-semibold text-sm md:text-base shrink-0 group shadow-lg"
                        >
                            <Filter className="w-4 h-4 md:w-5 md:h-5 text-gray-400 group-hover:text-white transition-colors" />
                            <span className="hidden sm:block">Filters</span>
                            {activeFilterCount > 0 && (
                                <span className="w-5 h-5 bg-[#CCFF00] text-black font-black text-[10px] md:text-xs rounded-full flex items-center justify-center shadow-lg ml-1">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {showFilters && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowFilters(false)}
                            className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed bottom-0 left-0 right-0 z-[1001] bg-[#141414] border-t border-white/10 rounded-t-3xl p-6 pb-28 md:pb-6 shadow-2xl flex flex-col gap-6 max-h-[85vh] overflow-y-auto md:max-w-md md:left-1/2 md:-translate-x-1/2 md:bottom-4 md:border md:rounded-3xl"
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-bold text-white">Filters</h3>
                                <button
                                    type="button"
                                    onClick={() => setShowFilters(false)}
                                    className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-full transition-colors border-0 cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-300">Region</label>
                                    <div className="relative">
                                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4 pointer-events-none" />
                                        <select
                                            value={regionFilter}
                                            onChange={(e) => {
                                                setRegionFilter(e.target.value);
                                                setCityFilter('All');
                                            }}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-padel-green transition-colors font-semibold text-sm"
                                        >
                                            {uniqueRegions.map((region) => (
                                                <option key={region} value={region} className="bg-[#141414]">
                                                    {region === 'All' ? 'All Regions' : region}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <ChevronDown className="w-4 h-4 text-gray-400" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-300">City</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4 pointer-events-none" />
                                        <select
                                            value={cityFilter}
                                            onChange={(e) => setCityFilter(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-padel-green transition-colors font-semibold text-sm"
                                        >
                                            {uniqueCities.map((city) => (
                                                <option key={city} value={city} className="bg-[#141414]">
                                                    {city === 'All' ? 'All Cities' : city}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <ChevronDown className="w-4 h-4 text-gray-400" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 flex gap-3">
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm cursor-pointer"
                                >
                                    Clear
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowFilters(false)}
                                    className="flex-1 bg-padel-green hover:bg-[#beff00] text-black font-bold py-3.5 rounded-xl transition-colors text-sm border-0 cursor-pointer"
                                >
                                    Show Results
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <div className="container mx-auto px-4 md:px-6 py-10">
                {loading ? (
                    <p className="text-gray-500 text-sm">Loading clubs…</p>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <MapPin size={40} className="mx-auto mb-4 opacity-40" />
                        <p className="text-sm">
                            {search.trim() || activeFilterCount > 0
                                ? 'No clubs match your search or filters.'
                                : 'No published clubs yet.'}
                        </p>
                        {activeFilterCount > 0 && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="mt-4 text-[10px] font-black uppercase tracking-widest text-padel-green bg-transparent border-0 cursor-pointer"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map((c) => (
                            <Link
                                key={c.id}
                                to={`/clubs/${c.slug}`}
                                className="group block bg-white/[0.02] border border-white/10 hover:border-padel-green/40 rounded-2xl p-5 transition-all h-full"
                            >
                                <div className="flex items-start gap-4">
                                    {c.logo_url ? (
                                        <img src={c.logo_url} alt="" className="w-14 h-14 rounded-2xl object-cover border border-white/10 shrink-0" />
                                    ) : (
                                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                            <MapPin size={20} className="text-gray-500" />
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                                            {c.verified && (
                                                <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/25">
                                                    <BadgeCheck size={9} /> Verified
                                                </span>
                                            )}
                                            {c.sapa_registered && (
                                                <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                                                    <ShieldCheck size={9} /> SAPA
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="text-lg font-bold font-display tracking-tighter text-white group-hover:text-padel-green transition-colors truncate">
                                            {c.short_name || c.name}
                                        </h2>
                                        {(c._city || c._region) && (
                                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                                <MapPin size={11} /> {[c._city, c._region].filter(Boolean).join(' · ')}
                                            </p>
                                        )}
                                    </div>
                                    <ChevronRight size={16} className="text-gray-600 group-hover:text-padel-green shrink-0 mt-1" />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
};

export default Clubs;
