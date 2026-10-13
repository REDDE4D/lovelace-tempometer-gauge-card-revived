console.info(`%c TEMPOMETER-CARD \n%c      v2.2.0`, 'color: orange; font-weight: bold; background: black', 'color: white; font-weight: bold; background: dimgray');

class TempometerGaugeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const event = new CustomEvent('context-request', {
      bubbles: true, composed: true, cancelable: true,
    });
    event.context = 'states';
    event.subscribe = true;
    event.callback = (states, unsubscribe) => {
      if (this._unsubscribe && this._unsubscribe !== unsubscribe) {
        this._unsubscribe();
      }
      this._unsubscribe = unsubscribe;
      this._states = states;
      this._renderStates(states);
    };
    this.dispatchEvent(event);
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
  }

  static getConfigElement() {
    return document.createElement('tempometer-gauge-card-editor');
  }

  static getStubConfig() {
    return {
      entity: 'sensor.temperature',
      min: 0,
      max: 100,
      title: 'Temperature',
      card_style: 'thermometer',
    };
  }

  setConfig(config) {
    if (!config || typeof config.entity !== 'string' || !config.entity.trim()) {
      throw new Error('Please define an entity');
    }
    if (config.max == null) {
      throw new Error('Please define the max config option');
    }
    if (config.min == null) {
      throw new Error('Please define the min config option');
    }

    if (typeof config.min !== 'number' || typeof config.max !== 'number' ||
        !Number.isFinite(config.min) || !Number.isFinite(config.max) || config.max <= config.min) {
      throw new Error('min and max must be finite numbers, with max greater than min');
    }
    if (config.decimals !== undefined &&
        (!Number.isInteger(config.decimals) || config.decimals < 0 || config.decimals > 20)) {
      throw new Error('decimals must be an integer between 0 and 20');
    }
    for (const key of ['entity_min', 'entity_max']) {
      if (config[key] != null && (typeof config[key] !== 'string' || !config[key].trim())) {
        throw new Error(`${key} must be an entity ID`);
      }
    }
    if (config.severity != null &&
        (!['green', 'yellow', 'red'].every(key => Number.isFinite(config.severity[key])) ||
         Object.keys(config.severity).some(key => !['green', 'yellow', 'red', 'max'].includes(key)) ||
         (config.severity.max !== undefined && !Number.isFinite(config.severity.max)))) {
      throw new Error('severity requires finite green, yellow and red thresholds and an optional max');
    }

    for (const key of ['responsive', 'localize', 'animation']) {
      if (config[key] !== undefined && typeof config[key] !== 'boolean') {
        throw new Error(`${key} must be a boolean`);
      }
    }
    if (config.locale !== undefined) {
      try { new Intl.NumberFormat(config.locale); }
      catch { throw new Error('locale must be a valid language tag, e.g. de-DE'); }
    }
    const root = this.shadowRoot;
    if (root.lastChild) root.removeChild(root.lastChild);

    const cardConfig = Object.assign({}, config);
    if (!cardConfig.scale) cardConfig.scale = "50px";

    if (config.horizontal) {
      cardConfig.scale = "40px";
    }

    const entityParts = this._splitEntityAndAttribute(cardConfig.entity);
    cardConfig.entity = entityParts.entity;
    if (entityParts.attribute) cardConfig.attribute = entityParts.attribute;

    if (cardConfig.entity_min != null) {
      const entityMinParts = this._splitEntityAndAttribute(cardConfig.entity_min);
      cardConfig.entity_min = entityMinParts.entity;
      if (entityMinParts.attribute) cardConfig.minAttribute = entityMinParts.attribute;
    }

    if (cardConfig.entity_max != null) {
      const entityMaxParts = this._splitEntityAndAttribute(cardConfig.entity_max);
      cardConfig.entity_max = entityMaxParts.entity;
      if (entityMaxParts.attribute) cardConfig.maxAttribute = entityMaxParts.attribute;
    }

    const icon_color = this._sanitizeCSSValue(config.icon_color) || "var(--state-icon-color, var(--paper-item-icon-color, #44739e))";
    const sanitizedScale = this._sanitizeCSSValue(cardConfig.scale) || "50px";

    const baseUnit = cardConfig.responsive === false ? sanitizedScale : `min(${sanitizedScale}, max(1px, calc((100cqw - 24px) / 4)))`;
    let card_style = cardConfig.card_style;
    const card = document.createElement('ha-card');
    const content = document.createElement('div');
    const style = document.createElement('style');

    style.textContent = `
      :host { display: block; container-type: inline-size; }
      ha-card {
        --base-unit: ${baseUnit};
        height: max(184px, calc(${sanitizedScale} * 3.5));
        cursor: pointer;
        position: relative;
      }
      .container{
        width: calc(var(--base-unit) * 4);
        height: calc(var(--base-unit) * 2.44);
        position: absolute;
        top: calc(var(--base-unit)*2.1);
        left: 50%;
        overflow: hidden;
        text-align: center;
        transform: translate(-50%, -50%);
      }
      .gauge-a{
        z-index: 1;
        position: absolute;
        background-color: var(--secondary-background-color);
        width: calc(var(--base-unit) * 4);
        height: calc(var(--base-unit) * 2);
        top: 0%;
        border-radius:calc(var(--base-unit) * 2.5) calc(var(--base-unit) * 2.5) 0px 0px ;
      }
      .gauge-b{
        z-index: 3;
        position: absolute;
        background-color: var(--card-background-color);
        width: calc(var(--base-unit) * 3.6);
        height: calc(var(--base-unit) * 2);
        top: calc(var(--base-unit) * 0.2);
        margin-left: calc(var(--base-unit) * 0.2);
        margin-right: auto;
        border-radius: calc(var(--base-unit) * 3.6) calc(var(--base-unit) * 3.6) 0px 0px ;
      }
      .gauge-c{
        z-index: 2;
        position: absolute;
        background-color: var(--warning-color, var(--label-badge-yellow, #ff9800));
        width: calc(var(--base-unit) * 4);
        height: calc(var(--base-unit) * 2);
        top: calc(var(--base-unit) * 2);
        margin-left: auto;
        margin-right: auto;
        border-radius: 0px 0px calc(var(--base-unit) * 2) calc(var(--base-unit) * 2) ;
        transform-origin: center top;
        transition: ${cardConfig.animation === false ? 'none' : 'transform 1.3s ease-in-out, background-color 0.3s ease'};
      }
      .gauge-data{
        z-index: 4;
        color: var(--primary-text-color);
        line-height: calc(var(--base-unit) * 0.3);
        position: absolute;
        width: calc(var(--base-unit) * 4);
        height: calc(var(--base-unit) * 2.1);
        top: calc(var(--base-unit) * 1);
        margin-left: auto;
        margin-right: auto;
        font-variant-numeric: tabular-nums;
      }
      .gauge-data #percent{
        font-size: calc(var(--base-unit) * 0.55);
        line-height: calc(var(--base-unit) * 0.6);
      }
      .gauge-data #title{
        padding-top: calc(var(--base-unit) * 0.03);
        font-size: calc(var(--base-unit) * 0.30);
        line-height: calc(var(--base-unit) * 0.35);
      }
      .gauge-icons{
        width: calc(var(--base-unit) * 4);
        height: calc(var(--base-unit) * 2.5);
        text-align: center;
        margin: 0 auto;
        padding-top: calc(var(--base-unit)*0.15);
      }
      .icon1{
        width: 18px;
        height: 18px;
        color: ${icon_color};
        float: left;
        padding-top: calc(var(--base-unit) * 0.96);
      }
      .icon2{
        width: 18px;
        height: 18px;
        color: ${icon_color};
        padding-top: calc(var(--base-unit) * 0.16);
        padding-right: 9px;
      }
      .icon3{
        width: 18px;
        height: 18px;
        color: ${icon_color};
        float: right;
        padding-top: calc(var(--base-unit) * 0.96);
      }
      .gauge-footer{
        position: absolute;
        width: calc(var(--base-unit) *4);
        height: calc(var(--base-unit) *.75);
        top: calc(var(--base-unit) *2);
        z-index: 4;
        font-size: calc(var(--base-unit) * 0.30);
        font-weight: 400;
        padding-top: .25em;
        background: var(--card-background-color);
      }
      .gauge-footer .minval{
        float: left;
        color: var(--secondary-text-color, #727272);
        padding-left: .5em;
      }
      .gauge-footer .maxval{
        float: right;
        color: var(--secondary-text-color, #727272);
        padding-right: .25em;
      }
      .gauge-c hr {
        visibility: hidden;
      }
      .gauge-d, .gauge-e {
        z-index: 5;
        position: absolute;
        width: calc(var(--base-unit) * 4);
        height: 0;
        top: calc(var(--base-unit) * 2);
        left: 0;
        transform-origin: center top;
        transition: ${cardConfig.animation === false ? 'none' : 'transform 1.3s ease-in-out'};
      }
      .gauge-e { z-index: 6; }
      .gauge-d svg, .gauge-e svg {
        --marker-size: clamp(16px, calc(var(--base-unit) * 0.44), 24px);
        position: absolute;
        display: block;
        width: var(--marker-size);
        height: var(--marker-size);
        left: calc(var(--base-unit) * 0.1 - var(--marker-size) / 12);
        top: calc(var(--marker-size) / -2);
        overflow: visible;
        filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.55));
      }
      ha-card:focus-visible {
        outline: 2px solid var(--primary-color, #03a9f4);
        outline-offset: 2px;
      }
      #percent, #title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      @media (prefers-reduced-motion: reduce) {
        .gauge-c, .gauge-d, .gauge-e { transition: none; }
      }
    `;

    // Build DOM safely instead of using innerHTML with interpolated config values
    this._buildCardDOM(content, cardConfig);

    card.appendChild(content);
    card.appendChild(style);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', cardConfig.title || cardConfig.entity);
    const activate = () => this._fire('hass-more-info', { entityId: cardConfig.entity });
    card.addEventListener('click', activate);
    card.addEventListener('keydown', event => {
      if (event.target === card && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        activate();
      }
    });
    root.appendChild(card);
    this._config = cardConfig;

    if (card_style == "thermometer") {
      root.getElementById("gauge-icons-baro").style.display = 'none';
      root.getElementById("gauge-icons-water").style.display = 'none';
      root.getElementById("gauge-icons-thermo").style.display = 'block';
      root.getElementById("gauge-icons").style.display = 'none';
    } else if (card_style == "humidity") {
      root.getElementById("gauge-icons-baro").style.display = 'none';
      root.getElementById("gauge-icons-water").style.display = 'block';
      root.getElementById("gauge-icons-thermo").style.display = 'none';
      root.getElementById("gauge-icons").style.display = 'none';
    } else if (card_style == "custom") {
      root.getElementById("gauge-icons-baro").style.display = 'none';
      root.getElementById("gauge-icons-water").style.display = 'none';
      root.getElementById("gauge-icons-thermo").style.display = 'none';
      root.getElementById("gauge-icons").style.display = 'block';
    }
    if (this._states) this._renderStates(this._states);
  }

  _sanitizeCSSValue(value) {
    if (value == null) return null;
    const str = String(value);
    // Strip characters that could break out of CSS value context
    if (/[{}<>;"']/.test(str) || /expression\s*\(/i.test(str) || /url\s*\(/i.test(str)) {
      return null;
    }
    return str;
  }

  _buildCardDOM(container, cardConfig) {
    // Custom icons section
    const customIcons = this._createIconSection('gauge-icons', [
      { cls: 'icon1', icon: cardConfig.icon1 || '' },
      { cls: 'icon2', icon: cardConfig.icon2 || '' },
      { cls: 'icon3', icon: cardConfig.icon3 || '' },
    ]);
    customIcons.style.display = 'none';
    container.appendChild(customIcons);

    // Barometer icons
    const baroIcons = this._createIconSection('gauge-icons-baro', [
      { cls: 'icon1', icon: 'mdi:weather-pouring' },
      { cls: 'icon2', icon: 'mdi:weather-partly-cloudy' },
      { cls: 'icon3', icon: 'mdi:weather-sunny' },
    ]);
    container.appendChild(baroIcons);

    // Thermometer icons
    const thermoIcons = this._createIconSection('gauge-icons-thermo', [
      { cls: 'icon1', icon: 'mdi:thermometer-low' },
      { cls: 'icon2', icon: 'mdi:thermometer' },
      { cls: 'icon3', icon: 'mdi:thermometer-high' },
    ]);
    thermoIcons.style.display = 'none';
    container.appendChild(thermoIcons);

    // Water/humidity icons
    const waterIcons = this._createIconSection('gauge-icons-water', [
      { cls: 'icon1', icon: 'mdi:water-off' },
      { cls: 'icon2', icon: 'mdi:water-percent' },
      { cls: 'icon3', icon: 'mdi:water' },
    ]);
    waterIcons.style.display = 'none';
    container.appendChild(waterIcons);

    // Main gauge container
    const gaugeContainer = document.createElement('div');
    gaugeContainer.className = 'container';

    gaugeContainer.appendChild(this._createElement('div', { className: 'gauge-a' }));
    gaugeContainer.appendChild(this._createElement('div', { className: 'gauge-b' }));
    gaugeContainer.appendChild(this._createElement('div', { className: 'gauge-c', id: 'gauge' }));

    // Min marker with SVG
    const recentMin = this._createElement('div', { className: 'gauge-d', id: 'recentMin' });
    recentMin.appendChild(this._createMarkerSVG('svg_min', 'svg_min_title', 'var(--info-color, var(--label-badge-blue, #039be5))', 'M2,12 L20,3 L20,21 Z'));
    gaugeContainer.appendChild(recentMin);

    // Max marker with SVG
    const recentMax = this._createElement('div', { className: 'gauge-e', id: 'recentMax' });
    recentMax.appendChild(this._createMarkerSVG('svg_max', 'svg_max_title', 'var(--error-color, var(--label-badge-red, #db4437))', 'M2,12 L20,3 L20,21 Z'));
    gaugeContainer.appendChild(recentMax);

    // Gauge data
    const gaugeData = this._createElement('div', { className: 'gauge-data' });
    gaugeData.appendChild(this._createElement('div', { id: 'percent' }));
    gaugeData.appendChild(this._createElement('div', { id: 'title' }));
    gaugeContainer.appendChild(gaugeData);

    // Footer with min/max labels
    const footer = this._createElement('div', { className: 'gauge-footer' });
    const minSpan = this._createElement('span', { id: 'minval', className: 'minval' });
    const maxSpan = this._createElement('span', { id: 'maxval', className: 'maxval' });
    footer.appendChild(minSpan);
    footer.appendChild(maxSpan);
    gaugeContainer.appendChild(footer);

    container.appendChild(gaugeContainer);
  }

  _createElement(tag, props) {
    const el = document.createElement(tag);
    if (props) {
      if (props.className) el.className = props.className;
      if (props.id) el.id = props.id;
    }
    return el;
  }

  _createIconSection(id, icons) {
    const div = document.createElement('div');
    div.id = id;
    div.className = 'gauge-icons';
    for (const iconDef of icons) {
      const haIcon = document.createElement('ha-icon');
      haIcon.className = iconDef.cls;
      haIcon.setAttribute('icon', iconDef.icon);
      div.appendChild(haIcon);
    }
    return div;
  }

  _createMarkerSVG(svgId, titleId, color, pathD) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.id = svgId;
    svg.setAttribute('viewBox', '0 0 24 24');


    const title = document.createElementNS(svgNS, 'title');
    title.id = titleId;
    svg.appendChild(title);

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('fill', color);
    path.setAttribute('d', pathD);
    path.setAttribute('stroke', 'var(--card-background-color, #fff)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('paint-order', 'stroke fill');
    svg.appendChild(path);

    return svg;
  }

  _splitEntityAndAttribute(entity) {
    let parts = entity.split('.');
    if (parts.length < 3) {
      return { entity: entity };
    }

    return { attribute: parts.pop(), entity: parts.join('.') };
  }

  _fire(type, detail, options) {
    const node = this.shadowRoot;
    options = options || {};
    detail = (detail === null || detail === undefined) ? {} : detail;
    const event = new CustomEvent(type, {
      bubbles: options.bubbles === undefined ? true : options.bubbles,
      cancelable: Boolean(options.cancelable),
      composed: options.composed === undefined ? true : options.composed,
      detail: detail,
    });
    node.dispatchEvent(event);
    return event;
  }

  _translateTurn(value, config) {
    return 5 * Math.max(0, Math.min(1, (value - config.min) / (config.max - config.min)));
  }

  _computeSeverity(stateValue, sections) {
    let numberValue = Number(stateValue);
    const severityMap = {
      red: "var(--error-color, var(--label-badge-red, #db4437))",
      green: "var(--success-color, var(--label-badge-green, #43a047))",
      yellow: "var(--warning-color, var(--label-badge-yellow, #ff9800))",
      normal: "var(--info-color, var(--label-badge-blue, #039be5))",
    };
    if (!sections) return severityMap["normal"];
    let sortable = [];
    for (const severity of Object.keys(sections)) {
      sortable.push([severity, sections[severity]]);
    }
    sortable.sort((a, b) => { return a[1] - b[1] });
    if (numberValue >= sortable[0][1] && numberValue < sortable[1][1]) {
      return severityMap[sortable[0][0]];
    }
    if (numberValue >= sortable[1][1] && numberValue < sortable[2][1]) {
      return severityMap[sortable[1][0]];
    }
    if (sortable.length === 4) {
      if (numberValue >= sortable[2][1] && numberValue < sortable[3][1]) {
        return severityMap[sortable[2][0]];
      }
      if (numberValue > sortable[3][1]) {
        return severityMap["normal"]
      }
    } else {
      if (numberValue >= sortable[2][1]) {
        return severityMap[sortable[2][0]];
      }
    }
    return severityMap["normal"];
  }

  _getEntityStateValue(entity, attribute) {
    if (!attribute) {
      return entity.state;
    }

    return entity.attributes[attribute];
  }

  // Keep the legacy hass setter for dashboards that do not provide data contexts.
  set hass(hass) {
    this._locale = hass?.locale;
    this._language = hass?.language;
    this._states = hass?.states || {};
    this._renderStates(this._states);
  }

  _formatNumber(value, decimals) {
    const options = decimals === undefined ? { maximumFractionDigits: 20 } : {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    };
    if (this._config.localize === false || (!this._config.locale && this._locale?.number_format === 'none')) {
      return decimals === undefined ? String(value) : value.toFixed(decimals);
    }
    const formats = { comma_decimal: 'en-US', decimal_comma: 'de-DE', space_comma: 'fr-FR', quote_decimal: 'de-CH' };
    const locale = this._config.locale || (this._locale?.number_format === 'system' ? undefined : formats[this._locale?.number_format] || this._locale?.language || this._language || 'en-US');
    try { return new Intl.NumberFormat(locale, options).format(value); }
    catch { return new Intl.NumberFormat('en-US', options).format(value); }
  }

  _numericValue(value) {
    if (value == null || typeof value === 'boolean' ||
        (typeof value !== 'string' && typeof value !== 'number') ||
        (typeof value === 'string' && !value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  _renderStates(states) {
    const config = this._config;
    if (!config) return;
    const root = this.shadowRoot;
    const entity = states?.[config.entity];
    const raw = entity ? this._getEntityStateValue(entity, config.attribute) : 'unavailable';
    const value = this._numericValue(raw);
    const measurement = config.measurement ?? entity?.attributes?.unit_of_measurement ?? '';
    const label = value === null
      ? (raw === 'unknown' ? 'unknown' : 'unavailable')
      : `${this._formatNumber(value, config.decimals)}${measurement ? ` ${measurement}` : ''}`;
    root.getElementById('percent').textContent = label;
    root.lastChild.setAttribute('aria-label', `${config.title || entity?.attributes?.friendly_name || config.entity}: ${label}`);
    root.getElementById('title').textContent = config.title ?? '';
    root.getElementById('minval').textContent = this._formatNumber(config.min);
    root.getElementById('maxval').textContent = this._formatNumber(config.max);
    const gauge = root.getElementById('gauge');
    gauge.style.visibility = value === null ? 'hidden' : 'visible';
    if (value !== null) {
      gauge.style.transform = `rotate(${this._translateTurn(value, config) / 10}turn)`;
      gauge.style.backgroundColor = this._computeSeverity(value, config.severity);
    }
    for (const bound of ['min', 'max']) {
      const marker = root.getElementById(bound === 'min' ? 'recentMin' : 'recentMax');
      const boundEntity = states?.[config[`entity_${bound}`]];
      const boundRaw = boundEntity
        ? this._getEntityStateValue(boundEntity, config[`${bound}Attribute`]) : null;
      const boundValue = this._numericValue(boundRaw);
      marker.style.display = value === null || boundValue === null ? 'none' : 'block';
      root.getElementById(`svg_${bound}_title`).textContent = boundValue === null ? '' : `${this._formatNumber(boundValue, config.decimals)}${measurement ? ` ${measurement}` : ''}`;
      if (boundValue !== null) {
        marker.style.transform = `rotate(${this._translateTurn(boundValue, config) / 10}turn)`;
      }
    }
  }

  getCardSize() {
    const scale = this._config?.scale || '50px';
    if (/^\d+(\.\d+)?px$/.test(scale)) {
      return Math.ceil(Math.max(184, parseFloat(scale) * 3.5) / 50);
    }
    return 4;
  }

  getGridOptions() {
    return {
      columns: 6,
      rows: 3,
      min_columns: 4,
      min_rows: 3,
    };
  }
}

// ha-form supplies the native HA selectors; the dashboard supplies the live preview.
class TempometerGaugeCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._form = document.createElement('ha-form');
    this._form.computeLabel = schema => ({
      entity: 'Entity (use YAML for attributes)', entity_min: 'Minimum entity', entity_max: 'Maximum entity',
      title: 'Title', min: 'Scale minimum', max: 'Scale maximum', card_style: 'Style',
      measurement: 'Unit override', decimals: 'Decimal places', scale: 'Scale (e.g. 50px)',
      responsive: 'Fit narrow cards', localize: 'Localized numbers', locale: 'Locale override (e.g. de-DE)',
      animation: 'Animate gauge', icon1: 'Left icon', icon2: 'Center icon', icon3: 'Right icon',
      icon_color: 'Icon color (CSS)', severity_green: 'Green threshold', severity_yellow: 'Yellow threshold',
      severity_red: 'Red threshold', severity_max: 'Severity upper limit',
    })[schema.name] || schema.name;
    const field = (name, selector, required = false) => ({ name, selector, required });
    this._form.schema = [
      field('entity', { entity: {} }, true), field('title', { text: {} }),
      field('min', { number: { mode: 'box', step: 'any' } }, true), field('max', { number: { mode: 'box', step: 'any' } }, true),
      field('card_style', { select: { options: ['barometer', 'thermometer', 'humidity', 'custom'], mode: 'dropdown' } }),
      field('entity_min', { entity: {} }), field('entity_max', { entity: {} }),
      field('measurement', { text: {} }), field('decimals', { number: { min: 0, max: 20, step: 1, mode: 'box' } }),
      field('scale', { text: {} }), field('responsive', { boolean: {} }),
      field('localize', { boolean: {} }), field('locale', { text: {} }), field('animation', { boolean: {} }),
      ...['icon1', 'icon2', 'icon3'].map(name => field(name, { icon: {} })),
      field('icon_color', { text: {} }),
      ...['green', 'yellow', 'red', 'max'].map(name => field(`severity_${name}`, { number: { mode: 'box', step: 'any' } })),
    ];
    this._form.addEventListener('value-changed', event => {
      event.stopPropagation();
      const next = { ...this._config, ...event.detail.value };
      const severity = {};
      for (const key of ['green', 'yellow', 'red', 'max']) {
        const value = next[`severity_${key}`];
        if (value !== undefined && value !== null && value !== '') severity[key] = value;
        delete next[`severity_${key}`];
      }
      if (Object.keys(severity).length) next.severity = severity;
      else delete next.severity;
      for (const key of ['entity_min', 'entity_max', 'decimals', 'locale', 'scale', 'icon_color']) {
        if (next[key] === '' || next[key] == null) delete next[key];
      }
      this._config = next;
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: next }, bubbles: true, composed: true,
      }));
    });
    this.shadowRoot.appendChild(this._form);
  }

  setConfig(config) {
    this._config = { ...config };
    this._form.data = {
      responsive: true, localize: true, animation: true, card_style: 'barometer', ...config,
      ...Object.fromEntries(['green', 'yellow', 'red', 'max'].map(key => [`severity_${key}`, config.severity?.[key]])),
    };
  }

  set hass(hass) { this._form.hass = hass; }
}

if (!customElements.get('tempometer-gauge-card-editor')) {
  customElements.define('tempometer-gauge-card-editor', TempometerGaugeCardEditor);
}

// Guard against duplicate registration (scoped custom element registry in HA 2025+)
if (!customElements.get('tempometer-gauge-card')) {
  customElements.define('tempometer-gauge-card', TempometerGaugeCard);
}

// Register with Home Assistant card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'tempometer-gauge-card',
  name: 'Tempometer Gauge Card',
  description: 'A gauge card for barometer, thermometer, humidity or custom sensors',
});
