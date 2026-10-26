import type { ComponentType } from 'react';
import type { PdfProps } from 'react-native-pdf';

export type NativePdfViewer = { state: 'ready'; component: ComponentType<PdfProps> } | { state: 'update-required' | 'unavailable' };
/** Keep missing native dependencies out of Expo Router's route-module evaluation. */
export function loadNativePdf(
  nativeModule: () => unknown,
  load: () => { default?: ComponentType<PdfProps> } | ComponentType<PdfProps>,
): NativePdfViewer {
  try {
    if (!nativeModule()) return { state: 'update-required' };
    const loaded = load();
    const component = typeof loaded === 'function' ? loaded : loaded.default;
    return component ? { state: 'ready', component } : { state: 'unavailable' };
  } catch { return { state: 'unavailable' }; }
}
