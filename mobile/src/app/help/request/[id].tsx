import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
export default function HelpRequestRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/messages/help/${encodeURIComponent(id)}` as Href} />;
}
