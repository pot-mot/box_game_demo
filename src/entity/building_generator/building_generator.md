# 建筑生成系统（building_generator）

面向「结构化搭建建筑物 / 地图 / 复杂场景」的体素系统，目标是在**同一存档内容纳数万 block / 实例**，并做到局部渲染、表面剔除与远处卸载。

## 约定

- 以「建筑世界」为实体、内部承载数万体素 block：数据为稀疏 `Map<chunkKey, Uint8Array>`（0=空，1..7 = `render/materials/` 的材质索引）。
- 渲染按 `CHUNK_SIZE³` 分块做**贪心网格合并**（同材质矩形面合并，UV 以格展开配合可平铺纹理），每 chunk 一个 `Mesh` + 按材质分组的共享材质单例（draw call = chunk 内材质数）；两级绘制（近处全细节、中距离按 `LOD_STRIDE` 降采样为粗 LOD）、超出 `LOD_CHUNK_RADIUS + 滞回` 距离卸载（只释放 GPU 几何、保留体素数据）；近处 chunk 合并为 trimesh collider。
- 静态建筑不参与物理步进；可见性更新由 `main.ts` 每帧调用 `updateView(camera, dt)`（对「帧内逻辑集中在 preSync」的有意例外）。
- 生成配方仅用于创作期，存档以显式 RLE 体素数据为准。
- 编辑模式提供体素拾取与笔刷（放置 / 擦除 / 道具 / 区域填充 / 区域替换 / 预制体，`edit/brush.ts`）；区域类工具第一次单击后显示预览线框、选中世界显示包围盒高亮（`render/overlay.ts`）。自由道具（门 / 窗 / 栅栏 / 灯笼，`props/kinds.ts` + `render/prop_mesh.ts`）为纯视觉装饰，不建碰撞体、不进 `getMeshes()`。
- 建筑结构原语 `generators/architecture.ts` 只能通过轴对齐 `BlockWriter.set/clear` 写入：旋转 / 镜像一律在结构函数内部做坐标变换（`rotateQuarter`），斜屋顶檐口外扩、楼梯每级高差 1、廊桥自动落支柱至地面；新增顶层配方登记到 `structures.ts` 的 `RECIPES`（未知配方回退 house）。

## 一、总体架构

```
建筑世界（BuildingWorld，= 面板中的一个实体）
├── 体素网格（grid/）      稀疏 chunk 存储，palette 索引，RLE 压缩
├── 渲染层（render/）      贪心网格合并 + 逐材质分组 + 距离卸载
└── 物理层（physics/）     近处 chunk 合并 trimesh collider
基础表面材质库（render/materials/）  7 种可平铺纹理 + 共享 MeshStandardMaterial
```

- **数量语义**：面板中一个「建筑世界」是实体；其内部可含数万 block。数万规模来自 block 而非实体条目。
- **渲染解耦**：渲染与物理均按**空间 chunk**（`CHUNK_SIZE³`）组织，与生成配方无关；同一 chunk 的网格只构建一次。
- **代表性 chunk 立方体**：`CHUNK_SIZE = 16`、`VOXEL_SIZE = 1`。

## 二、基础表面材质库（`render/materials/`）

| 文件 | 职责 |
|------|------|
| `ids.ts` | `SURFACE_MATERIAL_IDS = ['rock','soil','brick','wood','rusty_iron','tile','cloth']`；id↔体素索引（0 = 空） |
| `defs.ts` | 每种材质的底色 / 粗糙度 / 金属度 / 图案种类 |
| `patterns.ts` | 程序化图案绘制（噪声 / 砖缝 / 木纹 / 瓷砖格 / 织物 / 锈斑），固定种子保证可复现 |
| `textures.ts` | `buildSurfaceTexture(id)`：每种材质一张可平铺 `CanvasTexture`（`RepeatWrapping` + `NearestFilter` + 无 mipmap） |
| `index.ts` | `getSurfaceMaterials()`：**单例共享** `MeshStandardMaterial[]`（下标 = 体素索引 − 1）；`getSurfaceMaterial(id)` 按 id 取 |

- 每种材质用**独立可平铺纹理**（而非图集），这样贪心合并出的任意尺寸四边形只需把 UV 以「格」为单位展开（0..宽/高），纹理自然重复、保持每块密度；材质按 `geometry.addGroup` 分组，chunk 网格用共享材质数组渲染。
- 一个 chunk 的 **draw call = 该 chunk 出现的材质数**（通常 1–3，上限 7），换来贪心合并后大幅降低的三角形数；相比之下图集方案虽固定 1 draw call，却无法在合并四边形上按块平铺纹理。
- 纹理采用 `NearestFilter` + `generateMipmaps = false`，保持方块像素风并避免远处串色。
- 粗糙度 / 金属度为每种材质的标量（来自 `defs.ts`），无需 ORM 贴图。

