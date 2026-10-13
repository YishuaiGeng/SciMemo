# 实际验证报告

日期：2026-10-14（第四轮）。开发脚手架，不是安全审计或平台认证。

本轮环境：macOS arm64、Node.js 25.2.1、TypeScript 5.9.3、React 19.3.0；Python 通过 uv 隔离环境加载 `server/requirements-dev.txt`。

## 本轮实际运行

| 检查 | 实际结果 | 输出 |
|---|---|---|
| `npm run check` | TypeScript 完整检查通过；分层校验 25 文件 / 89 import / **0 违规** | 见下 |
| `npm test` | **141 / 141 通过**（78 既有 + 27 读模型 + 21 错误模型 + 15 存储故障） | 见下 |
| `npm run build` | Vite 生产构建通过 | 见下 |
| `npm run check:native`（`cargo check` + `cargo test`） | **Rust 首次编译通过**，零错误零警告；**6 / 6 原生存储测试通过** | 见下 |
| `npm run desktop:dev` | macOS arm64 原生窗口成功启动；数据库在 `~/Library/Application Support/app.scimemo.desktop/` 创建，`user_version=1`、WAL 模式、三张表；运行日志无 panic | 见下 |
| `python -m pytest server/tests -q` | **58 / 58 通过**；1 条 Starlette/AnyIO 弃用提示 | 见下 |
| 真实 HTTP 集成 | 冲突／解决、删除、丢失确认重放、中文大记录分批通过 | 见下 |

实际命令：

```bash
npm run check
npm test
npm run build
uv run --python /opt/homebrew/bin/python3 --with-requirements server/requirements-dev.txt python -m pytest server/tests -q
uv run --python /opt/homebrew/bin/python3 --with-requirements server/requirements-dev.txt python scripts/test-http-integration.py
```

`python` 未加入本机 PATH；后端与 HTTP 测试通过 uv 隔离环境执行。

### 本轮命令输出

```text
Layer check: 25 files, 89 imports, 0 violations.

ℹ tests 141
ℹ pass 141
ℹ fail 0

dist/assets/index-Dnrn6J_9.css   17.30 kB │ gzip:  4.54 kB
dist/assets/index-DO0W1i9X.js   290.65 kB │ gzip: 91.34 kB
✓ built in 676ms

58 passed, 1 warning in 1.68s

PASS: real HTTP roundtrip, conflict, deletion, lost-ack replay and byte-limited large batches
```

## 本轮新增

**架构与读模型**（`docs/ARCHITECTURE.md` 等 8 份文档 + 8 篇 ADR）。

**分层校验 `scripts/check-layers.mjs`**（SM-012），纳入 `npm run check`。已用注入的违规验证脚本本身有效：

- 在 `src/core/domain.ts` 注入 `import {useState} from "react"` → 报 `L1 domain 不得导入 react`，退出码 1。
- 在 `src/core/read/context.ts` 注入 `export {...} from "../workspace.js"` → 报 `L2 read 导入了外层`，退出码 1。
- 还原后回到 0 违规，退出码 0。

**`Context{now,uid}` 注入**（SM-016）：`makeDoc`、`addSubmission`、`addSubmissionEvent` 接受可选 `Context`，默认 `systemContext`。既有调用点无需改动；测试可固定时钟与 ID。

**读模型 `src/core/read/`**（SM-013）：

| 文件 | 内容 |
|---|---|
| `context.ts` | 注入式 `ReadContext`、日历日比较、在审／待修回状态分组 |
| `agenda.ts` | 到期分桶（过期／今天／7 天／30 天／更晚）、关联题名解析、悬空引用标记 |
| `stalled.ts` | 长期无状态变化的进行中投稿，阈值可调，未知日期返回 null |
| `timeline.ts` | 稿件全历史，按 **recordedAt** 排序，同时暴露两个日期 |
| `stats.ts` | 稿件计数、按类型的计数（不再混算） |

