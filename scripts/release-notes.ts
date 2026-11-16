// 从 CHANGELOG.md 生成 GitHub Release 正文：英文在前，中文放进折叠区，末尾附比较链接。
// 正文覆盖从本版到上一个已发布版本（不含）之间的每一段，按新增、变更、修复等分组合并；
// 开头一段取本版标题下的说明。
// 用法：node scripts/release-notes.ts --version 0.7.9 --previous v0.7.5 --repo peach-mitao/peach-userscript
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

type Bilingual = [english: string, chinese: string];
type Section = {version: string; lines: string[]};
type Group = {names: Bilingual; items: Bilingual[]};

const SEPARATOR = ' / ';
const GROUP_ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

// 一行双语文字按第一个 ` / ` 分成英文与中文；没有分隔的两边相同。
function split(text: string): Bilingual {
  const at = text.indexOf(SEPARATOR);
  return at < 0 ? [text, text] : [text.slice(0, at).trim(), text.slice(at + SEPARATOR.length).trim()];
}

function sections(changelog: string): Section[] {
  const found: Section[] = [];
  for (const line of changelog.replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^## (\d+\.\d+\.\d+)\b/);
    if (heading) found.push({version: heading[1]!, lines: []});
    else if (line.startsWith('## ')) found.push({version: '', lines: []});
    else found.at(-1)?.lines.push(line);
  }
  return found.filter(section => section.version);
}

export function versionSection(changelog: string, version: string): string[] {
  const section = sections(changelog).find(item => item.version === version);
  if (!section) throw new Error(`CHANGELOG.md 里没有 ${version} 这一段`);
  return section.lines;
}

function parse(lines: readonly string[]) {
  const notes: Bilingual[] = [], groups = new Map<string, Group>();
  let group: Bilingual | null = null;
  for (const line of lines) {
    const heading = line.match(/^### (.+)$/), item = line.match(/^- (.+)$/);
    if (heading) {
      group = split(heading[1]!);
      if (!groups.has(group[0])) groups.set(group[0], {names: group, items: []});
    } else if (item && group) groups.get(group[0])!.items.push(split(item[1]!));
    else if (line.trim() && !group) notes.push(split(line.trim()));
  }
  return {notes, groups};
}

export function releaseNotes(changelog: string, {version, previous = '', repo}: {version: string; previous?: string; repo: string}) {
  const all = sections(changelog);
  const start = all.findIndex(item => item.version === version);
  if (start < 0) throw new Error(`CHANGELOG.md 里没有 ${version} 这一段`);
  const own = parse(all[start]!.lines);
  if (own.notes.some(([english]) => /^Source only/i.test(english))) throw new Error(`${version} 标着仅源码，不能发布`);
  const stop = all.findIndex(item => `v${item.version}` === previous);
  const merged = new Map<string, Group>();
  for (const {groups} of all.slice(start, stop > start ? stop : start + 1).map(item => parse(item.lines))) {
    for (const [key, {names, items}] of groups) {
      if (!merged.has(key)) merged.set(key, {names, items: []});
      merged.get(key)!.items.push(...items);
    }
  }
  const rank = (name: string) => GROUP_ORDER.indexOf(name) + 1 || 99;
  const ordered = [...merged.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([, value]) => value)
    .filter(group => group.items.length);
  if (!ordered.length) throw new Error(`CHANGELOG.md 的 ${version} 一段没有条目`);
  const render = (side: 0 | 1) => [
    ...own.notes.map(note => note[side]),
    ...ordered.map(group => `### ${group.names[side]}\n\n${group.items.map(item => `- ${item[side]}`).join('\n')}`),
  ].join('\n\n');
  const tag = `v${version}`;
  const link = previous
    ? `[Full Changelog](https://github.com/${repo}/compare/${previous}...${tag})`
    : `Initial release / 初始发布：[commits](https://github.com/${repo}/commits/${tag})`;
  return `${render(0)}\n\n<details>\n<summary>简体中文</summary>\n\n${render(1)}\n\n</details>\n\n${link}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {version: {type: 'string'}, previous: {type: 'string', default: ''}, repo: {type: 'string'}}});
  if (!values.version || !values.repo) {
    console.error('用法：node scripts/release-notes.ts --version <版本> --repo <owner/name> [--previous <上一个标签>]');
    process.exit(2);
  }
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  process.stdout.write(releaseNotes(changelog, {version: values.version, previous: values.previous, repo: values.repo}));
}
