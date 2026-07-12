# box-demo

Three.js + cannon-es 物理箱子交互演示。

## 命令

- `pnpm dev` — 启动 Vite 开发服务器
- `pnpm build` — `tsc && vite build`（必须先检查类型再打包）
- `pnpm preview` — 预览构建产物

## 架构

`src/main.ts` 串联 5 个模块，无框架路由：

| 模块 | 职责 |
|---|---|
| `renderer.ts` | 场景/相机/渲染器 + 第一人称鼠标旋转（`camera.rotation.order = 'YXZ'`） |
| `camera_info_panel.ts` | WASD/QE 移动 + 左上角位置/旋转信息 |
| `physics_world.ts` | cannon-es 物理世界、箱子 CRUD、网格地面、选中高亮（亮青色线框） |
| `box_interaction.ts` | 左键射线拾取、右键生成箱子、点击空白取消选中 |
| `box_control_panel.ts` | 底部右侧控制面板（Pos/Rot/Size/Mass/Friction + Apply/Delete） |

## 陷阱

- `raycaster.intersectObjects(meshes, false)` — 必须传 `false` 禁止递归，否则会检测到 `LineSegments` 子对象而非 Mesh（Three.js r185 默认 `recursive = true`）
- 修改箱子尺寸（高）后需要同步调整 `body.position.y` / `mesh.position.y`，防止底部钻入地面引发 cannon-es 暴力弹飞
- `tsconfig.json` 启用 `noUnusedLocals`、`noUnusedParameters`、`erasableSyntaxOnly`、`verbatimModuleSyntax`，import 必须用 `import type`
- 纹理使用单例 `CanvasTexture`（`gridTexture()`），所有箱子共享
- 物理 body 与 three mesh 位置同步在 `syncBodyToMesh()` 中逐帧覆盖，手动移动 mesh 后要通过 `body.position.set` / `body.quaternion.set` 同步
