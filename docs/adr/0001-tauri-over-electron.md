# ADR-0001：用 Tauri 而非 Electron 作为桌面壳

- 状态：已接受
- 日期：2026-10-13
- 相关：[平台能力矩阵](../PLATFORM_MATRIX.md)、[完整开发框架](../DEVELOPMENT_FRAMEWORK.md) §2

## 背景

需要 Windows 与 macOS 的可安装应用。核心业务逻辑已用 TypeScript 写在 `src/core`，与 UI 解耦，因此外壳的更换成本主要集中在**原生能力边界**：本地 SQLite、文件导出、系统通知。

`src-tauri/` 已有 Rust 存储层（`storage.rs`、`001_workspace.sql`），使用 `rusqlite` 的 `bundled` feature。

## 决策

使用 Tauri 2。前端 React 19 + Vite 8，原生层 Rust + rusqlite + SQLite，通过 `invoke` 暴露固定命令。

## 后果

**正面**

- 安装体积比 Electron 小一个数量级，对"个人手账"的分发门槛更友好。
- Rust 侧可直接控制事务语义，CAS 提交在 `.integration-build` 之外有真正的实现落点。
- 复用同一套前端代码同时支持桌面与移动目标，不需要第二套 UI。

**负面**

- 需要 Rust 工具链才能构建；`KNOWN_LIMITATIONS` #2 记录 Rust 至今**从未编译过**，这是当前最大的未验证项。
- 生态比 Electron 小，遇到原生问题时社区答案更少。
- 每个原生能力（对话框、通知、打开外链）都要显式加插件**并在 `capabilities/` 里授权**，配置错误表现为运行时权限失败，不是编译错误。
- 移动端需要各自的原生工具链（Android SDK/NDK、Xcode），未初始化（无 `src-tauri/gen/`）。

## 被否掉的方案

- **Electron**：体积与内存开销对一个笔记本应用过重；会让"下载即用"的体验变差。
- **纯 Web + 用户自建服务**：丧失离线原生存储，与"本地优先"的核心承诺冲突。
- **原生 Swift/SwiftUI + WPF 各写一套**：维护成本 ×2，且业务逻辑要重写，违反"领域核心与平台解耦"。

## 重新考虑的条件

- Rust 工具链在 CI 上无法稳定构建，且连续两次尝试失败。
- 需要的原生能力在 Tauri 生态中确实不可得（例如需要深度集成系统日历/邮件）。
- 移动端真机问题（WebView 差异、存储被清理）在 Tauri 移动目标上无解，而纯原生能解决。
