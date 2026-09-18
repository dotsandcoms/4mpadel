import { Jimp, loadFont } from 'jimp';
import { SANS_32_WHITE, SANS_64_WHITE } from 'jimp/fonts';
import sharp from 'sharp';

let fonts;
const clean = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
async function portrait(url, width, height) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'media.padelapi.org') return null;
    const response = await fetch(parsed, { signal: AbortSignal.timeout(3500), redirect: 'error' });
    if (!response.ok || Number(response.headers.get('content-length')) > 5_000_000) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 5_000_000) return null;
    return await sharp(bytes, { limitInputPixels: 20_000_000 }).resize(width, height, { fit: 'contain', background: { r: 16, g: 24, b: 18, alpha: 0 } }).png().toBuffer();
  } catch { return null; }
}
export async function renderShareImage(data) {
  fonts ||= Promise.all([loadFont(SANS_32_WHITE), loadFont(SANS_64_WHITE)]);
  const [small, large] = await fonts;
  const canvas = new Jimp({ width: 1200, height: 630, color: 0x101812ff });
  const rect = (x,y,w,h,color) => canvas.composite(new Jimp({ width:w,height:h,color }),x,y);
  const text = (value,x,y,width=1080,big=false,height=150) => canvas.print({ font: big ? large : small, x,y,text:clean(value),maxWidth:width,maxHeight:height });
  rect(0,0,1200,8,0xccff00ff);
  text('4M / PRO PADEL',48,34);
  text('4mpadel.co.za',48,566);
  const images = [];
  if (data.kind === 'player') {
    const p = data.player;
    text(p.category === 'women' ? "WOMEN'S WORLD RANKING" : "MEN'S WORLD RANKING",48,116,720);
    text(p.name,48,177,720,true,170);
    text(`#${p.rank}  /  ${Number(p.points).toLocaleString('en-ZA')} PTS`,48,362,720);
    text('Follow player. Results. Fixtures.',48,445,720);
    const photo = await portrait(p.photoUrl,330,440);
    if (photo) images.push({input:photo,left:830,top:110});
    else { rect(840,155,310,310,0x253b28ff); text(`#${p.rank}`,875,250,260,true); }
  } else {
    const m = data.match;
    text(m.tournamentName,48,100,1100,true,150);
    const round = m.round === 1 ? 'Final' : m.round === 2 ? 'Semi-final' : m.round === 4 ? 'Quarter-final' : 'Match';
    text(`${round} / ${m.category === 'women' ? 'Women' : 'Men'} / ${({finished:'Final score',retired:'Retirement',walkover:'Walkover',bye:'Bye',ended:'Unconfirmed score'})[m.status] || 'Result pending'}`,48,248);
    for (let index=0;index<2;index++) {
      const left = index ? 630 : 48;
      text(m.teams[index].map(p=>p.name).join(' / '),left+170,312,350,false,120);
      const photos = await Promise.all(m.teams[index].map(p => portrait(data.players.find(profile => String(profile.id) === String(p.id))?.photoUrl,75,100)));
      photos.forEach((photo, photoIndex) => { if (photo) images.push({input:photo,left:left+photoIndex*80,top:315}); });
      text(m.score.map(set=>set[index] ?? '-').join('   '),left,435,520,true,100);
    }
  }
  return sharp(await canvas.getBuffer('image/png')).composite(images).png().toBuffer();
}
