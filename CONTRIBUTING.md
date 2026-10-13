# Contributing

先阅读 AGENTS.md、docs/DEVELOPMENT_FRAMEWORK.md 与已知限制。功能修改应先描述用户场景，再实现最小闭环。

分支建议：`feat/notes-draft`、`fix/sync-lost-ack`、`docs/windows-setup`。提交可使用 `feat:`、`fix:`、`test:`、`docs:`。

PR 应说明改变的行为、数据兼容性、实际运行的测试，以及仍未验证的平台。新增字段必须更新 schema 与样例；影响存储格式必须附迁移与恢复说明。

请使用虚构数据，不要把自己的投稿邮件、审稿意见、个人数据库或令牌附到公开 Issue。

首次联网安装后提交真实 package-lock.json；原生依赖解析后提交 Cargo.lock。正式发布前复核依赖许可证与安全公告。
