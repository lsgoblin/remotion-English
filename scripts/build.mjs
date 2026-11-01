/**
 * build：源树 → dist/（可直接分发的形态）。
 *
 * 三步：
 *  1. 每个技能各自落一份 standalone 副本；
 *  2. 按 EMBED_SETS 把子技能复制进父技能，入口改名 REFERENCE.md；
 *  3. 全树重算相对链接：能落在某个内嵌副本上的，就指过去；
 *     指不到任何内嵌副本（跨技能但本技能没内嵌它）的，降级成纯文本。
 *
 * 第 3 步的方向和 import 正好互逆，所以 roundtrip 能逐字节验收。
 */
import {cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {
	DIST_ROOT,
	DIST_SKILLS_DIR,
	EMBEDDED_ENTRY,
	ENTRY,
	SKILLS_DIR,
	buildEmbedSets,
	createSkillBoundaryMapper,
	isExternal,
	listSkillNames,
	makeRelativeLink,
	parseSourcePath,
	splitLinkTarget,
	toPosix,
	walkFiles,
	LINK_RE,
} from './lib/core.mjs';

const skillNames = listSkillNames(SKILLS_DIR);
const sets = buildEmbedSets(skillNames);
const embedPairs = sets.flatMap(({parent, children}) => children.map((child) => ({parent, child})));
const childrenOf = new Map(sets.map(({parent, children}) => [parent, children]));
const mapper = createSkillBoundaryMapper(DIST_SKILLS_DIR);

rmSync(DIST_ROOT, {recursive: true, force: true});

// 1. standalone
for (const name of skillNames) {
	cpSync(path.join(SKILLS_DIR, name), path.join(DIST_SKILLS_DIR, name), {recursive: true});
}

// 2. embed（递归：markup 内嵌 maps 后，它被嵌进 best-practices 时也带着 maps）
const embed = (parentDir, parentName, seenParents = new Set()) => {
	if (seenParents.has(parentName)) return;
	const children = childrenOf.get(parentName) ?? [];
	for (const child of children) {
		if (child === parentName) continue;
		const dest = path.join(parentDir, child);
		cpSync(path.join(SKILLS_DIR, child), dest, {recursive: true});
		renameSync(path.join(dest, ENTRY), path.join(dest, EMBEDDED_ENTRY));
		embed(dest, child, new Set([...seenParents, parentName]));
	}
};

for (const {parent} of sets) {
	embed(path.join(DIST_SKILLS_DIR, parent), parent);
}

/** dist 相对路径 → 该文件所属的最内层技能根 + 分段 */
const locateInDist = (distRel) => {
	const segments = distRel.split('/');
	let rootIndex = 0;
	for (let i = 1; i < segments.length; i++) {
		const isEmbed = embedPairs.some(({parent, child}) => parent === segments[i - 1] && child === segments[i]);
		if (isEmbed) rootIndex = i;
	}
	return {segments, rootIndex, skill: segments[rootIndex]};
};

const entryNameFor = (segments) => (segments.length === 1 ? ENTRY : EMBEDDED_ENTRY);

/** 给定目标技能，找出它在 dist 里该被指向的那份副本（内层优先，与官方一致） */
const distDirFor = ({targetSkill, segments, rootIndex}) => {
	// 1. 指向自己所在的技能
	if (targetSkill === segments[rootIndex]) {
		return segments.slice(0, rootIndex + 1);
	}
	// 2. 指向外层父技能的入口（内嵌副本里的「回到 Best Practices」）
	if (rootIndex > 0 && targetSkill === segments[rootIndex - 1]) {
		return segments.slice(0, rootIndex);
	}
	// 3. 指向自己这个父技能内嵌的副本（markup 正文里的 ./remotion-maps/REFERENCE.md）
	const ownChildren = childrenOf.get(segments[rootIndex]);
	if (ownChildren?.includes(targetSkill)) {
		return [...segments.slice(0, rootIndex + 1), targetSkill];
	}
	// 4. 指向某个祖先父技能内嵌的副本：由内向外取最近的一层
	for (let i = rootIndex; i >= 1; i--) {
		const children = childrenOf.get(segments[i - 1]);
		if (!children?.includes(segments[i])) continue;
		if (children.includes(targetSkill)) return [...segments.slice(0, i), targetSkill];
	}
	return null;
};

let stripped = 0;
let rewritten = 0;

for (const distRel of walkFiles(DIST_SKILLS_DIR)) {
	if (!distRel.endsWith('.md')) continue;
	const distAbs = path.join(DIST_SKILLS_DIR, ...distRel.split('/'));
	const {segments, rootIndex} = locateInDist(distRel);
	const selfSource = mapper.sourceAbs(distAbs);
	if (!selfSource) throw new Error(`无法映射回源：${distRel}`);

	const before = readFileSync(distAbs, 'utf8');
	const after = before.replace(LINK_RE, (match, bang, label, raw) => {
		if (bang === '!') return match;
		const {path: linkPath, suffix, title} = splitLinkTarget(raw);
		if (!linkPath || isExternal(linkPath)) return match;

		const targetSource = path.resolve(path.dirname(selfSource), linkPath);
		const target = parseSourcePath(targetSource);
		if (!target) return match;

		const distDir = distDirFor({targetSkill: target.skill, segments, rootIndex});
		if (!distDir) {
			stripped++;
			return label;
		}

		const restSegments = target.rest.split('/');
		if (target.rest === ENTRY) restSegments[0] = entryNameFor(distDir);
		const distTarget = path.join(DIST_SKILLS_DIR, ...distDir, ...restSegments);

		const rel = makeRelativeLink({
			fromDir: path.dirname(distAbs),
			toAbs: distTarget,
			hadDotSlash: linkPath.startsWith('./'),
		});
		if (rel !== linkPath) rewritten++;
		return `[${label}](${rel}${suffix}${title})`;
	});

	if (after !== before) writeFileSync(distAbs, after);
}

console.log(`build 完成：${toPosix(path.relative(process.cwd(), DIST_SKILLS_DIR))}`);
console.log(`  技能数        ${skillNames.length}`);
console.log(`  内嵌副本      ${embedPairs.length} 份`);
console.log(`  链接重写      ${rewritten}`);
console.log(`  降级为纯文本  ${stripped}`);
