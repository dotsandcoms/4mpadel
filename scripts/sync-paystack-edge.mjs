/**
 * Supabase bundles each edge function in isolation — shared imports must live
 * inside the function folder. Edit _shared/paystack.ts, then run:
 *   node scripts/sync-paystack-edge.mjs
 */
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'supabase/functions/_shared/paystack.ts');
const targets = [
    'supabase/functions/confirm-manual-payment/paystack.ts',
    'supabase/functions/paystack-webhook/paystack.ts',
    'supabase/functions/paystack-transactions/paystack.ts',
    'supabase/functions/reconcile-payments/paystack.ts',
];

for (const rel of targets) {
    const dest = join(root, rel);
    copyFileSync(source, dest);
    console.log(`Synced → ${rel}`);
}
