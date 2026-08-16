/* 한국강사신문 RSS를 읽어 「이서윤의 문장연구소」 새 칼럼을 index.html 목록에 더한다.
 *
 * - 칼럼 섹션 피드(S1N3)에는 스무 편이 담기고 나흘치쯤 된다. 하루 두 번 보면 놓칠 일이 없다.
 * - 이미 목록에 있는 기사(idxno)는 건너뛴다. 여러 번 돌려도 중복되지 않는다.
 * - 책 이름 칸은 비워 둔다. 그 칼럼이 어떤 책을 다뤘는지는 사람이 채운다.
 */
import { readFile, writeFile } from 'node:fs/promises';

const FEEDS = [
  'https://www.lecturernews.com/rss/S1N3.xml',      // 칼럼
  'https://www.lecturernews.com/rss/allArticle.xml' // 보조 — 섹션이 바뀌어도 잡히도록
];
const MARK = '이서윤의 문장연구소';
const FILE = new URL('../index.html', import.meta.url);

const strip = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').trim();

async function collect() {
  const found = new Map();
  for (const url of FEEDS) {
    let xml;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'outis-column-sync' } });
      if (!res.ok) { console.log(`· ${url} → HTTP ${res.status}, 건너뜀`); continue; }
      xml = await res.text();
    } catch (e) {
      console.log(`· ${url} → ${e.message}, 건너뜀`);
      continue;
    }
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const it = m[1];
      const title = strip((it.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1]);
      if (!title.includes(MARK)) continue;
      const id = ((it.match(/idxno=(\d+)/) || [, ''])[1]);
      if (!id) continue;
      const pub = strip((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [, ''])[1]);
      const date = (pub.match(/(\d{4})-(\d{2})-(\d{2})/) || []).slice(1).join('.');
      if (!date) continue;
      // 제목에서 「[이서윤의 문장연구소] 」 머리를 떼고 본제목만 남긴다
      const clean = title.replace(/^\s*\[[^\]]*\]\s*/, '').trim();
      found.set(id, { id: Number(id), date, title: clean });
    }
  }
  return [...found.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

const esc = s => s.replace(/"/g, '\\"');

async function main() {
  const html = await readFile(FILE, 'utf8');
  const block = html.match(/(const D = \[)([\s\S]*?)(\n\];)/);
  if (!block) {
    console.error('목록 배열(const D)을 못 찾았다. index.html 구조가 바뀌었는지 확인할 것.');
    process.exitCode = 1;
    return;
  }

  const have = new Set([...block[2].matchAll(/,(\d{4,}),/g)].map(m => m[1]));
  const lastNo = Math.max(...[...block[2].matchAll(/\[(\d+),/g)].map(m => Number(m[1])), 0);

  const items = await collect();
  const fresh = items.filter(i => !have.has(String(i.id)));

  if (!fresh.length) {
    console.log(`새 칼럼 없음 (목록 ${lastNo}편 · 피드에서 찾은 문장연구소 ${items.length}건)`);
    return;
  }

  let n = lastNo;
  const rows = fresh.map(i => ` [${++n},"${i.date}","${esc(i.title)}",${i.id},""]`).join(',\n');
  await writeFile(FILE, html.replace(block[0], `${block[1]}${block[2]},\n${rows}${block[3]}`), 'utf8');

  console.log(`${fresh.length}편 더함 → 전 ${n}편`);
  for (const i of fresh) console.log(`  ${i.date}  ${i.title}`);
}

await main();