## 三、体素网格（`entity/building_generator/grid/`）

| 文件 | 职责 |
|------|------|
| `block_world.ts` | 稀疏 `Map<chunkKey, Uint8Array>`；`getBlock` / `setBlock` 支持负坐标与跨 chunk 边界查询 |
| `rle.ts` | 每 chunk RLE 编解码（3 字节游程 → Base64），长度 / 格式不符返回 `undefined` |
| `world_codec.ts` | `encodeWorldChunks` / `decodeWorldChunks`：调色板收集 + 局部索引重映射 |

- 体素值 0 = 空，1..7 = `SURFACE_MATERIAL_IDS` 顺序。
- 块坐标以最小角对齐：block `(x,y,z)` 占据 `[x·V,(x+1)·V]`，y=0 即贴地。
- 跨 chunk 边界的面剔除通过统一的 `getBlock()` 查询，保证接缝连续（不会出现可见裂缝或重复面）。

## 四、生成器（`entity/building_generator/generators/`）

- `rng.ts`：种子化 mulberry32，保证同配置生成确定性结果。
- `structures.ts`：顶层配方 `house` / `tower` / `wall` / `platform` / `ruin` / `tree` / `stairs` / `spiral_stairs` / `bridge` / `great_hall` / `keep` / `dungeon` 共 12 种，均以局部坐标经 `BlockWriter.set/clear` 写入。
- `rooms.ts`：`house` / `tower` / `ruin` 共用的基础不规则房间布局——多个不重叠的闭合折线房间、每间随机地板高度、边界墙与天花板，支持正面门洞与废墟随机坍塌。
- 配置 `BuildingConfig = {recipe, seed, sizeX, sizeY, sizeZ}`（见 `validation.ts`）。
- 新增配方：在 `structures.ts` 实现 `GeneratorFn` 并登记到 `RECIPES`；未知配方回退 `house`。
- **生成配方只用于创作期**；存档以显式体素数据为准（见第七节），与生成器代码版本解耦。

## 五、分块渲染（`entity/building_generator/render/`）

### `chunk_mesher.ts` — 贪心合并 + 表面剔除 + 粗 LOD
- `greedyMesh(cells, sample, cellWorldSize, uvScale)` 为通用核心：对 3 轴 × 2 方向逐切片标记「非空且邻居为空」的面，再把同材质矩形**贪心合并**为一个四边形（经典 voxel greedy meshing）。
- `buildChunkMeshData`（全细节）：`cells = CHUNK_SIZE`、格边长 `VOXEL_SIZE`、UV 每格 1 张。
- `buildLodChunkMeshData`（粗 LOD）：按 `LOD_STRIDE` 聚合，每 stride³ 取多数材质得到一个粗格，再做贪心合并；格边长与 UV 放缩均乘 stride。取样基于**世界对齐**的粗格坐标，相邻 chunk 聚合边界一致，接缝无缝。
- 面朝向正确（逆时针、法线朝外）；UV 以「格」为单位展开（宽×高），配合材质的 `RepeatWrapping` 保持每块纹理密度。
- 输出按材质分组（`ChunkMeshGroup[]`）；实测：孤立方块 6 面；相邻同材质合并为 6 个四边形；实心 3×3×3 外表面各合并为 1 个（共 6 个）；跨 chunk 邻居实心时接缝面被剔除；交错材质经 LOD 降采样后三角形数显著下降。
- 三角形数正比于**外表面面积**而非体积。

### `chunk_renderer.ts` — 两级绘制 + 距离卸载
- 每个建筑世界一个 `WorldMeshRenderer`，其下 chunk 网格挂在世界的 `Group` 上；每个 chunk 记录当前层级（`detail` / `lod`）。
- 每帧 `update(cameraLocal)`：
  1. 消费 `dirty`：失效已渲染网格，交下一步重建；
  2. 距离 > `LOD_CHUNK_RADIUS + 滞回` → 卸载（`geometry.dispose()`，**保留体素数据**）；跨过细节 / LOD 边界 → 切换层级（带滞回避免抖动）；
  3. 收集可见距离内、尚无网格的 chunk，按距离由近到远、每帧最多 `MAX_CHUNK_MESH_BUILDS_PER_FRAME` 个重建（摊还构建，避免卡顿尖峰）。
