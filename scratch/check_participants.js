
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://uzglrpbixubfijvjbtgz.supabase.co'
const supabaseKey = 'sb_publishable_8_etWw92DicNXSmAQtN1eQ_xxhAW2UU'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkParticipants() {
    const { data, error } = await supabase
        .from('tournament_participants')
        .select('*')
        .eq('event_id', 299)
        .ilike('full_name', '%Daniel Fleiser%')

    if (error) {
        console.error(error)
        return
    }

    console.log('Participants for Daniel Fleiser in event 299:')
    console.log(JSON.stringify(data, null, 2))
}

checkParticipants()
