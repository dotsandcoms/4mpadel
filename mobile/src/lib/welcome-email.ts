import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';

const keyFor = (id: string) => `4m:welcome-email:${id}`;
let sending = false;

/** Only profiles created by this app are enrolled; existing sign-ins are never bulk-emailed. */
export async function queueWelcomeEmail() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await AsyncStorage.setItem(keyFor(session.user.id), 'pending');
  void retryWelcomeEmail();
}

export async function retryWelcomeEmail() {
  if (sending) return;
  sending = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || await AsyncStorage.getItem(keyFor(session.user.id)) !== 'pending') return;
    const { data, error } = await supabase.functions.invoke('native-welcome-email', { body: {} });
    if (!error && (data?.success || data?.needsReview)) {
      await AsyncStorage.setItem(keyFor(session.user.id), data.needsReview ? 'needs_review' : 'sent');
    }
  } catch {
    // Keep the durable pending marker. Retry on foreground, sign-in, or the next minute.
  } finally {
    sending = false;
  }
}

export function watchWelcomeEmailRetries() {
  void retryWelcomeEmail();
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') void retryWelcomeEmail();
  });
  const timer = setInterval(() => {
    if (AppState.currentState === 'active') void retryWelcomeEmail();
  }, 60000);
  const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
    // Run outside the auth callback to avoid waiting on its internal lock.
    if (session) setTimeout(() => void retryWelcomeEmail(), 0);
  });
  return () => {
    subscription.remove();
    clearInterval(timer);
    auth.subscription.unsubscribe();
  };
}
