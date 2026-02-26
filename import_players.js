import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import Papa from 'papaparse';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function importPlayers() {
    console.log('Reading full_players_data.csv...');
    let csvData = fs.readFileSync('full_players_data.csv', 'utf-8');
    // Remove BOM character if present
    csvData = csvData.replace(/^\uFEFF/, '');

    Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
            const rows = results.data;
            console.log(`Parsed ${rows.length} players. Clearing existing players in Supabase...`);

            // Delete all existing players
            const { error: deleteError } = await supabase
                .from('players')
                .delete()
                .neq('id', -1);

            if (deleteError) {
                console.error('Error clearing table:', deleteError.message);
                return;
            }

            console.log('Table cleared. Inserting new records...');

            const formattedPlayers = rows.map(row => {
                let sponsors = [];
                if (row.sponsors && row.sponsors !== 'None') {
                    sponsors = row.sponsors.split(/[,;\n]/).map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'none');
                }

                return {
                    name: (row.first_name && row.last_name) ? `${row.first_name} ${row.last_name}`.trim() : row.post_title,
                    category: row.player_category || 'N/A',
                    level: row.playtomic_level || 'N/A',
                    home_club: row.home_club?.trim() !== 'None' ? row.home_club : 'No Home Club',
                    nationality: row.nationality || 'South African',
                    bio: row.short_bio || '',
                    sponsors: sponsors,
                    contact_number: row.contact_number || '',
                    email: row.email || '',
                    gender: row.gender || '',
                    image_url: row.profile_pic_url || '',
                    points: parseInt(row.tour_points) || 0,
                    approved: row.approved?.toLowerCase() === 'yes',
                    rank_label: 'Unranked', // placeholder 
                };
            });

            // Split into chunks to avoid too large payload
            const chunkSize = 50;
            for (let i = 0; i < formattedPlayers.length; i += chunkSize) {
                const chunk = formattedPlayers.slice(i, i + chunkSize);
                const { error } = await supabase
                    .from('players')
                    .insert(chunk);

                if (error) {
                    console.error(`Error inserting chunk ${i / chunkSize + 1}:`, error.message);
                } else {
                    console.log(`Successfully inserted chunk ${i / chunkSize + 1} (${chunk.length} players)`);
                }
            }

            console.log('Import complete!');
        },
        error: (error) => {
            console.error('Error parsing CSV:', error.message);
        }
    });
}

importPlayers();
