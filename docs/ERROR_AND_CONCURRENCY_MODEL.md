# 错误与并发模型

版本：0.1 · 2026-10-14

配套 [架构蓝图](ARCHITECTURE.md) §3、§6。本文定义错误的分类与处置、写入的串行化规则、同步期间的并发契约。

## 1. 现状与问题

当前错误处理是**字符串**：`WorkspaceService` 与 `domain.ts` 一律 `throw new Error('中文提示')`，UI 在 `run()` 里 `catch` 后 `setMessage(String(e))`，用一个布尔 `failed` 区分提示样式。

这个做法的具体后果：

1. **UI 无法区分"重试可能成功"与"重试永远不会成功"**。网络超时和"记录已被其他窗口修改"显示成同一种红条。
2. **无法区分"数据没坏"与"数据可能坏了"**。校验失败（用户输入问题）和 CAS 失败（并发问题）混在一起。
3. **文案与逻辑耦合**。要改提示语就得改领域代码，而领域代码不应关心措辞。
4. **测试只能断言字符串**，改一个字就红。

## 2. 错误分类

引入领域错误类型 **[计划]**（`core/errors.ts`）：

```ts
type ErrorCode =
  | 'VALIDATION'      // 输入不满足领域规则或不变量
  | 'IMMUTABLE'       // 试图修改不可变身份（kind / createdAt）
  | 'STALE_EDITOR'    // 基于旧快照编辑
  | 'LOCAL_CONFLICT'  // 本机 CAS 失败（另一标签页/窗口先写入）
  | 'UNRESOLVED_CONFLICT' // 该记录存在未解决同步冲突，禁止覆盖
  | 'STORAGE'         // 存储失败（配额、被阻塞、I/O）
  | 'SYNC_PROTOCOL'   // 服务端标识/协议/ACK/游标异常
  | 'SYNC_NETWORK'    // 网络失败
  | 'IMPORT_FORMAT'   // 备份格式不被支持
  | 'PRECONDITION'    // 前置条件不满足（如非空工作区恢复备份）
  | 'NOT_FOUND';

class DomainError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly context?: Record<string, unknown>) { super(message); }
}
```

`message` 保持中文面向用户，`code` 用于逻辑分支与测试断言。UI 不再解析字符串。

## 3. 每种错误的处置

| 错误 | 重试 | UI 处置 | 数据影响 |
|---|---|---|---|
| `VALIDATION` | 否 | 字段级提示，焦点定位到出错字段 | 未写入 |
| `IMMUTABLE` | 否 | 提示重新打开记录 | 未写入 |
| `STALE_EDITOR` | 否 | 提示"已在别处更新"，**提供"重新加载"** 而非静默覆盖 | 未写入 |
| `LOCAL_CONFLICT` | 是（重新加载后） | 提示有别的窗口在写，提供"重新加载并重试" | 未写入 |
| `UNRESOLVED_CONFLICT` | 否 | 跳转到冲突解决入口 | 未写入 |
| `STORAGE` | 是 | **红色 + 持久显示**，必须明确告知"本次未保存" | **未写入，需用户重试** |
| `SYNC_PROTOCOL` | 否 | 停止同步，说明原因，不自动改服务器绑定 | 本地数据完好 |
| `SYNC_NETWORK` | 是（手动/退避） | 黄色提示，本地照常可用 | 本地数据完好 |
| `IMPORT_FORMAT` | 否 | 提示格式不支持，保留当前工作区 | 未写入 |
| `PRECONDITION` | 否 | 说明前置条件 | 未写入 |

**硬约束**：`STORAGE` 错误绝不能被降级成普通提示或被吞掉。用户必须知道自己刚才的编辑**没有**保存。这是 AGENTS.md 的明文要求。

## 4. 写入串行化与并发

### 4.1 三个层次的并发

| 层次 | 机制 | 现状 |
|---|---|---|
| 进程内（同一窗口） | `WorkspaceService.queue` 串行化 | 已实现 |
| 跨窗口/标签页（同一机器） | `Driver.save` 的 CAS：`expectedRevision` vs 当前 `localRevision` | 已实现 |
| 跨设备 | 服务端 `baseVersion` 比较，冲突保留双方 | 已实现 |

