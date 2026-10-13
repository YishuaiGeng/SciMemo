# 界面架构

版本：0.1 · 2026-10-14

配套 [架构蓝图](ARCHITECTURE.md) §1、[读模型](READ_MODEL.md)、[完整开发框架](DEVELOPMENT_FRAMEWORK.md) §8。本文定义 UI 层的结构、状态归属与组件约定。

## 1. 现状

`App.tsx` 是 48 行但**单行极长**的组件，承担了路由、四个页面渲染、搜索、统计、编辑器调度、提示管理。`renderMain()` 用 `if/return` 链区分页面，`page === 'deadline'` 一节内联了排序、过期判定、时区格式化。

这类组件的问题不是"能跑不能跑"，而是：

1. **无法单独测试任何视图**——没有 `PaperList`、`AgendaView` 这样的单元，测试只能端到端。
2. **派生逻辑混进渲染**（`deadlines.filter(...).sort(...)` 在 JSX 里），与 [读模型](READ_MODEL.md) 重复。
3. **状态归属不清**：`filter` 被稿件页和日程页复用（值语义不同：`'active'/'archived'` vs `'active'/'done'`），切换页面时靠手动重置掩盖。
4. 页面新增时该文件线性膨胀。

## 2. 目录结构 **[计划]**

```text
src/ui/
├── app/
│   ├── App.tsx              应用壳：布局、导航、全局提示
│   ├── routes.ts            路由表（见 §3）
│   └── ErrorBoundary.tsx    渲染错误边界
├── views/
│   ├── PapersView.tsx
│   ├── PaperDetailView.tsx
│   ├── NotesView.tsx
│   ├── VenuesView.tsx
│   ├── AgendaView.tsx       ← 新的"近期日程"（原 DeadlinesView）
│   ├── TimelineView.tsx     [计划] 稿件时间轴
│   ├── SettingsView.tsx
│   └── SearchView.tsx
├── components/
│   ├── primitives/          按钮、输入、徽标、卡片、对话框
│   ├── patterns/            PageHeading、EmptyState、Notice、MetricRow
│   └── fields/              领域字段：日期精度选择、状态选择、关联选择
├── hooks/
│   ├── useWorkspace.ts      工作区订阅
│   ├── useCommand.ts        业务命令调用 + 错误分类
│   └── useDraft.ts          表单草稿保护
└── styles/
    ├── tokens.css           设计令牌（见 §7）
    ├── base.css
    └── components/*.css
```

## 3. 路由

现状是 `useState<Page>` + `selected` 手写。**建议保持轻量，但不建议继续用裸 state**：需要"返回上一步"、"刷新后回到原位置"、"深链接到某篇稿件"。

方案取舍：

| 方案 | 评价 |
|---|---|
| 裸 `useState`（现状） | 无 URL，刷新丢位置，无法从日程跳到稿件后"返回" |
| React Router | 成熟，但为一个本地单窗口应用引入路由库偏重 |
| Hash 路由 + 自有 `useRoute` **[建议]** | 约 60 行，`#/papers`、`#/papers/:id`、`#/agenda`，可书签、可回退、可在 Tauri 与浏览器行为一致 |

无论哪种，路由状态**必须与业务数据分离**。不要在路由里存 `Doc` 对象，只存 ID。

## 4. 状态归属

这是最容易失控的部分。四类状态，各自的归属明确：

| 类别 | 例子 | 归属 | 持久化 |
|---|---|---|---|
| **业务数据** | `Workspace` | 单一来源：`useWorkspace` 从 service 加载 | 由 Driver 落盘 |
| **路由状态** | 当前页、选中的稿件 ID | 路由 hook | 可选进 URL |
| **视图状态** | 筛选、排序、展开的卡片、搜索词 | **各视图自身**，不提升到 App | 否 |
| **表单草稿** | 编辑器里未提交的输入 | 编辑器组件自身 + `useDraft` | **[计划]** 本机草稿存储，不进 outbox |

