import { Redirect, useLocalSearchParams } from 'expo-router';

/** Older widget timelines contain the website's /calendar/:id event URLs. */
export default function LegacyEventLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/events/[id]', params: { id } }} />;
}
