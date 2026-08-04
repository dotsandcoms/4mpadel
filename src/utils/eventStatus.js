export const getEventStatusColors = (sapaStatus) => {
    if (sapaStatus === 'Major') return { border: 'border-red-500/40', text: 'text-red-500', fill: '#EF4444' };
    if (sapaStatus === 'Super Gold' || sapaStatus === 'S Gold') return { border: 'border-amber-500/40', text: 'text-amber-500', fill: '#F59E0B' };
    if (sapaStatus === 'Gold') return { border: 'border-yellow-400/40', text: 'text-yellow-400', fill: '#EAB308' };
    if (sapaStatus === 'Silver') return { border: 'border-gray-400/40', text: 'text-gray-400', fill: '#9CA3AF' };
    if (sapaStatus === 'Bronze') return { border: 'border-orange-700/40', text: 'text-orange-700', fill: '#C2410C' };
    return { border: 'border-padel-green/40', text: 'text-padel-green', fill: '#CCFF00' };
};

/** Legible label colour for a solid-fill button/badge in this accent. */
export const getContrastTextForAccent = (accent) => (
    (accent === '#CCFF00' || accent === '#EAB308' || accent === '#F59E0B') ? '#0a0a0a' : '#ffffff'
);
