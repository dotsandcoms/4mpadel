import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  type PaystackFetchMode,
  resolvePaystackFetchSecrets,
} from './paystack.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchPaystackTransactions(
  secretKey: string,
  fromStr: string | null,
  toStr: string | null,
  isTest: boolean,
) {
  const fromDate = fromStr ? new Date(fromStr) : null;
  let allTransactions: any[] = [];
  let page = 1;
  let hasMore = true;
  let totalRevenue = 0;
  let successfulPayouts = 0;

  while (hasMore && page <= 5) {
    let paystackUrl = `https://api.paystack.co/transaction?perPage=100&page=${page}`;
    if (fromStr) paystackUrl += `&from=${encodeURIComponent(fromStr)}`;
    if (toStr) paystackUrl += `&to=${encodeURIComponent(toStr)}`;

    const response = await fetch(paystackUrl, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Paystack error (${isTest ? 'test' : 'live'}): ${errorData.message}`);
    }

    const data = await response.json();
    const trxs = data.data || [];

    if (trxs.length === 0) {
      hasMore = false;
      break;
    }

    const mapped = trxs.map((trx: any) => {
      if (trx.status === 'success') {
        totalRevenue += trx.amount;
        successfulPayouts += trx.amount;
      }

      return {
        id: trx.reference,
        user: trx.customer?.email || 'Unknown',
        amount: `R ${(trx.amount / 100).toFixed(2)}`,
        date: new Date(trx.created_at).toISOString().split('T')[0],
        status: trx.status === 'success' ? 'Success' : trx.status === 'failed' ? 'Failed' : 'Pending',
        type: 'Payment',
        rawDate: trx.created_at,
        metadata: trx.metadata,
        is_test: isTest || trx.domain === 'test',
      };
    });

    allTransactions = [...allTransactions, ...mapped];

    const lastTrxDate = new Date(trxs[trxs.length - 1].created_at);
    if (trxs.length < 100 || (fromDate && lastTrxDate < fromDate)) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return { transactions: allTransactions, totalRevenue, successfulPayouts };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const fromStr = url.searchParams.get('from');
    const toStr = url.searchParams.get('to');
    const modeParam = (url.searchParams.get('mode') || 'both').toLowerCase();
    const mode: PaystackFetchMode =
      modeParam === 'live' || modeParam === 'test' ? modeParam : 'both';

    const { secrets, configError } = resolvePaystackFetchSecrets(mode);
    if (secrets.length === 0) {
      throw new Error(configError || 'Paystack secret keys are not configured');
    }

    console.info(`Fetching Paystack transactions [mode=${mode}] for [${fromStr || 'ALL'} to ${toStr || 'NOW'}]`);

    let allTransactions: any[] = [];
    let totalRevenue = 0;
    let successfulPayouts = 0;

    for (const { key, mode: secretMode } of secrets) {
      const result = await fetchPaystackTransactions(key, fromStr, toStr, secretMode === 'test');
      allTransactions = [...allTransactions, ...result.transactions];
      totalRevenue += result.totalRevenue;
      successfulPayouts += result.successfulPayouts;
    }

    // Deduplicate by reference when fetching both test and live
    const seen = new Set<string>();
    allTransactions = allTransactions.filter((trx) => {
      if (seen.has(trx.id)) return false;
      seen.add(trx.id);
      return true;
    });

    allTransactions.sort(
      (a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime(),
    );

    console.info(`Fetch complete. Retrieved ${allTransactions.length} transactions (mode=${mode}).`);

    return new Response(
      JSON.stringify({
        transactions: allTransactions,
        stats: {
          totalRevenue: `R ${(totalRevenue / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          successfulPayouts: `R ${(successfulPayouts / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
        mode,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    );
  }
});
