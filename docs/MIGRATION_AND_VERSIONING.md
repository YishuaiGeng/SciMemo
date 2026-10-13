# 迁移与版本化

版本：0.1 · 2026-10-14

配套 [架构蓝图](ARCHITECTURE.md)、[数据模型](DATA_MODEL.md)、[同步协议](SYNC_PROTOCOL.md)。本文定义"改数据模型时到底要动哪些文件、按什么顺序、怎么验证"。

AGENTS.md 要求："Update types.ts, domain validators, schemas/document.schema.json, server semantic validation, fixtures and tests together. Schema changes need versioning/migrations. Do not edit historical migration meaning." 本文是该要求的操作手册。

## 1. 七种版本号，不要混用

这是最容易出错的地方。它们各自独立演进：

| 名称 | 位置 | 含义 | 谁改它 |
|---|---|---|---|
| `schemaVersion` | `Workspace` | **应用数据格式**版本 | 结构变更时开发者手动递增 |
| `localRevision` | `Workspace` | 本机提交序号，用于同机 CAS | 每次 `commit` 递增 |
| `doc.version` | `Doc` | **服务端已确认**版本 | 仅服务端接受写入时递增 |
| `doc.localRev` **[计划]** | `Doc` | 本机文档修订号，替代 `updatedAt` 做陈旧检测 | 每次本机编辑递增 |
| `protocol` | `SyncTransport.info()` | 同步协议版本（当前 `1`） | 协议形状变更时 |
| `format: 'scimemo-backup', version: 1` | 备份 JSON | 便携导出格式 | 导出结构变更时 |
| SQLite migration 序号 | `src-tauri/migrations/` | 原生库 DDL 历史 | 只增不改 |

**硬规则**：

- `doc.version` **绝不由客户端递增**。离线编辑不改变它。
- `schemaVersion` 变化**必须**伴随一个纯迁移函数。
- 已有的 `001_workspace.sql` **永不修改含义**，新变更走 `002_*.sql`。
- 备份 `format.version` 与 `schemaVersion` 是**两个独立版本**，不要用一个数字表达两件事。

## 2. 三类变更

### A 类：兼容扩展（不需要 migration）

**前提：JSON Schema 严格拒绝未知字段**，所以"加一个必填字段"**不属于** A 类。真正的 A 类只有：

- 增加**可选**字段（同时需放宽 schema 的 `required` 与"额外字段禁止"规则）——**注意**：当前 schema 与 `validateDoc` 的 `shape()` 要求字段集合**完全相等**，因此严格来说连可选字段也是破坏性变更。这是一个重要约束：**当前数据模型不支持可选新字段**。

这意味着 A 类在实践中几乎不存在。任何字段增加都走 B 类。

### B 类：需要 schemaVersion + 迁移

- 增加、删除、重命名字段
- 改枚举值（如给 `deadlineType` 加 `abstract`、`camera_ready`）
- 改嵌套结构（如给 `Submission` 加 `round`）

### C 类：存储层或协议变更

- SQLite 表结构变化 → 新 migration 文件
- 同步协议形状变化 → `protocol` 版本 + 服务端兼容策略
- 备份格式变化 → `format.version` 递增

## 3. B 类的完整清单

改一个字段要同步动的文件（缺一即失败）：

| # | 文件 | 内容 |
|---|---|---|
| 1 | `docs/DATA_MODEL.md` | 字段表与不变量 |
| 2 | `src/core/types.ts` | 类型定义、枚举常量、`DataByKind` |
| 3 | `src/core/domain.ts` | `validateDoc` 的 `shape()` 键列表与类型断言 |
| 4 | `schemas/document.schema.json` | JSON Schema（`required`、`additionalProperties`、类型、格式） |
| 5 | `server/` 语义校验 | 与客户端规则对齐 |
| 6 | `tests/fixtures/*.json` | 虚构正反样例（含边界：空值、中文、emoji、超长） |
| 7 | `tests/` + `server/tests/` | 两侧断言更新 |
| 8 | `src/core/demo.ts` | 示例数据（若字段必填） |
| 9 | `src/core/backup.ts` | 若影响导出格式 |
| 10 | 迁移函数 | 见 §5 |
| 11 | `docs/ARCHITECTURE_REVIEW.md` / `KNOWN_LIMITATIONS.md` | 若限制发生变化 |

