# 存档格式与兼容（save_load/）

本页汇总箱庭模式引入的存档变更与兼容策略。原则：**所有新字段可选、校验层安全回退、未知 id 在领域层丢弃、绝不抛错**。

## 约定

- 改存档结构必须同步 `types.ts`、`validation.ts`（缺失时安全回退默认，不得抛错）与 `serialize.ts`。
- 当前 `SAVE_FORMAT_VERSION = 18`，版本推进：v4 起 character 增加可选基础防御 `defense` 与护甲 `armor`；v5 起锁定点 `lockPoints`；v6 起副手 `offhand` 与持握 `holdMode`；v7 起肢体 `limb` 与 `building_generator` 建筑实体；v8 起 `interactable` / `item` 实体与 play 背包 `inventory`、传送点 `teleports`（`modeInfo.play`）；v9 起 character 增加可选韧性/倒地属性 `poiseMax` / `poiseRegenDelay` / `poiseRegenPerSec` / `knockdownDuration` / `getUpDuration`；v10 起 character 增加可选惯用手 `handedness`（`'right'` 默认 / `'left'`，缺失安全回退 `'right'`）；v11 起 character 增加可选行为原点策略 `originStrategy`（`'resident'` 默认 / `'fighter'` / `'hunter'` / `'roamer'`）、漫游间隔 `originInterval`、追击半径 `chaseLeashRadius`（缺失安全回退默认）；v12 起 character 增加可选基础攻击加成 `baseAttack`（逐攻击类别，缺失安全回退 0/0）；v13 起 5 种箱子变体合并为统一 `box` 实体（`config` 携带可选特性对象）；v14 起 `area/water` 统一为 `area` 实体（`config` 携带几何 + 视觉材质 + 可选物理场）；v15 起 character 增加可选 AI 反应式举盾窗口 `aiBlockDuration` 与冷却 `aiBlockCooldown`（缺失安全回退 0.4 / 1.2）；v16 起 character 增加可选体形计划 `bodyFormId`（缺失 / 未知 id 安全回退 humanoid）；v17 起 character 增加可选吐息模组 `breathModuleId`（未知 id 安全视为未装备）；v18 起 character 改为 `bodyFormId + bodyState + equipment`（limb / weapon / armor 分层），删除顶层 `attack` / `offhand` / `holdMode` / `handedness` / `armor` / `limb` / `breathModuleId`，天然武器不写入装备表。
- 历史存档不保证兼容；未知副手武器 id 加载时安全丢弃。

## 陷阱

- 存档 `attack`（武器 id + 伤害/起手段冷却/远程弹道覆写）与武器模组是**单向**关系：数值可覆写，动作（段/时长/阶段/动画）不可覆写。
- 建筑存档用**显式 palette + 每 chunk RLE(Base64)**，校验层对 `worlds` / `chunks` / `palette` 非法输入一律 `.catch([])` 回退为空、未知材质 id 解码回退为空，禁止抛错；载入以显式体素为准。
- 背包 / 传送点持久化在 `modeInfo.play`（非 character 存档），保存时由 `main.ts` 合并 `hakoniwa.getSaveData()`。

## 1. 版本推进

`SAVE_FORMAT_VERSION` 当前为 `17`（`types.ts` 注释说明）：

