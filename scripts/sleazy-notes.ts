import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
const HISTORY = 'https://api.sleazyfork.org/zh-CN/scripts/600821-peach-userscript/versions.json?show_all_versions=1&list_all=1';

export function newerThan(version: string, boundary: string): boolean {
  if (![version, boundary].every(value => /^\d+\.\d+\.\d+$/.test(value))) throw new Error('版本格式无效');
  const left = version.split('.').map(Number);
  const right = boundary.split('.').map(Number);
  const index = left.findIndex((value, at) => value !== right[at]);
  return index >= 0 && left[index]! > right[index]!;
}

export function releasePayload(release: any, repository: string) {
  const root = `https://github.com/${repository}`;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^v\d+\.\d+\.\d+$/.test(release?.tag_name)
      || typeof release.body !== 'string' || !release.body.trim()
      || release.html_url !== `${root}/releases/tag/${release.tag_name}`
      || !Array.isArray(release.assets) || !release.assets.some((asset: any) => asset.name === 'peach-jav.user.js'
        && asset.browser_download_url === `${root}/releases/download/${release.tag_name}/peach-jav.user.js`)) {
    throw new Error('GitHub Release 正文或安装制品未取得');
  }
  return {
    action: 'published',
    repository: { html_url: root, clone_url: `${root}.git`, default_branch: 'main' },
    release: {
      tag_name: release.tag_name,
      assets: release.assets,
      name: `${release.body.trim()}\n\n[GitHub Release](${release.html_url})`,
    },
  };
}

async function history(fetcher: typeof fetch): Promise<string[]> {
  const response = await fetcher(HISTORY, {
    redirect: 'error', signal: AbortSignal.timeout(60_000), headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Sleazy 原生历史读取失败，HTTP ${response.status}`);
  const entries: unknown = await response.json();
  if (!Array.isArray(entries) || !entries.every(entry => typeof entry?.version === 'string'
      && /^\d+\.\d+\.\d+$/.test(entry.version))) {
    throw new Error('Sleazy 原生历史 JSON 格式无效');
  }
  return entries.map(entry => entry.version);
}

export async function signedWebhook(url: string, secret: string, event: string, payload: unknown, fetcher: typeof fetch = fetch) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.hostname !== 'api.sleazyfork.org' || target.username || target.password
      || target.search || target.hash || !/^\/(?:zh-CN|en)\/users\/\d+-[^/]+\/webhook$/.test(target.pathname)) {
    throw new Error('Sleazy webhook 地址无效');
  }
  if (!secret) throw new Error('SLEAZY_WEBHOOK_SECRET 未配置');
  const body = JSON.stringify(payload);
  const signature = createHmac('sha1', secret).update(body).digest('hex');
  const response = await fetcher(target, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': event, 'X-Hub-Signature': `sha1=${signature}` },
    body,
  });
  if (!response.ok) throw new Error(`Sleazy webhook 请求失败，HTTP ${response.status}`);
  return response.json();
}

export async function syncNativeHistory(release: any, repository: string, url: string, secret: string, fetcher: typeof fetch = fetch) {
  const payload = releasePayload(release, repository);
  const version = release.tag_name.slice(1);
  const before = await history(fetcher);
  if (before.includes(version)) return 'current';
  const latest = before[0];
  if (!latest) throw new Error('Sleazy 当前版本未取得，停止同步');
  if (!newerThan(version, latest)) {
    throw new Error('Sleazy 已存在更新版本，请核对原生历史');
  }
  const result = await signedWebhook(url, secret, 'release', payload, fetcher);
  if (!Array.isArray(result.updated_failed) || result.updated_failed.length || !Array.isArray(result.updated_scripts)
      || !result.updated_scripts.some((value: unknown) => typeof value === 'string'
        && /^https:\/\/api\.sleazyfork\.org\/(?:zh-CN|en)\/scripts\/600821(?:-|$)/.test(value))) {
    throw new Error('Sleazy 未确认目标脚本同步成功，请核对原生历史后继续');
  }
  if (!(await history(fetcher)).includes(version)) throw new Error('Sleazy 已应答成功，原生历史尚未确认，请核对后继续');
  return 'synced';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { version: { type: 'string' }, after: { type: 'string' } } });
  if (!values.version || !values.after) throw new Error('用法：node scripts/sleazy-notes.ts --version <版本> --after <既有版本>');
  const url = process.env.SLEAZY_WEBHOOK_URL || '';
  const secret = process.env.SLEAZY_WEBHOOK_SECRET || '';
  if (!newerThan(values.version, values.after)) {
    const result = await signedWebhook(url, secret, 'ping', {});
    if (result.message !== 'Webhook successfully configured.') throw new Error('Sleazy 签名验证未通过');
    console.log(`Sleazy 签名验证通过，后续从 ${values.after} 之后的版本自动写入原生历史`);
  } else {
    const repository = process.env.GITHUB_REPOSITORY || '';
    const release = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/releases/latest`], { encoding: 'utf8' }));
    if (release.tag_name !== `v${values.version}`) throw new Error('当前运行的版本与 GitHub 最新发行版不一致，停止同步');
    const result = await syncNativeHistory(release, repository, url, secret);
    console.log(`Sleazy 原生历史 ${release.tag_name}：${result}`);
  }
}
