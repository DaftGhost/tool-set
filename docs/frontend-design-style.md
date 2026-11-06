# 全局前端设计风格：鼠尾草绿分析工作台

`styles/theme.css` 是本项目设计风格的唯一来源。本文只说明主题变量的角色，以及页面对应的 Tailwind 工具类。调整颜色、字体、字号、间距、圆角、阴影或断点时，先改 `styles/theme.css`，再在同一次变更里更新本文。

默认调色板、默认字号、默认间距倍数、默认圆角、默认阴影、默认字距和默认断点都已从主题里清掉。新界面使用下面这些名字。`sm:`、`md:`、`lg:`、`xl:`、`2xl:` 以及它们的 `max-` 形式不会生成样式。

## 风格定位

整体气质是低饱和、安静、紧凑、重视数据阅读。`bg-canvas` 承托 `bg-surface` 面板，`bg-primary-deep` 的结果区域形成视觉重点。界面围绕选择、编辑、比较展开。

## 配色

| 角色 | 工具类 | 主题变量 |
|---|---|---|
| 页面背景 | `bg-canvas` | `color-canvas` |
| 面板 | `bg-surface` | `color-surface` |
| 内嵌底 | `bg-surface-alt` | `color-surface-alt` |
| 正文 | `text-ink` | `color-ink` |
| 次级文字 | `text-muted` | `color-muted` |
| 三级文字 | `text-quiet` | `color-quiet` |
| 主色 | `bg-primary` `text-primary` | `color-primary` |
| 深色强调 | `bg-primary-deep` | `color-primary-deep` |
| 浅绿底 | `bg-primary-soft` | `color-primary-soft` |
| 浅绿悬停 | `bg-primary-soft-hover` | `color-primary-soft-hover` |
| 弱正向边框 | `border-primary-muted` | `color-primary-muted` |
| 陶土，数据与危险按钮填充 | `bg-clay` `text-clay` | `color-clay` |
| 陶土悬停底 | `bg-clay-soft` | `color-clay-soft` |
| 黄铜，小面积提示 | `text-brass` | `color-brass` |
| 深底上的浅黄铜 | `text-brass-soft` | `color-brass-soft` |
| 面板边框 | `border-line` | `color-line` |
| 面板内分隔 | `border-line-soft` | `color-line-soft` |
| 提示文字 | `text-warn` | `color-warn` |
| 提示边框 | `border-warn-line` | `color-warn-line` |
| 提示底 | `bg-warn-bg` | `color-warn-bg` |
| 错误小字 | `text-danger` | `color-danger` |
| 危险悬停 | `bg-danger-deep` | `color-danger-deep` |
| 深底上的文字 | `text-on-deep` | `color-on-deep` |
| 深底上的次级文字 | `text-on-deep-muted` | `color-on-deep-muted` |
| 键盘焦点 | 基础层轮廓使用 `color-focus` | `color-focus` |

多方案对比只使用 `color-scenario-0`、`color-scenario-1`、`color-scenario-2`、`color-scenario-3`、`color-scenario-4`、`color-scenario-5`、`color-scenario-6`、`color-scenario-7`、`color-scenario-8`、`color-scenario-9`、`color-scenario-10`、`color-scenario-11`、`color-scenario-12`、`color-scenario-13`、`color-scenario-14`、`color-scenario-15`，按这个顺序取色。陶土和黄铜仍是语义强调，不替代这组数据色。

## 字体与字号

正文使用 `font-sans`，金额、参数和单位使用 `font-mono`。字族定义在 `styles/theme.css`。正文粗细是 `font-medium`，标题是 `font-bold`，字标是 `font-extrabold`，需要略轻的强调时用 `font-semibold`。

| 角色 | 工具类 | 主题变量 |
|---|---|---|
| 页面标题 | `text-display` | `text-display` |
| 窄屏页面标题 | `max-phone:text-display-phone` | `text-display-phone` |
| 单个关键数字 | `text-stat` | `text-stat` |
| 等宽金额 | `text-figure` | `text-figure` |
| 人名 | `text-name` | `text-name` |
| 深底引文 | `text-lead` | `text-lead` |
| 卡片与图表标题 | `text-title` | `text-title` |
| 区块标题 | `text-section` | `text-section` |
| 字标 | `text-brand` | `text-brand` |
| 小节标题 | `text-heading` | `text-heading` |
| 阅读正文 | `text-body` | `text-body` |
| 输入值与对话框 | `text-value` | `text-value` |
| 说明文字 | `text-ui` | `text-ui` |
| 控件标签 | `text-label` | `text-label` |
| 眉题与图表标注 | `text-meta` | `text-meta` |
| 徽章与脚注 | `text-micro` | `text-micro` |
| 加减等号等符号 | `text-symbol` | `text-symbol` |

字距只用 `tracking-display`、`tracking-brand`、`tracking-title`、`tracking-eyebrow`。上面的标题工具类已经带上对应字距和字重。

## 布局

页面内容用 `page-frame`，最大宽度是 `max-w-page`（`container-page`）。堆叠断点上更窄的内容框最大宽度是 `max-w-stack`（`container-stack`），上边距是 `pt-block-stack`（`spacing-block-stack`）。顶栏左右留白用 `page-inset`。工具卡片里的说明最多 `max-w-summary`（`container-summary`）。资料页的本机记录栏用 `container-aside`。

桌面规则不写断点前缀。`max-stack:`（`breakpoint-stack`）把主要区域改成单列。`max-phone:`（`breakpoint-phone`）把表单和卡片内边距再收成纵向。两个变体同时命中时，`max-phone:` 胜出。

间距是一组命名步长，而不是任意像素：

- `spacing-0`
- `spacing-1`
- `spacing-1.5`
- `spacing-2`
- `spacing-2.5`
- `spacing-3`
- `spacing-3.5`
- `spacing-4`
- `spacing-5`
- `spacing-panel`：面板内边距，例如 `p-panel`
- `spacing-gutter`、`spacing-gutter-stack`、`spacing-gutter-phone`：页面左右留白
- `spacing-section`：面板间距，例如 `gap-section`
- `spacing-block`：内容区上边距，例如 `pt-block`
- `spacing-block-stack`：堆叠断点上收窄的内容区上边距，例如 `pt-block-stack`
- `spacing-footer`：内容区下边距，例如 `pb-footer`
- `spacing-header`、`spacing-header-phone`：顶栏高度，例如 `min-h-header`
- `spacing-control`：按钮和输入高度，例如 `min-h-control`

## 形状与层次

| 角色 | 工具类 | 主题变量 |
|---|---|---|
| 面板 | `rounded-panel` `shadow-panel` | `radius-panel` `shadow-panel` |
| 面板内的区域 | `rounded-inset` | `radius-inset` |
| 按钮和输入 | `rounded-control` | `radius-control` |
| 小标签 | `rounded-badge` | `radius-badge` |
| 圆点和胶囊 | `rounded-full` | `radius-full` |
| 对话框 | `shadow-overlay` | `shadow-overlay` |
| 输入焦点光晕 | `shadow-focus` | `shadow-focus` |

面板用 `border-line`。选中状态用 `border-primary` 和 `bg-primary-soft`。深色结果区用 `bg-primary-deep`，文字用 `text-on-deep` 或 `text-on-deep-muted`。

## 交互

颜色和边框过渡使用 `transition-colors`。时长和缓动由 `default-transition-duration` 与 `default-transition-timing-function` 决定。减少动态效果时，`styles/base.css` 关掉滚动和过渡。键盘焦点使用 `color-focus`，不另做一套焦点环。

按钮文案直接说明动作。提示说明当前状态以及下一步。
