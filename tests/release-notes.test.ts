import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { releaseNotes, versionSection, versionHistory } from '../scripts/release-notes.ts';
import { descriptionWithHistory } from '../scripts/sleazy-notes.ts';

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

test('Sleazy 逐版历史保留两种语言的全部条目与仅源码标记', () => {
  const english = versionHistory(SAMPLE, 0), chinese = versionHistory(SAMPLE, 1);
  assert.equal((english.match(/^### \d/gm) || []).length, 3);
  assert.equal((chinese.match(/^### \d/gm) || []).length, 3);
  assert.match(english, /### 1\.1\.1 — 2026-11-09\n\nSource only/);
  assert.match(chinese, /### 1\.1\.1 — 2026-11-09\n\n仅源码更新/);
  assert.match(english, /\*\*Already released\*\* entry/);
  assert.match(chinese, /已经发布过的条目/);
  assert.doesNotMatch(english, /排队中的任务/);
  assert.doesNotMatch(chinese, /\*\*Queued tasks\*\*/);
  assert.throws(() => versionHistory('# Empty', 0), /没有版本记录/);
});

test('Sleazy 历史标题保留日期、初始发行与源码版本的语言', () => {
  const sample = SAMPLE.replace('1.2.0 — 2026-11-13', '1.2.0 — Source-only version / 源码版本')
    .replace('1.1.0 — 2026-11-06', '1.1.0 — 2026-11-06 — Initial release / 初始发布');
  assert.match(versionHistory(sample, 0), /^### 1\.2\.0 — Source-only version/);
  assert.match(versionHistory(sample, 1), /^### 1\.2\.0 — 源码版本/);
  assert.match(versionHistory(sample, 1), /### 1\.1\.0 — 2026-11-06 — 初始发布/);
});

test('Sleazy 页面生成保留说明正文，重复生成不重复追加版本', () => {
  const description = '# Peach\n\nSetup and privacy.\n';
  const generated = descriptionWithHistory(description, SAMPLE, 0);
  assert.ok(generated.startsWith(description.trimEnd() + '\n\n<!-- generated:version-history -->'));
  assert.equal(descriptionWithHistory(generated, SAMPLE, 0), generated);
  const updated = descriptionWithHistory(generated, SAMPLE.replace('Retry failed', 'Retry pending'), 0);
  assert.match(updated, /Retry pending/);
  assert.doesNotMatch(updated, /Retry failed/);
});

test('CHANGELOG 新增版本后两种语言自动补齐，并保留全部旧版本', () => {
  const updated = SAMPLE.replace('## 1.2.0', `## 1.2.1 — 2026-11-16

### Fixed / 修复

- **Panels** keep their position. / 面板保持原来的位置。

## 1.2.0`);
  for (const side of [0, 1] as const) {
    const previous = descriptionWithHistory('# Peach', SAMPLE, side);
    const current = descriptionWithHistory(previous, updated, side);
    assert.equal((current.match(/^### \d/gm) || []).length, 4);
    assert.ok(current.indexOf('### 1.2.1') < current.indexOf('### 1.2.0'));
    assert.ok(current.includes(side === 0 ? '**Panels** keep their position.' : '面板保持原来的位置。'));
    assert.match(current, /### 1\.1\.0/);
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
