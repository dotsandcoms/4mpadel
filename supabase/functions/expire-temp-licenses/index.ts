import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const today = new Date().toISOString().split('T')[0]

        // Players currently marked temporary who have at least one expired row.
        // We must NOT clear them if they still hold a valid (non-expired) temp license.
        const { data: expiredRows, error: fetchError } = await supabaseAdmin
            .from('temporary_licenses')
            .select('player_id, event_id, event_date, players!inner(license_type)')
            .lt('event_date', today)
            .eq('players.license_type', 'temporary')

        if (fetchError) {
            throw new Error(`Failed to fetch expired licenses: ${fetchError.message}`)
        }

        const candidateIds = [...new Set((expiredRows || []).map((l) => l.player_id).filter(Boolean))]
        let expiredCount = 0
        const clearedIds: number[] = []

        if (candidateIds.length > 0) {
            const { data: stillValid, error: validError } = await supabaseAdmin
                .from('temporary_licenses')
                .select('player_id')
                .in('player_id', candidateIds)
                .gte('event_date', today)

            if (validError) {
                throw new Error(`Failed to fetch valid licenses: ${validError.message}`)
            }

            const stillValidIds = new Set((stillValid || []).map((r) => r.player_id))
            const toClear = candidateIds.filter((id) => !stillValidIds.has(id))

            if (toClear.length > 0) {
                const { data: updatedPlayers, error: updateError } = await supabaseAdmin
                    .from('players')
                    .update({ license_type: 'none', paid_registration: false })
                    .in('id', toClear)
                    .eq('license_type', 'temporary')
                    .select('id')

                if (updateError) {
                    throw new Error(`Failed to update players: ${updateError.message}`)
                }

                expiredCount = updatedPlayers?.length || 0
                clearedIds.push(...(updatedPlayers || []).map((p) => p.id))
            }
        }

        // Heal: active temp license rows exist but profile still says none/unpaid
        // (e.g. wiped earlier by the old expire job).
        const { data: activeTemps, error: activeErr } = await supabaseAdmin
            .from('temporary_licenses')
            .select('player_id, players!inner(id, license_type, paid_registration)')
            .gte('event_date', today)

        if (activeErr) {
            throw new Error(`Failed to fetch active licenses: ${activeErr.message}`)
        }

        const healIds = [...new Set(
            (activeTemps || [])
                .filter((row) => {
                    const p = row.players as { license_type?: string; paid_registration?: boolean } | null
                    if (!p || !row.player_id) return false
                    const lt = String(p.license_type || '').toLowerCase()
                    return lt === 'none' || lt === '' || p.paid_registration === false
                })
                .map((row) => row.player_id),
        )]

        let healedCount = 0
        if (healIds.length > 0) {
            const { data: healed, error: healError } = await supabaseAdmin
                .from('players')
                .update({ license_type: 'temporary', paid_registration: true })
                .in('id', healIds)
                .select('id')

            if (healError) {
                throw new Error(`Failed to heal active temp licenses: ${healError.message}`)
            }
            healedCount = healed?.length || 0
        }

        return new Response(
            JSON.stringify({
                message: 'Successfully processed temporary licenses.',
                expiredCount,
                clearedIds,
                healedCount,
                healedIds: healIds,
                reconciledCount: 0,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        )
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
        )
    }
})
