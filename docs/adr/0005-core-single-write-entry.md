# ADR-0005：核心分层与单一写入口

- 状态：已接受
- 日期：2026-10-14
- 相关：[架构蓝图](../ARCHITECTURE.md) §1、§3、[错误与并发模型](../ERROR_AND_CONCURRENCY_MODEL.md)

## 背景

`src/core` 已经是业务逻辑所在，且当前确实不导入 React、Tauri 或 HTTP——这个边界是项目最有价值的设计之一。但它目前靠约定维持，没有机械校验，且已有两处实际违规（`domain.ts` 直接调用 `now()`/`uid()`）。

同时，UI 写数据的路径需要明确：`WorkspaceService` 既有具名业务命令（`recordSubmission`），也有通用入口（`put`/`update`）。若不约束，UI 会倾向于直接用通用入口拼装业务逻辑，规则就散到界面层了。

## 决策

**分层**（依赖只能由外向内）：

```text
L5 platform/  →  L4 ui/app  →  L3 core/service  →  L2 core/read  →  L1 core/domain  →  L0 core/types
```

**写路径**：UI 只能调用 `WorkspaceService` 的**具名业务命令**。新增业务语义时先加命令，不允许在 UI 里组合 `put`/`update`。

**校验**：`scripts/check-layers.mjs` 解析 import 并断言层间依赖合法，纳入 `npm run check`。

**可测试性**：领域函数接受注入的 `Context{now, uid}`，不直接读环境和随机源。

## 后果

**正面**

- 领域规则可被完整测试且不依赖系统时钟（当前测试无法稳定断言时间相关行为）。
- 更换存储、传输、UI 框架时，`core` 不动。这已经在实践中验证过价值：IndexedDB 与 Tauri SQLite 是两个 Driver，核心没改。
- 新功能的落点明确：业务规则 → `domain.ts`，派生视图 → `read/`，命令 → `service.ts`。
- 分层违规会在 CI 失败，而不是靠 code review 的记忆。

**负面**

- 多一层间接。为一个小需求可能要同时改 `domain` + `service` + UI，而不是直接在组件里写三行。
- `check-layers.mjs` 是自己写的解析脚本，会有误报（例如动态 `import()`）需要维护。
- 注入 `Context` 会让每个领域函数签名变长。这是为可测试性付出的明确代价。
- 严格分层会影响迭代速度，尤其在探索功能阶段（"先试试这个页面能不能这样"）。

## 被否掉的方案

- **不分层，业务逻辑就近写在组件里**：短期快，但当前 `App.tsx` 已经体现了后果——派生逻辑、统计、时间判定混在渲染中，无法单测。
- **用 ESLint 的 `no-restricted-imports` 代替自研脚本**：可行且更标准，但需要引入 ESLint 及配置体系；当前项目无 lint 环节。**若将来引入 lint，应优先用它替换自研脚本**（见重新考虑条件）。
- **依赖注入框架 / 服务容器**：对一个个人应用是过度设计。
- **允许 UI 直接调 `put`**：会立刻导致规则漂移，且 outbox 构造出现在界面层，违反 AGENTS.md 的原子提交要求。

## 重新考虑的条件

- 引入 ESLint（或其他静态检查）时，用 `no-restricted-imports` + `import/no-restricted-paths` 替换自研脚本。
- 分层在探索阶段造成明显阻力时，可对标注为原型的功能放宽 L4 限制，但**不得**放宽 L1/L2（`core` 不依赖环境这条没有例外）。
