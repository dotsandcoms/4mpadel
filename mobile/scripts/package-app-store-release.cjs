const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve('release/app-store-1.0.0');
const screenshots = [];
for (const [folder, width, height, expected] of [['iphone', 1206, 2622, 6], ['watch', 416, 496, 2]]) {
  const names = fs.readdirSync(path.join(root, folder)).filter(name => /^\d\d-.*\.jpg$/.test(name)).sort();
  if (names.length !== expected) throw new Error(`Expected ${expected} numbered ${folder} JPEGs`);
  for (const name of names) {
    const file = `${folder}/${name}`, bytes = fs.readFileSync(path.join(root, file));
    if (bytes[0] !== 255 || bytes[1] !== 216) throw new Error(`${file} is not JPEG`);
    const details = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', path.join(root, file)], { encoding: 'utf8' });
    if (Number(details.match(/pixelWidth: (\d+)/)?.[1]) !== width || Number(details.match(/pixelHeight: (\d+)/)?.[1]) !== height || !/hasAlpha: no/.test(details)) {
      throw new Error(`Keep ${file} at ${width} × ${height} with no alpha channel`);
    }
    screenshots.push({ file, width, height, format: 'JPEG', alpha: false, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
}
fs.writeFileSync(path.join(root, 'screenshot-manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), screenshots }, null, 2) + '\n');
const status = JSON.parse(fs.readFileSync(path.join(root, 'build/build-status.json')));
if (status.status !== 'FINISHED') throw new Error('Production build must finish before packaging');
const build = String(status.appBuildVersion), ipa = `build/4M-Padel-1.0.0-${build}.ipa`;
if (!fs.existsSync(path.join(root, ipa))) throw new Error('Completed IPA missing');
const files = [];
function collect(relative = '') {
  for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const file = path.posix.join(relative, item.name);
    if (item.isDirectory()) { if (item.name !== 'source-png') collect(file); }
    else if ((!file.endsWith('.png') || file === 'icon/4M-Padel-App-Store-1024.png') && (!file.endsWith('.ipa') || file === ipa)) files.push(file);
  }
}
collect();
const archive = path.resolve(`release/4M-Padel-App-Store-1.0.0-${build}.zip`);
if (fs.existsSync(archive)) fs.unlinkSync(archive);
execFileSync('zip', ['-q', archive, ...files], { cwd: root });
execFileSync('unzip', ['-tq', archive]);
console.log(`Packaged build ${build} and ${screenshots.length} upload-ready screenshots: ${archive}`);
console.log('Run this script again after saving screenshot edits to refresh the manifest and ZIP.');
