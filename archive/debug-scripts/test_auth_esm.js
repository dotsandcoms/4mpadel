import 'dotenv/config';

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
        const loginRes = await fetch(`${API_BASE}/account/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                password,
                rememberMe: true,
                language: 'en'
            })
        });

        if (!loginRes.ok) {
            console.error("Login failed:", loginRes.status);
            const errData = await loginRes.json();
            console.error(errData);
            return;
        }

        const loginData = await loginRes.json();
        // Rankedin often returns token in Payload or Header
        const rinAuth = loginData.Token || loginRes.headers.get('rin-auth');
        const setCookie = loginRes.headers.get('set-cookie');

        console.log("Login successful. Token:", rinAuth ? "Found" : "Not Found");
        
        const playerId = '2750433'; // Mark Stillerman
        const matchesRes = await fetch(`${API_BASE}/player/GetPlayerMatchesAsync?playerid=${playerId}&takehistory=true&skip=0&take=20&language=en`, {
            headers: {
                'rin-auth': rinAuth || '',
                'Cookie': setCookie || '',
                'Referer': 'https://www.rankedin.com/',
                'Origin': 'https://www.rankedin.com'
            }
        });

        const matchesData = await matchesRes.json();
        console.log("Matches retrieved:", matchesData.Payload?.length || 0);
        if (matchesData.Payload && matchesData.Payload.length > 0) {
            const firstMatch = matchesData.Payload[0];
            console.log("Match Example - Event:", firstMatch.Info?.EventName);
            console.log("Match Example - Date:", firstMatch.Info?.Date);
            console.log("Match Example - Court:", firstMatch.Info?.Court);
        } else {
            console.log("Response:", JSON.stringify(matchesData, null, 2));
        }

    } catch (err) {
        console.error("Error:", err.message);
    }
}

fetchRealMatches();
