# 区域（entity/area/）模块约定

## 设计

- **单一实体类型 `area`**：一个区域 = **几何** + **视觉材质** + **可选物理场（可组合）**。视觉与物理**完全解耦**。
- **配置驱动**（`AreaConfig`，由 `validation.ts` 的 `AreaConfigSchema` 派生）：
  - `shape` —— 体积几何判别联合：`{kind:'box',width,height,depth}` / `{kind:'sphere',radius}` / `{kind:'cylinder',radius,height}`（柱轴向 = 局部 +Y）。
  - `material` —— 视觉材质（`AREA_MATERIAL_IDS`：`water` / `air` / `force_field`），与物理无关，可动态切换。
  - `fields` —— 物理场，存在键即启用：`float`（浮力）/ `wind`（风）/ `gravity`（方向重力），可任意组合。
- **预设**（`presets.ts` 的 `AREA_PRESETS` / `areaPresetConfig`）：`water`（float+水）/ `air`（wind+空气）/ `force_field`（gravity+力场）；预设标识定义在中立模块 [`src/types/areaPreset.ts`](../../types/areaPreset.ts)，避免下层反向依赖实体层。
- **徽章**：`constants.ts` 的 `badgeOf(fields)` 按 `AREA_FIELD_IDS` 顺序取启用场的字母/底色（无场回退 `A`）。

## 物理

- 区域**不参与物理世界**（无刚体 / 无碰撞体）；变换由 `Area.transform` 手工维护。
- 每帧 `preSync`（step 之后）对 `areas × physicsEnv.getAllBodies()` 求重叠并施加启用场；与既有语义一致（逐帧瞬态施力，依赖 `clearAllForces`）。
- **重叠采样**（`physics/overlap.ts`）：把刚体世界 AABB 的 8 角变换到区域局部（区域旋转时为 AABB 近似，与旧水体实现一致），再与几何求交，返回 `{volume, fraction}`：
  - 盒：逐轴求交（精确闭式）。
  - 球 / 柱：**高精度 Gauss–Legendre 数值积分**（球沿轴降为二重；柱退化为「圆盘∩矩形面积 × 高度重叠」，条带场景走解析原函数）。立方体/圆盘尺度均有单测锁定。
  - 刚体 AABB 半尺寸从碰撞体形状读取（盒 / 胶囊 / 球），角色胶囊恒为竖直胶囊。
- **场模型**（`physics/fields/`）：
  - `float`：沿区域局部 +Y 的浮力（`密度 × |g| × 浸没体积`）+ 线性 / 角阻尼。
  - `wind`：力 = `drag × 质量 × (目标流速 − 速度) × 浸没比例`；目标流速 = 局部方向 × 速度（旋转到世界）。
  - `gravity`：区域内净重力替换为区域局部指定加速度；只补差值 `区域重力 − 全局重力`（全局重力照常施加）。
  - **组合**：三者只贡献「额外加速度 / 流速目标 / 拖拽速率」，可叠加；文档化语义（浮力只写 `flowBlend` 不覆盖 `flow`，风场写 `flow`）。

## 角色环境通道（跨模块）

状态机每帧用 `setLinvel` **绝对覆写**水平速度，普通 `addForce` 的水平分量会被抹掉（这是旧水对角色「无效」的根因）。故角色经独立通道：

- [`physics/environment.ts`](../../physics/environment.ts)：`BodyEnvironment {accel, flow, flowBlend, fluidFraction}`。
- `PhysicsEnv.getEnvironment(body)`：角色注册 provider（`main.ts` 用 `characterSystem.getCharacterByBody(body)?.environment`），非角色返回 `undefined`。
- 场模块对角色写 `env`、对普通刚体 `addForce`。
- 时序：`main.ts` 在每个 `preSync` 循环前 `characterSystem.clearEnvironments()`（清零上一帧）→ 区域 `preSync` 写入 → `characterSystem.update` 内 **状态机之后** 由 `applyEnvironment` 叠加（`accel·dt` 与向 `flow` 混合）。→ 浮力 / 风 / 方向重力对角色同样生效。

## 渲染

- `render/materials/`：`createAreaMaterial(material, shape)` —— `water` 折射波动着色器（顶点/片元按局部坐标形状归一，**支持 box / sphere / cylinder**）；`air` / `force_field` 共用半透明体积着色器（菲涅尔 + 流动条纹）。
- `render/index.ts`：`createAreaMesh` / `updateAreaGeometry` / `updateAreaMaterial` 按 `config.material` 派发；`isWaterArea`。
- 折射双 Pass 只处理 `material === 'water'` 的网格（`AreaEntityContext.getRefractionMeshes()`，`main.ts` 传入 `renderFrame`）。

## 目录

| 路径 | 职责 |
|---|---|
| `constants.ts` | `AREA_FIELD_IDS` / `AREA_MATERIAL_IDS` / `AREA_SHAPE_KINDS` / `badgeOf` / `enabledFields` |
| `validation.ts` | `AreaConfigSchema`（形状判别联合 + material + 可选场） |
| `types/index.ts` | `AreaConfig` / `AreaShape` / `Area` / `AreaEntityContext` / `AreaInfo` |
| `presets.ts` | `AREA_PRESETS` / `areaPresetConfig` |
| `physics/constants.ts` | 各场默认值 + 角阻尼 + 数值积分点数 |
| `physics/overlap.ts` | 形状重叠体积采样（`sampleOverlap`） |
| `physics/world.ts` | `setupAreas(scene, physicsEnv)`：CRUD、`preSync`、`getRefractionMeshes` |
| `physics/fields/` | 各场纯逻辑（float / wind / gravity） |
| `render/materials/` | 体积视觉材质（水体折射 / 空气 / 力场） |
| `render/index.ts` | 网格 / 几何 / 材质生命周期 |
| `ui/index.ts` | 编辑面板（`area-panel`）+ `formatRowText` |

## 陷阱

- 区域无碰撞体：碰撞类别 `area` 仅服务 AI 导航排除与子弹穿透（既有），新增触发类语义需另配 sensor + `categoryCollisionGroups(..., 'area')`。
- 帧内零分配：`overlap.ts` 与各场模块使用模块级临时向量 / 四元数复用；区域 `preSync` 逐帧调用，勿在循环内 new 对象。
- 材质切换 / 几何变化走 `updateAreaGeometry` / `updateAreaMaterial`（重建并 dispose 旧资源；选中线框在几何变化后重建）。
- 视觉与物理独立：`material` 与 `fields` 无强绑定，面板可自由组合；预设仅提供默认搭配。
- 存档：`area` 为单一类型，旧 `area/water` 在 v14 起作为未知类型逐元素跳过（见 [`save_load.md`](../save_load/save_load.md)）。
