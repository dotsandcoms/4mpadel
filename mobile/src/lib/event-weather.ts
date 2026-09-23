import type { EventDetail } from './events';
export type EventWeather = { temp: number; condition: string; date: string };
/** Same city lookup, daily forecast and WMO labels as EventDetails.jsx. */
export async function fetchEventWeather(event: EventDetail, signal?: AbortSignal): Promise<EventWeather | null> {
  const location = event.city || event.venue;
  if (!location) return null;
  const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`, { signal });
  if (!geoResponse.ok) throw new Error('Weather location could not load.');
  const geo = (await geoResponse.json()).results?.[0];
  if (!geo) return null;
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=auto`, { signal });
  if (!response.ok) throw new Error('Weather forecast could not load.');
  const daily = (await response.json()).daily;
  if (!daily?.time?.length) return null;
  const index = Math.max(0, daily.time.indexOf(event.start_date?.slice(0, 10)));
  const code = daily.weather_code[index];
  const condition = code <= 1 ? 'Clear' : code === 2 ? 'Partly Cloudy' : code === 3 ? 'Overcast' : code >= 45 && code <= 48 ? 'Fog' : (code >= 51 && code <= 67) || (code >= 80 && code <= 82) ? 'Rain' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'Snow' : code >= 95 ? 'Thunderstorm' : 'Sunny';
  return { temp: daily.temperature_2m_max[index], condition, date: daily.time[index] };
}
