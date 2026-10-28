# 箱庭（Diorama）完全重构 + 编辑模式生成对齐 设计

> 状态：**阶段 A–D 基础版已实现**。当前实现见 [`src/composition/diorama/diorama.md`](../../src/composition/diorama/diorama.md)。
>
> 代码基线：2026-10-25 按当前代码校对；存档版本已推进到 **22**。
>
> 本文档包含两部分：
> 1. **箱庭完全重构**：把箱庭从 building 配方中拆出，建立支持复杂组合式生成的独立系统。
> 2. **编辑模式生成对齐**：Ctrl+左键生成实体时，按实体类别对齐到整数格点或 1/2 格点。
>
> 面向读者：建筑 / 箱庭组合 / 地形 / 交互物 / 角色 AI / 存档 / UI / 编辑模式相关实现者。

## 0. 实施状态（v21）

| 核对项 | 当前实际 | 状态 |
|---|---|---|
| 存档版本 | `src/save_load/types.ts` 的 `SAVE_FORMAT_VERSION = 22` | 已完成 |
| 组合层 | `src/composition/diorama/` | 已完成（基础版） |
| 归属索引 | `src/types/ownership_store.ts` | 已完成 |
| 生成对齐 | `src/modes/edit/spawn_alignment.ts` | 已完成 |
| `garden` 配方 | 已从 `generators/structures.ts`、`ui/labels.ts`、`i18n/locales/entity.ts`、`showcase/modules/terrain.ts` 移除 | 已完成 |
| 实体类型 | `ENTITY_TYPE_VALUES` 含 `diorama`；`EntitySourceMap` / 元素列表 / 生成面板 / i18n 已同步 | 已完成 |
| 建筑公开端口 | `add` 支持偏航；新增 `stampStructure` / `getAnchors`；`loadSaveWorlds` 返回 world 列表 | 已完成 |
| 批量加载返回值 | `interactable.loadSave` / `item.loadSave` 返回与输入等长的 id 列表 | 已完成 |
| 归属粒度 | 按 `{type, runtimeId}` 记录；`building_generator` 使用运行时 world id | 已完成（实现采用简化键） |
| 读档行为 | 箱庭以 `materialize=false` 恢复蓝图与根变换，子实体由自身条目恢复 | 已完成 |
| 编辑模式 | 箱庭生成类型、整数格点、面板（配方 / 种子 / 重建 / 删除 / 诊断） | 已完成（基础版） |
| 复杂地牢 | `dungeon` 配方：不规则房间 / 随机地板高度 / 墙 / 天花板 / 廊道 / 楼梯 / 门洞 / 多层升降梯与旋转楼梯 | 已完成（基础版） |
| 预制斜面块 | `slope_block` 实体：整数边长 45° 直角三角柱，横向 / 竖向摆放 | 已完成 |
| 种群 / 槽位高级能力 | 规则式人口、屋顶 / 室内默认锚点、结构化 GUI 编辑器、子实体嵌套列表 | 已完成（基础版） |
| 根 `AGENTS.md` 索引 | 已加入模块文档与设计记录链接 | 已完成 |

## 1. 目标

- 箱庭不再作为 `building_generator` 的一种配方存在。
- 从 building 类型、建筑展示与建筑配方列表中**完全移除 `garden`**。
- 新建独立的组合层系统，支持：
    - 多个建筑体素世界；
    - 地形与地貌；
    - 楼梯 / 旋转楼梯 / 廊桥等连接结构；
    - 交互物与掉落物；
    - 角色与 AI；
    - 装饰与自由道具；
    - 箱子、区域等其它可组合实体。
- 组合式生成采用：
    - **声明式节点图 + 槽位**驱动 building / area 等大型基础结构；
    - **规则式程序生成**控制角色、装饰物、交互物、箱子等小物件。
- 箱庭作为可保存、可重新编辑的实体存在；生成物为普通实体，并带归属元数据。
- 编辑模式 Ctrl+左键生成时：
    - 除角色 / 交互物外，全部对齐到最接近的**整数格点**；
    - 角色 / 交互物对齐到最接近的 **1/2 格点**。