**`searchDocs` 修正**（SM-017）：改为只遍历字段**值**。此前 `JSON.stringify(d.data)` 把字段名一起匹配，搜索 `title` 会命中所有稿件。新增 `kinds` 过滤参数。

**UI**（SM-014、SM-018）：新增 `AgendaView`（"该我动作"页），下设静默投稿列表；侧边栏与页脚计数改用 `kindCounts`；设置页新增静默阈值配置（默认 21 天，可调为 0 关闭）。`App.tsx` 中内联的统计计算与硬编码状态数组已移除。

**构建布局**：`tsconfig.core.json` 与 `tsconfig.integration.json` 的 `rootDir` 改为 `src`，以容纳 `core/read/` 子目录。输出由 `.test-build/*.js` 变为 `.test-build/core/*.js`，测试与脚本导入路径已同步更新。

## 第二轮：错误模型（SM-015）

新增 `src/core/errors.ts`：11 个错误码（`VALIDATION`／`IMMUTABLE`／`STALE_EDITOR`／`LOCAL_CONFLICT`／`UNRESOLVED_CONFLICT`／`STORAGE`／`SYNC_PROTOCOL`／`SYNC_NETWORK`／`IMPORT_FORMAT`／`PRECONDITION`／`NOT_FOUND`），配合 `DomainError` 与 `transportFailure`。

**既有中文文案逐字保留**，只增加 `code`，因此 105 项既有断言全部不受影响。领域层、服务层、同步层、备份层、平台驱动的全部 throw 点已分类。

新增 `src/ui/messages.ts`：把错误码映射为呈现（标题、是否持久、是否未保存、是否可重试、下一步建议）。`App.tsx` 的 `message`+`failed` 二元组替换为 `ErrorPresentation`；成功提示 4.2 秒自动消失，`STORAGE`／`SYNC_PROTOCOL`／`UNRESOLVED_CONFLICT` 必须手动关闭。

`window.confirm` 两处已移除，改为 `ConfirmDialog`（原生 `<dialog>`，焦点默认落在"取消"）。这是 [界面架构](UI_ARCHITECTURE.md) §5 记录的违规项。

**本轮发现并修复的两个真实缺陷**（不是重构，是行为错误）：

1. **保存失败时编辑器会被关闭、输入丢失**。改造提示系统时，`saveCommand` 吞掉了错误，`onSave` 因此总是解析成功，`setEditor(null)` 照常执行。已改为返回布尔值，失败时编辑器保持打开。这是原先就存在的隐患路径：`catch` 只记录提示、不阻断后续。
2. **`importBackup` 的 `JSON.parse` 抛出的原生 `SyntaxError` 逃出错误分类**。导入了损坏的 JSON 文件时，用户会收到一个不属于任何类别的错误。已在 `JSON.parse` 处就地分类为 `IMPORT_FORMAT`，并显式收窄不可信的信封结构（不再用 `as any`）。

## 第三轮：存储故障路径（SM-028）

上一轮把驱动层的失败标注为 `STORAGE` 码，但**从未真实触发过**。本轮补上可复现的验证。

**先修了一个分类错误**：`TauriDriver` 把所有 invoke 失败一律标成 `STORAGE`，但 Rust 的 `save_workspace` 在修订号不匹配时也会 `Err(...)`。也就是说原生端的"另一个窗口先保存"会被显示成持久红色警报，而不是"重新加载后重试"。现在 Rust 侧以 `LOCAL_CONFLICT:` 前缀拒绝该情况，TypeScript 侧按前缀区分。Rust 未编译，因此该字符串契约由源码级测试固定。

**新增 `tests/fake-indexeddb.mjs`**：一个只建模驱动所依赖行为的 IndexedDB 替身。它刻意复现三类容易出错的行为——请求 `onerror` 冒泡到 `tx.onerror` 时 `tx.error` 仍为 `null`；`put` 成功后事务仍可能在提交时中止（Chrome 以这种方式报告配额耗尽）；连接被 `onversionchange` 关闭后 `db.transaction()` 同步抛出 `InvalidStateError`。

