# UI 风格设计规范

> 目标：为全项目（启动屏 / 编辑 / 游玩 / 展示 / 骨骼动画四套模式及全部面板、HUD 覆盖层）建立**统一、可维护**的日式西幻视觉语言。黑、红、橙为主，蓝、紫为辅，突出金属、锈迹、尘土质感。
> 本规范是**唯一真相源**：新增或改造任何 UI 前必须先读本文件；实现细节见 [`css_style_guide.md`](css_style_guide.md)。

## 1. 风格定位

- 基调：日式西幻黑暗幻想（《剑风传奇》《艾尔登法环》《黑暗之魂》）。
- 关键词：暖黑底色、血红与余烬橙的紧迫感、旧金与锈铁的衰败金属感、羊皮纸般的枯黄文字、克制的装饰。
- **装饰强度：克制**。只用描边、阴影、渐变表达质感；**不使用**噪点纹理、四角括号、暗角遮罩。
- 视觉优先级：可读性 > 氛围。任何装饰不得降低文字对比度或交互可辨识度。

## 2. 设计令牌

全部令牌以 CSS 变量定义在 [`src/assets/theme.css`](../../src/assets/theme.css) 的 `:root`，前缀 `--dc-`（dark fantasy）。**禁止在组件内硬编码十六进制颜色**，一律引用令牌。

### 2.1 底色（暖黑）

| 令牌 | 值 | 用途 |
|------|----|------|
| `--dc-bg-0` | `#0c0a09` | 应用 / 全屏遮罩底 |
| `--dc-bg-1` | `#14110d` | 深层面板底 |
| `--dc-bg-2` | `#1b1712` | 标准面板表面 |
| `--dc-bg-3` | `#241f19` | 输入框 / 浮起元素 |
| `--dc-overlay` | `rgba(6,5,4,.78)` | 模态遮罩 |

### 2.2 金属 / 边框 / 锈

| 令牌 | 值 | 用途 |
|------|----|------|
| `--dc-border` | `#463d33` | 主描边 |
| `--dc-border-strong` | `#6a5c48` | 悬停 / 强调描边 |
| `--dc-hairline` | `rgba(201,162,75,.22)` | 内层金细线 |
| `--dc-rust` | `#6e4a2e` | 锈迹点缀 |

### 2.3 主强调（黑红橙）

| 令牌 | 值 | 用途 |
|------|----|------|
| `--dc-red` | `#8f1f1f` | 主操作按钮底 / 危险主色 |
| `--dc-red-bright` | `#b52a2a` | 悬停 / 激活 |
| `--dc-orange` | `#c9761f` | 余烬强调 |
| `--dc-orange-bright` | `#e0902f` | 高亮 / 进度 |
| `--dc-gold` | `#c9a24b` | 标题、聚焦环、关键数值 |
| `--dc-gold-bright` | `#e0c078` | 金文字高亮 |

### 2.4 辅强调（蓝 / 紫）

| 令牌 | 值 | 用途 |
|------|----|------|
| `--dc-blue` | `#3f5f93` | 信息 / 冷色系（冷却就绪、水系） |
| `--dc-purple` | `#6b3f96` | 魔法 / 秘法（仅法系与次要态） |

### 2.5 文字

| 令牌 | 值 | 用途 |
|------|----|------|
| `--dc-text` | `#e8dfce` | 正文（羊皮纸） |
| `--dc-text-dim` | `#a89e8e` | 次要文字 |
| `--dc-text-mute` | `#6d6558` | 弱化文字 / 禁用说明 |
| `--dc-text-disabled` | `#4d463c` | 禁用态文字 |

### 2.6 语义色

| 令牌 | 值 | 用途 |
|------|----|------|
| `--dc-success` | `#5a7d4a` | 成功 / 恢复 |
| `--dc-warning` | `#d9a441` | 警告 |
| `--dc-danger` | `#b03030` | 错误 / 伤害 / 删除 |
| `--dc-info` | `#3f5f93` | 提示 / 中性信息 |

### 2.7 形态 / 效果