## 2. 决策记录

| 议题 | 结论 |
|---|---|
| 箱庭归属 | 独立组合层系统，不放入 building 类型 / 配方 |
| 代码命名 | 包名 `composition/diorama`，实体类型 `diorama`，UI 文案仍为「箱庭」 |
| 与已有 `modes/play/hakoniwa.ts` 的关系 | 无关；后者是游玩模式的背包 / 装备 / 地图 / 传送子系统，新系统不复用该命名 |
| 箱庭实体 | 持久化蓝图实体，可重新编辑与重建 |
| 组合内容 | 建筑体素世界、地形、区域、连接结构、交互物、掉落物、角色 AI、装饰、箱子 |
| 结构生成模型 | 声明式节点图 + 槽位约束 |
| 小物件生成模型 | 规则式程序生成，确定性种子 |
| 子实体存档 | 蓝图 + 显式子实体存档 + 归属标记 |
| 读档行为 | **不自动重生**；以显式子实体数据为准，避免覆盖手动修改 |
| 重建行为 | 先完整校验新蓝图，通过后删除旧子实体并重新生成 |
| 旧存档 | 旧箱庭体素仍作为 building world 加载，不受移出配方影响 |
| 生成对齐 | 角色 / 交互物 0.5 格，其余 1 格；三轴均对齐 |
| 存档版本 | 已推进到 v21 |
| 实体类型注册 | `ENTITY_TYPE_VALUES` + `EntitySourceMap` + 元素列表分组三处必须同步 |
| 建筑世界归属 | `building_generator` 实体 id + world id 二元键；world 不是独立实体 |
| 建筑端口扩展 | 需新增结构原语写入、槽位锚点查询、批量加载返回 id |
| 组合层依赖 | `modes/` → `composition/` → `entity/`；`save_load/` 只依赖组合层类型 |

## 3. 第一阶段：从 Building 中移除箱庭

### 3.1 移除范围（已完成）

- `src/entity/building_generator/generators/structures.ts`
    - 删除 `garden` 生成器。
    - 删除仅供 `garden` 使用的 `wallPerimeter9`。
    - 从 `RECIPES` 删除 `garden`；`BUILDING_RECIPE_IDS` 自动缩短。
- `src/entity/building_generator/ui/labels.ts`
    - 删除 `garden: 'recipe.garden'` 映射。
- `src/i18n/locales/entity.ts`
    - 删除 `recipe.garden` 的类型声明、中文与英文文案。
- `src/modes/showcase/modules/terrain.ts`
    - 删除 `RECIPE_LABELS.garden`。
    - 删除 `RECIPE_SPECS` 中的 `garden` 条目。
    - 注释中的「12 种配方」改为「11 种」。
- `src/modes/showcase/showcase.md`
    - 同步配方数量与清单。
- `src/entity/building_generator/building_generator.md`
    - 第 58 行「六种配方」清单与实际不符，同步整理为移除 `garden` 后的 11 种顶层配方。
    - 第十二节「箱庭生成器与建筑结构」改为「建筑结构原语」，删除一键箱庭描述，注明箱庭已迁移至独立系统。
    - 文末「未实现：`generateHakoniwa()` 多世界编排」改为指向本文档的组合层设计。
- 根 `AGENTS.md`
    - 索引链接已存在，不需要新增；阶段 A 只更新状态文案。
    - 阶段 B 接入 `composition/` 后，再更新「项目结构」「分包原则」与依赖方向。

### 3.2 兼容性

- 旧存档中的箱庭是显式体素数据（palette + RLE），移除配方不会影响旧档加载。
- 旧档中的箱庭世界加载后 `recipe` 为 `saved`，仍作为普通建筑世界显示与编辑。
- 本阶段不新增箱庭实体，不修改存档版本。

## 4. 第二阶段：Diorama 系统架构

### 4.1 包结构

