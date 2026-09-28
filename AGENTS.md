# box-demo

> 项目定位：一个追求相对轻量设计的游戏项目。
> 代码、文档、测试与验收一律按生产标准执行——禁止以「demo / 原型 / 先跑起来再说」为由降低质量要求。

基于 Three.js + rapier3d-compat 的游戏项目：物理交互沙盒 + 角色动作战斗 + 编辑 / 游玩 / 展示 / 骨骼动画四套模式。

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

1. **无占位实现** — 不提交 TODO、空实现或调试用 `console.log`；未完成的能力要么不合并，要么在 `docs/` 中记录设计方案。
2. **改动完整** — 功能改动必须同时补齐类型、测试（按改动性质选单测或 e2e）、相关 `docs/` 文档，以及 AGENTS.md 中受影响的结构/约定描述。
3. **兼容性** — 存档格式（`save_load/`）与本地存储（如键位绑定 `localStorage`）变更必须考虑旧数据：校验层需安全回退到默认值，不得抛错崩溃。
4. **性能** — 帧内逻辑避免无谓分配（复用向量与临时对象），更新路径中禁止创建 DOM；纹理、材质、几何体按需单例复用。
5. **玩家可读性** — 面向玩家的 UI 文案、代码注释与文档一律中文；标识符沿用既有英文命名习惯。

## 规范

### 类型系统

1. **严格类型** — 禁止使用 `any`，启用 `noUnusedLocals`、`noUnusedParameters`。

2. **`null`/`undefined`** — 优先使用 `undefined`，严格区分两者，禁止 `==`/`!=`，一律用 `===`/`!==`。

3. **`readonly`** — 尽可能使用 `const` 显式声明常量，针对类型，尽可能使用 `DeepReadonly`。

4. **禁止不安全类型断言** — 严禁使用 `as any`、`as unknown as Xxx` 等旁路类型系统的不安全转换。安全的 `as` 用法仅限：
   - `as const` 常量断言
   - DOM 事件目标窄化（`e.target as HTMLElement`、`e.target as Node`）
   - material 窄化（需配合 `instanceof` 守卫，如 `mesh.material as MeshBasicMaterial` 前确认 `mesh.material instanceof MeshBasicMaterial`）
   - `JSON.parse()` 返回 `as unknown`（用于给校验层，但不得裸用 `as Xxx`）
   - **判别式 Map 访问** — 当 `Map<Key, BaseType>` 的值在运行时是不同类型的子类，可通过泛型映射类型 `Record<Key, SubType>` 配合 `as` 做一次集中窄化，后续所有下游访问均获得精确类型，避免散落的 `as any`：
     ```ts
     type SourceMap = {
         'type_a': ContextA
         'type_b': ContextB
     }
     const getSource = <K extends KeyType>(key: K): SourceMap[K] | undefined =>
         map.get(key) as SourceMap[K] | undefined
     ```

5. **两阶段初始化** — 禁止使用 `undefined as unknown as Xxx` 在对象字面量中占位再覆盖属性。若工厂函数无法在构造阶段提供完整对象（如 `panel` 依赖 `ctx` 自身），应将返回类型定为 `Omit<FullType, 'panel'>`，由调用方通过 `{ ...partial, panel: createPanel(partial) }` 组装为完整类型。

6. **枚举** - 禁止使用 `enum`，尽可能使用常量 + 索引类型推导的形式：
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

1. **`verbatimModuleSyntax`** — 类型专用的 import 必须用 `import type`。若同模块同时需要值和类型，使用内联修饰符：
   ```ts
   import {Value, type SomeType} from 'module'
   ```

2. **`import type` + `as`** — 类型冲突时用 `import type {Material as ThreeMaterial} from 'three'`，值类型冲突时用 `import {Material as ThreeMaterial}` 并额外使用 `type` 修饰符。

