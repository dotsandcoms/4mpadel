const fs = require('fs');

async function test() {
  try {
    const url = 'https://rankedin.com/en/api/tournament/GetTournamentClassesAsync?tournamentId=70399&language=en';
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Accept': 'application/json'
        }
    });
    const data = await response.json();
    
    const cls = data.find(c => c.Name.includes('Open'));
    if (!cls) return console.log('No Open class');
    
    const drawUrl = 'https://rankedin.com/en/api/tournament/GetTournamentDrawsAsync?tournamentId=70399&tournamentClassId=' + cls.Id + '&language=en';
    const drawResponse = await fetch(drawUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Accept': 'application/json'
        }
    });
    const drawData = await drawResponse.json();
    
    fs.writeFileSync('drawData.json', JSON.stringify(drawData, null, 2));
    console.log('Saved to drawData.json');
  } catch (err) {
      console.error(err);
  }
}
test();
