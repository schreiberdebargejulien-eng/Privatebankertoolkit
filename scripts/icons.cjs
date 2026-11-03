// Génère les icônes PNG de la PWA depuis public/icon.svg (Chromium préinstallé)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../public/icon.svg'), 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['apple-touch-icon.png', 180, 0]]) {
    await p.setViewportSize({ width: size, height: size });
    // Apple : fond plein (iOS applique son propre masque)
    const inner = name.startsWith('apple') ? svg.replace('rx="112"', 'rx="0"') : svg;
    await p.setContent(`<html><body style="margin:0;background:transparent">${inner.replace('<svg ', `<svg width="${size - pad}" height="${size - pad}" `)}</body></html>`);
    await p.screenshot({ path: path.join(__dirname, '../public', name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await b.close();
})();
