const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
class Element {
  constructor() { this.children = []; this.style = {}; this.attributes = {}; this.textContent = ''; this.listeners = {}; }
  attachShadow() { return this.shadowRoot = new Element(); }
  appendChild(el) { this.children.push(el); return el; }
  removeChild(el) { this.children.splice(this.children.indexOf(el), 1); }
  get lastChild() { return this.children.at(-1); }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatchEvent(event) { this.event = event; return true; }
  getElementById(id) { for (const el of this.children) { if (el.id === id) return el; const found = el.getElementById(id); if (found) return found; } return null; }
}
function card(tag = 'tempometer-gauge-card') {
  const registry = new Map();
  vm.runInNewContext(fs.readFileSync('tempometer-gauge-card.js', 'utf8'), {
    HTMLElement: Element, document: { createElement: tag => { const element = new Element(); element.tagName = tag; return element; }, createElementNS: () => new Element() },
    customElements: { get: n => registry.get(n), define: (n, c) => registry.set(n, c) },
    window: {}, console: { info() {} }, CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } }
  });
  return new (registry.get(tag))();
}
const config = { entity: 'sensor.temperature', min: 0, max: 100 };
const states = (value, unit = '°C') => ({ states: { 'sensor.temperature': { state: value, attributes: { unit_of_measurement: unit } } } });
const el = (c, id) => c.shadowRoot.getElementById(id);
test('rejects degenerate and nonnumeric ranges before rendering', () => {
  for (const [min, max] of [[10, 10], [20, 10], ['oops', 100], [0, Infinity]]) {
    assert.throws(() => card().setConfig({ ...config, min, max }), /finite|greater|number/i);
  }
});
test('clamps gauge and min/max markers to the scale', () => {
  const c = card(); c.setConfig({ ...config, entity_min: 'sensor.low', entity_max: 'sensor.high' });
  c.hass = { states: { ...states(150).states, 'sensor.low': { state: '-20', attributes: {} }, 'sensor.high': { state: '200', attributes: {} } } };
  assert.equal(el(c, 'gauge').style.transform, 'rotate(0.5turn)');
  assert.equal(el(c, 'recentMin').style.transform, 'rotate(0turn)');
  assert.equal(el(c, 'recentMax').style.transform, 'rotate(0.5turn)');
});
test('clears stale gauge and markers when sensors become unavailable', () => {
  const c = card(); c.setConfig({ ...config, decimals: 2, entity_min: 'sensor.low' });
  c.hass = states(42); c.hass = states('unavailable');
  assert.equal(el(c, 'percent').textContent, 'unavailable');
  assert.equal(el(c, 'gauge').style.visibility, 'hidden');
  assert.equal(el(c, 'recentMin').style.display, 'none');
  c.hass = { states: {} }; assert.equal(el(c, 'percent').textContent, 'unavailable');
  c.hass = states(0); assert.equal(el(c, 'percent').textContent, '0.00 °C');
  assert.equal(el(c, 'gauge').style.visibility, 'visible');
});
test('rerenders unchanged values after config and unit changes', () => {
  const c = card(); c.setConfig(config); c.hass = states(42);
  c.setConfig({ ...config, title: 'New title' }); c.hass = states(42, 'K');
  assert.equal(el(c, 'percent').textContent, '42 K'); assert.equal(el(c, 'title').textContent, 'New title');
});
test('severity max boundary restores normal color', () => {
  const c = card(); const thresholds = { green: 10, yellow: 20, red: 30, max: 40 };
  assert.equal(c._computeSeverity(40, thresholds), c._computeSeverity(41, thresholds));
});
test('reports actual masonry height and stable sections height', () => {
  const c = card(); c.setConfig(config); assert.equal(c.getCardSize(), 4);
  assert.equal(c.getGridOptions().rows, 3);
});
test('subscribes to HA states context and unsubscribes on removal', () => {
  const c = card(); c.setConfig(config); assert.equal(typeof c.connectedCallback, 'function'); c.connectedCallback();
  assert.equal(c.event.type, 'context-request'); assert.equal(c.event.context, 'states');
  let unsubscribed = false; c.event.callback(states(12).states, () => { unsubscribed = true; });
  assert.equal(el(c, 'percent').textContent, '12 °C'); c.disconnectedCallback(); assert.equal(unsubscribed, true);
});
test('reads attribute sensors and clears unavailable attribute markers', () => {
  const c = card(); c.setConfig({ ...config, entity: 'sensor.temperature.current', entity_min: 'sensor.temperature.low', entity_max: 'sensor.temperature.high' });
  c.hass = { states: { 'sensor.temperature': { state: 'online', attributes: { current: 23, low: 10, high: 40, unit_of_measurement: '°C' } } } };
  assert.equal(el(c, 'percent').textContent, '23 °C');
  assert.equal(el(c, 'recentMin').style.display, 'block');
  c.hass = { states: { 'sensor.temperature': { state: 'online', attributes: { current: 23, high: 'unknown' } } } };
  assert.equal(el(c, 'recentMin').style.display, 'none'); assert.equal(el(c, 'recentMax').style.display, 'none');
});
test('does not interpret empty or nonnumeric sensor values as zero', () => {
  const c = card(); c.setConfig(config);
  for (const value of ['', ' ', null, false, '12bad', Infinity]) {
    c.hass = states(value); assert.equal(el(c, 'percent').textContent, 'unavailable');
  }
  c.hass = states('unknown'); assert.equal(el(c, 'percent').textContent, 'unknown');
});
test('accepts state delivery before configuration and uses it on configuration', () => {
  const c = card(); c.hass = states(18); c.setConfig(config);
  assert.equal(el(c, 'percent').textContent, '18 °C');
});
test('rejects decimal precision that would break formatting', () => {
  for (const decimals of [-1, 1.5, 21, '2']) {
    assert.throws(() => card().setConfig({ ...config, decimals }), /decimals/);
  }
});
test('releases the old context provider when a new provider takes over', () => {
  const c = card(); c.setConfig(config); c.connectedCallback();
  let oldReleased = 0, newReleased = 0;
  const oldDispose = () => oldReleased++;
  const newDispose = () => newReleased++;
  c.event.callback(states(10).states, oldDispose);
  c.event.callback(states(11).states, oldDispose);
  assert.equal(oldReleased, 0);
  c.event.callback(states(12).states, newDispose);
  assert.equal(oldReleased, 1);
  assert.equal(el(c, 'percent').textContent, '12 °C');
  c.disconnectedCallback(); assert.equal(newReleased, 1);
});

