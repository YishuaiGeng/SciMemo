<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/logo/exports/scimemo-logo-horizontal-v04-dark.svg">
    <img src="design/logo/exports/scimemo-logo-horizontal-v04.svg" alt="SciMemo" width="440">
  </picture>
</p>

<p align="center">
  <strong>论文投稿与科研灵感手账</strong><br>
  A local-first notebook for manuscript submissions and research ideas.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0b6fd6"></a>
  <img alt="Status: 0.1.0-dev" src="https://img.shields.io/badge/status-0.1.0--dev-f5a623">
  <img alt="Local-first" src="https://img.shields.io/badge/data-local--first-0a2f5c">
  <a href="https://github.com/YishuaiGeng/SciMemo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/YishuaiGeng/SciMemo/actions/workflows/ci.yml/badge.svg"></a>
</p>

---

SciMemo 是给同时推进好几篇论文的研究者用的个人手账。它记下每篇稿件投到了哪里、审到哪一步、修回了几轮、转投去了哪；也让一个还没成形的念头，不必先变成项目就能被好好保存。

它**不是**文献管理器、实验平台、团队看板，也不要求注册账号、连接服务器或开启 AI。数据先存在你自己的电脑上。

> [!WARNING]
> **0.1.0-dev 开发版，尚未发布可安装版本。** 请不要把它当作科研资料的唯一副本。实际验证到什么程度，见下方[当前状态](#当前状态)与[测试报告](docs/TEST_REPORT.md)。

## 四个模块

| 模块 | 用来做什么 |
|---|---|
| **稿件** | 题名、工作阶段、下一步；一篇稿件的全部投稿经历——投稿、审稿、大修小修、拒稿、转投 |
| **灵感随笔** | 创新点、实验设想、组会结论。只要正文就能保存，可以不关联任何稿件，也可以关联多篇 |
| **期刊会议** | 你自己收藏的投稿目标：期刊、会议系列与具体届次，附官网、投稿入口和选择理由 |
| **该我动作** | 已过期、今天、7 天内、30 天内的截止，以及**长时间没有状态变化的在审稿件** |

## 它在意的细节

做科研的人会遇到的情况，SciMemo 尽量不替你篡改事实：

- **工作阶段与投稿状态分开。** 稿件在审，你照样可以在补实验；被拒一次不等于研究结束。
- **转投不覆盖历史。** 每次投稿都保留当时的目标名称与当时的题名，改了题目也查得到第一次投的是什么。
- **未知日期就留空。** 不知道哪天投的，不会被悄悄填成"今天"；只知道日期的截止，不会被虚构成某个具体时刻。AoE 不会被当成你电脑的时区。
- **静默不等于催稿。** 在审稿件超过一段时间没有变化时会列出来，但只说"已经过了多少天"，不替你判断期刊是不是忘了。阈值可调，因为数学期刊和 CS 会议的审稿周期差了几个数量级。
- **冲突保留双方。** 两台设备改了同一条记录，两个版本都会留下，由你选择；不按设备时钟谁晚谁赢。
- **删除可以恢复。** 删除只是移入回收站，不会连带删掉挂在它上面的随笔或日程。

## 当前状态

| 方面 | 状态 |
|---|---|
| 领域规则、读模型、错误分类 | ✅ 141 项测试通过 |
| 可选自托管同步（FastAPI） | ✅ 58 项后端测试；真实 HTTP 往返、冲突、删除、丢失确认重放通过 |
| macOS 桌面端（Tauri） | ✅ arm64 已编译并启动窗口；6 项原生 SQLite 测试覆盖重启持久化与事务回滚 |
| Windows 桌面端 | ⏳ 已配置 CI 编译检查，尚未编译通过 |
| 窗口内端到端操作、安装包、签名 | ⏳ 尚未验证 |
| 手机 | ⏳ 计划先做可安装的网页版，再视实际使用决定是否做原生 App |
| 附件、系统通知、端到端加密 | ❌ 未实现 |

详细的验证记录与已知限制见 [TEST_REPORT](docs/TEST_REPORT.md) 和 [KNOWN_LIMITATIONS](docs/KNOWN_LIMITATIONS.md)。

## 快速开始

### 浏览器预览

只需要 Node.js 22.12+：

```bash
npm ci
npm run dev
```

打开 `http://localhost:1420`。首次启动是空工作区，可以点"看看虚构示例"加载演示数据。浏览器版的数据存在 IndexedDB 里，清理站点数据会一并清除。

### 桌面端（macOS / Windows）

另外需要 [Rust](https://rustup.rs) 与 [Tauri 的系统前置环境](https://v2.tauri.app/start/prerequisites/)（macOS 为 Xcode Command Line Tools，Windows 为 Microsoft C++ Build Tools 与 WebView2）。

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # 首次安装 Rust
npm ci
npm run desktop:dev
```

首次编译需要几分钟。桌面端使用自己的 SQLite 数据库（macOS 位于 `~/Library/Application Support/app.scimemo.desktop/`），**与浏览器预览不是同一份数据**。

### 常用命令

```bash
npm run check          # TypeScript 类型检查 + 架构分层校验
npm test               # 领域、读模型、错误与存储故障测试
npm run build          # Web 生产构建
npm run check:native   # cargo check + 原生 SQLite 存储测试
npm run desktop:dev    # 启动桌面开发窗口
npm run desktop:build  # 当前平台的本地构建（未签名，不是正式发行版）
```

可选的同步服务需要 Python 3.13：

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
python -m pip install -r server/requirements-dev.txt
python -m pytest server/tests -q
```

启动服务、设置令牌、Docker 部署与备份恢复见 [快速开始](docs/QUICKSTART.md)。

## 仓库结构

```text
src/
├── core/        业务规则、读模型、错误分类、同步引擎、备份 —— 不依赖 React、Tauri 或 HTTP
├── platform/    IndexedDB / Tauri SQLite 驱动、HTTP 同步、外链
└── ui/          React 界面
src-tauri/       Windows / macOS 桌面壳；Rust + SQLite 原子提交
server/          可选的自托管同步服务（FastAPI + SQLite）
schemas/         同步边界的 JSON Schema
tests/           测试与虚构样例数据
design/          Logo、视觉系统、界面概念稿
docs/            架构、数据模型、协议、决策记录、验证报告
```

`core/` 不得依赖外层技术栈，这条规则由 `npm run check` 里的分层校验强制执行，不靠约定。

## 文档

- **从这里开始**：[架构蓝图](docs/ARCHITECTURE.md) → [数据模型](docs/DATA_MODEL.md) → [读模型](docs/READ_MODEL.md) → [错误与并发模型](docs/ERROR_AND_CONCURRENCY_MODEL.md)
- **为什么这样设计**：[架构决策记录（ADR）](docs/adr/README.md)——为什么用 Tauri、为什么不用 CRDT、为什么先不做原生手机端
- **产品取舍**：[科研流程评估](docs/RESEARCH_WORKFLOW_REVIEW.md)、[开发任务与验收](docs/ROADMAP.md)
- **工程规范**：[界面架构](docs/UI_ARCHITECTURE.md)、[迁移与版本化](docs/MIGRATION_AND_VERSIONING.md)、[测试策略](docs/TESTING_STRATEGY.md)、[平台能力矩阵](docs/PLATFORM_MATRIX.md)、[同步协议](docs/SYNC_PROTOCOL.md)

## 数据与隐私

- 不采集遥测，不加载远程字体或统计脚本，默认不联网。
- 同步完全可选，服务端由你自己部署；当前服务端能读取正文，**尚无端到端加密**。
- **同步不是备份**——同步也会传播删除。请定期用"导出完整 JSON"做备份。
- 安全问题的报告方式见 [SECURITY.md](SECURITY.md)。

## 参与贡献

欢迎提 Issue 和 PR，先读 [CONTRIBUTING.md](CONTRIBUTING.md)。几条硬规则：只使用虚构的测试数据；不要提交真实论文、审稿意见、数据库文件或令牌；改动数据模型时请同时更新类型、校验、Schema、服务端与测试（见 [迁移与版本化](docs/MIGRATION_AND_VERSIONING.md)）。

## English

**SciMemo** is a personal, local-first notebook for researchers juggling several manuscripts at once. It tracks where each paper was submitted, every review round and decision, and transfers to new venues—without overwriting history. It also keeps free-standing research ideas that don't yet belong to any project.

It is deliberately *not* a reference manager, a lab dashboard, or an AI writing tool. No account, server, or internet connection is required; optional sync runs on a server you host yourself.

The project is in early development (0.1.0-dev). The browser preview and the macOS desktop build run; Windows builds, signed installers, and mobile apps are not available yet. The UI is currently in Chinese.

## 许可证

[MIT](LICENSE) © 2026 SciMemo contributors