**驱动改造**（`IndexedDbDriver` 与 `TauriDriver` 现在接受注入的工厂，便于测试）：

| 改动 | 原因 |
|---|---|
| `load` 改为在 `oncomplete` 解析 | 请求成功不等于读取完成 |
| `save` 的 `onabort` 一律按 `STORAGE` 处理 | 中止原因未知时，"未保存"是安全措辞；不猜成冲突 |
| 每次失败重新分类，不用缓存的 `failure` | 原代码把首次错误缓存，后续失败会复用它 |
| `db.transaction()` 包 try/catch | 连接被关闭时同步抛错，否则逃出分类体系 |
| 读失败与写失败分文案 | 读失败不该说"本次编辑没有写入" |
| 保留 `name` 与 `message` | 只保留 `message` 会丢掉 `QuotaExceededError` 这类关键线索 |

**15 项新测试覆盖**：配额错误、提交时中止、修订号冲突、连接被关闭、打开数据库失败、升级被阻塞、失败后 outbox 与历史不变、恢复后同一编辑可重试成功、呈现层文案与粘性、原生冲突与普通错误的分流、源码级前缀契约。

**这一项现在被真实验证了吗？** 部分是。被验证的是：驱动的失败分类与传播、原子性（失败后工作区逐字节不变）、写队列不被污染、以及用户看到的确切文案。**仍未被验证的是真实浏览器与真实 SQLite 的行为**——`fake-indexeddb.mjs` 是按规范行为建模的替身，不是浏览器。真实配额耗尽、真实磁盘满、真实 WAL 提交失败尚未测试。

## 第四轮：原生开发环境与首次编译

**环境**：rustup 安装 Rust 1.99.0（`stable-aarch64-apple-darwin`，minimal profile）。首次下载工具链时 `static.rust-lang.org` TLS 握手中断一次，重试成功。`~/.zshenv` 追加了 `. "$HOME/.cargo/env"`。

**首次 `cargo check`**：2 分 22 秒，255 个 crate，零错误零警告。`src-tauri/Cargo.lock` 首次生成（SM-001 缺的 Cargo 锁定部分），CI 改为 `--locked`。

**插件**：`tauri-plugin-opener`（外链进系统浏览器，capability 只允许 http/https）与 `tauri-plugin-dialog`（仅 Rust 侧使用）。

**导出改为 `export_with_dialog`**：另存为对话框在 Rust 命令内部弹出，UI 不传路径，避免暴露任意路径写入；先写临时同级文件、`sync_all`、再 `rename` 覆盖目标，修复了 KNOWN_LIMITATIONS #7 的非原子导出。用户取消时返回 `null`，界面显示"已取消导出"而不是"已导出"。

**一致性读**：`read` 的五次 `SELECT` 包进同一读事务，修复 KNOWN_LIMITATIONS #3 的跨进程混合快照风险（SM-010 前半）。

**6 项原生存储测试**（真实 SQLite 文件，"重启"=关闭连接后重开同一目录）：

| 测试 | 证明 |
|---|---|
| fresh database | 新库读出空工作区 |
| survives a restart | 中文与 emoji 正文、outbox、cursor、serverId 重启后逐字节一致 |
| stale revision | 旧修订号被拒，错误带 `LOCAL_CONFLICT:` 前缀，原内容不变 |
| rolls back completely | 事务中途失败（DELETE 与首条 INSERT 已执行后）完全回滚 |
| two connections | 两个实例互相可见提交，竞争被检测 |
| newer version refused | 更高 `user_version` 的库拒绝打开，不降级 |

