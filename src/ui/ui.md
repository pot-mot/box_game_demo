# UI（ui/）模块约定

## 约定

- 全部模式 / 面板 / HUD 遵循 `docs/ui/ui_style_guide.md`；样式只走 `src/assets/theme.css` 的 `--dc-*` 令牌与 `.dc-*` 组件类（禁止硬编码颜色 / 字体 / 圆角 / 间距）。
- 功能滚动容器统一 `scrollbar-gutter:stable`（`.dc-scroll`）；装饰用 SVG 图标（`src/ui/icons/`，禁止 Unicode/emoji 图标）。
- UI 文案禁止硬编码，一律经 `src/i18n/` 的 `translate` / `localizeText` / `localizeTitle` / `localizePlaceholder` 取用。
- 迁移存量 UI 必须保留既有 `id` / 语义类名 / `data-*` / i18n 文案（e2e 与单测依赖）。

## 文档

- `docs/ui/ui_style_guide.md` — UI 风格设计规范（唯一真理源）
- `docs/ui/css_style_guide.md` — CSS 编码指南