## 4. migration 的设计规则

```ts
type Migration = (doc: Doc) => Doc;   // 纯函数，v(n) → v(n+1)
```

1. **纯函数**：不读时钟、不读网络、不生成随机 ID、不改 `id`/`createdAt`。
2. **单向且逐级**：`v1→v2`、`v2→v3`，不写 `v1→v3` 的捷径。逐级可测。
3. **幂等性不要求**，但**必须能识别已迁移的数据**（`schemaVersion` 在 `Workspace` 上，不在单个 doc 上——因此迁移是**整个工作区级**操作，这是当前设计的约束）。
4. **不发明历史事实**：字段从无到有时，**不得**填入"今天"或猜测值。宁可留 `null`/空串，并在迁移报告中列出"需要用户确认"的记录数。
5. **保留原文**：删除或改写旧字段时，若该字段可能承载用户已录入的事实，必须保留到归档字段或至少在迁移报告中可见，禁止静默丢弃。
6. **迁移失败必须中止且不写入**。不得产生"迁移了一半"的工作区。

## 5. 迁移执行流程 **[计划]**

当前**没有任何迁移机制**（`schemaVersion` 恒为 1，无迁移代码）。第一次结构变更前必须建立：

```text
启动 → 读取 Workspace
     → schemaVersion < 当前版本？
        是 → ① 先写一份迁移前完整备份（独立文件，不覆盖）
             ② 在内存中逐级迁移全部 docs
             ③ 全部通过 validateDoc？
                 否 → 中止，提示用户保留原文件并报告哪条记录失败
                 是 → ④ 单次 CAS 提交（含新 schemaVersion）
             ⑤ 记录迁移日志：版本、条数、需要人工确认的记录
        否 → 正常启动
```

关键点：

- **① 自动备份是硬要求**。用户不该因为升级丢数据。这是 `SM-004`/`SM-010` 的一部分。
- **③ 失败中止**优于"尽力迁移"。半个迁移的工作区比拒绝启动更糟。
- **④ 必须单次提交**，否则中断会留下混合版本。
- **⑤ 迁移日志要能被用户看到**（设置页），而不是只进 `console`。

## 6. 回滚策略

- **前向兼容优先**：让新版本能读旧数据容易，让旧版本读新数据难。
- **降级不在首版承诺内**。用户降级版本时，应明确提示"此工作区由更新版本创建，可能无法完整读取"。不得静默损坏。
- **服务端回滚**：见 [同步协议](SYNC_PROTOCOL.md) §6——必须停止服务、轮换 `server_id`，不得复制旧库假装没回滚。

## 7. 已计划的迁移（按依赖顺序）

| 版本 | 内容 | 依赖 | 状态 |
|---|---|---|---|
| v1 | 当前 | — | 已实现 |
| v2a | `Deadline` 增加分组（同一批截止成组）与 `deadlineType` 扩展 | 设计先行 | [计划] |
| v2b | 历史纠错：`Submission`/`Event` 的修订记录（前后值、原因、修订时间） | 与 v2a 共用迁移框架 | [计划] |
| v2c | `doc.localRev`，`updatedAt` 回归展示字段 | 需与同步确认 `localRev` 是否出同步边界 | [计划] |
| v2d | 修回轮次 `round` | 依赖 v2b 的修订语义 | [计划] |

**顺序不可颠倒**：v2b（修订语义）必须先定，v2d（轮次）才有落点。这也是 [科研流程评估](RESEARCH_WORKFLOW_REVIEW.md) §6 的结论。

**每一项开放前**：定不变量与正反样例 → 实现迁移 → 验证旧备份/旧设备/冲突恢复 → 再开放 UI。**不要先做 UI 再补数据模型**。
