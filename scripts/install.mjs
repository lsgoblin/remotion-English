/**
 * install：把构建好的技能装进本机 agent 的 skills 目录，用来实测改动效果。
 *
 *   node scripts/install.mjs remotion-maps
 *   node scripts/install.mjs --all
 *   node scripts/install.mjs remotion-maps --to D:\some\skills
 *
 * 默认目标：%USERPROFILE%\.agents\skills（agentskills 约定；Claude Code 用 --to ~/.claude/skills）
 */
import {cpSync, existsSync, mkdirSync, readdirSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DIST_SKILLS_DIR, listSkillNames} from './lib/core.mjs';

const args = process.argv.slice(2);
const all = args.includes('--all');
const toIndex = args.indexOf('--to');
const targetRoot =
	toIndex !== -1
		? path.resolve(args[toIndex + 1])
		: path.join(os.homedir(), '.agents', 'skills');
const names = args.filter((a, i) => !a.startsWith('--') && i !== toIndex + 1);

if (!existsSync(DIST_SKILLS_DIR)) {
	console.error('dist/ 还没构建，先跑 npm run build');
	process.exit(1);
}
if (!all && names.length === 0) {
	console.error('用法: node scripts/install.mjs <skill-name...> [--all] [--to <dir>]');
	console.error(`可用: ${listSkillNames(DIST_SKILLS_DIR).join(', ')}`);
	process.exit(1);
}

const available = listSkillNames(DIST_SKILLS_DIR);
const chosen = all ? available : names;
for (const name of chosen) {
	if (!available.includes(name)) {
		console.error(`没有这个技能：${name}`);
		process.exit(1);
	}
}

mkdirSync(targetRoot, {recursive: true});
for (const name of chosen) {
	const dest = path.join(targetRoot, name);
	rmSync(dest, {recursive: true, force: true});
	cpSync(path.join(DIST_SKILLS_DIR, name), dest, {recursive: true});
	console.log(`installed  ${name} → ${dest}`);
}
console.log(`\n共 ${chosen.length} 个。重启 agent 会话后生效（多数客户端只在会话开始时扫描技能目录）。`);
