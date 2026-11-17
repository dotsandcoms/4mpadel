import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseTourProgress, type TourProgress } from './guided-tour';

const key = (owner: string) => `fourm-guided-tour-v1:${owner}`;
export const readTourProgress = async (owner: string) => parseTourProgress(await AsyncStorage.getItem(key(owner)));
let writes = Promise.resolve();
export function saveTourProgress(owner: string, progress: TourProgress) {
  const snapshot = JSON.stringify(progress);
  writes = writes.catch(() => {}).then(() => AsyncStorage.setItem(key(owner), snapshot));
  return writes;
}
