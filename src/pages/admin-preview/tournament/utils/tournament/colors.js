// Each division has its own colour; ladies divisions use distinct pink shades.
// Every workspace passes the full event division list, so filtering and sorting
// the visible cards or matches cannot change their colours.
const palette = [
    '#64d7fb', '#b8e879', '#ffc44d', '#bda4f5',
    '#71dfbe', '#ff9c77', '#91abff', '#e5d69b', '#e59bfa',
    '#b5ced9', '#edb6a0',
];

const pinkPalette = ['#f6a1cf', '#f36bb2', '#ffc4de', '#e98cba', '#ff98b3'];

export function tournamentDivisionColors(divisions = [], overrides = {}) {
    let pinkIndex = 0;
    let otherIndex = 0;
    return new Map([...divisions]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map(division => {
            const ladies = /\b(ladies|women|womens|female)\b/i.test(division.name || '');
            const index = ladies ? pinkIndex++ : otherIndex++;
            const defaultColor = ladies
                ? pinkPalette[index] || `hsl(${325 + ((index * 2.7) % 25)} 78% ${66 + ((index * 3.1) % 20)}%)`
                : palette[index] || `hsl(${((index - palette.length) * 137.508 + 15) % 360} 72% 73%)`;
            const chosen = overrides?.[division.id];
            const color = /^#[0-9a-f]{6}$/i.test(chosen || '') ? chosen : defaultColor;
            return [division.id, { ...division, color }];
        }));
}

export function divisionTextColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) return '#071319';
    const channels = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255)
        .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.179 ? '#071319' : '#ffffff';
}
