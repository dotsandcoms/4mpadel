import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');

    if (!paystackSecretKey) {
      throw new Error('PAYSTACK_SECRET_KEY is not configured');
    }

    // Parse query parameters
    const url = new URL(req.url);
    const fromStr = url.searchParams.get('from');
    const toStr = url.searchParams.get('to');
    const fromDate = fromStr ? new Date(fromStr) : null;

    let allTransactions: any[] = [];
    let page = 1;
    let hasMore = true;
    let totalRevenue = 0;
    let successfulPayouts = 0;

    console.info(`Starting recursive fetch for Sync Period [${fromStr || 'ALL'} to ${toStr || 'NOW'}]`);

    while (hasMore && page <= 5) { // Safety limit: 5 pages (500 records)
      let paystackUrl = `https://api.paystack.co/transaction?perPage=100&page=${page}`;
      if (fromStr) paystackUrl += `&from=${encodeURIComponent(fromStr)}`;
      if (toStr) paystackUrl += `&to=${encodeURIComponent(toStr)}`;

      const response = await fetch(paystackUrl, {
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Paystack error: ${errorData.message}`);
      }

      const data = await response.json();
      const trxs = data.data || [];

      if (trxs.length === 0) {
        hasMore = false;
        break;
      }

      // Process and map this page
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
          metadata: trx.metadata
        };
      });

      allTransactions = [...allTransactions, ...mapped];

      // If we got exactly 100, there might be more. 
      // Also check if the last transaction on this page is already older than our 'from' date
      const lastTrxDate = new Date(trxs[trxs.length - 1].created_at);
      if (trxs.length < 100 || (fromDate && lastTrxDate < fromDate)) {
        hasMore = false;
      } else {
        page++;
      }
    }

    console.info(`Fetch complete. Retrieved ${allTransactions.length} total transactions across ${page} pages.`);

    return new Response(
      JSON.stringify({
        transactions: allTransactions,
        stats: {
          totalRevenue: `R ${(totalRevenue / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          successfulPayouts: `R ${(successfulPayouts / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
