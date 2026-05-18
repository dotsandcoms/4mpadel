const API_BASE = 'https://api.rankedin.com/v1';

async function getAnonymousToken() {
    try {
        const res = await fetch(`${API_BASE}/player/getlayoutinfoasync?language=en`);
        if (res.ok) {
            const data = await res.json();
            if (data.AnonymousToken) {
                return data.AnonymousToken;
            }
        }
    } catch (err) {
        console.error('Failed to fetch anonymous token:', err);
    }
    return null;
}

(async () => {
    const token = await getAnonymousToken();
    console.log("Token:", token);
    if (!token) return;

    const headers = {
        'x-anonymous-token': token,
        'Accept': 'application/json'
    };

    const internalId = 2814869; // Clorinda Wessels

    // 1. Get Player Rankings
    console.log("Fetching Player Rankings...");
    const rankingsRes = await fetch(`${API_BASE}/player/PlayerRankingsAsync?id=${internalId}&language=en&skip=0&take=10`, { headers });
    const rankingsData = await rankingsRes.json();
    console.log("Rankings response:");
    console.log(JSON.stringify(rankingsData, null, 2));

    // 2. Get Historic Data
    console.log("Fetching Historic Data...");
    const historicRes = await fetch(`${API_BASE}/player/GetHistoricDataAsync?id=${internalId}`, { headers });
    const historicData = await historicRes.json();
    console.log("Historic response:", JSON.stringify(historicData, null, 2).substring(0, 500));

    // 3. Get Player Rating
    console.log("Fetching Player Rating...");
    const ratingRes = await fetch(`${API_BASE}/rating/GetPlayerRatingAsync?id=${internalId}`, { headers });
    const ratingData = await ratingRes.json();
    console.log("Rating response:", JSON.stringify(ratingData, null, 2));
})();
