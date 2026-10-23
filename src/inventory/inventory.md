# 背包与物品（inventory/）

背包领域层 `src/inventory/`（纯 TS，不依赖 `entity/` / `modes/`）；掉落物实体 `src/entity/item/`；背包 / 容器 / 装备 UI 与掉落拾取编排在 `src/modes/play/`（`inventory_ui/`、`container_ui/`、`equipment_ui/`），装配入口 `src/modes/play/hakoniwa.ts`（输入事件驱动，不占每帧 updater）。

## 约定

- 物品目录 + 俄罗斯方块形状布局 + 背包增删/装备 + 存档转换都在本分包；UI 只读状态。
- 装备应用走 `characterSystem`（主手/副手武器 + 四槽护甲），与角色战斗数值互通。
- 背包与传送点持久化于 `modeInfo.play`（`inventory` / `teleports`），保存时由 `main.ts` 合并 `hakoniwa.getSaveData()`。

## 陷阱

- `inventoryFromSave` 对未知 defId / 越界格位 / 未知装备槽安全回退；未知 defId 的掉落物拾取时丢弃。
- 装备应用：主手未装备武器时回退 `DEFAULT_WEAPON_ID`，副手 `null` 卸下，护甲汇总四槽 `ArmorLoadout`；**仅当背包有装备映射时才在启动时应用**，避免覆盖旧档 character 的武器配置。
- 装备模型预览（`modes/play/equipment_ui/preview.ts`）持有独立 `WebGLRenderer`，**必须惰性创建**（首次打开背包时），否则 play 启动即多出一个 `canvas`，且每个模式切换都会累积 WebGL 上下文。
- 掉落物、背包实例变更走就地修改 + `changed` 标记，避免每帧分配。

## 物品目录与形状（`items.ts` / `catalog.ts` / `grid.ts`）

```ts
export const ITEM_CATEGORIES = ['weapon', 'armor', 'block', 'consumable', 'material', 'key'] as const
export interface ItemDef {
    readonly id: string
    readonly name: string
    readonly category: ItemCategory
    /** 背包 / 图鉴呈现图标（`ui/icons` sprite 中的图标名，逐物品专属） */
    readonly icon: IconName
    /** 俄罗斯方块形状：每行一个字符串，'#' 为占格；行数=高，最长行=宽 */
    readonly shape: readonly string[]
    readonly maxStack: number
    readonly weaponId?: string      // 可装备武器 → *_WEAPON_MODELS id
    readonly armorId?: string       // 可装备护甲 → 护甲预设 id
    readonly equipSlot?: EquipSlot  // 缺省由 armorId 解析
    readonly blockType?: string     // block 类别 → 实体类型（'box' / 'area'）
    readonly boxPreset?: BoxPresetId // 箱子物品 → 特性预设（common/destructible/burning/magnet/elastic）
    readonly areaPreset?: AreaPresetId // 区域物品 → 材质 + 场预设（water/air/force_field）
    readonly dropSize: readonly [number, number, number]
    readonly description: string
}
export const ITEM_DEFS: readonly ItemDef[]
export const findItemDef = (id: string | undefined): ItemDef | undefined
```

- `ITEM_DEFS` 覆盖**全部武器模型**（近战 6 + 远程 9）、**全部护甲预设**、**龙吐息三件物品**、**全部方块实体**；`items.test.ts` 对照武器 / 护甲目录与 `ENTITY_TYPE_VALUES` 锁定完整性——新增武器 / 护甲 / 吐息 / 方块须同步补条目。本地化名复用 `weapon.*` / `armor.*` / `breath.*` 名称键，描述共用 `item.weapon_generic.desc` / `item.armor_generic.desc`。
- **物品图标**：每件物品的 `icon` 登记于 `src/ui/icons/sprite.ts` 的 `ICON_NAMES`（命名 `item-*`）；`items.test.ts` 校验图标均已登记，同类物品允许复用图标。背包网格（`modes/play/inventory_ui/grid_render.ts`）与图鉴（`modes/showcase/modules/catalog.ts`）据此呈现。
- `grid.ts` 纯函数（带单测）：`rotatedShape` / `canPlace` / `findPlacement` / `buildOccupancy`（`rot` = 0..3 顺时针 90°）。

## 背包实例与操作（`types.ts` / `inventory.ts`）

```ts
/** 槽位键 = kind:bodyPart，由当前体形 `BodyForm.equipSlots` 提供 */
export type EquipSlot = EquipSlotKey
export interface ItemStack { instanceId: string; defId: string; count: number; grid?: Placement }
export interface InventoryState {
    width: number; height: number
    stacks: ItemStack[]
    /** 槽位 → 物品实例 id（装备中的物品仍在 stacks 中，便于卸下时找回定义） */
    equipment: Partial<Record<EquipSlot, string>>
}
export const createInventory = (): InventoryState   // 默认 8×6
export const addItem / removeAt / moveStack / equipStack / unequipSlot / equippedStacks / mergeAllowed
```