| 令牌 | 值 | 用途 |
|------|----|------|
| `--dc-radius-sm` | `2px` | 小控件 |
| `--dc-radius` | `3px` | 标准控件 / 面板 |
| `--dc-radius-lg` | `4px` | 大面板 |
| `--dc-shadow-panel` | `0 6px 24px rgba(0,0,0,.6)` | 面板投影 |
| `--dc-shadow-soft` | `0 2px 8px rgba(0,0,0,.45)` | 控件投影 |
| `--dc-inset` | `inset 0 0 24px rgba(0,0,0,.5)` | 面板内阴影 |
| `--dc-glow-ember` | `rgba(201,118,31,.55)` | 悬停余烬光 |
| `--dc-transition` | `140ms ease` | 统一过渡 |

## 3. 排版

字体一律走令牌，禁止在组件内写字体栈：

| 令牌 | 栈 | 用途 |
|------|----|------|
| `--dc-font-display` | `Georgia,'Times New Roman','Songti SC',serif` | 标题、面板名、大数值 |
| `--dc-font-body` | `system-ui,'Microsoft YaHei','PingFang SC',sans-serif` | 正文、按钮、标签 |
| `--dc-font-mono` | `'Cascadia Mono',Consolas,'Courier New',monospace` | 数据、计时、坐标、调试 |

- 字号阶（`--dc-fs-*`）：`10 / 11 / 12 / 13 / 14 / 16 / 20 / 28` px。默认正文 `13px`。
- 标题用 `--dc-font-display` + `--dc-gold`（或 `--dc-red-bright` 表示危险语境），字距略放宽。
- 等宽字体仅用于**数值与机器数据**，不用于普通文案。

## 4. 间距与布局

- 一切间距对齐 **4px 基准网格**：`--dc-space-1..6` = `4 / 8 / 12 / 16 / 20 / 24`。
- 标准面板内边距 `--dc-space-4` 上下、`--dc-space-4` 左右；面板间距 `--dc-space-3`。
- 行内控件间距 `--dc-space-2`；区块上下分隔 `--dc-space-3`。
- 面板圆角统一 `--dc-radius-lg`；内部控件统一 `--dc-radius`。

## 5. 表面与装饰（克制）

- **面板**：`--dc-bg-2` 半透明底（叠 `--dc-overlay` 级遮罩感）+ 1px `--dc-border` 外描边 + 1px `--dc-hairline` 内金细线（`box-shadow` inset 模拟）+ `--dc-inset` 内阴影。
- **分隔线**：1px `--dc-border`，或内细线；不使用花纹/角花。
- **浮起元素**（下拉、弹窗、提示）：加深底色 + `--dc-shadow-panel`。
- **禁止**：噪点纹理、四角括号、暗角遮罩、图片贴图背景。渐变仅用于按钮/进度条等局部层次。

## 6. 组件形态

组件类定义见 `theme.css`，命名 `dc-*`，语义与用法见 [`css_style_guide.md`](css_style_guide.md) 第 5 节。

- **按钮** `.dc-btn`
  - 默认：`--dc-bg-3` 底、`--dc-border` 描边、`--dc-text` 文字；悬停亮一档底色 + `--dc-border-strong` + 余烬微光。
  - 主操作 `.dc-btn--primary`：`--dc-red` 底 → 悬停 `--dc-red-bright`。
  - 危险 `.dc-btn--danger`：血红描边/文字，悬停填充。
  - 幽灵 `.dc-btn--ghost`：透明底，仅描边/文字。
  - 激活 `.dc-btn--active` / `.is-active`：`--dc-orange` 底或橙描边 + 金文字。
  - 禁用 `:disabled`：`--dc-text-disabled` + 降透明度，无悬停效果。
- **输入** `.dc-input` / **下拉** `.dc-select`：`--dc-bg-3` 底、`--dc-border` 描边，聚焦时 `--dc-gold` 描边 + 微光。
- **勾选** `.dc-check`：方形、金色选中。
- **徽章** `.dc-badge`（`--info/--warn/--danger`）：小字号、描边式，用于状态标签。
- **列表行** `.dc-row`：悬停 `--dc-bg-3`，选中态橙描边 + `--dc-hairline`。
- **进度条** `.dc-bar` / `.dc-bar__fill`：槽 `--dc-bg-3`，填充按语义取色（血量红、耐力黄/绿、冷却蓝就绪）。
- **标题** `.dc-panel__title`：`--dc-font-display` + `--dc-gold` + 下细线。
- **聚焦环**：全局 `:focus-visible` 用 `--dc-gold` 2px 描边（或 `outline`），保证键盘可达。

