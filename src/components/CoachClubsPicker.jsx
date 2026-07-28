import React, { useMemo, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { toast } from 'sonner';
import { useClubs } from '../hooks/useClubs';

export const MAX_COACH_CLUBS = 3;

/**
 * Format selected club names for the coaching_location text column.
 * @param {string[]} names
 */
export const formatCoachingLocation = (names) => names.filter(Boolean).join(' · ');

/**
 * Parse stored coaching_location text into club name chips.
 * Supports " · ", " / ", and comma separators from older free-text entries.
 * @param {string|null|undefined} value
 * @returns {string[]}
 */
export const parseCoachingLocation = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return [];
    return raw
        .split(/\s*[·|/]\s*|\s*,\s*/)
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, MAX_COACH_CLUBS);
};

/**
 * Map stored names onto club records when possible.
 * @param {string[]} names
 * @param {{ id: string, name: string }[]} clubs
 */
export const resolveCoachClubs = (names, clubs) => {
    return names.map((name) => {
        const match = (clubs || []).find(
            (c) => String(c.name || '').toLowerCase() === name.toLowerCase(),
        );
        return match ? { id: match.id, name: match.name } : { id: `custom:${name}`, name };
    });
};

/**
 * Searchable multi-select for up to 3 coaching clubs.
 */
const CoachClubsPicker = ({
    selectedClubs = [],
    onChange,
    label = 'Clubs you coach at',
    className = '',
}) => {
    const { clubs, loadingClubs } = useClubs();
    const [clubQuery, setClubQuery] = useState('');
    const [clubOpen, setClubOpen] = useState(false);

    const selectedKeys = useMemo(
        () => new Set(selectedClubs.map((c) => String(c.name || '').toLowerCase())),
        [selectedClubs],
    );

    const filteredClubs = useMemo(() => {
        const q = clubQuery.trim().toLowerCase();
        return clubs.filter((c) => {
            if (selectedKeys.has(String(c.name || '').toLowerCase())) return false;
            if (!q) return true;
            return String(c.name || '').toLowerCase().includes(q);
        });
    }, [clubs, clubQuery, selectedKeys]);

    const addClub = (club) => {
        if (!club?.name) return;
        if (selectedClubs.length >= MAX_COACH_CLUBS) {
            toast.error(`You can select up to ${MAX_COACH_CLUBS} clubs.`);
            return;
        }
        if (selectedClubs.some((c) => c.id === club.id || c.name.toLowerCase() === club.name.toLowerCase())) {
            return;
        }
        onChange([...selectedClubs, { id: club.id, name: club.name }]);
        setClubQuery('');
        setClubOpen(false);
    };

    const removeClub = (name) => {
        const key = String(name || '').toLowerCase();
        onChange(selectedClubs.filter((c) => c.name.toLowerCase() !== key));
    };

    return (
        <div className={`relative ${className}`}>
            <div className="flex items-center justify-between mb-1.5 px-0.5">
                <label className="text-sm font-bold text-gray-400">{label}</label>
                <span className="text-[10px] font-bold text-gray-500">
                    {selectedClubs.length}/{MAX_COACH_CLUBS}
                </span>
            </div>

            {selectedClubs.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {selectedClubs.map((club) => (
                        <span
                            key={club.id || club.name}
                            className="inline-flex items-center gap-1.5 rounded-full border border-padel-green/40 bg-padel-green/10 text-padel-green px-2.5 py-1 text-xs font-semibold"
                        >
                            <MapPin size={11} className="shrink-0 opacity-80" />
                            {club.name}
                            <button
                                type="button"
                                onClick={() => removeClub(club.name)}
                                className="rounded-full p-0.5 hover:bg-white/10 text-padel-green/80 hover:text-white border-0 bg-transparent cursor-pointer"
                                aria-label={`Remove ${club.name}`}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <input
                value={clubQuery}
                onChange={(e) => {
                    setClubQuery(e.target.value);
                    setClubOpen(true);
                }}
                onFocus={() => setClubOpen(true)}
                onBlur={() => setTimeout(() => setClubOpen(false), 150)}
                placeholder={
                    selectedClubs.length >= MAX_COACH_CLUBS
                        ? 'Maximum of 3 clubs selected'
                        : loadingClubs
                            ? 'Loading clubs…'
                            : 'Search and select a club'
                }
                disabled={selectedClubs.length >= MAX_COACH_CLUBS || loadingClubs}
                autoComplete="off"
                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green disabled:opacity-50 transition-colors"
            />
            <p className="text-[11px] text-gray-500 mt-1.5 px-0.5">
                Select up to {MAX_COACH_CLUBS} clubs where you coach.
            </p>

            {clubOpen && selectedClubs.length < MAX_COACH_CLUBS && (filteredClubs.length > 0 || clubQuery.trim()) && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl max-h-52 overflow-y-auto shadow-xl">
                    {filteredClubs.slice(0, 40).map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => addClub(c)}
                            className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-padel-green hover:text-black transition-colors border-0 bg-transparent cursor-pointer"
                        >
                            {c.name}
                        </button>
                    ))}
                    {filteredClubs.length === 0 && (
                        <p className="px-4 py-3 text-xs text-gray-500">No matching clubs found.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default CoachClubsPicker;
