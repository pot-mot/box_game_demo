# UI（ui/）模块约定

## 约定

- 全部模式 / 面板 / HUD 遵循 `docs/ui/ui_style_guide.md`；样式只走 `src/assets/theme.css` 的 `--dc-*` 令牌与 `.dc-*` 组件类（禁止硬编码颜色 / 字体 / 圆角 / 间距）。
- 功能滚动容器统一 `scrollbar-gutter:stable`（`.dc-scroll`）；装饰用 SVG 图标（`src/ui/icons/`，禁止 Unicode/emoji 图标）。
- UI 文案禁止硬编码，一律经 `src/i18n/` 的 `translate` / `localizeText` / `localizeTitle` / `localizePlaceholder` 取用。
- 迁移存量 UI 必须保留既有 `id` / 语义类名 / `data-*` / i18n 文案（单测依赖）。
- 元素列表的箱庭子实体使用 `.dc-list-children` 缩进容器，不新增硬编码间距；归属关系来自 `OwnershipStore`。
- 实体属性面板经 `PanelContext.update` 逐帧刷新动态字段（坐标 / 朝向 / 当前生命 / 当前韧性 / 原点等）：仅跳过当前聚焦、或已被编辑但尚未 Apply 的输入框，避免覆盖用户输入；`Apply` 或重新渲染后恢复实时刷新。

## 文档

- `docs/ui/ui_style_guide.md` — UI 风格设计规范（唯一真理源）
- `docs/ui/css_style_guide.md` — CSS 编码指南
