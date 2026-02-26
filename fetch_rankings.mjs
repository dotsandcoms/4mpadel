const orgId = 11331;
const res = await fetch(`https://api.rankedin.com/v1/Organization/GetOrganisationRankingsAsync?organisationId=${orgId}`);
const data = await res.json();
console.log("Organisation Rankings:", JSON.stringify(data, null, 2));
