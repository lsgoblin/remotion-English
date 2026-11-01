/**
 * check：源树的不变量检查。CI 和本地都跑这个。
 *
 * 错误（exit 1）：缺入口、frontmatter 不合规、版本不一致、断链、源里出现 REFERENCE.md
 * 警告：从入口走不到的孤儿文档
 */
import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {
	DIST_SKILLS_DIR,
	ENTRY,
	SKILLS_DIR,
	isExternal,
	listSkillNames,
	parseFrontmatter,
	splitLinkTarget,
	toPosix,
	walkFiles,
	LINK_RE,
} from './lib/core.mjs';

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const errors = [];
const warnings = [];

const skillNames = listSkillNames(SKILLS_DIR);
if (skillNames.length === 0) errors.push(`skills/ 下没有找到任何 remotion-* 技能`);

const linkTargetsOf = (abs) => {
	const text = readFileSync(abs, 'utf8');
	const targets = [];
	for (const match of text.matchAll(LINK_RE)) {
		if (match[1] === '!') continue;
		const {path: linkPath} = splitLinkTarget(match[3]);
		if (!linkPath || isExternal(linkPath)) continue;
		targets.push(linkPath);
	}
	return targets;
};

for (const skill of skillNames) {
	const root = path.join(SKILLS_DIR, skill);
	const entry = path.join(root, ENTRY);

	if (!existsSync(entry) || !statSync(entry).isFile()) {
		errors.push(`${skill}: 缺少 ${ENTRY}`);
		continue;
	}

	const fields = parseFrontmatter(readFileSync(entry, 'utf8'));
	if (!fields) {
		errors.push(`${skill}: ${ENTRY} 缺少 YAML frontmatter`);
	} else {
		if (fields.name !== skill) {
			errors.push(`${skill}: frontmatter name="${fields.name}" 与目录名不一致`);
		}
		if (!fields.description) errors.push(`${skill}: 缺少 description`);
		if (!fields.version) warnings.push(`${skill}: 缺少 version`);
		else if (fields.version !== pkg.version) {
			errors.push(`${skill}: version=${fields.version}，package.json version=${pkg.version}`);
		}
	}

	for (const rel of walkFiles(root)) {
		if (path.posix.basename(rel) === 'REFERENCE.md') {
			errors.push(`${skill}/${rel}: 源树里不允许出现 REFERENCE.md（那是 dist 的入口名）`);
		}
		if (!rel.endsWith('.md')) continue;
		const abs = path.join(root, ...rel.split('/'));
		for (const linkPath of linkTargetsOf(abs)) {
			const target = path.resolve(path.dirname(abs), linkPath);
			if (!existsSync(target)) {
				errors.push(`${skill}/${rel}: 断链 → ${linkPath}`);
			}
		}
	}
}

// 可达性：入口顺着 md 链接能不能走到每篇文档
for (const skill of skillNames) {
	const root = path.join(SKILLS_DIR, skill);
	const entry = path.join(root, ENTRY);
	if (!existsSync(entry)) continue;

	const reached = new Set();
	const queue = [entry];
	while (queue.length) {
		const current = queue.shift();
		if (reached.has(current) || !current.endsWith('.md') || !existsSync(current)) continue;
		reached.add(current);
		for (const linkPath of linkTargetsOf(current)) {
			const target = path.resolve(path.dirname(current), linkPath);
			if (target.startsWith(root) && existsSync(target) && !reached.has(target)) queue.push(target);
		}
	}

	const orphans = walkFiles(root)
		.filter((rel) => rel.endsWith('.md'))
		.map((rel) => path.join(root, ...rel.split('/')))
		.filter((abs) => !reached.has(abs));
	if (orphans.length) {
		warnings.push(`${skill}: ${orphans.length} 篇文档从 SKILL.md 走不到 → ${orphans.map((a) => toPosix(path.relative(root, a))).join(', ')}`);
	}
}

// dist（若已构建）：入口名、断链、内嵌副本不能再有 SKILL.md
if (existsSync(DIST_SKILLS_DIR)) {
	for (const skill of skillNames) {
		const root = path.join(DIST_SKILLS_DIR, skill);
		if (!existsSync(root)) {
			errors.push(`dist: 缺少 ${skill}`);
			continue;
		}
		for (const rel of walkFiles(root)) {
			const abs = path.join(root, ...rel.split('/'));
			if (!rel.endsWith('.md')) continue;
			const depth = rel.split('/').length;
			if (depth > 1 && path.posix.basename(rel) === ENTRY && rel.split('/')[1].startsWith('remotion-')) {
				errors.push(`dist/${skill}/${rel}: 内嵌副本必须叫 REFERENCE.md`);
			}
			for (const linkPath of linkTargetsOf(abs)) {
				const target = path.resolve(path.dirname(abs), linkPath);
				if (!existsSync(target)) errors.push(`dist/${skill}/${rel}: 断链 → ${linkPath}`);
			}
		}
	}
}

console.log(`check: ${skillNames.length} 个技能`);
if (warnings.length) {
	console.log(`\n警告 ${warnings.length}:`);
	for (const w of warnings) console.log(`  - ${w}`);
}
if (errors.length) {
	console.error(`\n错误 ${errors.length}:`);
	for (const e of errors) console.error(`  - ${e}`);
	process.exit(1);
}
console.log('全部不变量通过。');
