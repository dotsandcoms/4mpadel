const axios = require('axios');
require('dotenv').config();

const API_BASE = 'https://api.rankedin.com/v1';

async function fetchRealMatches() {
    const email = process.env.RANKEDIN_EMAIL;
    const password = process.env.RANKEDIN_PASSWORD;

    if (!email || !password) {
        console.error("Credentials missing in .env");
        return;
    }

    try {
        console.log(`Logging in as ${email}...`);
        const loginRes = await axios.post(`${API_BASE}/account/login`, {
            email,
            password,
            rememberMe: true,
            language: 'en'
        });

        // The token is usually in the headers or response body
        // Rankedin often uses a cookie named 'rin-auth' or a header 'rin-auth'
        const rinAuth = loginRes.data.Token || loginRes.headers['rin-auth'];
        console.log("Login successful. Token:", rinAuth ? "Found" : "Not Found");
        
        const setCookie = loginRes.headers['set-cookie'];
        console.log("Cookies:", setCookie ? "Found" : "None");

        const playerId = '2750433'; // Mark Stillerman
        const matchesRes = await axios.get(`${API_BASE}/player/GetPlayerMatchesAsync?playerid=${playerId}&takehistory=true&skip=0&take=20&language=en`, {
            headers: {
                'rin-auth': rinAuth || '',
                'Cookie': setCookie ? setCookie.join('; ') : '',
                'Referer': 'https://www.rankedin.com/',
                'Origin': 'https://www.rankedin.com'
            }
        });

        console.log("Matches retrieved:", matchesRes.data.Payload?.length || 0);
        if (matchesRes.data.Payload && matchesRes.data.Payload.length > 0) {
            console.log("First Match:", JSON.stringify(matchesRes.data.Payload[0], null, 2));
        } else {
            console.log("Full Response:", JSON.stringify(matchesRes.data, null, 2));
        }

    } catch (err) {
        console.error("Login/Fetch error:", err.message);
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", JSON.stringify(err.response.data, null, 2));
        }
    }
}

fetchRealMatches();