规则：

1. **视图状态不许跨视图共享**。当前 `filter` 被两个页面共用是反例——拆成 `PapersView` 与 `AgendaView` 各自的 `useState`。
2. **业务数据的唯一副本在 `useWorkspace`**。视图不得 `structuredClone` 一份自己改，要改就调业务命令。
3. **不用全局状态库**。没有跨视图共享需求，`useState` + Context 足够。引入 Redux/Zustand 属过度设计。
4. **每次命令后必须刷新**。现有 `run()` 的模式（执行 → `refresh()` → 更新 `ws`）是对的，保持。

## 5. 组件约定

### 5.1 展示与逻辑分离

视图组件**只做两件事**：调用读模型拿数据、渲染。不许在 JSX 里做 `filter`/`sort`/`find`/日期计算。

反例（当前 `AgendaView` 的实际写法）：

```tsx
deadlines.filter(d => d.data.completed === (filter === 'done')).sort((a, b) => { ... })
```

正确：

```tsx
const items = useMemo(() => agenda(ws, readContext), [ws, readContext]);
```

### 5.2 领域字段组件

日期精度、投稿状态、工作阶段这些**有语义差别**的输入，必须封装成组件，不允许各处手写 `<select>`。原因：`precision:'date'` 与 `instant` 是两种完全不同的表达，界面上必须给出明确区别（[完整开发框架](DEVELOPMENT_FRAMEWORK.md) §5.4）。

`components/fields/` 至少要有：`TimingField`、`StageField`、`StatusField`、`VenuePicker`、`PaperPicker`、`TagInput`。

### 5.3 空状态与提示

统一用 `EmptyState` / `Notice` 组件（现有 `components.tsx` 已有雏形）。空状态文案应引导而非指责，并提供下一步动作按钮。

## 6. 表单与草稿

现状：`RecordEditor` 是一个受控表单，关闭时有放弃确认。

**[计划] 草稿保护**（`SM-005`）。设计约束：

1. **草稿不是业务记录**，不进 `docs`、不进 outbox、不参与同步。存到独立的本地草稿区（IndexedDB/SQLite 另一 key）。
2. **草稿必须能区分"新记录草稿"与"编辑已有记录草稿"**，后者存 `docId` + 编辑前的 `updatedAt`，恢复时若发现记录已被改过，提示而非覆盖。
3. **草稿保存不得阻塞输入**，节流写入（建议 1–2 秒防抖）。
4. **提交成功后必须清除对应草稿**，否则会恢复出已保存的旧内容。
5. 崩溃/刷新后**由用户确认是否恢复**，不自动弹回编辑态。

## 7. 设计令牌

现状：`styles.css` 单文件 16KB，`:root` 定义了 12 个变量，但**大量颜色值在规则里硬编码**（如 `#243932` 之外的若干十六进制、`--radius` 与多处 `border-radius:8px/10px/14px` 并存）。

**[计划]** 拆成 `tokens.css` + 组件样式，令牌分三类：

```css
:root {
  /* 语义色 —— 只允许引用这些，不允许在组件里写十六进制 */
  --bg-app; --bg-surface; --bg-elevated;
  --text-primary; --text-secondary; --text-muted;
  --border-subtle; --border-strong;
  --accent; --accent-soft; --on-accent;
  --tone-neutral; --tone-amber; --tone-green; --tone-danger;

  /* 尺度 */
  --space-1 .. --space-8;
  --radius-sm / -md / -lg / -full;
  --font-sans; --text-xs .. --text-2xl; --leading-tight/normal;

  /* 层级与动效 */
  --shadow-1 / -2 / -3;
  --duration-fast / -base; --ease-standard;
}
```

现有 `border-radius` 有 4/5/6/7/8/9/10/12/14/16/18px 十一种取值，需收敛到 3–4 档。这不是审美洁癖：不规则圆角是多处独立手写样式的结果，后续改视觉会漏改。

