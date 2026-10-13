// Optional real-browser checks: npm install --no-save playwright; npx playwright install chromium
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>
      body { font-family: Arial, sans-serif; --card-background-color: white; --primary-text-color: #212121; --secondary-text-color: #727272; --secondary-background-color: #eee; }
      ha-card { display: block; border: 1px solid #ddd; border-radius: 12px; box-sizing: border-box; }
    </style><div id="host" style="width:320px"></div>`);
    await page.addScriptTag({ path: path.resolve('tempometer-gauge-card.js') });
    await page.evaluate(() => {
      const c = document.createElement('tempometer-gauge-card'); c.setConfig({ entity: 'sensor.test', min: 0, max: 100 });
      c.hass = { states: { 'sensor.test': { state: '12.5', attributes: { unit_of_measurement: '°C' } } }, locale: { language: 'de' } };
      document.querySelector('#host').append(c);
    });
    assert.ok(await page.evaluate(() => { const style = getComputedStyle(document.querySelector('tempometer-gauge-card').shadowRoot.querySelector('#percent')); return parseFloat(style.lineHeight) >= parseFloat(style.fontSize); }), 'reading line must accommodate its font without clipping');
    await page.evaluate(() => {
      const c = document.querySelector('tempometer-gauge-card');
      c.setConfig({ entity: 'sensor.test', entity_min: 'sensor.low', entity_max: 'sensor.high', min: 0, max: 100, animation: false });
      c.hass = { states: { 'sensor.test': { state: '50', attributes: {} }, 'sensor.low': { state: '0', attributes: {} }, 'sensor.high': { state: '100', attributes: {} } } };
    });
    assert.ok(await page.evaluate(() => {
      const root = document.querySelector('tempometer-gauge-card').shadowRoot;
      const svg = root.querySelector('#svg_min');
      const style = getComputedStyle(svg);
      const tip = svg.createSVGPoint(); tip.x = 2; tip.y = 12;
      const position = tip.matrixTransform(svg.getScreenCTM());
      const gauge = root.querySelector('.gauge-a').getBoundingClientRect();
      return Math.abs(position.x - (gauge.left + gauge.width * 0.025)) < 1 && Math.abs(position.y - gauge.bottom) < 1 &&
        parseFloat(style.width) >= 16 && root.querySelector('#svg_min path').getAttribute('stroke') !== null;
    }), 'minimum arrow tip must align with the scale endpoint and have a contrasting outline');
    const width = () => page.evaluate(() => document.querySelector('tempometer-gauge-card').shadowRoot.querySelector('.container').getBoundingClientRect().width);
    assert.equal(await width(), 200);
    await page.evaluate(() => document.querySelector('#host').style.width = '140px');
    assert.ok(await width() <= 116, 'gauge must shrink with its parent');
    for (const parentWidth of [320, 140]) {
      for (const value of [0, 50, 100]) {
        const aligned = await page.evaluate(({ parentWidth, value }) => {
          document.querySelector('#host').style.width = `${parentWidth}px`;
          const c = document.querySelector('tempometer-gauge-card');
          c.hass = { states: { 'sensor.test': { state: '50', attributes: {} }, 'sensor.low': { state: String(value), attributes: {} }, 'sensor.high': { state: String(value), attributes: {} } } };
          const root = c.shadowRoot;
          const arc = root.querySelector('.gauge-a').getBoundingClientRect();
          const radius = arc.width * 0.475;
          const angle = Math.PI * value / 100;
          const expected = { x: arc.left + arc.width / 2 - radius * Math.cos(angle), y: arc.bottom - radius * Math.sin(angle) };
          return ['svg_min', 'svg_max'].every(id => {
            const svg = root.getElementById(id);
            const tip = svg.createSVGPoint(); tip.x = 2; tip.y = 12;
            const actual = tip.matrixTransform(svg.getScreenCTM());
            return Math.abs(actual.x - expected.x) < 1 && Math.abs(actual.y - expected.y) < 1;
          });
        }, { parentWidth, value });
        assert.ok(aligned, `both arrow tips must match value ${value} at parent width ${parentWidth}`);
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('tempometer-gauge-card').shadowRoot.querySelector('#gauge')).transitionDuration), '0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      document.querySelector('#host').style.setProperty('--info-color', 'rgb(12, 34, 56)');
      window.activations = 0; document.addEventListener('hass-more-info', () => window.activations++);
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('tempometer-gauge-card').shadowRoot.querySelector('#gauge')).backgroundColor === 'rgb(12, 34, 56)');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('tempometer-gauge-card').shadowRoot.querySelector('#gauge')).backgroundColor), 'rgb(12, 34, 56)');
    await page.locator('tempometer-gauge-card').locator('ha-card').focus();
    await page.keyboard.press('Enter'); await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.activations), 2);
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('tempometer-gauge-card').shadowRoot.querySelector('ha-card')).outlineStyle), 'none');
    await page.evaluate(() => document.querySelector('#host').style.width = '320px');
    await page.screenshot({ path: '/tmp/tempometer-preview.png' });
    console.log('Browser checks passed: responsive sizing, reduced motion, theme color, keyboard and focus.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
