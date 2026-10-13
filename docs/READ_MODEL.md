# 派生读模型（Read Model）

版本：0.1 · 2026-10-14

配套 [架构蓝图](ARCHITECTURE.md) §1 与 [数据模型](DATA_MODEL.md)。本文定义的函数属 L2（`core/read/`）：**纯函数、无副作用、只读、不新增持久化字段、不参与同步**。

## 1. 为什么单独成文

现有四个模块都是**记录类型**：稿件、随笔、期刊会议、日程。缺的是**按时间的查看层**——用户每天打开软件，真正想问的是"现在该我做什么"，而不是"我记过什么"。

这层不能靠新增字段或新聚合实现，否则：日程状态会与真实状态漂移、同步冲突面变大、迁移成本上升。正确做法是**每次从 `Workspace` 纯计算**。代价是运行时要算，收益是永不与事实脱节。

命名约定：`core/read/*.ts` 导出 `xxxView(ws, options, ctx)`，接收工作区，返回**新对象**，绝不修改入参。

## 2. 统一时间基准

所有"是否过期"的判断依赖"今天是哪天"。规则：

```ts
interface ReadContext {
  today: string;        // 本机日期 YYYY-MM-DD，由 UI 传入
  nowIso: string;       // 用于 instant 精度比较
}
```

- **必须由调用方传入**，读模型内不得调用 `new Date()`。否则测试无法固定时间，且"跨零点"行为不可断言。
- `today` 是本机日历日。**这是展示语义，不是同步语义**：不得用它参与任何版本比较。
- `precision:'date'` 的条目**只有日期**。判定"过期"时，当天不算过期（当天仍可提交），`date < today` 才算。
- `precision:'instant'` 的条目按绝对时间点比较，与设备时区无关。

## 3. Agenda（近期日程）

```ts
type AgendaBucket = 'overdue' | 'today' | 'next7' | 'next30' | 'later';

interface AgendaItem {
  doc: Doc<'deadline'>;
  bucket: AgendaBucket;
  dueOn: string | null;        // 展示用日期；instant 转成本机日历日
  paperTitle: string | null;   // 关联稿件题名，解决"这条日程属于哪篇"的问题
  venueName: string | null;
  danglingRef: boolean;        // 关联已删除/缺失，来自 references.ts
}

function agenda(ws: Workspace, ctx: ReadContext): AgendaItem[];
```

规则：

1. **只包含未完成条目**（`completed === false`）。已完成的仍在"近期日程"页可查，但不进 Agenda。
2. 排序：`overdue` → `today` → `next7` → `next30` → `later`；同桶内按 `dueOn` 升序，`null` 排在桶末。
3. **`dueOn` 为 `null` 的情况**：`precision:'date'` 且 `date` 为空在 schema 下不允许，但 `instant` 与导入数据仍需防御。无法排序的条目归入 `later` 并在 UI 单独标注"[日期待确认]"，**不得用今天填充**。
4. `danglingRef` 直接复用 `auditReferences` 的结果，不重复实现。
5. **`paperTitle` 与 `venueName` 由读模型解析**，不让每个页面自己查 `ws.docs`。这是当前多个页面的重复逻辑。

## 4. Stalled（长期无状态变化）—— 本层最有价值的视图

投稿后最容易被遗忘的状态：期刊三周没有回音。系统不做任何自动结论，只**提示经过的时间**，由研究者判断是否催促。

```ts
interface StalledItem {
  paper: Doc<'paper'>;
  submissionId: string;
  venueNameSnapshot: string;
  lastChangeOn: string | null;    // 末条事件的 occurredOn ?? recordedAt
  daysSinceChange: number | null; // 无法计算时为 null
  manuscriptNumber: string;
  hasUpcomingDeadline: boolean;   // 已排跟进日程则不再重复催促
}

function stalled(ws: Workspace, opts: { quietDays: number }, ctx: ReadContext): StalledItem[];
```

规则：

1. **只针对活跃投稿**（末条事件状态不是终态）。
2. `daysSinceChange` 用**末条事件的发生日期**，其次录入时间。它表示"已知事实以来的静默时长"。
3. **没有末条日期时返回 `null`，不猜**。UI 显示"无日期记录"，不要显示 0 天。
4. `hasUpcomingDeadline` 为真时不进催促列表——用户已经安排过跟进了。
5. **默认阈值建议 21 天，且必须可由用户在设置中调整**。不同学科审稿周期差异极大（数学半年是常态，CS 会议两周出结果），写死阈值等于给用户错误建议。
6. **文案禁止推断期刊意图**。可以说"距上次状态变化 34 天"，不能说"该催稿了"或"可能被遗忘"。终态稿件的静默不是问题。

## 5. Timeline（稿件时间轴）

