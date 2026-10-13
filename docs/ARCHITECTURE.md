# SciMemo 架构蓝图

版本：0.2 蓝图 · 2026-10-14

本文是**结构性蓝图**：模块边界、依赖方向、接口契约、扩展点。它回答"代码应该长成什么样"，不重复评估结论。

- 产品与流程取舍 → [科研流程评估](RESEARCH_WORKFLOW_REVIEW.md)
- 本轮已发现的问题与修复 → [架构评估](ARCHITECTURE_REVIEW.md)
- 框架选型与信息架构 → [完整开发框架](DEVELOPMENT_FRAMEWORK.md)
- 字段与不变量 → [数据模型](DATA_MODEL.md)
- 派生视图 → [读模型](READ_MODEL.md)
- 错误分类与并发 → [错误与并发模型](ERROR_AND_CONCURRENCY_MODEL.md)
- 界面架构 → [界面架构](UI_ARCHITECTURE.md)
- 版本与迁移 → [迁移与版本化](MIGRATION_AND_VERSIONING.md)
- 平台能力 → [平台能力矩阵](PLATFORM_MATRIX.md)
- 决策记录 → [ADR](adr/README.md)
- 实际验证状态 → [TEST_REPORT](TEST_REPORT.md)

> 本文中的"当前"指仓库已有代码；标 **[计划]** 的项目尚未实现。按 AGENTS.md，不得把计划项描述为已完成。

## 1. 分层与依赖方向

依赖只能自外向内，**内层不得反向依赖外层**。这条规则由 `npm run check:layers`（见 §1.3）机械校验，不靠自觉。

```text
L5  platform/  ── Tauri IPC · IndexedDB · HTTP transport · 文件导出
      │                  只能被 ui/ 与 app/ 调用
L4  ui/ + app/ ── React 页面 · 路由 · 派生视图订阅 · 表单草稿
      │                  禁止写 storage、禁止构造 outbox
L3  core/service.ts ── WorkspaceService：业务命令 + 事务边界
      │                  唯一的写入口
L2  core/read/  ── 纯派生读模型（无副作用、可缓存）
      │
L1  core/domain.ts ── 纯领域规则 + validateDoc（无 I/O、无时钟、无随机）
      │
L0  core/types.ts ── 类型 · 常量 · 信封 · 编解码原语
```

### 1.1 各层职责与禁止事项

| 层 | 允许 | 明确禁止 |
|---|---|---|
| L0 `types.ts` | 类型、常量表、`makeDoc`、信封结构 | 任何业务规则判断 |
| L1 `domain.ts` | 状态转移、聚合内不变量、边界校验 | `Date.now()`、`crypto.randomUUID()`、网络、存储、React、Tauri |
| L2 `read/` | 从 `Workspace` 计算视图、排序、筛选、聚合统计 | 修改入参、产生副作用、写任何状态 |
| L3 `service.ts` | 业务命令、事务编排、outbox 构造、冲突解决 | 直接操作 DOM、直接 `fetch`、泄漏存储细节给 UI |
| L4 `ui/` | 渲染、交互、表单草稿、展示状态、调用 L3 | 调用 `driver.save`、拼 outbox、跳过 L3 直接改 `docs` |
| L5 `platform/` | 实现 `Driver`、`SyncTransport`、文件导出 | 包含业务规则、决定同步胜负、决定删除语义 |

### 1.2 已经存在的违规与整改

这几处是当前代码的真实情况，记录在此以便整改，不是建议：

| 位置 | 违规 | 目标状态 |
|---|---|---|
| `core/domain.ts` `addSubmission` / `addSubmissionEvent` | 直接调用 `now()`、`uid()` —— L1 依赖了环境 | **[计划]** 注入 `Context{now:()=>string; uid:()=>string}`，测试可固定时间与 ID |
| `core/demo.ts` | 用 `new Date()` 算"今天+14天" | **[计划]** 经 `Context` 注入，避免示例数据依赖运行时刻 |
| `core/workspace.ts` | 用 `old.updatedAt` 做本机陈旧编辑器检测 | **[计划]** 改为显式 `localRev`（见 [错误与并发模型](ERROR_AND_CONCURRENCY_MODEL.md) §4）。当前实现可用，但语义混淆：`updatedAt` 是展示字段 |
| `core/sync.ts` | 依赖 `Date.parse` 关联本机时钟 | 需逐处确认无 last-write-wins 语义；服务端版本才是权威 |
| `ui/App.tsx` | `window.confirm` 用于删除确认 | **[计划]** 换成自有审计确认组件（见 [界面架构](UI_ARCHITECTURE.md) §5） |

