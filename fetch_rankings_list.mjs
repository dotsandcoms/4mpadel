import fetch from 'node-fetch'; // Just use native fetch since we are on node 22

const rankingId = 15809;
const res = await fetch(`https://api.rankedin.com/v1/Ranking/GetRankingsAsync?rankingId=${rankingId}&rankingType=3&ageGroup=82&weekFromNow=0&language=en&skip=0&take=5`);
const data = await res.json();
console.log("Men's Open Data:", JSON.stringify(data, null, 2));
