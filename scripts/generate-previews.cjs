// Screenshots of the real card source with example states and minimal HA surfaces.
// Optional development dependency: npm install --no-save playwright
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const iconNames = ['weather-pouring', 'weather-partly-cloudy', 'weather-sunny', 'thermometer-low', 'thermometer', 'thermometer-high', 'water-off', 'water-percent', 'water', 'flash-off', 'flash-outline', 'flash'];
  // Material Design Icons (Apache-2.0), pinned to 2424e748e0cc63ab7b9c095a099b9fe239b737c0 for reproducible glyphs.
  const icons = Object.fromEntries(await Promise.all(iconNames.map(async name => {
    const url = `https://raw.githubusercontent.com/Templarian/MaterialDesign/2424e748e0cc63ab7b9c095a099b9fe239b737c0/svg/${name}.svg`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    return [`mdi:${name}`, await response.text()];
  })));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const output = path.join(root, 'docs/previews');
    await fs.mkdir(output, { recursive: true });
    for (const theme of ['light', 'dark', 'compact']) {
      const dark = theme === 'dark';
      const compact = theme === 'compact';
      const page = await browser.newPage({ viewport: { width: compact ? 620 : 780, height: 620 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      await page.setContent(`<style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; }
        #preview {
          padding: 30px; background: ${dark ? '#111820' : '#f4f6f8'};
          color: ${dark ? '#e7edf4' : '#233142'};
          --card-background-color: ${dark ? '#202a35' : '#fff'};
          --primary-text-color: ${dark ? '#e7edf4' : '#233142'};
          --secondary-text-color: ${dark ? '#a1afbe' : '#697786'};
          --secondary-background-color: ${dark ? '#354352' : '#e8edf2'};
          --state-icon-color: ${dark ? '#a9b9ca' : '#526c83'};
          --preview-border: ${dark ? '#384554' : '#dce3ea'};
          --success-color: #43a047; --warning-color: #f4ae2b; --error-color: #ef5350; --info-color: #42a5f5;
        }
        h1 { margin: 0 0 8px; font-size: 24px; font-weight: 600; }
        p { margin: 0 0 24px; color: var(--secondary-text-color); font-size: 14px; line-height: 1.5; }
        .grid { display: grid; grid-template-columns: repeat(${compact ? 3 : 2}, minmax(0, 1fr)); gap: 16px; }
        ha-card { display: block; border: 1px solid ${dark ? '#384554' : '#dce3ea'}; border-radius: 14px; background: var(--card-background-color); box-shadow: 0 2px 6px #00000006; }
        .caption { margin: 22px 0 0; font-size: 12px; }
      </style><main id="preview"><h1>Tempometer Gauge Card</h1><p>${compact ? 'Responsive layout · 176 px cards' : `Version 2.2.0 · ${dark ? 'Dark' : 'Light'} theme · German number formatting`}</p><div class="grid"></div><p class="caption">Rendered from the card source · Example sensor data</p></main>`);
      await page.evaluate(icons => {
        customElements.define('ha-card', class extends HTMLElement {
          constructor() {
            super();
            const shadow = this.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = ':host { display: block; box-sizing: border-box; background: var(--card-background-color); border: 1px solid var(--preview-border); border-radius: 14px; box-shadow: 0 2px 6px #00000006; }';
            shadow.append(style, document.createElement('slot'));
          }
        });
        customElements.define('ha-icon', class extends HTMLElement {
          static get observedAttributes() { return ['icon']; }
          constructor() { super(); this.attachShadow({ mode: 'open' }); }
          attributeChangedCallback() {
            this.shadowRoot.replaceChildren();
            const style = document.createElement('style');
            style.textContent = ':host { display: inline-block; width: 24px; height: 24px; box-sizing: content-box; } svg { width: 100%; height: 100%; fill: currentColor; }';
            this.shadowRoot.append(style);
            const markup = icons[this.getAttribute('icon')];
            if (markup) {
              const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
              this.shadowRoot.append(document.importNode(svg, true));
            }
          }
        });
      }, icons);
      await page.addScriptTag({ path: path.join(root, 'tempometer-gauge-card.js') });
      await page.evaluate(compact => {
        const examples = [
          { title: 'Temperatur', card_style: 'thermometer', min: -10, max: 40, value: 22.6, unit: '°C', low: 17.2, high: 26.4, decimals: 1, severity: { green: 18, yellow: 25, red: 30 } },
          { title: 'Luftfeuchtigkeit', card_style: 'humidity', min: 0, max: 100, value: 48.2, unit: '%', low: 36, high: 63, decimals: 1 },
          { title: 'Luftdruck', card_style: 'barometer', min: 980, max: 1050, value: 1014, unit: 'hPa', low: 1002, high: 1023, decimals: 0, severity: { red: 980, yellow: 1000, green: 1020 } },
          { title: 'Leistung', card_style: 'custom', min: 0, max: 4000, value: 1234.5, unit: 'W', low: 180, high: 2850, decimals: 1, icon1: 'mdi:flash-off', icon2: 'mdi:flash-outline', icon3: 'mdi:flash', severity: { green: 0, yellow: 2000, red: 3000 } },
        ];
        for (const [index, example] of examples.slice(0, compact ? 3 : 4).entries()) {
          const { value, unit, low, high, ...options } = example;
          const entity = `sensor.preview_${index}`;
          const c = document.createElement('tempometer-gauge-card');
          c.setConfig({ ...options, entity, entity_min: `${entity}_min`, entity_max: `${entity}_max`, animation: false, locale: 'de-DE' });
          c.hass = { states: {
            [entity]: { state: String(value), attributes: { unit_of_measurement: unit } },
            [`${entity}_min`]: { state: String(low), attributes: {} },
            [`${entity}_max`]: { state: String(high), attributes: {} },
          }, locale: { language: 'de', number_format: 'language' } };
          document.querySelector('.grid').append(c);
        }
      }, compact);
      await page.locator('#preview').screenshot({ path: path.join(output, `${theme}.png`) });
      console.log(`Generated docs/previews/${theme}.png`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