```text
src/composition/diorama/
├── diorama.md                  # 模块文档（实现后补齐）
├── types.ts                    # 蓝图、节点、槽位、锚点、人口规则、诊断
├── blueprint.ts                # 蓝图构造 / 校验 / 默认配方
├── plan.ts                     # 布局求解：变换、槽位、足迹、重叠校验
├── population.ts               # 规则式小物件生成
├── materialize.ts              # 经 ports 创建真实实体
├── ownership.ts                # 箱庭 → 子实体归属索引的读写封装
├── world.ts                    # DioramaContext（EntityInfoSource）
├── recipes/                    # 声明式箱庭配方
│   ├── index.ts
│   ├── fortress.ts
│   └── ...
└── ui/panel.ts                 # 箱庭面板
```

- 通用归属存储在 `src/types/ownership_store.ts`，避免 `save_load` 与 `composition` 互相依赖。
- 组合层测试与被测文件同目录，命名 `*.test.ts`，遵循仓库既有 vitest 约定。

### 4.2 分包与依赖方向

- 新增 `composition/` 分包，作为**组合层**。
- 依赖方向：

```text
modes/        ──► composition/ ──► entity/ ──► character/ / physics/ / render/ / skeleton/ / inventory/
composition/  ──► i18n/（叶子包）
save_load/    ──► composition/ 的类型（仅 import type）+ entity/ 的存档类型
```

- `entity/` 不得反向依赖 `composition/`。
- `composition/diorama/` 可以依赖各实体公开的上下文接口，用于创建 / 删除 / 查询子实体。
- `composition/diorama/` 不得直接引用 `building_generator/generators/` 内部实现；结构生成必须经建筑公开端口。
- `save_load` 只允许 `import type` 组合层类型；组合层的运行时实现不得被存档模块反向引入，避免运行时循环依赖。
- `scripts/check_architecture.mjs` 在阶段 B 增加规则：`entity/` 不得引用 `composition/`。

### 4.3 实体与存档

新增存档类型：

```ts
interface SavableDiorama {
    type: 'diorama'
    dioramaId: string
    blueprint: DioramaBlueprint
    seed: number
    origin: [number, number, number]
    yawQuarter: number
}
```

- `dioramaId` 为稳定字符串（创建时生成，读档后保持不变）。
- `blueprint` 保存完整节点图；读档后可继续编辑 / 重建。
- 子实体仍由各自系统显式保存；箱庭读档时**不自动重生**。
- `SAVE_FORMAT_VERSION` 已推进到 21。
- `EntityType` 定义在 `src/entity/constants.ts` 的 `ENTITY_TYPE_VALUES`，增加 `'diorama'` 后会触发以下穷举点，必须一并处理：
    - `src/save_load/types.ts` 的 `EntitySourceMap`：增加 `'diorama': DioramaContext`；
    - `src/ui/element_list_panel.ts` 的 `TYPE_GROUPS: Record<EntityType, EntityGroup>`：增加箱庭分组；
    - `src/types/spawnMode.ts` 的 `SpawnMode` 与 `src/modes/edit/spawn_mode.ts`、`src/ui/spawn_mode_panel.ts` 的模式列表；
    - `src/ui/spawn_mode_panel.ts` 的 `MODE_LABELS: Record<SpawnMode, StringLocaleKey>`。
- 校验层：`blueprint` 非法时安全回退为空蓝图 / 跳过该箱庭，不抛错；旧档缺失 `diorama` 正常加载。

### 4.3.1 归属字段

归属类型统一放在 `src/types/ownership_store.ts`：

```ts
interface DioramaOwner {
    dioramaId: string
    nodeId: string
}
```

- 所有可保存实体增加可选字段 `owner?: DioramaOwner`：
    - `SavableBox`
    - `SavableArea`
    - `SavableTerrain`
    - `SavableFragment`
    - `SavableInteractable`
    - `SavableItem`
    - `SavableCharacter`
    - `SavableDiorama`（箱庭自身通常不带 owner）
