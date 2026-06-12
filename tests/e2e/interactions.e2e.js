const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3456/client/room.html?room=zoomtest&name=Zoom&env=open-space&size=20&creator=true', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.fill('#pseudo-input', 'Camille');
  await page.click('#btn-enter');
  await page.waitForTimeout(2200);

  // Zoom rapproché sur le joueur
  await page.evaluate(() => {
    Engine.zoom = 2.0;
    const ps = Board.iso(Engine.player.x, Engine.player.y);
    Engine.camera.x = Engine.viewW / 2 - ps.x * Engine.zoom;
    Engine.camera.y = Engine.viewH / 2 - ps.y * Engine.zoom;
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/shots/06-zoom-detail.png' });

  // Saisie chat (visibilité du mot) — thème Jour
  await page.fill('#chat-input', 'Bonjour tout le monde');
  await page.screenshot({ path: '/tmp/shots/07-chat-jour.png', clip: { x: 0, y: 480, width: 380, height: 420 } });

  // Thème Nuit : saisie + scène
  await page.evaluate(() => Themes.apply('nuit'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/shots/08-zoom-nuit.png' });

  // Clic sur l'étiquette « Tableau blanc » : l'overlay doit s'ouvrir
  await page.evaluate(() => {
    Engine.zoom = 1.0;
    Engine.camera.x = 200; Engine.camera.y = 200;
  });
  await page.waitForTimeout(400);
  const pill = await page.evaluate(() => {
    if (!Engine._zonePills || !Engine._zonePills.length) return null;
    const p = Engine._zonePills.find(z => z.def.isWhiteboard) || Engine._zonePills[0];
    // monde → écran
    return {
      x: ((p.x0 + p.x1) / 2) * Engine.zoom + Engine.camera.x,
      y: ((p.y0 + p.y1) / 2) * Engine.zoom + Engine.camera.y,
    };
  });
  console.log('pill at', JSON.stringify(pill));
  if (pill) {
    // Approche le joueur du tableau pour respecter la distance
    await page.evaluate(() => {
      const wb = Board.furniture.find(f => (Environments.furnitureTypes[f.type] || {}).isWhiteboard);
      if (wb) { Engine.player.x = wb.x + 1; Engine.player.y = wb.y + 2; }
    });
    await page.mouse.click(pill.x, pill.y);
    await page.waitForTimeout(800);
    const wbOpen = await page.evaluate(() => {
      const el = document.getElementById('whiteboard-overlay');
      return el && el.style.display !== 'none';
    });
    console.log('whiteboard ouvert via pastille:', wbOpen);
    await page.screenshot({ path: '/tmp/shots/09-whiteboard.png' });
  }

  console.log('errors:', errors.length ? errors.join(' | ') : 'aucune');
  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
