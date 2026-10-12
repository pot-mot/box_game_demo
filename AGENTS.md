# box-demo

> 项目定位：一个追求相对轻量设计的游戏项目。
> 代码、文档、测试与验收一律按生产标准执行——禁止以「demo / 原型 / 先跑起来再说」为由降低质量要求。

基于 Three.js + rapier3d-compat 的游戏项目：物理交互沙盒 + 角色动作战斗 + 编辑 / 游玩 / 展示 / 骨骼动画四套模式。

> **改动任一模块前，先读该模块根目录下的**同名文档**（如 `src/physics/physics.md`；子文档在其子目录，如 `src/character/weapon/bone_animation/`）。见文末[模块文档索引](#模块文档索引)。按需惰性加载，不要预读全部。** 本文件只保留全局、跨模块、必须每次在场的规则。

## 命令

- `pnpm dev` — 启动 Vite 开发服务器
- `pnpm build` — `tsc && vite build`（必须先检查类型再打包）
- `pnpm preview` — 预览构建产物
- `pnpm type-check` — `tsc --noEmit` 仅类型检查
- `pnpm test` — `vitest run` 全量单元测试
- `pnpm test:e2e` — `playwright test` 全量端到端测试
- `pnpm vitest run <测试文件>` — 只跑指定单元测试（开发期首选）
- `pnpm test:e2e <spec 文件名>` — 只跑指定端到端用例（开发期首选，参数会透传给带 `--config` 的 playwright）

## 测试与验证

**非必要不重复运行全量测试。** 验证遵循「最小充分」原则：

1. **开发迭代期** — 只跑 `pnpm type-check` 加与本次改动直接相关的用例（`pnpm vitest run src/xxx/yyy.test.ts`、`pnpm test:e2e <spec 文件名>`），不跑全量。
2. **任务收尾时** — 再跑一次全量 `pnpm test`；改动涉及 UI / 交互 / 模式切换时追加 `pnpm test:e2e`；改动涉及构建配置、依赖或入口链路时追加 `pnpm build`。
3. **禁止重复验证** — 同一份改动已经全量通过后，不得为「再确认一次」重跑同一套全量测试；后续改动只做受影响的增量验证。
4. **必须全量的情形** — 改动落在共享底层（`physics/`、`render/`、`input/`、`save_load/`、`main.ts` 的单 RAF 链路）、跨分包重构、或删除/重命名被广泛引用的导出。
5. **e2e 说明** — `e2e/playwright.config.ts` 会自动拉起 `pnpm dev`（端口 5173）并复用已有服务器，无需手工启动。

## 工程标准

1. **无占位实现** — 不提交 TODO、空实现或调试用 `console.log`；未完成的能力要么不合并，要么在对应模块文档中记录设计方案。
2. **改动完整** — 功能改动必须同时补齐类型、测试（按改动性质选单测或 e2e）、相关模块的同名文档，以及根 AGENTS.md 中受影响的结构/约定描述。
3. **兼容性** — 存档格式（`save_load/`）与本地存储（如键位绑定 `localStorage`）变更必须考虑旧数据：校验层需安全回退到默认值，不得抛错崩溃。
4. **性能** — 帧内逻辑避免无谓分配（复用向量与临时对象），更新路径中禁止创建 DOM；纹理、材质、几何体按需单例复用。
5. **玩家可读性** — 面向玩家的 UI 文案、代码注释与文档一律中文；标识符沿用既有英文命名习惯。**UI 文案禁止硬编码**：一律经 `src/i18n/` 的 `translate` / `localizeText` / `localizeTitle` / `localizePlaceholder` 取用（详见 [`docs/i18n.md`](docs/i18n.md)）；数据名称经 `weaponDisplayName` / `armorPieceDisplayName` / `itemDisplayName` 等映射，序列化字段（如骨架关节名）不改数据、仅显示层翻译。
6. **UI 风格统一** — 全部模式 / 面板 / HUD 遵循 [`docs/ui/ui_style_guide.md`](docs/ui/ui_style_guide.md)；样式只走 `src/assets/theme.css` 的 `--dc-*` 令牌与 `.dc-*` 组件类（**禁止硬编码颜色/字体/圆角/间距**），功能滚动容器统一 `scrollbar-gutter:stable`（`.dc-scroll`），装饰用 SVG 图标（`src/ui/icons/`，**禁止 Unicode/emoji 图标**）；编码规则见 [`docs/ui/css_style_guide.md`](docs/ui/css_style_guide.md)。迁移存量 UI 必须保留既有 `id` / 语义类名 / `data-*` / i18n 文案（e2e 与单测依赖）。详见 [`src/ui/ui.md`](src/ui/ui.md)。

## 规范

### 类型系统

1. **严格类型** — 禁止使用 `any`，启用 `noUnusedLocals`、`noUnusedParameters`。
2. **`null`/`undefined`** — 优先使用 `undefined`，严格区分两者，禁止 `==`/`!=`，一律用 `===`/`!==`。
3. **`readonly`** — 尽可能使用 `const` 显式声明常量，针对类型，尽可能使用 `DeepReadonly`。
4. **禁止不安全类型断言** — 严禁使用 `as any`、`as unknown as Xxx` 等旁路类型系统的不安全转换。安全的 `as` 用法仅限：
   - `as const` 常量断言
   - DOM 事件目标窄化（`e.target as HTMLElement`、`e.target as Node`）
   - material 窄化（需配合 `instanceof` 守卫）
   - `JSON.parse()` 返回 `as unknown`（用于给校验层，但不得裸用 `as Xxx`）
   - **判别式 Map 访问** — `Map<Key, BaseType>` 的值运行时是不同类型子类时，用泛型映射类型 `Record<Key, SubType>` 配合 `as` 做一次集中窄化，避免散落 `as any`：
     ```ts
     type SourceMap = {
         'type_a': ContextA
         'type_b': ContextB
     }
     const getSource = <K extends KeyType>(key: K): SourceMap[K] | undefined =>
         map.get(key) as SourceMap[K] | undefined
     ```
5. **两阶段初始化** — 禁止使用 `undefined as unknown as Xxx` 在对象字面量中占位再覆盖属性。工厂函数无法在构造阶段提供完整对象时，将返回类型定为 `Omit<FullType, 'panel'>`，由调用方通过 `{ ...partial, panel: createPanel(partial) }` 组装。
6. **枚举** — 禁止 `enum`，用常量 + 索引类型推导：
   ```ts
   const EnumType_CONTANTS = ['A', 'B'] as const
   type EnumType = typeof EnumType_CONTANTS[number]
   ```
   保证运行时也能取到枚举值，以便于类型检查。

### 代码风格

1. **缩进** — 4 个空格。
2. **函数风格** — 拒绝非必要的 `class`、`function` 声明、`this`，尽可能使用 `const` 箭头函数，包括导出函数。
3. **注释语言** — 所有注释必须使用中文。

### Import / Export

1. **`verbatimModuleSyntax`** — 类型专用的 import 必须用 `import type`。若同模块同时需要值和类型，使用内联修饰符：`import {Value, type SomeType} from 'module'`。（`tsconfig.json` 启用 `noUnusedLocals` / `noUnusedParameters` / `erasableSyntaxOnly` / `verbatimModuleSyntax`。）
2. **`import type` + `as`** — 类型冲突时用 `import type {Material as ThreeMaterial} from 'three'`，值类型冲突时用 `import {Material as ThreeMaterial}` 并额外使用 `type` 修饰符。
3. **路径后缀** — import 路径除 `xxx/index.ts` 可省略外，必须包含 `.ts` 扩展名。
4. **命名导出** — 禁止 `export default`，全部使用命名导出。

## 架构规则

1. **分包原则** — 代码按 `character/`（角色领域模型）、`entity/`（实体实现）、`modes/`（游戏模式）、`physics/`（共享物理）、`render/`（渲染管线）、`input/`（输入注册表）、`i18n/`（国际化，叶子包，不依赖其它 `src/` 包）、`ui/`（面板）、`save_load/`（存档）分包。禁止循环依赖。
2. **依赖方向** — `character/` 是独立领域层，不依赖 `entity/`。`entity/character/` 依赖 `character/`。各 entity 之间不相互引用（**唯一例外**：`entity/character/skeleton/` 可引用通用骨架层 `entity/skeleton/`；`entity/skeleton/` 保持与人形无关，人形定义与外观装配由 `entity/character/` 提供并经 `SkeletonPreset` 注入，不得反向引用 `entity/character/`）。
3. **单 RAF 循环** — 所有帧驱动逻辑集中在 `main.ts` 的 `tick()` 中。各子系统返回 `(dt: number) => void` 类型的 updater 函数，由主循环统一调度，禁止自行启动 RAF。
4. **常量集中** — 各分包的 magic number 必须提取到对应的 `constants.ts`，禁止散落在函数体内。
5. **状态机驱动角色** — `entity/character/physics/world.ts` 每帧调用 `stateMachine.update(dt, entity)` → 状态直接操作 `entity.body`（`setLinvel` 等）→ 随后 `syncPositions()` 同步 body→mesh。输入注入链路：`input/` 注册表动作抽象（`getInputRegistry()`）→ `modes/control/player_control.ts` 的 `move()` 每帧读取动作并调用 `characterSystem.setPlayerMove()` → `world.ts` 统一转成 `stateMachine.setInput()`，不直接调 move/jump。详见 [`src/character/state_machine/state_machine.md`](src/character/state_machine/state_machine.md)。
6. **两套操作方案** — 所有具备操作能力的模式只归入 `modes/control/` 的两套共享方案（玩家主控 `createPlayerControl` / 纯摄像机 `createCameraControl`），新增模式不得另写相机/移动逻辑。详见 [`src/modes/control/control.md`](src/modes/control/control.md)。

## 高危红线（跨模块，必须遵守）

这些规则漏了会引发跨模块、难定位的故障，故始终在场；细节见对应模块文档。

- **每帧瞬态施力 / 单一步进器** — Rapier `addForce` 不在 `step` 后自动清除。任何自建 `SharedWorld` 必须逐物理子步 `clearAllForces`；**独立持世界一律经 `physics/fixed_step.ts` 的 `createFixedStepStepper`**，严禁手写 `world.step` / `eventBus.drain` 子步循环（曾因漏清力导致角色跳跃后无限升空）。见 [`src/physics/physics.md`](src/physics/physics.md)。
- **地面接触法线** — 必须经 `physics/contact_tracking.ts` 的 `queryColliderContacts` 取，禁止直接用 `Collider.contactCollider`（同时接触地面与箱/交互物会返回被污染法线）。
- **角色 collider 是竖直胶囊（非 cuboid）**；地形一律 `RAPIER.ColliderDesc.trimesh`；**heightfield 与 `FIX_INTERNAL_EDGES` 禁用**。
- **碰撞类别 fail-closed** — 新增碰撞体必须显式 `setCollisionGroups` 并用 `physics/collision_category.ts` 的 `categoryCollisionGroups(group, mask, category)` 标注类别；未声明者 membership 全 1 会被解析为 `ground` 并挡下子弹。
- **存档兼容** — 改存档结构必须同步 `save_load/types.ts` / `validation.ts` / `serialize.ts`，可选字段旧档缺失一律安全回退默认、未知 id 安全丢弃，不得抛错。见 [`src/save_load/save_load.md`](src/save_load/save_load.md)。

## 项目结构

```
src/
├── types/                       # 通用类型定义
├── physics/                     # 共享物理世界（rapier3d-compat）
├── render/                      # Three.js 渲染（materials/ 为基础表面材质库）
├── input/                       # 输入注册表（键盘 + 鼠标动作抽象、绑定、操作设置面板）
├── i18n/                        # 国际化（强类型文案表 MainLocale + 领域片段 locales/）
├── character/                   # 角色领域模型：ai_strategy / interaction / weapon / combat / armor / state_machine
├── entity/
│   ├── character/               # 角色实体（skeleton / appearance / combat / projectile / physics / ai / combat_vfx / ui）
│   ├── skeleton/                # 通用骨架实体与编辑可视化（人形无关，预设外部注入）
│   ├── interactable/            # 交互物实体系统（行为 + 信号联动 + 可破坏 + 网格 + 编辑面板）
│   ├── item/                    # 掉落物实体（sensor body 漂浮小立方体，拾取经交互）
│   ├── building_generator/      # 建筑生成器（体素 / 结构原语 / 分块面剔除渲染 / 距离卸载 / trimesh 物理）
│   ├── box/ fragment/ destroyed/ area/ terrain/   # 箱子变体 / 碎片 / Voronoi 断裂 / 水 / Trimesh 地形
├── inventory/                   # 背包与物品领域模型（items 目录 / grid 俄罗斯方块布局 / 增删装备 / 存档转换）
├── modes/                       # control / bone_edit / edit / play / showcase
├── ui/                          # 面板（相机HUD、属性面板、列表侧栏、设置）
├── save_load/                   # 存档序列化 / 反序列化
├── assets/
└── main.ts
```

展示模式由启动屏第三个按钮进入（共享主页渲染器与单 RAF 循环，可返回启动屏），详见 [`src/modes/showcase/showcase.md`](src/modes/showcase/showcase.md)。

## 模块文档索引

每个模块只有一份以模块命名的文档，位于模块根目录（子主题文档在其子目录，如武器动作 `src/character/weapon/bone_animation/`）。**跨模块不变量只写在本文件（下「架构规则」「高危红线」）；模块文档只写该模块特有内容，不重复全局规则。**

| 模块 / 主题 | 文档 | 何时读 |
|---|---|---|
| 物理（shared） | [`src/physics/physics.md`](src/physics/physics.md) | 碰撞体、力、接触、步进 |
| 渲染 | [`src/render/render.md`](src/render/render.md) | 材质/纹理单例、拾取、颜色常量 |
| 输入 | [`src/input/input.md`](src/input/input.md) | 键位/鼠标绑定、新增输入动作 |
| 存档 | [`src/save_load/save_load.md`](src/save_load/save_load.md) | 存档结构/版本/兼容 |
| UI 面板 | [`src/ui/ui.md`](src/ui/ui.md) | 面板样式、图标、迁移 |
| 角色领域（lock_point/faction/原型） | [`src/character/character.md`](src/character/character.md) | 锁定点、阵营 |
| 武器 | [`src/character/weapon/weapon.md`](src/character/weapon/weapon.md) | 武器类/模型、持握、攻击段、蓄力、动作 |
| 战斗运行时 | [`src/character/combat/combat.md`](src/character/combat/combat.md) | 伤害类别、防御、无敌帧 |
| 护甲 / 肢体 | [`src/character/armor/armor.md`](src/character/armor/armor.md) | 护甲槽位、防御/加成 |
| 交互领域 | [`src/character/interaction/interaction.md`](src/character/interaction/interaction.md) | 交互类型层、时长 |
| 状态机 | [`src/character/state_machine/state_machine.md`](src/character/state_machine/state_machine.md) | 新增状态、死亡/翻滚、攻击段 |
| 骨骼动画 | [`src/skeleton/skeleton.md`](src/skeleton/skeleton.md) | 骨骼/IK/组合动画 |
| 角色 AI | [`src/entity/character/ai/ai.md`](src/entity/character/ai/ai.md) | 寻路索敌、导航避障、朝向 |
| 方块人外观 | [`src/entity/character/appearance/appearance.md`](src/entity/character/appearance/appearance.md) | 模型构建、挂点、武器/护甲/肢体网格、种族 |
| 弹丸 | [`src/entity/character/projectile/projectile.md`](src/entity/character/projectile/projectile.md) | 弹丸物理/视觉/对象池 |
| 角色物理 | [`src/entity/character/physics/physics.md`](src/entity/character/physics/physics.md) | body/mesh 同步、移动平台载客 |
| 角色战斗特效 | [`src/entity/character/combat_vfx/combat_vfx.md`](src/entity/character/combat_vfx/combat_vfx.md) | 受击/无敌材质效果 |
| 建筑 | [`src/entity/building_generator/building_generator.md`](src/entity/building_generator/building_generator.md) | 体素、渲染、物理、笔刷、结构原语 |
| 交互物 | [`src/entity/interactable/interactable.md`](src/entity/interactable/interactable.md) | 交互物行为、信号、可破坏 |
| 掉落物 | [`src/entity/item/item.md`](src/entity/item/item.md) | 掉落物拾取 |
| 箱子 | [`src/entity/box/box.md`](src/entity/box/box.md) | 箱子尺寸与纹理 |
| 地形 | [`src/entity/terrain/terrain.md`](src/entity/terrain/terrain.md) | Trimesh 地形、雕刻 |
| 背包 | [`src/inventory/inventory.md`](src/inventory/inventory.md) | 背包/装备 UI 与持久化 |
| 操作方案 | [`src/modes/control/control.md`](src/modes/control/control.md) | 相机/移动、翻滚/加速 |
| 游玩模式 | [`src/modes/play/play.md`](src/modes/play/play.md) | 第三人称、锁定、箱庭子系统 |
| 编辑模式 | [`src/modes/edit/edit.md`](src/modes/edit/edit.md) | 指针、执行面板、雕刻 |
| 展示模式 | [`src/modes/showcase/showcase.md`](src/modes/showcase/showcase.md) | 子模块框架与注册 |
| 全局 UI 风格 | [`docs/ui/ui_style_guide.md`](docs/ui/ui_style_guide.md)、[`docs/ui/css_style_guide.md`](docs/ui/css_style_guide.md) | 任何面板/HUD |
| 全局 i18n | [`docs/i18n.md`](docs/i18n.md) | 文案 |
| 全局动作规范 | [`docs/bone_animation/动作设计规范.md`](docs/bone_animation/动作设计规范.md) | 调动作 |

**扩展 AI 功能时**：阅读 [`src/entity/character/ai/ai.md`](src/entity/character/ai/ai.md) → 按"新增 AI 功能指南"章节操作 → 更新配置表 → 添加测试 → 同步更新文档。