- **全细节**：距离 ≤ `RENDER_CHUNK_RADIUS`，逐体素贪心网格；**粗 LOD**：≤ `LOD_CHUNK_RADIUS`，`LOD_STRIDE` 降采样合并。
- 视锥剔除由 Three 对每个 chunk `Mesh` 默认开启；无需自研。
- `getPickMeshes()` 只返回全细节网格：体素拾取 / AI 感知不含粗 LOD。
- 空的 chunk 记入 `emptyChunks`，避免每帧重复尝试。

## 六、物理（`entity/building_generator/physics/colliders.ts`）

- 每个建筑世界一个 **fixed rigid body**；仅对 `PHYSICS_CHUNK_RADIUS` 内的 chunk 生成**合并 trimesh collider**（几何复用渲染的面剔除结果），超出则移除，每帧受 `MAX_CHUNK_COLLIDER_BUILDS_PER_FRAME` 限制。
- 碰撞类别 `building`（`collision_category.ts`，位 `1 << 11`）；碰撞组 `BUILDING_COLLISION_GROUP = 8`，掩码 `1 | 2`（默认组 + 碎片组）。
- 未显式声明碰撞组的碰撞体会被 fail-closed 解析为 ground；建筑必须经 `categoryCollisionGroups(..., 'building')` 创建。

## 七、存档（v7）

- `SAVE_FORMAT_VERSION = 7`。`SavableBuildingGenerator = {type, worlds}`，每个 world：`origin` / `yawQuarter` / `palette` / `chunks[{key, rle}]` / `props`（自由道具）。
- **显式压缩体素数据**：只保存出现的材质作为 `palette`，每 chunk 用调色板局部索引做 RLE + Base64。与生成器代码版本解耦，旧档永远可读。
- 校验（`save_load/validation.ts`）：`worlds` / `chunks` / `palette` 非法一律 `.catch([])` 回退为空，不抛错；未知材质 id 在解码时回退为空（不生成非法方块）。
- 序列化不逐 block 建对象：`getSaveWorlds()` 批量产出 chunk；`loadSaveWorlds()` 批量解码。

## 八、编辑 / 游玩集成

- 编辑模式「生成物体」选择 **Building** 后，指针处调用 `spawnAt` 生成默认 `house`。
- 建筑面板（`ui/index.ts`）作用于**选中世界**：配方 / 种子 / 尺寸 / 位置 + **应用 / 删除**按钮（应用会设置位置，并在配方 / 种子 / 尺寸变化时经 `updateConfig` 重建体素，保留世界 id 与自由道具）；另有道具列表编辑与全建筑材质替换。
- 每帧视图更新：`world.ts` 的 `updateView(camera, dt)` 由 `main.ts` 的 `tick()` 在 `renderFrame` 前调用。**这是对「帧内逻辑集中在 preSync」的有意例外**——静态建筑不参与物理步进，其可见性必须在物理暂停时也更新。

### 建造笔刷（`edit/brush.ts` + `ui/brush_panel.ts`）

- `pickBlock(raycaster)`：对所有建筑世界的**可见** chunk 网格做射线检测，取最近命中；把命中点经 `group.worldToLocal` 转到局部坐标，沿面法线内推半格取样得到实心体素，返回 `{worldId, block, normal}`。
- `createBuildingBrush`：左键**单击**（拖拽仍用于旋转视角，阈值 `BRUSH_CLICK_THRESHOLD`）执行放置（`block + normal`）或擦除（`block`），材质由面板选择。
- 面板默认隐藏于左下角，**仅当选中某个建筑世界时显示**（订阅建筑源 `select` 事件，id 非空即显示）；取消选中会隐藏并强制关闭笔刷（复位启用开关、恢复实体选中）。面板含工具 / 材质 / 道具种类 / 预制体参数 / 启用开关；启用时通过回调关闭实体选中与生成交互（`pointer.setEnabled(false)`），相机旋转保持可用。
- 写入经 `setBlock` → 标记脏 chunk → 渲染器 / 碰撞体在下一帧自动重建。

### 自由道具与编排工具