**本轮发现并修复的回归**：第一轮用 `AgendaView` 替换旧日程页时，**"导出日历 .ics"按钮丢失**了。`calendarExport` 只剩未使用的 import，而 `tsc` 不报未使用导入，所以门禁没拦住。已恢复。

**仍未验证**：

- **Windows**：第五轮已由 CI 编译并通过 6 项原生测试；窗口与交互未验证。
- **桌面 UI 交互**：窗口启动了，但没有在窗口里实际点击录入、退出、重开。重启持久化只在 Rust 存储层验证，**不是端到端验证**。
- 外链与导出对话框未在窗口中实际点击。
- 安装包构建（`desktop:build`）、签名、公证均未执行。

## 第五轮：首次远程 CI（GitHub Actions）

代码首次推送到 `github.com/YishuaiGeng/SciMemo`，CI 首次实际运行：

| 工作流 | 平台 | 结果 | 运行 |
|---|---|---|---|
| Core and web checks（类型、测试、构建、后端、HTTP 集成） | ubuntu-latest + Node 22 + Python 3.13 | ✅ 通过 | [38406358475](https://github.com/YishuaiGeng/SciMemo/actions/runs/38406358475) |
| Native compile check（`cargo check --locked` + `cargo test --locked`） | **windows-latest** | ✅ 通过，5 分 23 秒，6 / 6 原生存储测试 | [38406421552](https://github.com/YishuaiGeng/SciMemo/actions/runs/38406421552) |
| 同上 | macos-latest | ✅ 通过，3 分 21 秒，6 / 6 | 同上 |

这是 **Windows 端的第一次编译**，也是 **Node 22 / Linux 环境的第一次验证**（此前只在本机 Node 25 上执行）。

CI 提示 `actions/checkout@v4`、`actions/setup-node@v4` 面向的 Node 20 运行时已弃用，目前被强制运行在 Node 24 上；需要后续升级 action 版本。

**Windows 仍未验证的**：窗口启动、WebView2 运行、真实交互、安装包。CI 只证明了编译与存储层测试。

## 覆盖与边界

新增 27 项读模型测试与 21 项错误模型测试。读模型覆盖：空工作区、日期级不虚构时刻、跨月／闰年天数、分桶顺序、关联失效（缺失／已删除）、未知日期不判为过期、按录入顺序排序、转投保留全部投稿、终态不进静默列表、阈值可调、纯函数不改入参、搜索不匹配字段名。

**仍未验证**（与上一轮相同，本轮未触及）：

- 浏览器交互与 IndexedDB 持久化
- Rust 编译、原生安装、重启持久化
- Android／iOS 真机
- 自动备份、草稿恢复、后台通知
- 性能基线（SM-008）
- 真实浏览器的配额耗尽与真实磁盘写入失败（见 KNOWN_LIMITATIONS 7b）

读模型与错误模型的测试全部运行在普通对象构造的工作区或 `MemoryDriver` 上，**不涉及任何真实存储**。`STORAGE` 码的完整链路（IndexedDB 配额耗尽、Tauri invoke 拒绝）**未经真实验证**——它只在驱动代码中被标注，没有触发过真实存储故障。

## 设备与平台状态

| 项 | 状态 |
|---|---|
| macOS arm64 + Node 25.2.1 | ✅ 本轮实测 |
| Linux + Node 22（远端 CI） | ⛔ 未执行 |
| Windows 安装与运行 | ⛔ 未执行 |
| macOS 原生壳 | ⛔ 未执行（Rust 未编译） |
| Android／iOS | ⛔ 未执行 |
| Docker 镜像 | ⛔ 未执行 |

根目录 `.venv` 非本轮使用环境。第五轮已提交并推送到 GitHub。

清理了 3 个 `.DS_Store`（根、`design/`、`design/logo/`）与 2 个 `__pycache__`（`server/app/`、`server/tests/`）；`.gitignore` 已覆盖这些路径，清理是为了避免首次 `git init` 前误入。