- **建筑世界不是独立实体**：`SavableBuildingGenerator` 只有一个实体条目，内部 `BuildingWorldSaveData[]` 才是具体世界。因此 `BuildingWorldSaveData` 也必须增加 `owner?: DioramaOwner`，归属键为 `building_generator` 实体 id + world id。
- zod 校验 schema 默认会剥掉未声明字段；`owner` 必须在每个 schema 中显式声明为可选对象。非法 `owner`（缺字段 / 非字符串）回退 `undefined`，但**保留实体本身**。
- 旧存档缺失 `owner` 时正常加载为 `undefined`。

### 4.4 蓝图模型

```ts
interface DioramaBlueprint {
    version: number
    recipeId: string
    seed: number
    nodes: DioramaNode[]
    population: PopulationRule[]
}

type DioramaNode =
    | BuildingNode
    | TerrainNode
    | AreaNode
    | ConnectionNode
    | GroupNode
```

- 每个节点有稳定 `nodeId`、相对箱庭根节点的 `position` / `yawQuarter`。
- `BuildingNode` 携带现有 `BuildingConfig`（`recipe` / `seed` / `sizeX` / `sizeY` / `sizeZ`）。
- `TerrainNode` 携带 `BaseTerrainConfig`。
- `AreaNode` 携带 `AreaConfig`（几何 + 视觉材质 + 可选物理场）。
- `GroupNode` 用于嵌套组织与整体变换。
- `ConnectionNode` 引用两个槽位，生成楼梯 / 旋转楼梯 / 廊桥等连接结构。

槽位与锚点：

```ts
interface DioramaSlot {
    id: string
    position: [number, number, number]
    dir: '+x' | '-x' | '+z' | '-z'
}
```

- 建筑 / 区域节点可显式声明槽位。
- building 端口需提供按配方推导的默认锚点，例如：
    - 房屋正门；
    - 主楼入口；
    - 楼梯上下端；
    - 廊桥两端。
- 连接节点的起点 / 终点由槽位世界坐标推导，不允许手填不一致的端点。

#### 4.4.1 建筑公开端口（已实现）

| 端口 | 实现 |
|---|---|
| 创建世界 | `add(config, x, y, z, yawQuarter?)` |
| 结构原语 | `stampStructure(id, spec)`：`stairs` / `spiral_stairs` / `corridor` / `pillar` / `dougong` / `pitched_roof` / `floor_slab` |
| 槽位锚点 | `getAnchors(id)` 返回世界局部坐标 + 朝向；默认锚点来自 `generators/anchors.ts`，合作层可直接调用 `buildingAnchors(config)` 做预规划 |
| 批量恢复 | `loadSaveWorlds(worlds)` 返回 `BuildingWorld[]` |
| 自由道具 | `placeProp` / `updateProp` / `removeProp` 直接复用 |

- 结构原语写入仍走 `BlockWriter`；组合层不得直接操作 `ChunkStore`。
- 组合层不得复制建筑配方几何逻辑。

### 4.5 人口规则

```ts
interface PopulationRule {
    id: string
    kind: 'character' | 'interactable' | 'item' | 'box' | 'decor'
    zoneId: string
    placement: 'ground' | 'roof' | 'interior' | 'anchor'
    count?: number
    density?: number
    params: ...
}
```

- 结构由节点图 + 槽位驱动。
- 小物件由规则式生成：
    - 确定性种子；
    - 最小间距；
    - 避开建筑 / 区域 / 连接结构足迹；
    - 按地形高度或指定锚点落地；
    - 生成数量设上限。
- 当前实体配置映射：
    - `character`：`CharacterSaveConfig`（`speed` / `jumpHeight` / `scale` / `faction` / `maxHealth` / `tendency` / `isPlayer` 必填；`bodyFormId` / `bodyState` / `equipment` / `originStrategy` / `chaseLeashRadius` / `flightEnabled` / `stamina` 等可选）。
    - `interactable`：9 种判别式配置 `save_point` / `teleport` / `switch` / `push_door_single` / `push_door_double` / `gate` / `chest` / `elevator` / `breakable`；信号联调走 `channel`。
    - `item`：`{defId, count}`。
    - `box`：统一 `BoxConfig`，特性通过配置对象启用。
    - `decor`：自由道具 `door` / `window` / `fence` / `lantern`，经建筑 `placeProp` 写入目标建筑世界。