- **自由道具**（`props/kinds.ts` + `render/prop_mesh.ts`）：门 / 窗 / 栅栏 / 灯笼，由若干长方体部件拼成，使用共享表面材质；挂在 `world.propGroup` 下随建筑世界变换。道具是**纯视觉装饰**，不建碰撞体、不进 `getMeshes()`。
- 笔刷工具（`edit/brush.ts`）：
  - **放置 / 擦除体素**：命中面外侧写入 / 清除当前材质；
  - **放置道具**：在命中面外侧格按当前道具种类 + 材质放置，偏航对齐面法线；
  - **区域填充**：两次单击定义对角（须同一建筑世界）后 `fillRegion` 填充，超过 `MAX_FILL_BLOCKS` 忽略；
  - **区域替换**：两次单击定义区域，把区域内命中体素材质替换为当前材质（`replaceMaterialInRegion`）；
  - **预制体**：以命中面外侧格为原点，按面板配方 / 种子 / 尺寸经 `stampPrefab` 生成到该世界。
- 区域类工具（填充 / 区域替换）第一次单击后记录角点，鼠标移动时经 `setRegionPreview` 显示当前区域的**黄色线框预览**，第二次单击执行；切换工具 / 禁用时清除。
- **选中高亮**（`render/overlay.ts`）：选中建筑世界时按其体素包围盒显示**青色线框**；包围盒增量维护，清除方块 / 载入后标记脏，在 `updateView` 中按需重算（仅选中世界）。
- 建筑面板（`ui/index.ts`）在选中世界后提供**道具列表**（逐项改材质 / 偏航 / 删除）与**全建筑材质替换**（from → to）。
- 存档 world 的 `props` 非法种类 / 材质在加载时安全跳过。

## 九、核心文件索引

| 文件 | 职责 |
|------|------|
| `entity/building_generator/world.ts` | 实体源：增删、选中、体素拾取、存读档、每帧视图更新 |
| `entity/building_generator/generators/rooms.ts` | 基础不规则房间布局（house / tower / ruin）与写入 |
| `entity/building_generator/generators/anchors.ts` | 按配方推导默认连接锚点（门 / 楼梯 / 桥端 / 角塔 / 室内 / 屋顶 / 地牢房间与交互物） |
| `entity/building_generator/generators/dungeon.ts` | 地牢布局求解与体素写入（不规则房间 / 连接 / 垂直交通） |
| `entity/building_generator/edit/brush.ts` | 建造笔刷：体素拾取 → 放置 / 擦除 / 道具 / 区域填充 / 材质替换 / 预制体 |
| `entity/building_generator/ui/brush_panel.ts` | 笔刷面板（工具 / 材质 / 道具 / 预制体参数 / 启用） |
| `entity/building_generator/props/kinds.ts` | 自由道具种类常量 |
| `entity/building_generator/render/prop_mesh.ts` | 自由道具网格构建 / 释放 |
| `entity/building_generator/render/overlay.ts` | 共享单位盒线框（选中高亮 / 区域预览） |
| `entity/building_generator/ui/labels.ts` | 材质 / 道具中文名与下拉工厂 |
| `entity/building_generator/constants.ts` | 体素 / chunk / 细节与 LOD 半径 / 降采样步长 / 物理距离 / 构建预算 / 笔刷阈值 |
| `entity/building_generator/types/index.ts` | 类型与上下文接口 |
| `entity/building_generator/validation.ts` | 生成配置 schema 与默认值 |
| `render/materials/index.ts` | 表面材质单例 |
| `main.ts` | 装配子系统、单 RAF 中调用 `updateView` |
| `save_load/{types,validation,serialize,deserialize}.ts` | 存档 v7 集成 |

## 十、扩展指南

1. **新增材质**：在 `ids.ts` 加入 id（保持追加顺序以兼容既有索引与材质数组下标）→ `defs.ts` 加定义 → 如需新图案在 `patterns.ts` 注册。注意体素索引上限为 `Uint8` 且 0 保留。
2. **新增配方**：在 `structures.ts` 实现并登记；尺寸校验收敛在 `BuildingConfigSchema`。
3. **编辑能力**：体素拾取（`pickBlock`，基于可见 chunk 网格射线 + 面法线内推取样）与全部笔刷工具（放置 / 擦除 / 道具 / 区域填充 / 区域替换 / 预制体，`edit/brush.ts`）已实现；写入统一经 `writeBlock`，会同时失效跨 chunk 边界的相邻 chunk（面剔除跨边界）。
4. **性能调优**：`CHUNK_SIZE` 增大降低 chunk 数与构建频率但增大单次成本；`RENDER_CHUNK_RADIUS` / `LOD_CHUNK_RADIUS` 控制可见范围；预算常量控制摊还粒度。chunk 内材质越多 draw call 越多，可在创作时按材质分区以提升合批。
5. **测试**：`world.test.ts` 覆盖增删改 / 拾取 / 道具 / 区域工具 / 存档往返；`chunk_renderer.test.ts` 覆盖两级绘制与距离卸载；`chunk_mesher.perf.test.ts` 为性能护栏（32³ 实心区域的网格构建与 RLE 编码耗时、三角数预算），阈值宽松，仅用于捕获数量级退化。

