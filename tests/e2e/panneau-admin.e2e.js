const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://localhost:3456/client/room.html?room=audit2&name=Test%20Admin&env=open-space&size=20&creator=true', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.fill('#pseudo-input', 'Admin');
  await page.click('#btn-enter');
  await page.waitForTimeout(2200);

  // Ouvre le panneau admin
  await page.click('#btn-admin');
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/shots/admin-participants.png' });
  const partHtml = await page.evaluate(() => document.getElementById('admin-participants-list').innerHTML.length);
  console.log('participants-list HTML length:', partHtml);

  await page.click('.admin-tab[data-tab="reglages"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/shots/admin-reglages.png' });

  await page.click('.admin-tab[data-tab="mobilier"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/shots/admin-mobilier.png' });

  const panelVisible = await page.evaluate(() => {
    const p = document.getElementById('admin-panel');
    const r = p.getBoundingClientRect();
    return { right: getComputedStyle(p).right, x: r.x, w: r.width, open: p.classList.contains('open') };
  });
  console.log('panel:', JSON.stringify(panelVisible));
  console.log('errors:', errors.length ? errors.join('\n') : 'aucune');
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