3. **路径后缀** — import 路径除 `xxx/index.ts` 可省略外，必须包含 `.ts` 扩展名。

4. **命名导出** — 禁止 `export default`，全部使用命名导出。

### 模块约定

1. **常量集中** — 每个分包（`physics/`、`render/`、`input/`）的 magic number 必须提取到各自的 `constants.ts`。

2. **RAF 回调** — 需要在每帧执行的逻辑返回 `updater` 函数，由 `main.ts` 的单 RAF 循环统一调用。updater 签名统一为 `(dt: number) => void`。

3. **状态机** — `character/state_machine/` 实现标准 FSM：
   - 每个状态一个独立文件，导出 `StateHandler` 对象（`enter` / `update` / `exit` / `transitions`）
   - 转换规则由各状态通过 `transitions[]` 声明，状态机核心 `machine.ts` 统一检查 guard 并派发 `onStateChange`
   - 状态持有 `CharacterEntity` 引用，可直接操作 `body` / `mesh`
   - 依赖方向：`entity/character/` → `character/state_machine/` → `character/types.ts`
   - **攻击连段**由 `states/attacking/` 的段子状态机表达：`attacking` meta-state 负责调度，段定义（含自身声明的 `next` 转换）由武器模组拥有（`character/weapon/`），禁止在角色侧重建槽位/连段索引

4. **攻击动作归属** — 武器的段（时长 / 恢复 / 阶段时序 / 伤害倍率 / 冷却 / 连段拓扑）一律写在武器模组（`character/weapon/melee_attacks.ts`、`ranged_attacks.ts`）；**动画不再由抽象动作参数生成**，而是段通过 `poses`（`SegmentPoseLayer[]`）引用显式骨骼关键帧。基础轨道在 `attack_clip_data.ts`，逐段关键姿势修订在 `attack_pose_edits.ts`，播放器合并后仍按 clip 播放；修订不得增加程序化阶段或每帧动画器。**近战段按三段式约定**：t=0 起手/蓄力 → 中帧（动作段结束）= 打击完成 → 末帧 = 持械戒备（肩 `-0.45` / 肘 `-0.85` / 挂点 `1.7`，与 idle 一致）；挥砍平面与枪口朝向由武器骨骼承担（收招帧回 `WEAPON_GRIP_FLEX`），命中窗口 on ≈ 0.5×动作时间 / off ≈ 0.95×动作时间。角色与存档持有「主手武器 + 副手武器 + 持握模式 + 数值覆写」。
5. **武器类 / 持握模式 / 副手** — 武器分为**武器类**（玩法数据：`*_WEAPON_CLASSES`）与**模型**（`*_WEAPON_MODELS`：id / classId / 名称 / 网格），`resolveMeleeWeapon` / `resolveRangedWeapon` 合并为运行时武器配置（带 `classId`）；段 id 统一 `{classId}_{holdMode}_{模板键}`（远程单模式沿用 `{classId}_{动作}`）。三态常量 `HoldMode = 'one_handed' | 'two_handed' | 'dual_wield'`（`character/weapon/hold_mode.ts`）；全部近战类支持三模式、默认单持，每模式独立连段（`attacks: HoldModeAttacks`，`catalog.ts` 的 `weaponAttacksOf(weapon, holdMode?)` 解析）。角色实体持久化 `holdMode` 与副手装备槽（`CombatComponent.offhand`）；`world.ts` 的 `setHoldMode` 按 `availableHoldModes(weapon, offhand)` 校验（双持需副手同类近战，`sameWeaponClass`），不可用时回退默认并返回 `false`，切换后重解析攻击链并同步外观（双手共持副手挂背 `backWeaponMount`、其余模式回左手）。play 模式 `Ctrl`（`cycle_hold_mode`）环切可用模式；edit 面板可选副手武器与持握；展示模式近战按模式分三排。
6. **骨骼动画组合** — `skeleton/anim/composition.ts` 的 `composePoses(layers)` / `applyComposedPose(skeleton, layers)` 按**关节归一化加权平均**合成任意层（`PoseLayer = {clip, weight, progress}`），未被任何层覆盖的关节保留骨架当前值（实现上下半身任意拼装）；单层有效贡献时走快速路径直接采样（零额外开销）。`skeleton/anim/composed_player.ts` 的 `createComposedAnimationPlayer` 驱动组合播放与分层事件。基础状态的分层（下半身/体态 + 按持握模式的上半身）在 `appearance/clips/base_clips.ts` 中**离线预组合**为单 clip（`getBaseClipForHoldMode`，运行时单层播放），需要运行时动态权重时用 `getBaseLayers` + `composePoses`；攻击段即 `segment.poses` 组合。

