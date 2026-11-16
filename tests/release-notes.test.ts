import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { releaseNotes, versionSection } from '../scripts/release-notes.ts';
import { historyContains, newerThan, releasePayload, signedWebhook, syncNativeHistory } from '../scripts/sleazy-notes.ts';

const SAMPLE = `# Changelog / 更新日志

## 1.2.0 — 2026-11-13

Includes the changes recorded below for source-only versions 1.1.1. / 包含下方仅源码版本 1.1.1 中记录的变更。

### Fixed / 修复

- **Retry failed** retries every failed task. / 「重试失败项」会重试全部失败项。

## 1.1.1 — 2026-11-09

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Added / 新增

- **Queued tasks** can move to the front. / 排队中的任务可以提前处理。

### Fixed / 修复

- **DMM pages** identify titles from the address. / DMM 页只按地址识别番号。

## 1.1.0 — 2026-11-06

### Added / 新增

- **Already released** entry. / 已经发布过的条目。
`;

const REPOSITORY = 'peach-mitao/peach-userscript';
const WEBHOOK = 'https://api.sleazyfork.org/zh-CN/users/1654281-longmeidao/webhook';
const RELEASE = {
  tag_name: 'v0.7.20', name: 'v0.7.20',
  body: releaseNotes(SAMPLE, { version: '1.2.0', previous: 'v1.1.0', repo: REPOSITORY }),
  html_url: `https://github.com/${REPOSITORY}/releases/tag/v0.7.20`,
  assets: [{ name: 'peach-jav.user.js', browser_download_url: `https://github.com/${REPOSITORY}/releases/download/v0.7.20/peach-jav.user.js` }],
};
const EMPTY_HISTORY = '<ul class="history_versions"></ul>';
const UPDATED_HISTORY = `<ul class="history_versions"><li>
  <span class="version-number"><a href="?version=1">v0.7.20</a></span>
  <span class="version-changelog"><ul><li>Fixed</li></ul><a href="${RELEASE.html_url}">GitHub Release</a></span>
</li></ul>`;
const SUCCESS = { updated_scripts: ['https://api.sleazyfork.org/zh-CN/scripts/600821-peach-userscript'], updated_failed: [] };

test('原生历史使用完整 Release 双语正文，保留 GitHub 版本标题', () => {
  const payload = releasePayload(RELEASE, REPOSITORY);
  assert.equal(payload.release.name, `${RELEASE.body.trim()}\n\n[GitHub Release](${RELEASE.html_url})`);
  assert.match(payload.release.name, /Retry failed/);
  assert.match(payload.release.name, /「重试失败项」/);
  assert.equal(RELEASE.name, 'v0.7.20');
  assert.throws(() => releasePayload({ ...RELEASE, body: '' }, REPOSITORY), /正文或安装制品/);
  assert.throws(() => releasePayload({ ...RELEASE, assets: [] }, REPOSITORY), /正文或安装制品/);
  assert.throws(() => releasePayload({ ...RELEASE, html_url: 'https://example.com' }, REPOSITORY), /正文或安装制品/);
});

test('未来版本按数值比较，既有版本只验证签名', () => {
  assert.equal(newerThan('0.7.19', '0.7.19'), false);
  assert.equal(newerThan('0.7.9', '0.7.19'), false);
  assert.equal(newerThan('0.7.20', '0.7.19'), true);
  assert.equal(newerThan('0.8.0', '0.7.19'), true);
  assert.equal(newerThan('1.0.0', '0.7.19'), true);
  assert.throws(() => newerThan('v0.7.20', '0.7.19'), /版本格式/);
});

test('原生历史查重绑定版本与 Release 链接，兼容正文中的嵌套列表', () => {
  assert.equal(historyContains(UPDATED_HISTORY, RELEASE), true);
  assert.equal(historyContains(EMPTY_HISTORY, RELEASE), false);
  assert.equal(historyContains(UPDATED_HISTORY.replace('>v0.7.20</a>', '>v0.7.19</a>'), RELEASE), false);
  assert.equal(historyContains(UPDATED_HISTORY.replace(RELEASE.html_url, `${RELEASE.html_url}-other`), RELEASE), false);
  assert.throws(() => historyContains('<html>Unavailable</html>', RELEASE), /页面未取得/);
});

test('使用既有密钥签署实际 JSON 字节，拒绝重定向和非目标地址', async () => {
  const payload = releasePayload(RELEASE, REPOSITORY);
  const fetcher = (async (url, options) => {
    assert.equal(String(url), WEBHOOK);
    assert.equal(options?.method, 'POST');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.body, JSON.stringify(payload));
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('X-GitHub-Event'), 'release');
    assert.equal(headers.get('X-Hub-Signature'), `sha1=${createHmac('sha1', 'test-only-secret').update(String(options?.body)).digest('hex')}`);
    return Response.json(SUCCESS);
  }) as typeof fetch;
  assert.deepEqual(await signedWebhook(WEBHOOK, 'test-only-secret', 'release', payload, fetcher), SUCCESS);
  await assert.rejects(signedWebhook('https://example.com/webhook', 'test-only-secret', 'release', payload, fetcher), /地址无效/);
  await assert.rejects(signedWebhook(WEBHOOK, '', 'release', payload, fetcher), /未配置/);
  await assert.rejects(signedWebhook(WEBHOOK, 'test-only-secret', 'release', payload,
    (async () => new Response('', { status: 403 })) as typeof fetch), /HTTP 403/);
});

