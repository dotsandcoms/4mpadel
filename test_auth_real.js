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
        const loginRes = await fetch(`${API_BASE}/Account/LogInAsync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: email,
                password: password,
                rememberMe: true,
                TimezoneOffset: 120,
                ClientPlatform: "chrome 146.0.0 / Mac OS"
            })
        });

        if (!loginRes.ok) {
            console.error("Login failed:", loginRes.status);
            return;
        }

        const loginData = await loginRes.json();
        const setCookie = loginRes.headers.get('set-cookie');
        
        // Find the 'rin-auth' cookie
        let rinAuthToken = '';
        if (setCookie) {
            const match = setCookie.match(/rin-auth=([^;]+)/);
            if (match) rinAuthToken = match[1];
        }

        console.log("Login successful. rin-auth cookie:", rinAuthToken ? "Found" : "Not Found");
        
        const playerId = '2750433'; // Mark Stillerman
        const matchesRes = await fetch(`${API_BASE}/player/GetPlayerMatchesAsync?playerid=${playerId}&takehistory=true&skip=0&take=10&language=en`, {
            headers: {
                'Cookie': `rin-auth=${rinAuthToken}`,
                'Referer': 'https://www.rankedin.com/',
                'Origin': 'https://www.rankedin.com',
                'Accept': 'application/json'
            }
        });

        const matchesData = await matchesRes.json();
        console.log("Matches retrieved:", matchesData.Payload?.length || 0);
        
        if (matchesData.Payload && matchesData.Payload.length > 0) {
            const firstMatch = matchesData.Payload[0];
            console.log("Match Event:", firstMatch.Info?.EventName);
            if (firstMatch.Info?.EventName === 'EventName') {
                console.log("STILL DUMMY DATA!");
            } else {
                console.log("REAL DATA ACQUIRED!");
                console.log("Date:", firstMatch.Info?.Date);
            }
        } else {
            console.log("Empty Payload.");
        }

    } catch (err) {
        console.error("Error:", err.message);
    }
}

fetchRealMatches();
