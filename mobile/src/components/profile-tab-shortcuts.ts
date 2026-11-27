import { useRouter } from 'expo-router';

export const profileShortcuts = [
  { id: 'profile', label: 'My Profile', icon: 'person-outline', symbol: 'person.fill' },
  { id: 'coaches', label: 'Coaches', icon: 'school-outline', symbol: 'graduationcap.fill' },
  { id: 'clubs', label: 'Clubs', icon: 'location-outline', symbol: 'mappin.and.ellipse' },
] as const;

export type ProfileShortcut = typeof profileShortcuts[number]['id'];

export function useOpenProfileShortcut() {
  const router = useRouter();
  return (id: ProfileShortcut) => {
    if (id === 'profile') router.navigate('/profile');
    else if (id === 'clubs') router.push('/clubs');
    else router.push('/coaches');
  };
}
