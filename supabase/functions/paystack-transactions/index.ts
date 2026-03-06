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

    // Fetch recent transactions from Paystack
    const response = await fetch('https://api.paystack.co/transaction?perPage=50', {
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

    // Calculate some basic stats
    let totalRevenue = 0;
    let successfulPayouts = 0; // Simplified proxy: sum of all successful transactions

    const mappedTransactions = data.data.map((trx: any) => {
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
        type: 'Payment', // Paystack doesn't natively know if it's booking/membership without metadata
        rawDate: trx.created_at
      };
    });

    return new Response(
      JSON.stringify({
        transactions: mappedTransactions,
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
