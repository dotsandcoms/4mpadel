import { brand } from '@/theme/tokens';

export type SapaTone = {
  fill: string;
  text: string;
  bg: string;
  border: string;
};

/**
 * SAPA tier colours, mirrored from the website Featured Tournaments map.
 * Keep this as the single native source — calendar, onboarding, and event
 * details should all call `sapaTone`, not invent a second palette.
 */
export function sapaTone(status?: string | null): SapaTone {
  const s = (status || '').toLowerCase();
  if (s.includes('broll')) return tone('#F40020');
  if (s.includes('major')) return tone('#DC2626');
  if (s.includes('super gold') || s === 's gold') return tone('#F59E0B');
  if (s.includes('gold')) return tone('#EAB308');
  if (s.includes('silver')) return tone('#9CA3AF');
  if (s.includes('bronze')) return tone('#C2410C');
  if (s.includes('fip')) return tone('#2563EB');
  return tone(brand.padel);
}

export function sapaLabel(status?: string | null) {
  const raw = status?.trim();
  if (!raw || raw.toLowerCase() === 'none') return null;
  return raw;
}

function tone(fill: string): SapaTone {
  return {
    fill,
    text: fill,
    bg: hexAlpha(fill, 0.18),
    border: hexAlpha(fill, 0.4),
  };
}

function hexAlpha(hex: string, alpha: number) {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
