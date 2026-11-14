import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import type { Browser, Page } from 'playwright-core';
import { launch, VIEWPORTS } from './harness.ts';

interface Site {
  id: string; label: string; kind: string; domains: string[]; mode: 'automatic' | 'selection';
  detail_pattern?: string; selectors?: string[]; query_keys?: string[];
}
const MANIFEST: { version: number; sites: Site[] } = JSON.parse(readFileSync(
  new URL('../jav-sites.json', import.meta.url), 'utf8'));
const SCRIPT = readFileSync(new URL('../dist/peach-jav.user.js', import.meta.url), 'utf8');
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const TOKEN = 'test-only-peach-jav-secret-8b4d';
const BASE = 'https://peach.example.invalid';
const ROOT = '#peach-jav-action';
type State = 'idle' | 'queued' | 'searching' | 'submitted' | 'ingested' | 'owned' | 'failed' | 'no_match';
type Body = { ok: boolean; code: string; state: State; message: string; stage?: string; ended_key?: string; dismissed?: boolean;
  retry_at?: string; retry_attempt?: number; retry_limit?: number; retry_exhausted?: boolean;
  download?: { state: string; label: string; phase?: string; progress: number | null; postprocess_state?: string; postprocess_label?: string } };
type Call = { method: string; url: string; headers: Record<string, string>; anonymous: boolean; data?: string };
type MockRequest = Call & { onload(value: unknown): void; ontimeout(): void; onerror(): void; onabort?(): void };
type Mock = {
  peopleItems: Record<string, {name:string;avatar?:string}[]>;
  peopleRequests: string[];
  clipboard: string[];
  calls: Call[];
  reports: MockRequest[];
  updates: MockRequest[];
  updateAutomatic: boolean;
  changed(key: string, value: string | boolean, remote?: boolean): void;
  pending: MockRequest[];
  values: Record<string, string | boolean>;
  menu?: () => void;
  menus: Record<string, () => void>;
  automatic: boolean;
  reply(index: number, body: unknown, status?: number): void;
  activeItems: Body[] | null;
  activePaused?: unknown[];
  activeFailure?: 'offline' | 'auth' | '';
  activeRequests: number;
  dismissals: unknown[];
  dismissStatus: number;
  performer: { name: string; entity_id: number | null; following: boolean } | null;
  performerCalls: Call[];
  performerError: string;
  // 想要：hasWant 为 false 是旧版 Peach（状态里没有 want 键、登记接口 404）；want 为 null 是还没登记。
  hasWant: boolean;
  want: { phase: string } | null;
  wantCalls: string[];
  wantError: string;
};
declare global { interface Window { javMock: Mock } }

function body(state: State, code = 'SSIS-057'): Body {
  return { ok: true, code, state, message: state };
}

async function open(browser: Browser, options: {
  url?: string; title?: string; html?: string; quirks?: boolean; configured?: boolean; viewport?: typeof VIEWPORTS[number]; initial?: State; postState?: State; peopleItems?: Mock['peopleItems']; script?: string; resolved?: string; automatic?: boolean; updateAutomatic?: boolean; updateValues?: Record<string, string | boolean>;
  activeItems?: Body[];
  performer?: Mock['performer'];
  want?: Mock['want'];
} = {}) {
  const viewport = options.viewport || VIEWPORTS[0]!;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(error.message));
  // 所有页面均为内存夹具，不访问来源站点或 Peach 服务。
  await context.route('**/*', route => route.fulfill({
    // FANZA 等来源页没有 doctype，按怪异模式渲染。
    contentType: 'text/html; charset=utf-8', body: `${options.quirks ? '' : '<!doctype html>'}<html><head><meta charset="utf-8"><title>${options.title || 'SSIS-057 作品详情'}</title></head><body>${options.html ?? '<h1>SSIS-057 作品详情</h1>'}</body></html>`,
  }));
  await page.addInitScript(({ configured, token, base, initial, postState, peopleItems, resolved, automatic, version, updateAutomatic, updateValues, activeItems, performer, hasWant, want }) => {
    const listeners = new Map<number, { key: string; callback: (key: string, oldValue: string | boolean, newValue: string | boolean, remote: boolean) => void }>();
    let nextListener = 0;
    const mock: Mock = {
      calls: [], reports: [], pending: [], updates: [], automatic, updateAutomatic, menus: {}, peopleItems, peopleRequests:[], clipboard: [], activeItems, activeRequests: 0, dismissals: [], dismissStatus: 200, performer, performerCalls: [], performerError: '', hasWant, want, wantCalls: [], wantError: '',
      values: { ...(configured ? { 'peach.jav.base': base, 'peach.jav.token': token } : {}), ...updateValues },
      changed(key, value, remote = false) {
        const previous = mock.values[key] ?? '';
        mock.values[key] = value;
        for (const listener of listeners.values()) if (listener.key === key) listener.callback(key, previous, value, remote);
      },
      reply(index, value, status = 200) {
        mock.pending[index]!.onload({ status, responseText: JSON.stringify(value) });
      },
    };
    window.javMock = mock;
    Object.assign(window, {
      GM_getValue: (key: string, fallback: string | boolean) => mock.values[key] ?? fallback,
      GM_setValue: (key: string, value: string | boolean) => { mock.changed(key, value); },
      GM_info: { script: { version } },
      GM_setClipboard: (text: string) => { mock.clipboard.push(text); },
      GM_addValueChangeListener: (key: string, callback: (key: string, oldValue: string | boolean, newValue: string | boolean, remote: boolean) => void) => {
        const id = ++nextListener; listeners.set(id, { key, callback }); return id;
      },
      GM_removeValueChangeListener: (id: number) => listeners.delete(id),
      GM_registerMenuCommand: (label: string, callback: () => void) => { mock.menu = callback; mock.menus[label] = callback; },
      GM_xmlhttpRequest: (request: MockRequest) => {
        if(new URL(request.url).pathname==='/api/jav-browser/people'){
          mock.peopleRequests.push(request.url);
          setTimeout(()=>request.onload({status:200,responseText:JSON.stringify({ok:true,source:'local-cache',items:Object.fromEntries(new URL(request.url).searchParams.get('codes')!.split(',').map(code=>[code,mock.peopleItems[code]||[]]))})}),0);
          return {abort:()=>request.onabort?.()};
        }
        if (request.url.includes('update.sleazyfork.org/') || request.url.endsWith('/api/jav-browser/updates')) {
          mock.updates.push(request);
          if (mock.updateAutomatic) setTimeout(() => request.onload({ status: 200, finalUrl: request.url,
            responseText: request.url.includes('update.sleazyfork.org/')
              ? `// ==UserScript==\n// @name Peach Userscript\n// @namespace https://github.com/peach-mitao/peach-userscript\n// @version ${version}\n// ==/UserScript==`
              : JSON.stringify({ runtime: { version: '1.0.0', build_id: 'fixture' }, release: { state: 'current' },
                userscript: { version, minimum_version: '0.5.1', install_url: '/integrations/peach-jav.user.js' } }) }), 0);
          return { abort: () => request.onabort?.() };
        }
        if (request.url.endsWith('/api/jav-browser/errors')) { mock.reports.push(request); return; }
        // 默认按旧版 Peach 没有任务列表接口作答；共享进度用例给出 activeItems。
        if (request.url.endsWith('/api/jav-browser/active')) {
          mock.activeRequests++;
          // activeFailure 模拟连不上 Peach（offline）或令牌失效（auth）。
          if (mock.activeFailure === 'offline') { setTimeout(() => request.onerror(), 0); return { abort: () => request.onabort?.() }; }
          if (mock.activeFailure === 'auth') { setTimeout(() => request.onload({ status: 401, responseText: '{"detail":"token"}' }), 0); return { abort: () => request.onabort?.() }; }
          setTimeout(() => request.onload(mock.activeItems ? { status: 200, responseText: JSON.stringify({ ok: true, items: mock.activeItems,
            ...(mock.activePaused ? { paused: mock.activePaused } : {}) }) }
            : { status: 404, responseText: '{"detail":"Not Found"}' }), 0);
          return { abort: () => request.onabort?.() };
        }
        // 女优页订阅：performer 为空时按旧版 Peach 回 404；performerError 模拟订阅被拒。
        if (new URL(request.url).pathname === '/api/jav-browser/performer') {
          mock.performerCalls.push({ method: request.method, url: request.url, headers: request.headers,
            anonymous: request.anonymous, ...(request.data ? { data: request.data } : {}) });
          const posted = request.data ? JSON.parse(request.data) : null;
          setTimeout(() => {
            if (!mock.performer) { request.onload({ status: 404, responseText: '{"detail":"Not Found"}' }); return; }
            if (posted && mock.performerError) { request.onload({ status: 400, responseText: JSON.stringify({ detail: mock.performerError }) }); return; }
            if (posted) mock.performer = { ...mock.performer, following: posted.enabled, entity_id: mock.performer.entity_id ?? 77 };
            request.onload({ status: 200, responseText: JSON.stringify({ ok: true, ...mock.performer }) });
          }, 0);
          return { abort: () => request.onabort?.() };
        }
        // 确认已结束的任务：按键或全部标为 dismissed，回新的任务列表；dismissStatus 设 404 模拟旧版 Peach。
        if (request.url.endsWith('/api/jav-browser/dismiss')) {
          const body = JSON.parse(request.data!);
          mock.dismissals.push(body);
          if (mock.dismissStatus === 200 && mock.activeItems) mock.activeItems = mock.activeItems.map(item =>
            item.ended_key && (body.all || body.keys.includes(item.ended_key)) ? { ...item, dismissed: true } : item);
          setTimeout(() => request.onload(mock.dismissStatus === 200 ? { status: 200, responseText: JSON.stringify({ ok: true, items: mock.activeItems,
            ...(mock.activePaused ? { paused: mock.activePaused } : {}) }) }
            : { status: mock.dismissStatus, responseText: '{"detail":"Not Found"}' }), 0);
          return { abort: () => request.onabort?.() };
        }
        // 登记想要：旧版 Peach 回 404；wantError 模拟登记失败；成功后单条状态带上 want。
        if (request.url.endsWith('/api/jav-browser/want')) {
          const code = JSON.parse(request.data!).code as string;
          mock.wantCalls.push(code);
          setTimeout(() => {
            if (!mock.hasWant) { request.onload({ status: 404, responseText: '{"detail":"Not Found"}' }); return; }
            if (mock.wantError) { request.onload({ status: 400, responseText: JSON.stringify({ detail: mock.wantError }) }); return; }
            mock.want = { phase: 'searching' };
            request.onload({ status: 200, responseText: JSON.stringify({ ok: true, code, state: initial, message: initial,
              want: { phase: 'searching', created: true } }) });
          }, 0);
          return { abort: () => request.onabort?.() };
        }
        mock.calls.push({ method: request.method, url: request.url, headers: request.headers,
          anonymous: request.anonymous, ...(request.data ? { data: request.data } : {}) });
        mock.pending.push(request);
        if (mock.automatic) setTimeout(() => {
          // 商品号识别以 Peach 归一后的番号作答。
          const identify = new URL(request.url).pathname.endsWith('/identify');
          const code = (identify && resolved) || (request.data ? JSON.parse(request.data).code : new URL(request.url).searchParams.get('code')) || resolved || 'SSIS-057';
          const state = request.method === 'POST' ? postState || initial : initial;
          // 单条状态与 identify 带 want（新版 Peach）；加入番号的 POST 响应不带。
          const want = mock.hasWant && request.method !== 'POST' ? { want: mock.want } : {};
          request.onload({ status: 200, responseText: JSON.stringify({ ok: true, code, state, message: state, ...want }) });
        }, 0);
      },
    });
  }, { configured: options.configured !== false, token: TOKEN, base: BASE, initial: options.initial || 'idle', postState: options.postState, peopleItems: options.peopleItems || {}, resolved: options.resolved,
    automatic: options.automatic !== false, version: VERSION, updateAutomatic: options.updateAutomatic !== false, updateValues: options.updateValues || {},
    activeItems: options.activeItems || null, performer: options.performer || null,
    hasWant: Object.hasOwn(options, 'want'), want: options.want ?? null });
  await page.goto(options.url || 'https://missav.ws/en/ssis-057?private=value#player');
  await page.clock.install();
  await page.addScriptTag({ content: options.script ?? SCRIPT });
  return { page, problems, close: () => context.close() };
}

const button = (page: Page) => page.locator(ROOT).locator('[data-action="add"]');
const settingsDialog = (page: Page) => page.locator('#peach-jav-settings').getByRole('dialog');
async function pairingStorage(page: Page) {
  const values = await page.evaluate(() => window.javMock.values);
  const {
    'peach.jav.installed-version': installed,
    'peach.jav.update-attempted-at': attempted,
    'peach.jav.updates': updates,
    'peach.jav.display': display,
    'peach.jav.enabled': enabled,
    'peach.jav.success-sound': sound,
    ...pairing
  } = values;
  if (sound !== undefined) assert.equal(typeof sound, 'boolean');
  if (installed !== undefined) assert.equal(installed, VERSION);
  if (attempted !== undefined) assert.match(String(attempted), /^\d+$/);
  if (updates !== undefined) assert.deepEqual(JSON.parse(String(updates)), { script: { version: VERSION } });
  if (display !== undefined) assert.ok(['jav','always'].includes(String(display)));
  if (enabled !== undefined) assert.equal(typeof enabled,'boolean');
  return pairing;
}
async function fillSettings(page: Page, base: string, token: string) {
  const dialog = settingsDialog(page);
  await dialog.getByLabel('Peach 地址', { exact: true }).fill(base);
  await dialog.getByLabel('专用令牌', { exact: true }).fill(token);
  await dialog.getByRole('button', { name: '保存设置', exact: true }).click();
}
async function ready(page: Page, name = '加入 Peach 馆藏') {
  await page.waitForFunction(({ root, label }) => {
    const button = document.querySelector(root)?.shadowRoot?.querySelector('[data-action="add"]');
    return button?.textContent === label && button.getAttribute('aria-busy') === 'false';
  }, { root: ROOT, label: name }, { timeout: 15_000 }).catch(async error => {
    const panel = await page.locator(ROOT).evaluate(root => ({ button: root.shadowRoot?.querySelector('[data-action="add"]')?.textContent,
      status: root.shadowRoot?.querySelector('p')?.textContent,
      fields: [...document.querySelectorAll('dt, dd')].map(field => ({ name: field.tagName, text: field.textContent })) })).catch(() => '未取得');
    throw new Error(`${(error as Error).message}\n${JSON.stringify(panel)}`);
  });
}
async function pending(page: Page, count: number) {
  await page.waitForFunction(value => window.javMock.calls.length === value, count);
}
async function reply(page: Page, index: number, value: Body) {
  await page.evaluate(({ index, value }) => window.javMock.reply(index, value), { index, value });
}

async function initialRows(page: Page, codes: string[]) {
  for (const [index, code] of codes.entries()) {
    await pending(page, index + 1);
    assert.equal(await page.evaluate(index => window.javMock.calls[index]!.method, index), 'GET');
    await reply(page, index, body('idle', code));
  }
}

async function selectCode(page: Page) {
  await page.locator('#selected-code').evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    window.javMock.menus['开启']!();
  });
}

const AUTOMATIC: Record<string, { path: string; title: string; html: string; source?: string; code?: string }> = {
  dmm: { path: '/av/content/?id=ssis00519&private=secret#player', source: '/av/content/?id=ssis00519', code: 'SSIS-519', title: '作品详情', html: '<h1>作品详情</h1>' },
  mgs: { path: '/product/product_detail/300MIUM-1239/', code: '300MIUM-1239', title: '作品详情', html: '<h1>作品详情</h1>' },
  // FANZA 剪辑页地址里的 img-<商品号>-<序号> 由 Peach 按 DMM 商品号换算成番号。
  'fanza-clip': { path: '/moment?id=img-saba00978-011&i3_ref=fvideo', source: '/moment?id=img-saba00978-011', code: 'SABA-978',
    title: '作品详情', html: '<h1>作品详情</h1>' },
  // FC2 商品页地址里只有编号，番号由 Peach 换算成 FC2-PPV-<编号>。
  'fc2-market': { path: '/article/4900901/', code: 'FC2-PPV-4900901', title: '作品详情', html: '<h1>作品详情</h1>' },
  missav: { path: '/en/ssis-057', title: 'SSIS-057', html: '<h1>SSIS-057 作品</h1>' },
  jable: { path: '/videos/ssis-057/', title: 'Jable', html: '<div class="video-info"><h4>SSIS-057 作品</h4></div>' },
  'jav-guru': { path: '/12345/ssis-057-detail/', title: 'JAV.guru', html: '<h1 class="entry-title">[SSIS-057] 作品</h1>' },
  njav: { path: '/en/v/ssis-057', title: 'NJAV / 123AV', html: '<h1>SSIS-057 作品</h1><dl><dt>Code</dt><dd>SSIS-057</dd></dl>' },
  javtiful: { path: '/video/12345/ssis-057', title: 'JAVtiful', html: '<h1>SSIS-057 作品</h1>' },
  '7mmtv': { path: '/ja/censored_content/12345/SSIS-057.html', title: '7mmtv', html: '<h1>SSIS-057 作品</h1>' },
  javdb: { path: '/v/ABP123', title: 'JavDB', html: '<h2 class="title">作品详情</h2><div class="panel-block"><strong>番號:</strong><span class="value">SSIS-057</span></div>' },
  javbus: { path: '/SSIS-057', title: 'JavBus', html: '<h3>作品详情</h3><div class="info"><p><span class="header">識別碼:</span> SSIS-057</p></div>' },
  javlibrary: { path: '/cn/?v=opaque_123&private=secret#player', source: '/cn/?v=opaque_123', title: 'JavLibrary',
    html: '<div id="video_id"><span class="text">SSIS-057</span></div><div id="video_title">作品详情</div>' },
  jav321: { path: '/video/opaque123', title: 'Jav321', html: '<h3>作品详情</h3><div class="panel-body"><b>品番:</b> SSIS-057<br><b>推荐:</b> ABW-123</div>' },
  avbase: { path: '/works/test-maker:SSIS-057', title: 'AVBase',
    html: '<h1>作品详情</h1><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"work":{"work_id":"SSIS-057","recommendations":[{"work_id":"ABW-123"}]}}}}</script>' },
  javdatabase: { path: '/movies/ssis-057/', title: 'JAVDatabase', html: '<h1>SSIS-057 作品</h1>' },
};