7. **统一模型构建器** — 人类骨架与方块人外观只有一套构建路径：骨架定义 `entity/character/skeleton/preset.ts` 的 `buildCharacterSkeletonDefinition()` 为唯一真相源；`entity/character/appearance/model.ts` 的 `createCharacterModel`（游玩/展示）与 `modes/bone_edit`（编辑器）都经 `skeleton/render/joint_hierarchy.ts` 的 `createJointHierarchy` 建 Group 层级、再用 `entity/character/appearance/assemble.ts` 的 `assembleCharacterAppearance` 装配部件（**含手部模型**）。手部关节 `rightHandPivot` / `leftHandPivot` 与其骨骼段 `rightHand` / `leftHand` 两侧都有，且已纳入 `CHARACTER_JOINT_IDS`（可被动画驱动）；武器挂点 `rightWeaponMount` / `leftWeaponMount` 是腕下独立零偏移关节，不并入手部骨骼；`backWeaponMount` 为背部视觉挂点（双手共持时副手武器挂背，无 clip 轨道）。`entity/skeleton` 为通用骨架实体，人形预设/外观经 `createCharacterSkeletonPreset()` 注入。

8. **程序化网格构建器** — 武器与护甲的外观模型共用 `entity/character/appearance/mesh_builder.ts` 的 `createMeshBuilder()`：它提供几何 / 材质工厂（`box` / `cylinder` / `sphere` / `cone` / `material`）与组装接口（`add` / `faceBox`），统一登记并 `dispose` 释放，取代原先 `weapon_mesh` 的模块级 `begin()` 共享数组。`weapon_mesh` 与 `armor_mesh` 的每个模型都是**独立参数化 `gen` 函数**（接收 `(builder, 参数)`，各自拼装部件），派发表只做 id → gen 的映射；护甲 gen 的尺寸参数来自 `PRESET_PART_SIZES` 的关节基准部件，武器 gen 的参数来自自身 `WeaponMeshConfig`。**新增/修改武器或护甲外观只改对应 gen**，不要重建通用构建逻辑。

## 项目结构

