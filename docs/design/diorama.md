# 箱庭（Diorama）完全重构 + 编辑模式生成对齐 设计

> 状态：**设计完成，尚未实现**。本文档是实施计划与决策记录，代码仍保持现状（`building_generator` 仍包含 `garden` 配方）。实施时按「实施阶段」推进，并同步更新相关模块同名文档与根 `AGENTS.md`。
>
> 本文档包含两部分：
> 1. **箱庭完全重构**：把箱庭从 building 配方中拆出，建立支持复杂组合式生成的独立系统。
> 2. **编辑模式生成对齐**：Ctrl+左键生成实体时，按实体类别对齐到整数格点或 1/2 格点。
>
> 面向读者：建筑 / 箱庭组合 / 地形 / 交互物 / 角色 AI / 存档 / UI / 编辑模式相关实现者。

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
| 与已有 `modes/play/hakoniwa.ts` 的关系 | 无关；后者是背包 / 地图 / 传送子系统，新系统不复用该命名 |
| 箱庭实体 | 持久化蓝图实体，可重新编辑与重建 |
| 组合内容 | 建筑体素世界、地形、区域、连接结构、交互物、掉落物、角色 AI、装饰、箱子 |
| 结构生成模型 | 声明式节点图 + 槽位约束 |
| 小物件生成模型 | 规则式程序生成，确定性种子 |
| 子实体存档 | 蓝图 + 显式子实体存档 + 归属标记 |
| 读档行为 | **不自动重生**；以显式子实体数据为准，避免覆盖手动修改 |
| 重建行为 | 先完整校验新蓝图，通过后删除旧子实体并重新生成 |
| 旧存档 | 旧箱庭体素仍作为 building world 加载，不受移出配方影响 |
| 生成对齐 | 角色 / 交互物 0.5 格，其余 1 格；三轴均对齐 |

## 3. 第一阶段：从 Building 中移除箱庭

### 3.1 移除范围

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
    - 第四节配方列表删除 `garden`。
    - 第十二节「箱庭生成器与建筑结构」改为「建筑结构原语」，删除一键箱庭描述，注明箱庭已迁移至独立系统。
- 根 `AGENTS.md`
    - 模块文档索引新增箱庭设计文档链接。

### 3.2 兼容性

- 旧存档中的箱庭是显式体素数据（palette + RLE），移除配方不会影响旧档加载。
- 旧档中的箱庭世界加载后 `recipe` 为 `saved`，仍作为普通建筑世界显示与编辑。
- 本阶段不新增箱庭实体，不修改存档版本。

## 4. 第二阶段：Diorama 系统架构

### 4.1 包结构

```text
src/composition/diorama/
├── diorama.md                  # 模块文档（实现后补齐）
├── types.ts                    # 蓝图、节点、槽位、人口规则、诊断
├── blueprint.ts                # 蓝图构造 / 校验 / 默认配方
├── plan.ts                     # 布局求解：变换、槽位、足迹、重叠校验
├── population.ts               # 规则式小物件生成
├── materialize.ts              # 经 ports 创建真实实体
├── ownership.ts                # 箱庭 → 子实体归属索引
├── world.ts                    # DioramaContext（EntityInfoSource）
├── recipes/                    # 声明式箱庭配方
│   ├── index.ts
│   ├── fortress.ts
│   └── ...
└── ui/panel.ts                 # 箱庭面板
```

### 4.2 分包与依赖方向

- 新增 `composition/` 分包，作为**组合层**。
- 依赖方向：

```text
modes/  ──► composition/ ──► entity/ ──► character/ / physics/ / render/
save_load/ ──► composition/ 的类型 + entity/ 的存档类型
```

- `entity/` 不得反向依赖 `composition/`。
- `composition/diorama/` 可以依赖各实体公开的上下文接口，用于创建 / 删除 / 查询子实体。
- 通用归属索引放在 `src/types/ownership_store.ts`，避免 `save_load` 与 `composition` 互相依赖。

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
- `SAVE_FORMAT_VERSION` 以当前 `types.ts` 的 16 为基线，实施时推进到 17。
- `EntityType` 增加 `'diorama'`，`EntitySourceMap` 增加 `'diorama': DioramaContext`。
- 校验层：`blueprint` 非法时安全回退为空蓝图 / 跳过该箱庭，不抛错；旧档缺失 `diorama` 正常加载。

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
- `BuildingNode` 携带现有 `BuildingConfig`。
- `TerrainNode` 携带 `BaseTerrainConfig`。
- `AreaNode` 携带 `AreaConfig`。
- `GroupNode` 用于嵌套组织与整体变换。
- `ConnectionNode` 引用两个槽位，生成楼梯 / 旋转楼梯 / 廊桥等连接结构。

槽位：

```ts
interface DioramaSlot {
    id: string
    position: [number, number, number]
    dir: '+x' | '-x' | '+z' | '-z'
}
```

