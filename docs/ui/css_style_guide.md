# CSS 编码指南

> 目标：统一本项目的样式组织方式、命名与落地流程，使 UI 可维护、可复用、与主题联动。视觉目标见 [`ui_style_guide.md`](ui_style_guide.md)。
> 适用范围：`src/assets/*.css` 与所有 TS 中构建 DOM 的样式写法。

## 1. 架构总览

项目 UI 全部由命令式 TS 构建 DOM，**不使用组件框架**。样式分三层：

1. **全局基础层** — `src/assets/style.css`（reset：`margin/padding/box-sizing`、`html/body/#app` 尺寸）。
2. **主题层** — `src/assets/theme.css`：`:root` 设计令牌 → 基础元素样式 → 通用组件类（`dc-*`）→ 全局滚动条。由 `main.ts` 导入（紧随 `style.css`）。
3. **局部层** — 各面板的语义类名（如 `.sch-*`、`.bp-*`）与必要的少量内联样式。

原则：**能用主题层复用就不写局部**；局部只承载该面板特有布局。

## 2. 文件组织

```
src/
├── assets/
│   ├── style.css      # reset（保持精简）
│   └── theme.css      # 令牌 + 基础元素 + dc-* 组件 + 滚动条
├── ui/
│   ├── icons/
│   │   ├── sprite.ts  # <symbol> 定义 + installIconSprite()
│   │   └── icon.ts    # createIcon(name, opts)
│   └── components/     # 复用控件工厂（button_row / number_input / section）
```

- 颜色、字体、间距、圆角、阴影、过渡**只能**定义在 `theme.css` 的 `:root`。
- 新增领域样式优先放进既有面板的注入 `<style>` 块（保留其类名前缀），不新建散落的 CSS 文件。

## 3. 命名约定

- **令牌**：`--dc-<类别>-<语义>[-<状态>]`，如 `--dc-bg-2`、`--dc-border-strong`、`--dc-red-bright`、`--dc-fs-13`、`--dc-space-3`。
- **组件类**：`dc-` 前缀 + BEM 风格 —— `dc-panel`、`dc-panel__title`、`dc-btn`、`dc-btn--primary`、`dc-row`、`dc-bar__fill`。
- **状态类**：优先属性/伪类（`:disabled`、`:hover`、`:focus-visible`）；需要 JS 切换时用 `is-active`、`is-capturing` 等，避免样式与逻辑脱节。
- **面板局部前缀**：沿用既有语义前缀（`.sch-`、`.bp-`、`#bone-timeline` 等），**不得改名或删除**（见第 7 节）。

## 4. 令牌（`theme.css` 的 `:root`）

完整色板 / 字体 / 间距 / 效果令牌见 [`ui_style_guide.md`](ui_style_guide.md) 第 2–4 节，此处不重复。约定：

- 组件样式**一律引用令牌**，不允许字面量颜色、字体栈、圆角值。
- 半透明浮层用 `color-mix()` 或 `rgba` 派生自令牌底色的写法，需在注释中说明来源。
- 令牌是唯一真相源：改主题只改 `:root`。

## 5. 组件类（`dc-*`）

`theme.css` 提供以下基础类，业务直接复用：

| 类 | 说明 |
|----|------|
| `.dc-panel` / `.dc-panel__title` | 标准面板容器 / 标题 |
| `.dc-section` | 区块（带上分隔） |
| `.dc-row` | 列表 / 表单行 |
| `.dc-label` / `.dc-hint` | 标签 / 辅助说明 |
| `.dc-btn` + `--primary` `--danger` `--ghost` `--active` | 按钮及变体 |
| `.dc-icon-btn` | 纯图标按钮 |
| `.dc-input` / `.dc-select` / `.dc-check` | 表单控件 |
| `.dc-badge` + `--info` `--warn` `--danger` | 状态徽章 |
| `.dc-list` / `.dc-scroll` | 列表容器 / 强制 `scrollbar-gutter:stable` 的滚动容器 |
| `.dc-bar` / `.dc-bar__fill` | 进度条 |
| `.dc-icon` | SVG 图标基类（继承 `currentColor`） |

局部样式可**叠加**这些类（`<button class="bp-btn dc-btn">`），但不得覆盖令牌语义。

## 6. 选择器与优先级

- 避免 `!important`；确需时须注释原因。
- 选择器保持扁平（1–2 层），不用深嵌套；不使用标签选择器做组件样式。
- 不依赖 DOM 顺序或相邻兄弟选择器表达业务状态。

## 7. 迁移规则（硬约束）

存量 UI 迁移时，**单测依赖既有 DOM 契约**，必须保留：

- 所有 `id`（`#execute-panel`、`#character-panel`、`#settings-btn`、`#bone-timeline` …）；
- 所有语义类名（`.bp-*`、`.sch-*`、`.lock-point-*`、`[data-id]` …）与 `data-*` 属性；
- 所有文案（i18n 断言按文本匹配）。

允许：**追加** `dc-*` 类、新增包裹层（不改层级语义）、替换注入 `<style>` 块内的颜色/形态规则。

### 迁移流程

1. 选定一个模块（如 `ui/components`）。
2. 内联 `cssText` → 保留语义类，追加 `dc-*`；同类元素的重复样式上提为模块级常量或 `<style>` 规则。
3. 硬编码颜色/字体/圆角 → 令牌。
4. 滚动容器加 `.dc-scroll`（或等价 `scrollbar-gutter:stable`）。
5. 图标：Unicode / 文本符号 → `createIcon()`。
6. 增量验证：`pnpm type-check` + 该模块相关单测。
7. 收尾：`pnpm test`。

## 8. 滚动条

- 全局规则（变量 + `scrollbar-width/color` + `::-webkit-scrollbar*`）只在 `theme.css` 定义一次。
- **功能滚动容器必须 `scrollbar-gutter: stable`**，统一用 `.dc-scroll`。
- 局部不得再写 `::-webkit-scrollbar` 样式。

## 9. 图标

- 统一 SVG，定义于 `src/ui/icons/sprite.ts`，经 `createIcon()` 使用；禁止 Unicode / emoji 图标。
- 图标尺寸用 `--dc-icon*` 令牌；颜色继承 `currentColor`。
- 详见 [`ui_style_guide.md`](ui_style_guide.md) 第 7 节。

## 10. 性能

- 帧内更新的元素只改必要属性（沿用现有脏检查：文本比较、宽度比较），不整块重写 `cssText`。
- 过渡只作用于 GPU 友好属性（`background/color/border-color/box-shadow/opacity`）。
- 不新增图片/纹理背景资源（克制装饰，纯 CSS 表达）。

## 11. 禁止项

- 硬编码颜色 / 字体 / 圆角 / 间距（绕过令牌）。
- `.dc-*` 之外的全局类名污染（如无前缀的 `.panel`、`.btn`）。
- 内联 `style=""` 承载主题色（应走类）。
- Unicode 图标。
- 深层嵌套、`!important`、标签选择器组件样式。
- 删除/重命名既有 id、语义类名、`data-*` 或文案。

## 12. 验证

- 类型：`pnpm type-check`。
- 单测：`pnpm vitest run <相关文件>`。
- 收尾全量：`pnpm test`；涉及构建配置或入口链路时追加 `pnpm build`。
- 遵循 AGENTS.md「最小充分、非必要不重复全量」原则。
