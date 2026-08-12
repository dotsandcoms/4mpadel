const API_BASE = 'https://api.rankedin.com/v1';

async function testAnonymousFetch() {
    try {
        console.log("Fetching layout info for anonymous token...");
        const layoutRes = await fetch(`${API_BASE}/player/getlayoutinfoasync?language=en`, {
            headers: {
                'Referer': 'https://www.rankedin.com/',
                'Origin': 'https://www.rankedin.com'
            }
        });
        
        const layoutData = await layoutRes.json();
        const anonToken = layoutData.AnonymousToken;
        console.log("Anonymous Token:", anonToken);

        if (!anonToken) {
            console.error("No anonymous token found in response.");
            return;
        }

        const playerId = '2750433'; // Mark Stillerman
        const matchesRes = await fetch(`${API_BASE}/player/GetPlayerMatchesAsync?playerid=${playerId}&takehistory=true&skip=0&take=10&language=en`, {
            headers: {
                'x-anonymous-token': anonToken,
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
            }
        } else {
            console.log("Empty Payload or Error.");
        }

    } catch (err) {
        console.error("Error:", err.message);
    }
}

testAnonymousFetch();
