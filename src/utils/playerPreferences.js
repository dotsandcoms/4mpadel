export const COURT_SIDE_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
  { label: 'Either', value: 'either' },
];
export const PLAYING_HAND_OPTIONS = [
  { label: 'Right-handed', value: 'right' },
  { label: 'Left-handed', value: 'left' },
];
export const courtSideLabel = value => COURT_SIDE_OPTIONS.find(option => option.value === value)?.label || null;
export const playingHandLabel = value => PLAYING_HAND_OPTIONS.find(option => option.value === value)?.label || null;
