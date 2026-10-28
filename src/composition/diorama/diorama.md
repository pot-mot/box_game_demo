# 箱庭组合层（composition/diorama）

面向「可保存、可重新编辑、由多种实体组合而成」的箱庭系统。箱庭不属于 `building_generator` 配方，而是一个**蓝图实体**：保存声明式节点图与根变换，子实体由各实体系统显式保存并带归属标记。

## 当前范围

已实现：

- 蓝图节点：`building` / `terrain` / `area` / `connection` / `group`。
- 布局求解：组变换叠加、建筑 / 地形 / 区域足迹、槽位与连接端点、重叠诊断。
- 规则式人口：确定性种子、最小间距、避开建筑 / 区域足迹、数量上限。
- 实体创建：经各实体公开端口创建建筑世界、地形、区域、箱子、交互物、掉落物、角色、自由道具。
- 归属索引：按 `type + runtimeId` 记录；`building_generator` 的 runtimeId 即建筑世界 id。
- 存档：`diorama` 实体保存蓝图 + 根变换；子实体保存 `owner`，**读档不自动重生**。
- 编辑模式：生成类型「箱庭」、整数格点生成、箱庭面板（配方 / 种子 / 按配方重建 / 结构化节点与人口规则编辑器 / 删除 / 诊断）。
- 元素列表：归属子实体嵌套在对应箱庭行下方并缩进显示。
- 整体移动 / 旋转：按根变换换算全部归属子实体。

后续扩展：

- 更多配方与更细的按配方槽位推导。
- 可视化节点图编辑（当前高级编辑为蓝图 JSON）。
- 基于体素采样的精确建筑表面高度查询（当前屋顶 / 室内使用配方锚点）。

## 目录

```text
composition/diorama/
├── diorama.md          # 本文档
├── types.ts            # 蓝图、节点、槽位、人口规则、诊断、上下文与端口
├── blueprint.ts        # 运行时结构校验、默认空蓝图、深拷贝
├── plan.ts             # 组变换 / 足迹 / 槽位 / 连接端点求解
├── population.ts       # 规则式小物件生成
├── materialize.ts      # 经实体端口创建并登记归属
├── ownership.ts        # 归属枚举、级联删除、整体变换
├── world.ts            # DioramaContext（EntityInfoSource 实现）
├── recipes/
│   ├── index.ts        # 配方注册表
│   ├── fortress.ts     # 示例配方：台地 + 平房 + 主楼 + 廊桥
│   └── dungeon.ts      # 复杂地牢：不规则房间 / 多层 / 门闸 / 升降梯
└── ui/panel.ts         # 箱庭属性面板
```

## 蓝图

```ts
interface DioramaBlueprint {
    version: number
    recipeId: string
    seed: number
    nodes: DioramaNode[]
    population: PopulationRule[]
}
```

- 节点坐标是**相对箱庭根**的局部坐标；`group` 的旋转与位移按层级叠加。
- `building` 使用现有 `BuildingConfig`，其默认锚点来自 `buildingAnchors(config)`；`slots` 可追加显式槽位。常见配方提供 `door` / `interior` / `roof` / `gate` / `tower_*` 等锚点，屋顶 / 室内人口规则可直接使用分区建筑的默认锚点。
- `connection` 用 `fromNodeId/fromSlotId` 与 `toNodeId/toSlotId` 引用锚点，禁止手填世界端点。结构在 `hostNodeId`（缺省 = 起点建筑）的世界内生成：
    - `corridor`：宿主局部坐标的曼哈顿折线；
    - `stairs`：要求两端共享宿主局部 X 或 Z 轴，且终点更高。
- 蓝图版本为 `DIORAMA_BLUEPRINT_VERSION = 1`，与存档格式版本解耦。

## 生成流水线

```text
蓝图
→ validateBlueprint（结构 / 上限 / 槽位引用）
→ solveDioramaPlan（组变换、足迹、槽位、连接端点、重叠）
→ generatePopulation（确定性种子、避让、数量上限）
→ materializeDiorama（经端口创建、登记归属）
→ 返回诊断
```

- 校验失败不执行重建，旧子实体保持不变。
- 重建顺序：校验 → 删除旧归属子实体 → 重新生成。以显式子实体为当前权威，手动修改会在重建时被覆盖。
- 生成不在固定物理步内执行；大体量建筑仍由建筑层 `updateView` 摊还构建。

## 实体端口与依赖方向

`DioramaPorts` 由 `main.ts` 装配：

| 端口 | 用途 |
|---|---|
| `building` | 建筑世界、结构原语、自由道具 |
| `terrain` | 地形创建与 `getHeightAt` |
| `area` | 区域创建 |
| `box` / `interactable` / `item` / `character` | 人口小物件 |
| `ownership` | 归属索引 |

- `composition/` 只依赖各实体公开接口与 `src/types/ownership_store.ts`。
- `entity/` 禁止反向依赖 `composition/`（`scripts/check_architecture.mjs` 已加规则）。
- `save_load/types.ts` 仅以 `import type` 引用 `DioramaBlueprint` / `DioramaContext`。

## 归属与存档

