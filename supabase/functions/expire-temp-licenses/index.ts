import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Initialize Supabase Admin Client to bypass RLS and edit players table
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Find all expired temporary licenses
        // We use the date string to expire ONLY when the current date is AFTER the event date.
        const today = new Date().toISOString().split('T')[0];

        const { data: expiredLicenses, error: fetchError } = await supabaseAdmin
            .from('temporary_licenses')
            .select('player_id')
            .lt('event_date', today);

        if (fetchError) {
            throw new Error(`Failed to fetch expired licenses: ${fetchError.message}`)
        }

        let expiredCount = 0;

        // 1. Pass 1: Handle date-expired licenses
        if (expiredLicenses && expiredLicenses.length > 0) {
            const playerIds = [...new Set(expiredLicenses.map(l => l.player_id))];
            
            // 2. Mark those players as having 'none' license_type
            const { data: updatedPlayers, error: updateError } = await supabaseAdmin
                .from('players')
                .update({ license_type: 'none', paid_registration: false })
                .in('id', playerIds)
                .eq('license_type', 'temporary')
                .select('id');

            if (updateError) {
                throw new Error(`Failed to update players: ${updateError.message}`);
            }

            expiredCount = updatedPlayers?.length || 0;

            // 3. Clean up the expired licenses from the tracking table
            const { error: deleteError } = await supabaseAdmin
                .from('temporary_licenses')
                .delete()
                .in('player_id', playerIds)
                .lt('event_date', today);

            if (deleteError) {
                throw new Error(`Failed to clean up expired licenses: ${deleteError.message}`);
            }
        }

        // Pass 2: The aggressive reconciliation pass was removed to prevent manual syncs 
        // without event IDs from being cleared. Temporary licenses now only expire 
        // if they have an EXPLICIT record in the temporary_licenses table that has expired.
        let reconciledCount = 0;


        return new Response(
            JSON.stringify({
                message: "Successfully processed temporary licenses.",
                expiredCount,
                reconciledCount
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
