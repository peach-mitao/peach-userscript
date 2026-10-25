// ==UserScript==
// @name         Peach · JAV 入库
// @namespace    https://github.com/peach-mitao/peach-userscript
// @source       https://github.com/peach-mitao/peach-userscript
// @supportURL   https://github.com/peach-mitao/peach-userscript/issues
// @homepageURL  https://github.com/peach-mitao/peach-userscript
// @license      AGPL-3.0-or-later
// @version      0.5.2
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
// @grant        GM_info
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        window.onurlchange
// @connect      *
// @connect      update.sleazyfork.org
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
  const STORAGE_ERRORS = 'peach.jav.errors';
  const ROOT_ID = 'peach-jav-action';
  const SCRIPT_VERSION = __PEACH_JAV_VERSION__;
  const PEACH_LOGO = __PEACH_JAV_LOGO__;
  const STORAGE_INSTALLED = 'peach.jav.installed-version';
  const STORAGE_UPDATES = 'peach.jav.updates';
  const STORAGE_CHECKED = 'peach.jav.update-attempted-at';
  const RELEASE_PAGE = 'https://sleazyfork.org/zh-CN/scripts/600821';
  const RELEASE_META = 'https://update.sleazyfork.org/scripts/600821/Peach%20%C2%B7%20JAV%20%E5%85%A5%E5%BA%93.meta.js';
  const infoVersion = typeof GM_info === 'object' && validVersion(GM_info?.script?.version) ? GM_info.script.version : SCRIPT_VERSION;
  const RUNNING_VERSION = compareVersion(SCRIPT_VERSION, infoVersion) <= 0 ? SCRIPT_VERSION : infoVersion;
  // 新实例在同页去重及桥接返回之前登记安装版本，正在运行的实例可收到变化。
  try {
    const installed = compareVersion(SCRIPT_VERSION, infoVersion) >= 0 ? SCRIPT_VERSION : infoVersion;
    if (compareVersion(installed, GM_getValue(STORAGE_INSTALLED, '0.0.0')) > 0) GM_setValue(STORAGE_INSTALLED, installed);
  } catch { /* 安装检测不阻断原有入口。 */ }
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
  let panelMode = 'expanded';
  let updateEntry = null;
  let updateCache = readUpdateCache();
  let updateError = '';
  let updateChecking = false;
  let updateDismissed = '';
  let updateGeneration = 0;
  let updateTimer;
  let updateDisposed = false;
  let automaticUpdatesAvailable = true;
  const updateRequests = new Set();
  const updateContainers = new Set();
  const updateListeners = [];

  // Peach 控件快照：来源与适配范围见 docs/REUSE.md。
  const UI_STYLE = `
    :host{all:initial;--ground:#fff;--surface:#fafafa;--sunk:#f2f2f2;--ink:#171717;--ink-2:#4d4d4d;--muted:#666;
      --line:#e5e5e5;--line-soft:#ebebeb;--field-ring:#00000014;--field-ring-hover:#00000036;--field-ring-focus:#00000057;
      --tungsten:#2563eb;--drop:#da2f35;--task-accent:oklch(62.3% .214 259.815);--task-muted:oklch(70.8% 0 none);--icon-inline:1.2em;
      --modal-ease:cubic-bezier(0,0,.2,1);
      --control-radius:6px;--surface-radius:8px;--floating-radius:12px;--control-h:38px;
      --fs-sm:13px;--fs-md:14px;--fs-lg:16px;--fs-xl:20px;--fieldset-bar-h:52px;
      position:fixed;inset:auto max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) auto;
      z-index:2147483647;width:min(320px,calc(100vw - 32px));font:400 14px/1.5 system-ui,sans-serif;color:var(--ink);color-scheme:light dark;text-align:left}
    @media(prefers-color-scheme:dark){:host{--ground:#080a0d;--surface:#0c0f14;--sunk:#0b0d11;--ink:#fff;--ink-2:#c9cdd4;--muted:#9aa0a8;
      --line:#ffffff1a;--line-soft:#ffffff26;--field-ring:#ffffff26;--field-ring-hover:#ffffff42;--field-ring-focus:#ffffff66;--task-muted:oklch(43.9% 0 none)}}
    *,*::before,*::after{box-sizing:border-box} [hidden]{display:none!important}
    :host([data-panel-mode="minimized"]){width:48px}
    :host([data-settings-open]){visibility:hidden}
    h2,p{margin:0} h2{font-size:var(--fs-xl);line-height:26px;font-weight:600}
    .panel{background:var(--ground);border:1px solid var(--line);border-radius:var(--floating-radius);overflow:hidden}
    .task-progress{display:block;width:100%;height:6px;overflow:hidden;border-radius:9999px}
    .task-progress .track{fill:#ebebeb}.task-progress .fill{fill:var(--task-accent)}
    .task-progress .stop{fill:var(--ground)}
    .flow{display:grid;gap:10px}.flow-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
    .flow-step{display:grid;justify-items:center;gap:4px;min-width:0;color:var(--task-muted);font-size:var(--fs-sm);line-height:1.4}
    .flow-step[data-state="complete"] .flow-label{text-decoration:line-through}.flow-step[data-state="current"]{color:var(--ink)}
    .flow-step[data-state="error"]{color:var(--drop)}.flow-mark{width:var(--icon-inline);height:var(--icon-inline);display:grid;place-items:center;line-height:1}
    .flow-mark svg{display:block;width:100%;height:100%;fill:currentColor}
    .flow-step[data-state="current"] .flow-mark{color:var(--task-accent)}
    @media(prefers-color-scheme:dark){.task-progress .track{fill:oklch(26.9% 0 none)}}
    .bar{min-height:var(--fieldset-bar-h);padding:8px 16px 8px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .bar strong{font-weight:500;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
    .bar-heading{display:grid;min-width:0;gap:2px}.bar-summary{font-size:11px;line-height:16px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bar-actions{display:flex;gap:4px;flex:none}
    .bar-actions [data-collapse-chevron]{transition:transform .2s ease-in-out}
    .bar-actions [aria-expanded="false"] [data-collapse-chevron]{transform:rotate(180deg)}
    .geist-button.launcher{width:48px;height:48px;padding:6px;border-radius:50%;background:var(--ground);transform-origin:bottom right}
    .launcher img{display:block;width:34px;height:34px;object-fit:contain}
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
    .update-section{display:grid;gap:8px;min-width:0;border-top:1px solid var(--line);padding-top:12px}
    .update-actions{display:flex;flex-wrap:wrap;gap:8px}.update-actions a{text-decoration:none}
    .update-actions .geist-button{height:32px;padding-inline:10px}
    dialog{position:fixed;inset:auto max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) auto;margin:0;
      width:min(400px,calc(100vw - 32px));max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);padding:0;
      background:var(--ground);color:var(--ink);border:1px solid var(--line);border-radius:var(--floating-radius);overflow:hidden;
      opacity:1;transform:scale(1);transition:opacity 200ms var(--modal-ease),transform 200ms var(--modal-ease)}
    dialog::backdrop{background:#000b;opacity:1;transition:opacity 200ms var(--modal-ease)}
    dialog[data-closing],dialog[data-closing]::backdrop{opacity:0;transition-duration:120ms}
    dialog[data-closing]{transform:scale(.98)}
    @starting-style{dialog[open],dialog[open]::backdrop{opacity:0}dialog[open]{transform:scale(.98)}}
    form{display:flex;flex-direction:column;max-height:calc(100dvh - 34px)}
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

  // Peach 任务列表的 Remix Icon 4.9.0 图形；Copyright (c) 2017–2026 Remix Design。
  // 图形遵循 Remix Icon License v1.0：https://github.com/Remix-Design/RemixIcon/blob/master/License。
  const STEP_ICON_PATHS = {
    check: 'M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z',
    circle: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20Z',
    error: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 15H13V17H11V15ZM11 7H13V13H11V7Z',
    skipped: 'M5 11V13H19V11H5Z',
  };

  function stepMark() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', STEP_ICON_PATHS.circle);
    svg.append(path);
    return svg;
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
      path.setAttribute('d', icon === 'close' ? 'M6 6l12 12M6 18L18 6' : icon === 'collapse' ? 'm6 9 6 6 6-6'
        : 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915');
      svg.append(path);
      if (icon === 'collapse') svg.setAttribute('data-collapse-chevron', '');
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

  function validVersion(value) { return typeof value === 'string' && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value); }

  function compareVersion(left, right) {
    if (!validVersion(left) || !validVersion(right)) return 0;
    const a = left.split('.').map(Number), b = right.split('.').map(Number);
    for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
    return 0;
  }

  function readUpdateCache() {
    try {
      const saved = JSON.parse(GM_getValue(STORAGE_UPDATES, '{}'));
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch { return {}; }
  }

  function installedVersion() {
    try { return GM_getValue(STORAGE_INSTALLED, RUNNING_VERSION); } catch { return RUNNING_VERSION; }
  }

  function updateModel() {
    const installed = installedVersion();
    if (compareVersion(installed, RUNNING_VERSION) > 0) return {
      key: `refresh:${installed}`, kind: 'refresh', message: `用户脚本已更新至 v${installed}，刷新本页即可使用。`,
    };
    const config = configuration();
    const local = config && updateCache.peach?.base === config.base ? updateCache.peach : null;
    const remote = validVersion(updateCache.script?.version) ? updateCache.script.version : '';
    const bundled = local?.userscript?.version;
    const version = compareVersion(bundled, remote || '0.0.0') > 0 ? bundled : remote;
    if (compareVersion(version, RUNNING_VERSION) > 0) return {
      key: `script:${version}`, kind: 'script', message: `用户脚本 v${version} 可更新。`,
      href: bundled === version && config ? `${config.base}/integrations/peach-jav.user.js` : RELEASE_PAGE,
    };
    if (local?.release?.state === 'available' && typeof local.release.latest_version === 'string') return {
      key: `peach:${config.base}:${local.release.latest_version}`, kind: 'peach',
      message: `Peach ${local.release.latest_version} 可更新。`, href: `${config.base}/settings/maintenance#releaseUpdates`,
    };
    return { key: '', kind: 'current', message: `当前用户脚本 v${RUNNING_VERSION}` };
  }

  function updateSection() {
    for (const previous of updateContainers) if (!previous.isConnected) updateContainers.delete(previous);
    const node = element('section', 'update-section');
    node.setAttribute('aria-label', '检查更新');
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('aria-atomic', 'true');
    updateContainers.add(node);
    paintUpdates(node);
    return node;
  }

  function paintUpdates(node) {
    const model = updateModel();
    const checking = updateChecking && model.kind === 'current';
    const note = element('p', 'geist-note', checking ? '正在检查更新。' : model.message);
    note.dataset.copyKey = `userscript.updates.${checking ? 'checking' : model.kind}.message`;
    note.setAttribute('aria-label', '用户脚本更新状态');
    const actions = element('div', 'update-actions');
    if (model.kind === 'refresh') {
      const reload = control('刷新本页');
      reload.dataset.copyKey = 'userscript.updates.refresh.action';
      reload.addEventListener('click', () => location.reload());
      actions.append(reload);
    } else if (model.href) {
      const install = element('a', 'geist-button', model.kind === 'script' ? '更新用户脚本' : '查看 Peach 更新');
      Object.assign(install, { href: model.href, target: '_blank', rel: 'noopener noreferrer' });
      install.dataset.copyKey = `userscript.updates.${model.kind}.action`;
      actions.append(install);
    }
    const check = control('检查更新');
    check.dataset.copyKey = 'userscript.updates.check.action';
    check.setAttribute('aria-busy', String(updateChecking));
    check.setAttribute('aria-disabled', String(updateChecking));
    check.addEventListener('click', () => { if (!updateChecking) void checkUpdates(true); });
    actions.append(check);
    node.replaceChildren(note);
    if (updateError && !updateChecking) {
      const error = element('p', 'geist-note', updateError);
      error.dataset.variant = 'error'; error.setAttribute('role', 'alert');
      error.dataset.copyKey = 'userscript.updates.error.message';
      node.append(error);
    }
    node.append(actions);
    const config = configuration();
    const peach = config && updateCache.peach?.base === config.base ? updateCache.peach : null;
    if (model.kind !== 'peach' && peach?.release?.state === 'available' && typeof peach.release.latest_version === 'string') {
      const app = element('p', 'geist-note', `Peach ${peach.release.latest_version} 可更新。`);
      app.dataset.copyKey = 'userscript.updates.peach.message';
      const open = element('a', 'geist-button', '查看 Peach 更新');
      Object.assign(open, { href: `${config.base}/settings/maintenance#releaseUpdates`, target: '_blank', rel: 'noopener noreferrer' });
      open.dataset.copyKey = 'userscript.updates.peach.action';
      const appActions = element('div', 'update-actions'); appActions.append(open);
      node.append(app, appActions);
    }
  }

  function paintAllUpdates() {
    if (updateDisposed) return;
    for (const node of updateContainers) {
      if (node.isConnected) paintUpdates(node); else updateContainers.delete(node);
    }
    refreshUpdateEntry();
  }

  function refreshUpdateEntry() {
    if (!document.body || updateDisposed) return;
    if (current) { updateEntry?.root.remove(); updateEntry = null; return; }
    const model = updateModel();
    const expanded = document.visibilityState !== 'hidden' && model.kind !== 'current' && updateDismissed !== model.key;
    if (!updateEntry?.root.isConnected) {
      const entry = surface('peach-jav-updates', 'Peach 更新');
      const launcher = control('Peach 设置与更新');
      launcher.setAttribute('aria-label', 'Peach 设置与更新');
      launcher.classList.add('launcher');
      const logo = element('img'); logo.src = PEACH_LOGO; logo.alt = '';
      launcher.replaceChildren(logo); launcher.addEventListener('click', configure);
      const panel = element('section', 'panel');
      const bar = element('header', 'bar');
      const later = control('稍后', { icon: 'close' });
      later.addEventListener('click', () => { updateDismissed = updateModel().key; refreshUpdateEntry(); });
      bar.append(element('strong', '', 'Peach 更新'), later);
      const body = element('div', 'body'); body.append(updateSection());
      const settings = control('Peach 设置'); settings.addEventListener('click', configure); body.append(settings);
      panel.append(bar, body); entry.shadow.append(panel, launcher);
      updateEntry = { ...entry, launcher, panel };
    }
    updateEntry.root.dataset.panelMode = expanded ? 'expanded' : 'minimized';
    updateEntry.launcher.hidden = expanded; updateEntry.panel.hidden = !expanded;
    updateEntry.root.toggleAttribute('data-settings-open', Boolean(settingsView?.dialog.open));
  }

  function updateRequest(url, config = null) {
    return new Promise((resolve, reject) => {
      let handle;
      let finished = false;
      let watchdog;
      let ticket;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        if (ticket) updateRequests.delete(ticket);
        if (error) reject(error); else resolve(value);
      };
      const failed = () => finish(new Error(config ? 'Peach 更新状态未取得，请检查连接和令牌后重试。' : '脚本发行状态未取得，请稍后重试。'));
      ticket = { abort() { failed(); handle?.abort?.(); } };
      // anonymous 使用的 fetch 模式在 Chrome 中不保证 GM timeout 生效。
      watchdog = setTimeout(() => ticket.abort(), 15_000);
      try {
        handle = GM_xmlhttpRequest({ method: 'GET', url, anonymous: true, timeout: 15_000, redirect: 'error',
          headers: config ? { Accept: 'application/json', Authorization: `Bearer ${config.token}` } : { Accept: 'text/plain' },
          onload(response) {
            if (finished) return;
            if (response.status < 200 || response.status >= 300 || response.responseText?.length > 128_000
              || (response.finalUrl && response.finalUrl !== url)) { failed(); return; }
            try {
              if (!config) {
                const metadata = /^\s*\/\/ ==UserScript==\r?\n([\s\S]*?)\/\/ ==\/UserScript==/.exec(response.responseText)?.[1];
                const entries = key => [...(metadata || '').matchAll(new RegExp(`^// @${key}\\s+(.+)$`, 'gm'))].map(match => match[1].trim());
                const version = entries('version');
                if (!metadata || version.length !== 1 || !validVersion(version[0])
                  || entries('namespace').length !== 1 || entries('namespace')[0] !== 'https://github.com/peach-mitao/peach-userscript'
                  || entries('name').length !== 1 || entries('name')[0] !== 'Peach · JAV 入库') throw new Error();
                finish(null, { version: version[0] });
              } else {
                const body = JSON.parse(response.responseText);
                if (!validVersion(body.userscript?.version) || !validVersion(body.userscript?.minimum_version)
                  || typeof body.runtime?.version !== 'string' || typeof body.runtime?.build_id !== 'string'
                  || typeof body.release?.state !== 'string') throw new Error();
                // 安装链接只由当前配置地址和固定路径组成。
                finish(null, { base: config.base, runtime: body.runtime, release: body.release,
                  userscript: { version: body.userscript.version, minimum_version: body.userscript.minimum_version } });
              }
            } catch { failed(); }
          }, onerror: failed, ontimeout: failed, onabort: failed,
        });
        if (!finished) updateRequests.add(ticket);
      } catch { failed(); }
    });
  }

  async function checkUpdates(manual = false) {
    if (updateDisposed || updateChecking || (!manual && document.visibilityState === 'hidden')) return;
    const run = ++updateGeneration;
    updateChecking = true; updateError = '';
    try { GM_setValue(STORAGE_CHECKED, String(Date.now())); } catch { automaticUpdatesAvailable = false; }
    paintAllUpdates();
    const config = configuration();
    const results = await Promise.allSettled([updateRequest(RELEASE_META),
      ...(config ? [updateRequest(`${config.base}/api/jav-browser/updates`, config)] : [])]);
    if (updateDisposed || run !== updateGeneration) return;
    updateChecking = false;
    const latest = readUpdateCache();
    if (results[0].status === 'fulfilled') latest.script = results[0].value;
    if (config && results[1]?.status === 'fulfilled' && configuration()?.base === config.base) latest.peach = results[1].value;
    const errors = results.filter(result => result.status === 'rejected');
    if (manual && errors.length) updateError = errors.map(result => result.reason.message).join(' ');
    updateCache = latest;
    try { GM_setValue(STORAGE_UPDATES, JSON.stringify(latest)); } catch { /* 页面内保留本次结果。 */ }
    paintAllUpdates(); scheduleUpdateCheck();
  }

  function scheduleUpdateCheck() {
    clearTimeout(updateTimer);
    if (updateDisposed || !automaticUpdatesAvailable || document.visibilityState === 'hidden') return;
    let last;
    try { last = Number(GM_getValue(STORAGE_CHECKED, '0')); } catch { return; }
    const delay = Number.isFinite(last) ? Math.max(0, last + 86400_000 - Date.now()) : 0;
    if (delay === 0) void checkUpdates();
    else updateTimer = setTimeout(scheduleUpdateCheck, Math.min(delay, 86400_000));
  }

  function updateVisibility() {
    clearTimeout(updateTimer);
    if (document.visibilityState === 'hidden') {
      updateGeneration++; updateChecking = false;
      for (const request of updateRequests) request.abort?.();
      updateRequests.clear();
    } else { updateCache = readUpdateCache(); paintAllUpdates(); scheduleUpdateCheck(); }
  }

  function disposeUpdates() {
    updateDisposed = true; updateGeneration++;
    clearTimeout(updateTimer);
    for (const request of updateRequests) request.abort?.();
    updateRequests.clear(); updateContainers.clear();
    document.removeEventListener('visibilitychange', updateVisibility);
    if (typeof GM_removeValueChangeListener === 'function') for (const listener of updateListeners) GM_removeValueChangeListener(listener);
  }

  function configure() {
    if (settingsView?.dialog.open) { settingsView.reopen(); return; }
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
    body.append(updateSection());
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
    let closing = false;
    let closeGeneration = 0;
    settingsView = { root, dialog, base: address.input, reopen() {
      closeGeneration++;
      closing = false;
      dialog.removeAttribute('data-closing');
      address.input.focus();
    } };
    if (current) {
      current.root.setAttribute('data-settings-open', '');
      current.root.inert = true;
    }
    updateEntry?.root.setAttribute('data-settings-open', '');
    const cleanup = () => {
      if (!root.isConnected) return;
      closeGeneration++;
      closing = false;
      secret.input.value = '';
      if (settingsView?.root === root) settingsView = null;
      root.remove();
      if (current) {
        current.root.removeAttribute('data-settings-open');
        current.root.inert = false;
      }
      refreshUpdateEntry();
      if (previousFocus?.isConnected) previousFocus.focus();
      else current?.settings.focus();
    };
    const dismiss = async () => {
      if (closing || !dialog.open) return;
      closing = true;
      const run = ++closeGeneration;
      dialog.setAttribute('data-closing', '');
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        dialog.getBoundingClientRect();
        const animations = dialog.getAnimations();
        if (animations.length) {
          let timer;
          await Promise.race([Promise.allSettled(animations.map(animation => animation.finished)),
            new Promise(resolve => { timer = setTimeout(resolve, 220); })]);
          clearTimeout(timer);
        }
      }
      if (run !== closeGeneration || !closing) return;
      dialog.close();
      cleanup();
    };
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
      if (composing || closing) return;
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
      paintAllUpdates();
      current?.settings.focus();
      if (!current) showNotice('已保存 Peach 设置。');
    });
    dialog.showModal();
  }

  GM_registerMenuCommand('配置 Peach 地址与令牌', configure);
  GM_registerMenuCommand('选中番号加入 Peach', selectCode);
  GM_registerMenuCommand('检查 Peach 与用户脚本更新', () => { configure(); void checkUpdates(true); });

  let reporting = false;
  let reportAfter = 0;
  function pendingErrors() {
    try {
      const rows = JSON.parse(GM_getValue(STORAGE_ERRORS, '[]'));
      return Array.isArray(rows) ? rows.filter(row => row && typeof row.base === 'string' && row.event
        && typeof row.event.id === 'string' && Date.now() - Date.parse(row.event.at) < 7 * 86400_000).slice(-20) : [];
    } catch { return []; }
  }

  function flushErrors(config) {
    if (reporting || Date.now() < reportAfter) return;
    const rows = pendingErrors().filter(row => row.base === config.base).slice(0, 10);
    if (!rows.length) return;
    reporting = true;
    reportAfter = Date.now() + 60_000;
    const done = () => { reporting = false; };
    try {
      GM_xmlhttpRequest({ method: 'POST', url: `${config.base}/api/jav-browser/errors`, anonymous: true,
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, timeout: 5000,
        data: JSON.stringify({ events: rows.map(row => row.event) }),
        onload(response) {
          try {
            if (response.status >= 200 && response.status < 300 && Number.isInteger(JSON.parse(response.responseText).recorded)) {
              const ids = new Set(rows.map(row => row.event.id));
              GM_setValue(STORAGE_ERRORS, JSON.stringify(pendingErrors().filter(row => !ids.has(row.event.id))));
            }
          } catch { /* 错误取证不影响添加和状态查询。 */ }
          done();
        }, onerror: done, ontimeout: done, onabort: done,
      });
    } catch { done(); }
  }

  function rememberError(config, code, source, operation, kind, elapsed, status) {
    try {
      const site = siteFor(new URL(source));
      if (!site) return;
      const event = { id: crypto.randomUUID(), at: new Date().toISOString(), kind, operation, site: site.id,
        code, elapsed_ms: Math.min(3_600_000, Math.max(0, Math.round(elapsed))), status, script_version: SCRIPT_VERSION };
      GM_setValue(STORAGE_ERRORS, JSON.stringify([...pendingErrors(), { base: config.base, event }].slice(-20)));
      flushErrors(config);
    } catch { /* GM 存储不可用时保留原操作的错误反馈。 */ }
  }

  function request(config, code, source, method, resolveIdentity = false) {
    return new Promise((resolve, reject) => {
      const started = performance.now();
      const fail = (kind, message, status = 0) => {
        rememberError(config, resolveIdentity ? '' : code, source, resolveIdentity ? 'IDENTIFY' : method,
          kind, performance.now() - started, status);
        reject(new Error(message));
      };
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
          timeout: 60_000,
          onload(response) {
            if (response.status < 200 || response.status >= 300) {
              let detail = '';
              try { const value = JSON.parse(response.responseText).detail; if (typeof value === 'string' && value.length <= 200) detail = value; } catch { /* 非 JSON 错误使用 HTTP 状态提示。 */ }
              fail('http', response.status === 401 || response.status === 403 ? '令牌无效或无权限，请重新配置。'
                : response.status >= 500 ? 'Peach 服务暂时不可用，请稍后查询状态。'
                : response.status === 429 ? 'Peach 请求过于频繁，请稍后查询。'
                : resolveIdentity && [404, 405].includes(response.status) ? 'Peach 尚不支持商品号识别，请更新 Peach。'
                : response.status === 400 && detail ? detail
                : resolveIdentity ? '未识别到作品番号，请选中页面的完整番号后加入 Peach。' : 'Peach 请求失败，请查询状态。', response.status);
              return;
            }
            try {
              const body = JSON.parse(response.responseText);
              if (body.ok !== true || !STATES.has(body.state) || typeof body.code !== 'string'
                || candidates(body.code).size !== 1
                || ((!resolveIdentity || code) && ![...candidates(body.code)].some(candidate => comparisonKey(candidate) === comparisonKey(code)))) throw new Error();
              resolve(body);
              flushErrors(config);
            } catch { fail('invalid_response', 'Peach 返回的状态无效，请查询状态。', response.status); }
          },
          onerror: () => fail('network', '无法连接 Peach，请查询状态。'),
          ontimeout: () => fail('timeout', 'Peach 请求超时，请查询状态。'),
          onabort: () => fail('abort', 'Peach 请求已中止，请查询状态。'),
        });
      } catch { fail('client_exception', '无法连接 Peach，请查询状态。'); }
    });
  }

  function alive(view) { return current === view && generation === view.generation && view.url === location.href; }

  function present(view, mode, focus = false) {
    if (!alive(view)) return;
    panelMode = mode;
    view.presentation?.cancel();
    const minimized = mode === 'minimized';
    const expanded = mode === 'expanded';
    view.root.dataset.panelMode = mode;
    view.panel.hidden = minimized;
    view.launcher.hidden = !minimized;
    view.body.hidden = !expanded;
    view.body.inert = !expanded;
    view.summary.hidden = expanded;
    view.summary.textContent = mode === 'collapsed' ? view.note.textContent : '';
    view.collapse.setAttribute('aria-expanded', String(expanded));
    view.collapse.setAttribute('aria-label', expanded ? '折叠 Peach 详情' : '展开 Peach 详情');
    if (focus) {
      (minimized ? view.launcher : view.collapse).focus();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const target = minimized ? view.launcher : view.panel;
        view.presentation = target.animate([{opacity:0, transform:'translateY(4px) scale(.97)'}, {opacity:1, transform:'translateY(0) scale(1)'}],
          {duration:200, easing:'ease-in-out'});
      }
    }
  }

  function render(view) {
    if (!alive(view)) return;
    view.summary.textContent = panelMode === 'collapsed' ? view.note.textContent : '';
    const terminalSuccess = ['ingested', 'owned'].includes(view.state) && !view.tracking;
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

  function tracking(body) {
    return ACTIVE.has(body.state) || (body.state === 'ingested'
      && ['pending', 'queued', 'running'].includes(body.download?.postprocess_state));
  }

  function renderFlow(view, body) {
    const download = body?.download;
    let current = -1;
    let completed = 0;
    let fraction = 0;
    const failed = ['failed', 'no_match'].includes(body?.state) || download?.postprocess_state === 'failed';
    if (body?.state === 'queued') current = 0;
    else if (body?.state === 'searching') current = body.stage === 'submitting' ? 2 : 1;
    else if (body?.state === 'submitted' || body?.state === 'ingested' || failed) {
      if (download?.state === 'ingested' || body.state === 'ingested') {
        if (['complete', 'not_requested'].includes(download?.postprocess_state)) completed = 5;
        else if (download?.postprocess_state) current = 4;
        else completed = 4;
      } else if (download?.phase === 'ingest' || ['remote_done', 'landed'].includes(download?.state)) current = 3;
      else if (download || body.state === 'submitted') current = 2;
      else current = 1;
    }
    if (current >= 0) completed = current;
    if (current === 2 && !failed && download?.state === 'remote_running'
        && typeof download.progress === 'number' && Number.isFinite(download.progress)) fraction = Math.min(1, Math.max(0, download.progress));
    view.flow.toggleAttribute('hidden', !body || ['idle', 'owned'].includes(body.state));
    view.progress.setAttribute('aria-valuenow', String(Math.round((completed + fraction) * 1000) / 1000));
    view.progress.setAttribute('aria-valuetext', download?.state === 'ingested' && download.postprocess_state === 'not_requested'
      ? '流程完成，整理未请求' : `${completed} 个阶段已完成${current >= 0 ? `，${failed ? '未完成' : '当前'}：${['排队', '搜索', '下载', '入库', '整理'][current]}` : ''}`);
    view.progressFill.setAttribute('width', String((completed + fraction) * 20));
    view.steps.forEach((step, index) => {
      const skipped = download?.state === 'ingested' && download.postprocess_state === 'not_requested' && index === 4;
      const state = skipped ? 'skipped' : index < completed ? 'complete' : index === current ? failed ? 'error' : 'current' : 'pending';
      step.dataset.state = state;
      if (index === current) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
      step.querySelector('.flow-mark path').setAttribute('d', STEP_ICON_PATHS[state === 'complete' ? 'check' : state === 'error' ? 'error' : state === 'skipped' ? 'skipped' : 'circle']);
      step.setAttribute('aria-label', `${['排队', '搜索', '下载', '入库', '整理'][index]}，${{complete:'已完成',current:'当前阶段',error:'未完成',skipped:'未请求',pending:'待处理'}[state]}`);
    });
  }

  function applyState(view, body) {
    if (view.identity.resolve) {
      view.identity.code = body.code;
      view.identity.resolve = false;
      view.heading.textContent = body.code;
    }
    view.state = body.state;
    view.tracking = tracking(body);
    view.queryOnly = view.tracking;
    if (!view.queryOnly) attempts.delete(comparisonKey(view.identity.code));
    const download = body.download;
    const known = download && ['submitted', 'remote_running', 'remote_done', 'landed', 'ingested', 'failed', 'cancelled', 'stalled'].includes(download.state);
    let label = body.stage === 'submitting' ? '正在提交网盘' : LABELS[body.state];
    renderFlow(view, body);
    if (known && typeof download.label === 'string') {
      label = download.label.slice(0, 80);
      if (download.state === 'ingested' && download.postprocess_state !== 'not_requested'
          && typeof download.postprocess_label === 'string') label += ` · ${download.postprocess_label.slice(0, 80)}`;
      if (download.state === 'remote_running' && typeof download.progress === 'number' && Number.isFinite(download.progress)) {
        const percent = Math.round(Math.min(1, Math.max(0, download.progress)) * 100);
        label += ` · ${percent}%`;
      }
    }
    view.statusText = label;
    view.note.textContent = label;
    view.note.dataset.variant = body.state === 'failed' || download?.postprocess_state === 'failed' ? 'error' : 'secondary';
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
      renderFlow(view, { state: 'pending' });
      view.progress.removeAttribute('aria-valuenow');
      view.progress.setAttribute('aria-valuetext', '等待 Peach 确认任务状态');
    }
    render(view);
    const deadline = Date.now() + 120_000;
    try {
      let body = await request(config, view.identity.code, view.identity.source, method, Boolean(view.identity.resolve));
      if (!alive(view)) return;
      applyState(view, body);
      for (let count = 0; tracking(body) && count < 30 && Date.now() < deadline; count++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!alive(view)) return;
        body = await request(config, view.identity.code, view.identity.source, 'GET');
        if (!alive(view)) return;
        applyState(view, body);
      }
      if (tracking(body)) view.note.textContent = `${view.statusText}，可查询状态。`;
    } catch (error) {
      if (alive(view)) {
        view.queryOnly = true;
        if (view.flow.hasAttribute('hidden')) {
          renderFlow(view, { state: 'pending' });
          view.progress.removeAttribute('aria-valuenow');
          view.progress.setAttribute('aria-valuetext', '连接异常，任务状态待确认');
        } else view.progress.setAttribute('aria-valuetext', view.progress.hasAttribute('aria-valuenow')
          ? '连接异常，显示最近一次确认的阶段' : '连接异常，任务状态待确认');
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
    if (!item || !document.body) { refreshUpdateEntry(); return; }
    // Shadow DOM 隔离宿主样式。
    document.getElementById(ROOT_ID)?.remove();
    const { root, shadow } = surface(ROOT_ID, 'Peach 入库');
    const panel = element('section', 'panel');
    panel.id = `${ROOT_ID}-panel`;
    const bar = element('header', 'bar');
    const label = element('strong', '', item.conflict ? '番号待核对' : item.code || '作品番号');
    const summary = element('span', 'bar-summary');
    summary.hidden = true;
    const heading = element('div', 'bar-heading');
    heading.append(label, summary);
    const actions = element('div', 'bar-actions');
    const settingsButton = control('Peach 设置', { icon: 'settings' });
    settingsButton.addEventListener('click', configure);
    const collapse = control('折叠 Peach 详情', { icon: 'collapse' });
    collapse.setAttribute('aria-expanded', 'true');
    collapse.setAttribute('aria-controls', `${ROOT_ID}-body`);
    const hide = control('隐藏 Peach 面板', { icon: 'close' });
    actions.append(settingsButton, collapse, hide);
    bar.append(heading, actions);
    const body = element('div', 'body');
    body.id = `${ROOT_ID}-body`;
    const button = control('加入 Peach 馆藏', { primary: true });
    button.dataset.action = 'add';
    const note = element('p', 'geist-note');
    note.setAttribute('role', 'status');
    note.setAttribute('aria-label', 'Peach 任务状态');
    note.setAttribute('aria-live', 'polite');
    // 结构与尺寸复用 Peach 生产 Progress 的 SVG 快照。
    const progress = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [name, value] of Object.entries({ role: 'progressbar', 'aria-label': '整体任务进度',
      'aria-valuemin': '0', 'aria-valuemax': '5', viewBox: '0 0 100 1', preserveAspectRatio: 'none', class: 'task-progress' })) progress.setAttribute(name, value);
    const progressFill = document.createElementNS(progress.namespaceURI, 'rect');
    const progressTrack = document.createElementNS(progress.namespaceURI, 'rect');
    for (const [rect, width, style] of [[progressTrack, '100', 'track'], [progressFill, '0', 'fill']]) {
      rect.setAttribute('width', width); rect.setAttribute('height', '1'); rect.setAttribute('class', style);
    }
    progress.append(progressTrack, progressFill);
    for (const point of [20, 40, 60, 80]) {
      const stop = document.createElementNS(progress.namespaceURI, 'rect');
      stop.setAttribute('x', String(point - .4)); stop.setAttribute('width', '.4'); stop.setAttribute('height', '1'); stop.setAttribute('class', 'stop');
      progress.append(stop);
    }
    const flow = element('div', 'flow');
    flow.hidden = true;
    const stepList = element('ol', 'flow-steps');
    stepList.setAttribute('aria-label', '整体任务阶段');
    const steps = ['排队', '搜索', '下载', '入库', '整理'].map(label => {
      const step = element('li', 'flow-step');
      const mark = element('span', 'flow-mark'); mark.setAttribute('aria-hidden', 'true'); mark.append(stepMark());
      step.append(mark, element('span', 'flow-label', label)); stepList.append(step); return step;
    });
    flow.append(progress, stepList);
    body.append(note, flow, button, updateSection());
    panel.append(bar, body);
    const launcher = control('展开 Peach 面板');
    launcher.classList.add('launcher');
    launcher.setAttribute('aria-label', '展开 Peach 面板');
    launcher.setAttribute('aria-controls', panel.id);
    launcher.setAttribute('aria-expanded', 'false');
    const logo = document.createElement('img');
    logo.src = PEACH_LOGO;
    logo.alt = '';
    logo.setAttribute('aria-hidden', 'true');
    launcher.replaceChildren(logo);
    launcher.hidden = true;
    shadow.append(panel, launcher);
    const view = { root, panel, body, launcher, collapse, summary, button, note, flow, steps, progress, progressFill, heading: label, settings: settingsButton, identity: item, url: location.href, generation, state: 'idle', busy: false, tracking: false, queryOnly: attempts.has(comparisonKey(item.code)) };
    current = view;
    refreshUpdateEntry();
    if (settingsView?.dialog.open) {
      root.setAttribute('data-settings-open', '');
      root.inert = true;
    }
    collapse.addEventListener('click', () => present(view, panelMode === 'collapsed' ? 'expanded' : 'collapsed', true));
    hide.addEventListener('click', () => present(view, 'minimized', true));
    launcher.addEventListener('click', () => {
      present(view, 'expanded', true);
      if (!view.identity.conflict && configuration() && !view.busy) void query(view);
    });
    note.textContent = item.conflict ? '页面身份不一致，请核对番号。' : configuration() ? '正在查询 Peach 馆藏' : '配置地址与令牌后，即可加入 Peach 馆藏。';
    button.addEventListener('click', () => {
      if (!alive(view) || view.busy || view.button.disabled) return;
      if (!configuration()) { configure(); return; }
      void query(view, view.queryOnly || ACTIVE.has(view.state) ? 'GET' : 'POST');
    });
    render(view);
    present(view, panelMode);
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
  if (typeof GM_addValueChangeListener === 'function') {
    for (const key of [STORAGE_INSTALLED, STORAGE_UPDATES]) updateListeners.push(GM_addValueChangeListener(key, () => {
      updateCache = readUpdateCache(); paintAllUpdates();
    }));
  }
  document.addEventListener('visibilitychange', updateVisibility);
  addEventListener('pagehide', event => { if (!event.persisted) disposeUpdates(); });
  scheduleUpdateCheck();
})();
