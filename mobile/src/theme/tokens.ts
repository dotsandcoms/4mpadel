/**
 * Brand tokens, mirrored from the web app's `src/index.css` @theme block.
 * Tailwind classes come from tailwind.config.js; this file is for the places
 * that need raw values — native tab bars, status bar, splash, Reanimated.
 */

export const brand = {
  /** Electric lime. The only accent. One per screen, ideally. */
  padel: '#CCFF00',
  /** Lime at 60%. For large areas — borders, fills — where full strength
   *  shouts over everything else on the screen. */
  padelSoft: 'rgba(204,255,0,0.6)',

  /** Surface ramp, darkest to lightest. */
  page: '#0a0a0a',
  elevated: '#141414',
  surface: '#181818',
  panel: '#1a1a1a',

  /** Text ramp. */
  premium: '#F8FAFC',
  muted: '#94A3B8',
  faint: '#64748B',

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
