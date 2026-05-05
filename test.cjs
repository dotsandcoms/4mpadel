const teamsData = [
    { id: 1, name: 'Atholl Aces', short: 'ATH' },
    { id: 2, name: 'Brooklyn Bulls', short: 'BRK' },
    { id: 3, name: 'Centurion Cobras', short: 'CEN' },
    { id: 4, name: 'Hyde Park Falcons', short: 'HYD' },
    { id: 5, name: 'Melrose Mavericks', short: 'MEL' },
    { id: 6, name: 'Menlyn Sharks', short: 'MEN' },
    { id: 7, name: 'Sandton Stallions', short: 'SAN' },
    { id: 8, name: 'Waterfall Wolves', short: 'WAT' },
];

fetch('https://api.rankedin.com/v1/teamleague/GetPoolTeamsAsync?poolid=12616&language=en')
  .then(r => r.json())
  .then(data => {
      data.forEach(t => {
         const match = teamsData.find(x => x.name.trim().toLowerCase() === t.Name.trim().toLowerCase());
         if (!match) console.log("NO MATCH FOR", t.Name);
      });
      console.log("Team mapping test finished.");
  });
