import { Redirect } from 'expo-router';
export default function HelpRequestsRedirect() {
  return <Redirect href={{ pathname: '/(tabs)/messages', params: { filter: 'Help' } }} />;
}