- 地形落地使用 `TerrainContext.getHeightAt(worldX, worldZ, refY)`。
- `placement: 'roof' | 'interior'` 在未显式指定锚点时，自动使用 `zoneId` 对应建筑配方的 `roof` / `interior` 默认锚点；仍禁止组合层自行采样建筑网格。
- 生成数量与节点数量设常量上限，防止错误配方导致海量实体。

## 5. 生成流水线

```text
蓝图
→ 解析节点变换与槽位
→ 计算建筑 / 区域足迹
→ 校验重叠、连接端点、非法参数
→ 生成结构（terrain / area / building / connection）
→ 规则式填充小物件
→ 注册归属并返回诊断
```

- 所有阶段返回诊断，不抛错。
- 重建时先计算完整计划并通过校验，再删除旧子实体；校验失败保留旧箱庭。
- 所有随机数按 `seed + nodeId + ruleId` 派生，保证局部修改不影响其它节点。建筑生成继续使用 `generators/rng.ts` 的确定性 RNG 语义。
- 结构生成只经各实体端口；箱庭自身不直接写体素、不直接建物理体。
- 生成发生在编辑操作 / 读档恢复阶段，不在固定物理步内；大量建筑体素仍由既有 `building.updateView(camera, dt)` 摊还构建，首次可见允许渐次出现。
- 生成数量与节点数量设常量上限，防止错误配方导致海量实体。

## 6. 归属与生命周期

### 6.1 存档归属标记

- 每个可保存实体与每个建筑世界增加可选 `owner`（见 §4.3.1）。
- 旧存档缺失时安全回退 `undefined`。
- 校验层非法归属回退 `undefined`，不丢弃实体。

### 6.2 运行时归属索引

新增 `src/types/ownership_store.ts`：

```ts
interface OwnedRef {
    type: EntityType
    runtimeId: number
}

interface OwnershipStore {
    set(ref: OwnedRef, owner: DioramaOwner): void
    get(ref: OwnedRef): DioramaOwner | undefined
    entriesOf(dioramaId: string, isValid: (ref: OwnedRef) => boolean): OwnershipEntry[]
    remove(ref: OwnedRef): void
    clear(): void
}
```

> 实现对建筑世界采用简化键：`building_generator` 的系统 entity id 就是建筑世界 id，因此 `{type, runtimeId}` 已能区分同一存档条目内的多个世界。

- `main.ts` 创建单例并传给 `collectWorldState` / `loadWorldFromData`。
- 序列化时由 registry 给实体（以及建筑世界）追加 `owner`。
- 反序列化时在每次 `add` 后按 `owner` 注册运行时 id。
- 建筑 / 交互物 / 掉落物的批量加载接口返回与输入等长的 id 列表，供反序列化按顺序注册：
    - `BuildingGeneratorContext.loadSaveWorlds` → `BuildingWorld[]`；
    - `InteractableContext.loadSave` / `ItemEntityContext.loadSave` → `(number | undefined)[]`；
    - `ItemEntityContext.loadSave` → id 列表。
- 建筑归属必须同时记录实体 id 与 world id；只记录实体 id 会把同一 `building_generator` 下的所有世界混在一起。
- `clearWorld()` 与快照还原时清空 registry。
- registry 访问时裁剪已被手动删除的失效 id。

### 6.3 生命周期

- **生成**：每创建一个子实体立即登记归属；建筑世界在 `add` / `stampStructure` 后按 world id 登记。
- **删除箱庭**：按归属索引删除全部子实体与建筑世界，再删除箱庭实体。
- **重建**：先校验新蓝图，通过后删除旧子实体并重新生成。
- **移动 / 旋转箱庭**：对全部归属子实体施加同一变换。建筑世界通过 `setTransform` 同步更新 `yawQuarter`；角色等不支持任意旋转的系统只同步位置与朝向。
- **子实体被手动删除**：registry 裁剪失效 id，不影响其余实体。
- **读档**：子实体按显式存档恢复，箱庭只恢复蓝图与根变换，不自动重生。建筑世界归属随 `BuildingWorldSaveData.owner` 恢复。

