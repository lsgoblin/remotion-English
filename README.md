# remotion-skills-dev

本地开发工作区：改造 [Remotion Agent Skills](https://www.remotion.dev/docs/ai/skills)。

```
skills/    ← 唯一可编辑的源（12 个技能）
dist/      ← 构建产物，可直接装机/发布（gitignore）
scripts/   ← 四个命令
docs/      ← 架构与改法
```

## 为什么需要它

`D:\test\remotion-skills` 是**官方分发形态**：嵌入副本被展开、入口改名为 `REFERENCE.md`、
跨技能链接被降级成纯文本。在那份目录里改文档等于改编译器输出，改完无处验证正确性。

本工作区把两者拆开，并用一条硬验收钉住等价性：

```bash
npm run verify
```

`源 → dist` 必须与官方产物 **285/285 个文件逐字节一致**。这条绿了，说明在这里改的东西，
产出的分发形态和官方同构；红了，说明你的改动真的改变了分发行为——这正是该被看见的。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run check` | 源树不变量：frontmatter、版本、断链、入口命名、孤儿文档 |
| `npm run build` | `skills/` → `dist/`（内嵌副本 + `REFERENCE.md` + 链接重算） |
| `npm run roundtrip` | 验收：`dist/` 与官方产物逐字节比对 |
| `npm run verify` | check → build → check → roundtrip |
| `npm run import` | 从官方产物反向重建 `skills/`（仅在重建/升级时用，会覆盖源树） |
| `npm run release` | build + 把当前 `dist/` 设为新基准（你有意改动之后） |

装机实测：

```bash
node scripts/install.mjs remotion-maps
```

## 下一步

- 怎么改、怎么加技能、怎么验证：[docs/EDITING.md](docs/EDITING.md)
- 目录约定、不变量、构建规则、已知结构债：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
