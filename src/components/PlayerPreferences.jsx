import React from 'react';
import { ArrowLeftRight, ChevronDown, Hand } from 'lucide-react';
import { COURT_SIDE_OPTIONS, PLAYING_HAND_OPTIONS, courtSideLabel, playingHandLabel } from '../utils/playerPreferences';

export function PlayerPreferenceFields({ value, onChange, compact = false, desktop = false }) {
  const labelClass = compact ? 'text-[8.5px] tracking-wider ml-1' : desktop ? 'text-[10px] tracking-[0.2em] ml-2' : 'text-[9px] md:text-[10px] tracking-[0.2em] ml-3 md:ml-4';
  const controlClass = compact ? 'rounded-xl pl-11 pr-10 py-2.5 text-xs' : desktop ? 'rounded-2xl pl-16 pr-12 py-5 text-base' : 'rounded-xl md:rounded-2xl pl-11 md:pl-12 pr-10 py-3 md:py-4 text-xs md:text-sm';
  const iconClass = compact ? 'left-4 w-3.5 h-3.5' : desktop ? 'left-6 w-5 h-5' : 'left-4 w-4 h-4 md:w-5 md:h-5';
  return <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <legend className="sr-only">Playing preferences (optional)</legend>
    {[
      ['playing_hand', 'Playing hand', PLAYING_HAND_OPTIONS, Hand],
      ['court_side', 'Court side', COURT_SIDE_OPTIONS, ArrowLeftRight],
    ].map(([field, label, options, Icon]) => <label key={field} className="block min-w-0 space-y-1.5">
      <span className={`block font-black uppercase text-padel-green ${labelClass}`}>{label}</span>
      <span className="relative block">
        {React.createElement(Icon, { 'aria-hidden': true, className: `pointer-events-none absolute top-1/2 -translate-y-1/2 text-padel-green/75 ${iconClass}` })}
        <select name={field} value={value[field] || ''} onChange={event => onChange({ ...value, [field]: event.target.value })} className={`block w-full appearance-none cursor-pointer border border-white/10 bg-white/[0.03] backdrop-blur-md font-bold text-white outline-none transition-all hover:border-white/20 focus:border-padel-green/50 focus:bg-white/[0.05] ${controlClass}`}>
          <option value="" className="bg-[#0a0a0a] text-white">Not set</option>
          {options.map(option => <option key={option.value} value={option.value} className="bg-[#0a0a0a] text-white">{option.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-padel-green/75 ${desktop ? 'right-6 w-5 h-5' : 'right-4 w-4 h-4 md:w-5 md:h-5'}`} />
      </span>
    </label>)}
  </fieldset>;
}

export function PlayerPreferenceDetails({ player, compact = false }) {
  return <>{[
    ['Playing hand', playingHandLabel(player.playing_hand)],
    ['Court side', courtSideLabel(player.court_side)],
  ].map(([label, value]) => <div key={label} className={compact ? 'rounded-2xl border border-white/10 bg-white/[0.03] p-3.5' : 'space-y-1'}>
    <p className="text-[10px] font-bold uppercase tracking-widest text-padel-green">{label}</p>
    <p className={compact ? 'mt-1 text-xs font-semibold text-white' : 'text-lg font-bold text-white'}>{value || 'Not set'}</p>
  </div>)}</>;
}