```
src/
├── types/                       # 通用类型定义
├── physics/                     # 共享物理世界（rapier3d-compat）
├── render/                      # Three.js 渲染
├── input/                       # 输入注册表（键盘 + 鼠标动作抽象、绑定、操作设置面板）
├── character/                   # 角色领域模型（纯 TS 类型 + 状态机）
│   ├── weapon/                  # 武器模组（武器类/模型分层 weapon_class + 持握模式 hold_mode / 攻击链：attack_chain（含段→pose 组合 SegmentPoseLayer）/ melee_attacks / ranged_attacks / catalog / weapon_runtime / attack_clip_data（基础关键帧）/ attack_pose_edits（逐段姿势修订））
│   ├── combat/                  # 战斗运行时（段冷却与转换上下文、阶段模型、执行器注册表、伤害/攻击类别与防御、翻滚技能与无敌帧）
│   ├── armor/                   # 护甲领域模型（四槽位 slots / 预设 armor_pieces（防御·攻击加成·移速）/ 目录与装备表校验 catalog / 类型 types）
│   └── state_machine/states/    # idle / walking / jumping / falling / attacking（段子状态机）/ dying / rolling（翻滚，中段无敌帧）/ flinching
├── entity/
│   ├── character/               # 角色实体
│   │   ├── skeleton/            # 角色骨架定义（人形预设 preset.ts + PRESET_PART_SIZES + preset_appearance.ts，引用 entity/skeleton）
│   │   └── appearance/          # 方块人外观（统一模型构建器：预设骨架→Group 层级→部件装配，含手部与护甲 armor_mesh）+ 动画/武器装配
│   ├── skeleton/                # 通用骨架实体与编辑可视化（小球/菱形、面板、桥接；人形无关，预设由外部注入）
│   ├── box/                     # common / destructed / burning / magnet / elasticity
│   ├── fragment/common/         # 碎片实体
│   ├── destroyed/               # Voronoi 断裂算法
│   ├── area/water/              # 水方块
│   └── terrain/                 # Trimesh 地形（高度数组生成，heightfield 禁用）
├── modes/
│   ├── edit/                    # 编辑模式（轨道相机、键盘、指针交互）
│   ├── play/                    # 游玩模式（第三人称、状态机驱动、中键镜头锁定）
│   ├── showcase/                # 展示模式（攻击动作展示台，复现生产动画时序）
│   ├── startup_screen.ts
│   └── free_flight.ts
├── ui/                          # 面板（相机HUD、属性面板、列表侧栏、设置）
├── save_load/                   # 存档序列化 / 反序列化
├── assets/
│   └── style.css
└── main.ts
```

展示模式由启动屏第三个按钮进入（共享主页渲染器与单 RAF 循环，可返回启动屏），详见 [`docs/showcase.md`](docs/showcase.md)。

## 架构规则

1. **分包原则** — 代码按 `character/`（角色领域模型）、`entity/`（实体实现）、`modes/`（游戏模式）、`physics/`（共享物理）、`render/`（渲染管线）、`input/`（输入注册表）、`ui/`（面板）、`save_load/`（存档）分包。禁止循环依赖。

2. **依赖方向** — `character/` 是独立领域层，不依赖 `entity/`。`entity/character/` 依赖 `character/`。各 entity 之间不相互引用（**唯一例外**：`entity/character/skeleton/` 可引用通用骨架层 `entity/skeleton/`；`entity/skeleton/` 保持与人形无关，人形定义与外观装配由 `entity/character/` 提供并经 `SkeletonPreset` 注入，不得反向引用 `entity/character/`）。

3. **单 RAF 循环** — 所有帧驱动逻辑集中在 `main.ts` 的 `tick()` 中。各子系统返回 `(dt: number) => void` 类型的 updater 函数，由主循环统一调度，禁止自行启动 RAF。

4. **状态机驱动角色** — `entity/character/physics/world.ts` 每帧调用 `stateMachine.update(dt, entity)` → 状态直接操作 `entity.body`（`setLinvel` 等）→ 随后 `syncPositions()` 同步 body→mesh。输入注入链路：`input/` 注册表动作抽象（`getInputRegistry()`）→ `modes/play/keyboard.ts` 每帧读取动作并调用 `characterSystem.setPlayerMove()` → `world.ts` 统一转成 `stateMachine.setInput()`，不直接调 move/jump。

5. **常量集中** — 各分包的 magic number 必须提取到对应的 `constants.ts`，禁止散落在函数体内。

## 文档

项目文档统一存放在 `docs/` 目录，修改相关功能前务必先阅读对应文档、修改完成后及时更新。

