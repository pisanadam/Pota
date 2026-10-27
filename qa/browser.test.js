// Drives the packed Android game asset in Chromium. Run `python3 pack.py` first.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');
const asset = 'file://' + path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'index.html');

test('walk limits, far hoop and goals in the real game', async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 820 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(asset);
    await page.waitForFunction(() => window.Pota && window.Pota.getState().state === 'ready');
    const state = () => page.evaluate(() => window.Pota.getState());
    const drag = async (dx, dy, x = 200, y = 400) => {
      await page.mouse.move(x, y); await page.mouse.down();
      for (let i = 1; i <= 20; i++) { await page.mouse.move(x + dx * i / 20, y - dy * i / 20); await page.waitForTimeout(8); }
      await page.mouse.up(); await page.waitForTimeout(60);
    };

    // The goal list is rendered in the menu.
    await page.click('#menu-button');
    assert.equal(await page.locator('#goals-list > li').count(), await page.evaluate(() => window.PotaGoals.catalog.length));
    assert.match(await page.textContent('#goals-count'), /^0\/\d+$/);
    await page.click('#walk-mode');

    // Circling the main hoop used to lead behind its backboard.
    for (let i = 0; i < 12; i++) await drag(0, 60);
    for (let i = 0; i < 6; i++) await drag(40, 0);
    for (let i = 0; i < 6; i++) await drag(0, 60);
    let s = await state();
    assert.ok(s.position.z >= -12.25 - 1e-9, `walked behind the board: z=${s.position.z}`);
    assert.equal(s.activeHoop, 0);

    // Walking keeps its facing (no flip mid-walk); shoot mode turns the
    // player toward the hoop on their half, whose backboard limits the walk.
    await page.reload();
    await page.waitForFunction(() => window.Pota && window.Pota.getState().state === 'ready');
    await page.click('#menu-button');
    await page.click('#walk-mode');
    for (let i = 0; i < 10; i++) await drag(0, -90);
    s = await state();
    assert.ok(s.position.z > 8, `walk did not reach the far half: z=${s.position.z}`);
    assert.equal(s.activeHoop, 0);
    await page.click('#menu-button');
    await page.click('#shoot-mode');
    assert.equal((await state()).activeHoop, 1);
    await page.click('#menu-button');
    await page.click('#walk-mode');
    for (let i = 0; i < 6; i++) await drag(0, 60);
    for (let i = 0; i < 6; i++) await drag(40, 0);
    for (let i = 0; i < 6; i++) await drag(0, 60);
    s = await state();
    assert.ok(s.position.z <= 12.25 + 1e-9, `walked behind the far board: z=${s.position.z}`);
    assert.equal(s.activeHoop, 1);

    // In shoot mode the aim and point value use the far hoop.
    await page.click('#menu-button');
    await page.click('#shoot-mode');
    await page.mouse.move(200, 650); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(200, 650 - 180 * i / 10); await page.waitForTimeout(20); }
    await page.waitForTimeout(80);
    s = await state();
    assert.ok(s.aim && s.aim.points.some(point => point.z > 11), 'aim arc does not reach the far hoop');
    await page.mouse.up();
    await page.waitForFunction(() => window.Pota.getState().stats.attempts === 1, null, { timeout: 15000 });
    s = await state();
    assert.equal(s.stats.history[0].hoop, 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
