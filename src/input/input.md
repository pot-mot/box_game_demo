# 输入（input/）模块约定

## 约定

- 默认绑定由 `constants.ts` 的 `DEFAULT_BINDINGS` 定义；鼠标按模式生效由 `MOUSE_ACTIONS_BY_MODE` 决定（编辑：旋转视角 / 生成物体；游玩：旋转视角 / 轻击 / 重击 / 锁定目标；展示：旋转视角 / 平移视角 / 聚焦）。
- 新增输入动作（如 `interact` / `open_inventory` / `open_equipment` / `open_map`）必须同步 `INPUT_ACTIONS` / `ACTION_LABELS` / `ACTION_GROUPS` / `DEFAULT_BINDINGS` / `registry.test.ts` 的 `EXPECTED_DEFAULTS`（类型穷尽会编译报错）。

## 陷阱

- 改默认键位 / 鼠标绑定必须同步 `input/registry.test.ts` 的 `EXPECTED_DEFAULTS`。
- `localStorage` 与导入文件中已有动作的绑定不会被新默认值覆盖（需「重置默认」或导入配置）；缺失的动作（如版本新增）由 `loadFromStorageInternal` / 导入校验以默认值补齐。
- 旧数据校验必须安全回退默认值，不得抛错崩溃。
