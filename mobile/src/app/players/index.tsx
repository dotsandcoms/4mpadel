import { Redirect, useLocalSearchParams } from 'expo-router';
export default function PlayersRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return id && /^\d+$/.test(id) ? <Redirect href={{ pathname: '/players/[id]', params: { id } }} /> : <Redirect href="/rankings?view=Discover" />;
}