| 文档 | 内容 |
|------|------|
| [`docs/ai_system.md`](docs/ai_system.md) | 角色 AI 寻路索敌系统：双层 FSM 架构、状态转移图、全量配置项、类型定义、扩展指南、核心文件索引 |
| [`docs/attack_system.md`](docs/attack_system.md) | 攻击系统：武器模组攻击链（段模型）与段子状态连段、起手解析与输入缓冲、受击硬直、伤害判定几何、动画系统 |
| [`docs/edit_mode.md`](docs/edit_mode.md) | 编辑模式：与主循环的关系、执行面板（Execute / Stop / Step / Run / Reset）语义与快照基线生命周期、其余控制与文件索引 |
| [`docs/equipment_system.md`](docs/equipment_system.md) | 装备与防御系统：攻击类别（物理/魔法）、护甲槽位与预设、防御固定减伤与存档兼容 |
| [`docs/melee_hold_modes.md`](docs/melee_hold_modes.md) | 近战三持握模组改造：武器类/模型分层、副手装备槽与挂背、段 id 约定、分阶段实施与验收清单 |
| [`docs/play_mode.md`](docs/play_mode.md) | 游玩模式：第三人称相机、镜头锁定（中键、选取与脱锁规则）、验证方式 |
| [`docs/showcase.md`](docs/showcase.md) | 攻击动作展示场景：入口、技能清单、面板与控制、与生产代码的镜像关系及刻意差异 |
| [`docs/bone_animation_system.md`](docs/bone_animation_system.md) | 骨骼动画系统设计与实施方案（`feature/bone-system` 分支）：骨骼/动画领域模型、编辑模式、外观装载、事件轨道化攻击迁移与测试计划 |
| [`docs/bone_animation/动作设计规范.md`](docs/bone_animation/动作设计规范.md) | 骨骼动画动作调优规范：坐标系与朝向、关节总表、旋转符号速查（肘前折/膝后折）、阶段与相位、动作→改动位置映射、提示词模版、三持握模式与副手槽、陷阱。同目录逐个动作建档（`武器名-攻击段名.md` / `动作名.md`） |
| [`docs/bone_animation/持握模式动作.md`](docs/bone_animation/持握模式动作.md) | 近战三持握模式动作总表：段 id 约定、模式语义、各武器连段与动画来源 |
| [`docs/bone_animation/长枪.md`](docs/bone_animation/长枪.md) | 长枪五段攻击动作与双手握点说明 |
| [`docs/bone_animation/远程攻击.md`](docs/bone_animation/远程攻击.md) | 九种远程动作逐段姿势与武器主、副握点说明 |

**扩展 AI 功能时**：阅读 `docs/ai_system.md` → 按"新增 AI 功能指南"章节操作 → 更新配置表 → 添加测试 → 同步更新文档。

## 陷阱

