
const API_BASE = 'https://api.rankedin.com/v1';

async function inspectMatchResult() {
    const TOURNAMENT_ID = 64714;
    try {
        const url = `${API_BASE}/tournament/GetMatchesSectionAsync?Id=${TOURNAMENT_ID}&LanguageCode=en&IsReadonly=true`;
        const response = await fetch(url);
        const data = await response.json();
        const matches = data.Matches || [];
        if (matches.length > 0 && matches[4]) {
            console.log('Match[4] MatchResult:', JSON.stringify(matches[4].MatchResult, null, 2));
        }
    } catch (err) {
        console.error(err);
    }
}

inspectMatchResult();