| 版本 | 新增 |
|------|------|
| v8 | `interactable` 实体（9 类交互物）；`item` 掉落物实体；`modeInfo.play.inventory`（玩家背包）；`modeInfo.play.teleports`（已解锁传送点键） |
| v9 | character 可选韧性/倒地属性：`poiseMax`（韧性上界基础值，仅本项参与「基础上界 + 护甲/肢体 poise 汇总」重算）、`poiseRegenDelay`、`poiseRegenPerSec`、`knockdownDuration`、`getUpDuration`；旧档缺字段加载时安全回退运行时默认 |
| v10 | character 可选惯用手 `handedness`（`z.enum(HANDEDNESS).optional().catch(undefined)`）：`'right'`（缺省）/ `'left'`；旧档缺失即回退默认右撇子 |
| v11 | character 可选行为原点策略 `originStrategy`（`z.enum([...]).optional().catch(undefined)`）、漫游间隔 `originInterval`、追击半径 `chaseLeashRadius`；旧档缺失即回退 `'resident'` / `20` / `20` |
| v12 | character 可选基础攻击加成 `baseAttack`（逐攻击类别 `{physical, magic}`）；旧档缺失即回退 `{physical:0, magic:0}`，非法结构 / 负值安全回退 0 |
| v13 | 5 种箱子变体（`box/common`、`box/destruction`、`box/burning`、`box/magnet`、`box/elasticity`）合并为统一 `box` 实体：`config`（`BoxConfig`）携带可选特性对象 `destructible` / `burning` / `magnet` / `elastic`，各特性运行态分别放在顶层可选字段 `destructible` / `burning` / `elastic`。旧的 `box/*` 元素在加载时作为**未知类型**按元素粒度跳过（不兼容迁移） |
| v14 | `area/water` 统一为 `area` 实体：`config`（`AreaConfig`）携带 `shape`（box/sphere/cylinder 判别联合）+ `material`（water/air/force_field）+ 可选物理场 `fields.{float,wind,gravity}`。旧的 `area/water` 元素在加载时作为**未知类型**按元素粒度跳过（不兼容迁移） |
| v15 | character 可选 AI 反应式举盾窗口 `aiBlockDuration` 与冷却 `aiBlockCooldown`（均须正数；冷却为 0 会让举盾无限续期）；旧档缺失即回退运行时默认 `0.4` / `1.2`，非法值安全回退 `undefined` |
| v16 | character 可选体形计划 `bodyFormId`；旧档缺失 / 未知 id 由 `bodyFormOf` 安全回退 humanoid |
| v17 | character 可选吐息模组 `breathModuleId`；旧档缺失即未装备，未知 id 由 `breathModuleOf` 安全视为未装备 |

> 重生点当前经由存档点激活时刷新缓存存档实现（玩家就在点上），不再单列字段。

## 1.1 统一箱子存档（v13）

```ts
export interface SavableBox {
    type: 'box'
    config: BoxConfig                       // 刚体尺寸/质量/摩擦 + material + 可选特性
    position: Vec3JSON
    quaternion: QuatJSON
    destructible?: {health?: number; collisions?: CollisionRecord[]; collisionHistory?: CollisionRecord[]; cooldowns?: [number, number][]}
    burning?: {health?: number}
    elastic?: {def: [number, number, number]; vel: [number, number, number]}
}
```

- `validation.ts` 用单个 `SavableBox`（`BoxConfigSchema` + 三个可选运行态子对象）替换原 5 个箱子 schema；特性运行态子对象非法时仅该元素被跳过。
- `serialize.ts` / `deserialize.ts` 单 `case 'box'`：`EntitySourceMap` 的 5 条箱子映射并为 `'box': BoxEntityContext`；反序列化把运行态映射到 `add(..., options: BoxAddOptions)`。
- 旧档的 `box/*` 类型不再是合法判别值 → `parseSaveData` 记入 `skipped`（`type` 为原 `box/*` 字面量）。

碎片 `fragment/common` 的 `config` 增加可选字段 `material`（沿用裂开前箱子的表面材质）：`FragmentConfigSchema` 用 `z.enum(SURFACE_MATERIAL_IDS).default(DEFAULT_SURFACE_MATERIAL)`，旧档缺失安全回退默认材质。

箱子 `config.destructible` 增加可选字段 `fragmentCount`（碎裂目标块数）：`DestructibleTraitSchema` 用 `z.number().int().min(FRAGMENT_COUNT_MIN).max(FRAGMENT_COUNT_MAX).default(DESTRUCTIBLE_DEFAULTS.fragmentCount)`，旧档缺失安全回退默认。

## 1.2 统一区域存档（v14）

```ts
export interface SavableArea {
    type: 'area'
    config: AreaConfig        // 几何 + material + 可选物理场 fields.{float,wind,gravity}
    position: Vec3JSON
    quaternion: QuatJSON
}
```

- `validation.ts` 用单个 `SavableArea`（`AreaConfigSchema`）替换原 `SavableWaterBlock`；`EntitySourceMap` 的 `'area/water'` 映射改为 `'area': AreaEntityContext`。
- `serialize.ts` / `deserialize.ts` 单 `case 'area'`：区域无刚体，读写自身 `transform`。
- 旧档 `area/water` 不再是合法判别值 → `parseSaveData` 记入 `skipped`（不兼容迁移）。

## 2. 新增实体类型

```ts
export interface SavableInteractable {
    type: 'interactable'
    kind: InteractableKind
    config: InteractableConfig      // 判别式联合
    position: Vec3JSON
    yawQuarter: number
    progress: number
    target: number
    on: boolean
    items: string[]
    health: number
}
export interface SavableItem {
    type: 'item'
    config: {defId: string; count: number}
    position: Vec3JSON
    quaternion: QuatJSON
}
```

