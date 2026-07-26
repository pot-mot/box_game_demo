# box-demo

Three.js + cannon-es 物理箱子交互演示。

## 命令

- `pnpm dev` — 启动 Vite 开发服务器
- `pnpm build` — `tsc && vite build`（必须先检查类型再打包）
- `pnpm preview` — 预览构建产物

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

2. **`import type` + `as`** — 类型冲突时用 `import type {Material as CannonMaterial} from 'cannon-es'`，值类型冲突时用 `import {Material as CannonMaterial}` 并额外使用 `type` 修饰符。

3. **路径后缀** — import 路径必须包含 `.ts` 扩展名。

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
├── physics/                     # 共享物理世界（cannon-es）
├── render/                      # Three.js 渲染
├── character/                   # 角色领域模型（纯 TS 类型 + 状态机）
│   └── state_machine/states/    # idle / walking / jumping / falling
├── entity/
│   ├── character/               # 角色实体
│   ├── box/                     # common / destructed / burning / magnet / elasticity
│   ├── fragment/common/         # 碎片实体
│   ├── destroyed/               # Voronoi 断裂算法
│   ├── area/water/              # 水方块
│   └── terrain/                 # Heightfield 地形
├── modes/
│   ├── edit/                    # 编辑模式（轨道相机、键盘、指针交互）
│   ├── play/                    # 游玩模式（第三人称、状态机驱动）
│   ├── startup_screen.ts
│   └── instructions_panel.ts
├── ui/                          # 面板（相机HUD、属性面板、列表侧栏、设置）
├── save_load/                   # 存档序列化 / 反序列化
├── assets/
│   └── style.css
└── main.ts
```

## 架构规则

1. **分包原则** — 代码按 `character/`（角色领域模型）、`entity/`（实体实现）、`modes/`（游戏模式）、`physics/`（共享物理）、`render/`（渲染管线）、`ui/`（面板）、`save_load/`（存档）分包。禁止循环依赖。

2. **依赖方向** — `character/` 是独立领域层，不依赖 `entity/`。`entity/character/` 依赖 `character/`。各 entity 之间不相互引用。

3. **单 RAF 循环** — 所有帧驱动逻辑集中在 `main.ts` 的 `tick()` 中。各子系统返回 `(dt: number) => void` 类型的 updater 函数，由主循环统一调度，禁止自行启动 RAF。

4. **状态机驱动角色** — `entity/character/physics/world.ts` 每帧调用 `stateMachine.update(dt, entity)` → 状态直接操作 `entity.body.velocity` → 随后 `syncPositions()` 同步 body→mesh。`modes/play/keyboard.ts` 通过 `stateMachine.setInput()` 注入输入，不直接调 move/jump。

5. **常量集中** — 各分包的 magic number 必须提取到对应的 `constants.ts`，禁止散落在函数体内。

## 陷阱

- `raycaster.intersectObjects(meshes, false)` — 必须传 `false` 禁止递归，否则会检测到 `LineSegments` 子对象而非 Mesh（Three.js r185 默认 `recursive = true`）
- 修改箱子尺寸（高）后需要同步调整 `body.position.y` / `mesh.position.y`，防止底部钻入地面引发 cannon-es 暴力弹飞
- `tsconfig.json` 启用 `noUnusedLocals`、`noUnusedParameters`、`erasableSyntaxOnly`、`verbatimModuleSyntax`，import 必须用 `import type`，若同时需要值和类型，用内联 `type` 修饰符（`import {Value, type SomeType} from 'module'`）
- 纹理使用单例 `CanvasTexture`（`gridTexture()`），所有箱子共享
- 物理 body 与 three mesh 位置同步在 `syncPositions()` 中逐帧覆盖，手动移动 mesh 后要通过 `body.position.set` / `body.quaternion.set` 同步
- `render/box.ts` 中 `Mesh` 是运行时值（`new Mesh(...)`），必须用 `import {Mesh}` 而非 `import type {Mesh}`
- `world.allowSleep = true` 时 cannon-es 休眠 body 无视 velocity 写入，操作 velocity 前必须调用 `body.wakeUp()`
- 新增状态机状态时：写 `states/*.ts` → 在 `machine.ts` 的 `STATE_HANDLERS` 中注册 → 在 `types.ts` 的 `CHARACTER_STATES` 中添加
