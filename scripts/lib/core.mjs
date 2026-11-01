import {existsSync, readdirSync} from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const SKILLS_DIR = path.join(ROOT, 'skills');
export const DIST_ROOT = path.join(ROOT, 'dist');
export const DIST_SKILLS_DIR = path.join(DIST_ROOT, 'skills');

/**
 * 参考产物（当前形态：入口已改名 REFERENCE.md、嵌入副本已展开）。
 * 用途只有一个：import 时当源种子，roundtrip 时当验收基准。
 */
export const ARTIFACT_DIR = process.env.SKILLS_ARTIFACT
	? path.resolve(ROOT, process.env.SKILLS_ARTIFACT)
	: path.resolve(ROOT, '..', 'remotion-skills', 'skills');

export const ENTRY = 'SKILL.md';
export const EMBEDDED_ENTRY = 'REFERENCE.md';

export const toPosix = (p) => p.split(path.sep).join('/');

export const listSkillNames = (root) =>
	readdirSync(root, {withFileTypes: true})
		.filter((entry) => entry.isDirectory() && entry.name.startsWith('remotion-'))
		.map((entry) => entry.name)
		.sort();

/** 返回相对 root 的 posix 路径列表 */
export const walkFiles = (root, current = root, acc = []) => {
	for (const entry of readdirSync(current, {withFileTypes: true})) {
		const abs = path.join(current, entry.name);
		if (entry.isDirectory()) {
			walkFiles(root, abs, acc);
		} else if (entry.isFile()) {
			acc.push(toPosix(path.relative(root, abs)));
		}
	}
	return acc.sort();
};

export const isSkillDir = (dir) =>
	existsSync(path.join(dir, ENTRY)) || existsSync(path.join(dir, EMBEDDED_ENTRY));

/**
 * 谁内嵌谁。改这里等于改分发结构。
 * remotion-best-practices 内嵌全部兄弟技能（单装即自洽）；
 * remotion-markup 额外内嵌 remotion-maps（它的正文要跳到地图）。
 */
export const buildEmbedSets = (skillNames) => [
	{
		parent: 'remotion-best-practices',
		children: skillNames.filter((name) => name !== 'remotion-best-practices'),
	},
	{
		parent: 'remotion-markup',
		children: skillNames.filter((name) => name === 'remotion-maps'),
	},
];

export const parseFrontmatter = (text) => {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	if (!match) return null;
	const fields = {};
	for (const line of match[1].split(/\r?\n/)) {
		const kv = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(line);
		if (kv) fields[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '');
	}
	return fields;
};

/** 源坐标路径 → {skill, rest} */
export const parseSourcePath = (abs) => {
	const rel = toPosix(path.relative(SKILLS_DIR, abs));
	if (rel.startsWith('..')) return null;
	const segments = rel.split('/');
	return {skill: segments[0], rest: segments.slice(1).join('/')};
};

export const LINK_RE = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * 生成相对链接文本。
 * 两个细节必须和官方产物一致，否则 roundtrip 会红：
 *  - 原链接带 "./" 就保留；
 *  - 目标以 remotion- 开头（技能目录）时补 "./"，避免被当成模块名解析。
 */
export const makeRelativeLink = ({fromDir, toAbs, hadDotSlash}) => {
	const rel = path.posix.relative(toPosix(fromDir), toPosix(toAbs));
	if (rel.startsWith('.')) return rel;
	if (hadDotSlash || /^remotion-/.test(rel)) return `./${rel}`;
	return rel;
};

export const isExternal = (target) =>
	target.startsWith('http://') ||
	target.startsWith('https://') ||
	target.startsWith('mailto:') ||
	target.startsWith('tel:') ||
	target.startsWith('data:') ||
	target.startsWith('#');

/** 拆出路径 / #锚点 / "title" */
export const splitLinkTarget = (raw) => {
	let target = raw.trim();
	if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
	const spaceIndex = target.search(/\s/);
	const title = spaceIndex === -1 ? '' : target.slice(spaceIndex);
	const link = spaceIndex === -1 ? target : target.slice(0, spaceIndex);
	const cuts = [link.indexOf('#'), link.indexOf('?')].filter((i) => i !== -1);
	const cut = cuts.length ? Math.min(...cuts) : link.length;
	return {path: link.slice(0, cut), suffix: link.slice(cut), title};
};

/**
 * 把一棵 artifact/dist 树里的相对路径映射回「源坐标」。
 * 技能边界靠“该层目录有入口文件”识别，因此任意嵌套深度都能还原
 * （best-practices/remotion-markup/remotion-maps/... → remotion-maps）。
 */
export const createSkillBoundaryMapper = (treeRoot) => {
	const sourceFor = (abs) => {
		const rel = toPosix(path.relative(treeRoot, abs));
		if (rel.startsWith('..')) return null;
		const segments = rel.split('/');
		let skillIndex = 0;
		for (let i = 1; i < segments.length - 0; i++) {
			const prefix = path.join(treeRoot, ...segments.slice(0, i + 1));
			if (/^remotion-/.test(segments[i]) && isSkillDir(prefix)) {
				skillIndex = i;
			}
		}
		const rest = segments.slice(skillIndex + 1);
		if (rest.length === 0) return null;
		if (rest.length === 1 && rest[0] === EMBEDDED_ENTRY) rest[0] = ENTRY;
		return {skill: segments[skillIndex], rest: rest.join('/')};
	};

	const sourceAbs = (abs) => {
		const mapped = sourceFor(abs);
		if (!mapped) return null;
		return path.join(SKILLS_DIR, mapped.skill, ...mapped.rest.split('/'));
	};

	return {sourceFor, sourceAbs};
};
