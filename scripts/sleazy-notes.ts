import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { versionHistory } from './release-notes.ts';

const MARKER = '<!-- generated:version-history -->';

export function descriptionWithHistory(description: string, changelog: string, side: 0 | 1): string {
  const introduction = description.split(MARKER)[0]!.trimEnd();
  const heading = side === 0 ? 'Version history' : '版本历史';
  return `${introduction}\n\n${MARKER}\n\n## ${heading}\n\n${versionHistory(changelog, side)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  for (const [name, side] of [['SLEAZY.md', 0], ['SLEAZY.zh-CN.md', 1]] as const) {
    const path = new URL(`../docs/${name}`, import.meta.url);
    const previous = await readFile(path, 'utf8');
    const expected = descriptionWithHistory(previous, changelog, side);
    if (values.check) {
      if (previous !== expected) throw new Error(`版本历史需要重新生成：docs/${name}`);
    } else await writeFile(path, expected, 'utf8');
  }
  console.log(values.check ? 'Sleazy 中英文版本历史一致' : '已生成 Sleazy 中英文版本历史');
}
