export const COURT_SIDE_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
  { label: 'Either', value: 'either' },
];

export const PLAYING_HAND_OPTIONS = [
  { label: 'Right-handed', value: 'right' },
  { label: 'Left-handed', value: 'left' },
];

export function courtSideLabel(value?: string | null) {
  return COURT_SIDE_OPTIONS.find(option => option.value === value)?.label ?? null;
}

export function playingHandLabel(value?: string | null) {
  return PLAYING_HAND_OPTIONS.find(option => option.value === value)?.label ?? null;
}
