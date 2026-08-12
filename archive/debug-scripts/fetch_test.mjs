const res = await fetch("https://api.rankedin.com/v1/Ranking/GetRankingsAsync?rankingId=15809&rankingType=4&ageGroup=83&weekFromNow=0&language=en&skip=0&take=1000");
const data = await res.json();
const p = data.Payload.find(x => x.Name.includes("Shazneen"));
console.log(p);
