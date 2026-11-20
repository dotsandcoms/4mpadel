import { weatherCondition } from './event-weather';
import { SA_REGIONS } from './registration';

export type HomeWeather = { temp: number; condition: ReturnType<typeof weatherCondition>; daylight: boolean };

export function areaLabel(city: string | null | undefined, country: string | null | undefined) {
  return [...new Set([city?.trim(), country?.trim()].filter(Boolean))].join(', ');
}

export function profileRegionLabel(region: string | null | undefined) {
  const value = region?.trim();
  return areaLabel(value, SA_REGIONS.some(option => option === value) ? 'South Africa' : null);
}

/** Send only the approved approximate area to Open-Meteo. */
export async function fetchHomeWeather(latitude: number, longitude: number, signal: AbortSignal): Promise<HomeWeather | null> {
  const query = new URLSearchParams({ latitude: latitude.toFixed(1), longitude: longitude.toFixed(1), current: 'temperature_2m,weather_code,is_day' });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal });
  if (!response.ok) throw new Error('Current weather could not load.');
  const current = (await response.json()).current;
  if (!Number.isFinite(current?.temperature_2m) || !Number.isInteger(current?.weather_code)) return null;
  return { temp: Math.round(current.temperature_2m), condition: weatherCondition(current.weather_code), daylight: current.is_day !== 0 };
}
