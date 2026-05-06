import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPER_ADMINS = ['bradein@dotsandcoms.co.za', 'brad@dotsandcoms.co.za', 'admin@4mpadel.co.za'];

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('No authorization header')
        }

        // Initialize user-scoped client to verify the caller
        const supabaseUserClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()
        
        if (authError || !user) {
            throw new Error('Unauthorized')
        }

        // Initialize Admin Client
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Check Admin Permissions
        let isAuthorized = false;
        const userEmailLower = user.email?.toLowerCase();
        
        if (SUPER_ADMINS.some(email => email.toLowerCase() === userEmailLower)) {
            isAuthorized = true;
        } else {
            const { data: adminData } = await supabaseAdmin
                .from('admin_sidebar_permissions')
                .select('*')
                .ilike('email', user.email)
                .single();

            if (adminData) {
                if (adminData.role === 'super_admin') {
                    isAuthorized = true;
                } else if (adminData.allowed_tabs && adminData.allowed_tabs.includes('players')) {
                    isAuthorized = true;
                }
            }
        }

        if (!isAuthorized) {
            throw new Error('Forbidden: Insufficient privileges')
        }

        const { email, newPassword } = await req.json()

        if (!email || !newPassword) {
            throw new Error('email and newPassword are required')
        }

        // Fetch user by email since we need their Auth UUID, not their players table ID.
        let targetUserId = null;
        let page = 1;
        while(true) {
            const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
                page,
                perPage: 1000
            });
            
            if (usersError) throw new Error(`Error listing users: ${usersError.message}`);
            
            const users = usersData?.users || [];
            if (users.length === 0) break;

            const foundUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
            if (foundUser) {
                targetUserId = foundUser.id;
                break;
            }
            if (users.length < 1000) break;
            page++;
        }

        if (!targetUserId) {
            throw new Error(`User not found in the Auth system. The player "${email}" must log in or sign up at least once to create their account before you can reset their password.`);
        }

        // Update the user's password using the admin API
        const { data, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            targetUserId,
            { password: newPassword }
        )

        if (updateError) {
            throw new Error(`Failed to update password: ${updateError.message}`)
        }

        return new Response(
            JSON.stringify({
                message: "Password updated successfully."
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }
})
