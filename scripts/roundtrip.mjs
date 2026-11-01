/**
 * roundtrip：验收测试。
 *
 * 拿 dist/ 和参考产物逐字节比：文件集合必须一致，内容必须一致。
 * 这条通过，说明「源 → 构建」精确复现了官方产物，
 * 也就是说在这个工作区里改东西，产出的分发形态和官方同构。
 *
 * 预期之外的差异一律 exit 1。有意改动（比如你改了某篇文档）会让它变红，
 * 那时用 --update 把参考产物同步成新的基准。
 */
import {copyFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {ARTIFACT_DIR, DIST_SKILLS_DIR, toPosix, walkFiles} from './lib/core.mjs';

const update = process.argv.includes('--update');

if (!existsSync(DIST_SKILLS_DIR)) {
	console.error('dist/ 还没构建，先跑 npm run build');
	process.exit(1);
}
if (!existsSync(ARTIFACT_DIR)) {
	console.error(`参考产物不存在：${ARTIFACT_DIR}`);
	process.exit(1);
}

const distFiles = walkFiles(DIST_SKILLS_DIR);
const artFiles = walkFiles(ARTIFACT_DIR);

const distSet = new Set(distFiles);
const artSet = new Set(artFiles);

const onlyInDist = distFiles.filter((f) => !artSet.has(f));
const onlyInArtifact = artFiles.filter((f) => !distSet.has(f));

const differing = [];
for (const rel of distFiles) {
	if (!artSet.has(rel)) continue;
	const a = readFileSync(path.join(DIST_SKILLS_DIR, ...rel.split('/')));
	const b = readFileSync(path.join(ARTIFACT_DIR, ...rel.split('/')));
	if (!a.equals(b)) differing.push(rel);
}

const total = artFiles.length;
const same = total - onlyInArtifact.length - differing.length;

console.log('roundtrip: dist vs 参考产物');
console.log(`  产物文件      ${total}`);
console.log(`  完全一致      ${same}`);

if (onlyInDist.length) {
	console.log(`\n多出的文件 ${onlyInDist.length}:`);
	for (const f of onlyInDist.slice(0, 20)) console.log(`  + ${f}`);
}
if (onlyInArtifact.length) {
	console.log(`\n缺失的文件 ${onlyInArtifact.length}:`);
	for (const f of onlyInArtifact.slice(0, 20)) console.log(`  - ${f}`);
}
if (differing.length) {
	console.log(`\n内容不同 ${differing.length}:`);
	for (const rel of differing.slice(0, 20)) {
		console.log(`  ! ${rel}`);
		const distText = readFileSync(path.join(DIST_SKILLS_DIR, ...rel.split('/')), 'utf8').split(/\r?\n/);
		const artText = readFileSync(path.join(ARTIFACT_DIR, ...rel.split('/')), 'utf8').split(/\r?\n/);
		for (let i = 0; i < Math.max(distText.length, artText.length); i++) {
			if (distText[i] !== artText[i]) {
				console.log(`      L${i + 1}`);
				console.log(`        dist: ${JSON.stringify(distText[i] ?? null)}`);
				console.log(`        art : ${JSON.stringify(artText[i] ?? null)}`);
				break;
			}
		}
	}
}

const clean = onlyInDist.length === 0 && onlyInArtifact.length === 0 && differing.length === 0;

if (clean) {
	console.log('\n验收通过：dist 与官方的分发形态逐字节一致。');
	process.exit(0);
}

if (update) {
	for (const rel of onlyInDist) {
		const from = path.join(DIST_SKILLS_DIR, ...rel.split('/'));
		const to = path.join(ARTIFACT_DIR, ...rel.split('/'));
		mkdirSync(path.dirname(to), {recursive: true});
		copyFileSync(from, to);
	}
	console.log('\n已用 dist 覆盖差异文件（--update）。');
	process.exit(0);
}

console.error('\n验收失败。若这是有意的改动，跑 npm run roundtrip -- --update 更新基准。');
process.exit(1);
