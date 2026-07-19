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

4. **枚举** - 禁止使用 `enum`，尽可能使用常量 + 索引类型推导的形式：
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

2. **RAF 回调** — 需要在每帧执行的逻辑返回 `() => void` 类型的 updater 函数，由 `main.ts` 的单 RAF 循环统一调用。

## 项目结构

```
src/
├── types/                # 类型定义
│   ├── physics.ts        # BoxConfig, PhysicsBox, PhysicsContext
│   ├── render.ts         # RenderContext
│   └── ui.ts             # PanelContext
├── physics/              # 物理（cannon-es）
│   ├── constants.ts      # 物理常量（重力、时间步长、摩擦系数等）
│   └── world.ts          # 世界/地面/接触材质 + Box CRUD + 选中管理
├── render/               # 渲染（Three.js）
│   ├── constants.ts      # 渲染常量（FOV、颜色、纹理尺寸等）
│   ├── setup.ts          # Scene/Camera/Renderer 创建 + GridHelper
│   └── box.ts            # 网格/纹理/边缘线/选中线框/body→mesh 同步工具函数
├── input/                # 输入控制
│   ├── constants.ts      # 控制常量（灵敏度、步长、阈值等）
│   ├── mouse_orbit.ts           # 鼠标拖拽轨道
│   ├── keyboard_camera.ts       # WASD+EQ 移动（返回 updater 给主循环）
│   └── pointer_interaction.ts   # 点击选中/右键生成箱子
├── ui/                   # UI 面板
│   ├── camera_info.ts    # 相机信息 HUD（纯展示，返回 updater）
│   └── box_panel.ts      # 箱子控制面板
└── main.ts               # 入口：单 RAF 循环协调所有子系统
```

## 架构规则

1. **分包原则** — 代码按物理（`physics/`）、渲染（`render/`）、输入（`input/`）、UI（`ui/`）分包，类型定义在 `types/`。禁止循环依赖。

2. **单 RAF 循环** — 所有帧驱动逻辑集中在 `main.ts` 的 `tick()` 中：物理步进 → body→mesh 同步 → 键盘移动 → HUD 更新 → 渲染。各子系统返回 updater 函数而非自行启动 RAF 循环。

3. **视觉工厂** — `physics/world.ts` 通过导入 `render/box.ts` 的工具函数创建/更新/销毁网格，避免物理模块直接操作 Three.js 原始类型（但仍持有 `Mesh` / `LineSegments` 引用）。

4. **常量集中** — 各模块的 magic number 必须提取到对应的 `constants.ts`，禁止散落在函数体内。

## 陷阱

- `raycaster.intersectObjects(meshes, false)` — 必须传 `false` 禁止递归，否则会检测到 `LineSegments` 子对象而非 Mesh（Three.js r185 默认 `recursive = true`）
- 修改箱子尺寸（高）后需要同步调整 `body.position.y` / `mesh.position.y`，防止底部钻入地面引发 cannon-es 暴力弹飞
- `tsconfig.json` 启用 `noUnusedLocals`、`noUnusedParameters`、`erasableSyntaxOnly`、`verbatimModuleSyntax`，import 必须用 `import type`，若同时需要值和类型，用内联 `type` 修饰符（`import {Value, type SomeType} from 'module'`）
- 纹理使用单例 `CanvasTexture`（`gridTexture()`），所有箱子共享
- 物理 body 与 three mesh 位置同步在 `syncBodyToMesh()` 中逐帧覆盖，手动移动 mesh 后要通过 `body.position.set` / `body.quaternion.set` 同步
- `render/box.ts` 中 `Mesh` 是运行时值（`new Mesh(...)`），必须用 `import {Mesh}` 而非 `import type {Mesh}`
- 新增 `types/` 文件后，记得在 `tsconfig.json` 确认其被包含在编译范围内（当前为 `"include": ["src"]`）
