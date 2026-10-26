# 输入（input/）模块约定

## 约定

- 默认绑定由 `constants.ts` 的 `DEFAULT_BINDINGS` 定义；鼠标按模式生效由 `MOUSE_ACTIONS_BY_MODE` 决定（编辑：旋转视角 / 生成物体；游玩：旋转视角 / 轻击 / 重击 / 锁定目标；展示：旋转视角 / 平移视角 / 聚焦）。
- 新增输入动作（如 `interact` / `open_inventory` / `open_equipment` / `open_map`）必须同步 `INPUT_ACTIONS` / `ACTION_LABELS` / `ACTION_GROUPS` / `DEFAULT_BINDINGS` / `registry.test.ts` 的 `EXPECTED_DEFAULTS`（类型穷尽会编译报错）。

## 陷阱

- **交互控件焦点隔离**：`keydown` 目标位于 `INPUT` / `TEXTAREA` / `SELECT` / `contentEditable` 时，注册表完全让位（输入框 / 下拉的左右键与字母键只作用于控件本身），`Escape` 例外以保留关闭面板退路；输入法组合（`isComposing`）期间同样忽略。`BUTTON` / `A` 只让位空格 / 回车激活键，字母键与方向键仍驱动游戏，避免点击按钮后 WASD 失效。**焦点进入输入控件（`focusin`）会立即清空 `activeKeys`**：原生 `<select>` 展开时浏览器可能吞掉 `keyup`，不清空会让相机 / 角色持续运动。窗口 `blur` 与页面隐藏也统一清空。
- 改默认键位 / 鼠标绑定必须同步 `input/registry.test.ts` 的 `EXPECTED_DEFAULTS`。
- `localStorage` 与导入文件中已有动作的绑定不会被新默认值覆盖（需「重置默认」或导入配置）；缺失的动作（如版本新增）由 `loadFromStorageInternal` / 导入校验以默认值补齐。
- 旧数据校验必须安全回退默认值，不得抛错崩溃。
