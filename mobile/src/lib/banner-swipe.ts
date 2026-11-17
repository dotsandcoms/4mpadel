export type BannerSwipeDirection = 'up' | 'horizontal';

export function bannerSwipeCompletes(direction: BannerSwipeDirection, translation: number, velocity: number) {
  'worklet';
  if (direction === 'up') return translation <= -36 || (translation <= -12 && velocity <= -600);
  return Math.abs(translation) >= 64 || (Math.abs(translation) >= 20 && Math.abs(velocity) >= 700 && translation * velocity > 0);
}
