const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-sandbox',
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['microphone'],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

  // 1. Landing
  await page.goto('http://localhost:3456/client/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/shots/01-landing.png' });

  // 2. Onboarding
  await page.goto('http://localhost:3456/client/room.html?room=audit1&name=Atelier%20Design&env=open-space&size=20&creator=true', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '/tmp/shots/02-onboarding.png' });

  // 3. Join the room
  await page.fill('#pseudo-input', 'Camille');
  await page.waitForTimeout(300);
  await page.click('#btn-enter');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/shots/03-scene-jour.png' });

  // 4. Thème Nuit
  await page.evaluate(() => Themes.apply('nuit'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/shots/04-scene-nuit.png' });

  // 5. Tiroir admin (Réglages > Thème)
  await page.evaluate(() => Themes.apply('jour'));
  await page.evaluate(() => UI.toggleAdminPanel());
  await page.waitForTimeout(600);
  await page.click('.admin-tab[data-tab="theme"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/shots/05-admin-theme.png' });

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