### 4.2 已知的语义混淆：`updatedAt` 兼任两种角色

当前 `put` 用 `old.updatedAt !== doc.updatedAt` 检测"陈旧编辑器"，同时又用 `Date.now()` 递增写入 `updatedAt`：

```ts
next.updatedAt = new Date(Math.max(Date.now(), old ? Date.parse(old.updatedAt)+1 : 0)).toISOString();
```

问题：

1. `updatedAt` 是**展示字段**，却在承担并发控制职责。将来若允许编辑元数据而不改内容，或需要"最后编辑时间"真实反映用户操作，两者会打架。
2. `Math.max(Date.now(), ...)` 是在**修正本机时钟回拨**，但一旦跨窗口/跨设备，"加一毫秒"没有意义——`localRevision` 才是本机权威序号。
3. 这个判断发生在**领域校验之后、CAS 之前**，理论上两个窗口可以同时通过该检查，最后由 CAS 兜底。所以它**不是安全边界**，只是一个友好的早期提示。这一点必须在代码注释里写明，否则后人会误以为它是并发保护。

**目标状态 [计划]**：文档增加 `localRev: number`（可在 `documents.body` 内，不参与同步语义），由 `localRevision` 派生或独立维护；`updatedAt` 回归纯展示。迁移需按 [迁移与版本化](MIGRATION_AND_VERSIONING.md) 走 v2，**不得**就地改语义。

在此之前：保留现有行为，但**补上注释**说明它是提示而非保护。

### 4.3 同步期间的并发（P1 未解决）

现状：`syncOnce` 在整个网络请求期间持有服务写队列。后果是慢网络下用户点保存会**卡住**，体验上像是软件坏了。

**目标契约 —— 三段式，各段之间释放队列：**

```text
① 短事务：快照待发操作（不可变副本），记录 opId 列表              [持锁，微秒级]
② 网络：push / pull                                             [不持锁]
③ 短事务：按 opId 核对 ACK，更新版本、outbox、冲突、cursor       [持锁，微秒级]
```

关键约束：

1. **②期间用户的新编辑必须能成功**。它写入 outbox，与在途操作**不同的 `opId`**。
2. **③必须按 opId 精确核对**，不能"清空 outbox"——②期间新增的操作不在本批中，不能被删掉。
3. **③失败（CAS 冲突）时不能丢弃②的结果**。已上传的操作仍需在下次同步时靠幂等重试恢复（[同步协议](SYNC_PROTOCOL.md) §3 已有此语义）。
4. **不能只移除锁**。移除只是把竞态暴露给用户，必须实现三段式。
5. 验证方式：同步期间并发编辑/删除、跨窗口 CAS 失败、丢 ACK 重放。这属 `SM-107`。

## 5. 失败模式的禁止清单

以下行为一律视为缺陷：

1. 存储失败后回退到内存，并显示"已保存"。
2. `catch` 后只 `console.warn` 继续执行。
3. 冲突自动选择某一方。
4. 用设备时钟决定谁赢。
5. 导入失败后留下半个工作区。
6. 同步失败后清空 outbox 假装成功。
7. 把 `STORAGE` 错误显示成黄色普通提示。
8. 校验失败后"尽力保存能保存的部分"。

## 6. UI 呈现约定 **[计划]**

对应 [界面架构](UI_ARCHITECTURE.md) §4：

- **失败提示必须持久**，需要用户手动关闭（`STORAGE`）或被下一次成功操作取代（其余）。
- **成功提示自动消失**（约 3 秒）。
- 提示**只能有一个当前实例**，避免堆叠。
- `role="alert"` 用于失败，`role="status"` 用于成功（现有代码已如此，保持）。
- **未保存状态必须在界面上可见**：编辑器有未提交内容时，关闭需确认（现有行为），且应用关闭时不得静默丢弃。
