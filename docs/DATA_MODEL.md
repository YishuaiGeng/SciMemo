# 数据模型与不变量

唯一客户端类型入口：`src/core/types.ts`。客户端边界校验：`src/core/domain.ts`。服务端 JSON Schema：`schemas/document.schema.json`。

当前并未自动生成全部 TypeScript 与 Python 业务校验；两侧通过固定样例与契约测试保持一致。修改字段时必须同步更新类型、schema、校验与样例。新增格式版本需要迁移，不能直接修改旧格式含义。

改动模型前先读 [迁移与版本化](MIGRATION_AND_VERSIONING.md)（七种版本号的区别与必改文件清单）；派生视图规则见 [读模型](READ_MODEL.md)；聚合与事务边界见 [架构蓝图](ARCHITECTURE.md)。

## 1. 文档信封

| 字段 | 类型 | 含义 |
|---|---|---|
| id | UUID | 跨设备稳定 ID，不使用自增本地序号 |
| kind | paper/note/venue/deadline | 不可更改的实体类型 |
| data | 对应业务对象 | 强类型的业务数据 |
| createdAt | ISO 8601 带时区时间 | 不可更改的录入创建时间 |
| updatedAt | ISO 8601 带时区时间 | 本机编辑元信息，不用于决定同步胜负 |
| version | 非负整数 | 服务端已经确认的版本，离线编辑不自行递增 |
| deleted | boolean | 同步删除标记，仍保留内容以支持恢复 |

## 2. Paper

`title, summary, stage, nextAction, tags, archived, targets[], submissions[]`。

`targets[]` 保存 venueId、reason、priority。目标的具体信息在 Venue 中，某篇稿件为什么考虑它放在关联上。

`submissions[]` 每项保存 id、venueId、editionId、venueNameSnapshot、titleSnapshot、manuscriptNumber、submittedOn、events[]。

`events[]` 每项保存 id、status、occurredOn、recordedAt、note。提交与修回共用一条投稿中的事件历史。

状态：submitted / editorial / under_review / major_revision / minor_revision / resubmitted / accepted / rejected / withdrawn。

当前状态取事件数组最后一项；数组顺序是显式录入顺序。`occurredOn` 是发生日期，不擅自用于排序状态；补录旧日期不等于自动把事件插入旧位置。已结束投稿禁止追加普通状态；纠错／撤销历史事件的独立 UI 尚未实现，计划中必须加入原因与历史保留。

工作阶段：idea / experiments / writing / revising / paused / finished。它与投稿状态独立，不会在接收或拒稿时自动改动。

首版以整个 Paper 作为一个同步聚合：论文与嵌套事件一同提交。业务上区分三个类型，不代表存成三个独立 SQL 表。

## 3. Note

`title, body, noteType, paperIds[], tags[], pinned`。

noteType 为 idea / note / progress。仅正文必填；标题空时显示首行摘要。paperIds 可以为空。原文保存 Markdown，不渲染不受信任的 HTML。

## 4. Venue

`name, abbreviation, venueType, website, submissionUrl, notes, checkedOn, editions[]`。

venueType 为 journal / conference。editions[] 保存 id、label、year、website、notes。会议系列与具体年份分开，不能把某一届日期永久写在系列名称上。

当前表单可以追加届次；编辑／删除已有届次的专门 UI 未实现。新旧投稿通过快照保持稳定。

## 5. Deadline

`title, deadlineType, timing, paperId, venueId, editionId, sourceUrl, checkedOn, notes, completed`。

时间二选一：

```json
{"precision":"date","date":"2027-01-15"}
```

```json
{"precision":"instant","at":"2027-01-15T23:59:00-12:00","timezone":"Etc/GMT+12","original":"January 15, 23:59 AoE"}
```

日期示例均为虚构说明，不代表真实会议截稿。

instant 的 `at` 必须带 Z 或 UTC 偏移；timezone 使用 IANA 名称。导出时 at 是权威时间点，timezone 与 original 保留来源语义。当前输入校验确认时区名有效，但尚未检查偏移是否与该 IANA 时区在该日期完全一致；发布前需补一致性校验。日期级事件导出全天日程，DTEND 为第二天且排他。

## 6. 本地操作状态

Outbox 保存 opId、baseVersion、doc。同一文档未确认的多次修改合并为最新内容，保留原 baseVersion，每次新内容重新生成 opId。

Conflict 保存 id、local、remote、detectedAt、resolved。解决冲突后保留原双方副本，防止选择远端就永久丢失本地创新点。

Workspace 保存 schemaVersion、localRevision、docs、outbox、conflicts、cursor、serverId。

本地更新采取“载入 → 纯业务更新 → compare-and-swap 原子提交”。跨窗口版本不匹配时显式报错，不能静默覆盖。

## 7. 关联与约束边界

UUID 是弱引用，允许同步乱序期间暂时不存在。首版不进行破坏性的外键级联。删除论文不会自动删除独立笔记；删除期刊不会抹去投稿快照。

界面通过业务服务创建一致记录；服务端不把关联对象尚未下载等同于非法数据。设置页现提供 `core/references.ts` 派生的关联审计，区分已删除、暂不存在、类型不符和缺少届次，只提示、不自动级联删除或清理 ID。稿件详情可查看和预关联新建日程。关联查询不增加持久化字段或同步实体。

## 8. 二进制附件后续设计，不在当前实现中

建议单独 Attachment 元数据（hash、size、mime、originalName、ownerRef）与内容寻址文件目录。下载使用临时文件 + 校验 hash + 原子改名；先上传文件成功，再暴露引用；限制大小和类型。不把文件 base64 塞进 Paper 或随笔正文，避免每次投稿状态变化都同步整份 PDF。