- `raycaster.intersectObjects(meshes, false)` — 必须传 `false` 禁止递归，否则会检测到 `LineSegments` 子对象而非 Mesh（Three.js r185 默认 `recursive = true`）
- 修改箱子尺寸（高）后需要同步调整 `body.translation()` / `mesh.position`，防止底部钻入地面引发物理引擎暴力弹飞
- `tsconfig.json` 启用 `noUnusedLocals`、`noUnusedParameters`、`erasableSyntaxOnly`、`verbatimModuleSyntax`，import 必须用 `import type`，若同时需要值和类型，用内联 `type` 修饰符（`import {Value, type SomeType} from 'module'`）
- 纹理使用单例 `CanvasTexture`（`gridMaskTexture()`，`render/texture.ts`），所有箱子共享
- 物理 body 与 three mesh 位置同步在 `syncPositions()` 中逐帧覆盖，手动移动 mesh 后要通过 `body.setTranslation` / `body.setRotation` 同步
- `Mesh` 是运行时值（`new Mesh(...)`，如 `entity/box/*/render/index.ts`），必须用 `import {Mesh}` 而非 `import type {Mesh}`
- rapier3d-compat 的休眠 body 无视 velocity 写入，操作 velocity 前必须 `body.wakeUp()`（`setLinvel(vel, true)` 第二参数同样会唤醒，本项目一律传 `true`）
- 角色 collider 是**竖直胶囊**（半径 = `CHARACTER_BASE_SIZE.width/2`，总高 = `height`），不是 cuboid。平底 cuboid 在 trimesh 地形上坡时会跨网格顶点线被内部棱幽灵水平法线卡死（原地 walking 不动）；rapier3d-compat 0.19/0.20 的 `FIX_INTERNAL_EDGES` 已损坏（开启后 trimesh 完全无碰撞），禁止使用；heightfield 在该版本 wasm 直接崩溃，禁止使用（地形用 `RAPIER.ColliderDesc.trimesh` 生成）
- 新增状态机状态时：写 `states/*.ts` → 在 `machine.ts` 的 `STATE_HANDLERS` 中注册 → 在 `types.ts` 的 `CHARACTER_STATES` 中添加。攻击**阶段**子状态（`attacking_{segmentId}_{phaseName}`）通过 `states/attacking/index.ts` 的 `registerPhaseHandler` 注册，未注册阶段走默认行为；攻击**段**子状态不在此列——它由武器模组的段定义（含 `next` 转换）驱动，新增/调整段只改 `character/weapon/*_attacks.ts`
- 存档 `attack`（武器 id + 伤害/起手段冷却/远程弹道覆写）与武器模组是**单向**关系：数值可覆写，动作（段/时长/阶段/动画）不可覆写；改存档结构必须同步 `save_load/types.ts`、`validation.ts`（缺失时安全回退默认武器，不得抛错）与 `serialize.ts`，历史存档不保证兼容（当前 `SAVE_FORMAT_VERSION = 6`：v4 起 character 增加可选的基础防御 `defense` 与护甲 `armor`，v5 起增加可选锁定点 `lockPoints`，v6 起增加可选副手武器 `offhand` 与持握模式 `holdMode`，旧档缺失时安全回退默认；未知副手武器 id 加载时安全丢弃）
- 默认操作配置由 `input/constants.ts` 的 `DEFAULT_BINDINGS` 定义，并由 `input/registry.test.ts` 的 `EXPECTED_DEFAULTS` 锁定：改默认键位/鼠标绑定必须同步该测试；`localStorage` 与导入文件中已有动作的绑定不会被新默认值覆盖（需「重置默认」或导入配置），缺失的动作（如版本新增）由 `loadFromStorageInternal` / 导入校验自动以默认值补齐
- 鼠标动作按模式生效：`MOUSE_ACTIONS_BY_MODE` 决定操作设置面板中各模式可改的指针动作，"平移视角 / 生成物体" 默认同为右键但分属不同模式，改动其中一个需同步核对另一个的默认值
- 武器挂点为两个零偏移关节 `rightWeaponMount` 与 `leftWeaponMount`（另有背部视觉挂点 `backWeaponMount`）：它们是可动画关节，模型按各自几何握点与固有旋转将主握点校正到挂点原点。自定义骨架缺关节时自动回退同名手腕关节。**手部与武器挂点是不同关节**：手部模型挂在 `rightHandPivot` / `leftHandPivot`，武器模型直接挂在腕下的武器挂点。`CharacterModel.equipWeapon` 对同一网格配置引用跳过重建（换模式只做挂背/回手换父节点），`setOffhandStowed` 不重建几何。
- 持握模式由武器类数据推导：**单持** / **双手共持**（左手 IK 到该武器单独声明的 `supportGripOffset`，与是否装备副手无关）/ **双持**（需副手同类近战：`sameWeaponClass`；左手握持自身武器，不走共享 IK，副手命中按副手武器数值结算）。双持命中事件按 `main` / `offhand` 分槽。双手副握点以主握把为原点沿武器本地 `+Y` 定位；勿将不同武器统一设为同一点。主手肘保持屈曲，左手链带肘极向约束。**左臂链长仅约 0.36m**：双手段每个关键帧与插值路径都要让左肩→副握点 ≤ ~0.34m（双手收向身体中线、躯干前倾带距离），否则 IK 截断、左手脱柄（`system.test.ts` 逐帧锁定副握残差 < 0.18m；新增双手段统一以巨剑双手链为模板族最稳妥）。
- 角色动画肘关节一律前折（`elbow rx < 0`）、膝后折（`rx > 0`）；武器朝向由武器骨骼控制，握把模型坐标与固有握持在 `weapon_mesh.ts` 烘焙；`WEAPON_GRIP_FLEX`（武器⊥前臂）是戒备/待机握法，攻击打击帧要用武器骨骼（必要时腕）把刃/枪口转向打击方向。攻击基础轨道在 `attack_clip_data.ts`，逐段修订在 `attack_pose_edits.ts`。
- 死亡动画保持直立（`pose_fns.ts` 的 `dyingPose` 不旋转根关节）：倒地方向由 `states/dying.ts` 取最后受击的冲击方向（`DamageEvent.dirX/dirZ` → `combat.lastHitDirX/Z`，无记录默认向后倒）决定，`world.ts` 绕「上 × 倒向」轴把 `dyingFallAngle`（0→90°，0.3s）合成到模型根旋转；新增伤害路径须携带方向，否则角色一律向后倒。
- 攻击动画由基础关键帧资产与显式逐段姿势修订共同定义；`getAttackClipById` 惰性解析缓存。新增或修改姿势时校验修订关节/时间与基础轨道一致；不增加抽象动作参数或每帧生成动画。
- **远程弹丸在 `release` 阶段开始发射**（`ranged_executor`）：动画 t=0 即起手瞄准位（枪口 / 箭向 / 杖头朝目标），释放帧朝向与弹道一致；`hitbox_on/off` 事件对远程只是遗留数据。**弹道初始方向 = 武器实际朝向**：`world.ts` 每帧从武器骨骼（本地 +Y）采样水平方向写入 `combat.muzzleDirX/Z`，`ranged_executor` 释放帧据此发射（无数据时回退 `attackDir`）；`attackDirX/Z` 仅表示瞄准方向，不得再作为弹道来源。**远程 AI 朝向策略**：默认跟随移动方向（逃跑/回撤时面朝移动方向，禁止背身放风筝）；仅在 `combatAimActive`（站定瞄准）或 `attackActive`（射击动作）期间由 `world.ts` 锁到战斗目标。回身射击统一走 `ai/combat/aim.ts` 的 `aimAndFireAt`（站定 → 转身 → 攻击），未对准（夹角 > `AIM_ALIGN_HALF_ANGLE`）只站定不出手；开火受 `COMBAT_SHOT_INTERVAL` 节流。**远程 AI 的站定/攻击需要移动清零也能进入 attacking**——`walking.ts` 的 `to:'attacking'` 必须排在 `to:'idle'` 之前，否则移动清零那一帧会先转 idle 而漏掉攻击。
- 新增碰撞体必须显式 `setCollisionGroups`，并用 `physics/collision_category.ts` 的 `categoryCollisionGroups(group, mask, category)` 标注碰撞类别（`ground` / `box` / `fragment` / `area` / `terrain` / `character`）——投掷物的「可穿过类别」判定依赖类别位；类别位从 membership 第 5 位起，不参与交互，但未声明碰撞组的碰撞体 membership 全 1，会被解析为 `ground` 并挡下子弹（fail-closed）
- 伤害事件 `DamageEvent.damageType` 必填（武器固有：近战/远程直取当前武器、爆炸继承所属武器）；新增伤害路径漏填即编译报错。防御力在 `applyDamage` 内、`damageModifiers` 之后按类别固定减免（`max(MIN_DAMAGE=1, 伤害 − defense[damageType])`，低于 1 点的原始伤害保持原值），禁止在别处重复减伤
- 护甲（`character/armor/`，四槽位 head/chest/arms/legs）提供逐类别防御、逐类别攻击加成与移速乘数：`armor`（槽位 → 护甲 id）与 `defense`（基础逐类别防御）是存档可选字段，未知 id / 槽位不匹配一律回退空槽；`CombatComponent` 的 `setCombatEquipment` 统一重算有效防御 / `attackBonus` / `moveSpeedMultiplier`（攻击加成在攻击侧并入近战/远程伤害，仅与武器类别匹配才计入；状态机移速一律走 `moveSpeedOf(entity)`，禁止在面板或状态机里对 `config.speed` 预乘装备系数）；护甲件是关节下的纯视觉子节点，不建碰撞体、不进 `getMeshes()`，不影响受击箱 / 视线 / 导航；近全包件可用 `ArmorMeshConfig.hideBodyParts`（`ARMOR_BODY_PARTS` 语义部位名，映射表 `ARMOR_BODY_PART_JOINTS` 在 `entity/character/appearance/armor_mesh.ts`）隐藏被顶替的基础身体部件，`model.ts` 的 `equipArmor` / `removeArmor` 负责隐藏与按原始可见性还原（同一部件只备份一次），护甲领域数据不得写死关节 id
- 翻滚与死亡的全身体根旋转都由 `world.ts` 合成：基础 clip 不写根关节自转（`rollingPose` 只表达抱团蜷缩），否则根原点在脚底会绕脚底划大圈/沉入地面；翻滚中段无敌帧由 `states/rolling.ts` 在窗口内逐帧写 `combat.invincibleTimer`（`exit` 清零），免疫判定统一走 `damage.ts` 的 `isDamageImmune(target)`（`applyDamage` 顶部短路，先于 modifier/防御，不触发任何受击回调），新增伤害路径不得绕过；三条命中路径也用它跳过击退与命中反馈——近战不写 `attackedTargets`/不 `onHit`（无敌结束后同一命中窗口内仍可命中）、远程弹丸穿过无敌目标不消耗、爆炸跳过该目标
- 角色材质表面效果（受击闪红 / 翻滚无敌半透明白）统一走 `entity/character/combat_vfx/material_effects.ts`（惰性快照 → 按优先级覆写 → 全部结束统一还原；闪红优先于闪白，`transparent` 仅在真正变化时置 `needsUpdate`），禁止在别处直接改角色模型材质颜色/透明度或另建快照还原逻辑
- 角色锁定点（`character/lock_point.ts`）：默认锁定点恒为身体最中心（`body.translation()`，不落数组），额外点 = 关节 id + **关节本地**偏移（`CharacterEntity.lockPoints`，面板「锁定点」区增删改、存档可选字段 `lockPoints`）；play 锁定选取按**锁定点**（而非角色）判定半径/角度，白点标记与相机瞄准点同为命中的数据点（同一 `getAimPoint`）。关节解析先 `updateWorldMatrix(true, false)` 再 `localToWorld`（动画刚写入 Group、`matrixWorld` 可能滞后），找不到关节的点跳过，锁定期间点被移除即自动解除
- 战斗 AI 的导航避障把「除自身外所有角色」视为墙绕行；短近战武器攻击检测箱前缘（如短剑 ≈0.68m）小于导航前向探测 `DEFAULT_CHECK_DISTANCE = 1.5m`，贴脸前目标会先被判为墙——必须把**当前 combat target** 从导航感知排除，否则 AI 会环绕目标、永不进入 `attack`（两个近战 AI 互相绕圈直到 `chaseTimeout`）。实现：`NavRunContext.ignoredMesh`（`NavSensor.sense` 第 5 参），由 `world.ts` 每帧按 `activeFsm === 'combat' && combatTargetId` 设为目标 mesh；传感器在障碍列表与角色集合两处都跳过它，目标重叠/推挤由接触推挤闸门与强制分离兜底
