/**
 * Brand tokens, mirrored from the web app's `src/index.css` @theme block.
 * Tailwind classes come from tailwind.config.js; this file is for the places
 * that need raw values — native tab bars, status bar, splash, Reanimated.
 */

/** App loading/refresh feedback uses blue independently of event tier colours. */
export const loadingBlue = '#27517B';

export const brand = {
  /** Blue brand accent for dark surfaces and light-filled controls. */
  padel: '#8DB9E0',
  /** Blue at 60%. For large areas — borders, fills — where full strength
   *  shouts over everything else on the screen. */
  padelSoft: 'rgba(141,185,224,0.6)',

  /** Surface ramp, darkest to lightest. */
  page: '#0a0a0a',
  elevated: '#141414',
  surface: '#181818',
  panel: '#1a1a1a',

  /** Text ramp. */
  premium: '#F8FAFC',
  muted: '#B4C2D4',
  /** Dimmer than muted, still ≥4.5:1 on page and elevated. */
  faint: '#7A8BA3',
  /** Field labels — neutral grey, not the blue-grey muted ramp. */
  label: '#D0D0D0',
  /** Empty-field hint. Neutral, ≥4.5:1 on elevated. */
  placeholder: '#A3A3A3',
  /** Errors and destructive copy. Not SA-flag red — that's national context only. */
  danger: '#E68577',

  /** Hairlines and glass edges — matches the web `.glass-panel` treatment. */
  edge: 'rgba(255,255,255,0.10)',
  glass: 'rgba(255,255,255,0.05)',

  /** National context only (federations, SA rankings). Never decorative. */
  sa: {
    green: '#007749',
    yellow: '#FFB81C',
    blue: '#002395',
    red: '#DE3831',
  },
} as const;

/**
 * Motion tokens. Durations and easings are lifted from the transitions.dev
 * catalogue so web and app feel like the same product — but they're consumed
 * by Reanimated worklets here, not CSS.
 */
export const motion = {
  duration: {
    instant: 120,
    fast: 200,
    base: 280,
    /** Staged reveals — onboarding cards, copy. 250–350ms, no bounce. */
    enter: 320,
    slow: 420,
  },
  /** Cubic-bezier control points, for Easing.bezier(...). */
  easing: {
    standard: [0.2, 0, 0, 1],
    decelerate: [0, 0, 0, 1],
    accelerate: [0.3, 0, 1, 1],
    spring: [0.34, 1.56, 0.64, 1],
  },
  /** Stagger interval for list and card entrances. */
  stagger: 45,
} as const;

/**
 * Blue `boxShadow` for Reanimated worklets. Alpha is quantized so JS never
 * interpolates `rgba(..., 7e-7)` — Reanimated's color parser rejects that.
 */
export function padelGlow(offsetY: number, blur: number, alpha: number): string {
  'worklet';
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000;
  if (a <= 0) return 'none';
  return `0px ${offsetY}px ${blur}px rgba(141, 185, 224, ${a})`;
}

/** V2 application surfaces. V1 tokens above remain dedicated to onboarding/auth. */
export const lightBrand = {
  ...brand,
  page: '#F5F6F3',
  elevated: '#FFFFFF',
  surface: '#EDF0EB',
  warning: '#8A5300',
  warningSurface: '#FFF0CC',
  panel: '#E5EAE2',
  premium: '#16251F',
  muted: '#52625A',
  faint: '#65726B',
  label: '#34473D',
  placeholder: '#65726B',
  danger: '#B7352D',
  edge: '#DCE2DA',
  glass: '#EAF0E5',
  accent: '#386018',
  messagingAction: '#27517B',
  supportInk: '#72508E',
  supportTint: '#F1EBF6',
} as const;

/** Legible text/icons on both blue defaults and the preserved SAPA tier fills. */
export function onAccent(fill: string) {
  const hex = fill.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#FFFFFF';
  const channels = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.0667 ? '#FFFFFF' : '#16251F';
}