test('未来发行依次读取、同步并确认原生历史，重复运行跳过写入', async () => {
  const methods: string[] = [];
  const responses = [new Response(EMPTY_HISTORY), Response.json(SUCCESS), new Response(UPDATED_HISTORY), new Response(UPDATED_HISTORY)];
  const fetcher = (async (_url, options) => {
    methods.push(options?.method || 'GET');
    return responses.shift()!;
  }) as typeof fetch;
  assert.equal(await syncNativeHistory(RELEASE, REPOSITORY, WEBHOOK, 'test-only-secret', fetcher), 'synced');
  assert.equal(await syncNativeHistory(RELEASE, REPOSITORY, WEBHOOK, 'test-only-secret', fetcher), 'current');
  assert.deepEqual(methods, ['GET', 'POST', 'GET', 'GET']);
});

test('失败与未取得分别报错，写入结果不明时终止供下一次查重', async () => {
  for (const failure of [
    { response: new Response('', { status: 500 }), error: /HTTP 500/ },
    { response: Response.json({ ...SUCCESS, updated_failed: ['target'] }), error: /未确认目标脚本/ },
    { response: Response.json({ ...SUCCESS, updated_scripts: [] }), error: /未确认目标脚本/ },
    { response: Response.json(SUCCESS), error: /原生历史尚未确认/ },
  ]) {
    const methods: string[] = [];
    const responses = [new Response(EMPTY_HISTORY), failure.response, new Response(EMPTY_HISTORY)];
    const fetcher = (async (_url, options) => {
      methods.push(options?.method || 'GET');
      return responses.shift()!;
    }) as typeof fetch;
    await assert.rejects(syncNativeHistory(RELEASE, REPOSITORY, WEBHOOK, 'test-only-secret', fetcher), failure.error);
    assert.equal(methods.filter(method => method === 'POST').length, 1);
  }
});

test('发行说明汇总到上一个已发布版本，按分组合并，英文在前、中文在折叠区', () => {
  assert.equal(releaseNotes(SAMPLE, { version: '1.2.0', previous: 'v1.1.0', repo: 'o/r' }), [
    'Includes the changes recorded below for source-only versions 1.1.1.',
    '',
    '### Added',
    '',
    '- **Queued tasks** can move to the front.',
    '',
    '### Fixed',
    '',
    '- **Retry failed** retries every failed task.',
    '- **DMM pages** identify titles from the address.',
    '',
    '<details>',
    '<summary>简体中文</summary>',
    '',
    '包含下方仅源码版本 1.1.1 中记录的变更。',
    '',
    '### 新增',
    '',
    '- 排队中的任务可以提前处理。',
    '',
    '### 修复',
    '',
    '- 「重试失败项」会重试全部失败项。',
    '- DMM 页只按地址识别番号。',
    '',
    '</details>',
    '',
    '[Full Changelog](https://github.com/o/r/compare/v1.1.0...v1.2.0)',
    '',
  ].join('\n'));
});

test('没有这一段或本版标着仅源码时拒绝发布', () => {
  assert.throws(() => releaseNotes(SAMPLE, { version: '9.9.9', repo: 'o/r' }), /没有 9\.9\.9/);
  assert.throws(() => releaseNotes(SAMPLE, { version: '1.1.1', repo: 'o/r' }), /仅源码/);
});

test('第一次发布没有上一个标签时只写本版，给出提交历史链接', () => {
  const notes = releaseNotes(SAMPLE, { version: '1.1.0', repo: 'o/r' });
  assert.match(notes, /^### Added\n\n- \*\*Already released\*\* entry\.\n/);
  assert.match(notes, /Initial release \/ 初始发布：\[commits\]\(https:\/\/github\.com\/o\/r\/commits\/v1\.1\.0\)\n$/);
});

test('每个版本都按分组写，历史 Release 重新生成时与新版同一格式', async () => {
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const versions = [...changelog.matchAll(/^## (\d+\.\d+\.\d+)\b/gm)].map(match => match[1]!);
  assert.ok(versions.length);
  for (const version of versions) {
    const lines = versionSection(changelog, version);
    assert.ok(lines.some(line => /^### \S.* \/ \S/.test(line)), `${version} 缺少「English / 中文」分组标题`);
    assert.ok(lines.filter(line => line.startsWith('- ')).every(line => line.includes(' / ')), `${version} 有条目不是双语`);
  }
});

test('当前版本在 CHANGELOG.md 里有可发布的一段', async () => {
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(versionSection(changelog, version).length);
  assert.doesNotThrow(() => releaseNotes(changelog, { version, previous: 'v0.0.0', repo: 'o/r' }));
});
