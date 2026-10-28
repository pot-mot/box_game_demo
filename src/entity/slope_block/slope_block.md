# 预制斜面块（entity/slope_block）

编辑模式可放置的静态预制体：整数边长的 45° 直角三角柱。从侧面看为等腰直角三角形，横向（沿局部 X）或竖向（沿局部 Z）起坡；实体位置是**低角原点**，包围盒为 `size × size × size`。

## 约定

- `config.size`：整数边长（1..`SLOPE_BLOCK_MAX_SIZE`），三角柱两条直角边与挤出深度均为该值。
- `config.axis`：`'x'` = 沿 X 起坡，`'z'` = 沿 Z 起坡。
- `config.material`：表面材质，复用 `render/materials/` 共享材质单例。
- 实体为固定刚体，碰撞体是与渲染几何完全一致的 trimesh；碰撞类别 `building`，参与默认组 / 碎片组碰撞。
- 网格与碰撞体都由同一个几何生成器构建，禁止分别手写顶点导致视觉/物理错位。
- 只释放本实体几何；表面材质为共享单例，不得 dispose。

## 核心文件

| 文件 | 职责 |
|------|------|
| `constants.ts` | 默认尺寸 / 上限 / 默认材质 / 摩擦 |
| `validation.ts` | `SlopeBlockConfigSchema` 与默认配置 |
| `types.ts` | 实体、上下文接口 |
| `render/index.ts` | 三角柱网格、trimesh 顶点与索引 |
| `physics/world.ts` | 增删、选中、配置重建、变换、存读档对接 |
| `ui/index.ts` | 面板：尺寸 / 坡向轴 / 材质 / 位置 / 偏航 |
| `slope_block.test.ts` | 几何包围盒、配置重建、存档往返 |

## 编辑与存档

- 生成类型「斜面块」；Ctrl+左键生成，坐标按整数格点对齐。
- 面板应用会按新配置重建几何与碰撞体，并同步位置 / 偏航。
- 存档类型 `slope_block`，字段：`config` / `position` / `quaternion` / 可选 `owner`。
- 旧存档无该实体时正常加载；非法配置由 zod 回退默认。

## 陷阱

- **低角原点**：实体位置是三角柱最低角，不是几何中心；放置高度按地面 / 目标面计算。
- **视觉/物理同源**：修改几何时必须同步 `buildSlopeBlockGeometry` 与 `buildSlopeBlockTrimesh` 的顶点/索引约定。
- **共享材质**：不要 dispose `getSurfaceMaterial(...)` 返回的材质。
- **斜向摆放**：`axis` 只决定局部起坡方向，任意水平朝向用实体 `yawQuarter` / 面板偏航。
