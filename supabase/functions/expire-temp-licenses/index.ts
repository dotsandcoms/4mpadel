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
        // Where event_date is BEFORE the current timestamp.
        const { data: expiredLicenses, error: fetchError } = await supabaseAdmin
            .from('temporary_licenses')
            .select('player_id')
            .lt('event_date', new Date().toISOString())

        if (fetchError) {
            throw new Error(`Failed to fetch expired licenses: ${fetchError.message}`)
        }

        if (!expiredLicenses || expiredLicenses.length === 0) {
            return new Response(
                JSON.stringify({ message: "No expired temporary licenses found.", count: 0 }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Get unique player IDs to avoid redundant updates
        const playerIds = [...new Set(expiredLicenses.map(l => l.player_id))]

        // 2. Mark those players as having 'none' license_type
        // We only update if their license_type is currently 'temporary'. 
        // If they upgraded to 'full' in the meantime, we don't accidentally downgrade them.
        const { data: updatedPlayers, error: updateError } = await supabaseAdmin
            .from('players')
            .update({ license_type: 'none', paid_registration: false })
            .in('id', playerIds)
            .eq('license_type', 'temporary')
            .select('id')

        if (updateError) {
            throw new Error(`Failed to update players: ${updateError.message}`)
        }

        // Optional: 3. Clean up the expired licenses from the tracking table?
        // Or keep them for historical records. We'll keep them, so we must add a 'status' column 
        // OR just delete them. Let's delete them to keep the table clean and avoid re-processing them every day.
        const { error: deleteError } = await supabaseAdmin
            .from('temporary_licenses')
            .delete()
            .in('player_id', playerIds)
            .lt('event_date', new Date().toISOString())

        if (deleteError) {
            throw new Error(`Failed to clean up expired licenses: ${deleteError.message}`)
        }

        // 4. RECONCILIATION PASS: Find any player marked as 'temporary' who has ZERO records in temporary_licenses
        // This catches orphaned statuses (like the 2 extra users reported).
        const { data: allActiveTempLicenses } = await supabaseAdmin
            .from('temporary_licenses')
            .select('player_id')
        
        const activePlayerIds = new Set((allActiveTempLicenses || []).map(l => l.player_id))

        const { data: allTempPlayers } = await supabaseAdmin
            .from('players')
            .select('id')
            .eq('license_type', 'temporary')

        const orphanedPlayerIds = (allTempPlayers || [])
            .filter(p => !activePlayerIds.has(p.id))
            .map(p => p.id)

        let reconciledCount = 0
        if (orphanedPlayerIds.length > 0) {
            const { data: reconciledPlayers, error: reconError } = await supabaseAdmin
                .from('players')
                .update({ license_type: 'none', paid_registration: false })
                .in('id', orphanedPlayerIds)
                .select('id')
            
            if (reconError) {
                console.error("Reconciliation update failed:", reconError.message)
            } else {
                reconciledCount = reconciledPlayers?.length || 0
            }
        }

        return new Response(
            JSON.stringify({
                message: "Successfully expired temporary licenses.",
                expiredCount: updatedPlayers?.length || 0,
                reconciledCount,
                orphanedHandled: orphanedPlayerIds
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
