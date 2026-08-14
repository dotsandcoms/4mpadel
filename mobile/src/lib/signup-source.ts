import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export type SignupSource = 'web' | 'ios' | 'android';

export type SignupDevice = {
  source: SignupSource;
  brand: string | null;
  manufacturer: string | null;
  model: string | null;
  modelId: string | null;
  osName: string | null;
  osVersion: string | null;
  deviceType: string;
  isDevice: boolean;
  appVersion: string | null;
  build: string | null;
  recordedAt: string;
};

/** Native store this install came from. */
export function deviceSignupSource(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

export function resolveSignupSource(meta: unknown): SignupSource {
  if (meta === 'ios' || meta === 'android' || meta === 'web') return meta;
  if (meta === 'app' || meta === 'apple') return deviceSignupSource();
  return 'web';
}

const DEVICE_TYPE: Record<number, string> = {
  0: 'unknown',
  1: 'phone',
  2: 'tablet',
  3: 'desktop',
  4: 'tv',
};

/** Snapshot at signup — model and OS only, no device name or advertising IDs. */
export function collectSignupDevice(): SignupDevice {
  return {
    source: deviceSignupSource(),
    brand: Device.brand,
    manufacturer: Device.manufacturer,
    model: Device.modelName,
    modelId: Device.modelId ? String(Device.modelId) : null,
    osName: Device.osName,
    osVersion: Device.osVersion,
    deviceType: DEVICE_TYPE[Device.deviceType ?? 0] ?? 'unknown',
    isDevice: Device.isDevice,
    appVersion: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? null,
    build: Constants.nativeBuildVersion ?? null,
    recordedAt: new Date().toISOString(),
  };
}

/**
 * Persist this install for the signed-in account. Web-origin players keep
 * signup_source=web; this only records that they opened the native app.
 */
export async function recordAppDevice() {
  const { error } = await supabase.rpc('record_player_device', {
    p_device: collectSignupDevice(),
  });
  if (error) {
    console.warn('[device] not saved:', error.message);
  }
}