- 归属类型：`{dioramaId, nodeId}`。
- 运行时索引键：`{type, runtimeId}`。一个 `building_generator` 存档条目可在内部包含多个建筑世界，但每个世界在运行时有自己的 id，因此归属不会把同一条目下的世界混在一起。
- 子实体存档字段 `owner?: DioramaOwner`；建筑世界在 `BuildingWorldSaveData.owner`。
- 反序列化：
    - 普通实体在 `add` 后按 owner 登记；
    - 交互物 / 掉落物按批量加载返回的等长 id 列表登记；
    - 建筑世界按 `loadSaveWorlds` 返回的 world id 登记；
    - 箱庭自身以 `materialize = false` 恢复，不重生子实体。
- `main.ts` 的 `clearWorld()` 同时清空归属索引。
- `owner` 缺失 / 非法时安全回退 `undefined`，实体保留。

## 编辑模式集成

- `SpawnMode` 增加 `diorama`；`src/modes/edit/spawn_mode.ts` 与 `src/ui/spawn_mode_panel.ts` 同步。
- 生成坐标由 `spawn_alignment.ts` 统一对齐：箱庭使用整数格点。
- 箱庭无拾取网格（`getMeshes()` 为空），通过元素列表选中；根 `Group` 供 Gizmo 跟随。
- 面板：
    - 顶部：配方、种子、按配方重建、删除箱庭及子实体。
    - 结构节点编辑器：节点列表 + 添加 / 删除；选中后按类型编辑 ID、偏航、位置、配方 / 地形 / 区域 / 连接参数。
    - 人口规则编辑器：规则列表 + 添加 / 删除；编辑分区、放置方式、数量、间距、锚点与各类型参数（箱子 / 掉落物 / 交互物 / 装饰 / 角色）。
    - 「应用修改」只提交当前草稿，不会因子面板失焦被逐帧刷新覆盖；有未应用修改时显示提示。
    - 高级 `JSON` 折叠区保留给分组节点等复杂结构，经 `parseDioramaBlueprintJson` 注入解析，组合层不依赖存档模块。
- 元素列表：`setupElementListPanel` 接收归属索引与 `dioramaIdToEntityId`，把子实体行插入箱庭行下方的 `.dc-list-children` 缩进容器；归属失效时自动回到原类型分组。
- 删除箱庭会级联删除全部归属子实体；移动 / 旋转按根变换换算子实体位姿。

## 常量与上限

- `MAX_DIORAMA_NODES = 64`
- `MAX_POPULATION_RULES = 64`
- `MAX_POPULATION_TOTAL = 256`
- 人口规则未给 `count` 且给 `density` 时，按分区面积 / 16 估算数量。

## 测试

- `blueprint.test.ts`：示例配方、重复节点、缺失槽位、缺失分区。
- `plan.test.ts`：槽位旋转、组变换、足迹重叠、连接端点。
- `population.test.ts`：确定性、避让、数量上限。
- `world.test.ts`：生成 / 重建 / 级联删除 / 存档往返不重复生成。
- `fortress.test.ts`：示例配方经全部实体端口生成结构、小物件与归属；面板重建 / GUI 添加规则 / JSON 替换后旧产物清零；用户编辑的种子 / JSON 不被逐帧刷新覆盖；读档后重建仍清空旧子实体。
- `recipes/dungeon.test.ts`：地牢蓝图结构校验、槽位可解析与交互物种类。
- `dungeon_world.test.ts`：地牢配方经全部端口生成建筑、门闸、升降梯、开关与箱子。
- `element_list_panel.test.ts`：箱庭子实体嵌套与归属失效回退。
- `save_load/validation.test.ts`：箱庭元素、非法蓝图跳过、owner 校验、建筑世界 owner。
- `modes/edit/spawn_alignment.test.ts`：生成对齐步长与边界。

## 扩展指南

1. **新增配方**：在 `recipes/` 实现 `(seed) => DioramaBlueprint` 并登记到 `recipes/index.ts`；在 i18n 增加 `diorama.recipe.<id>`。
2. **地牢配方**：房间 / 廊道 / 楼梯由 `entity/building_generator/generators/dungeon.ts` 写入体素；门 / 闸门 / 升降梯 / 开关通过 `generateDungeonLayout` 的锚点转换为人口规则，组合层不直接写交互物。
3. **多层连接**：布局对重叠房间按种子选择旋转楼梯或升降梯 + 开关；电梯开关共享 channel。
4. **新增节点类型**：更新 `types.ts` 判别联合 → `blueprint.ts` 校验 → `plan.ts` 变换 / 足迹 → `materialize.ts` 端口创建 → 存档 zod schema。
5. **新增人口规则**：更新 `PopulationRule`、zod schema、`population.ts` 生成与 `materialize.ts` 创建。
6. **新增实体端口**：不得直接操作实体内部；先扩展对应实体的公开上下文接口。

## 陷阱

- **建筑世界归属粒度**：不要把同一 `building_generator` 下的多个世界合并成一个归属键；运行时世界 id 才是唯一标识。
- **读档不重生**：反序列化箱庭必须传 `materialize = false`，否则会与显式子实体重复。
- **owner 必须显式声明**：zod 默认剥离未声明字段；新增可保存实体时要同步加入 `OwnerSchema`。
- **连接端点**：楼梯在宿主局部坐标必须轴对齐；跨旋转建筑的端点需先换算到宿主局部坐标。
- **足迹重叠**：地形作为基底不参与实体足迹重叠；建筑 / 区域互相重叠会报错并阻止重建。
- **生成性能**：配方节点数量受上限约束，大量建筑体素仍由建筑层摊还构建。
- **面板重建覆盖手动修改**：重建前先校验，校验失败保留旧子实体。