- `addItem` 自动 `findPlacement`，支持堆叠合并；背包满返回 `{ok:false, reason:'full'}`。
- 装备：目标槽已占则交换；槽位键为 `kind:bodyPart`（如 `weapon:main_hand` / `armor:head` / `weapon:breath`）。物品声明 `equipKind` / `equipSlot`，武器与护甲/肢体再按体形槽表与 `allowedBodyFormIds` 校验。
- `equipStack(inv, instanceId, slotKey, {bodyFormId, allowedSlots})`：先校验槽位键是否属于当前体形，再按物品 `equipKind` / 武器 `formId` 与 `equipBodyParts` / 护甲肢体 `allowedBodyFormIds` 校验；未知槽位 / 跨体形装备直接拒绝。吐息物品三件分别映射 `breath_fireball` / `breath_lightning` / `breath_laser`，仅 wyvern 的 `weapon:breath` 槽接受。
- `applyEquipment` 从背包槽位构建 `EquipmentState`（limb / weapon / armor），经 `updateCharacterConfig` 同步数值/外观，并在有 `weapon:breath` 时调用 `setBreathModule`。

## 掉落与拾取（`entity/item/`）

- `setupItemEntities(scene, shared): ItemEntityContext`，提供 `drop` / `getSave` / `loadSave` / `registerInteractionProvider`。
- 网格按 `ItemDef.dropSize` 生成小立方体（共享表面材质：武器 `rusty_iron`、其余 `wood`），以 `FLOAT_HEIGHT` 漂浮；每帧小幅自转。
- 物理：**fixed body + cuboid collider，`setSensor(true)` 且 `categoryCollisionGroups(ITEM_COLLISION_GROUP = 32, ITEM_COLLISION_MASK = 0, 'item')`（掩码 0，不参与物理）**；类别位 `item = 1 << 13`。拾取**不经碰撞**，而是 `InteractionProvider` 提示「拾取」→ `addItem`，失败提示「背包已满」，成功移除实体；角色走近即可拾取。

## 背包 UI（`modes/play/inventory_ui/`）

- `open_inventory`（默认 `KeyB`）切换显隐，打开时释放鼠标；面板工厂 `createInventoryPanel(host) → {update,setVisible,destroy,open}`，脏检查刷新，退出时销毁并移除注入样式。
- `width×height` 格子网格，物品绝对定位覆盖占用格（尺寸 = 形状包围盒 × 格宽）；物品图标（`ItemDef.icon`）居中呈现，底部为名称、右上角为堆叠数量；网格渲染与双栏容器面板共用 `grid_render.ts` 的 `renderInventoryGrid`。
- 拖拽移动（`pointerdown` 拎起、`pointerup` 落位，实时 `canPlace` 校验高亮）、拖拽中按 `R` 旋转、右键/双击装备、悬停细节卡（名称/描述/数量/装备/丢弃）。
- 丢弃：转成玩家前方掉落物并从背包移除。

## 容器（箱子）

- `chest` 交互物持有独立 `InventoryState`（`InteractableEntity.container`，6×4）；打开**双栏容器面板**（`modes/play/container_ui/panel.ts`）复用 `inventory_ui/grid_render.ts`，支持栏内拖拽、跨栏拖拽、双击快速转移、`R` 旋转。
- 跨栏走 `transferStack(from, to, instanceId, placement?)`：保留实例 id 与数量，源物品若为装备态先解除映射。箱子内容随交互物存档（`InteractableSaveEntry.container`）。

## 装备 UI（`modes/play/equipment_ui/`）

- 与背包共用大面板：`open_inventory`（B）开背包，`open_equipment`（默认 E）开并聚焦装备视图，面板内可切标签。装备槽由 `getSlots()` 返回的 `BodyForm.equipSlots` 驱动，按 `bodyPart` 锚点环绕模型画布；`main_hand` / `off_hand` 不再是全局硬编码槽。
- 预览 `createEquipmentPreview(): {canvas, setEquipment, render, dispose}`：独立 `WebGLRenderer(alpha:true)` + 独立场景/相机/灯光，**惰性创建**；`createCharacterModel(config, 0)` 后 `equipWeapon` / `equipArmor(resolveArmorLoadout(loadout))`，默认静止姿态。拖拽旋转 / 滚轮缩放后按需 `render()`，**不启动额外 RAF**。
- 槽交互：`equipStack` 按槽位键 + 物品类别 + 体形校验，拖入装备、拖回网格卸下、点击槽查看并卸下；装备后立即 `applyEquipment` 同步数值与外观并刷新预览。`holdMode` 属于人形 `bodyState`，由角色属性面板维护，不在背包面板硬编码。
- 唯一数据源 `InventoryState`；每次变更后重算并 `applyEquipment` + `preview.setEquipment`。

## 与角色装备 / 战斗互通（`modes/play/equipment.ts`）

- `applyEquipment`（`modes/play/hakoniwa.ts`）：遍历 `inventory.equipment` 构建 `EquipmentState`，主武器槽 → `updateCharacterConfig({weaponId})` + `equipment`，副手 → `newOffhand`，护甲 / 肢体随 `equipment` 同步到 `setCombatEquipment` + 外观装配；空主手回退体形 `defaultWeaponId`。
- 角色存档以 `equipment`（limb / weapon / armor）+ `bodyState` 为准；`inventory.equipment` 记录实例 id，加载后按当前体形槽表校正（v18 起槽位键为 `kind:bodyPart`）。

## 存档

- 类型 `InventorySaveData {width,height,items[],equipment}`，字段 `ModeInfoJSON.play.inventory?` 与 `teleports?: string[]`。
- `validation.ts`：`inventory` / `teleports` 均 `.optional().catch(undefined)` 且逐字段 `.catch`；非法格位由 `inventoryFromSave` 重新归位，未知 `defId` / 装备槽丢弃。
- 掉落物为独立实体类型 `SavableItem {type:'item'; config; position; quaternion}`；当前 `SAVE_FORMAT_VERSION = 18`。
