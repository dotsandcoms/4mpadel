const rankingId = 15809;
const res = await fetch(`https://api.rankedin.com/v1/ranking/LoadRankingInfoAsync?id=${rankingId}`);
const data = await res.json();
console.log("Ranking Info:", JSON.stringify(data, null, 2));
