const API_BASE = 'https://api.rankedin.com/v1';

(async () => {
    console.log("Fetching Player Profile Info...");
    const res = await fetch(`${API_BASE}/player/playerprofileinfoasync?rankedinId=R000335461&language=en`);
    const data = await res.json();
    console.log("Profile Info:", JSON.stringify(data, null, 2));
})();