test('formats readings, bounds and marker tooltips using the HA locale', () => {
  const c = card(); c.setConfig({ ...config, min: -1.5, decimals: 2, entity_min: 'sensor.low' });
  c.hass = { ...states(12.5), locale: { language: 'de', number_format: 'language' } };
  assert.equal(el(c, 'percent').textContent, '12,50 °C');
  assert.equal(el(c, 'minval').textContent, '-1,5');
  c.hass = { ...states(12.5), locale: { language: 'en', number_format: 'decimal_comma' } };
  assert.equal(el(c, 'percent').textContent, '12,50 °C');
});
test('allows explicit locale and disabled localization', () => {
  const c = card(); c.setConfig({ ...config, locale: 'de-DE', decimals: 1 }); c.hass = states(12.5);
  assert.equal(el(c, 'percent').textContent, '12,5 °C');
  c.setConfig({ ...config, locale: 'de-DE', decimals: 1, localize: false });
  assert.equal(el(c, 'percent').textContent, '12.5 °C');
});
test('keyboard activation opens more-info only for Enter or Space', () => {
  const c = card(); c.setConfig(config); const surface = c.shadowRoot.lastChild;
  assert.equal(surface.attributes.role, 'button'); assert.equal(surface.attributes.tabindex, '0');
  for (const key of ['Enter', ' ']) {
    let prevented = false; surface.listeners.keydown({ key, preventDefault() { prevented = true; }, target: surface });
    assert.equal(c.shadowRoot.event.type, 'hass-more-info'); assert.equal(c.shadowRoot.event.detail.entityId, config.entity);
    assert.equal(prevented, true);
  }
});
test('visual editor emits config changes while preserving YAML-only options', () => {
  const editor = card('tempometer-gauge-card-editor');
  editor.setConfig({ ...config, severity: { green: 10, yellow: 20, red: 30 }, extra: 'keep' });
  editor.hass = states(12);
  const form = editor.shadowRoot.children.find(x => x.tagName === 'ha-form');
  assert.ok(form); assert.equal(form.hass.states['sensor.temperature'].state, 12);
  form.listeners['value-changed']({ stopPropagation() {}, detail: { value: { ...form.data, title: 'Edited', severity_green: 11, severity_yellow: 22, severity_red: 33 } } });
  assert.equal(editor.event.type, 'config-changed'); assert.equal(editor.event.detail.config.title, 'Edited');
  assert.equal(editor.event.detail.config.extra, 'keep');
  assert.equal(editor.event.detail.config.severity.green, 11);
  assert.equal(editor.event.detail.config.severity_green, undefined);
});

test('uses HA comma_decimal, quote_decimal and none preferences correctly', () => {
  const c = card(); c.setConfig({ ...config, decimals: 2 });
  for (const [number_format, expected] of [['comma_decimal', '1,234.50 °C'], ['quote_decimal', '1’234.50 °C'], ['none', '1234.50 °C']]) {
    c.hass = { ...states(1234.5), locale: { language: 'de', number_format } };
    if (number_format === 'quote_decimal') assert.match(el(c, 'percent').textContent, /^1['’]234\.50 °C$/);
    else assert.equal(el(c, 'percent').textContent, expected);
  }
});
