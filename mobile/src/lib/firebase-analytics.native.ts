import {
  getAnalytics, logEvent, logScreenView, resetAnalyticsData, setConsent,
  setDefaultEventParameters, setUserId, setUserProperties,
} from '@react-native-firebase/analytics';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export async function configureAnalytics() {
  const analytics = getAnalytics();
  await setConsent(analytics, {
    analytics_storage: true, ad_storage: false, ad_user_data: false, ad_personalization: false,
  });
  await setDefaultEventParameters(analytics, { app_platform: Platform.OS });
  await setUserProperties(analytics, {
    build_number: Application.nativeBuildVersion ?? 'unknown',
    app_environment: !Device.isDevice ? 'simulator' : __DEV__ ? 'development' : 'production',
  });
}

export async function sendAnalyticsEvent(name: string, params: Record<string, unknown>) {
  await logEvent(getAnalytics(), name, params);
}
export async function sendAnalyticsScreen(name: string) {
  await logScreenView(getAnalytics(), { screen_name: name, screen_class: name });
}
export async function identifyAnalyticsUser(id: string | null) {
  await setUserId(getAnalytics(), id);
  await setUserProperties(getAnalytics(), { signed_in: id ? 'yes' : 'no' });
}
export async function resetAnalytics() {
  await setUserId(getAnalytics(), null);
  await resetAnalyticsData(getAnalytics());
}