## 7. 编辑模式集成

- `SpawnMode`（`src/types/spawnMode.ts`）增加 `'diorama'`。
- `src/modes/edit/spawn_mode.ts` 与 `src/ui/spawn_mode_panel.ts` 增加「箱庭」循环项；`MODE_LABELS` 增加 `spawn.diorama`。
- `src/ui/element_list_panel.ts` 增加箱庭分组：
    - `ENTITY_GROUPS` 增加 `'diorama'`；
    - `TYPE_GROUPS` 增加 `diorama: 'diorama'`；
    - `GROUP_LABELS` 增加 `element.group.diorama`；
    - `GROUP_ORDER` 决定箱庭分组位置。
- `spawnAt` 在整数格点生成默认箱庭。
- 箱庭自身不提供可拾取网格：`getMeshes()` 返回空数组，通过元素列表选中，避免与子实体点击选择冲突。
- 箱庭面板：
    - 配方选择；
    - 种子；
    - 尺度 / 密度参数；
    - 「重建」；
    - 「删除箱庭及子实体」；
    - 子实体行嵌套在箱庭行下方（`.dc-list-children` 缩进容器，归属失效自动回退）；
    - 校验诊断（重叠、缺失槽位、非法配方）；
    - 结构化 GUI 编辑器：节点列表 / 添加删除、按类型的节点参数、人口规则列表 / 添加删除与各类型参数；「应用修改」提交草稿；
    - 高级 JSON 折叠区保留给分组节点等复杂结构（经 `parseDioramaBlueprintJson` 注入，组合层不依赖存档模块）。
- 面板文案按当前 i18n 结构落位：
    - 文案键类型：`src/i18n/index.ts`；
    - 中英文：`src/i18n/zh_cn.ts`、`src/i18n/en.ts`；
    - 领域文案（如配方名）可放 `src/i18n/locales/entity.ts` 或新建 `locales/diorama.ts`。
- 首版以代码配方 + 顶层参数为主；高级节点图编辑器后续再做。

## 8. 编辑模式生成对齐

### 8.1 规则

- 在 `modes/edit/pointer_interaction.ts` 的 `spawnAtScreen` 内、调用 `source.spawnAt` 前统一对齐。
- 新增 `modes/edit/spawn_alignment.ts`：

```ts
const step = mode === 'character' || mode === 'interactable' ? 0.5 : 1
aligned = Math.round(value / step) * step
```

- 三轴均对齐。
- 鼠标生成与键盘生成都经过同一路径；命中物与射线远点两条分支已在 `spawnAtScreen` 内汇合，因此只需对齐一次。
- 仅影响「生成物体」Ctrl+左键；不影响建筑笔刷、Gizmo、读档。
- 未来 `diorama` 使用 1 格。

### 8.2 边界处理

- 负坐标按 `Math.round` 处理。
- `-0` 归一为 `0`。
- 对齐后的值不得引入浮点尾差：半格使用 `Math.round(v * 2) / 2`。
- 对齐可能让命中表面的实体略微抬高或嵌入；这是明确的设计取舍。

## 9. 测试计划

### 9.1 移除箱庭

- building 配方列表不包含 `garden`。
- showcase 只展示 11 种配方。
- 旧存档中的箱庭体素仍能加载。

### 9.2 生成对齐

- 纯函数单测：
    - 整数 / 半格；
    - 负数；
    - `-0` 归一；
    - 各 `SpawnMode` 的步长映射。
- 集成测试：生成普通实体与角色 / 交互物，检查存档坐标是否为 1 / 0.5 的倍数。

### 9.3 箱庭

- 蓝图校验、节点变换、槽位 / 锚点解析。
- 重叠 / 连接端点诊断。
- 规则式生成确定性、避让、数量上限。
- 归属序列化 / 反序列化、删除级联、重建替换：
    - 实体级归属；
    - `building_generator` 的 world 级归属；
    - 归属索引在手动删除后的失效 id 裁剪；
    - 面板重建 / 蓝图 JSON 替换后旧产物清零；
    - 读档后重建仍清空旧子实体。
