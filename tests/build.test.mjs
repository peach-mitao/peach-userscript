import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Script } from 'node:vm';
import { test } from 'node:test';
import { ROOT, render, outputs, build, validateManifest } from '../scripts/build.mjs';
import { exportRelease } from '../scripts/export.mjs';

const manifest = JSON.parse(await readFile(new URL('../jav-sites.json', import.meta.url), 'utf8'));
const template = await readFile(new URL('../src/peach-jav.user.js', import.meta.url), 'utf8');
const VERSION = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;

test('安装产物可解析，元数据匹配清单且每个域名覆盖 HTTPS 主域与子域', async () => {
  const result = await outputs();
  const script = result.get('peach-jav.user.js');
  assert.doesNotThrow(() => new Script(script));
  const metadata = new Map([...script.matchAll(/^\/\/ @(\w+)\s+(.+)$/gm)]
    .filter(match => match[1] !== 'match').map(match => [match[1], match[2]]));
  assert.equal(metadata.get('version'), VERSION);
  assert.equal(metadata.get('namespace'), 'https://github.com/peach-mitao/peach-userscript');
  assert.equal(metadata.get('source'), metadata.get('namespace'));
  assert.equal(metadata.get('supportURL'), metadata.get('namespace') + '/issues');
  const matches = [...script.matchAll(/^\/\/ @match\s+(.+)$/gm)].map(match => match[1]);
  assert.deepEqual(matches, [...manifest.sites.flatMap(site => site.domains.flatMap(domain =>
    [`https://${domain}/*`, `https://*.${domain}/*`])),
    '*://*/*', 'https://*/integrations/peach-userscript-bridge', 'http://localhost/integrations/peach-userscript-bridge',
    'http://127.0.0.1/integrations/peach-userscript-bridge']);
  assert.equal(new Set(matches).size, matches.length);
});

test('构建不依赖时间，CRLF 模板得到同一份 LF 产物，工作区产物一致', async () => {
  const first = await outputs(ROOT);
  assert.deepEqual(await outputs(ROOT), first);
  assert.equal(render(template.replace(/\r?\n/g, '\r\n'), manifest, VERSION), first.get('peach-jav.user.js'));
  await build({ check: true });
});

test('本地安装制品声明固定的 Sleazy 自动更新渠道', async () => {
  const script = (await outputs(ROOT)).get('peach-jav.user.js');
  const base = 'https://update.sleazyfork.org/scripts/600821/Peach%20%C2%B7%20JAV%20%E5%85%A5%E5%BA%93';
  assert.equal(script.match(/^\/\/ @updateURL\s+(.+)$/m)?.[1], `${base}.meta.js`);
  assert.equal(script.match(/^\/\/ @downloadURL\s+(.+)$/m)?.[1], `${base}.user.js`);
  assert.equal(script.match(/^\/\/ @name:zh-CN\s+(.+)$/m)?.[1], 'Peach 用户脚本');
  assert.equal(script.match(/^\/\/ @name:en\s+(.+)$/m)?.[1], 'Peach Userscript');
  assert.equal(script.match(/^\/\/ @name\s+(.+)$/m)?.[1], 'Peach · JAV 入库');
});

test('发布元数据为每个本地化名称提供对应语言的简介', async () => {
  const script = (await outputs(ROOT)).get('peach-jav.user.js');
  const fields = new Map([...script.matchAll(/^\/\/ @(name|description):([^\s]+)\s+(.+)$/gm)]
    .map(match => [`${match[1]}:${match[2]}`, match[3].trim()]));
  for (const key of fields.keys()) if (key.startsWith('name:'))
    assert.ok(fields.get(key.replace('name:', 'description:')), `${key} 缺少对应简介`);
});

test('站点清单无效时拒绝构建', () => {
  for (const change of [
    value => { value.version = 2; },
    value => { value.sites.push(structuredClone(value.sites[0])); },
    value => { value.sites[0].domains.push('evil.invalid/*\n// @grant unsafeWindow'); },
    value => { value.sites[0].domains = ['127.0.0.1']; },
    value => { value.sites[0].detail_pattern = '['; },
    value => { delete value.sites[0].selectors; },
    value => { value.sites[0].query_keys = ['token with space']; },
    value => { value.sites[0].identity = 'unknown'; },
    value => { value.sites[0].identity = 'peach'; value.sites[0].query_keys = ['first', 'second']; },
  ]) {
    const invalid = structuredClone(manifest);
    change(invalid);
    assert.throws(() => validateManifest(invalid));
  }
});

test('模板缺失、重复标记或版本漂移时拒绝构建', () => {
  for (const source of [template.replace('__PEACH_JAV_SITES__', '{}'), template + '\n// __PEACH_JAV_MATCHES__']) {
    assert.throws(() => render(source, manifest, VERSION));
  }
  assert.throws(() => render(template, manifest, '0.4.0'));
});

test('发布制品导出可重复且校验覆盖脚本与服务端快照，不覆盖不同文件', async () => {
  const target = resolve(await mkdtemp(join(tmpdir(), 'peach-export-')));
  try {
    const names = await exportRelease(target);
    assert.deepEqual(await exportRelease(target), names);
    const release = JSON.parse(await readFile(join(target, 'release.json'), 'utf8'));
    for (const [name, hash] of Object.entries(release.files)) {
      const bytes = await readFile(join(target, name));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
    }
    assert.deepEqual(JSON.parse(await readFile(join(target, 'jav-sites.json'), 'utf8')), manifest);
    await writeFile(join(target, 'jav-sites.json'), 'different');
    await assert.rejects(exportRelease(target), /不同内容/);
    assert.equal(await readFile(join(target, 'jav-sites.json'), 'utf8'), 'different');
  } finally { await rm(target, { recursive: true, force: true }); }
});