- `SavableEntity` 联合追加两者；`EntitySourceMap` 追加 `'interactable'` / `'item'`。
- `serialize.ts`：实体系统非空时写入对应 `type` 分段。
- `deserialize.ts`：按 `type` 派发到对应 `loadSave...`；未知 kind / defId 条目安全丢弃（领域层 `sanitize`）。

## 3. 校验层（`save_load/validation.ts`）

- `InteractableConfigSchema`：`z.discriminatedUnion('kind', [...])`，每个 kind 的字段给默认值 + `.catch(默认配置)`；`breakableBy` 用 `z.array(z.enum(BREAKABLE_SOURCES)).catch([...])`。
- `ItemSaveSchema`：`defId` 为字符串（未知由领域层丢弃），`count` 正整数字段 `.catch(1)`。
- `InventorySaveSchema`：整体 `.optional().catch(undefined)`；`grid` 坐标 `.catch` 后越界丢弃；`equipment` 未知槽位丢弃。
- `TeleportsSchema`：`z.object({known: z.array(z.string()).catch([]).default([])}).optional().catch(undefined)`。
- 更新既有「旧档缺字段」测试用例，覆盖新字段缺失/非法不抛错。

### 逐元素跳过（`parseSaveData`）

- 校验按**元素粒度**进行：`parseSaveData(input)` 先用壳 schema（`entities: z.array(z.unknown())`）校验结构，再对每个元素 `SavableEntity.safeParse` 收集结果，返回 `{data, skipped}`。
- `skipped: readonly SkippedEntity[]`，每项 `{index, type, reason}`（`index` 为原数组下标，`type` 取原 `type` 字段，`reason` 为首条 zod 错误摘要）。未知 `type`、字段非法等只跳过该元素，整档不失败。
- **仅结构性失败仍抛错**：顶层非对象 / `entities` 缺失或非数组沿用 `.parse` 抛错（对应启动屏 `startup.invalid_save`）。
- `validateSaveData(input)` 保留为 `parseSaveData(input).data` 的包装（返回合法实体、丢弃非法项），供不需要跳过明细的调用方使用。
- `loadCachedSaveData()` / `promptLoadFile()` 返回 `ParsedSaveData`（含 `skipped`），不再返回裸 `SaveData`。

### 跳过提示对话框（`ui/components/message_dialog.ts`）

- `showSkippedEntitiesNotice(skipped)`：仅当 `skipped` 非空时弹出阻塞式对话框，列出全部 `index + type`（未知类型显示 `save.skipped_unknown_type`）；点击关闭 / 遮罩 / 右上角图标后 resolve。文案键：`save.skipped_title` / `save.skipped_message` / `save.skipped_entry` / `save.skipped_unknown_type`。
- `showMessageDialog(options)`：通用提示对话框（标题键 + 正文 + 明细行 + 关闭键），走 `.dc-overlay` / `.dc-panel` / `.dc-btn` 令牌。
- 接线点：启动屏缓存探测（`showCache`）与文件导入、`main.ts` 进入模式时回退缓存、`main.ts` 手动载入（`load_world`）。启动屏已在探测 / 导入时弹过提示，`main.ts` 沿启动屏传入的已解析数据不再重复弹窗。

## 4. 兼容注意事项

- 旧档（v7 及更早）无 `interactable` / `item` / `inventory`，加载后分别为空世界附属物、空掉落、空背包，角色战斗数值维持原样。
- `interactable` 的 `channel` 与 `name` 为普通字符串；空串合法。
- `breakableBy` 缺失/非法回退 `['melee', 'roll']`（保证至少可被近战与翻滚破坏，避免永久无敌）。
- 掉落物拾取后从存档实体中移除；背包满时不拾取，实体保留。
- 存档往返测试必须覆盖：交互物各 kind、箱子内容中的未知物品 id、掉落物、背包超界格位、旧档缺失字段。

## 5. localStorage

- 键位绑定：既有。
- 重生点：`box_demo_respawn`，结构 `{x,y,z,facing}`；读取时校验数值有限，否则忽略。
- 存档缓存：既有 `box_demo_save`（`save_load/cache.ts`），读取经 `parseSaveData`，返回 `{data, skipped}`；跳过明细由调用方经 `showSkippedEntitiesNotice` 提示。
