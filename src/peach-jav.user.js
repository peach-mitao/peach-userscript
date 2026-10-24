// ==UserScript==
// @name         Peach · JAV 入库
// @namespace    https://github.com/peach-mitao/peach-userscript
// @source       https://github.com/peach-mitao/peach-userscript
// @supportURL   https://github.com/peach-mitao/peach-userscript/issues
// @homepageURL  https://github.com/peach-mitao/peach-userscript
// @license      AGPL-3.0-or-later
// @version      0.5.0
// @description  在 JAV 作品详情页识别或选中番号，交给 Peach 下载入库。
// __PEACH_JAV_MATCHES__
// @match        https://*/integrations/peach-userscript-bridge
// @match        http://localhost/integrations/peach-userscript-bridge
// @match        http://127.0.0.1/integrations/peach-userscript-bridge
// @include      /^http:\/\/\[::1\](?::\d+)?\/integrations\/peach-userscript-bridge$/
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        window.onurlchange
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  /* Settings icon: lucide-static 1.57.0, ISC License.
   * Copyright (c) 2026 Lucide Icons and Contributors
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   */

  const SITE_RULES = __PEACH_JAV_SITES__;
  const STORAGE_BASE = 'peach.jav.base';
  const STORAGE_TOKEN = 'peach.jav.token';
  const ROOT_ID = 'peach-jav-action';
  const SCRIPT_VERSION = __PEACH_JAV_VERSION__;
  if (location.pathname === '/integrations/peach-userscript-bridge') {
    let origin;
    try { origin = settings(location.origin, 'bridge-only').base; } catch { return; }
    if (window.parent === window || !document.querySelector('meta[name="peach-userscript-bridge"][content="1"]')) return;
    addEventListener('message', event => {
      if (event.source !== window.parent || event.origin !== origin || event.data?.type !== 'peach-userscript:probe'
        || typeof event.data.nonce !== 'string' || !/^[a-f0-9-]{36}$/.test(event.data.nonce)) return;
      window.parent.postMessage({ type: 'peach-userscript:ready', protocol: 1, nonce: event.data.nonce,
        version: SCRIPT_VERSION, paired: configuration()?.base === origin }, origin);
    });
    return;
  }
  if (window.top !== window.self) return;
  if (globalThis.__peachJavUserscriptActive) return;
  globalThis.__peachJavUserscriptActive = true;
  const ACTIVE = new Set(['queued', 'searching', 'submitted']);
  const STATES = new Set([...ACTIVE, 'ingested', 'owned', 'failed', 'no_match', 'idle']);
  const LABELS = {
    queued: '已排队', searching: '正在搜磁力', submitted: '云下载中',
    ingested: '已加入 Peach 馆藏', owned: '馆藏已有该番号影片', failed: '任务失败', no_match: '未找到资源', idle: '可以加入 Peach 馆藏',
  };
  const attempts = new Set();
  let generation = 0;
  let current = null;
  let pageKey = '';
  let refreshTimer;
  let selected = null;
  let settingsView = null;

  // Peach 控件快照：来源与适配范围见 docs/REUSE.md。
  const UI_STYLE = `
    :host{all:initial;--ground:#fff;--surface:#fafafa;--sunk:#f2f2f2;--ink:#171717;--ink-2:#4d4d4d;--muted:#666;
      --line:#e5e5e5;--line-soft:#ebebeb;--field-ring:#00000014;--field-ring-hover:#00000036;--field-ring-focus:#00000057;
      --tungsten:#2563eb;--drop:#da2f35;--control-radius:6px;--surface-radius:8px;--floating-radius:12px;--control-h:38px;
      --fs-sm:13px;--fs-md:14px;--fs-lg:16px;--fs-xl:20px;--fieldset-bar-h:52px;
      position:fixed;inset:auto max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) auto;
      z-index:2147483647;width:min(320px,calc(100vw - 32px));font:400 14px/1.5 system-ui,sans-serif;color:var(--ink);color-scheme:light dark;text-align:left}
    @media(prefers-color-scheme:dark){:host{--ground:#080a0d;--surface:#0c0f14;--sunk:#0b0d11;--ink:#fff;--ink-2:#c9cdd4;--muted:#9aa0a8;
      --line:#ffffff1a;--line-soft:#ffffff26;--field-ring:#ffffff26;--field-ring-hover:#ffffff42;--field-ring-focus:#ffffff66}}
    *,*::before,*::after{box-sizing:border-box} [hidden]{display:none!important}
    h2,p{margin:0} h2{font-size:var(--fs-xl);line-height:26px;font-weight:600}
    .panel{background:var(--ground);border:1px solid var(--line);border-radius:var(--floating-radius);overflow:hidden}
    .bar{min-height:var(--fieldset-bar-h);padding:8px 16px 8px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .bar strong{font-weight:500;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
    .body{padding:0 20px 20px;display:grid;gap:16px;min-width:0}.footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-height:var(--fieldset-bar-h);padding:8px 16px;border-top:1px solid var(--line);background:var(--surface)}
    .geist-button{height:var(--control-h);padding:0 14px;border:0;border-radius:var(--control-radius);background:var(--ground);color:var(--ink);display:inline-flex;
      align-items:center;justify-content:center;gap:6px;font:inherit;font-size:var(--fs-md);font-weight:500;line-height:1;white-space:nowrap;cursor:pointer;box-shadow:0 0 0 1px var(--line-soft);touch-action:manipulation}
    .geist-button.primary{background:var(--ink);color:var(--ground);box-shadow:none}
    .geist-button.icon{padding:0;width:var(--control-h);flex:none;background:transparent;box-shadow:none}
    .geist-button svg{width:16px;height:16px;flex:none;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .geist-button:focus-visible{outline:2px solid var(--tungsten);outline-offset:2px}
    @media(hover:hover) and (pointer:fine){.geist-button:hover{background:color-mix(in srgb,var(--ink) 8%,var(--ground))}
      .geist-button.primary:hover{background:color-mix(in srgb,var(--ink) 88%,var(--ground));color:var(--ground)}}
    .geist-button:disabled,.geist-button[aria-disabled=true]{background:var(--surface);color:var(--muted);box-shadow:0 0 0 1px var(--line-soft);cursor:default}
    .geist-button[aria-busy=true]{cursor:wait}.ui-geist-spinner{position:relative;display:inline-block;flex:none;width:16px;height:16px;color:currentColor}
    .ui-geist-spinner>i{position:absolute;top:1px;left:7px;width:2px;height:4px;border-radius:999px;background:currentColor;transform-origin:1px 7px;transform:rotate(var(--spinner-angle));animation:geist-spinner-opacity 1s linear var(--spinner-delay) infinite}
    @keyframes geist-spinner-opacity{0%{opacity:1}100%{opacity:.15}}
    .geist-input{width:100%;min-width:0;height:var(--control-h);border:1px solid var(--field-ring);border-radius:var(--control-radius);
      background:var(--ground);color:var(--ink);padding:0 12px;font:inherit;font-size:var(--fs-md);line-height:20px}
    .geist-input::placeholder{color:var(--muted)}.geist-input:hover{box-shadow:inset 0 0 0 2px var(--field-ring-hover)}
    .geist-input:focus{outline:0;box-shadow:inset 0 0 0 2px var(--field-ring-focus)}.geist-input[aria-invalid=true]{border-color:var(--drop)}
    .field{display:grid;gap:8px;min-width:0}.field label{font-weight:500}.hint{font-size:var(--fs-sm);color:var(--muted);overflow-wrap:anywhere}
    .secret{display:flex;align-items:center;gap:8px}.secret .geist-button{flex:none}
    .geist-note{font-size:var(--fs-sm);line-height:20px;color:var(--ink-2);overflow-wrap:anywhere}
    .geist-note[data-variant=error]{color:var(--drop)}
    dialog{position:fixed;inset:auto max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) auto;margin:0;
      width:min(400px,calc(100vw - 32px));max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);padding:0;
      background:var(--ground);color:var(--ink);border:1px solid var(--line);border-radius:var(--floating-radius);overflow:hidden}
    dialog::backdrop{background:#000b}form{display:flex;flex-direction:column;max-height:calc(100dvh - 34px)}
    dialog .bar{border-bottom:1px solid var(--line);flex:none}dialog .body{padding-top:20px;overflow:auto;overscroll-behavior:contain}dialog .footer{flex:none}
    @media(max-width:760px){.geist-input{font-size:var(--fs-lg)}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
  `;

  function element(tag, className = '', text = '') {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  function control(label, { primary = false, icon = '' } = {}) {
    const node = element('button', `geist-button${primary ? ' primary' : ''}${icon ? ' icon' : ''}`, icon ? '' : label);
    node.type = 'button';
    if (icon) {
      node.setAttribute('aria-label', label);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', icon === 'close' ? 'M6 6l12 12M6 18L18 6'
        : 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915');
      svg.append(path);
      if (icon === 'settings') {
        const circle = document.createElementNS(svg.namespaceURI, 'circle');
        for (const [name, value] of Object.entries({ cx: '12', cy: '12', r: '3' })) circle.setAttribute(name, value);
        svg.append(circle);
      }
      node.append(svg);
    }
    return node;
  }

  function surface(id, label) {
    const root = element('aside');
    root.id = id;
    root.setAttribute('aria-label', label);
    const shadow = root.attachShadow({ mode: 'open' });
    shadow.append(element('style', '', UI_STYLE));
    document.body.append(root);
    return { root, shadow };
  }

  function showNotice(message) {
    document.getElementById('peach-jav-notice')?.remove();
    const { root, shadow } = surface('peach-jav-notice', 'Peach 提示');
    const panel = element('section', 'panel');
    const bar = element('div', 'bar');
    const dismiss = control('关闭 Peach 提示', { icon: 'close' });
    dismiss.addEventListener('click', () => root.remove());
    bar.append(element('strong', '', 'Peach'), dismiss);
    const body = element('div', 'body');
    const note = element('p', 'geist-note');
    note.setAttribute('role', 'status');
    body.append(note);
    panel.append(bar, body);
    shadow.append(panel);
    note.textContent = message;
  }

  // 只做粗提取；合法番号由 Peach 校验。
  function candidates(value) {
    const found = new Set();
    const bounded = String(value || '').slice(0, 800).toUpperCase();
    let rest = bounded.replace(/\bFC2(?:[-_ ]?PPV)?[-_ ]?(\d{4,9})\b/g, (_, digits) => {
      found.add(`FC2-PPV-${digits}`);
      return ' ';
    });
    rest = rest.replace(/\b([NK])(\d{4})\b/g, (_, prefix, digits) => {
      found.add(prefix.toLowerCase() + digits);
      return ' ';
    });
    rest = rest.replace(/\b(MKB?D)-S(\d{2,4})(?=$|[^A-Z0-9])/g, (_, prefix, digits) => {
      found.add(`${prefix}-S${digits}`);
      return ' ';
    });
    for (const match of rest.matchAll(/\b((?:\d{1,5})?[A-Z]{2,12})[-_]?(\d{1,8})([A-Z]{0,2})(?=$|[^A-Z0-9])/g)) {
      found.add(`${match[1]}-${match[2]}${match[3]}`);
    }
    for (const match of rest.matchAll(/\b\d{6}[-_]\d{2,4}\b/g)) found.add(match[0]);
    return found;
  }

  function comparisonKey(code) {
    if (code.startsWith('FC2-PPV-')) return code;
    return code.toUpperCase().replace(/^((?:\d+)?[A-Z]+)-0*(\d+)([A-Z]{0,2})$/, '$1-$2$3');
  }

  function siteFor(url) {
    if (url.protocol !== 'https:') return null;
    return SITE_RULES.sites.find(site => site.domains.some(domain =>
      url.hostname === domain || url.hostname.endsWith(`.${domain}`))) || null;
  }

  function sourcePage(url, site) {
    const source = new URL(url.origin + url.pathname);
    for (const key of site.query_keys || []) {
      const values = url.searchParams.getAll(key);
      if (values.length === 1 && /^[A-Za-z0-9_-]{1,100}$/.test(values[0])) {
        source.searchParams.set(key, values[0]);
      }
    }
    return source.href;
  }

  function fieldText(field) {
    if (field.hasAttribute('data-video-code')) return field.getAttribute('data-video-code');
    if (field.id === '__NEXT_DATA__') {
      const raw = field.textContent || '';
      if (raw.length > 1_000_000) return '';
      try {
        const props = JSON.parse(raw).props?.pageProps;
        const work = props?.work || (props?.works?.length === 1 ? props.works[0] : null);
        return String(work?.work_id || '');
      } catch { return ''; }
    }
    const text = (field.textContent || '').slice(0, 800);
    if (field.matches('th, dt, strong, b, .header, p')) {
      const label = text.trim().split(/[:：]/, 1)[0].trim().toLowerCase();
      const labelled = ['番号', '番號', '品番', 'メーカー品番', '識別碼', '识别码', 'id', 'code'].includes(label)
        || /^(メーカー品番|番号|番號|品番|識別碼|识别码|ID|Code)\s*[:：]/i.test(text.trim());
      if (!labelled) return '';
      if (field.tagName === 'TH') return field.nextElementSibling?.tagName === 'TD' ? field.nextElementSibling.textContent : '';
      if (field.tagName === 'DT') return field.nextElementSibling?.tagName === 'DD' ? field.nextElementSibling.textContent : '';
      if (field.tagName === 'P') return text;
      let value = text;
      let next = field.nextSibling;
      for (let index = 0; next && index < 4; index++, next = next.nextSibling) {
        if (next.nodeType === Node.ELEMENT_NODE && next.matches('br, b, strong, .header')) break;
        value += ` ${(next.textContent || '').slice(0, 800)}`;
      }
      return value.slice(0, 800);
    }
    return text;
  }

  function automaticIdentity(url, site) {
    if (site.mode !== 'automatic' || !site.detail_pattern) return null;
    const match = new RegExp(site.detail_pattern, 'i').exec(url.pathname);
    if (!match) return null;
    // 发行平台的商品号交给 Peach 编目规则识别。
    if (site.identity === 'peach') {
      if (!match[1] && site.query_keys?.some(key => url.searchParams.getAll(key).length !== 1
        || !/^[A-Za-z0-9_-]{1,100}$/.test(url.searchParams.get(key)))) return null;
      const codes = new Map();
      for (const selector of site.selectors || []) {
        for (const field of [...document.querySelectorAll(selector)].slice(0, 40)) {
          for (const code of candidates(fieldText(field))) codes.set(comparisonKey(code), code);
        }
      }
      return { code: codes.size === 1 ? [...codes.values()][0] : '', conflict: codes.size > 1,
        source: sourcePage(url, site), resolve: true };
    }
    if (site.query_keys?.length && !site.query_keys.every(key => url.searchParams.getAll(key).length === 1
      && /^[A-Za-z0-9_-]{1,100}$/.test(url.searchParams.get(key)))) return null;
    let decoded = '';
    try { decoded = decodeURIComponent(match[1] || ''); } catch { return null; }
    const pathCodes = candidates(decoded);
    if (match[1] && !pathCodes.size) return null;
    const codes = new Map([...pathCodes].map(code => [comparisonKey(code), code]));
    const brand = site.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const title = document.title.replace(new RegExp(`(^|[^A-Z0-9])${brand}(?=$|[^A-Z0-9])`, 'gi'), '$1 ');
    const fields = [title];
    const seen = new Set();
    for (const selector of site.selectors || []) {
      const nodes = [...document.querySelectorAll(selector)].slice(0, 40);
      for (const field of nodes) {
        if (seen.has(field)) continue;
        seen.add(field);
        fields.push(fieldText(field));
        if (field.matches('h1,h2,h3,h4')) break;
      }
    }
    let foundField = false;
    for (const field of fields) for (const code of candidates(field)) {
      foundField = true;
      if (!codes.has(comparisonKey(code))) codes.set(comparisonKey(code), code);
    }
    if (!foundField) return null;
    return {
      code: codes.size === 1 ? [...codes.values()][0] : '',
      conflict: codes.size !== 1,
      source: sourcePage(url, site),
    };
  }

  function identity() {
    const url = new URL(location.href);
    const site = siteFor(url);
    if (!site) return null;
    if (selected?.url !== location.href) selected = null;
    return selected || automaticIdentity(url, site);
  }

  function selectCode() {
    const url = new URL(location.href);
    const site = siteFor(url);
    if (!site) return;
    const raw = String(getSelection() || '').trim();
    const shortCode = /^(?:FC2(?:[-_ ]?PPV)?[-_ ]?\d{4,9}|[NK]\d{4}|MKB?D-S\d{2,4}|(?:\d{1,5})?[A-Z]{2,12}[-_]?\d{1,8}[A-Z]{0,2}|\d{6}[-_]\d{2,4})$/i;
    const extracted = candidates(raw);
    if (raw.length > 80 || !shortCode.test(raw) || extracted.size !== 1) {
      showNotice('请只选中一个完整的短番号，再从脚本菜单加入 Peach。');
      return;
    }
    selected = { url: location.href, code: [...extracted][0], conflict: false, source: sourcePage(url, site) };
    pageKey = '';
    refresh();
  }

  function settings(rawBase, rawToken) {
    const base = new URL(String(rawBase).trim());
    const token = String(rawToken).trim();
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (!(base.protocol === 'https:' || (base.protocol === 'http:' && loopback))
      || base.username || base.password || base.search || base.hash || base.pathname !== '/'
      || !token || token.length > 256 || /[\r\n]/.test(String(rawToken))) throw new Error();
    return { base: base.origin, token };
  }

  function configuration() {
    try {
      return settings(GM_getValue(STORAGE_BASE, ''), GM_getValue(STORAGE_TOKEN, ''));
    } catch { return null; }
  }

  function configure() {
    if (settingsView?.dialog.open) { settingsView.base.focus(); return; }
    const previousFocus = current?.root.shadowRoot?.activeElement || document.activeElement;
    const saved = configuration();
    const { root, shadow } = surface('peach-jav-settings', 'Peach 设置');
    const dialog = element('dialog');
    dialog.setAttribute('aria-labelledby', 'peach-settings-title');
    const form = element('form');
    form.noValidate = true;
    const bar = element('header', 'bar');
    const heading = element('h2', '', 'Peach 设置');
    heading.id = 'peach-settings-title';
    const close = control('关闭 Peach 设置', { icon: 'close' });
    const cancel = control('取消');
    const body = element('div', 'body');
    function field(id, label, hint, type = 'text') {
      const wrapper = element('div', 'field');
      const title = element('label', '', label);
      title.htmlFor = id;
      const input = element('input', 'geist-input');
      Object.assign(input, { id, type, autocomplete: 'off', spellcheck: false });
      const help = element('p', 'hint', hint);
      help.id = `${id}-hint`;
      input.setAttribute('aria-describedby', help.id);
      wrapper.append(title, input, help);
      body.append(wrapper);
      return { wrapper, input, help };
    }
    const address = field('peach-base', 'Peach 地址', '可直接粘贴 Peach 复制的配对信息，自动填好地址与令牌。', 'url');
    address.input.placeholder = 'https://peach.example.com';
    address.input.value = String(GM_getValue(STORAGE_BASE, '') || '');
    address.input.autofocus = true;
    const secret = field('peach-token', '专用令牌', '在 Peach 配置 → 下载渠道 → 浏览器添加 JAV 中生成。', 'password');
    secret.input.placeholder = saved ? '已保存，留空保留' : '粘贴专用令牌';
    const secretRow = element('div', 'secret');
    secret.input.replaceWith(secretRow);
    const reveal = control('显示');
    reveal.setAttribute('aria-label', '显示专用令牌');
    reveal.setAttribute('aria-pressed', 'false');
    reveal.addEventListener('click', () => {
      const visible = secret.input.type === 'password';
      secret.input.type = visible ? 'text' : 'password';
      reveal.textContent = visible ? '隐藏' : '显示';
      reveal.setAttribute('aria-label', visible ? '隐藏专用令牌' : '显示专用令牌');
      reveal.setAttribute('aria-pressed', String(visible));
    });
    secretRow.append(secret.input, reveal);
    const error = element('p', 'geist-note');
    error.id = 'peach-settings-error';
    error.dataset.variant = 'error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    body.append(error);
    address.input.addEventListener('paste', event => {
      const text = event.clipboardData?.getData('text/plain')?.trim() || '';
      if (!text.startsWith('{')) return;
      event.preventDefault();
      try {
        if (text.length > 4096) throw new Error();
        const pair = JSON.parse(text);
        if (pair.peach_pairing !== 1 || typeof pair.base !== 'string' || typeof pair.token !== 'string') throw new Error();
        const config = settings(pair.base, pair.token);
        address.input.value = config.base;
        secret.input.type = 'password';
        secret.input.value = config.token;
        reveal.textContent = '显示';
        reveal.setAttribute('aria-label', '显示专用令牌');
        reveal.setAttribute('aria-pressed', 'false');
        error.hidden = true;
        for (const input of [address.input, secret.input]) input.removeAttribute('aria-invalid');
        save.focus();
      } catch {
        error.textContent = '配对信息无效，请在 Peach 重新复制，或分别填写地址与令牌。';
        error.hidden = false;
      }
    });
    const footer = element('footer', 'footer');
    const save = control('保存设置', { primary: true });
    save.type = 'submit';
    footer.append(cancel, save);
    bar.append(heading, close);
    form.append(bar, body, footer);
    dialog.append(form);
    shadow.append(dialog);
    settingsView = { root, dialog, base: address.input };
    const cleanup = () => {
      secret.input.value = '';
      if (settingsView?.root === root) settingsView = null;
      root.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      else current?.settings.focus();
    };
    const dismiss = () => { dialog.close(); cleanup(); };
    close.addEventListener('click', dismiss);
    cancel.addEventListener('click', dismiss);
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (!event.isComposing && !composing) dismiss();
    });
    dialog.addEventListener('close', () => { if (root.isConnected) cleanup(); });
    let composing = false;
    form.addEventListener('compositionstart', () => { composing = true; });
    form.addEventListener('compositionend', () => { composing = false; });
    form.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        if (!event.isComposing && !composing) form.requestSubmit();
      }
      if (event.key === 'Escape' && (event.isComposing || composing)) { event.preventDefault(); event.stopPropagation(); }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (composing) return;
      for (const input of [address.input, secret.input]) input.removeAttribute('aria-invalid');
      let config;
      let invalid = address.input;
      try {
        // 换地址时必须重新输入令牌，避免把已存令牌交给另一个服务。
        const base = settings(address.input.value, 'validation-only').base;
        invalid = secret.input;
        const token = secret.input.value || (base === saved?.base ? saved.token : '');
        config = settings(base, token);
      } catch {
        invalid.setAttribute('aria-invalid', 'true');
        invalid.setAttribute('aria-describedby', `${invalid.id}-hint ${error.id}`);
        error.textContent = invalid === address.input
          ? '请输入有效的 Peach 地址，不含路径、查询参数或账号密码。HTTP 仅支持本机地址。'
          : '请输入专用令牌；更换 Peach 地址时需要重新填写令牌。';
        error.hidden = false;
        invalid.focus();
        return;
      }
      try {
        GM_setValue(STORAGE_TOKEN, config.token);
        GM_setValue(STORAGE_BASE, config.base);
      } catch {
        error.textContent = '设置未能保存，请检查脚本管理器的存储权限后重试。';
        error.hidden = false;
        return;
      }
      dismiss();
      pageKey = '';
      refresh();
      current?.settings.focus();
      if (!current) showNotice('已保存 Peach 设置。');
    });
    dialog.showModal();
  }

  GM_registerMenuCommand('配置 Peach 地址与令牌', configure);
  GM_registerMenuCommand('选中番号加入 Peach', selectCode);

  function request(config, code, source, method, resolveIdentity = false) {
    return new Promise((resolve, reject) => {
      const headers = { Authorization: `Bearer ${config.token}`, Accept: 'application/json' };
      if (method === 'POST') headers['Content-Type'] = 'application/json';
      try {
        GM_xmlhttpRequest({
          method,
          url: resolveIdentity ? `${config.base}/api/jav-browser/identify?source_url=${encodeURIComponent(source)}${code ? `&code=${encodeURIComponent(code)}` : ''}`
            : `${config.base}/api/jav-browser${method === 'GET' ? `?code=${encodeURIComponent(code)}` : ''}`,
          headers,
          ...(method === 'POST' ? { data: JSON.stringify({ code, source_url: source }) } : {}),
          anonymous: true,
          timeout: 15_000,
          onload(response) {
            if (response.status < 200 || response.status >= 300) {
              let detail = '';
              try { const value = JSON.parse(response.responseText).detail; if (typeof value === 'string' && value.length <= 200) detail = value; } catch { /* 非 JSON 错误使用 HTTP 状态提示。 */ }
              reject(new Error(response.status === 401 || response.status === 403 ? '令牌无效或无权限，请重新配置。'
                : response.status >= 500 ? 'Peach 服务暂时不可用，请稍后查询状态。'
                : response.status === 429 ? 'Peach 请求过于频繁，请稍后查询。'
                : resolveIdentity && [404, 405].includes(response.status) ? 'Peach 尚不支持商品号识别，请更新 Peach。'
                : response.status === 400 && detail ? detail
                : resolveIdentity ? '未识别到作品番号，请选中页面的完整番号后加入 Peach。' : 'Peach 请求失败，请查询状态。'));
              return;
            }
            try {
              const body = JSON.parse(response.responseText);
              if (body.ok !== true || !STATES.has(body.state) || typeof body.code !== 'string'
                || candidates(body.code).size !== 1
                || ((!resolveIdentity || code) && ![...candidates(body.code)].some(candidate => comparisonKey(candidate) === comparisonKey(code)))) throw new Error();
              resolve(body);
            } catch { reject(new Error('Peach 返回的状态无效，请查询状态。')); }
          },
          onerror: () => reject(new Error('无法连接 Peach，请查询状态。')),
          ontimeout: () => reject(new Error('Peach 请求超时，请查询状态。')),
          onabort: () => reject(new Error('Peach 请求已中止，请查询状态。')),
        });
      } catch { reject(new Error('无法连接 Peach，请查询状态。')); }
    });
  }

  function alive(view) { return current === view && generation === view.generation && view.url === location.href; }

  function render(view) {
    if (!alive(view)) return;
    const terminalSuccess = ['ingested', 'owned'].includes(view.state);
    view.button.disabled = view.identity.conflict || terminalSuccess;
    view.button.setAttribute('aria-busy', String(view.busy));
    view.button.setAttribute('aria-disabled', String(view.busy || view.button.disabled));
    view.button.textContent = view.identity.conflict ? '番号存在冲突'
      : !configuration() ? '配置 Peach'
      : terminalSuccess ? '已有该影片'
      : view.busy ? '正在查询 Peach'
      : view.queryOnly || ACTIVE.has(view.state) ? '查询 Peach 状态'
      : ['failed', 'no_match'].includes(view.state) ? '重试加入 Peach 馆藏' : '加入 Peach 馆藏';
    if (view.busy) {
      const spinner = element('span', 'ui-geist-spinner');
      spinner.setAttribute('aria-hidden', 'true');
      for (let index = 0; index < 12; index++) {
        const segment = element('i');
        segment.style.setProperty('--spinner-angle', `${index * 30}deg`);
        segment.style.setProperty('--spinner-delay', `${index / 12 - 1}s`);
        spinner.append(segment);
      }
      view.button.prepend(spinner);
    }
  }

  function applyState(view, body) {
    if (view.identity.resolve) {
      view.identity.code = body.code;
      view.identity.resolve = false;
      view.heading.textContent = body.code;
    }
    view.state = body.state;
    view.queryOnly = ACTIVE.has(body.state);
    if (!view.queryOnly) attempts.delete(comparisonKey(view.identity.code));
    view.note.textContent = LABELS[body.state];
    view.note.dataset.variant = body.state === 'failed' ? 'error' : 'secondary';
    render(view);
  }

  async function query(view, method = 'GET') {
    if (!alive(view) || view.busy) return;
    const config = configuration();
    if (!config) { configure(); return; }
    view.busy = true;
    view.note.dataset.variant = 'secondary';
    if (method === 'POST') {
      attempts.add(comparisonKey(view.identity.code));
      view.queryOnly = true;
      view.note.textContent = '正在交给 Peach';
    }
    render(view);
    const deadline = Date.now() + 120_000;
    try {
      let body = await request(config, view.identity.code, view.identity.source, method, Boolean(view.identity.resolve));
      if (!alive(view)) return;
      applyState(view, body);
      for (let count = 0; ACTIVE.has(body.state) && count < 30 && Date.now() < deadline; count++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!alive(view)) return;
        body = await request(config, view.identity.code, view.identity.source, 'GET');
        if (!alive(view)) return;
        applyState(view, body);
      }
      if (ACTIVE.has(body.state)) view.note.textContent = '任务仍在继续，可查询状态。';
    } catch (error) {
      if (alive(view)) {
        view.queryOnly = true;
        view.note.textContent = error.message;
        view.note.dataset.variant = 'error';
      }
    } finally {
      if (alive(view)) { view.busy = false; render(view); }
    }
  }

  function refresh() {
    const item = identity();
    const key = `${location.href}|${item?.code || ''}|${Boolean(item?.conflict)}`;
    if (key === pageKey && (!item || current?.root.isConnected)) return;
    pageKey = key;
    generation++;
    current?.root.remove();
    current = null;
    if (!item || !document.body) return;
    // Shadow DOM 隔离宿主样式。
    document.getElementById(ROOT_ID)?.remove();
    const { root, shadow } = surface(ROOT_ID, 'Peach 入库');
    const panel = element('section', 'panel');
    const bar = element('header', 'bar');
    const label = element('strong', '', item.conflict ? '番号待核对' : item.code || '作品番号');
    const settingsButton = control('Peach 设置', { icon: 'settings' });
    settingsButton.addEventListener('click', configure);
    bar.append(label, settingsButton);
    const body = element('div', 'body');
    const button = control('加入 Peach 馆藏', { primary: true });
    button.dataset.action = 'add';
    const note = element('p', 'geist-note');
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    body.append(note, button);
    panel.append(bar, body);
    shadow.append(panel);
    const view = { root, button, note, heading: label, settings: settingsButton, identity: item, url: location.href, generation, state: 'idle', busy: false, queryOnly: attempts.has(comparisonKey(item.code)) };
    current = view;
    note.textContent = item.conflict ? '页面身份不一致，请核对番号。' : configuration() ? '正在查询 Peach 馆藏' : '配置地址与令牌后，即可加入 Peach 馆藏。';
    button.addEventListener('click', () => {
      if (!alive(view) || view.busy || view.button.disabled) return;
      if (!configuration()) { configure(); return; }
      void query(view, view.queryOnly || ACTIVE.has(view.state) ? 'GET' : 'POST');
    });
    render(view);
    if (!item.conflict && configuration()) void query(view);
  }

  const schedule = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 100);
  };
  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  addEventListener('popstate', schedule);
  addEventListener('hashchange', schedule);
  const navigated = () => {
    generation++;
    pageKey = '';
    selected = null;
    schedule();
  };
  addEventListener('urlchange', navigated);
  globalThis.navigation?.addEventListener('navigate', navigated);
  // 用户脚本沙箱无需替换页面的 History API。
  setInterval(refresh, 750);
  refresh();
})();
