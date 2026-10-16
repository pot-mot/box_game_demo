# 存档格式与兼容（save_load/）

本页汇总箱庭模式引入的存档变更与兼容策略。原则：**所有新字段可选、校验层安全回退、未知 id 在领域层丢弃、绝不抛错**。

## 约定

- 改存档结构必须同步 `types.ts`、`validation.ts`（缺失时安全回退默认，不得抛错）与 `serialize.ts`。
- 当前 `SAVE_FORMAT_VERSION = 9`，版本推进：v4 起 character 增加可选基础防御 `defense` 与护甲 `armor`；v5 起锁定点 `lockPoints`；v6 起副手 `offhand` 与持握 `holdMode`；v7 起肢体 `limb` 与 `building_generator` 建筑实体；v8 起 `interactable` / `item` 实体与 play 背包 `inventory`、传送点 `teleports`（`modeInfo.play`）；v9 起 character 增加可选韧性/倒地属性 `poiseMax` / `poiseRegenDelay` / `poiseRegenPerSec` / `knockdownDuration` / `getUpDuration`。
- 历史存档不保证兼容；未知副手武器 id 加载时安全丢弃。

## 陷阱

- 存档 `attack`（武器 id + 伤害/起手段冷却/远程弹道覆写）与武器模组是**单向**关系：数值可覆写，动作（段/时长/阶段/动画）不可覆写。
- 建筑存档用**显式 palette + 每 chunk RLE(Base64)**，校验层对 `worlds` / `chunks` / `palette` 非法输入一律 `.catch([])` 回退为空、未知材质 id 解码回退为空，禁止抛错；载入以显式体素为准。
- 背包 / 传送点持久化在 `modeInfo.play`（非 character 存档），保存时由 `main.ts` 合并 `hakoniwa.getSaveData()`。

## 1. 版本推进

`SAVE_FORMAT_VERSION` 从 `8` 推进到 `9`（`types.ts` 注释说明）：

| 版本 | 新增 |
|------|------|
| v8 | `interactable` 实体（9 类交互物）；`item` 掉落物实体；`modeInfo.play.inventory`（玩家背包）；`modeInfo.play.teleports`（已解锁传送点键） |
| v9 | character 可选韧性/倒地属性：`poiseMax`（韧性上界基础值，仅本项参与「基础上界 + 护甲/肢体 poise 汇总」重算）、`poiseRegenDelay`、`poiseRegenPerSec`、`knockdownDuration`、`getUpDuration`；旧档缺字段加载时安全回退运行时默认 |

> 重生点当前经由存档点激活时刷新缓存存档实现（玩家就在点上），不再单列字段。

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

## 4. 兼容注意事项

- 旧档（v7 及更早）无 `interactable` / `item` / `inventory`，加载后分别为空世界附属物、空掉落、空背包，角色战斗数值维持原样。
- `interactable` 的 `channel` 与 `name` 为普通字符串；空串合法。
- `breakableBy` 缺失/非法回退 `['melee', 'roll']`（保证至少可被近战与翻滚破坏，避免永久无敌）。
- 掉落物拾取后从存档实体中移除；背包满时不拾取，实体保留。
- 存档往返测试必须覆盖：交互物各 kind、箱子内容中的未知物品 id、掉落物、背包超界格位、旧档缺失字段。

## 5. localStorage

- 键位绑定：既有。
- 重生点：`box_demo_respawn`，结构 `{x,y,z,facing}`；读取时校验数值有限，否则忽略。
- 存档缓存：既有 `box_demo_save`（`save_load/cache.ts`），自动经 `validateSaveData`。