## 十一、陷阱

- **跨 chunk 面剔除必须走 `getBlock`**（而非只看当前 chunk 数组），否则接缝出现裂缝或重复面。
- **chunk 网格顶点必须加 chunk 世界局部原点**（`greedyMesh` 的 `origin`）：否则非零 chunk 的网格会被渲染 / 碰撞到原点附近，典型表现是在某面放置方块后新块出现在远处、再次点击命中原面并覆盖同一格。
- **共享材质单例**：chunk 网格 `dispose` 只释放 `geometry`，**不得 dispose `getSurfaceMaterials()` 返回的共享材质 / 纹理**。
- **卸载只释放 GPU 资源**，体素数据必须保留；再次靠近时按脏重建，若误清数据会丢失建筑。
- **静态世界**：`syncPositions` 为 no-op；位置只由 `add` / `setTransform` 改变。可见性更新走 `updateView`，不要塞进 `preSync`（物理暂停时不执行）。
- **碰撞组遗漏**：新增建筑碰撞体必须标注 `building` 类别，否则被 fail-closed 判为 ground 并挡下子弹。
- **自由道具为纯视觉**：不建碰撞体、不进 `getMeshes()`；道具网格释放时只 `dispose` 几何体，材质为共享单例。
- **区域填充有上限**（`MAX_FILL_BLOCKS`），超限静默忽略，避免误操作生成超大网格 / 卡顿。
- **存档兼容**：v7 之前存档无 `building_generator`；旧档加载安全（无该实体）。新增字段务必给默认 / `.catch`。

## 十二、建筑结构原语

在体素系统之上提供楼梯、旋转楼梯、斗拱、斜屋顶、走道/廊桥、支柱等可复用结构原语，供配方与笔刷预制体组合使用。

- **结构原语**（`generators/architecture.ts`）：`BlockWriter` 只有轴对齐 `set/clear`，所有旋转/镜像在结构函数内部做坐标变换；统一辅助 `rotateQuarter(x, z, q)`（局部 (x,z) 绕原点顺时针 q×90°）。函数：`stairs`（每级 `rise=1`）、`spiralStairs`（极坐标逐格、半径随高增大）、`pillar`、`dougong`（柱顶交错木构）、`pitchedRoof`（双坡、檐口外扩 1 格成飞檐）、`corridor`（两点曼哈顿折线走道，跨沟壑自动补支柱至调用方给定地面高度）、`floorSlab`。
- **配方**（`generators/structures.ts`，`generateBuilding` 未知配方回退 `house`）：顶层配方共 12 种，包含 `house` / `tower` / `wall` / `platform` / `ruin` / `tree` / `stairs` / `spiral_stairs` / `bridge` / `great_hall` / `keep` / `dungeon`；新配方自动出现在编辑面板与笔刷下拉。
- **地牢配方**（`generators/dungeon.ts`）：程序化不规则房间 / 地板高度 / 墙体 / 天花板 / 廊道 / 楼梯 / 门洞 / 升降梯竖井 / 旋转楼梯；布局可由 `generateDungeonLayout(config)` 读取，供箱庭组合层生成交互物锚点。
- **组合层端口**：`BuildingGeneratorContext` 提供 `add(..., yawQuarter?)`、声明式 `stampStructure(id, spec)`、按配方查询锚点 `getAnchors(id)`，以及返回 `BuildingWorld[]` 的 `loadSaveWorlds`。箱庭组合层只能经这些公开端口生成 / 变形建筑，不得直接操作 `ChunkStore` 或复制配方几何。
- **性能**：大体量生成会让上千 chunk 变脏；渲染/物理每帧分别最多重建 4/2 个 chunk（摊还，生成后首次可见有数秒渐次构建）。生成器写入不走 `MAX_FILL_BLOCKS`（该限制仅交互式区域工具）。静态建筑不参与物理步进，可见性由 `updateView` 维护。
- **存档解耦**：只存显式体素（palette + RLE），配方变更不影响旧档；交互物落点不随建筑存档保存，建筑加载后交互物以自身存档条目恢复。
- **箱庭已迁出**：原 `garden` 一键箱庭配方已从 building 类型 / 配方中移除。多世界编排、连接结构与人口规则由独立组合层设计承接，见 [`docs/design/diorama.md`](../../../docs/design/diorama.md)。
