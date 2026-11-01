# 架构

## 三方角色

| 位置 | 角色 | 谁写 |
|---|---|---|
| `D:\test\remotion-skills` | **基准产物**：官方分发的最终形态，只读参照 | 官方 |
| `skills/` | **源**：唯一可编辑处 | 你 |
| `dist/` | **产物**：可装机/可发布 | `npm run build` |

三者之间只有两条边：

```
官方产物  --import-->  skills/  --build-->  dist/
                            \--roundtrip--^   比对，必须逐字节相等
```

`import` 只在首次搭场或跟进官方升级时跑，它会覆盖 `skills/`。

## 为什么源里没有内嵌副本

官方仓库里 `remotion-best-practices/remotion-captions` 是**符号链接**。Windows 上需要管理员/开发者模式，
git 在没有 `core.symlinks` 时还会把它落成文本文件，CI 上行为也不一致。

所以源树保持**扁平 12 个技能**，内嵌只在 `build` 时发生。代价是"编辑两份"不可能发生，
收益是任何平台克隆下来都是同一份字节。

## build 做的三件事

1. 12 个技能各落一份 standalone 副本；
2. 按 `EMBED_SETS` 递归复制子技能进父技能，入口改名 `REFERENCE.md`
   （best-practices 内嵌 11 个兄弟；markup 内嵌 maps；因此 best-practices/markup 里还嵌着一份 maps）；
3. 全树重算相对链接：
   - 目标落在某个内嵌副本上 → 指过去（**内层优先**，与官方一致）；
   - 目标技能没被当前技能内嵌 → 降级成纯文本（官方 `removeCrossSkillLinks` 同一个目的）。

### 为什么入口要改名

Agent 扫描技能目录时，任何 `SKILL.md` 都会被当成一个可加载技能。内嵌副本若保留 `SKILL.md`，
一个装好的 `remotion-best-practices` 会冒出 12 个重名技能，目录层直接被污染。改成 `REFERENCE.md`
后它只是普通文档，只能被正文链接带进去。

### 为什么跨技能链接会变纯文本

Agent Skills 规范要求技能目录自包含。单装 `remotion-maps` 时，`../remotion-interactivity/SKILL.md`
在它的安装目录里根本不存在——留着就是死链。降级成纯文本，信息不丢，只是点不动。

## 不变量

| 不变量 | 谁保证 | 违反后果 |
|---|---|---|
| 每个技能有 `SKILL.md`，frontmatter `name` = 目录名 | `check` | agent 加载到错误名字 |
| 所有技能 `version` = `package.json.version` | `check` | 升级时版本撒谎 |
| 源树相对链接全部可达 | `check` | 加载链路半路断 |
| 源树不出现 `REFERENCE.md` | `check` | 你在改产物而不是源 |
| 每篇文档从 `SKILL.md` 可达 | `check`（警告） | 文档永远不被读到 |
| `dist/` 内嵌副本入口都是 `REFERENCE.md` | `check` | 重复技能被发现 |
| `dist/` 与官方产物逐字节一致 | `roundtrip` | 分发行为被无意改变 |

## 已知结构债

这些是**官方产物本身**的问题，工作区只是把它们显式化了：

1. **8 篇孤儿文档**：`remotion-maps` 的 7 篇 `references/*.md`、`remotion-markup/light-leaks.md`
   从入口顺着链接走不到。它们存在但不会被加载，只能靠 agent 主动列目录发现。
2. **maps 在产物里出现三份**：`remotion-maps/`、`best-practices/remotion-maps/`、
   `best-practices/remotion-markup/remotion-maps/`。这是"单装任一技能都自洽"的代价。
3. **两套版本号**：`package.json` 与 12 个 frontmatter 各写一遍，升级要同步。
4. **中文/英文混排缺失**：这套技能全英文，`description` 极短（3–5 词），语义匹配弱，
   实际入口主要靠 `/remotion-xxx` 斜杠命令与路由器正文。

改前两条之前先想清楚：它们是**分发形态的设计后果**，不是 bug。
