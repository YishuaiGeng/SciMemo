# 测试策略与工程约定

版本：0.1 · 2026-10-14

配套 [架构蓝图](ARCHITECTURE.md)、[TEST_REPORT](TEST_REPORT.md)。本文定义测什么、在哪一层测、以及代码与提交的约定。

## 1. 现状

| 层 | 工具 | 数量 | 状态 |
|---|---|---|---|
| 核心业务 | `node --test` + MemoryDriver | 78 | ✅ 已实测通过 |
| 后端 | pytest | 58 | ✅ 已实测通过 |
| 同步协议 | 临时 FastAPI + 真实 TS transport | — | ✅ 已实测通过 |
| 类型 | `tsc --noEmit` | — | ✅ |
| 构建 | `vite build` | — | ✅ |
| 浏览器交互 / IndexedDB | 无 | 0 | ⛔ **未验收** |
| 原生壳 / SQLite | 无 | 0 | ⛔ **Rust 从未编译** |
| 真实设备 | 无 | 0 | ⛔ |
| 视图组件 | 无 | 0 | ⛔ 无 DOM 测试环境 |

**最重要的事实**：当前测试通过的是 **MemoryDriver**。它证明业务规则正确，**不证明数据会保存**。README 与 TEST_REPORT 必须保持这个区分。

## 2. 分层测试要求

| 层 | 测法 | 必须覆盖 |
|---|---|---|
| L1 `domain` | 纯函数单测，注入固定 `Context` | 状态转移、不可变身份、单活跃投稿、终态禁追加、日期边界、大小上限 |
| L2 `read` | 纯函数单测 | 见 [读模型](READ_MODEL.md) §9，这是覆盖率应最高的一层 |
| L3 `service` | 单测 + MemoryDriver | 事务原子性、outbox 构造、CAS 失败、命令串行化、冲突解决 |
| L4 `ui` | DOM 测试 **[计划]** | 表单校验、草稿保护、错误分类展示 |
| L5 `platform` | 集成 | IndexedDB 持久化、SQLite 重启、文件导出、HTTP 协议 |
| 跨层 | 端到端 **[计划]** | 建稿 → 投稿 → 修回 → 结束 → 转投 → 查历史 |

## 3. 三条不可替代的验证

这三项**不能用内存或模拟替代**，因为它们是"记录不会丢"这一承诺的全部依据：

1. **真实存储重启**：IndexedDB 关闭页面重开；SQLite 关闭进程重开。数据仍在。
2. **真实设备**：Windows 与 macOS 各自安装、启动、退出、重启（`SM-002`）。
3. **真实双端同步**：两台真实设备（或至少两个独立存储实例），覆盖离线修改、并发冲突、网络中断、删除传播。

当前 HTTP 集成测试虽然真实（真 transport、真 FastAPI、真 SQLite 临时库），但**两个客户端都是内存**，不能代表设备。

## 4. Fixtures 策略

- **只使用虚构数据**（AGENTS.md 隐私条款）。现有 `tests/fixtures/demo.json` 与 `validation-cases.json` 已是虚构样例。
- **正反样例双端共享**：同一份 fixture 同时被 TS 与 Python 测试读取。字段变更时必须同步更新，见 [迁移与版本化](MIGRATION_AND_VERSIONING.md) §3。
- **边界样例必须包含**：空值、`null` 日期、中文、emoji、UTF-8 字节边界（500000 字节）、合法与非法 UUID、非闰年 2 月 29 日、跨时区 `instant`、AoE（UTC−12）。
- **禁止**把真实论文、审稿意见、真实期刊数据提交进仓库。

## 5. 测试命名与断言

- 测试名描述**行为**而非函数名：`'补录更早事件不会让当前状态倒退'`，而不是 `'test addSubmissionEvent'`。
- 断言错误时用 `ErrorCode`（[错误与并发模型](ERROR_AND_CONCURRENCY_MODEL.md) §2），不断言中文文案。文案会改，代码不该因此变红。
- **每个 bug 修复必须附一个能复现它的测试**。这是防止回归的唯一手段，也能阻止修错地方。

## 6. 代码约定

1. **文件名**：`core` 用小写（`domain.ts`），`ui` 组件用 PascalCase（`PaperDetail.tsx`）。
2. **导入后缀**：仓库统一使用 `.js` 后缀（ESM + `tsconfig` 的 `NodeNext` 风格），保持现有写法。
3. **注释**：只写**为什么**，不写**做什么**。现有代码中"为什么这样排序""为什么保留旧 priority"这类注释是正确用法，应保持；不要给显而易见的代码加注释。
4. **错误消息**：领域层抛 `ErrorCode`；面向用户的中文文案在 UI 层映射（[界面架构](UI_ARCHITECTURE.md) §9）。当前领域层直接抛中文，属待整改项。
5. **不留 TODO 而不记录**：任何"以后再说"必须对应一个 `ROADMAP.md` 的 issue 编号或本文档的 **[计划]** 标记，否则会被遗忘。

## 7. 提交与 PR 约定

- 提交信息说明**为什么改**。仅"update types"没有信息量。
- 数据模型变更的 PR **必须**同时包含 [迁移与版本化](MIGRATION_AND_VERSIONING.md) §3 清单中的文件，缺一律不合入。
- PR 描述里**如实写明哪些检查实际执行过**，未执行的不写"应该没问题"。
- 原生与设备测试**单独报告**（AGENTS.md 明文要求）。
- **不提交**：`.DS_Store`、`__pycache__`、`*.pyc`、数据库文件、令牌、签名证书、真实数据。（当前仓库根目录、`design/`、`design/logo/` 存在 `.DS_Store` 且 `server/` 下有 `__pycache__`，虽在 `.gitignore` 中但**首次 `git init` 前应删除**，避免误入。）

## 8. 必跑检查

```bash
npm run check
npm test
npm run build
python -m pytest server/tests -q
```

同步相关改动**额外**要求：

```bash
npm run test:integration
```

并补充丢失确认、冲突、删除三者至少一项的覆盖。

**[计划]** 增加 `npm run check:layers`（[架构蓝图](ARCHITECTURE.md) §1.3）并纳入 `npm run check`。

## 9. 性能基线（`SM-008`）

当前**没有任何性能数据**。在声称支持某个规模之前，必须先测量并写进 TEST_REPORT：

| 指标 | 样本规模 | 记录 |
|---|---|---|
| 保存延迟 P50/P95 | 100 / 1000 / 10000 条 | 毫秒 |
| 打开（首次 load） | 同上 | 毫秒 |
| 搜索耗时 | 同上 | 毫秒 |
| 工作区体积 | 同上 | MB（原生上限 30MB） |

测试数据必须是虚构生成的，不得用真实资料。**在拿到数据前，不得承诺任何规模**。
