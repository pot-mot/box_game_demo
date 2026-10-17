# 箱子（entity/box/）模块约定

## 设计

- **单一实体类型 `box`**：不再区分 `box/common` 等变体；一个箱子可**任意组合特性**。
- **配置驱动特性**：`BoxConfig`（`types/index.ts`，由 `validation.ts` 的 `BoxConfigSchema` 派生）中某个特性键存在即启用该特性，各特性**独立生命值**：
  - `destructible: {maxHealth, fragmentCount}` —— 受击累积破坏，归零碎裂为碎片；`fragmentCount` 为目标块数（上下限 `FRAGMENT_COUNT_MIN`/`FRAGMENT_COUNT_MAX`，实际块数受几何退格影响可能略少）。
  - `burning: {maxHealth}` —— 受击燃起火焰，逐渐销毁。
  - `magnet: {attractionRadius, attractionStrength}` —— 吸引附近刚体。
  - `elastic: {stiffness, dampingRatio, maxDeformFraction}` —— 受力形变（自重压缩 / 受击形变）。
- **表面材质**：`config.material` 取自共享表面材质库（`render/materials/ids.ts` 的 `SURFACE_MATERIAL_IDS`，默认 `DEFAULT_BOX_MATERIAL = 'rock'`）。渲染用 [`render/surfaceMaterial.ts`](../../render/surfaceMaterial.ts) 的 `MeshStandardMaterial`（与建筑体素同一光照管线，故受光表现一致），网格线烘焙进纹理（`getSurfaceGridTexture`，材质图案 + 每格边框线）；燃烧特性经 `onBeforeCompile` 注入顶点形变与火焰着色，由 `updateSurfaceBurn` 逐帧驱动。
- **受力方向驱动的碎裂**：`traits/destructible.ts` 的 `buildFragments` 以碰撞历史（接触点 + 局部力法线 + 相对速度）生成 Voronoi 种子——主撞击接触点起裂、沿受力方向在箱内推进一个种子（撞击侧顶出一块）、接触面切平面内环状种子（以受力轴为中心放射），其余接触点补充；目标块数由 `config.destructible.fragmentCount` 控制（种子不足时几何层随机补齐）。不同受力角度 / 撞击位置产生不同碎裂方式。
- **碎裂外观延续**：可破坏箱子碎裂时把 `config.material` 传给 `fragmentCtx.add(...)`，碎片沿用同一表面材质。碎片几何展开为非索引（逐三角面独立顶点）后**逐面**生成 UV：与原箱子表面共面的轴对齐三角面用与 `scaleBoxUVs` 完全一致的逐面约定（纹理 / 网格逐像素对齐），倾斜裂面则在该面自身平面内建立正交基做等距投影（不按坐标轴压扁，避免斜面拉伸）。逐面判定是必需的——逐顶点法线会被相邻异向面污染，导致箱面 / 裂面交界的纹理轴向错误而拉伸。
- **特性预设**：`presets.ts` 的 `BOX_PRESETS: Record<BoxPresetId, BoxTraitConfig>`（common / destructible / burning / magnet / elastic）供 AI 建造与背包方块物品复用；`boxPresetConfig(preset, body)` 按预设 + 尺寸/质量/摩擦组装完整 `BoxConfig`。预设标识定义在中立模块 [`src/types/boxPreset.ts`](../../types/boxPreset.ts)（`BOX_PRESET_IDS` / `BoxPresetId` / `isBoxPresetId`），避免下层模块（`inventory/`、`character/`）反向依赖实体层造成循环依赖。
- **徽章**：`constants.ts` 的 `badgeOf(traits)` 按 `BOX_TRAIT_IDS` 顺序取首个启用特性的字母/底色（无特性回退 `C`），供编辑列表展示。

## 目录

| 路径 | 职责 |
|---|---|
| `constants.ts` | 特性标识、默认材质、徽章字母/底色、`badgeOf` |
| `validation.ts` | `BoxConfigSchema`（刚体尺寸/质量/摩擦 + material + 可选特性）|
| `types/index.ts` | `BoxConfig`、各特性运行时类型、`Box`、`BoxEntityContext` |
| `presets.ts` | 特性预设表与 `boxPresetConfig` |
| `physics/constants.ts` | 特性默认值 + 运行时调参 + 粒子常量 |
| `physics/traits/` | 各特性纯逻辑（destructible / burning / magnet / elastic）|
| `physics/world.ts` | `setupBoxes(scene, shared, deps)`：CRUD、碰撞单订阅按特性分发、trait 生命周期、`preSync` / `syncPositions` |
| `render/` | 统一着色器网格与燃烧粒子（`createBoxMesh` 等）|
| `ui/index.ts` | 编辑面板（`box-panel`）+ `formatRowText` |
| `base/` | 通用框架（wireframe、非重叠定位、面板上下文、刚体 schema）|

## 陷阱

- 修改箱子尺寸（高）后需要同步调整 `body.translation()` / `mesh.position`，防止底部钻入地面引发物理引擎暴力弹飞。
- 纹理使用单例 `CanvasTexture`（`gridMaskTexture()`，`render/texture.ts`），所有箱子共享；共享材质/纹理禁止 dispose。
- `setupBoxes` 的依赖 `BoxSetupDeps = {fragmentCtx, velocitySnapshots, physicsEnv}`：可破坏特性需碎片世界与撞击前速度快照，磁力特性需 `physicsEnv` 遍历刚体。独立持世界的调用方（如展示模式子模块）须先创建这些依赖并注册 `physicsEnv.bodyProviders`，且经 [`physics/fixed_step.ts`](../../physics/fixed_step.ts) 的子步运行器推进（内聚每子步清力）。