- 读档不自动重生、子实体显式恢复。
- 非法蓝图不破坏旧子实体。
- 旧档缺失 `owner` / `diorama` 正常加载；非法 `owner` 只被丢弃，实体保留。
- 集成测试：
    - 生成箱庭 → 存档含 `type:'diorama'` 与子实体 `owner`；
    - 重新载入 → 子实体存在且归属恢复；
    - 删除箱庭 → 子实体一并消失。

### 9.4 架构与构建

- `pnpm check:architecture` 通过；阶段 B 增加 `entity → composition` 禁止规则。
- `pnpm type-check` 覆盖新增 `EntityType` / `SpawnMode` 穷举。
- 阶段收尾运行 `pnpm verify`。

## 10. 实施阶段

1. **阶段 A（已完成）**：移除 `garden`、更新 showcase / i18n / 文档；实现生成坐标对齐并补测试。
2. **阶段 B0（已完成）**：扩展建筑与批量加载端口：
    - `add` 支持 `yawQuarter`；
    - `stampStructure`；
    - `getAnchors`；
    - `loadSaveWorlds` / `loadSave` 返回运行时 id；
    - `BuildingWorldSaveData.owner`。
3. **阶段 B（已完成）**：建立 `composition/diorama` 的类型、蓝图校验、plan / population / materialize / ownership 与存档接入：
    - 新增 `EntityType` / `SpawnMode` / `EntitySourceMap` / 元素列表分组 / i18n 文案；
    - 存档版本推进到 21；
    - 架构检查加入 `entity` 反向依赖规则。
4. **阶段 C（基础版已完成）**：首个配方 `fortress`（平坦台地 + 平房 + 主楼 + 廊桥 + 小物件），接入编辑模式面板、重建 / 删除 / 移动。
5. **阶段 D（基础版已完成）**：屋顶 / 室内默认锚点、箱庭子实体嵌套列表、结构化 GUI 编辑器（高级 JSON 折叠区保留）。可视化节点图编辑与体素级表面高度采样仍待扩展。

## 11. 风险与约束

- **跨实体依赖**：箱庭必须只通过公开上下文接口操作其它实体，禁止直接引用实体内部实现。
- **建筑端口边界**：组合层只能使用 `add` / `stampStructure` / `getAnchors` / `placeProp` 等公开端口；不得直接引用 `generators/architecture.ts` 或在组合层复制配方几何。
- **建筑世界归属粒度**：`building_generator` 的系统 entity id 就是建筑世界 id；归属键已能区分同一存档条目内的多个世界，禁止再额外按位置 / 索引恢复归属。
- **批量加载 id**：building / interactable / item 的批量加载返回对齐 id；新增批量接口时必须同步返回，否则无法恢复归属。
- **`owner` 被校验层剥离**：zod 默认丢弃未声明字段；每个 schema 都要显式声明 `owner` 可选字段。
- **穷举编译点**：新增 `EntityType` / `SpawnMode` 会触发元素列表、生成面板、i18n 类型等 `Record` 穷举错误，必须一次改全。
- **存档一致性**：蓝图与显式子实体可能因手动修改而不一致；重建必须以显式子实体为当前权威，并在面板提示重建会覆盖手动修改。
- **生成性能**：大量建筑世界会触发 chunk 网格与碰撞体摊还构建；配方需限制节点数量，并提示首次生成的渐次可见。
- **屋顶 / 室内锚点**：当前基于配方默认锚点，不保证贴合实际屋面 / 楼板；需要精确落点时再扩展建筑体素表面查询端口。
- **旧档兼容**：新增 `owner` / `diorama` / world 级 `owner` 必须可选；单个箱庭非法按元素粒度跳过，不得整档失败。
- **命名冲突**：`modes/play/hakoniwa.ts` 已存在且语义不同（背包 / 装备 / 地图 / 传送），新系统统一使用 `diorama` 作为代码标识，避免混淆。
- **版本推进**：当前存档版本为 21；若并行合入其它存档改动，以实际最新版本为基线继续递增，并在 `save_load.md` 记录本次版本语义。
