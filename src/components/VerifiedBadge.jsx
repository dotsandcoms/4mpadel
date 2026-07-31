import React from 'react';

const TONES = {
    blue: '#1D9BF0',
    yellow: '#EAB308',
    gold: '#F59E0B',
    green: '#CCFF00',
};

/**
 * Scalloped verified badge (lucide BadgeCheck shape — fully inside the viewBox so it never clips).
 * @param {{ tone?: 'blue'|'yellow'|'gold'|'green', size?: number, className?: string, title?: string }} props
 */
const VerifiedBadge = ({
    tone = 'green',
    size = 18,
    className = '',
    title = '4M approved',
}) => {
    const fill = TONES[tone] || TONES.green;
    const check = tone === 'green' ? '#0a0a0a' : '#ffffff';
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`inline-block shrink-0 overflow-visible ${className}`}
            style={{ overflow: 'visible' }}
            role="img"
            aria-label={title}
        >
            <title>{title}</title>
            <path
                fill={fill}
                d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
            />
            <path
                d="m9 12 2 2 4-4"
                stroke={check}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

export default VerifiedBadge;