### 1.3 分层校验脚本 **[计划]**

`scripts/check-layers.mjs`：解析每个文件顶部的 `import`，按上表断言来源层与目标层合法，发现 `core/*` 导入 `react`/`@tauri-apps`/`platform/*`，或 `ui/*` 导入 `platform/driver` 的写接口，即失败。加入 `npm run check`。这是把架构规则变成 CI 门禁的唯一可靠办法。

## 2. 模块地图

```text
src/
├── core/
│   ├── types.ts            信封、领域类型、常量、Driver/SyncTransport 接口
│   ├── domain.ts           纯领域规则 + validateDoc
│   ├── service.ts          WorkspaceService（现为 workspace.ts）[计划改名]
│   ├── read/               [计划] 派生读模型，见 READ_MODEL.md
│   │   ├── agenda.ts           到期/过期/该我动作
│   │   ├── stalled.ts          长期无状态变化
│   │   ├── timeline.ts         稿件时间轴
│   │   └── search.ts           检索（当前是 JSON 全串匹配）
│   ├── sync.ts             SyncEngine：组批、ACK 校验、冲突、游标
│   ├── backup.ts           备份/恢复/导出格式
│   ├── references.ts       关联审计（已是纯函数，归入 read/）
│   └── demo.ts             虚构示例
├── platform/
│   ├── driver.ts           IndexedDB / Tauri SQLite 实现 + 文件导出
│   ├── http-sync.ts        同步传输
│   └── notifications.ts    [计划] 平台通知抽象，无实现时降级为列表
└── ui/
    ├── app/                路由、应用壳、错误边界
    ├── views/              四个业务页 + 设置
    ├── components/         自有设计系统（见 UI_ARCHITECTURE.md）
    ├── hooks/              useServiceCommand 等
    └── styles/             tokens.css + 组件样式
```

`core/read/` 目前只有 `references.ts` 一个文件，计划把所有派生查询集中到该目录，让"UI 不自己算业务视图"成为可校验的规则。

## 3. 接口契约

契约已存在于 `types.ts`，这里把语义写清楚，避免实现漂移。

### 3.1 Driver（持久化边界）

```ts
interface Driver {
  readonly name: string;                      // 展示用，不参与逻辑判断
  load(): Promise<Workspace>;                 // 必须返回深拷贝
  save(expectedRevision: number, next: Workspace): Promise<void>;
}
```

不可协商的四条：

1. **`save` 必须是 compare-and-swap**：`expectedRevision` 与当前不一致时抛错，绝不静默覆盖。
2. **必须原子**：`docs`、`deleted` 标记、`outbox`、`conflicts`、`cursor`、`serverId` 同一事务提交。半个工作区落盘是不允许的状态。
3. **失败必须抛错**。禁止 `catch` 后写内存、伪造成功。这是 AGENTS.md 的硬约束。
4. **`load` 返回深拷贝**。调用方可自由修改，不污染存储层状态。

原生 SQLite 的补充约束 **[P1，未完成]**：`load` 内的多次 `SELECT` 必须包在一个只读事务里，否则跨进程可能读到混合快照。见 [架构评估](ARCHITECTURE_REVIEW.md) §4。

### 3.2 WorkspaceService（业务命令边界）

```ts
class WorkspaceService {
  load(): Promise<Workspace>;
  exclusive<T>(work: () => Promise<T>): Promise<T>;   // 进程内串行化
  update(fn: (next: Workspace) => void): Promise<Workspace>;
  put(input: Doc): Promise<Workspace>;
  recordSubmission(paper, target): Promise<Workspace>;
  recordSubmissionEvent(paper, submissionId, event): Promise<Workspace>;
  remove(id): Promise<Workspace>;
  restore(id): Promise<Workspace>;
  resolve(conflictId, 'local' | 'remote'): Promise<Workspace>;
  restoreBackup(text): Promise<Workspace>;
  loadDemo(): Promise<Workspace>;
}
```

规则：