## 7. 图标系统

- **统一使用 SVG**，禁止 Unicode 符号 / emoji / 字符画作为图标。
- 由 agent 生成，集中在 `src/ui/icons/sprite.ts` 的 `<symbol id="dc-icon-*">`，运行时注入；引用经 `src/ui/icons/icon.ts` 的 `createIcon(name, opts)`。
- 规格：`viewBox="0 0 24 24"`（小尺寸可用 20），`fill="none"` + `stroke="currentColor"`、`stroke-width="1.5"`、`stroke-linecap/linejoin="round"`；颜色继承 `currentColor`（默认 `--dc-text-dim`，强调时由父级设 `--dc-gold`/`--dc-orange`）。
- 尺寸令牌：`--dc-icon-sm 14px` / `--dc-icon 18px` / `--dc-icon-lg 24px`。
- 图标目录（命名 `dc-icon-<name>`）：

| 分类 | 图标名 |
|------|--------|
| 通用操作 | `close` `plus` `minus` `trash` `check` `refresh` `undo` `redo` `save` `import` `export` |
| 导航 | `chevron-down` `chevron-right` `chevron-left` `arrow-up` |
| 状态 | `warning` `info` `lock` `unlock` `eye` `eye-off` |
| 播放控制 | `play` `pause` `step` |
| 玩法 | `settings` `map-pin` `backpack` `armor` `sword` `bow` `crosshair` `heart` `bolt` `flame` `brush` `drag` |
| 装饰（仅标题角落，非必需） | `rune` `flourish` |

- 新增图标：在 `sprite.ts` 追加 `<symbol>` 并登记到目录表；不得内联到业务组件。

## 8. 滚动条

- 全局滚动条经 CSS 变量统一，颜色与主题一致（见 `theme.css`）：轨道 `--dc-bg-1`、滑块 `--dc-border`、悬停 `--dc-border-strong`、拖拽 `--dc-gold`。
- 所有**功能滚动容器**（列表、面板内容、时间轴等）必须 `scrollbar-gutter: stable`，避免出现/消失滚动条导致布局抖动；统一使用 `.dc-scroll` 工具类或等价令牌。
- 禁止用 `overflow: hidden` 变相裁切需要滚动的内容。

## 9. HUD 覆盖层

游戏内 HUD 与面板共用同一套令牌与组件：

- **血条 / 耐力 / 蓄力条**：槽 `--dc-bg-3` + `--dc-border`，填充按语义（血 `--dc-danger`→低血量闪烁、耐力 `--dc-warning`、蓄力 `--dc-orange-bright`）。
- **锁定标记**：金色描边，`--dc-gold`。
- **交互提示**：`--dc-bg-2` 半透明小面板 + 金色按键徽标（图标 `dc-icon-*`）。
- **伤害 / 状态数字**：等宽字体；伤害红、回复绿、信息蓝。

## 10. 动效

- 过渡统一 `--dc-transition`（约 140ms ease）；仅对 `background / border-color / color / box-shadow / opacity` 做过渡。
- 悬停 = 底色亮一档 + 余烬微光；按下 = 轻微内阴影加深。
- 脉冲/闪烁仅用于关键状态（低血量、捕获等待），频率 ≤ 1Hz。
- 禁止大幅位移 / 旋转 / 弹跳动画。

## 11. 文案与本地化

- 所有面向玩家的文案**禁止硬编码**，一律经 `src/i18n/` 的 `translate` / `localize*`（详见 [`../i18n.md`](../i18n.md)）。
- 图标是图形，不属文案；但图标需配 `title`/`aria-label` 时，其文本同样走 i18n。

## 12. 反例（禁止）

- 硬编码颜色 / 字体 / 圆角（绕过 `--dc-*` 令牌）。
- 模块自带一套配色（绿、亮蓝、亮紫等旧色）。
- Unicode 图标（如 `× ＋ ✓ ⚙ ★`）。
- 面板各自为政的圆角与内边距。
- 装饰盖过内容、滚动容器不预留 gutter。

## 13. 迁移

存量 UI 按模块迁移，流程与验收见 [`css_style_guide.md`](css_style_guide.md) 第 8 节。迁移必须**保留既有 id / class / `data-*` / 文案**（e2e 与单测依赖），仅追加 `dc-*` 类名。
