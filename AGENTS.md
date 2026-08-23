# box-demo

Three.js + rapier3d-compat 物理箱子交互演示。

## 命令

- `pnpm dev` — 启动 Vite 开发服务器
- `pnpm build` — `tsc && vite build`（必须先检查类型再打包）
- `pnpm preview` — 预览构建产物
- `pnpm type-check` — `tsc --noEmit` 仅类型检查
- `pnpm test` — `vitest run` 单元测试
- `pnpm test:e2e` — `playwright test` 端到端测试

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

## 项目结构

```
src/
├── types/                       # 通用类型定义
├── physics/                     # 共享物理世界（rapier3d-compat）
├── render/                      # Three.js 渲染
├── input/                       # 键盘输入注册表（动作抽象、键位绑定、绑定面板）
├── character/                   # 角色领域模型（纯 TS 类型 + 状态机）
│   └── state_machine/states/    # idle / walking / jumping / falling / attacking / dying / dashing / flinching
├── entity/
│   ├── character/               # 角色实体
│   ├── box/                     # common / destructed / burning / magnet / elasticity
│   ├── fragment/common/         # 碎片实体
│   ├── destroyed/               # Voronoi 断裂算法
│   ├── area/water/              # 水方块
│   └── terrain/                 # Trimesh 地形（高度数组生成，heightfield 禁用）
├── modes/
│   ├── edit/                    # 编辑模式（轨道相机、键盘、指针交互）
│   ├── play/                    # 游玩模式（第三人称、状态机驱动）
│   ├── showcase/                # 展示模式（攻击动作展示台，复现生产动画时序）
│   ├── startup_screen.ts
│   ├── instructions_panel.ts
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

2. **依赖方向** — `character/` 是独立领域层，不依赖 `entity/`。`entity/character/` 依赖 `character/`。各 entity 之间不相互引用。

3. **单 RAF 循环** — 所有帧驱动逻辑集中在 `main.ts` 的 `tick()` 中。各子系统返回 `(dt: number) => void` 类型的 updater 函数，由主循环统一调度，禁止自行启动 RAF。

4. **状态机驱动角色** — `entity/character/physics/world.ts` 每帧调用 `stateMachine.update(dt, entity)` → 状态直接操作 `entity.body`（`setLinvel` 等）→ 随后 `syncPositions()` 同步 body→mesh。输入注入链路：`input/` 注册表动作抽象（`getInputRegistry()`）→ `modes/play/keyboard.ts` 每帧读取动作并调用 `characterSystem.setPlayerMove()` → `world.ts` 统一转成 `stateMachine.setInput()`，不直接调 move/jump。

5. **常量集中** — 各分包的 magic number 必须提取到对应的 `constants.ts`，禁止散落在函数体内。

## 文档

项目文档统一存放在 `docs/` 目录，修改相关功能前务必先阅读对应文档、修改完成后及时更新。

| 文档 | 内容 |
|------|------|
| [`docs/ai_system.md`](docs/ai_system.md) | 角色 AI 寻路索敌系统：双层 FSM 架构、状态转移图、全量配置项、类型定义、扩展指南、核心文件索引 |
| [`docs/attack_system.md`](docs/attack_system.md) | 攻击系统：技能三计时模型、阶段调度 meta-state、连段守卫与输入缓冲、受击硬直、伤害判定几何、动画系统 |
| [`docs/showcase.md`](docs/showcase.md) | 攻击动作展示场景：入口、技能清单、面板与控制、与生产代码的镜像关系及刻意差异 |

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
- 新增状态机状态时：写 `states/*.ts` → 在 `machine.ts` 的 `STATE_HANDLERS` 中注册 → 在 `types.ts` 的 `CHARACTER_STATES` 中添加。攻击阶段子状态（`attacking_{skillId}_{phaseName}`）通过 `states/attacking.ts` 的 `registerPhaseHandler` 注册，未注册阶段走默认行为
