export const divisionPalette = [
    '#7dd3fc', '#f9a8d4', '#c4b5fd', '#6ee7b7',
    '#fdba74', '#fde047', '#67e8f9', '#fca5a5',
];

export function divisionColorMap(divisions = []) {
    return new Map([...divisions]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((division, index) => [division.id, {
            ...division,
            color: /\b(men|mens|men's)\b/i.test(division.name)
                ? '#7dd3fc'
                : /\b(ladies|women|womens|women's)\b/i.test(division.name)
                    ? '#f9a8d4'
                    : /\bmixed\b/i.test(division.name)
                        ? '#c4b5fd'
                        : divisionPalette[index + 3] || `hsl(${Math.round(index * 137.508) % 360} 75% 75%)`,
        }]));
}
