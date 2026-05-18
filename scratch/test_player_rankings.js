const internalId = 2814869;
const res = await fetch(`https://api.rankedin.com/v1/player/PlayerRankingsAsync?id=${internalId}&language=en&skip=0&take=10`);
const data = await res.json();
console.log("Player Rankings:", JSON.stringify(data, null, 2));
