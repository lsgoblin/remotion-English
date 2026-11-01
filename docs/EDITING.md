# 怎么改

## 改一篇现有文档

```bash
# 1. 编辑源（唯一可改处）
skills/remotion-maps/SKILL.md

# 2. 静态校验
npm run check

# 3. 构建 + 验收
npm run build
npm run roundtrip     # 会红，这是预期的：你确实改了分发内容

# 4. 认为是好改动，就把新产物设为基准
npm run release
```

`roundtrip` 红不是错误，是提醒："分发形态变了，确认一下"。确认后 `release` 把 `dist/` 写回基准产物目录。

## 加一篇专题文档

1. 在对应技能目录建 `xxx.md`；
2. **必须在 `SKILL.md` 里挂链**，否则 `check` 报孤儿警告；
3. `npm run verify`。

孤儿警告不是摆设：agent 只顺着链接读，没有入链的文档等于不存在。

## 加一个技能

```bash
# 1. 建目录 + 入口（frontmatter 三个字段都要）
skills/remotion-foo/SKILL.md
```

```md
---
name: remotion-foo
description: 一句话，写清"什么时候该用我"
version: 4.0.539
---
```

2. 若希望它被 `remotion-best-practices` 内嵌，改 `scripts/lib/core.mjs` 的 `buildEmbedSets`
   （默认已包含所有兄弟技能，无需改）；
3. 若要它自己内嵌别人（像 markup 内嵌 maps），在同一个函数里加一条；
4. `npm run verify`。

## 改内嵌关系

唯一入口是 `scripts/lib/core.mjs` 的 `buildEmbedSets()`。`build` 会递归处理：
markup 内嵌 maps 之后，markup 被嵌进 best-practices 时自动带着 maps。

## 实测改动效果

```bash
npm run build
node scripts/install.mjs remotion-maps            # 装到 %USERPROFILE%\.agents\skills
node scripts/install.mjs --all
node scripts/install.mjs remotion-maps --to D:\some\skills
```

装完**重开 agent 会话**（多数客户端只在启动时扫描技能目录），拿一个真实小需求跑一遍，
看它是否按新文档行事。静态检查保证不了"agent 会照做"，这一步才是行为验证。

## 常见失败与含义

| 报错 | 含义 |
|---|---|
| `断链 → xxx` | 链接指向了不存在的文件；跨技能引用请写成 `../remotion-x/SKILL.md` |
| `源树里不允许出现 REFERENCE.md` | 你在改产物；改 `SKILL.md` |
| `version=… package.json version=…` | 升级时漏同步 frontmatter |
| `N 篇文档从 SKILL.md 走不到` | 孤儿文档，补入链或删掉 |
| roundtrip `内容不同` | 分发形态变了；确认后 `npm run release` |

## 跟进官方升级

官方发新版时，**不要手工 merge**，重新导入一次：

```bash
# 把新的官方产物放到 SKILLS_ARTIFACT 指向的位置
npm run import
npm run verify
```

`import` 会从产物反推源（还原被剥掉的跨技能链接），并覆盖 `skills/`。
它不改 `package.json` 的 version，记得手动对齐。
