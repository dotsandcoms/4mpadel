import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as firebase from './firebase-analytics';
import { analyticsScreen, EVENT_FIELDS, PURCHASE_KINDS, safeAnalyticsParams, type AnalyticsEvent, type PurchaseKind } from './analytics-events';

let initialization: Promise<void> | undefined;
let queue: Promise<void> = Promise.resolve();

export function initializeAnalytics() {
  initialization ??= firebase.configureAnalytics().catch(error => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

/** SDK/network failures never reject a user action, payment, navigation or sign-in. */
function enqueue(action: () => Promise<void>): Promise<void> {
  queue = queue.then(async () => {
    try { await initializeAnalytics(); await action(); }
    catch { if (__DEV__) console.warn('[analytics] Could not record analytics.'); }
  });
  return queue;
}

export function trackEvent(name: AnalyticsEvent, params: Record<string, unknown> = {}) {
  if (!Object.hasOwn(EVENT_FIELDS, name)) return Promise.resolve();
  return enqueue(() => firebase.sendAnalyticsEvent(name, safeAnalyticsParams(name, params)));
}
export function trackScreen(segments: string) {
  return enqueue(() => firebase.sendAnalyticsScreen(analyticsScreen(segments)));
}
export function setAnalyticsUser(authId: string | null) {
  return enqueue(async () => {
    const id = authId && /^[a-f0-9-]{36}$/i.test(authId)
      ? await digest(`user:${authId}`) : null;
    await firebase.identifyAnalyticsUser(id);
  });
}

function digest(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `4m:analytics:v1:${value}`);
}

const LEDGER_KEY = '4m:analytics:transactions:v1';
type Checkout = { kind: PurchaseKind; value: number };
type Ledger = { pending: Record<string, Checkout>; sent: string[] };

async function readLedger(): Promise<Ledger> {
  try {
    const data = JSON.parse(await AsyncStorage.getItem(LEDGER_KEY) ?? '{}');
    const sent = Array.isArray(data.sent) ? data.sent.filter((id: unknown) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)).slice(-300) : [];
    const pending: Record<string, Checkout> = {};
    for (const [id, value] of Object.entries(data.pending ?? {}).slice(-100)) {
      const row = value as Checkout;
      if (/^[a-f0-9]{64}$/.test(id) && row && PURCHASE_KINDS.includes(row.kind) && Number.isFinite(row.value) && row.value > 0) pending[id] = row;
    }
    return { pending, sent };
  } catch { return { pending: {}, sent: [] }; }
}
async function saveLedger(ledger: Ledger) {
  await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify({
    pending: Object.fromEntries(Object.entries(ledger.pending).slice(-100)), sent: ledger.sent.slice(-300),
  }));
}

/** Save only the amount returned by the checkout service, with a hashed reference. */
export function recordAnalyticsCheckout(reference: string, kind: PurchaseKind, value: number) {
  return enqueue(async () => {
    if (!/^[a-z0-9_-]{8,180}$/i.test(reference) || !PURCHASE_KINDS.includes(kind) || !Number.isFinite(value) || value <= 0) return;
    const id = await digest(`payment:${reference}`), ledger = await readLedger();
    if (ledger.sent.includes(id)) return;
    const first = !ledger.pending[id];
    ledger.pending[id] = { kind, value };
    await saveLedger(ledger);
    if (first) await firebase.sendAnalyticsEvent('begin_checkout', { item_category: kind, currency: 'ZAR', value });
  });
}

/** Call only after the backend confirms payment; browser returns are never confirmation. */
export function trackConfirmedPurchase(reference: string, kind: PurchaseKind) {
  return enqueue(async () => {
    if (!/^[a-z0-9_-]{8,180}$/i.test(reference) || !PURCHASE_KINDS.includes(kind)) return;
    const id = await digest(`payment:${reference}`), ledger = await readLedger();
    if (ledger.sent.includes(id)) return;
    const checkout = ledger.pending[id];
    if (checkout && checkout.kind === kind) {
      await firebase.sendAnalyticsEvent('purchase', {
        transaction_id: id, currency: 'ZAR', value: checkout.value,
        items: [{ item_id: kind, item_name: kind, item_category: kind, price: checkout.value, quantity: 1 }],
      });
    }
    // Older app versions may have created the checkout without a recorded amount.
    // Count the confirmation without inventing revenue or backfilling old payments.
    await firebase.sendAnalyticsEvent('payment_confirmed', { item_category: kind });
    ledger.sent.push(id); delete ledger.pending[id];
    await saveLedger(ledger);
  });
}

export function clearAccountAnalytics() {
  return enqueue(async () => {
    await firebase.resetAnalytics();
    await AsyncStorage.removeItem(LEDGER_KEY);
    initialization = undefined;
  });
}