- **UI 只能调用具名业务命令**。`update`/`put` 是给 core 内部与确有通用编辑需求的场景用的；新增业务语义时**先加具名命令**，不要在 UI 里组合 `put`。
- 每个命令必须是"读 → 纯函数变换 → CAS 提交"三步，不得在中间 `await` 网络或用户输入。
- 命令要么完整成功、要么完整失败。`addSubmission` 与 outbox 构造在同一事务内完成。
- **未来新增命令的命名约定**：`动词 + 聚合名`（`recordSubmissionEvent`、`resolveConflict`、`archivePaper`），避免 `updateXxx` 这类含糊命名。

### 3.3 SyncTransport（网络边界）

```ts
interface SyncTransport {
  info(): Promise<{ serverId: string; protocol: 1 }>;
  push(ops: Operation[], serverId: string): Promise<{ results: PushResult[] }>;
  pull(cursor: number, serverId: string): Promise<PullResult>;
}
```

- 传输层**不解释业务**：不判断该不该覆盖、不决定冲突归属。它只搬运并做协议级校验（身份、版本、序号、游标）。
- 任何 transport 异常都只能导致同步失败，**不能影响本地已保存内容**。
- 幂等键 `opId` 由 core 生成，transport 不得改写或去重。

### 3.4 Context（[计划] 可测试性注入）

```ts
interface Context { now: () => string; uid: () => string; }
```

目的：让领域测试可固定时间与 ID。没有它就无法稳定断言"补录历史不改变当前状态"这类时间相关行为。默认实现走 `Date.now()`/`crypto.randomUUID()`，测试注入计数器。

## 4. 聚合边界与事务边界

**唯一同步聚合是 `Paper`**，含嵌套 `submissions[].events[]`。理由与代价见 [完整开发框架](DEVELOPMENT_FRAMEWORK.md) §4.1：换取"一次投稿不会半成功"，代价是并发改同一稿件的不同字段也会冲突。

边界规则：

- 跨聚合引用一律用 **UUID 弱引用**，可暂时悬空；**禁止级联删除**，禁止把"对象还没下载到"当作非法数据。
- 一次用户操作若需要修改两个聚合（如"修改日程并同步更新稿件下一步"），**必须**在同一 `update` 内完成，或明确拆成两步并告知用户。不得出现只成功一半的静默状态。
- **[计划]** 若将来确实需要跨聚合原子写，需要设计"带依赖的原子多记录操作"，不能靠连续两次 `put` 拼凑。

## 5. 扩展点

只有三个受控扩展点，都已有接口。**不引入通用插件系统**（AGENTS.md 范围控制）。

| 扩展点 | 接口 | 现有实现 | 计划实现 |
|---|---|---|---|
| 存储 | `Driver` | IndexedDB、Tauri SQLite、Memory(测试) | 增量提交版本 |
| 传输 | `SyncTransport` | HTTP | 无（本地文件传输暂不需要） |
| 平台能力 | **[计划]** `PlatformCapabilities` | 见 [平台能力矩阵](PLATFORM_MATRIX.md) | 通知、原生对话框、打开外链 |

`PlatformCapabilities` 的形状 **[计划]**：

```ts
interface PlatformCapabilities {
  storage: 'sqlite' | 'indexeddb';
  nativeFileDialog: boolean;   // false 时退化为浏览器下载
  notifications: boolean;      // false 时降级为应用内列表
  openExternal: boolean;
}
```

UI 依能力降级，**不得因为能力缺失而隐藏核心记录功能**。手机浏览器没有通知，照样必须能记日程。

## 6. 架构不变量（违反即为缺陷）

1. 领域核心不导入 React、Tauri、HTTP。
2. 本地编辑与 outbox 同事务提交。
3. `save` 是 CAS，冲突显式报错。
4. 内层不依赖外层技术栈。
5. 存储失败绝不伪装成成功，绝不回退内存。
6. 转投不覆盖旧目标、旧题名、旧事件。
7. JSON 导入、远程数据、URL、日期一律视为不可信。
8. 日期可空，仅日期不虚构时刻。
9. 删除用 tombstone，不级联，可恢复。
10. 冲突保留双方，远程版本不用本机时钟决定胜负。
11. 派生视图只读，不产生持久化字段。
12. 凭据不进入普通备份、日志或仓库。

## 7. 演进约束

- 加模块前先问：能否用现有四类聚合 + Note 模板表达？**默认答案是"能"**。
- 改字段前先读 [迁移与版本化](MIGRATION_AND_VERSIONING.md)。
- 任何结构性选择写进 [ADR](adr/README.md)，不要只留在对话或提交信息里。
- 性能优化前先有实测基线（`SM-008`），不提前为想象中的规模设计。
