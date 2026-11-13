import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { releaseNotes, versionSection } from '../scripts/release-notes.ts';

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

test('当前版本在 CHANGELOG.md 里有可发布的一段', async () => {
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(versionSection(changelog, version).length);
  assert.doesNotThrow(() => releaseNotes(changelog, { version, previous: 'v0.0.0', repo: 'o/r' }));
});
