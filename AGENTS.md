# box-demo

Three.js + cannon-es 物理箱子交互演示。

## 命令

- `pnpm dev` — 启动 Vite 开发服务器
- `pnpm build` — `tsc && vite build`（必须先检查类型再打包）
- `pnpm preview` — 预览构建产物

## 规范

1. 要求任何位置都严格类型检查，禁止使用 `any`。

2. 4格空格缩进。

3. 拒绝非必要的 class、function、this，尽可能使用 const 箭头函数。

4. 尽可能使用 undefined 而不是 null，且严格区分 null 和 undefined，不要在任何地方使用 == 或 !=，一定要用 === / !==。

## 陷阱

- `raycaster.intersectObjects(meshes, false)` — 必须传 `false` 禁止递归，否则会检测到 `LineSegments` 子对象而非 Mesh（Three.js r185 默认 `recursive = true`）
- 修改箱子尺寸（高）后需要同步调整 `body.position.y` / `mesh.position.y`，防止底部钻入地面引发 cannon-es 暴力弹飞
- `tsconfig.json` 启用 `noUnusedLocals`、`noUnusedParameters`、`erasableSyntaxOnly`、`verbatimModuleSyntax`，import 必须用 `import type`
- 纹理使用单例 `CanvasTexture`（`gridTexture()`），所有箱子共享
- 物理 body 与 three mesh 位置同步在 `syncBodyToMesh()` 中逐帧覆盖，手动移动 mesh 后要通过 `body.position.set` / `body.quaternion.set` 同步
