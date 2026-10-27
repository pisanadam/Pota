// Captures the Play Store screenshots from the packed game asset.
// Usage: python3 pack.py && node qa/capture-screenshots.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const assetPath = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'index.html');
const outDir = path.join(root, 'play-release', 'screenshots');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const shots = [];
  async function open(seed) {
    const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 });
    await page.addInitScript(value => { if (value && !sessionStorage.getItem('seeded')) { localStorage.setItem('pota.fixed-shots.v1', JSON.stringify(value)); sessionStorage.setItem('seeded', '1'); } }, seed || null);
    await page.goto('file://' + assetPath);
    await page.waitForFunction(() => window.Pota && window.Pota.getState().state === 'ready');
    await page.waitForTimeout(1500);
    return page;
  }
  async function save(page, file, description) {
    const target = path.join(outDir, file);
    await page.screenshot({ path: target });
    shots.push({ file, description });
  }
  async function swipe(page, dy, release = true) {
    await page.mouse.move(180, 540); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(180, 540 - dy * i / 10); await page.waitForTimeout(20); }
    await page.waitForTimeout(150);
    if (release) await page.mouse.up();
  }

  let page = await open({ sound: false });
  await save(page, '01-gym.png', 'Fresh start, classic gym, default shot view.');
  // Real shots until the first basket; the goal toast appears with it.
  for (const dy of [180, 175, 185, 170, 190, 165, 195]) {
    await swipe(page, dy);
    const made = await page.waitForFunction(() => { const s = window.Pota.getState(); return s.state === 'ready' || !document.getElementById('goal-toast').hidden ? s : null; }, null, { timeout: 20000 }).then(h => h.jsonValue());
    if (!(await page.isHidden('#goal-toast'))) break;
    if (made.stats.made) break;
  }
  if (!(await page.isHidden('#goal-toast'))) await save(page, '02-first-goal.png', 'First basket of a fresh game and its goal reward notice.');
  await page.click('#menu-button');
  await page.click('#goals > summary');
  await page.evaluate(() => document.getElementById('goals').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await save(page, '03-goals.png', 'Menu goal list after the shots above.');
  await page.close();

  page = await open({ sound: false, ownedEnvironments: ['gym', 'desert-court'], equippedEnvironment: 'desert-court' });
  await swipe(page, 170, false);
  await page.waitForTimeout(300);
  await save(page, '04-desert-court.png', 'Desert court with the aim arrow while dragging.');
  await page.mouse.up();
  await page.close();
  await browser.close();

  const asset = fs.readFileSync(assetPath);
  const { execFileSync } = require('child_process');
  const files = shots.map(shot => {
    const file = path.join(outDir, shot.file);
    const [width, height] = execFileSync('python3', ['-c', 'import struct,sys;d=open(sys.argv[1],"rb").read(24);print(*struct.unpack(">II",d[16:24]))', file]).toString().trim().split(' ').map(Number);
    return { ...shot, width, height, bytes: fs.statSync(file).size, sha256: sha(file) };
  });
  const manifest = {
    source_asset_sha256: crypto.createHash('sha256').update(asset).digest('hex'),
    source_asset_bytes: asset.length,
    capture: 'Chromium (SwiftShader WebGL) rendering of the packed game asset by qa/capture-screenshots.js; CSS viewport 360x640, deviceScaleFactor 3. Not a physical phone capture.',
    quality: 'Default automatic graphics and resolution. No quality override.',
    seed: 'Shots 01-03: fresh save with sound off; shots, basket, score and goal notice come from real swipes. Shot 04: desert court added to the local inventory before loading. Native ads unavailable and hidden.',
    postprocessing: 'None. No crops, frames, text overlays, or image edits.',
    files
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(files.map(f => [f.file, f.width, f.height])));
})();
