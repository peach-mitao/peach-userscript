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
type Body = { ok: boolean; code: string; state: State; message: string; stage?: string;
  download?: { state: string; label: string; phase?: string; progress: number | null; postprocess_state?: string; postprocess_label?: string } };
type Call = { method: string; url: string; headers: Record<string, string>; anonymous: boolean; data?: string };
type MockRequest = Call & { onload(value: unknown): void; ontimeout(): void; onerror(): void; onabort?(): void };
type Mock = {
  peopleItems: Record<string, {name:string;avatar?:string}[]>;
  peopleRequests: string[];
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
};
declare global { interface Window { javMock: Mock } }

function body(state: State, code = 'SSIS-057'): Body {
  return { ok: true, code, state, message: state };
}

async function open(browser: Browser, options: {
  url?: string; title?: string; html?: string; configured?: boolean; viewport?: typeof VIEWPORTS[number]; initial?: State; script?: string; resolved?: string; automatic?: boolean; updateAutomatic?: boolean; updateValues?: Record<string, string | boolean>;
} = {}) {
  const viewport = options.viewport || VIEWPORTS[0]!;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(error.message));
  // 所有页面均为内存夹具，不访问来源站点或 Peach 服务。
  await context.route('**/*', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><title>${options.title || 'SSIS-057 作品详情'}</title></head><body>${options.html ?? '<h1>SSIS-057 作品详情</h1>'}</body></html>`,
  }));
  await page.addInitScript(({ configured, token, base, initial, resolved, automatic, version, updateAutomatic, updateValues }) => {
    const listeners = new Map<number, { key: string; callback: (key: string, oldValue: string | boolean, newValue: string | boolean, remote: boolean) => void }>();
    let nextListener = 0;
    const mock: Mock = {
      calls: [], reports: [], pending: [], updates: [], automatic, updateAutomatic, menus: {}, peopleItems:{}, peopleRequests:[],
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
        mock.calls.push({ method: request.method, url: request.url, headers: request.headers,
          anonymous: request.anonymous, ...(request.data ? { data: request.data } : {}) });
        mock.pending.push(request);
        if (mock.automatic) setTimeout(() => {
          const code = (request.data ? JSON.parse(request.data).code : new URL(request.url).searchParams.get('code')) || resolved || 'SSIS-057';
          request.onload({ status: 200, responseText: JSON.stringify({ ok: true, code, state: initial, message: initial }) });
        }, 0);
      },
    });
  }, { configured: options.configured !== false, token: TOKEN, base: BASE, initial: options.initial || 'idle', resolved: options.resolved,
    automatic: options.automatic !== false, version: VERSION, updateAutomatic: options.updateAutomatic !== false, updateValues: options.updateValues || {} });
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
          const colors = await updates.locator('a').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
          assert.notEqual(colors[0], colors[1]);
        }
        if (!example.script && !example.peach) {
          await page.locator(ROOT).getByRole('button',{name:'Peach 设置',exact:true}).click();
          assert.equal(await settingsDialog(page).getByRole('button',{name:'检查更新',exact:true}).count(),1);
        }
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
          'https://update.sleazyfork.org/scripts/600821/Peach%20%C2%B7%20JAV%20%E5%85%A5%E5%BA%93.user.js');
        assert.equal(await page.evaluate(() => window.javMock.values['peach.jav.installed-version']), VERSION);
        await page.evaluate(() => window.javMock.menus['检测更新']!());
        await waitUpdates(page, 2);
        assert.equal(await settingsDialog(page).getByRole('button', { name: '检查更新', exact: true }).count(), 1);
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
        assert.equal(await install.getAttribute('href'),example.source==='peach'?`${BASE}/integrations/peach-jav.user.js`:'https://update.sleazyfork.org/scripts/600821/Peach%20%C2%B7%20JAV%20%E5%85%A5%E5%BA%93.user.js');
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
        assert.equal((await updatePanel(page).getByLabel('用户脚本更新状态').innerText()).includes('9.5.0'), false);
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
      it(`${viewport.name} ${example.site} 校验详情字段 ${example.code}`, async () => {
        const opened = await open(browser, { url: example.url, title: '作品详情', viewport,
          html: `<table><tr><th>配信品番：</th><td>1dandy00899</td></tr><tr><th>${example.label}</th><td>${example.code}</td></tr></table>`, resolved: example.code });
        try {
          await ready(opened.page);
          const url = new URL(await opened.page.evaluate(() => window.javMock.calls[0]!.url));
          assert.equal(url.pathname, '/api/jav-browser/identify');
          assert.equal(url.searchParams.get('code'), example.code);
          assert.equal(url.searchParams.get('source_url'), example.url);
          assert.equal(await opened.page.locator(ROOT).locator('.bar strong').innerText(), example.code);
          assert.deepEqual(opened.problems, []);
        } finally { await opened.close(); }
      });
    }
  }

  for (const code of ['MKBD-S123', 'MKD-S123', '092415_01', '092415_0001', 'DANDY-851C']) {
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

  it('设置弹窗进入与退出均有过渡，减少动效时立即关闭', async () => {
    const opened = await open(browser);
    const { page } = opened;
    try {
      await page.emulateMedia({reducedMotion:'no-preference'});
      await ready(page);
      await page.evaluate(()=>{
        const trace: Array<{property:string;elapsed:number}> = [];
        (window as Window & {settingsMotion:typeof trace}).settingsMotion=trace;
        const observer=new MutationObserver(()=>{
          const dialog=document.querySelector('#peach-jav-settings')?.shadowRoot?.querySelector('dialog');
          if(!dialog)return;
          observer.disconnect();
          dialog.addEventListener('transitionend',event=>{
            const e=event as TransitionEvent;
            if(e.target===dialog)trace.push({property:e.propertyName,elapsed:e.elapsedTime});
          });
        });
        observer.observe(document.body,{childList:true});
      });
      const trigger=page.locator(ROOT).getByRole('button',{name:'Peach 设置',exact:true});
      await trigger.click();
      await page.waitForFunction(()=>(window as Window & {settingsMotion:Array<{property:string;elapsed:number}>}).settingsMotion.some(e=>e.property==='transform'&&e.elapsed>=.19));
      await settingsDialog(page).getByRole('button',{name:'取消',exact:true}).click();
      await settingsDialog(page).waitFor({state:'detached'});
      const exits=await page.evaluate(()=>(window as Window & {settingsMotion:Array<{property:string;elapsed:number}>}).settingsMotion);
      assert.ok(exits.some(e=>e.property==='opacity'&&e.elapsed>=.11&&e.elapsed<=.13));
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
          assert.equal(await page.locator(ROOT).isVisible(),false);
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

  it('页面候选去重，逐项提交所选番号，再添加剩余项', async () => {
    const opened = await open(browser, {url:'https://javdb.com/', html:'<p>SSIS-057 ABP-616 SSIS-057</p><script>"ABP-999"</script><p hidden>ABP-998</p>'});
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

  it('整页扫描只收带分隔符的番号，不把用户名、导航和域名补成番号', async () => {
    const opened = await open(browser, {url:'https://javdb.com/', html:'<nav>TOP250</nav><p>hhd800.com@FC2-PPV-4302474.mp4</p>'
      + '<p>Exclusive50%OFF!</p><p>jay925 hush666 lexburner69 guangdao19450806</p><p>FC2-4091275 SSIS-057 ssis058</p>'});
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
      await list.getByRole('checkbox',{name:'选择 SSIS-057',exact:true}).check();
      assert.deepEqual(await chip('ABP-616'), {text:'待加入', color:'plain', title:'待加入'});
      await list.getByRole('button',{name:'全部加入（3）',exact:true}).click();
      await pending(page, 1);
      assert.deepEqual(await chip('SSIS-057'), {text:'提交中', color:'blue', title:'正在交给 Peach…'});
      await reply(page, 0, body('owned', 'SSIS-057'));
      await pending(page, 2);
      await page.evaluate(() => window.javMock.reply(1, {}, 503));
      await pending(page, 3);
      await reply(page, 2, {...body('no_match', 'IPX-001'), message:'未找到可自动下载的磁力，可重试'});
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
      await list.getByRole('button',{name:'全部加入（2）',exact:true}).click();
      await pending(page, 1);
      await reply(page, 0, body('queued', 'SSIS-057'));
      await pending(page, 2);
      await page.evaluate(() => window.javMock.reply(1, {ok:true, code:'ABP-616', state:'failed', cause:'magnet', failure:'no_source', message:'没有可用下载源'}));
      await list.locator('.geist-note', {hasText: '1 项磁力失效，再次加入会换一个磁力'}).waitFor();
      assert.equal(await chip('ABP-616').textContent(), '磁力失效');
      assert.equal(await chip('ABP-616').getAttribute('title'), '磁力问题：没有可用下载源。可以换一个磁力。');
      await page.clock.fastForward(2100);
      await pending(page, 3);
      assert.equal(await page.evaluate(() => window.javMock.calls[2]!.method), 'GET');
      await page.evaluate(() => window.javMock.reply(2, {ok:true, code:'SSIS-057', state:'submitted',
        download:{state:'remote_running', label:'网盘下载中', progress:.42}}));
      await list.locator('.batch-row-status', {hasText: '下载中 42%'}).waitFor();
      await list.getByRole('button',{name:'全部加入（1）',exact:true}).click();
      await page.waitForFunction(() => window.javMock.calls.some(call => call.method === 'POST' && JSON.parse(call.data!).code === 'ABP-616' && JSON.parse(call.data!).switch === true));
      assert.equal(await chip('ABP-616').getAttribute('title'), '正在换一个磁力…');
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
  });

  for (const enabled of [true, false]) it(`点加入${enabled ? '播放开始音，影片完成入库再播放成功音' : '与完成入库都按设置不出声'}`, async () => {
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
      await list.getByRole('button',{name:'全部加入（1）',exact:true}).click();
      await pending(page, 1);
      assert.deepEqual(await page.evaluate(() => (window as unknown as {tones: number[]}).tones), enabled ? [550] : []);
      await reply(page, 0, body('submitted', 'SSIS-057'));
      await page.clock.fastForward(2100);
      await pending(page, 2);
      await reply(page, 1, body('ingested', 'SSIS-057'));
      await list.locator('.batch-row-status', {hasText: '已入库'}).waitFor();
      assert.deepEqual(await page.evaluate(() => (window as unknown as {tones: number[]}).tones), enabled ? [550, 523, 523 * 1.25] : []);
      assert.deepEqual(opened.problems,[]);
    } finally {await opened.close();}
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
    const opened = await open(browser,{url:'https://video.dmm.co.jp/av/content/?id=dasd00911',title:'作品详情',resolved:'DASD-911',
      html:'<table><tr><th>出演者：</th><td><a href="/av/list/?actress=1">河北彩花（河北彩伽）</a></td></tr><tr><th>メーカー品番：</th><td>DASD-911</td></tr></table>'});
    const {page} = opened;
    try {
      await page.evaluate(() => { window.javMock.peopleItems = {'DASD-911': [{name:'河北彩花'}]}; });
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
      assert.equal(position.version,1);
      assert.ok(position.right>0 && position.bottom>0);
      const moved=await page.locator(ROOT).boundingBox();
      assert.ok(moved && moved.x<box.x-50 && moved.y<box.y-50);
      assert.equal(await page.locator(ROOT).getAttribute('data-panel-mode'),'minimized');
      assert.equal(await page.evaluate(()=>window.javMock.calls.filter(call=>call.method==='POST').length),0);
    } finally {await opened.close();}
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
