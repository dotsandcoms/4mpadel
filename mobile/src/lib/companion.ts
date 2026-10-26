import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { CompanionSchedule } from './companion-schedule';

// Android remains native and does not load any Apple-only dependency.
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<{
  setAccount(id: string | null): Promise<void>;
  publish(id: string, json: string): Promise<void>;
}>('FourMCompanion') : null;
let queue: Promise<void> = Promise.resolve();
function enqueue(action: () => Promise<void> | undefined) {
  queue = queue.then(action).catch(error => { console.warn('[companion]', error instanceof Error ? error.message : 'Could not sync schedule'); });
  return queue;
}
export const setCompanionAccount = (id: string | null) => enqueue(() => native?.setAccount(id));
export const publishCompanionSchedule = (id: string, snapshot: CompanionSchedule) => enqueue(() => native?.publish(id, JSON.stringify(snapshot)));