- 建筑 / 区域节点可显式声明槽位。
- building 端口可提供按配方推导的默认锚点，例如：
    - 房屋正门；
    - 主楼入口；
    - 楼梯上下端；
    - 廊桥两端。
- 连接节点的起点 / 终点由槽位世界坐标推导，不允许手填不一致的端点。

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
- `decor` 装饰优先通过 building 端口的自由道具接口写入目标建筑世界。
- 角色生成时写入角色配置与 AI 参数。

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
- 所有随机数按 `seed + nodeId + ruleId` 派生，保证局部修改不影响其它节点。
- 结构生成只经各实体端口；箱庭自身不直接写体素、不直接建物理体。
- 生成数量与节点数量设常量上限，防止错误配方导致海量实体。

## 6. 归属与生命周期

### 6.1 存档归属标记

每个可保存实体增加可选字段：

```ts
owner?: {
    dioramaId: string
    nodeId: string
}
```

- 旧存档缺失时安全回退 `undefined`。
- 校验层非法归属回退 `undefined`，不丢弃实体。

### 6.2 运行时归属索引

新增 `src/types/ownership_store.ts`：

```ts
interface OwnershipStore {
    set(type, runtimeId, owner): void
    get(type, runtimeId): owner | undefined
    entriesOf(dioramaId): Array<{type, runtimeId, nodeId}>
    remove(type, runtimeId): void
    clear(): void
}
```

- `main.ts` 创建单例并传给 `collectWorldState` / `loadWorldFromData`。
- 序列化时由 registry 给实体追加 `owner`。
- 反序列化时在每次 `add` 后按 `owner` 注册运行时 id。
- building / interactable / item 的批量加载接口需返回创建出的运行时 id 列表，供反序列化按顺序注册。
- `clearWorld()` 与快照还原时清空 registry。
- registry 访问时裁剪已被手动删除的失效 id。

### 6.3 生命周期

- **生成**：每创建一个子实体立即登记归属。
- **删除箱庭**：按归属索引删除全部子实体，再删除箱庭实体。
- **重建**：先校验新蓝图，通过后删除旧子实体并重新生成。
- **移动 / 旋转箱庭**：对全部归属子实体施加同一变换。
- **子实体被手动删除**：registry 裁剪失效 id，不影响其余实体。
- **读档**：子实体按显式存档恢复，箱庭只恢复蓝图与根变换，不自动重生。

## 7. 编辑模式集成

- `SpawnMode` 增加 `'diorama'`。
- 生成面板 / 模式循环 / `spawn_mode_panel.ts` 增加「箱庭」。
- `spawnAt` 在整数格点生成默认箱庭。
- 箱庭自身不提供可拾取网格；通过元素列表选中，避免与子实体点击选择冲突。
- 箱庭面板：
    - 配方选择；
    - 种子；
    - 尺度 / 密度参数；
    - 「重建」；
    - 「删除箱庭及子实体」；
    - 子实体按节点分组列表；
    - 校验诊断（重叠、缺失槽位、非法配方）。
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
- 鼠标生成与键盘生成都经过同一路径。
- 命中物与射线远点两条分支都对齐。
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

- 蓝图校验、节点变换、槽位解析。
- 重叠 / 连接端点诊断。
- 规则式生成确定性、避让、数量上限。
- 归属序列化 / 反序列化、删除级联、重建替换。
- 读档不自动重生、子实体显式恢复。
- 非法蓝图不破坏旧子实体。
- 集成测试：
    - 生成箱庭 → 存档含 `type:'diorama'` 与子实体 `owner`；
    - 重新载入 → 子实体存在且归属恢复；
    - 删除箱庭 → 子实体一并消失。

## 10. 实施阶段

1. **阶段 A**：移除 `garden`、更新 showcase / i18n / 文档；实现生成坐标对齐并补测试。
2. **阶段 B**：建立 `composition/diorama` 的类型、蓝图校验、plan / materialize / ownership 骨架与存档接入。
3. **阶段 C**：实现首个复杂配方（如城堡 / 寺院 / 集市），接入编辑模式面板、重建 / 删除 / 移动。
4. **阶段 D**：扩展槽位推导、人口规则、箱庭子实体分组 UI 与高级节点编辑。

## 11. 风险与约束

- **跨实体依赖**：箱庭必须只通过公开上下文接口操作其它实体，禁止直接引用实体内部实现。
- **存档一致性**：蓝图与显式子实体可能因手动修改而不一致；重建必须以显式子实体为当前权威，并在面板提示重建会覆盖手动修改。
- **批量加载 id**：building / interactable / item 的批量加载需补返回 id，否则无法恢复归属。
- **生成性能**：大量建筑世界会触发 chunk 网格与碰撞体摊还构建；配方需限制节点数量，并提示首次生成的渐次可见。
- **旧档兼容**：新增 `owner` / `diorama` 字段必须可选；单个箱庭非法按元素粒度跳过，不得整档失败。
- **命名冲突**：`modes/play/hakoniwa.ts` 已存在且语义不同，新系统统一使用 `diorama` 作为代码标识，避免混淆。