describe('JAV 用户脚本', () => {
  let browser: Browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  describe('独立更新检查', () => {
    const metadata = (version: string, namespace = 'https://github.com/peach-mitao/peach-userscript', name = 'Peach Userscript') =>
      `// ==UserScript==\n// @name ${name}\n// @namespace ${namespace}\n// @version ${version}\n// ==/UserScript==`;
    const updatePanel = (page: Page) => page.locator('#peach-jav-updates');
    const waitUpdates = (page: Page, count: number) => page.waitForFunction(count => window.javMock.updates.length === count, count);
    const answerMetadata = (page: Page, version: string, namespace?: string, name?: string) => page.evaluate(({ text }) => {
      const request = window.javMock.updates.at(-1)!;
      request.onload({ status: 200, finalUrl: request.url, responseText: text });
    }, { text: metadata(version, namespace, name) });

    for (const example of [
      { script: false, peach: false }, { script: true, peach: false },
      { script: false, peach: true }, { script: true, peach: true },
    ]) it(`浮卡仅显示可用更新，脚本=${example.script}、Peach=${example.peach}`, async () => {
      const { page, close } = await open(browser, { updateAutomatic: false });
      try {
        await waitUpdates(page, 2);
        await page.evaluate(({ script, peach, current }) => {
          window.javMock.updates[0]!.onload({status:200,responseText:`// ==UserScript==\n// @name Peach · JAV 入库\n// @namespace https://github.com/peach-mitao/peach-userscript\n// @version ${script ? '9.2.0' : current}\n// ==/UserScript==`});
          window.javMock.updates[1]!.onload({status:200,responseText:JSON.stringify({
            runtime:{version:'1.0.0',build_id:'fixture'},release:peach ? {state:'available',latest_version:'1.1.0'} : {state:'current'},
            userscript:{version:current,minimum_version:'0.5.1',install_url:'/integrations/peach-jav.user.js'},
          })});
        }, { ...example, current: VERSION });
        const updates = page.locator(ROOT).getByRole('region', {name:'检查更新'});
        assert.equal(await updates.isVisible(), example.script || example.peach);
        assert.equal(await updates.getByRole('link', {name:'更新用户脚本',exact:true}).count(), Number(example.script));
        assert.equal(await updates.getByRole('link', {name:'查看 Peach 更新',exact:true}).count(), Number(example.peach));
        assert.equal(await updates.getByRole('button',{name:'检查更新',exact:true}).count(),0);
        if (example.script && example.peach) {
          // 两种更新各占一个蓝色提示框，靠标题区分，按钮在各自框内。
          const boxes = updates.locator('.notice[data-tone=info]');
          assert.deepEqual(await boxes.locator('.notice-title').allTextContents(), ['用户脚本 v9.2.0 可更新。', 'Peach 1.1.0 可更新。']);
          assert.deepEqual(await boxes.evaluateAll(nodes => nodes.map(node => node.querySelectorAll('a').length)), [1, 1]);
        }
        if (!example.script && !example.peach) {
          await page.locator(ROOT).getByRole('button',{name:'Peach 设置',exact:true}).click();
          assert.equal(await settingsDialog(page).getByRole('button',{name:'检查更新',exact:true}).count(),1);
        }
      } finally { await close(); }
    });

    for (const example of [
      { name: '脚本可更新', script: 'ok', peach: false, check: 0 },
      { name: 'Peach 可更新', script: 'current', peach: true, check: 0 },
      { name: '手动检查时脚本来源没查通、Peach 可更新', script: 'error', peach: true, check: 1 },
    ] as const) it(`设置页已提示更新时不再显示「检查更新」，手动检查有来源没查通时保留：${example.name}`, async () => {
      const { page, close } = await open(browser, { updateAutomatic: false });
      try {
        await waitUpdates(page, 2);
        // 只有手动检查会记下没查通的来源；这一组先答完自动检查，再从菜单手动查一次。
        const manual = example.script === 'error';
        if (manual) {
          await page.evaluate(() => { window.javMock.updates[0]!.onerror(); window.javMock.updates[1]!.onerror(); });
          await page.evaluate(() => window.javMock.menus['检测更新']!());
          await waitUpdates(page, 4);
        }
        await page.evaluate(({ script, peach, current, offset }) => {
          const remote = window.javMock.updates[offset]!;
          if (script === 'error') remote.onerror();
          else remote.onload({status:200,responseText:`// ==UserScript==\n// @name Peach Userscript\n// @namespace https://github.com/peach-mitao/peach-userscript\n// @version ${script === 'ok' ? '9.2.0' : current}\n// ==/UserScript==`});
          window.javMock.updates[offset + 1]!.onload({status:200,responseText:JSON.stringify({
            runtime:{version:'1.0.0',build_id:'fixture'},release:peach ? {state:'available',latest_version:'1.1.0'} : {state:'current'},
            userscript:{version:current,minimum_version:'0.5.1',install_url:'/integrations/peach-jav.user.js'},
          })});
        }, { ...example, current: VERSION, offset: manual ? 2 : 0 });
        if (!manual) await page.locator(ROOT).getByRole('button',{name:'Peach 设置',exact:true}).click();
        const dialog = settingsDialog(page);
        if (manual) await dialog.getByRole('alert').waitFor();
        await dialog.locator('.notice[data-tone=info]').first().waitFor();
        assert.equal(await dialog.getByRole('button',{name:'检查更新',exact:true}).count(), example.check);
      } finally { await close(); }
    });

    it('未配对且没有影片身份的匹配页仍提供设置和独立菜单，元数据请求不带令牌', async () => {
      const { page, close, problems } = await open(browser, { url: 'https://missav.ws/', title: '首页', html: '<h1>首页</h1>',
        configured: false, updateAutomatic: false });
      try {
        await waitUpdates(page, 1);
        assert.equal(await page.locator(ROOT).count(), 0);
        assert.equal(await updatePanel(page).getByRole('button', { name: 'Peach 设置与更新' }).count(), 1);
        const call = await page.evaluate(() => {
          const request = window.javMock.updates[0]!;
          return { url: request.url, anonymous: request.anonymous, headers: request.headers };
        });
        assert.equal(new URL(call.url).hostname, 'update.sleazyfork.org');
        assert.equal(call.anonymous, true);
        assert.deepEqual(call.headers, { Accept: 'text/plain' });
        await answerMetadata(page, '9.1.0');
        await page.waitForFunction(() => document.querySelector('#peach-jav-updates')?.shadowRoot?.textContent?.includes('v9.1.0 可更新'));
        assert.equal(await updatePanel(page).getByRole('link', { name: '更新用户脚本' }).getAttribute('href'),
          'https://update.sleazyfork.org/scripts/600821/Peach%20%E7%94%A8%E6%88%B7%E8%84%9A%E6%9C%AC.user.js');
        assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.installed-version']), VERSION);
        await page.evaluate(() => window.javMock.menus['检测更新']!());
        await waitUpdates(page, 2);
        // 已经提示了可更新，设置页不再给「检查更新」。
        assert.equal(await settingsDialog(page).getByRole('button', { name: '检查更新', exact: true }).count(), 0);
        await answerMetadata(page, '9.2.0', undefined, 'Peach · JAV 入库');
        await page.waitForFunction(() => document.querySelector('#peach-jav-updates')?.shadowRoot?.textContent?.includes('v9.2.0 可更新'));
        assert.deepEqual(problems, []);
      } finally { await close(); }
    });

    it('手动检查可重复请求，身份错误和网络失败不会显示已最新', async () => {
      const { page, close } = await open(browser, { url: 'https://missav.ws/', title: '首页', html: '', configured: false,
        updateAutomatic: false, updateValues: { 'peach.jav.update-attempted-at': String(Date.now()) } });
      try {
        await page.evaluate(() => window.javMock.menus['检测更新']!());
        await waitUpdates(page, 1);
        await answerMetadata(page, '9.1.0', 'https://untrusted.example/script');
        await settingsDialog(page).getByRole('alert').filter({ hasText: '脚本发行状态未取得' }).waitFor();
        assert.equal(await settingsDialog(page).getByRole('link', { name: '更新用户脚本' }).count(), 0);
        await settingsDialog(page).getByRole('button', { name: '检查更新', exact: true }).click();
        await waitUpdates(page, 2);
        await page.evaluate(() => window.javMock.updates.at(-1)!.onerror());
        assert.equal((await settingsDialog(page).textContent())!.includes('已是最新'), false);
        await settingsDialog(page).getByRole('button', { name: '检查更新', exact: true }).click();
        await waitUpdates(page, 3);
        await answerMetadata(page, '9.1.0', undefined, 'Other Script');
        await settingsDialog(page).getByRole('alert').filter({ hasText: '脚本发行状态未取得' }).waitFor();
        assert.equal(await settingsDialog(page).getByRole('link', { name: '更新用户脚本' }).count(), 0);
        assert.equal(await page.evaluate(() => window.javMock.calls.length), 0);
      } finally { await close(); }
    });

    it('已配对的更新读取使用专用令牌且安装链接固定在该 Peach origin', async () => {
      const { page, close } = await open(browser, { url: 'https://missav.ws/', title: '首页', html: '', updateAutomatic: false });
      try {
        await waitUpdates(page, 2);
        await page.evaluate(() => {
          const remote = window.javMock.updates[0]!;
          remote.onload({ status: 200, responseText: '// ==UserScript==\n// @name Peach · JAV 入库\n// @namespace https://github.com/peach-mitao/peach-userscript\n// @version 0.5.2\n// ==/UserScript==' });
          const local = window.javMock.updates[1]!;
          local.onload({ status: 200, responseText: JSON.stringify({ runtime: { version: '1.0.0', build_id: 'fixture' },
            release: { state: 'available', latest_version: '1.1.0' },
            userscript: { version: '9.2.0', minimum_version: '0.5.1', install_url: 'https://untrusted.example/install.user.js' } }) });
        });
        const local = await page.evaluate(() => {
          const request = window.javMock.updates[1]!;
          return { url: request.url, headers: request.headers };
        });
        assert.equal(local.url, `${BASE}/api/jav-browser/updates`);
        assert.equal(local.headers.Authorization, `Bearer ${TOKEN}`);
        await updatePanel(page).getByRole('link', { name: '更新用户脚本' }).waitFor();
        assert.equal(await updatePanel(page).getByRole('link', { name: '更新用户脚本' }).getAttribute('href'), `${BASE}/integrations/peach-jav.user.js`);
        assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.installed-version']), VERSION);
      } finally { await close(); }
    });

    for (const example of [
      { remote: '9.3.0', local: '9.2.0', version: '9.3.0', source: 'sleazy' },
      { remote: '9.2.0', local: '9.3.0', version: '9.3.0', source: 'peach' },
      { remote: '9.3.0', local: '9.3.0', version: '9.3.0', source: 'sleazy' },
      { remote: null, local: '9.2.0', version: '9.2.0', source: 'peach' },
      { remote: '9.2.0', local: null, version: '9.2.0', source: 'sleazy' },
      { remote: '9.10.0', local: '9.9.0', version: '9.10.0', source: 'sleazy' },
    ]) it(`双源更新 remote=${example.remote} local=${example.local} 采用 ${example.source} ${example.version}`, async () => {
      const { page, close } = await open(browser, {url:'https://missav.ws/',title:'首页',html:'',updateAutomatic:false});
      try {
        await waitUpdates(page, 2);
        const requests = await page.evaluate(example => {
          const [remote, local] = window.javMock.updates;
          if (example.remote) remote!.onload({status:200,responseText:`// ==UserScript==\n// @name Peach · JAV 入库\n// @namespace https://github.com/peach-mitao/peach-userscript\n// @version ${example.remote}\n// ==/UserScript==`});
          else remote!.onerror();
          if (example.local) local!.onload({status:200,responseText:JSON.stringify({runtime:{version:'1.0.0',build_id:'fixture'},
            release:{state:'current'},userscript:{version:example.local,minimum_version:'0.5.1'}})});
          else local!.onerror();
          return window.javMock.updates.map(request=>({url:request.url,headers:request.headers}));
        },example);
        assert.equal(new URL(requests[0]!.url).hostname,'update.sleazyfork.org');
        assert.equal(requests[0]!.headers.Authorization,undefined);
        assert.equal(requests[1]!.url,`${BASE}/api/jav-browser/updates`);
        const install = updatePanel(page).getByRole('link',{name:'更新用户脚本',exact:true});
        await install.waitFor();
        assert.equal(await install.getAttribute('href'),example.source==='peach'?`${BASE}/integrations/peach-jav.user.js`:'https://update.sleazyfork.org/scripts/600821/Peach%20%E7%94%A8%E6%88%B7%E8%84%9A%E6%9C%AC.user.js');
        assert.ok((await updatePanel(page).getByLabel('用户脚本更新状态').innerText()).includes(`v${example.version}`));
      } finally { await close(); }
    });

    it('跨标签安装标记和同页新实例提示刷新，发行检查不写安装标记', async () => {
      const { page, close } = await open(browser, { url: 'https://missav.ws/', title: '首页', html: '', configured: false });
      try {
        await page.evaluate(() => window.javMock.changed('peach.jav.installed-version', '9.3.0', true));
        await updatePanel(page).getByRole('button', { name: '刷新本页' }).waitFor();
        assert.ok((await updatePanel(page).getByLabel('用户脚本更新状态').innerText()).includes('脚本已更新至 v9.3.0'));
        await page.addScriptTag({ content: SCRIPT.replace(`const SCRIPT_VERSION = "${VERSION}"`, 'const SCRIPT_VERSION = "9.4.0"') });
        await page.waitForFunction(() => document.querySelector('#peach-jav-updates')?.shadowRoot?.textContent?.includes('v9.4.0'));
        assert.equal(await page.locator('#peach-jav-updates').count(), 1);
      } finally { await close(); }
    });

    it('打开安装入口后引导刷新，取消安装不伪造成功，实际安装标记到达后切换为已更新', async () => {
      const {page,close}=await open(browser,{url:'https://missav.ws/',title:'首页',html:'',configured:false,updateAutomatic:false});
      try {
        await waitUpdates(page,1);await answerMetadata(page,'9.3.0');
        const panel=updatePanel(page);
        const waiting=page.waitForEvent('popup');
        await panel.getByRole('link',{name:'更新用户脚本',exact:true}).click();
        const installer=await waiting;
        assert.equal(await installer.url(),'https://update.sleazyfork.org/scripts/600821/Peach%20%E7%94%A8%E6%88%B7%E8%84%9A%E6%9C%AC.user.js');
        await installer.close();await page.clock.runFor(20);
        await panel.getByRole('button',{name:'刷新本页',exact:true}).waitFor();
        assert.equal(await panel.getByLabel('用户脚本更新状态').innerText(),'在脚本管理器完成更新后，刷新本页即可使用。');
        assert.equal(await page.evaluate(()=>window.javMock.values['peach.jav.installed-version']),VERSION);
        assert.equal(await panel.getByRole('link',{name:'更新用户脚本',exact:true}).count(),1);
        await page.evaluate(()=>window.javMock.changed('peach.jav.installed-version','9.3.0',true));
        assert.equal(await panel.getByLabel('用户脚本更新状态').innerText(),'用户脚本已更新至 v9.3.0，刷新本页即可使用。');
        assert.equal(await panel.getByRole('link',{name:'更新用户脚本',exact:true}).count(),0);
      } finally {await close();}
    });

    it('返回焦点时重读真实元数据，无变化时保留原更新按钮', async () => {
      const {page,close}=await open(browser,{url:'https://missav.ws/',title:'首页',html:'',configured:false,updateAutomatic:false});
      try {
        await waitUpdates(page,1);await answerMetadata(page,'9.2.0');
        await updatePanel(page).getByLabel('用户脚本更新状态').waitFor();
        const connected=await page.evaluate(()=>{
          const node=document.querySelector('#peach-jav-updates')!.shadowRoot!.querySelector('.update-section');
          const button=node!.querySelector('a[data-update-kind=script]');
          window.dispatchEvent(new Event('focus'));
          return button!.isConnected;
        });
        assert.equal(connected,true);
        await page.evaluate(()=>{
          (window as unknown as {GM_info:{script:{version:string}}}).GM_info.script.version='9.3.0';
          window.dispatchEvent(new Event('focus'));
        });
        await updatePanel(page).getByRole('button',{name:'刷新本页',exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>window.javMock.values['peach.jav.installed-version']),'9.3.0');
      } finally {await close();}
    });

    it('自动检查保持每日间隔，隐藏中止在途请求并拒绝迟到结果', async () => {
      const { page, close } = await open(browser, { url: 'https://missav.ws/', title: '首页', html: '', configured: false,
        updateAutomatic: false });
      try {
        await waitUpdates(page, 1);
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await answerMetadata(page, '9.5.0');
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        assert.equal(await page.evaluate(() => window.javMock.updates.length), 1);
        assert.equal(await page.evaluate(() => document.querySelector('#peach-jav-updates')!.shadowRoot!.textContent!.includes('9.5.0')), false);
        await page.clock.fastForward(86400_001);
        await waitUpdates(page, 2);
      } finally { await close(); }
    });
  });

  for (const theme of ['light', 'dark'] as const) it(`${theme} 抓取期间原生禁用且 hover 不改变颜色`, async () => {
    const {page, close} = await open(browser, {automatic:false});
    try {
      await page.emulateMedia({colorScheme:theme});
      await pending(page,1);
      assert.equal(await button(page).isDisabled(),true);
      const colors = () => button(page).evaluate(node => {
        const style=getComputedStyle(node);
        return [style.backgroundColor,style.backgroundImage,style.borderColor,style.color];
      });
      await page.mouse.move(0,0);
      await page.clock.runFor(200);
      const before=await colors();
      await button(page).hover();
      await page.clock.runFor(200);
      assert.deepEqual(await colors(),before);
      await button(page).evaluate(node => (node as HTMLButtonElement).click());
      assert.equal(await page.evaluate(()=>window.javMock.calls.length),1);
      await reply(page,0,body('idle'));
      await ready(page);
      assert.equal(await button(page).isDisabled(),false);
    } finally { await close(); }
  });

  for (const viewport of VIEWPORTS) {
    for (const example of [
      { site: 'dmm', url: 'https://video.dmm.co.jp/av/content/?id=1dandy00899', code: 'DANDY-899', label: 'メーカー品番：' },
      { site: 'dmm', url: 'https://video.dmm.co.jp/av/content/?id=1dandy00851c', code: 'DANDY-851C', label: 'メーカー品番：' },
      { site: 'mgs', url: 'https://www.mgstage.com/product/product_detail/104DANDY-851C/', code: '104DANDY-851C', label: '品番：' },
    ]) {
      it(`${viewport.name} ${example.site} 只按地址识别 ${example.code}，不读页面品番`, async () => {
        const opened = await open(browser, { url: example.url, title: '作品详情', viewport,
          html: `<table><tr><th>配信品番：</th><td>1dandy00899</td></tr><tr><th>${example.label}</th><td>${example.code}</td></tr></table>`, resolved: example.code });
        try {
          await ready(opened.page);
          const url = new URL(await opened.page.evaluate(() => window.javMock.calls[0]!.url));
          assert.equal(url.pathname, '/api/jav-browser/identify');
          assert.equal(url.searchParams.get('code'), null);
          assert.equal(url.searchParams.get('source_url'), example.url);
          assert.equal(await opened.page.locator(ROOT).locator('.bar strong').innerText(), example.code);
          assert.deepEqual(opened.problems, []);
        } finally { await opened.close(); }
      });
    }
  }

  for (const example of [
    { id: '1sdjs00304v', edition: 'bonus', own: '加入特典版', other: '加入通常版', otherEdition: 'regular' },
    { id: '1sdjs00304', edition: 'regular', own: '加入通常版', other: '加入特典版', otherEdition: 'bonus' },
  ]) {
    it(`作品有特典版时${example.own}排在主按钮，另一版作副按钮，入库后两个按钮合成同一状态`, async () => {
      const opened = await open(browser, { url: `https://video.dmm.co.jp/av/content/?id=${example.id}`,
        title: '作品详情', html: '<h1>作品详情</h1>', automatic: false });
      const { page } = opened;
      try {
        await pending(page, 1);
        await reply(page, 0, { ok: true, code: 'SDJS-304', state: 'idle', message: 'idle', edition: example.edition } as Body);
        await ready(page, example.own);
        const alternate = page.locator(ROOT).locator('[data-action="add-alternate"]');
        assert.equal(await alternate.innerText(), example.other);
        await alternate.click();
        await pending(page, 2);
        const posted = await page.evaluate(() => window.javMock.calls[1]!);
        assert.equal(posted.method, 'POST');
        assert.deepEqual(JSON.parse(posted.data!), { code: 'SDJS-304', source_url: `https://video.dmm.co.jp/av/content/?id=${example.id}`,
          edition: example.otherEdition });
        await reply(page, 1, { ok: true, code: 'SDJS-304', state: 'queued', message: 'queued' });
        await page.locator(ROOT).getByRole('status', { name: 'Peach 任务状态' }).filter({ hasText: '已排队' }).waitFor();
        assert.equal(await alternate.isHidden(), true);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  it('没有特典版的作品只有一个添加按钮，提交不指定版本', async () => {
    const opened = await open(browser, { url: 'https://video.dmm.co.jp/av/content/?id=ssis00519', title: '作品详情',
      html: '<h1>作品详情</h1>', automatic: false });
    const { page } = opened;
    try {
      await pending(page, 1);
      await reply(page, 0, { ok: true, code: 'SSIS-519', state: 'idle', message: 'idle' });
      await ready(page);
      assert.equal(await page.locator(ROOT).locator('[data-action="add-alternate"]').isHidden(), true);
      await button(page).click();
      await pending(page, 2);
      assert.equal(JSON.parse(await page.evaluate(() => window.javMock.calls[1]!.data!)).edition, undefined);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('DMM 素人作品页按商品号认出番号；馆藏已有时主按钮直达 Peach 里的这部作品', async () => {
    const opened = await open(browser, { url: 'https://video.dmm.co.jp/amateur/content/?id=mfc288&utm_medium=dmm_affiliate&utm_source=x',
      title: '作品详情', html: '<h1>作品详情</h1>', automatic: false });
    const { page } = opened;
    try {
      await pending(page, 1);
      const asked = new URL(await page.evaluate(() => window.javMock.calls[0]!.url));
      assert.equal(asked.pathname, '/api/jav-browser/identify');
      assert.equal(asked.searchParams.get('source_url'), 'https://video.dmm.co.jp/amateur/content/?id=mfc288');
      await page.evaluate(() => window.javMock.reply(0, { ok: true, code: 'MFC-288', state: 'owned', message: 'owned', asset_id: 4321 }));
      await ready(page, '在 Peach 中打开');
      assert.equal(await page.locator(ROOT).locator('.bar strong').innerText(), 'MFC-288');
      await page.evaluate(() => { Object.assign(window, { opened: [] as unknown[] });
        window.open = (...args: unknown[]) => { (window as unknown as { opened: unknown[] }).opened.push(args); return null; }; });
      await button(page).click();
      assert.deepEqual(await page.evaluate(() => (window as unknown as { opened: unknown[] }).opened),
        [[`${BASE}/assets/4321`, '_blank', 'noopener']]);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 1);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('MGS 店铺前缀由 Peach 归一成账本番号，本页列表不重复', async () => {
    const html = '<table><tr><th>品番：</th><td>107STZY-019</td></tr></table>';
    const opened = await open(browser, { url: 'https://www.mgstage.com/product/product_detail/107STZY-019/', title: '作品详情',
      html, resolved: 'STZY-019' });
    try {
      await ready(opened.page);
      const url = new URL(await opened.page.evaluate(() => window.javMock.calls[0]!.url));
      assert.equal(url.searchParams.get('code'), null);
      assert.equal(await opened.page.locator(ROOT).locator('.bar strong').innerText(), 'STZY-019');
      await opened.page.locator(ROOT).getByRole('button', {name:'识别本页全部番号', exact:true}).click();
      const list = opened.page.locator('#peach-jav-batch');
      await list.getByRole('checkbox', {name:'选择 STZY-019', exact:true}).waitFor();
      assert.equal(await list.locator('.batch-row').count(), 1);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  for (const code of ['MKBD-S123', 'MKD-S123', '092415_01', '092415_0001', 'DANDY-851C', 'T28-612', 'T38-076']) {
    it(`自动识别和主动选中支持完整番号 ${code}`, async () => {
      const automatic = await open(browser, { url: `https://123av.com/en/v/${code.toLowerCase()}`, title: code, html: `<h1>${code}</h1>` });
      try {
        await ready(automatic.page);
        assert.equal(new URL(await automatic.page.evaluate(() => window.javMock.calls[0]!.url)).searchParams.get('code'), code);
      } finally { await automatic.close(); }
      const manual = await open(browser, { url: 'https://sod.co.jp/detail', title: '作品详情', html: `<span id="selected-code">${code}</span>` });
      try {
        await selectCode(manual.page);
        await ready(manual.page);
        assert.equal(new URL(await manual.page.evaluate(() => window.javMock.calls[0]!.url)).searchParams.get('code'), code);
      } finally { await manual.close(); }
    });
  }

  for (const [status, message] of [
    [400, '页面番号与商品号不一致，请核对作品详情'],
    [404, 'Peach 尚不支持商品号识别，请更新 Peach。'],
    [429, 'Peach 请求过于频繁，请稍后查询。'],
    [503, 'Peach 服务暂时不可用，请稍后查询状态。'],
  ] as const) {
    it(`商品号识别按 HTTP ${status} 显示可恢复错误`, async () => {
      const opened = await open(browser, { url: 'https://video.dmm.co.jp/av/content/?id=1dandy00899', title: '作品详情', automatic: false });
      try {
        await pending(opened.page, 1);
        await opened.page.evaluate(({status,message}) => window.javMock.reply(0,{detail:message},status), {status,message});
        await ready(opened.page, '查询 Peach 状态');
        assert.equal(await opened.page.locator(ROOT).getByRole('status', { name: 'Peach 任务状态' }).innerText(), message);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  it('安装产物在 JavDB 页面读取内联清单并完成添加', async () => {
    const fixture = AUTOMATIC.javdb!;
    const opened = await open(browser, { url: `https://javdb.com${fixture.path}`, title: fixture.title,
      html: fixture.html, script: SCRIPT });
    const { page } = opened;
    try {
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      const submitted = await page.evaluate(() => JSON.parse(window.javMock.calls[1]!.data!));
      assert.deepEqual(submitted, { code: 'SSIS-057', source_url: 'https://javdb.com/v/ABP123' });
      await reply(page, 1, body('owned'));
      await ready(page, '已有该影片');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  for (const site of MANIFEST.sites.filter(site => site.mode === 'automatic')) {
    for (const domain of site.domains) {
      it(`${site.label} 自动识别 ${domain} 的明确作品身份`, async () => {
        const fixture = AUTOMATIC[site.id];
        assert.ok(fixture, `${site.id} 需要作品详情夹具`);
        const code = fixture.code || 'SSIS-057';
        const opened = await open(browser, { url: `https://${domain}${fixture.path}`,
          title: fixture.title, resolved: code, html: fixture.html + '<aside><h2>推荐 ABW-123</h2><a href="/ABW-123">ABW-123</a></aside>' });
        const { page } = opened;
        try {
          await ready(page);
          const lookup = await page.evaluate(() => window.javMock.calls[0]!);
          if (fixture.code) {
            assert.equal(new URL(lookup.url).pathname, '/api/jav-browser/identify');
            assert.equal(new URL(lookup.url).searchParams.get('source_url'), `https://${domain}${fixture.source || fixture.path}`);
            assert.equal(await page.locator(ROOT).locator('strong').innerText(), code);
          } else assert.equal(new URL(lookup.url).searchParams.get('code'), code);
          await page.evaluate(() => { window.javMock.automatic = false; });
          await button(page).click();
          await pending(page, 2);
          const submitted = await page.evaluate(() => JSON.parse(window.javMock.calls[1]!.data!));
          assert.deepEqual(submitted, { code, source_url: `https://${domain}${fixture.source || fixture.path}` });
          await reply(page, 1, body('owned', code));
          await ready(page, '已有该影片');
          assert.deepEqual(opened.problems, []);
        } finally { await opened.close(); }
      });
    }
  }

  for (const site of MANIFEST.sites.filter(site => site.mode === 'selection')) {
    for (const domain of site.domains) {
      it(`${site.label} 在 ${domain} 只按主动选中的番号显示添加按钮`, async () => {
        const path = site.id === 'dmm' ? '/av/content/?id=opaque_cid&token=private#player'
          : site.id === 'sehuatang' ? '/forum.php?mod=viewthread&tid=12345&token=private#post' : '/products/opaque?token=private#player';
        const opened = await open(browser, { url: `https://${domain}${path}`, title: 'SSIS-057 商品详情',
          html: '<h1>商品ID: ssis00057</h1><span id="selected-code">SSIS-057</span><aside>推荐 ABW-123</aside>' });
        const { page } = opened;
        try {
          await page.clock.fastForward(1000);
          assert.equal(await page.locator(ROOT).count(), 0);
          assert.equal(await page.evaluate(() => window.javMock.calls.length), 0);
          await selectCode(page);
          await ready(page);
          assert.deepEqual(await page.evaluate(() => window.javMock.calls.map(call => call.method)), ['GET']);
          await page.evaluate(() => { window.javMock.automatic = false; });
          await button(page).click();
          await pending(page, 2);
          const submitted = await page.evaluate(() => JSON.parse(window.javMock.calls[1]!.data!));
          assert.deepEqual(submitted, { code: 'SSIS-057', source_url: site.id === 'dmm'
            ? `https://${domain}/av/content/?id=opaque_cid` : site.id === 'sehuatang'
              ? `https://${domain}/forum.php?tid=12345` : `https://${domain}/products/opaque` });
          await reply(page, 1, body('owned'));
          await ready(page, '已有该影片');
          assert.deepEqual(opened.problems, []);
        } finally { await opened.close(); }
      });
    }
  }

  it('选中菜单拒绝完整标题、多番号、编解码器和超长内容', async () => {
    const opened = await open(browser, { url: 'https://duga.jp/products/ssis00057',
      title: '商品详情', html: '<span id="selected-code"></span>' });
    const { page } = opened;
    let alerts = 0;
    page.on('dialog', dialog => { alerts++; void dialog.dismiss(); });
    try {
      await selectCode(page);
      await page.locator('#peach-jav-batch').getByRole('button', { name: '返回 Peach 主界面', exact: true }).click();
      await page.locator('#peach-jav-batch').waitFor({ state: 'detached' });
      for (const value of ['SSIS-057 作品标题', 'SSIS-057 ABW-123', 'H264', 'X1234', 'SSIS-057'.repeat(30)]) {
        await page.locator('#selected-code').evaluate((element, value) => { element.textContent = value; }, value);
        await selectCode(page);
      }
      assert.equal(alerts, 0);
      assert.match(await page.locator('#peach-jav-notice').getByRole('status').innerText(), /只选中一个完整/);
      await page.locator('#peach-jav-notice').getByRole('button', { name: '关闭 Peach 提示' }).click();
      assert.equal(await page.locator('#peach-jav-notice').count(), 0);
      assert.equal(await page.locator(ROOT).count(), 0);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 0);
    } finally { await opened.close(); }
  });

  for (const raw of ['N1234', 'k1234']) {
    it(`Tokyo-Hot 选中番号 ${raw} 接受小写规范化响应`, async () => {
      const opened = await open(browser, { url: 'https://www.tokyo-hot.com/product/opaque/', title: '商品详情',
        html: `<span id="selected-code">${raw}</span>` });
      const { page } = opened;
      try {
        await selectCode(page);
        await ready(page);
        assert.equal(new URL(await page.evaluate(() => window.javMock.calls[0]!.url)).searchParams.get('code'), raw.toLowerCase());
        await page.evaluate(() => { window.javMock.automatic = false; });
        await button(page).click();
        await pending(page, 2);
        assert.equal(JSON.parse(await page.evaluate(() => window.javMock.calls[1]!.data!)).code, raw.toLowerCase());
        await reply(page, 1, body('owned', raw.toLowerCase()));
        await ready(page, '已有该影片');
      } finally { await opened.close(); }
    });
  }

  it('JavDB 标题与明确番号字段冲突时不查询或提交', async () => {
    const opened = await open(browser, { url: 'https://javdb.com/v/opaque123', title: 'JavDB',
      html: '<h2 class="title">SSIS-057 作品</h2><div class="panel-block"><strong>番號:</strong><span class="value">ABW-123</span></div>' });
    try {
      await ready(opened.page, '番号存在冲突');
      assert.equal(await button(opened.page).isDisabled(), true);
      assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
    } finally { await opened.close(); }
  });

  it('用户选定番号接管自动冲突，点击提交后切页隔离旧响应', async () => {
    const opened = await open(browser, { url: 'https://javdb.com/v/opaque123', title: 'JavDB',
      html: '<h2 class="title">SSIS-057 作品</h2><div class="panel-block"><strong>番號:</strong><span class="value">ABW-123</span></div><span id="selected-code">SSIS-057</span>' });
    const { page } = opened;
    try {
      await ready(page, '番号存在冲突');
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 0);
      await selectCode(page);
      await ready(page);
      assert.deepEqual(await page.evaluate(() => window.javMock.calls.map(call => call.method)), ['GET']);
      assert.equal(await page.locator(ROOT).locator('header strong').innerText(), 'SSIS-057');
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      assert.equal(JSON.parse(await page.evaluate(() => window.javMock.calls[1]!.data!)).code, 'SSIS-057');
      await page.evaluate(() => {
        history.pushState({}, '', '/v/otherOpaque');
        document.querySelector('h2.title')!.textContent = 'ABW-123 作品';
      });
      await pending(page, 3);
      await reply(page, 1, body('owned'));
      await reply(page, 2, body('idle', 'ABW-123'));
      await ready(page);
      assert.equal(await page.locator(ROOT).locator('header strong').innerText(), 'ABW-123');
      assert.equal(await button(page).isDisabled(), false);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  for (const url of [
    'https://javdb.com/search?q=SSIS-057', 'https://javlibrary.com/cn/?q=SSIS-057',
    'https://javlibrary.com/cn/?v=one&v=two', 'https://jav321.com/search/SSIS-057',
    'https://javlibrary.com/cn/?v=opaque.with.dot', 'https://javlibrary.com/cn/?v=opaque~tilde',
    'https://jav.guru/category/SSIS-057/', 'https://njav.tv/en/search/SSIS-057',
    'https://javtiful.com/actress/SSIS-057', 'https://avbase.net/works?q=SSIS-057',
    'https://javdatabase.com/idols/SSIS-057/',
  ]) {
    it(`详情适配不扫描列表 ${url}`, async () => {
      const opened = await open(browser, { url, html: '<h1>SSIS-057</h1><h2 class="title">SSIS-057</h2>' });
      try {
        await opened.page.clock.fastForward(1000);
        assert.equal(await opened.page.locator(ROOT).count(), 0);
        assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
      } finally { await opened.close(); }
    });
  }

  for (const domain of ['fc2.com', 'contents.fc2.com', 'other.fc2.com', 'javstore.net', 'r18.com', 'sodprime.com', 'javdb.com.evil.invalid']) {
    it(`未列入清单的域 ${domain} 不接受选中添加`, async () => {
      const opened = await open(browser, { url: `https://${domain}/products/SSIS-057`,
        html: '<h1>SSIS-057</h1><span id="selected-code">SSIS-057</span>' });
      try {
        await selectCode(opened.page);
        await opened.page.clock.fastForward(1000);
        assert.equal(await opened.page.locator(ROOT).count(), 0);
        assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
      } finally { await opened.close(); }
    });
  }

  it('配置存入 GM，提交仅带番号和无查询参数的来源地址，重复点击只创建一项任务', async () => {
    const opened = await open(browser, { configured: false });
    const { page } = opened;
    try {
      await ready(page, '配置 Peach');
      await button(page).click();
      await fillSettings(page, BASE, TOKEN);
      await ready(page);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 1);
      await page.locator(ROOT).getByRole('button', { name: '展开 Peach 面板', exact: true }).click();
      await ready(page);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 2);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await page.locator(ROOT).evaluate(root => {
        root.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add"]')!.click();
        root.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add"]')!.click();
      });
      await pending(page, 3);
      const calls = await page.evaluate(() => window.javMock.calls);
      assert.equal(calls[0]!.method, 'GET');
      assert.equal(calls[1]!.method, 'GET');
      assert.equal(calls[2]!.method, 'POST');
      assert.deepEqual(JSON.parse(calls[2]!.data!), { code: 'SSIS-057', source_url: 'https://missav.ws/en/ssis-057' });
      for (const call of calls) {
        assert.equal(new URL(call.url).origin, BASE);
        assert.equal(call.anonymous, true);
        assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
        assert.equal('Cookie' in call.headers, false);
        assert.equal(call.url.includes(TOKEN), false);
        assert.equal(call.data?.includes(TOKEN) || false, false);
      }
      const surface = await page.evaluate(() => ({
        html: document.documentElement.outerHTML,
        panel: document.querySelector('#peach-jav-action')!.shadowRoot!.innerHTML,
        storage: JSON.stringify(localStorage), cookies: document.cookie, url: location.href,
      }));
      assert.equal(JSON.stringify(surface).includes(TOKEN), false);
      await reply(page, 2, body('queued'));
      await page.clock.fastForward(2100);
      await pending(page, 4);
      await reply(page, 3, body('searching'));
      await page.clock.fastForward(2100);
      await pending(page, 5);
      await reply(page, 4, body('submitted'));
      await page.clock.fastForward(2100);
      await pending(page, 6);
      await reply(page, 5, body('ingested'));
      await ready(page, '已有该影片');
      assert.equal(await button(page).isDisabled(), true);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  for (const example of [
    { url: 'https://jable.tv/videos/fc2-ppv-1234567/', title: 'FC2 PPV 1234567 作品', code: 'FC2-PPV-1234567' },
    { url: 'https://missav.ai/ja/ssni001', title: 'SSNI-001 作品', code: 'SSNI-001' },
    { url: 'https://missav.com/cn/abw-123-uncensored', title: 'ABW-123 作品', code: 'ABW-123' },
  ]) {
    it(`识别详情页 ${example.code}`, async () => {
      const opened = await open(browser, { url: example.url, title: example.title, html: `<h1>${example.title}</h1>` });
      try {
        await ready(opened.page);
        const calls = await opened.page.evaluate(() => window.javMock.calls);
        assert.equal(new URL(calls[0]!.url).searchParams.get('code'), example.code);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  for (const example of [
    { slug: 'abp-7', title: 'ABP-0007 作品', extracted: 'ABP-7', canonical: 'ABP-007' },
    { slug: '300mium-0123', title: '300MIUM-123 作品', extracted: '300MIUM-0123', canonical: '300MIUM-123' },
    { slug: '092415_001', title: '092415_001 作品', extracted: '092415_001', canonical: '092415_001' },
    { slug: '092415-001', title: '092415-001 作品', extracted: '092415-001', canonical: '092415-001' },
  ]) {
    it(`接受服务端规范化番号 ${example.canonical}`, async () => {
      const opened = await open(browser, { url: `https://jable.tv/videos/${example.slug}/`,
        title: example.title, html: `<h1>${example.title}</h1>` });
      const { page } = opened;
      try {
        await ready(page);
        await page.evaluate(() => { window.javMock.automatic = false; });
        await button(page).click();
        await pending(page, 2);
        const submitted = await page.evaluate(() => JSON.parse(window.javMock.calls[1]!.data!));
        assert.equal(submitted.code, example.extracted);
        await reply(page, 1, body('owned', example.canonical));
        await ready(page, '已有该影片');
        assert.equal(await button(page).isDisabled(), true);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  for (const example of [
    { url: 'https://jable.tv/videos/092415_001/', title: '092415-001' },
    { url: 'https://jable.tv/videos/fc2-ppv-0123456/', title: 'FC2-PPV-123456' },
  ]) {
    it(`保留番号身份边界 ${example.title}`, async () => {
      const opened = await open(browser, { url: example.url, title: example.title, html: `<h1>${example.title}</h1>` });
      try {
        await ready(opened.page, '番号存在冲突');
        assert.equal(await button(opened.page).isDisabled(), true);
        assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
      } finally { await opened.close(); }
    });
  }

  for (const invalid of [
    { base: 'http://peach.example.invalid', token: TOKEN },
    { base: `${BASE}/abc`, token: TOKEN },
    { base: `${BASE}/?query=1`, token: TOKEN },
    { base: `${BASE}/#fragment`, token: TOKEN },
    { base: 'https://user:password@peach.example.invalid', token: TOKEN },
    { base: BASE, token: 't'.repeat(257) },
    { base: BASE, token: '' },
  ]) {
    it(`拒绝保存无效配置 ${invalid.base} / token 长度 ${invalid.token.length}`, async () => {
      const opened = await open(browser, { configured: false });
      const { page } = opened;
      try {
        await ready(page, '配置 Peach');
        await button(page).click();
        await fillSettings(page, invalid.base, invalid.token);
        await ready(page, '配置 Peach');
        assert.deepEqual(await pairingStorage(page), {});
        assert.equal(await page.evaluate(() => window.javMock.calls.length), 0);
        assert.match(await settingsDialog(page).getByRole('alert').innerText(), /请输入/);
        assert.equal(await settingsDialog(page).locator('[aria-invalid="true"]').count(), 1);
      } finally { await opened.close(); }
    });
  }

  for (const base of ['http://localhost:8099', 'http://127.0.0.1:8099', 'http://[::1]:8099']) {
    it(`接受 HTTP 回环配置 ${base}`, async () => {
      const opened = await open(browser, { configured: false });
      const { page } = opened;
      try {
        await ready(page, '配置 Peach');
        await button(page).click();
        await fillSettings(page, base, TOKEN);
        await ready(page);
        const stored = await page.evaluate(() => window.javMock.values);
        assert.equal(stored['peach.jav.base'], base);
        assert.equal(await page.evaluate(() => window.javMock.calls[0]!.url), `${base}/api/jav-browser?code=SSIS-057`);
      } finally { await opened.close(); }
    });
  }

  for (const url of [
    'https://missav.ws/en', 'https://missav.ws/search/ssis-057',
    'https://jable.tv/categories/ssis-057/', 'https://jable.tv/videos/',
    'https://unrelated.example.invalid/videos/ssis-057/',
  ]) {
    it(`排除列表页与未支持页面 ${new URL(url).pathname}`, async () => {
      const opened = await open(browser, { url, html: '<h1>SSIS-057</h1><article>ABW-123 推荐作品</article>' });
      try {
        await opened.page.clock.fastForward(1000);
        assert.equal(await opened.page.locator(ROOT).count(), 0);
        assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
      } finally { await opened.close(); }
    });
  }

  // 无码日期番号：MISSAV 的地址与标题带厂牌前缀，身份仍是 Peach 认的日期番号。
  for (const example of [
    { url: 'https://missav.ai/dm31/cn/pondo-103126_001', title: 'PONDO-103126_001 性感兔女郎', code: '103126_001' },
    { url: 'https://missav.ai/dm31/cn/caribbeancom-111326-001', title: 'CARIBBEANCOM-111326-001 作品 15', code: '111326-001' },
    // Jable 地址把下划线写成连字符，标题保留下划线。
    { url: 'https://jable.tv/videos/020121-429-paco/', title: '020121_429-paco 作品 - Jable.TV', code: '020121_429' },
  ]) {
    it(`无码日期番号 ${example.code} 不报冲突`, async () => {
      const opened = await open(browser, { url: example.url, title: example.title, html: `<h1>${example.title}</h1>` });
      try {
        await ready(opened.page);
        assert.equal(new URL(await opened.page.evaluate(() => window.javMock.calls[0]!.url)).searchParams.get('code'), example.code);
      } finally { await opened.close(); }
    });
  }

  // 厂牌段带数字的只认 Peach 登记过的 TMA `T28`、`T38`；`S1`、`VR180` 这类写法不算番号。
  it('JAVtiful 的 TMA 番号 T38-076 能识别，未登记的字母加数字不另算番号', async () => {
    const title = 'T38-076 今日、家族に売られました。 S1 VR180';
    const opened = await open(browser, { url: 'https://javtiful.com/zh/video/115905/t38-076', title, html: `<h1>${title}</h1>` });
    try {
      await ready(opened.page);
      assert.equal(await opened.page.locator(ROOT).locator('header strong').innerText(), 'T38-076');
      assert.equal(new URL(await opened.page.evaluate(() => window.javMock.calls[0]!.url)).searchParams.get('code'), 'T38-076');
    } finally { await opened.close(); }
  });

  it('标题后段的单词加数字不另算番号，字段开头是另一番号仍报冲突', async () => {
    const title = 'JMTY-039 Tadaman File05 Luna 24 歳';
    const opened = await open(browser, { url: 'https://missav.ai/dm31/cn/jmty-039', title, html: `<h1>${title}</h1>` });
    try {
      await ready(opened.page);
      assert.equal(await opened.page.locator(ROOT).locator('header strong').innerText(), 'JMTY-039');
      assert.equal(new URL(await opened.page.evaluate(() => window.javMock.calls[0]!.url)).searchParams.get('code'), 'JMTY-039');
    } finally { await opened.close(); }
    const other = await open(browser, { url: 'https://missav.ai/dm31/cn/jmty-039', title: 'ABW-123 Tadaman File05',
      html: '<h1>ABW-123 Tadaman File05</h1>' });
    try {
      await ready(other.page, '番号存在冲突');
      assert.equal(await other.page.evaluate(() => window.javMock.calls.length), 0);
    } finally { await other.close(); }
  });

  it('身份字段冲突时禁用，推荐区与查询参数不参与身份', async () => {
    const opened = await open(browser, { title: 'SSIS-057', html: '<h1>SSIS-057</h1><dl><dt>番号：</dt><dd>ABW-123</dd></dl>' });
    try {
      await ready(opened.page, '番号存在冲突');
      assert.equal(await button(opened.page).isDisabled(), true);
      assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 0);
    } finally { await opened.close(); }
    const detail = await open(browser, { html: '<h1>SSIS-057</h1><article><h2>推荐 ABW-123</h2></article>',
      url: 'https://missav.ws/en/ssis-057?related=ABW-123' });
    try { await ready(detail.page); } finally { await detail.close(); }
  });

  it('提交超时只提供查询，查询失败可重试，明确失败后可主动重新加入', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      await page.evaluate(() => window.javMock.pending[1]!.ontimeout());
      await ready(page, '查询 Peach 状态');
      await page.clock.fastForward(30_000);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 2);
      await button(page).click();
      await pending(page, 3);
      await page.evaluate(() => window.javMock.pending[2]!.onerror());
      await ready(page, '查询 Peach 状态');
      await button(page).click();
      await pending(page, 4);
      await reply(page, 3, body('failed'));
      await ready(page, '重试加入 Peach 馆藏');
      await button(page).click();
      await pending(page, 5);
      assert.deepEqual(await page.evaluate(() => window.javMock.calls.map(call => call.method)), ['GET', 'POST', 'GET', 'GET', 'POST']);
      await reply(page, 4, body('no_match'));
      await ready(page, '重试加入 Peach 馆藏');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('状态响应身份不匹配或令牌无效时保留查询入口', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      await reply(page, 1, body('owned', 'ABW-123'));
      await ready(page, '查询 Peach 状态');
      assert.match(await page.locator(ROOT).getByRole('status').innerText(), /状态无效/);
      await button(page).click();
      await pending(page, 3);
      await page.evaluate(() => window.javMock.reply(2, {}, 401));
      await ready(page, '查询 Peach 状态');
      assert.match(await page.locator(ROOT).getByRole('status').innerText(), /令牌无效/);
    } finally { await opened.close(); }
  });

  it('超时取证只含白名单，断线保留并在连接恢复后补报，不重复添加', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      await page.clock.fastForward(16000);
      await page.evaluate(() => window.javMock.pending[1]!.ontimeout());
      await ready(page, '查询 Peach 状态');
      const first = await page.evaluate(() => {
        const report = window.javMock.reports[0]!;
        return { data: report.data, anonymous: report.anonymous, authorization: report.headers.Authorization,
          queue: window.javMock.values['peach.jav.errors'] };
      });
      const event = JSON.parse(first.data!).events[0];
      assert.deepEqual(Object.keys(event).sort(), ['at', 'code', 'elapsed_ms', 'id', 'kind', 'operation', 'script_version', 'site', 'status'].sort());
      assert.equal(event.kind, 'timeout');
      assert.equal(event.operation, 'POST');
      assert.equal(event.script_version, VERSION);
      assert.equal(event.site, 'missav');
      assert.equal(event.code, 'SSIS-057');
      assert.ok(event.elapsed_ms >= 16000);
      assert.equal(first.anonymous, true);
      assert.equal(first.authorization, `Bearer ${TOKEN}`);
      for (const value of [TOKEN, 'private=value', 'player', '/en/ssis-057']) assert.ok(!first.data!.includes(value));
      await page.evaluate(() => window.javMock.reports[0]!.onerror());
      await page.clock.fastForward(61_000);
      await button(page).click();
      await pending(page, 3);
      await reply(page, 2, body('owned'));
      await ready(page, '已有该影片');
      assert.equal(await page.evaluate(() => window.javMock.reports.length), 2);
      assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.errors']), first.queue);
      await page.evaluate(() => window.javMock.reports[1]!.onload({ status: 200, responseText: '{"recorded":1}' }));
      assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.errors']), '[]');
      assert.equal(await page.evaluate(() => window.javMock.calls.filter(call => call.method === 'POST').length), 1);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('脚本错误跨页面保留，只向原 Peach 补报且日志失败不递归', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      await page.evaluate(() => window.javMock.pending[1]!.onerror());
      await ready(page, '查询 Peach 状态');
      await page.evaluate(() => window.javMock.reports[0]!.ontimeout());
      assert.equal(await page.evaluate(() => window.javMock.reports.length), 1);
      const saved = await page.evaluate(() => window.javMock.values['peach.jav.errors']);
      await page.evaluate(() => {
        window.javMock.values['peach.jav.base'] = 'https://another.example.invalid';
        history.pushState({}, '', '/en/abw-123'); document.title = 'ABW-123'; document.querySelector('h1')!.textContent = 'ABW-123';
      });
      await pending(page, 3);
      await reply(page, 2, body('idle', 'ABW-123'));
      await ready(page);
      assert.equal(await page.evaluate(() => window.javMock.reports.length), 1);
      assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.errors']), saved);
    } finally { await opened.close(); }
  });

  for (const viewport of VIEWPORTS) it(`${viewport.name} 整体进度覆盖五个阶段，下载百分比仅属于下载阶段`, async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      await reply(page, 1, { ...body('searching'), stage: 'submitting' });
      await page.waitForFunction(() => document.querySelector('#peach-jav-action')!.shadowRoot!.querySelector('[role="status"]')!.textContent === '正在提交网盘');
      const stages = [
        { state: 'remote_running', label: '网盘下载中', progress: .42 },
        { state: 'remote_running', label: '网盘下载中', progress: null },
        { state: 'remote_done', label: '网盘下载完成', progress: 1 },
        { state: 'landed', label: '文件已可访问', progress: 1 },
        { state: 'ingested', label: '已入库', progress: 1, postprocess_state: 'running', postprocess_label: '整理中' },
        { state: 'ingested', label: '已入库', progress: 1, postprocess_state: 'complete', postprocess_label: '整理完成' },
      ];
      for (const [index, download] of stages.entries()) {
        await page.clock.fastForward(2000);
        await pending(page, index + 3);
        await reply(page, index + 2, { ...body(download.state === 'ingested' ? 'ingested' : 'submitted'), download });
        const expected = `${download.label}${download.postprocess_label ? ` · ${download.postprocess_label}` : ''}${download.state !== 'remote_running' || download.progress == null ? '' : ` · ${Math.round(download.progress * 100)}%`}`;
        await page.waitForFunction(expected => document.querySelector('#peach-jav-action')!.shadowRoot!.querySelector('[role="status"]')!.textContent === expected, expected);
        const bar = page.locator(ROOT).getByRole('progressbar', { name: '整体任务进度' });
        assert.equal(await bar.count(), 1);
        const done = download.state === 'ingested' ? download.postprocess_state === 'complete' ? 5 : 4
          : ['remote_done', 'landed'].includes(download.state) ? 3 : 2;
        assert.equal(await bar.getAttribute('aria-valuenow'), String(done + (download.state === 'remote_running' ? download.progress ?? 0 : 0)));
        assert.equal(await bar.getAttribute('aria-valuemax'), '5');
        assert.equal((await bar.boundingBox())!.height, 6);
        assert.equal(await page.locator(ROOT).locator('.flow-step[data-state="complete"]').count(), done);
        assert.equal(await page.locator(ROOT).locator('.flow-mark > svg').count(), 5);
        const marks=await page.locator(ROOT).locator('.flow-mark').evaluateAll(nodes=>nodes.map(node=>[node.getBoundingClientRect().width,node.getBoundingClientRect().height]));
        assert.ok(marks.every(([width,height])=>width===18&&height===18));
        assert.equal(await page.locator(ROOT).locator('.flow-mark').allTextContents().then(labels => labels.join('')), '');
        if (done < 5) assert.equal(await page.locator(ROOT).locator('.flow-step[aria-current="step"]').count(), 1);
      }
      await ready(page, '已有该影片');
      assert.equal(await button(page).isDisabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('整理未请求时标记跳过，连接异常保留最近一次确认的整体进度', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      await reply(page, 1, { ...body('submitted'), download: {state:'remote_running',label:'网盘下载中',progress:.42} });
      await page.waitForFunction(()=>document.querySelector('#peach-jav-action')!.shadowRoot!.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')==='2.42');
      await page.clock.fastForward(2000);
      await pending(page, 3);
      await page.evaluate(()=>window.javMock.pending[2]!.ontimeout());
      await ready(page, '查询 Peach 状态');
      const bar = page.locator(ROOT).getByRole('progressbar', {name:'整体任务进度'});
      assert.equal(await bar.getAttribute('aria-valuenow'),'2.42');
      assert.match(await bar.getAttribute('aria-valuetext') ?? '', /最近一次确认/);
      await button(page).click();
      await pending(page, 4);
      await reply(page, 3, { ...body('ingested'), download:{state:'ingested',label:'已入库',progress:1,postprocess_state:'not_requested',postprocess_label:'整理未开始'} });
      await ready(page, '已有该影片');
      assert.equal(await bar.getAttribute('aria-valuenow'),'5');
      assert.equal(await page.locator(ROOT).locator('.flow-step[data-state="complete"]').count(),4);
      assert.equal(await page.locator(ROOT).locator('.flow-step[data-state="skipped"]').count(),1);
      assert.match(await bar.getAttribute('aria-valuetext') ?? '', /整理未请求/);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('设置子页与浮卡同时播 Peach 设置面板的进出场，减少动效时立即关闭', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await page.emulateMedia({reducedMotion:'no-preference'});
      await ready(page);
      const names = (node: Element) => node.getAnimations().flatMap(animation => 'animationName' in animation ? [(animation as CSSAnimation).animationName] : []);
      const trigger=page.locator(ROOT).getByRole('button',{name:'Peach 设置',exact:true});
      await trigger.click();
      // 子页进场时浮卡退场，两者同时进行，不先瞬间隐藏浮卡。
      assert.deepEqual(await settingsDialog(page).evaluate(names), ['board-dialog-in']);
      assert.deepEqual(await page.locator(ROOT).evaluate(names), ['board-dialog-out']);
      await settingsDialog(page).getByRole('button',{name:'取消',exact:true}).click();
      assert.deepEqual(await settingsDialog(page).evaluate(names), ['board-dialog-out']);
      assert.deepEqual(await page.locator(ROOT).evaluate(names), ['board-dialog-in']);
      await settingsDialog(page).waitFor({state:'detached'});
      await page.waitForFunction(root=>!document.querySelector(root)!.hasAttribute('data-subpage-return'), ROOT);
      await page.emulateMedia({reducedMotion:'reduce'});
      await trigger.click();
      assert.equal(await settingsDialog(page).evaluate(node=>node.getAnimations().length),0);
      await settingsDialog(page).getByRole('button',{name:'取消',exact:true}).click();
      await settingsDialog(page).waitFor({state:'detached'});
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('详情折叠与 logo 恢复保持紧凑布局且只查询状态', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      const root = page.locator(ROOT);
      const panel = root.locator('.panel');
      await root.getByRole('button', {name:'折叠 Peach 详情',exact:true}).click();
      assert.equal(await panel.locator('.body').isVisible(), false);
      assert.ok((await panel.boundingBox())!.height <= 64);
      await root.getByRole('button', {name:'隐藏 Peach 面板',exact:true}).click();
      assert.equal(await panel.isVisible(), false);
      const launcher = root.getByRole('button', {name:'展开 Peach 面板',exact:true});
      await launcher.evaluate(async node => {
        await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {})));
      });
      assert.equal((await launcher.boundingBox())!.width, 48);
      assert.equal((await launcher.boundingBox())!.height, 48);
      await launcher.press('Enter');
      await ready(page);
      assert.equal(await panel.locator('.body').isVisible(), true);
      assert.equal(await root.locator('.launcher').isVisible(), false);
      assert.equal(await page.evaluate(()=>window.javMock.calls.filter(call=>call.method==='POST').length),0);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('设置弹窗遮住浮卡且反复开关只有一个底部操作栏', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      for (const viewport of [{width:390,height:360},{width:320,height:320}]) {
        await page.setViewportSize(viewport);
        for(let count=0;count<3;count++) {
          await page.locator(ROOT).getByRole('button',{name:'Peach 设置',exact:true}).click();
          const dialog = settingsDialog(page);
          await page.locator(ROOT).waitFor({state:'hidden'});
          assert.equal(await dialog.locator('.footer').count(),1);
          const geometry = await dialog.evaluate(node=>({bottom:node.getBoundingClientRect().bottom,
            footer:node.querySelector('.footer')!.getBoundingClientRect().bottom,height:innerHeight}));
          assert.ok(geometry.bottom<=geometry.height && Math.abs(geometry.bottom-geometry.footer-1)<.5);
          await dialog.getByRole('button',{name:'取消',exact:true}).click();
          await dialog.waitFor({state:'detached'});
          assert.equal(await page.locator(ROOT).isVisible(),true);
          assert.equal(await page.locator('#peach-jav-settings').count(),0);
        }
      }
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('SPA 切页隔离过期响应，列表页移除按钮，重复执行只注入一份', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      await page.evaluate(() => { window.javMock.automatic = false; });
      await button(page).click();
      await pending(page, 2);
      await page.evaluate(() => {
        history.pushState({}, '', '/en/abw-123');
        document.title = 'ABW-123';
        document.querySelector('h1')!.textContent = 'ABW-123';
      });
      await pending(page, 3);
      await reply(page, 1, body('owned'));
      await reply(page, 2, body('idle', 'ABW-123'));
      await ready(page);
      assert.equal(await page.locator(ROOT).locator('header strong').innerText(), 'ABW-123');
      await page.addScriptTag({ content: SCRIPT });
      await page.clock.fastForward(1000);
      assert.equal(await page.locator(ROOT).count(), 1);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 3);
      await button(page).click();
      await pending(page, 4);
      await page.evaluate(() => {
        history.pushState({}, '', '/en/ssis-057');
        history.pushState({}, '', '/en/abw-123');
      });
      await page.clock.fastForward(1000);
      await pending(page, 5);
      await reply(page, 3, body('owned', 'ABW-123'));
      await reply(page, 4, body('idle', 'ABW-123'));
      await ready(page);
      await page.evaluate(() => { history.pushState({}, '', '/search/ABW-123'); });
      await page.clock.fastForward(1000);
      assert.equal(await page.locator(ROOT).count(), 0);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('后台状态轮询先密后疏、最长一小时且不创建 POST，馆藏已有时不可加入', async () => {
    const opened = await open(browser, { initial: 'queued' });
    try {
      await pending(opened.page, 1);
      for (let index = 0; index < 30; index++) {
        await opened.page.waitForFunction(() => document.querySelector('#peach-jav-action')?.shadowRoot?.querySelector('p')?.textContent?.includes('已排队'));
        await opened.page.clock.fastForward(2100);
        await pending(opened.page, index + 2);
      }
      await opened.page.clock.fastForward(2100);
      assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), 31);
      await opened.page.clock.fastForward(13_000);
      await pending(opened.page, 32);
      await opened.page.clock.runFor(60 * 60_000);
      const calls = await opened.page.evaluate(() => window.javMock.calls);
      assert.ok(calls.length > 32 && calls.length < 300, `轮询次数 ${calls.length}`);
      assert.ok(calls.every(call => call.method === 'GET'));
      await ready(opened.page, '查询 Peach 状态');
      await opened.page.clock.runFor(10 * 60_000);
      assert.equal(await opened.page.evaluate(() => window.javMock.calls.length), calls.length);
    } finally { await opened.close(); }
    const owned = await open(browser, { initial: 'owned' });
    try {
      await ready(owned.page, '已有该影片');
      assert.equal(await button(owned.page).isDisabled(), true);
    } finally { await owned.close(); }
  });

  for (const viewport of VIEWPORTS) {
    for (const theme of ['light', 'dark'] as const) {
      it(`${viewport.name} / ${theme} 设置表单、取消与 GM 令牌保留`, async () => {
        const opened = await open(browser, { viewport });
        const { page } = opened;
        const dialogs: string[] = [];
        page.on('dialog', dialog => { dialogs.push(dialog.type()); void dialog.dismiss(); });
        try {
          await page.emulateMedia({ colorScheme: theme });
          await ready(page);
          const trigger = page.locator(ROOT).getByRole('button', { name: 'Peach 设置', exact: true });
          await trigger.click();
          const dialog = settingsDialog(page);
          const token = dialog.getByLabel('专用令牌', { exact: true });
          assert.equal(await token.inputValue(), '');
          assert.equal(await token.getAttribute('type'), 'password');
          assert.equal(await dialog.getByLabel('Peach 地址', { exact: true }).inputValue(), BASE);
          await token.fill('draft-only-token');
          await dialog.getByRole('button', { name: '显示专用令牌' }).click();
          assert.equal(await token.getAttribute('type'), 'text');
          await token.press('Escape');
          await dialog.waitFor({state:'detached'});
          assert.equal(await dialog.count(), 0);
          assert.equal(await trigger.evaluate(node => node.getRootNode() instanceof ShadowRoot && (node.getRootNode() as ShadowRoot).activeElement === node), true);
          assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.token']), TOKEN);
          await trigger.click();
          assert.equal(await token.inputValue(), '');
          await dialog.getByLabel('Peach 地址', { exact: true }).fill('https://other-peach.example.invalid');
          await dialog.getByRole('button', { name: '保存设置' }).click();
          assert.match(await dialog.getByRole('alert').innerText(), /重新填写令牌/);
          assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.base']), BASE);
          await dialog.getByLabel('Peach 地址', { exact: true }).fill(BASE + '/');
          await dialog.getByLabel('Peach 地址', { exact: true }).press('Enter');
          await ready(page);
          await page.locator(ROOT).getByRole('button', { name: '展开 Peach 面板', exact: true }).click();
          assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.token']), TOKEN);
          await page.locator(ROOT).getByRole('button', { name: 'Peach 设置', exact: true }).click();
          const geometry = await dialog.evaluate(node => {
            const box = node.getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight,
              overflow: node.scrollWidth > node.clientWidth, background: getComputedStyle(node).backgroundColor,
              dark: matchMedia('(prefers-color-scheme:dark)').matches,
              hostTheme: (node.getRootNode() as ShadowRoot).host.getAttribute('data-theme'),
              hostGround: getComputedStyle((node.getRootNode() as ShadowRoot).host).getPropertyValue('--ground') };
          });
          assert.ok(geometry.left >= 0 && geometry.top >= 0 && geometry.right <= geometry.width && geometry.bottom <= geometry.height, JSON.stringify(geometry));
          assert.equal(geometry.overflow, false);
          assert.equal(geometry.background, theme === 'dark' ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)', JSON.stringify(geometry));
          const controls = await dialog.evaluate(node => {
            const field = getComputedStyle(node.querySelector('input')!);
            const primary = getComputedStyle(node.querySelector('button[type="submit"]')!);
            return { radius: getComputedStyle(node).borderRadius, height: field.height,
              fieldRadius: field.borderRadius, fieldBackground: field.backgroundColor,
              primaryBackground: primary.backgroundImage, primaryColor: primary.color };
          });
          assert.equal(controls.radius, '20px');
          assert.equal(controls.height, '36px');
          assert.equal(controls.fieldRadius, '10px');
          assert.notEqual(controls.fieldBackground, geometry.background);
          assert.match(controls.primaryBackground, /^linear-gradient\(/);
          assert.equal(controls.primaryColor, 'rgb(255, 255, 255)');
          assert.deepEqual(dialogs, []);
          assert.deepEqual(opened.problems, []);
        } finally { await opened.close(); }
      });
    }
    it(`${viewport.name} 下按钮可聚焦且不越出视口`, async () => {
      const opened = await open(browser, { viewport });
      try {
        await ready(opened.page);
        await button(opened.page).focus();
        const state = await button(opened.page).evaluate(element => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: innerWidth,
            focused: element.getRootNode() instanceof ShadowRoot && (element.getRootNode() as ShadowRoot).activeElement === element,
            outline: getComputedStyle(element).outlineStyle };
        });
        assert.equal(state.focused, true);
        assert.notEqual(state.outline, 'none');
        assert.ok(state.left >= 0 && state.right <= state.width);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    });
  }

  it('配对信息、输入法合成与取消保持配对配置未保存，显式保存写入地址与令牌', async () => {
    const opened = await open(browser, { configured: false, url: 'https://duga.jp/other/' });
    const { page } = opened;
    try {
      await page.evaluate(() => window.javMock.menus['设置']!());
      const dialog = settingsDialog(page);
      const address = dialog.getByLabel('Peach 地址', { exact: true });
      const paste = (text: string) => address.evaluate((node, text) => {
        const data = new DataTransfer();
        data.setData('text/plain', text);
        node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      }, text);
      await paste('{"peach_pairing":1,"base":"http://remote.example","token":"dummy"}');
      assert.match(await dialog.getByRole('alert').innerText(), /配对信息无效/);
      await paste(JSON.stringify({ peach_pairing: 1, base: BASE, token: TOKEN }));
      assert.equal(await address.inputValue(), BASE);
      assert.equal(await dialog.getByLabel('专用令牌', { exact: true }).inputValue(), TOKEN);
      assert.deepEqual(await pairingStorage(page), {});
      await address.dispatchEvent('compositionstart');
      await address.press('Enter');
      assert.deepEqual(await pairingStorage(page), {});
      await address.dispatchEvent('compositionend');
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.deepEqual(await pairingStorage(page), {});
      await page.evaluate(() => window.javMock.menus['设置']!());
      assert.equal(await address.inputValue(), '');
      assert.equal(await dialog.getByLabel('专用令牌', { exact: true }).inputValue(), '');
      await paste(JSON.stringify({ peach_pairing: 1, base: BASE, token: TOKEN }));
      await dialog.getByRole('button', { name: '保存设置' }).click();
      assert.deepEqual(await pairingStorage(page), { 'peach.jav.base': BASE, 'peach.jav.token': TOKEN });
      await page.clock.runFor(20);
      await page.locator('#peach-jav-settings').waitFor({state:'detached'});
      assert.equal(await page.locator('#peach-jav-settings').count(), 0);
      assert.equal(await page.evaluate(() => window.javMock.calls.length), 0);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('列表页图标先展开入口面板，本页番号返回后回到面板，怪异模式下字号与底栏不变形', async () => {
    const opened = await open(browser, {url:'https://javdb.com/', title:'JavDB', quirks:true, updateAutomatic:false,
      html:'<p>SSIS-057 ABP-616</p>'});
    const {page} = opened;
    const entry = page.locator('#peach-jav-updates');
    try {
      assert.equal(await page.evaluate(() => document.compatMode), 'BackCompat');
      await entry.getByRole('button', {name:'Peach 设置与更新'}).click();
      const scan = entry.getByRole('button', {name:'识别本页全部番号', exact:true});
      await scan.waitFor();
      assert.equal(await page.locator('#peach-jav-batch').count(), 0);
      await scan.click();
      const list = page.locator('#peach-jav-batch');
      await list.getByRole('checkbox',{name:'选择 ABP-616',exact:true}).waitFor();
      const fonts = await list.evaluate(host => {
        const root = host.shadowRoot!;
        return [getComputedStyle(root.querySelector('.body')!).fontSize, getComputedStyle(root.querySelector('td')!).fontSize];
      });
      assert.equal(fonts[1], fonts[0]);
      await list.getByRole('button', {name:'返回 Peach 主界面', exact:true}).click();
      await list.waitFor({state:'detached'});
      await scan.waitFor();
      assert.equal(await entry.getByRole('button', {name:'Peach 设置与更新'}).isVisible(), false);
      await entry.getByRole('button', {name:'Peach 设置', exact:true}).click();
      await page.evaluate(() => document.getAnimations().forEach(animation => animation.finish()));
      const gap = await settingsDialog(page).evaluate(dialog =>
        dialog.getBoundingClientRect().bottom - dialog.querySelector('form')!.getBoundingClientRect().bottom);
      assert.ok(gap <= 1, `设置底栏下方空出 ${gap}px`);
      await settingsDialog(page).getByRole('button', {name:'取消', exact:true}).click();
      // 右上角与作品浮卡同一组：折叠只留标题栏，再点展开；隐藏收成图标。
      await entry.getByRole('button', {name:'折叠 Peach 详情', exact:true}).click();
      assert.equal(await scan.isVisible(), false);
      assert.equal(await entry.getAttribute('data-panel-mode'), 'collapsed');
      await entry.getByRole('button', {name:'展开 Peach 详情', exact:true}).click();
      await scan.waitFor();
      await entry.getByRole('button', {name:'隐藏 Peach 面板', exact:true}).click();
      await entry.getByRole('button', {name:'Peach 设置与更新'}).waitFor();
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  for (const viewport of VIEWPORTS) it(`${viewport.name}：浮窗与列表都显示已有影片，已有行不参与加入`, async () => {
    const opened = await open(browser, {initial:'owned', viewport});
    const {page} = opened;
    try {
      await ready(page, '已有该影片');
      await page.locator(ROOT).getByRole('button', {name:'识别本页全部番号',exact:true}).click();
      const list = page.locator('#peach-jav-batch');
      await list.locator('.batch-row-status', {hasText:'已有'}).waitFor();
      assert.equal(await list.getByRole('checkbox', {name:'选择 SSIS-057',exact:true}).isDisabled(), true);
      assert.equal(await list.getByRole('checkbox', {name:'全选本页番号',exact:true}).isDisabled(), true);
      assert.equal(await list.getByRole('button', {name:'全部加入',exact:true}).isDisabled(), true);
      assert.equal(await list.getByRole('button', {name:'加入所选',exact:true}).isDisabled(), true);
      assert.deepEqual(await page.evaluate(() => window.javMock.calls.map(call=>call.method)), ['GET','GET']);
      assert.deepEqual(opened.problems, []);
    } finally {await opened.close();}
  });

  it('列表先查询所有状态，已有与进行中的行被排除，仅提交未加入和可重试项', async () => {
    const states: State[] = ['owned','ingested','queued','searching','submitted','failed','no_match','idle'];
    const codes = states.map((_,index)=>`ABP-${100+index}`);
    const opened = await open(browser, {url:'https://javdb.com/',html:`<p>${codes.join(' ')}</p>`,automatic:false});
    const {page} = opened;
    try {
      await page.evaluate(() => window.javMock.menus['开启']!());
      await pending(page, 1);
      const list = page.locator('#peach-jav-batch');
      assert.deepEqual(await list.locator('.batch-row-status').allTextContents(), states.map(()=>'查询中'));
      assert.equal(await list.getByRole('button',{name:'全部加入（8）',exact:true}).isDisabled(), true);
      assert.equal(await list.getByRole('checkbox',{name:`选择 ${codes[0]}`,exact:true}).isDisabled(), true);
      for (const [index,state] of states.entries()) {
        await pending(page,index+1);
        assert.equal(await page.evaluate(index=>window.javMock.calls[index]!.method,index),'GET');
        await reply(page,index,body(state,codes[index]));
      }
      await list.getByRole('button',{name:'全部加入（3）',exact:true}).waitFor();
      assert.deepEqual(await list.locator('.batch-row-status').allTextContents(), ['已有','已入库','排队中','搜索中','下载中','失败','无资源','待加入']);
      for (const [index,code] of codes.entries()) {
        assert.equal(await list.getByRole('checkbox',{name:`选择 ${code}`,exact:true}).isDisabled(), index<5);
      }
      await list.getByRole('checkbox',{name:'全选本页番号',exact:true}).check();
      assert.equal(await list.locator('.batch-row input:checked').count(),3);
      await list.getByRole('button',{name:'全部加入（3）',exact:true}).click();
      for (let index=0;index<3;index++) {
        await pending(page,states.length+index+1);
        await reply(page,states.length+index,body('owned',codes[index+5]));
      }
      await list.locator('.geist-note',{hasText:'已处理 3/3 项'}).waitFor();
      assert.deepEqual(await page.evaluate(()=>window.javMock.calls.filter(call=>call.method==='POST').map(call=>JSON.parse(call.data!).code)),codes.slice(5));
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('打开列表即跟踪已有任务，状态未取得时明确提示，重新识别可恢复真实状态', async () => {
    const opened = await open(browser,{url:'https://javdb.com/',html:'<p>ABP-100 ABP-101</p>',automatic:false});
    const {page} = opened;
    try {
      await page.evaluate(()=>window.javMock.menus['开启']!());
      await pending(page,1);await reply(page,0,body('queued','ABP-100'));
      await pending(page,2);await page.evaluate(()=>window.javMock.reply(1,{},503));
      const list=page.locator('#peach-jav-batch');
      await list.locator('.batch-row-status',{hasText:'未取得'}).waitFor();
      assert.equal(await list.locator('.batch-row-status',{hasText:'未取得'}).getAttribute('title'),'Peach 服务暂时不可用，请稍后查询状态。');
      await page.clock.fastForward(2100);
      await pending(page,3);await reply(page,2,body('ingested','ABP-100'));
      await list.locator('.batch-row-status',{hasText:'已入库'}).waitFor();
      await list.getByRole('button',{name:'重新识别',exact:true}).click();
      await pending(page,4);await reply(page,3,body('owned','ABP-100'));
      await pending(page,5);await reply(page,4,body('owned','ABP-101'));
      await list.getByRole('button',{name:'全部加入',exact:true}).waitFor();
      assert.deepEqual(await list.locator('.batch-row-status').allTextContents(),['已有','已有']);
      assert.equal(await list.getByRole('button',{name:'全部加入',exact:true}).isDisabled(),true);
      assert.equal(await page.evaluate(()=>window.javMock.calls.filter(call=>call.method==='POST').length),0);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('列表返回后不继续查询后续番号，也不提交任务', async () => {
    const opened=await open(browser,{url:'https://javdb.com/',html:'<p>ABP-100 ABP-101</p>',automatic:false});
    const {page}=opened;
    try {
      await page.evaluate(()=>window.javMock.menus['开启']!());
      await pending(page,1);
      const list=page.locator('#peach-jav-batch');
      await list.getByRole('button',{name:'返回 Peach 主界面',exact:true}).click();
      await list.waitFor({state:'detached'});
      await reply(page,0,body('idle','ABP-100'));
      await page.clock.fastForward(3000);
      assert.equal(await page.evaluate(()=>window.javMock.calls.length),1);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('页面候选去重，逐项提交所选番号，再添加剩余项', async () => {
    const opened = await open(browser, {url:'https://javdb.com/', postState:'owned', html:'<p>SSIS-057 ABP-616 SSIS-057</p><script>"ABP-999"</script><p hidden>ABP-998</p>'});
    const {page} = opened;
    try {
      await page.evaluate(() => window.javMock.menus['开启']!());
      const list = page.locator('#peach-jav-batch');
      await list.getByRole('checkbox',{name:'选择 ABP-616',exact:true}).check();
      assert.equal(await list.locator('.batch-row').count(),2);
      await list.getByRole('button',{name:'加入所选（1）',exact:true}).click();
      await page.waitForFunction(() => window.javMock.calls.filter(call=>call.method==='POST').length===1);
      await list.getByRole('button',{name:'全部加入（1）',exact:true}).click();
      await page.waitForFunction(() => window.javMock.calls.filter(call=>call.method==='POST').length===2);
      assert.deepEqual(await page.evaluate(() => window.javMock.calls.filter(call=>call.method==='POST').map(call=>JSON.parse(call.data!).code)), ['ABP-616','SSIS-057']);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('番号列默认按页面顺序，点表头依次切到字母升序、倒序再回页面顺序，记住选择，勾选随行移动', async () => {
    const opened = await open(browser, {url:'https://javdb.com/', html:'<p>SSIS-057 IPX-100 ABP-616 IPX-99</p>'});
    const {page} = opened;
    try {
      await page.evaluate(() => window.javMock.menus['开启']!());
      const list = page.locator('#peach-jav-batch');
      const codes = () => list.locator('.batch-row-code').allTextContents();
      const header = list.getByRole('columnheader', {name:'番号', exact:true});
      await list.getByRole('checkbox',{name:'选择 IPX-99',exact:true}).waitFor();
      assert.deepEqual(await codes(), ['SSIS-057','IPX-100','ABP-616','IPX-99']);
      assert.equal(await header.getAttribute('aria-sort'), 'none');
      await list.getByRole('checkbox',{name:'选择 ABP-616',exact:true}).check();
      await list.getByRole('button',{name:'番号',exact:true}).click();
      assert.deepEqual(await codes(), ['ABP-616','IPX-99','IPX-100','SSIS-057']);
      assert.equal(await header.getAttribute('aria-sort'), 'ascending');
      assert.equal(await list.locator('.batch-row').first().locator('input').isChecked(), true);
      assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.batch-order']), 'ascending');
      await list.getByRole('button',{name:'番号',exact:true}).click();
      assert.deepEqual(await codes(), ['SSIS-057','IPX-100','IPX-99','ABP-616']);
      assert.equal(await header.getAttribute('aria-sort'), 'descending');
      assert.equal(await list.locator('.batch-row').last().locator('input').isChecked(), true);
      assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.batch-order']), 'descending');
      await list.getByRole('button',{name:'番号',exact:true}).click();
      assert.deepEqual(await codes(), ['SSIS-057','IPX-100','ABP-616','IPX-99']);
      assert.equal(await header.getAttribute('aria-sort'), 'none');
      assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.batch-order']), 'page');
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('上次选了字母倒序时，打开列表直接按倒序排列', async () => {
    const opened = await open(browser, {url:'https://javdb.com/', html:'<p>ABP-616 SSIS-057 IPX-001</p>', updateValues:{'peach.jav.batch-order':'descending'}});
    const {page} = opened;
    try {
      await page.evaluate(() => window.javMock.menus['开启']!());
      const list = page.locator('#peach-jav-batch');
      await list.getByRole('checkbox',{name:'选择 SSIS-057',exact:true}).waitFor();
      assert.deepEqual(await list.locator('.batch-row-code').allTextContents(), ['SSIS-057','IPX-001','ABP-616']);
      assert.equal(await list.getByRole('columnheader', {name:'番号', exact:true}).getAttribute('aria-sort'), 'descending');
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('整页扫描只收带分隔符的番号，不把用户名、评论署名、导航和域名补成番号', async () => {
    const opened = await open(browser, {url:'https://javdb.com/', html:'<nav>TOP250</nav><p>hhd800.com@FC2-PPV-4302474.mp4</p>'
      + '<p>Exclusive50%OFF!</p><p>jay925 hush666 lexburner69 guangdao19450806</p><p>FC2-4091275 SSIS-057 ssis058</p>'
      + '<p>qwert-02さんのレビュー</p><p>abc-123 様</p>'});
    const {page} = opened;
    try {
      await page.evaluate(() => window.javMock.menus['开启']!());
      const list = page.locator('#peach-jav-batch');
      await list.getByRole('checkbox',{name:'选择 SSIS-057',exact:true}).waitFor();
      assert.deepEqual(await list.locator('.batch-row-code').allTextContents(), ['FC2-PPV-4302474','FC2-PPV-4091275','SSIS-057']);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('提交后的行显示短状态与对应颜色，完整说明在悬停提示，已处理的行取消勾选', async () => {
    const opened = await open(browser, {url:'https://javdb.com/', html:'<p>SSIS-057 ABP-616 IPX-001</p>', automatic:false});
    const {page} = opened;
    try {
      await page.evaluate(() => window.javMock.menus['开启']!());
      const list = page.locator('#peach-jav-batch');
      const status = (code: string) => list.locator('.batch-row', {hasText: code}).locator('.batch-row-status');
      const chip = async (code: string) => status(code).evaluate(node => ({text: node.textContent, color: (node as HTMLElement).dataset.chip, title: (node as HTMLElement).title}));
      await initialRows(page, ['SSIS-057', 'ABP-616', 'IPX-001']);
      await list.getByRole('checkbox',{name:'选择 SSIS-057',exact:true}).check();
      assert.deepEqual(await chip('ABP-616'), {text:'待加入', color:'plain', title:'待加入'});
      await list.getByRole('button',{name:'全部加入（3）',exact:true}).click();
      await pending(page, 4);
      assert.deepEqual(await chip('SSIS-057'), {text:'提交中', color:'blue', title:'正在交给 Peach…'});
      await reply(page, 3, body('owned', 'SSIS-057'));
      await pending(page, 5);
      await page.evaluate(() => window.javMock.reply(4, {}, 503));
      await pending(page, 6);
      await reply(page, 5, {...body('no_match', 'IPX-001'), message:'未找到可自动下载的磁力，可重试'});
      await list.locator('.geist-note', {hasText: '已处理 3/3 项'}).waitFor();
      assert.deepEqual(await chip('SSIS-057'), {text:'已有', color:'lime', title:'馆藏已有该番号影片'});
      assert.deepEqual(await chip('ABP-616'), {text:'服务不可用', color:'rose', title:'Peach 服务暂时不可用，请稍后查询状态。'});
      assert.deepEqual(await chip('IPX-001'), {text:'无资源', color:'yellow', title:'未找到可自动下载的磁力，可重试'});
      assert.equal(await list.getByRole('checkbox',{name:'选择 SSIS-057',exact:true}).isChecked(), false);
      assert.equal(await list.getByRole('button',{name:'全部加入（2）',exact:true}).count(), 1);
      const widths = await status('ABP-616').evaluate(node => ({chip: node.getBoundingClientRect().right, cell: node.closest('td')!.getBoundingClientRect().right}));
      assert.ok(widths.chip <= widths.cell, `状态未完整显示：${JSON.stringify(widths)}`);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('列表提交后自动查询进行中的行，磁力失效的行再次加入时换一个磁力', async () => {
    const opened = await open(browser, {url:'https://javdb.com/', html:'<p>SSIS-057 ABP-616</p>', automatic:false});
    const {page} = opened;
    try {
      await page.evaluate(() => window.javMock.menus['开启']!());
      const list = page.locator('#peach-jav-batch');
      const chip = (code: string) => list.locator('.batch-row', {hasText: code}).locator('.batch-row-status');
      await initialRows(page, ['SSIS-057', 'ABP-616']);
      await list.getByRole('button',{name:'全部加入（2）',exact:true}).click();
      await pending(page, 3);
      await reply(page, 2, body('queued', 'SSIS-057'));
      await pending(page, 4);
      await page.evaluate(() => window.javMock.reply(3, {ok:true, code:'ABP-616', state:'failed', cause:'magnet', failure:'no_source', message:'没有可用下载源'}));
      await list.locator('.geist-note', {hasText: '1 项磁力失效，再次加入会换一个磁力'}).waitFor();
      assert.equal(await chip('ABP-616').textContent(), '磁力失效');
      assert.equal(await chip('ABP-616').getAttribute('title'), '磁力问题：没有可用下载源。可以换一个磁力。');
      await page.clock.fastForward(2100);
      await pending(page, 5);
      assert.equal(await page.evaluate(() => window.javMock.calls[4]!.method), 'GET');
      await page.evaluate(() => window.javMock.reply(4, {ok:true, code:'SSIS-057', state:'submitted',
        download:{state:'remote_running', label:'网盘下载中', progress:.42}}));
      await list.locator('.batch-row-status', {hasText: '下载中 42%'}).waitFor();
      await list.getByRole('button',{name:'全部加入（1）',exact:true}).click();
      await page.waitForFunction(() => window.javMock.calls.some(call => call.method === 'POST' && JSON.parse(call.data!).code === 'ABP-616' && JSON.parse(call.data!).switch === true));
      assert.equal(await chip('ABP-616').getAttribute('title'), '正在换一个磁力…');
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  for (const enabled of [true, false]) it(`点加入${enabled ? '播放开始音，入库后整理完成才播放成功音' : '与整理完成都按设置不出声'}`, async () => {
    const opened = await open(browser, {url:'https://javdb.com/', html:'<p>SSIS-057</p>', automatic:false,
      updateValues: enabled ? {} : {'peach.jav.success-sound': false}});
    const {page} = opened;
    try {
      await page.evaluate(() => {
        const tones: number[] = [];
        (window as unknown as {tones: number[]}).tones = tones;
        class FakeContext {
          state = 'running'; currentTime = 0; destination = {};
          createOscillator() { return {type:'', frequency:{setValueAtTime:(value: number) => tones.push(value), exponentialRampToValueAtTime(){}}, connect(){}, start(){}, stop(){}}; }
          createGain() { return {gain:{setValueAtTime(){}, exponentialRampToValueAtTime(){}}, connect(){}}; }
        }
        Object.assign(window, {AudioContext: FakeContext});
        window.javMock.menus['开启']!();
      });
      const list = page.locator('#peach-jav-batch');
      await initialRows(page, ['SSIS-057']);
      await list.getByRole('button',{name:'全部加入（1）',exact:true}).click();
      await pending(page, 2);
      assert.deepEqual(await page.evaluate(() => (window as unknown as {tones: number[]}).tones), enabled ? [550] : []);
      await reply(page, 1, body('submitted', 'SSIS-057'));
      await page.clock.fastForward(2100);
      await pending(page, 3);
      await page.evaluate(() => window.javMock.reply(2, {ok:true, code:'SSIS-057', state:'ingested', message:'ingested',
        download:{state:'ingested', label:'已入库', progress:1, postprocess_state:'running', postprocess_label:'采集作品资料'}}));
      await list.locator('.batch-row-status', {hasText: '整理中'}).waitFor();
      assert.deepEqual(await page.evaluate(() => (window as unknown as {tones: number[]}).tones), enabled ? [550] : []);
      await page.clock.fastForward(2100);
      await pending(page, 4);
      await page.evaluate(() => window.javMock.reply(3, {ok:true, code:'SSIS-057', state:'ingested', message:'ingested',
        download:{state:'ingested', label:'已入库', progress:1, postprocess_state:'complete'}}));
      await list.locator('.batch-row-status', {hasText: '已入库'}).waitFor();
      assert.deepEqual(await page.evaluate(() => (window as unknown as {tones: number[]}).tones), enabled ? [550, 523, 523 * 1.25] : []);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('人物资料按 Peach 补零后的番号作键时仍能对上，没有条目的行保留默认人像', async () => {
    const opened = await open(browser, {url:'https://javdb.com/', html:'<p>ABP-16 IPX-001</p>'});
    const {page} = opened;
    try {
      await page.evaluate(() => {
        type Request = {url: string; onload(value: unknown): void};
        const scope = window as unknown as {GM_xmlhttpRequest: (request: Request) => unknown};
        const original = scope.GM_xmlhttpRequest;
        scope.GM_xmlhttpRequest = request => {
          if (new URL(request.url).pathname !== '/api/jav-browser/people') return original(request);
          setTimeout(() => request.onload({status:200, responseText:JSON.stringify({ok:true, source:'local-cache', items:{'ABP-016':[{name:'Alice'}]}})}), 0);
          return {abort(){}};
        };
        window.javMock.menus['开启']!();
      });
      const list = page.locator('#peach-jav-batch');
      await list.locator('.batch-row', {hasText:'ABP-16'}).getByRole('img', {name:'Alice', exact:true}).waitFor();
      assert.equal(await list.locator('.batch-row', {hasText:'IPX-001'}).locator('.batch-person').count(), 1);
      assert.equal(await list.getByText('本地女优资料格式无效').count(), 0);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('人物头像多了也限宽：最多叠三枚，标题区变窄时减到两枚，番号留出位置', async () => {
    const five = ['Alice', 'Bella', 'Cora', 'Dana', 'Erin'].map(name => ({ name }));
    const opened = await open(browser, { initial: 'owned', peopleItems: { 'SSIS-057': five, 'IPX-001': five },
      activeItems: [body('queued', 'IPX-001')] });
    const { page } = opened;
    try {
      const root = page.locator(ROOT);
      // 第五枚按规则隐藏，不在无障碍树里，按 title 等它渲染出来。
      const title = root.locator('.panel > .bar .bar-title'), row = root.locator('.shared-row[data-code="IPX-001"]');
      await title.locator('.batch-person[title="Erin"]').waitFor({ state: 'attached' });
      await row.locator('.batch-person[title="Erin"]').waitFor({ state: 'attached' });
      const read = (node: Element) => ({
        shown: [...node.querySelectorAll('.batch-person')].filter(person => getComputedStyle(person).display !== 'none').length,
        width: Math.round(node.getBoundingClientRect().width) });
      const rule = (width: number) => width < 120 ? 1 : width < 180 ? 2 : 3;
      // 其他任务的行够宽，叠三枚到顶。
      assert.equal((await row.evaluate(read)).shown, 3);
      for (const width of [1280, 340, 300]) {
        await page.setViewportSize({ width, height: 720 });
        await page.waitForTimeout(100);
        const header = await title.evaluate(read);
        assert.equal(header.shown, rule(header.width), `视口 ${width}px，标题区 ${header.width}px`);
        // 番号仍有足够宽度：头像让出的位置给番号。
        assert.ok(await title.locator('strong').evaluate(node => node.clientWidth >= Math.min(node.scrollWidth, 60)), `视口 ${width}px 时番号太窄`);
      }
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('单个人物头像悬停不抬起，两枚以上才抬起让位', async () => {
    const opened = await open(browser, {url:'https://javdb.com/', html:'<p>SSIS-057 ABP-616</p>'});
    const {page} = opened;
    try {
      await page.evaluate(() => { window.javMock.peopleItems = {'SSIS-057':[{name:'Alice'}], 'ABP-616':[{name:'Alice'},{name:'Bella'}]}; window.javMock.menus['开启']!(); });
      const list = page.locator('#peach-jav-batch');
      const lifted = async (code: string) => {
        const avatar = list.locator('.batch-row', {hasText: code}).locator('.batch-person').first();
        await avatar.waitFor();
        await avatar.hover();
        return avatar.evaluate(node => getComputedStyle(node).getPropertyValue('--lift-scale').trim());
      };
      await list.locator('.batch-row', {hasText: 'ABP-616'}).getByRole('img', {name: 'Bella', exact: true}).waitFor();
      assert.equal(await lifted('SSIS-057'), '');
      assert.equal(await lifted('ABP-616'), '1.05');
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('候选较多时表格限高，在表内滚动并保留表头', async () => {
    const codes = Array.from({length:30}, (_, index) => `ABP-${String(index + 100)}`).join(' ');
    const opened = await open(browser, {url:'https://javdb.com/', html:`<p>${codes}</p>`});
    const {page} = opened;
    try {
      await page.evaluate(() => window.javMock.menus['开启']!());
      const list = page.locator('#peach-jav-batch');
      await list.getByRole('checkbox',{name:'选择 ABP-129',exact:true}).waitFor({state:'attached'});
      const frame = list.locator('.batch-list');
      const metrics = await frame.evaluate(node => { node.scrollTop = node.scrollHeight;
        const head = node.querySelector('thead')!.getBoundingClientRect(), box = node.getBoundingClientRect();
        return {scrolls: node.scrollHeight > node.clientHeight, height: box.height, headTop: Math.round(head.top - box.top)}; });
      assert.equal(metrics.scrolls, true);
      assert.ok(metrics.height <= 482, `表格高度 ${metrics.height}`);
      assert.ok(metrics.headTop <= 1, `表头偏移 ${metrics.headTop}`);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('DMM 详情页把出演者随番号查询人物，浮卡标题与本页列表都显示', async () => {
    const opened = await open(browser,{url:'https://video.dmm.co.jp/av/content/?id=dasd00911',title:'作品详情',resolved:'DASD-911',peopleItems:{'DASD-911': [{name:'河北彩花'}]},
      html:'<table><tr><th>出演者：</th><td><a href="/av/list/?actress=1">河北彩花（河北彩伽）</a></td></tr><tr><th>メーカー品番：</th><td>DASD-911</td></tr></table>'});
    const {page} = opened;
    try {
      await ready(page);
      await page.locator(ROOT).locator('.bar-title').getByRole('img',{name:'河北彩花',exact:true}).waitFor();
      await page.locator(ROOT).getByRole('button',{name:'识别本页全部番号',exact:true}).click();
      const list = page.locator('#peach-jav-batch');
      await list.locator('.batch-row').first().getByRole('img',{name:'河北彩花',exact:true}).waitFor();
      const queried = await page.evaluate(() => window.javMock.peopleRequests.map(url => new URL(url).searchParams.getAll('performers')));
      assert.ok(queried.some(names => names.length === 1 && names[0] === '河北彩花（河北彩伽）'), JSON.stringify(queried));
      assert.ok(queried.every(names => names.length === 0 || names[0] === '河北彩花（河北彩伽）'));
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('JavDB 详情页的出演者保留 ♀/♂ 标记交给 Peach 判别', async () => {
    const opened = await open(browser,{url:'https://javdb.com/v/AbC123',title:'SSIS-839 | JavDB',
      html:'<h2 class="title">SSIS-839 標題</h2><div class="panel-block"><strong>番號:</strong><span class="value">SSIS-839</span></div>'
        + '<div class="panel-block"><strong>演員:</strong><span class="value"><a href="/actors/a">河北彩花</a><strong class="symbol female">♀</strong>'
        + '<a href="/actors/b">男優</a><strong class="symbol male">♂</strong></span></div>'});
    const {page} = opened;
    try {
      await ready(page);
      await page.waitForFunction(() => window.javMock.peopleRequests.length > 0);
      const queried = await page.evaluate(() => new URL(window.javMock.peopleRequests[0]!).searchParams.getAll('performers'));
      assert.deepEqual(queried, ['河北彩花♀', '男優♂']);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('DMM 页面扫描排除设备名并复用 Peach 已解析的规范番号', async () => {
    const opened = await open(browser,{url:'https://video.dmm.co.jp/av/content/?id=dasd00911',title:'作品详情',
      html:'<nav>PS5 PS4</nav><p>商品番号 dasd00911</p><img alt="DASD00911">',resolved:'DASD-911'});
    try {
      await ready(opened.page);
      await opened.page.locator(ROOT).getByRole('button',{name:'识别本页全部番号',exact:true}).click();
      const list=opened.page.locator('#peach-jav-batch');
      await list.getByRole('checkbox',{name:'选择 DASD-911',exact:true}).waitFor();
      assert.equal(await list.locator('.batch-row').count(),1);
      assert.equal(await list.getByRole('checkbox',{name:'选择 PS-5',exact:true}).count(),0);
      assert.equal(await list.getByRole('checkbox',{name:'选择 PS-4',exact:true}).count(),0);
      assert.equal(await list.getByRole('checkbox',{name:'选择 DASD-00911',exact:true}).count(),0);
      assert.equal(await opened.page.evaluate(()=>window.javMock.calls.filter(call=>call.method==='POST').length),0);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('Peach 首次查询未完成时，页面扫描先取得 DMM 规范番号', async () => {
    const opened = await open(browser,{url:'https://video.dmm.co.jp/av/content/?id=dasd00911',title:'作品详情',
      html:'<nav>PS5 PS4</nav><p>商品番号 dasd00911</p>',automatic:false});
    try {
      await pending(opened.page,1);
      await opened.page.locator(ROOT).getByRole('button',{name:'识别本页全部番号',exact:true}).click();
      await pending(opened.page,2);
      await reply(opened.page,1,body('idle','DASD-911'));
      const list=opened.page.locator('#peach-jav-batch');
      await list.getByRole('checkbox',{name:'选择 DASD-911',exact:true}).waitFor();
      assert.equal(await list.locator('.batch-row').count(),1);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  it('手机列表保持单行操作，缺照片显示灰色首字，无人物资料显示默认人像', async () => {
    const opened=await open(browser,{url:'https://javdb.com/',html:'<p>SSIS-057 ABP-616</p>',viewport:VIEWPORTS.find(item=>item.width===390)});
    const {page}=opened;
    try{
      await page.evaluate(()=>{window.javMock.peopleItems={'SSIS-057':[{name:'Alice'}]};window.javMock.menus['开启']!();});
      const list=page.locator('#peach-jav-batch');
      await list.getByRole('img',{name:'Alice',exact:true}).waitFor();
      assert.equal(await list.getByRole('button',{name:'设置',exact:true}).count(),0);
      assert.equal(await list.getByRole('img',{name:'Alice',exact:true}).innerText(),'A');
      assert.equal(await list.getByRole('table',{name:'本页番号列表'}).count(),1);
      await list.getByRole('checkbox',{name:'选择 SSIS-057',exact:true}).check();
      assert.equal(await list.getByRole('checkbox',{name:'全选本页番号',exact:true}).evaluate(node=>(node as HTMLInputElement).indeterminate),true);
      assert.equal(await list.locator('[data-board-selected]').count(),1);
      await list.getByRole('checkbox',{name:'全选本页番号',exact:true}).check();
      assert.equal(await list.locator('[data-board-selected]').count(),2);
      await list.getByRole('checkbox',{name:'全选本页番号',exact:true}).uncheck();
      assert.equal(await list.locator('[data-board-selected]').count(),0);
      const ordering=await list.locator('.batch-row').filter({hasText:'SSIS-057'}).locator('.batch-row-main').evaluate(node=>node.firstElementChild?.className);
      assert.equal(ordering,'batch-people');
      const borders=await list.locator('.batch-footer button').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).borderTopWidth));
      assert.ok(borders.every(border=>border==='1px'));
      const boxes=await list.locator('.batch-footer button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().top));
      assert.ok(boxes.every(top=>top===boxes[0]));
      const fallback=list.locator('.batch-row').filter({hasText:'ABP-616'}).getByRole('img',{name:'默认头像',exact:true});
      assert.equal(await fallback.locator('svg').count(),1);
      const avatarSizes=await list.locator('.batch-person').evaluateAll(nodes=>nodes.map(node=>[node.getBoundingClientRect().width,node.getBoundingClientRect().height]));
      assert.ok(avatarSizes.every(([width,height])=>width===24&&height===24));
    }finally{await opened.close();}
  });

  it('普通网页默认不运行添加界面，常驻模式主动识别后仅提交番号', async () => {
    const hidden = await open(browser,{url:'https://example.org/private',html:'<p>SSIS-057</p>'});
    try {assert.equal(await hidden.page.locator('aside[id^="peach-jav-"]').count(),0);} finally {await hidden.close();}
    const opened = await open(browser,{url:'https://example.org/private?secret=value',html:'<p>SSIS-057</p>',updateValues:{'peach.jav.display':'always'}});
    const {page} = opened;
    try {
      assert.equal(await page.evaluate(()=>window.javMock.calls.length),0);
      await page.evaluate(()=>window.javMock.menus['开启']!());
      await page.locator('#peach-jav-batch').getByRole('button',{name:'全部加入（1）',exact:true}).click();
      await page.waitForFunction(()=>window.javMock.calls.some(call=>call.method==='POST'));
      assert.deepEqual(await page.evaluate(()=>JSON.parse(window.javMock.calls.find(call=>call.method==='POST')!.data!)),{code:'SSIS-057',manual:true});
    } finally {await opened.close();}
  });

  it('彻底关闭不显示图标或自动查询，三项菜单可检测更新、设置和重新开启',async()=>{
    const opened=await open(browser,{updateValues:{'peach.jav.enabled':false}});
    const {page}=opened;
    try{
      assert.deepEqual(await page.evaluate(()=>Object.keys(window.javMock.menus)),['开启','检测更新','设置']);
      assert.equal(await page.locator('aside[id^="peach-jav-"]').count(),0);
      assert.equal(await page.evaluate(()=>window.javMock.calls.length+window.javMock.updates.length),0);
      await page.evaluate(()=>window.javMock.menus['检测更新']!());
      await settingsDialog(page).waitFor();
      assert.equal(await settingsDialog(page).getByRole('radio',{name:'彻底关闭图标',exact:true}).isChecked(),true);
      await page.waitForFunction(()=>window.javMock.updates.length===2);
      await settingsDialog(page).getByRole('button',{name:'返回 Peach 主界面',exact:true}).click();
      await settingsDialog(page).waitFor({state:'detached'});
      assert.equal(await page.locator(ROOT).count(),0);
      await page.evaluate(()=>window.javMock.menus['开启']!());
      await ready(page);
      assert.equal(await page.evaluate(()=>window.javMock.values['peach.jav.enabled']),true);
      await page.locator(ROOT).getByRole('button',{name:'Peach 设置',exact:true}).click();
      await settingsDialog(page).getByRole('radio',{name:'彻底关闭图标',exact:true}).check();
      await settingsDialog(page).getByRole('button',{name:'保存设置',exact:true}).click();
      await settingsDialog(page).waitFor({state:'detached'});
      const count=await page.evaluate(()=>window.javMock.calls.length);
      await page.clock.fastForward(3000);
      assert.equal(await page.locator('aside[id^="peach-jav-"]').count(),0);
      assert.equal(await page.evaluate(()=>window.javMock.calls.length),count);
    }finally{await opened.close();}
  });

  it('尚未配对且字段留空时也可保存彻底关闭',async()=>{
    const opened=await open(browser,{configured:false});
    const {page}=opened;
    try{
      await page.evaluate(()=>window.javMock.menus['设置']!());
      await settingsDialog(page).getByRole('radio',{name:'彻底关闭图标',exact:true}).check();
      await settingsDialog(page).getByRole('button',{name:'保存设置',exact:true}).click();
      await settingsDialog(page).waitFor({state:'detached'});
      assert.equal(await page.locator('aside[id^="peach-jav-"]').count(),0);
      assert.equal(await page.evaluate(()=>window.javMock.values['peach.jav.enabled']),false);
      assert.deepEqual(await pairingStorage(page),{});
    }finally{await opened.close();}
  });

  for(const theme of ['light','dark'] as const)it(`${theme} 无图头像保持对比度，表格使用完整字阶，子页返回不保存设置`,async()=>{
    const opened=await open(browser,{url:'https://javdb.com/',html:'<p>SSIS-057 ABP-616</p>'});
    const {page}=opened;
    try{
      await page.emulateMedia({colorScheme:theme});
      await page.evaluate(()=>{window.javMock.peopleItems={'SSIS-057':[{name:'Alice'}]};window.javMock.menus['开启']!();});
      const list=page.locator('#peach-jav-batch');
      await list.getByRole('img',{name:'Alice',exact:true}).waitFor();
      const contrast=()=>list.locator('.batch-person').evaluateAll(nodes=>nodes.map(node=>{
        const context=document.createElement('canvas').getContext('2d')!;
        const luminance=(color:string)=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);
          const rgba=context.getImageData(0,0,1,1).data;
          const linear=[...rgba].slice(0,3).map(value=>{const x=value/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
          return .2126*linear[0]!+.7152*linear[1]!+.0722*linear[2]!;};
        const style=getComputedStyle(node),a=luminance(style.color),b=luminance(style.backgroundColor);
        return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      }));
      assert.ok((await contrast()).every(value=>value>=4.5));
      await list.locator('.batch-row').filter({hasText:'SSIS-057'}).hover();
      assert.ok((await contrast()).every(value=>value>=4.5));
      await list.getByRole('checkbox',{name:'选择 SSIS-057',exact:true}).check();
      assert.ok((await contrast()).every(value=>value>=4.5));
      const metrics=await list.locator('td').first().evaluate(node=>{const style=getComputedStyle(node);return[style.fontSize,style.lineHeight,style.fontWeight,style.padding];});
      assert.deepEqual(metrics,['14px','20px','500','10px 12px']);
      assert.equal(await list.getByRole('button',{name:/关闭/}).count(),0);
      await list.getByRole('button',{name:'返回 Peach 主界面',exact:true}).click();
      await list.waitFor({state:'detached'});
      await page.evaluate(()=>window.javMock.menus['设置']!());
      const dialog=settingsDialog(page);
      await dialog.getByLabel('专用令牌',{exact:true}).fill('unsaved-draft');
      const order=await dialog.locator('header').evaluate(node=>[...node.children].map(child=>child.tagName));
      assert.deepEqual(order,['BUTTON','H2']);
      assert.equal(await dialog.getByRole('button',{name:/关闭/}).count(),0);
      await dialog.getByRole('button',{name:'返回 Peach 主界面',exact:true}).click();
      await dialog.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>window.javMock.values['peach.jav.token']),TOKEN);
    }finally{await opened.close();}
  });

  it('配对 Peach 页面只发布主题和强调色，来源页实时应用相同 origin 的外观', async () => {
    const producer=await open(browser,{url:BASE,html:'<style>:root{--color-accent-400:#a78bfa;--color-accent-500:#8b5cf6;--color-accent-600:#7c3aed;--color-accent-700:#6d28d9}</style>'});
    try {
      await producer.page.evaluate(()=>{localStorage.setItem('peach.settings.v1',JSON.stringify({theme:'light',accent:'violet',privateValue:'excluded'}));document.documentElement.dataset.theme='light';});
      await producer.page.waitForFunction(()=>JSON.parse(String(window.javMock.values['peach.jav.appearance'])).theme==='light');
      const snapshot=await producer.page.evaluate(()=>String(window.javMock.values['peach.jav.appearance']));
      assert.deepEqual(Object.keys(JSON.parse(snapshot)).sort(),['accent','base','colors','theme']);
      const consumer=await open(browser,{updateValues:{'peach.jav.appearance':snapshot}});
      try {
        await ready(consumer.page);
        assert.equal(await consumer.page.locator(ROOT).getAttribute('data-theme'),'light');
        assert.equal(await consumer.page.locator(ROOT).evaluate(node=>getComputedStyle(node).getPropertyValue('--color-accent-500').trim()),'#8b5cf6');
        await consumer.page.evaluate(()=>window.javMock.changed('peach.jav.appearance',JSON.stringify({base:'https://other.invalid',theme:'dark',accent:'violet',colors:{400:'#fff',500:'#fff',600:'#fff',700:'#fff'}}),true));
        assert.equal(await consumer.page.locator(ROOT).getAttribute('data-theme'),null);
      } finally {await consumer.close();}
    } finally {await producer.close();}
  });

  it('保存设置后收为图标，拖动只保存位置，不添加任务', async () => {
    const opened=await open(browser);
    const {page}=opened;
    try {
      await ready(page);
      await page.locator(ROOT).getByRole('button',{name:'Peach 设置',exact:true}).click();
      await settingsDialog(page).getByRole('button',{name:'保存设置',exact:true}).click();
      await page.locator('#peach-jav-settings').waitFor({state:'detached'});
      assert.equal(await page.locator(ROOT).getAttribute('data-panel-mode'),'minimized');
      const box=await page.locator(ROOT).boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x+24,box.y+24);await page.mouse.down();
      await page.mouse.move(box.x-100,box.y-100,{steps:6});await page.mouse.up();
      const position=await page.evaluate(()=>JSON.parse(String(window.javMock.values['peach.jav.position'])));
      assert.equal(position.version,2);
      assert.ok(position.right>0 && position.bottom>0);
      const moved=await page.locator(ROOT).boundingBox();
      assert.ok(moved && moved.x<box.x-50 && moved.y<box.y-50);
      assert.equal(await page.locator(ROOT).getAttribute('data-panel-mode'),'minimized');
      assert.equal(await page.evaluate(()=>window.javMock.calls.filter(call=>call.method==='POST').length),0);
    } finally {await opened.close();}
  });

  it('展开的面板按住空白处可拖动，按在按钮上照常点击', async () => {
    const opened=await open(browser);
    const {page}=opened;
    try {
      await ready(page);
      assert.equal(await page.locator(ROOT).getAttribute('data-panel-mode'),'expanded');
      const panel=page.locator(ROOT).locator('.panel');
      const box=await panel.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x+6,box.y+box.height-6);await page.mouse.down();
      await page.mouse.move(box.x-100,box.y+box.height-106,{steps:6});await page.mouse.up();
      const moved=await panel.boundingBox();
      assert.ok(moved && moved.x<box.x-50 && moved.y<box.y-50);
      const position=await page.evaluate(()=>JSON.parse(String(window.javMock.values['peach.jav.position'])));
      assert.ok(position.right>0 && position.bottom>0);
      assert.equal(await page.locator(ROOT).getAttribute('data-panel-mode'),'expanded');
      assert.equal(await page.evaluate(()=>String(document.getSelection())),'');
      assert.equal(await page.evaluate(()=>window.javMock.calls.filter(call=>call.method==='POST').length),0);
      const add=page.locator(ROOT).locator('[data-action="add"]');
      const button=await add.boundingBox();
      assert.ok(button);
      await page.mouse.move(button.x+button.width/2,button.y+button.height/2);await page.mouse.down();
      await page.mouse.move(button.x+button.width/2-60,button.y+button.height/2-60,{steps:4});await page.mouse.up();
      assert.deepEqual(await panel.boundingBox(),moved);
      await page.clock.fastForward(300);
      await add.click();
      await page.waitForFunction(()=>window.javMock.calls.some(call=>call.method==='POST'));
    } finally {await opened.close();}
  });

  it('浮窗与图标跨窗口保留距右下角的距离，缩小窗口只限制显示位置而不覆盖记录', async () => {
    const saved = JSON.stringify({ version: 2, right: 64, bottom: 72 });
    const windows = await Promise.all([open(browser, { updateValues: { 'peach.jav.position': saved } }),
      open(browser, { updateValues: { 'peach.jav.position': saved } })]);
    try {
      await windows[1]!.page.setViewportSize({ width: 900, height: 700 });
      for (const { page } of windows) {
        await ready(page);
        const root = page.locator(ROOT);
        const gap = () => root.evaluate(node => { const box = node.getBoundingClientRect();
          return { right: document.documentElement.clientWidth - box.right, bottom: innerHeight - box.bottom }; });
        const assertGap = async () => { const value = await gap(); assert.ok(Math.abs(value.right - 64) < 1); assert.ok(Math.abs(value.bottom - 72) < 1); };
        await assertGap();
        await root.getByRole('button', { name: '隐藏 Peach 面板' }).click();
        await page.clock.fastForward(300);
        await assertGap();
        const updated = JSON.stringify({ version: 2, right: 28, bottom: 32 });
        await page.evaluate(value => window.javMock.changed('peach.jav.position', value, true), updated);
        const remoteGap = await gap();
        assert.ok(Math.abs(remoteGap.right - 28) < 1 && Math.abs(remoteGap.bottom - 32) < 1);
        await page.setViewportSize({ width: 390, height: 220 });
        await page.clock.fastForward(300);
        assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.position']), updated);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.clock.fastForward(300);
        const restored = await gap();
        assert.ok(Math.abs(restored.right - 28) < 1 && Math.abs(restored.bottom - 32) < 1);
      }
    } finally { for (const opened of windows) await opened.close(); }
  });

  it('原有比例位置按当前窗口转换一次，后续窗口缩放保持转换后的边距', async () => {
    const opened = await open(browser, { updateValues: { 'peach.jav.position': JSON.stringify({ version: 1, right: .1, bottom: .1 }) } });
    const { page } = opened;
    try {
      await ready(page);
      const converted = await page.evaluate(() => JSON.parse(String(window.javMock.values['peach.jav.position'])));
      assert.deepEqual(converted, { version: 2, right: 136, bottom: 88 });
      await page.setViewportSize({ width: 1600, height: 1000 });
      const gap = await page.locator(ROOT).evaluate(node => { const box = node.getBoundingClientRect();
        return { right: document.documentElement.clientWidth - box.right, bottom: innerHeight - box.bottom }; });
      assert.ok(Math.abs(gap.right - converted.right) < 1 && Math.abs(gap.bottom - converted.bottom) < 1);
      assert.deepEqual(await page.evaluate(() => JSON.parse(String(window.javMock.values['peach.jav.position']))), converted);
    } finally { await opened.close(); }
  });

  it('其他任务标题放不下时保持一行，计数自动来回横滚，「其他任务」与箭头固定', async () => {
    const queued = Array.from({ length: 66 }, (_, index) => body('queued', `ABC-${index + 100}`));
    const done = Array.from({ length: 39 }, (_, index) => body('ingested', `DEF-${index + 100}`));
    const failed = { ...body('failed', 'IPX-001'), cause: 'cloud', ended_key: '1@2026-11-14T08:00:00+00:00', dismissed: false } as Body;
    const opened = await open(browser, { initial: 'owned', activeItems: [...queued, ...done, failed] });
    const { page } = opened;
    try {
      // 视口留窄一些：Linux 上的字体比 Windows 窄，320px 时这一行可能刚好放得下。
      await page.setViewportSize({ width: 280, height: 720 });
      const shared = page.locator(ROOT).locator('.shared-tasks'), heading = shared.locator('.shared-heading');
      await page.waitForFunction(root => document.querySelector(root)?.shadowRoot?.querySelector('.shared-heading')?.textContent
        === '其他任务 · 进行中 66 项 · 已完成 39 项 · 失败 1 项', ROOT);
      const geometry = () => heading.evaluate(node => {
        // 箭头开合时在旋转，外接框会变大；按中心点判断它落在计数之后、标题行之内。
        const counts = node.querySelector('.shared-counts')!, fold = node.querySelector('.shared-fold')!.getBoundingClientRect();
        const title = node.querySelector('.shared-title')!.getBoundingClientRect();
        const text = counts.getBoundingClientRect(), box = node.getBoundingClientRect(), centre = (fold.left + fold.right) / 2;
        return { height: box.height, lineHeight: parseFloat(getComputedStyle(counts).lineHeight), overflow: counts.scrollWidth - counts.clientWidth,
          foldInside: centre > text.right && centre < box.right && box.right <= node.parentElement!.getBoundingClientRect().right + .5,
          title: [title.left, title.width], scrollLeft: counts.scrollLeft, scrollbar: getComputedStyle(counts).scrollbarWidth,
          left: counts.hasAttribute('data-overflow-left'), right: counts.hasAttribute('data-overflow-right') };
      });
      // 时钟停住再逐段推进：开头停 2 秒，再以每秒 24px 滚到头，停 2 秒后滚回开头。
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
      const before = await geometry();
      assert.ok(before.overflow > 0, '窄浮卡里标题应放不下');
      assert.ok(before.height < before.lineHeight * 1.5, `标题折成了 ${before.height}px`);
      assert.deepEqual([before.foldInside, before.scrollbar, before.scrollLeft, before.left, before.right], [true, 'none', 0, false, true]);
      const travel = Math.ceil(before.overflow / 24 * 1000);
      await page.clock.runFor(2000 + travel + 500);
      await page.waitForFunction(root => document.querySelector(root)!.shadowRoot!.querySelector('.shared-counts')!.hasAttribute('data-overflow-left'), ROOT);
      const end = await geometry();
      assert.ok(end.scrollLeft >= end.overflow - 1, `应滚到末尾，停在 ${end.scrollLeft}`);
      assert.deepEqual([end.foldInside, end.right, end.title], [true, false, before.title]);
      await page.clock.runFor(2000 + travel + 500);
      assert.equal((await geometry()).scrollLeft, 0);
      // 指针停在标题上时不动；竖向滚轮在标题上转成横滚。
      await heading.hover();
      await page.clock.runFor(2000 + travel);
      assert.equal((await geometry()).scrollLeft, 0);
      await page.mouse.wheel(0, 400);
      await page.waitForFunction(root => document.querySelector(root)!.shadowRoot!.querySelector('.shared-counts')!.hasAttribute('data-overflow-left'), ROOT);
      const after = await geometry();
      assert.ok(after.scrollLeft > 0);
      assert.deepEqual([after.foldInside, after.right, after.title], [true, false, before.title]);
      // 点击与键盘照旧开合。
      const expanded = await heading.getAttribute('aria-expanded');
      await heading.click();
      assert.notEqual(await heading.getAttribute('aria-expanded'), expanded);
      await heading.focus();
      await page.keyboard.press('Enter');
      assert.equal(await heading.getAttribute('aria-expanded'), expanded);
      // 悬停底色只盖住行，行尾的「标为已读」在底色外。列表是滚动容器，底色左侧外扩的 8px 不能被它裁掉：
      // 左边比头像宽 8px，头像仍与「其他任务」对齐。
      if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
      await page.clock.runFor(1000);
      const row = shared.locator('.shared-row[data-code="IPX-001"]');
      assert.equal(await row.locator('.shared-code').evaluate(node => node.classList.contains('marquee')), true);
      await row.hover();
      await page.clock.runFor(300);
      const hovered = await row.evaluate(node => {
        // 底色有淡入过渡，先结束过渡再读终值。
        for (const animation of node.getAnimations()) animation.finish();
        const list = node.closest('.shared-list')!, box = node.getBoundingClientRect();
        const dismiss = node.parentElement!.querySelector('.geist-button')!.getBoundingClientRect(), avatar = node.firstElementChild!.getBoundingClientRect();
        const title = node.closest('.shared-tasks')!.querySelector('.shared-title')!.getBoundingClientRect();
        return { row: getComputedStyle(node).backgroundColor, outside: dismiss.left >= box.right,
          clipped: box.left < list.getBoundingClientRect().left - .5,
          gutter: Math.round(avatar.left - box.left), aligned: Math.abs(avatar.left - title.left) < 1 };
      });
      assert.notEqual(hovered.row, 'rgba(0, 0, 0, 0)');
      assert.deepEqual([hovered.outside, hovered.clipped, hovered.gutter, hovered.aligned], [true, false, 8, true]);
    } finally { await opened.close(); }
  });

  it('共享进度：持锁窗口查任务列表，本页番号按快照推进，其他番号列在浮卡里，完成只响一次', async () => {
    const running = (code: string, state: State, download?: Body['download']): Body => ({ ...body(state, code), ...(download ? { download } : {}) });
    const opened = await open(browser, { initial: 'submitted', activeItems: [
      running('SSIS-057', 'submitted', { state: 'remote_running', label: '网盘下载中', progress: .4 }),
      running('ABP-616', 'queued'),
      running('IPX-001', 'submitted', { state: 'submit_pending', label: '等待自动重新提交' })], peopleItems: { 'ABP-616': [{ name: 'Alice' }] } });
    const { page } = opened;
    try {
      await ready(page, '查询 Peach 状态');
      await page.waitForFunction(() => String(window.javMock.values['peach.jav.tasks'] || '').includes('ABP-616'));
      assert.equal(JSON.parse(String(await page.evaluate(() => window.javMock.values['peach.jav.poller']))).visible, true);
      const shared = page.locator(ROOT).locator('.shared-tasks');
      const heading = shared.locator('.shared-heading');
      assert.equal(await heading.textContent(), '其他任务 · 进行中 2 项');
      // 本页番号还在抓取，其他任务默认折叠；点标题展开，高度按 Peach Collapse 过渡。
      assert.equal(await heading.getAttribute('aria-expanded'), 'false');
      assert.equal(await shared.locator('.shared-list').isHidden(), true);
      await heading.click();
      assert.equal(await heading.getAttribute('aria-expanded'), 'true');
      assert.equal(await shared.locator('.shared-body').evaluate(node => node.getAnimations().some(animation => animation instanceof CSSTransition)), true);
      // 列表的滚动条沿用 Peach 悬浮轨道，不画原生滚动条。
      assert.equal(await shared.locator('.shared-list').evaluate(node => getComputedStyle(node).scrollbarWidth), 'none');
      assert.equal(await shared.locator('.shared-body > .ovtrack.ov-y').count(), 1);
      await shared.locator('.shared-row .batch-person[title="Alice"]').waitFor();
      assert.deepEqual(await shared.locator('.shared-code').allTextContents(), ['ABP-616', 'IPX-001']);
      // 提交时网盘没应答、Peach 正在自动重新提交的任务仍算进行中。
      assert.deepEqual(await shared.locator('.chip').allTextContents(), ['排队中', '待重新提交']);
      // 每项默认折叠成一行，点开进入该番号的进度页，返回回到浮卡主页；切换时浮卡高度过渡、进来的一层滑入。
      const panel = page.locator(ROOT).locator('.panel');
      const moving = () => panel.evaluate(node => node.getAnimations({ subtree: true }).length);
      await shared.getByRole('button', { name: 'ABP-616，排队中，查看进度' }).click();
      assert.ok(await moving() >= 2);
      const task = page.locator(ROOT).locator('.task-page');
      assert.equal(await task.locator('strong').textContent(), 'ABP-616');
      assert.equal(await task.locator('.batch-person').getAttribute('title'), 'Alice');
      assert.equal(await task.locator('[aria-label="ABP-616 的任务状态"]').textContent(), '已排队');
      assert.equal(await task.locator('.flow-step[aria-current="step"] .flow-label').textContent(), '排队');
      assert.equal(await page.locator(ROOT).locator('.panel > .body').isHidden(), true);
      // 进度页右上角与主页同一组按钮。
      assert.deepEqual(await task.locator('.bar-actions button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))),
        ['Peach 设置', '折叠 Peach 详情', '隐藏 Peach 面板']);
      await task.getByRole('button', { name: '返回 Peach 主页' }).click();
      assert.equal(await task.count(), 0);
      assert.ok(await moving() >= 2);
      assert.equal(await page.locator(ROOT).locator('.panel > .body').isVisible(), true);
      assert.equal(await shared.locator('.shared-row').first().evaluate(node => node.getRootNode().activeElement === node), true);
      await heading.click();
      assert.equal(await heading.getAttribute('aria-expanded'), 'false');
      await shared.locator('.shared-list').waitFor({ state: 'hidden' });
      await page.clock.fastForward(20_000);
      assert.equal(await page.evaluate(() => window.javMock.calls.filter(call => call.method === 'GET').length), 1);
      await page.waitForFunction(root => /40%/.test(document.querySelector(root)!.shadowRoot!.querySelector('[aria-label="Peach 任务状态"]')!.textContent!), ROOT);
      await page.evaluate(() => { window.javMock.activeItems = [
        { ok: true, code: 'SSIS-057', state: 'ingested', message: 'ingested', download: { state: 'ingested', label: '已入库', progress: 1, postprocess_state: 'complete', postprocess_label: '已整理' } },
        { ok: true, code: 'ABP-616', state: 'queued', message: 'queued' }]; });
      await page.clock.fastForward(5_000);
      await page.waitForFunction(() => String(window.javMock.values['peach.jav.chimed'] || '').includes('SSIS'));
      await page.waitForFunction(root => /已入库/.test(document.querySelector(root)!.shadowRoot!.querySelector('[aria-label="Peach 任务状态"]')!.textContent!), ROOT);
      assert.equal(Object.keys(JSON.parse(String(await page.evaluate(() => window.javMock.values['peach.jav.chimed'])))).length, 1);
      assert.equal(await page.evaluate(() => window.javMock.calls.filter(call => call.method === 'GET').length), 1);
      await page.locator(ROOT).getByRole('button', { name: '隐藏 Peach 面板' }).click();
      assert.equal(await page.locator(ROOT).locator('.launcher').getAttribute('data-count'), '1');
    } finally { await opened.close(); }
  });

  it('共享进度：锁在别的可见窗口时只读快照，不请求列表；锁在后台窗口时接管', async () => {
    const lease = (visible: boolean) => JSON.stringify({ owner: 'other-window', until: Date.now() + 600_000, visible });
    const opened = await open(browser, { activeItems: [{ ok: true, code: 'ABP-616', state: 'submitted', message: 'submitted' }],
      updateValues: { 'peach.jav.poller': lease(true) } });
    const { page } = opened;
    try {
      await ready(page);
      await page.clock.fastForward(10_000);
      assert.equal(await page.evaluate(() => window.javMock.activeRequests), 0);
      await page.evaluate(base => window.javMock.changed('peach.jav.tasks', JSON.stringify({ version: 1, base, at: Date.now(), available: true,
        items: [{ ok: true, code: 'MIDV-339', state: 'searching', message: 'searching' }] }), true), BASE);
      assert.deepEqual(await page.locator(ROOT).locator('.shared-code').allTextContents(), ['MIDV-339']);
      await page.evaluate(value => { window.javMock.values['peach.jav.poller'] = value; }, lease(false));
      await page.clock.fastForward(5_000);
      await page.waitForFunction(() => window.javMock.activeRequests > 0);
      await page.waitForFunction(() => String(window.javMock.values['peach.jav.tasks']).includes('ABP-616'));
      assert.deepEqual(await page.locator(ROOT).locator('.shared-code').allTextContents(), ['ABP-616']);
      assert.equal(await page.locator(ROOT).locator('.shared-heading').getAttribute('aria-expanded'), 'true');
      // 超过 3 项自动折叠。
      await page.evaluate(base => window.javMock.changed('peach.jav.tasks', JSON.stringify({ version: 1, base, at: Date.now(), available: true,
        items: ['ABP-616', 'MIDV-339', 'IPX-001', 'JUR-112'].map(code => ({ ok: true, code, state: 'queued', message: 'queued' })) }), true), BASE);
      assert.equal(await page.locator(ROOT).locator('.shared-heading').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator(ROOT).locator('.shared-heading').textContent(), '其他任务 · 进行中 4 项');
    } finally { await opened.close(); }
  });

  it('共享进度：没有进行中的任务时不定时请求，页面隐藏时交出锁并停下，查不到时放慢', async () => {
    const opened = await open(browser, { activeItems: [] });
    const { page } = opened;
    const requests = () => page.evaluate(() => window.javMock.activeRequests);
    const show = (state: 'hidden' | 'visible') => page.evaluate(value => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
    try {
      await ready(page);
      // 载入时没有快照，补查一次；没有进行中的任务就不再定时查。
      await page.waitForFunction(() => window.javMock.activeRequests === 1);
      await page.clock.fastForward(120_000);
      assert.equal(await requests(), 1);
      // 别的窗口写进来一项进行中的任务：本窗口持锁，每 4 秒查一次。
      await page.evaluate(base => {
        window.javMock.activeItems = [{ ok: true, code: 'ABP-616', state: 'searching', message: 'searching' }];
        window.javMock.changed('peach.jav.tasks', JSON.stringify({ version: 1, base, at: Date.now(), available: true,
          items: window.javMock.activeItems }), true);
      }, BASE);
      await page.clock.fastForward(4_100);
      await page.waitForFunction(() => window.javMock.activeRequests === 2);
      // 页面隐藏：交出锁，任务还在进行也不再请求。
      await show('hidden');
      assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.poller']), 'null');
      await page.clock.fastForward(60_000);
      assert.equal(await requests(), 2);
      // 回到前台立刻补查；Peach 回的列表无效时，间隔从 4 秒放慢到 8 秒、再到 16 秒。
      await page.evaluate(() => { window.javMock.activeItems = 'broken' as never; });
      await show('visible');
      await page.waitForFunction(() => window.javMock.activeRequests === 3);
      await page.clock.fastForward(4_100);
      assert.equal(await requests(), 3);
      await page.clock.fastForward(4_000);
      await page.waitForFunction(() => window.javMock.activeRequests === 4);
      await page.clock.fastForward(12_000);
      assert.equal(await requests(), 4);
      await page.clock.fastForward(4_000);
      await page.waitForFunction(() => window.javMock.activeRequests === 5);
    } finally { await opened.close(); }
  });

  it('排队中、前面还有别的番号时，进度页可以提前处理', async () => {
    const opened = await open(browser, { initial: 'owned', automatic: false,
      activeItems: [{ ...body('queued', 'JUL-500'), queue_position: 3 } as Body] });
    const { page } = opened;
    try {
      await pending(page, 1);
      await reply(page, 0, body('owned'));
      const root = page.locator(ROOT), shared = root.locator('.shared-tasks');
      await shared.locator('.shared-row[data-code="JUL-500"]').click();
      const task = root.locator('.task-page');
      await task.getByRole('status').filter({ hasText: '已排队 · 前面还有 2 项' }).waitFor();
      await task.getByRole('button', { name: '提前处理' }).click();
      await pending(page, 2);
      const call = await page.evaluate(() => window.javMock.calls[1]!);
      assert.equal(new URL(call.url).pathname, '/api/jav-browser/prioritize');
      assert.deepEqual(JSON.parse(call.data!), { code: 'JUL-500' });
      // 进度页读共享快照；提前后脚本立刻再取一次 Peach 的任务列表。
      await page.evaluate(value => { window.javMock.activeItems = [value]; }, { ...body('queued', 'JUL-500'), queue_position: 1 } as Body);
      await reply(page, 1, { ...body('queued', 'JUL-500'), queue_position: 1 } as Body);
      await task.getByRole('status').filter({ hasText: /^已排队$/ }).waitFor();
      assert.equal(await task.getByRole('button', { name: '提前处理' }).isHidden(), true);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('共享进度：别的番号结束后一直留在其他任务里，直到逐条或全部标为已读', async () => {
    const ended = (code: string, state: State, key: string, dismissed = false): Body => ({ ...body(state, code), ended_key: key, dismissed,
      ...(state === 'ingested' ? { download: { state: 'ingested', label: '已入库', progress: 1, postprocess_state: 'complete', postprocess_label: '已整理' } } : {}) });
    const opened = await open(browser, { initial: 'owned', activeItems: [
      body('submitted', 'MIDV-339'),
      ended('ABP-616', 'ingested', '11@2026-11-04T08:00:00+00:00'),
      ended('IPX-001', 'failed', '12@2026-11-04T08:01:00+00:00'),
      ended('JUR-112', 'ingested', '13@2026-11-04T07:00:00+00:00', true)] });
    const { page } = opened;
    try {
      const root = page.locator(ROOT), shared = root.locator('.shared-tasks'), heading = shared.locator('.shared-heading');
      await page.waitForFunction(root => root && document.querySelector(root)?.shadowRoot?.querySelector('.shared-row'), ROOT);
      // 失败项从已完成里单独计数，有失败时标题变红。
      assert.equal(await heading.textContent(), '其他任务 · 进行中 1 项 · 已完成 1 项 · 失败 1 项');
      assert.equal(await heading.getAttribute('data-tone'), 'failed');
      // 失败项排最前，其次进行中，已完成的最后；确认过的 JUR-112 不再列出。
      assert.deepEqual(await shared.locator('.shared-code').allTextContents(), ['IPX-001', 'MIDV-339', 'ABP-616']);
      assert.equal(await shared.getByRole('button', { name: '将 MIDV-339 标为已读' }).count(), 0);
      await shared.getByRole('button', { name: '将 ABP-616 标为已读' }).click();
      assert.deepEqual(await page.evaluate(() => window.javMock.dismissals), [{ keys: ['11@2026-11-04T08:00:00+00:00'] }]);
      assert.deepEqual(await shared.locator('.shared-code').allTextContents(), ['IPX-001', 'MIDV-339']);
      // 标为已读后焦点落到相邻行（最后一行落到上一行）；Peach 的列表回来重绘时焦点仍留在这一行。
      await page.waitForFunction(root => (document.querySelector(root)!.shadowRoot!.activeElement as HTMLElement | null)?.dataset.code === 'MIDV-339', ROOT);
      // 进度页的「标为已读」确认后回到主页。
      await shared.locator('.shared-row[data-code="IPX-001"]').click();
      await root.locator('.task-page').getByRole('button', { name: '标为已读' }).click();
      assert.equal(await root.locator('.task-page').count(), 0);
      assert.deepEqual(await page.evaluate(() => window.javMock.dismissals.at(-1)), { keys: ['12@2026-11-04T08:01:00+00:00'] });
      assert.deepEqual(await shared.locator('.shared-code').allTextContents(), ['MIDV-339']);
      assert.equal(await shared.getByRole('button', { name: '全部标为已读' }).isHidden(), true);
      assert.equal(await heading.getAttribute('data-tone'), null);
      // 都结束了还有没确认的：图标角标换成已结束的数量，有失败项时角标变红。
      await page.evaluate(() => { window.javMock.activeItems = [{ ok: true, code: 'MIDV-339', state: 'failed', message: 'failed',
        ended_key: '14@2026-11-04T08:02:00+00:00', dismissed: false } as never]; });
      await page.clock.fastForward(5_000);
      await page.waitForFunction(root => document.querySelector(root)!.shadowRoot!.querySelector('.shared-heading')!.textContent === '其他任务 · 失败 1 项', ROOT);
      await root.getByRole('button', { name: '隐藏 Peach 面板' }).click();
      const launcher = root.locator('.launcher');
      assert.deepEqual(await launcher.evaluate(node => [node.dataset.count, node.dataset.countTone]), ['1', 'failed']);
      await launcher.press('Enter');
      await shared.getByRole('button', { name: '全部标为已读' }).click();
      assert.deepEqual(await page.evaluate(() => window.javMock.dismissals.at(-1)), { all: true });
      assert.equal(await shared.isHidden(), true);
      // 旧版 Peach 没有确认接口：提示更新，任务照旧留在列表里。
      await page.evaluate(() => { window.javMock.dismissStatus = 404; window.javMock.activeItems = [{ ok: true, code: 'ABW-123', state: 'failed',
        message: 'failed', ended_key: '15@2026-11-04T08:03:00+00:00', dismissed: false } as never]; });
      // 没有进行中的任务时不定时查询；页面回到前台、快照超过 30 秒时补查一次，取到新的失败项。
      await page.clock.fastForward(31_000);
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await shared.locator('.shared-row[data-code="ABW-123"]').waitFor();
      await shared.getByRole('button', { name: '将 ABW-123 标为已读' }).click();
      await shared.getByRole('alert').filter({ hasText: 'Peach 尚不支持确认已结束的任务，请更新 Peach。' }).waitFor();
      await shared.locator('.shared-row[data-code="ABW-123"]').waitFor();
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('进度页总有一个主按钮：重试优先于标为已读；在这页入库完成后「提前处理」换成「打开馆藏」，点了打开这部作品并标为已读', async () => {
    const done = { state: 'ingested', label: '已入库', progress: 1, postprocess_state: 'complete', postprocess_label: '已整理' };
    const plain = { ...body('ingested', 'ABP-616'), ended_key: '22@2026-11-14T08:01:00+00:00', dismissed: false, download: done } as Body;
    const missing = { ...body('no_match', 'OFJE-489'), ended_key: 'OFJE-489@2026-11-14T08:02:00+00:00', dismissed: false } as Body;
    const opened = await open(browser, { initial: 'owned', activeItems: [{ ...body('queued', 'STAR-628'), queue_position: 2 } as Body, plain, missing] });
    const { page } = opened;
    try {
      const root = page.locator(ROOT), shared = root.locator('.shared-tasks'), task = root.locator('.task-page');
      const primary = (name: string) => task.getByRole('button', { name, exact: true }).evaluate(node => node.classList.contains('primary'));
      const back = async () => {
        await task.getByRole('button', { name: '返回 Peach 主页', exact: true }).click();
        await task.waitFor({ state: 'detached' });
      };
      await page.waitForFunction(root => document.querySelector(root)?.shadowRoot?.querySelector('.shared-row'), ROOT);
      if (!(await shared.locator('.shared-row[data-code="ABP-616"]').isVisible())) await shared.locator('.shared-heading').click();
      await page.evaluate(() => { Object.assign(window, { opened: [] as unknown[] });
        window.open = (...args: unknown[]) => { (window as unknown as { opened: unknown[] }).opened.push(args); return null; }; });
      // 未找到资源：「重试加入」与「标为已读」同时出现，重试是主按钮。
      await shared.locator('.shared-row[data-code="OFJE-489"]').click();
      assert.equal(await primary('重试加入'), true);
      assert.equal(await primary('标为已读'), false);
      await back();
      // Peach 没带回作品编号时仍是「标为已读」，作为唯一的按钮用主按钮。
      await shared.locator('.shared-row[data-code="ABP-616"]').click();
      assert.equal(await task.getByRole('button', { name: '打开馆藏' }).isHidden(), true);
      assert.equal(await primary('标为已读'), true);
      await back();
      await shared.locator('.shared-row[data-code="STAR-628"]').click();
      assert.equal(await primary('提前处理'), true);
      // 停在进度页时入库完成：快照更新后「提前处理」消失，「打开馆藏」接替为主按钮。
      await page.evaluate(items => { window.javMock.activeItems = items; }, [{ ...body('ingested', 'STAR-628'), asset_id: 4321,
        ended_key: '21@2026-11-14T08:00:00+00:00', dismissed: false, download: done } as Body, plain, missing]);
      await page.clock.fastForward(5_000);
      await task.getByRole('button', { name: '打开馆藏', exact: true }).waitFor();
      assert.equal(await task.getByRole('button', { name: '提前处理' }).isHidden(), true);
      assert.equal(await task.getByRole('button', { name: '标为已读' }).isHidden(), true);
      assert.equal(await primary('打开馆藏'), true);
      await task.getByRole('button', { name: '打开馆藏' }).click();
      assert.deepEqual(await page.evaluate(() => (window as unknown as { opened: unknown[] }).opened), [[`${BASE}/assets/4321`, '_blank', 'noopener']]);
      assert.deepEqual(await page.evaluate(() => window.javMock.dismissals.at(-1)), { keys: ['21@2026-11-14T08:00:00+00:00'] });
      assert.equal(await task.count(), 0);
      assert.deepEqual((await shared.locator('.shared-code').allTextContents()).sort(), ['ABP-616', 'OFJE-489']);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('点标题栏的番号复制番号，鼠标与键盘都能触发，复制后短暂显示「已复制」', async () => {
    const opened = await open(browser, { initial: 'owned', activeItems: [{ ...body('queued', 'STAR-628'), queue_position: 2 } as Body] });
    const { page } = opened;
    try {
      const root = page.locator(ROOT), task = root.locator('.task-page');
      // 主页标题：确定的番号可复制。
      const heading = root.locator('.panel > .bar .bar-title > strong');
      await heading.click();
      assert.deepEqual(await page.evaluate(() => window.javMock.clipboard), ['SSIS-057']);
      await root.locator('.copy-feedback', { hasText: '已复制' }).waitFor();
      // 进度页标题：键盘 Enter 也能复制。
      await page.waitForFunction(root => document.querySelector(root)?.shadowRoot?.querySelector('.shared-row'), ROOT);
      await root.locator('.shared-row[data-code="STAR-628"]').click();
      const code = task.getByRole('button', { name: 'STAR-628', exact: true });
      await code.focus();
      await code.press('Enter');
      assert.deepEqual(await page.evaluate(() => window.javMock.clipboard), ['SSIS-057', 'STAR-628']);
      await task.locator('.copy-feedback', { hasText: '已复制' }).waitFor();
      await page.clock.fastForward(2_000);
      await task.locator('.copy-feedback').waitFor({ state: 'detached' });
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('作品浮卡可以加入想要：未入库时显示次要按钮，点了切到已加入态；已在想要、已在库、旧版 Peach 时各自处理', async () => {
    const wantButton = (page: Page) => page.locator(ROOT).locator('.want-toggle');
    // 没发行或没资源：按钮在主按钮之后，不是主按钮。
    let opened = await open(browser, { want: null });
    try {
      const { page } = opened;
      await page.locator(ROOT).getByRole('button', { name: '加入想要', exact: true }).waitFor();
      assert.equal(await wantButton(page).evaluate(node => node.classList.contains('primary')), false);
      assert.equal(await button(page).evaluate(node => node.classList.contains('primary')), true);
      await wantButton(page).click();
      await page.locator(ROOT).getByRole('button', { name: '已加入想要', exact: true, pressed: true }).waitFor();
      assert.equal(await wantButton(page).getAttribute('aria-disabled'), 'true');
      assert.deepEqual(await page.evaluate(() => window.javMock.wantCalls), ['SSIS-057']);
      // 已加入态不可再点：强行点也不会再发登记请求。
      await wantButton(page).click({ force: true });
      assert.deepEqual(await page.evaluate(() => window.javMock.wantCalls), ['SSIS-057']);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
    // 登记失败：原因写在状态行，按钮仍可再点。
    opened = await open(browser, { want: null });
    try {
      const { page } = opened;
      await page.evaluate(() => { window.javMock.wantError = '想要清单暂时不可写'; });
      await wantButton(page).click();
      await page.locator(ROOT).getByRole('status').filter({ hasText: '想要清单暂时不可写' }).waitFor();
      assert.equal(await wantButton(page).getAttribute('aria-disabled'), 'false');
    } finally { await opened.close(); }
    // 已在想要：直接显示已加入态。
    opened = await open(browser, { want: { phase: 'unreleased' } });
    try {
      await opened.page.locator(ROOT).getByRole('button', { name: '已加入想要', exact: true, pressed: true }).waitFor();
    } finally { await opened.close(); }
    // 已在库或旧版 Peach（状态里没有 want 键）：不显示。
    for (const options of [{ initial: 'owned' as State, want: null }, {}]) {
      opened = await open(browser, options);
      try {
        await ready(opened.page, options.initial === 'owned' ? '已有该影片' : '加入 Peach 馆藏');
        assert.equal(await wantButton(opened.page).isHidden(), true);
      } finally { await opened.close(); }
    }
  });

  it('没找到资源的进度页可以加入想要，重试仍是主按钮；已在想要时显示已加入态', async () => {
    const missing = { ...body('no_match', 'OFJE-489'), ended_key: 'OFJE-489@2026-11-14T08:02:00+00:00', dismissed: false } as Body;
    for (const preset of [null, { phase: 'searching' }]) {
      const opened = await open(browser, { initial: 'owned', activeItems: [missing], want: preset });
      const { page } = opened;
      try {
        const root = page.locator(ROOT), task = root.locator('.task-page');
        await page.waitForFunction(root => document.querySelector(root)?.shadowRoot?.querySelector('.shared-row'), ROOT);
        await root.locator('.shared-row[data-code="OFJE-489"]').click();
        // 进页时单独查一次这个番号的状态取 want。
        await page.waitForFunction(() => window.javMock.calls.some(call => call.method === 'GET' && call.url.includes('code=OFJE-489')));
        const want = task.locator('.want-toggle');
        if (preset) {
          await task.getByRole('button', { name: '已加入想要', exact: true, pressed: true }).waitFor();
        } else {
          await task.getByRole('button', { name: '加入想要', exact: true }).waitFor();
          await want.click();
          await task.getByRole('button', { name: '已加入想要', exact: true, pressed: true }).waitFor();
          assert.deepEqual(await page.evaluate(() => window.javMock.wantCalls), ['OFJE-489']);
        }
        assert.equal(await want.evaluate(node => node.classList.contains('primary')), false);
        assert.equal(await task.getByRole('button', { name: '重试加入', exact: true }).evaluate(node => node.classList.contains('primary')), true);
        assert.deepEqual(opened.problems, []);
      } finally { await opened.close(); }
    }
  });

  it('自动重试计划显示等待与次数，重试耗尽后显示失败并保留手动入口', async () => {
    const waiting: Body = { ...body('ingested', 'ABP-616'), retry_at:'2026-11-06T12:30:00Z', retry_attempt:1, retry_limit:3,
      download:{state:'ingested', label:'已入库', progress:1, postprocess_state:'pending', postprocess_label:'等待自动重试（1/3）'} };
    const opened = await open(browser, { initial:'owned', activeItems:[waiting] });
    const { page } = opened;
    try {
      const root = page.locator(ROOT), row = root.locator('.shared-row[data-code="ABP-616"]');
      await row.waitFor();
      const heading = root.locator('.shared-heading');
      if (await heading.getAttribute('aria-expanded') === 'false') await heading.click();
      assert.equal(await row.locator('.chip').textContent(), '待自动重试');
      assert.equal(await row.locator('.chip').getAttribute('data-chip'), 'blue');
      assert.match(await row.locator('.chip').getAttribute('title') || '', /自动重试（1\/3）/);
      await row.click();
      assert.match(await root.locator('.task-page [role=status]').textContent() || '', /等待.*自动重试（1\/3）/);
      assert.equal(await root.locator('.task-page').getByRole('button', { name:'重试整理' }).count(), 0);
      await page.evaluate(value => { window.javMock.activeItems = [{...value, retry_at:undefined, retry_exhausted:true, retry_attempt:3,
        download:{...value.download!, postprocess_state:'failed', postprocess_label:'整理失败'}}]; }, waiting);
      await page.clock.fastForward(5000);
      await root.locator('.task-page').getByRole('button', { name:'重试整理', exact:true }).waitFor();
      assert.match(await root.locator('.task-page [role=status]').textContent() || '', /自动重试已用尽/);
      await root.locator('.task-page').getByRole('button', { name:'返回 Peach 主页' }).click();
      assert.equal(await row.locator('.chip').getAttribute('data-chip'), 'rose');
      assert.equal(await row.locator('.chip').textContent(), '整理失败');
    } finally { await opened.close(); }
  });

  it('列表页浮窗进入任务进度后，定时刷新与来回切换不重新显示主页正文', async () => {
    const opened = await open(browser, { url:'https://javdb.com/', html:'<h1>作品列表</h1>', activeItems:[
      { ...body('ingested', 'ABP-616'), download:{state:'ingested',label:'已入库',progress:1,postprocess_state:'failed',postprocess_label:'整理失败'} },
      body('searching', 'IPX-001')] });
    const { page } = opened;
    try {
      const root = page.locator('#peach-jav-updates');
      await root.getByRole('button', { name:'Peach 设置与更新',exact:true }).click();
      const panel = root.locator('.panel'), main = panel.locator(':scope > .body');
      for (let index=0; index<3; index++) {
        const heading=root.locator('.shared-heading');
        if(await heading.getAttribute('aria-expanded')==='false')await heading.click();
        await root.locator('.shared-row[data-code="ABP-616"]').click();
        await page.clock.fastForward(5000);
        assert.equal(await main.isHidden(), true);
        assert.equal(await panel.locator(':scope > .task-page').isVisible(), true);
        await panel.locator('.task-page').getByRole('button', {name:'返回 Peach 主页'}).click();
        await page.clock.fastForward(5000);
        assert.equal(await main.isVisible(), true);
        assert.equal(await panel.locator(':scope > .task-page').count(), 0);
      }
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('共享进度：连不上 Peach 持续 15 秒后提示，令牌失效给出打开设置，查通后撤掉', async () => {
    const opened = await open(browser, { initial: 'owned', activeItems: [body('queued', 'ABP-616')] });
    const { page } = opened;
    try {
      const shared = page.locator(ROOT).locator('.shared-tasks'), notice = shared.locator('.shared-alerts .notice');
      await shared.locator('.shared-row').first().waitFor();
      await page.evaluate(() => { window.javMock.activeFailure = 'offline'; });
      // 一次失败多半是抖动，不提示；连着失败 15 秒以上才提示，列表保留上一份。
      await page.clock.fastForward(4_100);
      assert.equal(await notice.count(), 0);
      await page.clock.fastForward(16_000);
      await notice.filter({ hasText: '连不上 Peach' }).waitFor();
      assert.equal(await notice.getAttribute('data-tone'), 'error');
      assert.match(await notice.locator('.notice-body').textContent() || '', /^任务进度停在 \d+ 分钟前，恢复后自动刷新$/);
      assert.deepEqual(await shared.locator('.shared-code').allTextContents(), ['ABP-616']);
      await page.evaluate(() => { window.javMock.activeFailure = 'auth'; });
      await page.clock.fastForward(4_100);
      await notice.filter({ hasText: 'Peach 令牌无效或已停用' }).waitFor();
      assert.equal(await notice.getByRole('button', { name: '打开设置' }).isVisible(), true);
      await page.evaluate(() => { window.javMock.activeFailure = ''; });
      await page.clock.fastForward(4_100);
      await notice.first().waitFor({ state: 'detached' });
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('共享进度：失败项排最前且全部列出，渠道暂停时给出提示并按空闲间隔查询', async () => {
    const message = '网盘空间不足，已暂停；扩容或清理后自动继续';
    const queued = Array.from({ length: 24 }, (_, index) =>
      ({ ...body('queued', `ABC-${index + 100}`), message, paused: { failure: 'storage' } }) as Body);
    const failed = (code: string) =>
      ({ ...body('failed', code), cause: 'cloud', ended_key: `3${code.slice(-1)}@2026-11-13T08:00:00+00:00`, dismissed: false }) as Body;
    const opened = await open(browser, { initial: 'owned', activeItems: [...queued, failed('IPX-001'), failed('JUR-112')] });
    const { page } = opened;
    try {
      const root = page.locator(ROOT), shared = root.locator('.shared-tasks');
      await page.waitForFunction(root => document.querySelector(root)?.shadowRoot?.querySelector('.shared-row'), ROOT);
      await page.evaluate(value => { window.javMock.activePaused = [{ provider: '115', provider_label: '115', failure: 'storage',
        message: value, reason: '网盘空间不足', hint: '扩容或清理后自动继续', waiting: 24 }]; }, message);
      // 排着的番号都在暂停中，不按进行中的四秒间隔反复拉列表。
      const before = await page.evaluate(() => window.javMock.activeRequests);
      await page.clock.fastForward(8_000);
      assert.equal(await page.evaluate(() => window.javMock.activeRequests), before);
      await page.clock.fastForward(23_000);
      // 提示框与 Peach 页面的提示同一形状：黄色状态底、圆角，标题与正文分两行。
      const notice = shared.locator('.shared-alerts .notice');
      await notice.filter({ hasText: '115：' }).waitFor();
      assert.deepEqual(await notice.locator('p').allTextContents(), ['115：网盘空间不足', '24 项已暂停，扩容或清理后自动继续']);
      assert.deepEqual(await notice.evaluate(node => { const style = getComputedStyle(node);
        return [style.borderRadius, style.backgroundColor !== 'rgba(0, 0, 0, 0)']; }), ['10px', true]);
      assert.equal(await shared.locator('.shared-heading').textContent(), '其他任务 · 进行中 24 项 · 失败 2 项');
      // 提示框在标题上方、不进折叠区：标题紧接着展开的列表，收起列表时提示框照样显示。
      assert.deepEqual(await shared.evaluate(node => [node.children[0]!.className, node.children[1]!.firstElementChild!.className]),
        ['shared-alerts', 'shared-heading']);
      const heading = shared.locator('.shared-heading');
      if (await heading.getAttribute('aria-expanded') === 'true') await heading.click();
      await shared.locator('.shared-list').waitFor({ state: 'hidden' });
      assert.equal(await notice.isVisible(), true);
      await heading.click();
      // 底部两个动作各带图标，重试在左、标为已读在右。
      const [retry, clear] = [shared.getByRole('button', { name: '重试失败项' }), shared.getByRole('button', { name: '全部标为已读' })];
      assert.deepEqual([await retry.locator('svg').count(), await clear.locator('svg').count()], [1, 1]);
      assert.ok((await retry.boundingBox())!.x + 40 < (await clear.boundingBox())!.x);
      const codes = await shared.locator('.shared-code').allTextContents();
      assert.equal(codes.length, 26);
      assert.deepEqual(codes.slice(0, 3), ['IPX-001', 'JUR-112', 'ABC-100']);
      const pausedRow = shared.locator('.shared-row[data-code="ABC-100"] .chip');
      assert.deepEqual([await pausedRow.textContent(), await pausedRow.getAttribute('data-chip')], ['已暂停', 'yellow']);
      assert.equal(await shared.locator('.shared-row[data-code="IPX-001"] .chip').textContent(), '网盘问题');
      // 要用户动手修的暂停（配置失效）按错误语气显示。
      await page.evaluate(() => { window.javMock.activePaused = [{ provider: '115', provider_label: '115', failure: 'config', tone: 'error',
        message: '网盘配置或登录有问题，已暂停；修好下载设置后自动继续', reason: '网盘配置或登录有问题', hint: '修好下载设置后自动继续', waiting: 24 }]; });
      await page.clock.fastForward(31_000);
      await notice.filter({ hasText: '网盘配置或登录有问题' }).waitFor();
      assert.equal(await notice.getAttribute('data-tone'), 'error');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('共享进度：重试失败项按失败原因逐项重试，进度页的重试按钮随原因改字', async () => {
    const failed = (code: string, extra: Record<string, unknown>): Body => ({ ...body('failed', code), ended_key: `2${code.slice(-1)}@2026-11-04T08:00:00+00:00`, dismissed: false, ...extra });
    const opened = await open(browser, { initial: 'owned', activeItems: [
      failed('IPX-001', { cause: 'magnet', source_url: 'https://javdb.com/v/abc' }),
      { ...body('no_match', 'ABW-123'), ended_key: '23@2026-11-04T08:00:00+00:00', dismissed: false },
      { ...body('ingested', 'ABP-616'), ended_key: '26@2026-11-04T08:00:00+00:00', dismissed: false,
        download: { state: 'ingested', label: '已入库', progress: 1, postprocess_state: 'failed', postprocess_label: '整理失败' } },
      failed('JUR-112', { cause: 'cloud', source_url: 'https://missav.ws/en/jur-112' })] as Body[] });
    const { page } = opened;
    try {
      const root = page.locator(ROOT), shared = root.locator('.shared-tasks');
      await page.waitForFunction(root => document.querySelector(root)?.shadowRoot?.querySelector('.shared-row'), ROOT);
      if (await shared.locator('.shared-heading').getAttribute('aria-expanded') === 'false') await shared.locator('.shared-heading').click();
      // 进度页：磁力失效的换一个磁力，网盘问题的重试加入，整理失败的重试整理。
      const organizeRow = shared.locator('.shared-row[data-code="ABP-616"]');
      assert.equal(await organizeRow.getAttribute('data-state'), 'failed');
      assert.equal(await organizeRow.locator('.chip').textContent(), '整理失败');
      assert.equal(await organizeRow.locator('.chip').getAttribute('data-chip'), 'rose');
      assert.match(await organizeRow.locator('.chip').getAttribute('title') || '', /影片已入库.*整理失败.*重试整理/);
      for (const [code, label] of [['IPX-001', '换一个磁力'], ['JUR-112', '重试加入'], ['ABP-616', '重试整理']]) {
        await shared.locator(`.shared-row[data-code="${code}"]`).click();
        assert.equal(await root.locator('.task-page').getByRole('button', { name: label }).isVisible(), true);
        await root.locator('.task-page').getByRole('button', { name: '返回 Peach 主页' }).click();
      }
      await shared.getByRole('button', { name: '重试失败项' }).click();
      await page.waitForFunction(() => window.javMock.calls.filter(call => call.method === 'POST').length === 4);
      const posts = await page.evaluate(() => window.javMock.calls.filter(call => call.method === 'POST')
        .map(call => [new URL(call.url).pathname, JSON.parse(call.data!)]));
      assert.deepEqual(posts, [
        ['/api/jav-browser', { code: 'IPX-001', source_url: 'https://javdb.com/v/abc', switch: true }],
        ['/api/jav-browser', { code: 'ABW-123', manual: true }],
        ['/api/jav-browser/postprocess', { code: 'ABP-616' }],
        ['/api/jav-browser', { code: 'JUR-112', source_url: 'https://missav.ws/en/jur-112' }]]);
      const organizeBody = { ...body('ingested', 'ABP-616'), download: { state: 'ingested', label: '已入库', progress: 1,
        postprocess_state: 'pending', postprocess_label: '等待整理' } };
      await page.evaluate(value => { window.javMock.activeItems = [value]; }, organizeBody);
      await page.clock.fastForward(31_000);
      await organizeRow.locator('.chip').filter({ hasText: '整理中' }).waitFor();
      assert.equal(await organizeRow.locator('.chip').getAttribute('data-chip'), 'blue');
      await page.evaluate(value => { window.javMock.activeItems = [{ ...value,
        download: { ...value.download, postprocess_state: 'complete', postprocess_label: '整理完成' } }]; }, organizeBody);
      await page.clock.fastForward(5_000);
      await organizeRow.locator('.chip').filter({ hasText: '已入库' }).waitFor();
      assert.equal(await organizeRow.locator('.chip').getAttribute('data-chip'), 'lime');
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('单行放不下的文字不截省略号，在原位自动来回横滚，指针停在上面时不动', async () => {
    const name = '森日向子（もりひなこ）Hinako Mori 旧名 白石アイリ Airi Shiraishi';
    const opened = await open(browser, { url: 'https://javdb.com/actors/bkxd', title: `${name} | JavDB`,
      html: `<h2><span class="actor-section-name">${name}</span></h2>`, performer: { name, entity_id: 8112, following: false } });
    const { page } = opened;
    try {
      const label = page.locator('#peach-jav-updates .performer-head strong');
      await label.waitFor();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
      const read = () => label.evaluate(node => ({ overflow: node.scrollWidth - node.clientWidth, left: node.scrollLeft,
        clip: getComputedStyle(node).textOverflow, marquee: node.classList.contains('marquee'), text: node.textContent }));
      const before = await read();
      assert.ok(before.overflow > 0, '名字应放不下');
      assert.deepEqual([before.clip, before.marquee, before.left, before.text], ['clip', true, 0, name]);
      await page.clock.runFor(3000);
      const moved = (await read()).left;
      assert.ok(moved > 0, '应自动横滚');
      await label.hover();
      await page.clock.runFor(2000);
      assert.equal((await read()).left, moved);
    } finally { await opened.close(); }
  });

  it('JavDB 女优页带上标题栏的名字向 Peach 认人，订阅新作后是按下态、可以取消，按钮统一在其他任务下方', async () => {
    const opened = await open(browser, { url: 'https://javdb.com/actors/bkxd?page=2', title: '森日向子 | JavDB',
      html: '<h2><span class="actor-section-name">森日向子, 白石アイリ</span></h2>',
      performer: { name: '森日向子', entity_id: 8112, following: false } });
    const { page } = opened;
    try {
      const panel = page.locator('#peach-jav-updates'), section = panel.locator('.performer-follow');
      const feed = panel.locator('.feed-toggle'), scan = panel.getByRole('button', { name: '识别本页全部番号' });
      const primary = (node: typeof feed) => node.evaluate(button => button.classList.contains('primary'));
      await panel.getByRole('button', { name: '订阅新作', exact: true }).waitFor();
      assert.equal(await section.locator('strong').textContent(), '森日向子');
      assert.equal(await section.getByRole('status').textContent(), '订阅后，Peach 会定期查她的新作。');
      // 先女优信息，再其他任务，订阅与识别两枚按钮排在最下面。
      assert.deepEqual(await panel.locator('.body').first().evaluate(body => [...body.children].map(node =>
        node.classList.contains('performer-follow') ? 'performer' : node.classList.contains('shared-tasks') ? 'shared'
          : node.classList.contains('feed-toggle') ? 'feed' : node.textContent === '识别本页全部番号' ? 'scan' : '').filter(Boolean)),
        ['performer', 'shared', 'feed', 'scan']);
      // 未订阅时订阅是这张面板的主操作，识别本页番号退成次要按钮。
      assert.equal(await primary(feed), true);
      assert.equal(await primary(scan), false);
      assert.equal(await feed.getAttribute('aria-pressed'), 'false');
      const [lookup] = await page.evaluate(() => window.javMock.performerCalls);
      const asked = new URL(lookup!.url);
      assert.deepEqual([lookup!.method, asked.searchParams.get('source_url'), asked.searchParams.getAll('names')],
        ['GET', 'https://javdb.com/actors/bkxd', ['森日向子, 白石アイリ']]);
      assert.equal(lookup!.headers.Authorization, `Bearer ${TOKEN}`);
      await feed.click();
      // 已订阅：按下态，带订阅橙的 RSS 图标，不再是主按钮；主按钮回到识别本页番号。
      await panel.getByRole('button', { name: '已订阅新作', exact: true, pressed: true }).waitFor();
      assert.equal(await section.getByRole('status').textContent(), 'Peach 会定期查她的新作。');
      assert.equal(await feed.locator('.feed-mark').count(), 1);
      assert.equal(await primary(feed), false);
      assert.equal(await primary(scan), true);
      const posted = await page.evaluate(() => window.javMock.performerCalls.at(-1)!);
      assert.deepEqual([posted.method, JSON.parse(posted.data!)],
        ['POST', { source_url: 'https://javdb.com/actors/bkxd', names: ['森日向子, 白石アイリ'], enabled: true }]);
      // 刚点完指针还在按钮上，仍写「已订阅新作」；移开再悬停时字换成「取消订阅新作」，点了取消，回到未订阅的主按钮。
      await page.mouse.move(0, 0);
      await feed.hover();
      await panel.getByRole('button', { name: '取消订阅新作', exact: true }).click();
      await panel.getByRole('button', { name: '订阅新作', exact: true, pressed: false }).waitFor();
      assert.equal(await primary(feed), true);
      assert.equal(await primary(scan), false);
      assert.deepEqual(opened.problems, []);
    } finally { await opened.close(); }
  });

  it('DMM 与 MISSAV 女优页按地址认人；订阅被拒时原因写在面板上，旧版 Peach 不显示这一块', async () => {
    for (const [url, source] of [
      ['https://video.dmm.co.jp/av/list/?actress=1061586&sort=date', 'https://video.dmm.co.jp/av/list/?actress=1061586'],
      ['https://missav.ws/dm127/cn/actresses/%E6%B6%BC%E6%A3%AE%E3%82%8C%E3%82%80', 'https://missav.ws/dm127/cn/actresses/%E6%B6%BC%E6%A3%AE%E3%82%8C%E3%82%80'],
    ] as const) {
      const opened = await open(browser, { url, title: '女优页', html: '<h1>女优页</h1>',
        performer: { name: '涼森れむ', entity_id: null, following: false } });
      const { page } = opened;
      try {
        const section = page.locator('#peach-jav-updates .performer-follow'), panel = page.locator('#peach-jav-updates');
        await panel.getByRole('button', { name: '订阅新作', exact: true }).waitFor();
        assert.equal(new URL((await page.evaluate(() => window.javMock.performerCalls[0]!)).url).searchParams.get('source_url'), source);
        assert.match(await section.getByRole('status').textContent() || '',
          url.includes('dmm') ? /订阅时会新建她/ : /订阅时会到 JavDB 确认是同一个人/);
        await page.evaluate(() => { window.javMock.performerError = 'JavDB 上按「涼森れむ」没能确认是同一位女优，请到她的 JavDB 演员页订阅'; });
        await panel.getByRole('button', { name: '订阅新作', exact: true }).click();
        await page.waitForFunction(() => /没能确认是同一位女优/.test(document.querySelector('#peach-jav-updates')!.shadowRoot!.querySelector('.performer-follow [role=status]')!.textContent!));
        assert.equal(await panel.getByRole('button', { name: '订阅新作', exact: true }).isEnabled(), true);
      } finally { await opened.close(); }
    }
    const old = await open(browser, { url: 'https://javdb.com/actors/bkxd', html: '<h2><span class="actor-section-name">森日向子</span></h2>' });
    try {
      await old.page.waitForFunction(() => window.javMock.performerCalls.length > 0);
      await old.page.locator('#peach-jav-updates .panel').waitFor({ state: 'attached' });
      await old.page.clock.fastForward(1000);
      // 旧版 Peach 认不了人：这一块不显示，入口面板也不为它自动展开。
      assert.equal(await old.page.locator('#peach-jav-updates').getAttribute('data-panel-mode'), 'minimized');
      assert.equal(await old.page.locator('#peach-jav-updates .performer-follow').evaluate(node => (node as HTMLElement).hidden), true);
      assert.equal(await old.page.locator('#peach-jav-updates .feed-toggle').evaluate(node => (node as HTMLElement).hidden), true);
    } finally { await old.close(); }
  });

  it('旧版 Peach 没有任务列表时记为不可用，浮卡不显示其他任务，仍逐个查询', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await ready(page);
      await page.waitForFunction(() => String(window.javMock.values['peach.jav.tasks'] || '').includes('"available":false'));
      assert.equal(await page.locator(ROOT).locator('.shared-tasks').isHidden(), true);
    } finally { await opened.close(); }
  });

  it('整理失败时按钮变成重试整理，交给 Peach 重试后接着跟踪；旧版 Peach 提示到任务中心重试', async () => {
    const failed = { ...body('ingested'), download: { state: 'ingested', label: '已入库', progress: 1, postprocess_state: 'failed', postprocess_label: '整理失败' } };
    const note = (page: Page) => page.locator(ROOT).locator('[aria-label="Peach 任务状态"]');
    for (const supported of [true, false]) {
      const opened = await open(browser, { automatic: false });
      const { page } = opened;
      try {
        await pending(page, 1);
        await reply(page, 0, failed);
        await ready(page, '重试整理');
        await button(page).click();
        await pending(page, 2);
        const call = await page.evaluate(() => window.javMock.calls[1]!);
        assert.equal(call.method, 'POST');
        assert.match(call.url, /\/api\/jav-browser\/postprocess$/);
        assert.deepEqual(JSON.parse(call.data!), { code: 'SSIS-057' });
        if (!supported) {
          await page.evaluate(() => window.javMock.reply(1, { detail: 'Not Found' }, 404));
          await page.waitForFunction(root => /任务中心重试/.test(document.querySelector(root)!.shadowRoot!.querySelector('[aria-label="Peach 任务状态"]')!.textContent!), ROOT);
          assert.equal(await button(page).textContent(), '重试整理');
          continue;
        }
        await reply(page, 1, { ...failed, download: { ...failed.download, postprocess_state: 'pending', postprocess_label: '等待整理' } });
        await page.waitForFunction(root => /等待整理/.test(document.querySelector(root)!.shadowRoot!.querySelector('[aria-label="Peach 任务状态"]')!.textContent!), ROOT);
        assert.equal(await note(page).getAttribute('data-variant'), 'secondary');
        // 旧版 Peach 没有共享进度时，本页接着查询整理进度。
        await pending(page, 3);
        assert.equal(await page.evaluate(() => window.javMock.calls[2]!.method), 'GET');
      } finally { await opened.close(); }
    }
  });

  it('同源桥接只回报版本和配对状态，不回传配置或令牌', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body:
        new URL(route.request().url()).pathname === '/integrations/peach-userscript-bridge'
          ? '<meta name="peach-userscript-bridge" content="1">'
          : '<iframe id="bridge" src="/integrations/peach-userscript-bridge"></iframe>' }));
      await page.goto(BASE);
      const frame = page.frames().find(frame => frame.url().endsWith('/integrations/peach-userscript-bridge'))!;
      await frame.waitForLoadState();
      await frame.evaluate(({ base, token }) => {
        Object.assign(window, { GM_getValue: (key: string, fallback: string) =>
          ({ 'peach.jav.base': base, 'peach.jav.token': token }[key] ?? fallback) });
      }, { base: BASE, token: TOKEN });
      await frame.addScriptTag({ content: SCRIPT });
      const result = await page.evaluate(async () => {
        const nonce = crypto.randomUUID();
        return await new Promise<Record<string, unknown>>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('桥接无响应')), 2000);
          const receive = (event: MessageEvent) => {
            if (event.data?.nonce !== nonce || event.data.type !== 'peach-userscript:ready') return;
            clearTimeout(timer);
            removeEventListener('message', receive);
            resolve(event.data);
          };
          addEventListener('message', receive);
          document.querySelector<HTMLIFrameElement>('#bridge')!.contentWindow!.postMessage({ type: 'peach-userscript:probe', nonce }, location.origin);
        });
      });
      assert.deepEqual(Object.keys(result).sort(), ['nonce', 'paired', 'protocol', 'type', 'version']);
      assert.equal(result.version, VERSION);
      assert.equal(result.paired, true);
      assert.equal(JSON.stringify(result).includes(TOKEN), false);
      assert.equal(await frame.locator(ROOT).count(), 0);
    } finally { await context.close(); }
  });
});
