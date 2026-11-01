/**
 * import：把参考产物（已准备/已展开的 dist）反变换回可编辑的源树。
 *
 * 反变换只有一条规则：把 md 里的每个相对链接，从「产物坐标」重算成「源坐标」。
 * 产物里的 REFERENCE.md 还原成 SKILL.md，嵌套副本归并回它自己的技能目录，
 * 被 prepare 剥成纯文本的跨技能链接，从镜像副本里恢复成真链接。
 *
 * 同一源文件会被多个副本映射到（standalone 一份、各父技能内嵌若干份）。
 * 它们的差异只有“链接被剥掉了多少”，因此取链接最多的那份 —— 信息量最大。
 */
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {
	ARTIFACT_DIR,
	ENTRY,
	EMBEDDED_ENTRY,
	SKILLS_DIR,
	createSkillBoundaryMapper,
	isExternal,
	makeRelativeLink,
	splitLinkTarget,
	toPosix,
	walkFiles,
	LINK_RE,
} from './lib/core.mjs';

if (!existsSync(ARTIFACT_DIR)) {
	console.error(`找不到参考产物：${ARTIFACT_DIR}`);
	console.error('用 SKILLS_ARTIFACT=<path> 指定，默认是 ../remotion-skills/skills');
	process.exit(1);
}

const mapper = createSkillBoundaryMapper(ARTIFACT_DIR);

const sourceFor = (abs) => {
	const mapped = mapper.sourceFor(abs);
	if (!mapped) return null;
	return {abs: mapper.sourceAbs(abs), ...mapped};
};

const countRelativeLinks = (text) => {
	let count = 0;
	for (const match of text.matchAll(LINK_RE)) {
		if (match[1] === '!') continue;
		const {path: linkPath} = splitLinkTarget(match[3]);
		if (linkPath && !isExternal(linkPath)) count++;
	}
	return count;
};

const transform = (artifactAbs, text, selfAbs) =>
	text.replace(LINK_RE, (match, bang, label, raw) => {
		if (bang === '!') return match;
		const {path: linkPath, suffix, title} = splitLinkTarget(raw);
		if (!linkPath || isExternal(linkPath)) return match;

		const targetArtifact = path.resolve(path.dirname(artifactAbs), linkPath);
		if (!existsSync(targetArtifact)) return match;

		const target = sourceFor(targetArtifact);
		if (!target) return match;

		const rel = makeRelativeLink({
			fromDir: path.dirname(selfAbs),
			toAbs: target.abs,
			hadDotSlash: linkPath.startsWith('./'),
		});
		return `[${label}](${rel}${suffix}${title})`;
	});

rmSync(SKILLS_DIR, {recursive: true, force: true});

/** targetAbs → 多个候选变体（standalone 一份、内嵌若干份） */
const variants = new Map();

for (const rel of walkFiles(ARTIFACT_DIR)) {
	const artifactAbs = path.join(ARTIFACT_DIR, ...rel.split('/'));
	const target = sourceFor(artifactAbs);
	if (!target) continue;

	const isMarkdown = rel.endsWith('.md');
	const text = isMarkdown ? readFileSync(artifactAbs, 'utf8') : null;
	const payload = isMarkdown ? transform(artifactAbs, text, target.abs) : readFileSync(artifactAbs);
	const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');

	if (!variants.has(target.abs)) variants.set(target.abs, []);
	variants.get(target.abs).push({buf, links: isMarkdown ? countRelativeLinks(text) : 0, from: rel});
}

let restoredLinks = 0;
for (const [abs, list] of variants) {
	const sorted = [...list].sort((a, b) => b.links - a.links);
	const winner = sorted[0];
	if (sorted.length > 1) restoredLinks += winner.links - Math.min(...sorted.map((v) => v.links));
	mkdirSync(path.dirname(abs), {recursive: true});
	writeFileSync(abs, winner.buf);
}

// 源树里不该再有 REFERENCE.md（那是产物入口名）
for (const rel of walkFiles(SKILLS_DIR)) {
	if (path.posix.basename(rel) !== EMBEDDED_ENTRY) continue;
	const from = path.join(SKILLS_DIR, ...rel.split('/'));
	renameSync(from, path.join(path.dirname(from), ENTRY));
}

const skills = new Set([...variants.keys()].map((abs) => toPosix(path.relative(SKILLS_DIR, abs)).split('/')[0]));

console.log(`import 完成：${toPosix(ARTIFACT_DIR)}`);
console.log(`  技能            ${skills.size}`);
console.log(`  写出文件        ${variants.size}`);
console.log(`  恢复跨技能链接  ${restoredLinks}（产物里被剥成纯文本、从镜像副本复原）`);