```ts
interface TimelineEntry {
  id: string;
  kind: 'created' | 'submission' | 'event' | 'candidate' | 'deadline';
  on: string | null;          // 发生日期；未知为 null
  at: string;                 // 录入时间，用于同日期排序
  status?: SubmissionStatus;
  label: string;              // 已本地化的展示文案
  submissionId?: string;
}

function timeline(paper: Doc<'paper'>, deadlineDocs: Doc<'deadline'>[], ctx: ReadContext): TimelineEntry[];
```

规则：

1. **按 `recordedAt` 排序，不按 `occurredOn`**。理由与 `currentStatus` 一致（[数据模型](DATA_MODEL.md) §2）：录入顺序是显式事实，补录旧日期不应让事件在时间轴上跳位。UI 上**同时展示两个日期**并区分标注"发生于 / 记录于"。
2. `candidate` 目标（`targets[]`）进入时间轴，但必须显示为"考虑过"，**不得与真实投稿混淆**。
3. 未知日期条目不参与日期轴定位，收在末尾时间轴之外，标注"日期未知"。
4. 转投产生新 `submission` 条目，旧条目保留——时间轴天然体现"拒稿 → 转投"的叙事。

## 6. Search（检索）

现状：`searchDocs` 用 `JSON.stringify(d.data).toLowerCase().includes(q)`。可接受的起点，但有几个已知问题需要写成设计约束：

```ts
function search(ws: Workspace, query: string, opts?: { kinds?: Kind[] }): Doc[];
```

规则：

1. **`JSON.stringify` 会把字段名一起搜到**。当前搜 "title" 会命中所有稿件。**缺陷，需修**：应只拼接**值**，不拼键。
2. **大小写与 Locale**：`toLocaleLowerCase()` 依赖运行环境 locale，跨平台可能不一致。中文无影响，但拉丁文有。应采用固定策略（建议 `toLowerCase()` + 可选 `Intl.Collator` 做排序，不做匹配）。
3. **不做模糊匹配的承诺**。不要宣称"智能搜索"——没有 FTS、没有分词。中文子串匹配是有效的，拼音首字母、错字容错都**未实现**。
4. **[计划]** 数据量达到 `SM-008` 基线后，若搜索成为瓶颈，再考虑索引。届时**不得**把索引变成持久化同步字段——索引必须可从 `docs` 重建。
5. 已删除文档默认排除；`deleted:true` 只在回收站视图检索。

## 7. 统计指标（首页数字）

现状：`App.tsx` 里内联计算 `active.length` / `underReview` / `revisions`。应移入读模型：

```ts
function paperStats(ws: Workspace): { active: number; underReview: number; awaitingRevision: number; archived: number; };
```

规则：

1. **不使用百分比完成度**（[完整开发框架](DEVELOPMENT_FRAMEWORK.md) §8 已定）。
2. `underReview` 的判定与 `revisions` 的判定必须**共用同一个状态分组常量**，不要在 UI 里硬编码字符串数组。当前 `App.tsx` 里 `['submitted','editorial','under_review','resubmitted']` 是硬编码的，会与 `domain.ts` 漂移。
3. 全部计数**只统计未删除记录**，且 `note`/`venue`/`deadline` 不能混进稿件计数。当前页脚 `Object.values(ws.docs).filter(d=>!d.deleted).length` 把全部类型混在一起显示，对用户没有意义，**缺陷**。

## 8. 缓存与失效 **[计划]**

当前数据量下**不需要缓存**。若将来需要：

- 缓存键必须包含 `localRevision`，它不是文档内容的一部分但与每次提交同步递增。
- **只缓存读模型输出，绝不缓存派生为可写状态**。
- 缓存失效必须由 `localRevision` 变化驱动，不得用时间过期，否则会出现"改了但没刷新"的幽灵状态。

## 9. 测试要求

读模型是纯函数，**必须是测试覆盖率最高的一层**。每个函数至少覆盖：

| 场景 | 断言 |
|---|---|
| 空工作区 | 返回空数组，不抛错 |
| 关联对象已删除 | `danglingRef` / `paperTitle` 为 null，不抛错，不级联删除 |
| 未知日期 | 排序不崩、不使用今天伪造、单独归桶 |
| 跨日边界 | `date === today` 不算过期；`today` 传入固定值 |
| 终态投稿 | 不进 `stalled`；`timeline` 完整保留全部事件 |
| 转投 | 两个 submission 都出现在 timeline，旧目标名保留 |
| 补录旧日期 | 排序按 recordedAt，当前状态不倒退 |
| 时区 | `instant` 转本机日历日的边界（23:59 / 00:00 / 跨 DST） |

这些用例属 `tests/` 的跨语言共享样例范畴时，需同时更新 `tests/fixtures/`，保持 [数据模型](DATA_MODEL.md) 要求的双端一致。