**浅色/深色 [计划]**：令牌是支持主题切换的前提。当前只有浅色。深色不是装饰需求——科研用户长时间读屏幕。实现方式为 `prefers-color-scheme` + 显式覆盖开关，**不得**要求用户重启应用。

## 8. 可访问性基线

目标不是通过审计，而是键盘可用。最低要求：

1. **所有交互元素可 Tab 到达**，顺序符合视觉顺序。当前大量使用 `<button>`（好），但卡片内嵌按钮的 Tab 顺序需实测。
2. **对话框必须焦点陷阱 + Esc 关闭 + 关闭后焦点归还**。原生 `<dialog>` 已提供大部分行为（现有代码用了，保持），不要换成自绘 div。
3. **图标按钮必须有 `aria-label`**（现有代码已有，保持）。
4. **[计划]** 侧边栏的 `▤ ✧ ▦ ◷ ⚙` 是 Unicode 符号，Windows 上字形不一致甚至缺字。换成图标组件，并统一提供可读名称。
5. **色彩对比**：正文与背景达到 WCAG AA（4.5:1）。`--text-muted` 在浅色下需实测。
6. **`prefers-reduced-motion`**：所有过渡在用户要求时关闭。
7. **焦点可见**：不得 `outline:none` 而无替代。

## 9. 国际化 **[计划]**

现状：所有文案硬编码在 TSX 中，含中文标点与全角符号（`＋`、`→`、`·`）。

开源项目的现实：英文用户会提 issue，而**事后抽取文案的成本远高于一开始集中管理**。

建议（不要求立即实现功能，只要求**结构上准备好**）：

1. 建立 `src/ui/i18n/zh-CN.ts`，把所有面向用户的字符串集中。**即使暂时只有一种语言**，也让文案可被集中替换。
2. 领域层（`core/`）**不得包含面向用户的措辞**——现状 `domain.ts` 里大量中文错误消息违反此条。改为抛 `ErrorCode`，由 UI 层映射文案。这与 [错误与并发模型](ERROR_AND_CONCURRENCY_MODEL.md) §2 是同一件事的两面。
3. 日期与数字格式化统一走 `Intl`，不手写 `padStart`。
4. **不引入 i18n 库直到真有第二种语言**，避免为想象中的需求增加依赖。

## 10. 测试

| 层级 | 方式 | 现状 |
|---|---|---|
| 读模型 | Node test，纯函数 | 见 [读模型](READ_MODEL.md) §9 |
| 业务命令 | Node test + MemoryDriver | 已有 |
| 视图组件 | **[计划]** 需要引入 DOM 测试环境 | 无 |
| 端到端 | **[计划]** `SM-003` 关键路径 | 无 |
| 可访问性 | **[计划]** 自动化扫描 + 手动键盘走查 | 无 |

`package.json` 目前没有任何 DOM 测试依赖。引入测试库是一个**正式决策**，需写入 [ADR](adr/README.md)，因为它影响构建与 CI 时间。

## 11. 视觉方向（Apple 风格）的架构约束

风格是设计问题，但有**三条架构约束**必须先确定，否则会做成跨平台不一致：

1. **字体许可证**：不得打包 SF Pro（苹果字体许可仅限 Apple 平台上的 Apple 平台软件）。开源分发需使用可嵌入字体（如 Inter，SIL OFL）或系统字体栈。**这决定 `--font-sans` 的值**，属架构决策。
2. **毛玻璃降级**：`backdrop-filter` 在 Windows 上可能退化为不透明。令牌需提供"支持 / 不支持"两套表面色，而不是指望同一效果跨平台一致。
3. **原生窗口装饰**：macOS 的 `titleBarStyle: Overlay` 与 Windows 的自绘标题栏是不同实现路径。若采用自绘，**必须**处理窗口拖动（`data-tauri-drag-region`），否则窗口拖不动。属 UI 架构而非纯样式。

已确认可用的组件库与许可证见 [ADR-0004](adr/0004-headless-ui-primitives.md)。
