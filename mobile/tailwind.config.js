/** @type {import('tailwindcss').Config} */
// Brand tokens mirror src/index.css on the web app. Keep the two in sync —
// the web is on Tailwind v4 (@theme block), mobile is on v3 (NativeWind 4
// requirement), so the values transfer but the config format does not.
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Electric lime — the single brand accent. Use sparingly.
        padel: '#CCFF00',
        // Near-black surface ramp, darkest to lightest.
        page: '#0a0a0a',
        elevated: '#141414',
        surface: '#181818',
        panel: '#1a1a1a',
        // Text
        premium: '#F8FAFC',
        muted: '#B4C2D4',
        faint: '#7A8BA3',
        danger: '#E68577',
        // Hairlines and glass edges
        edge: 'rgba(255,255,255,0.10)',
        glass: 'rgba(255,255,255,0.05)',
        // South African flag — used for federation and national context only.
        sa: {
          green: '#007749',
          yellow: '#FFB81C',
          blue: '#002395',
          red: '#DE3831',
        },
      },
      fontFamily: {
        // SF Pro Rounded is a system face on iOS; Nunito is bundled for Android.
        sans: ['Nunito', 'ui-rounded', 'system-ui'],
        rounded: ['ui-rounded', 'Nunito', 'system-ui'],
      },
    },
  },
  plugins: [],
};
