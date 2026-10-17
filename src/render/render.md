# 渲染（render/）模块约定

## 约定

- 基础表面材质库 `materials/`（`getSurfaceMaterial` / `getSurfaceMaterials`）为共享材质单例；纹理单例 `gridMaskTexture()`（`texture.ts`）所有箱子共享。
- 表面材质工厂 `surfaceMaterial.ts`（`createSurfaceGridMaterial` / `updateSurfaceMap` / `updateSurfaceBurn`）：使用与建筑体素相同的 `MeshStandardMaterial`（同一光照管线），网格线烘焙进纹理（`getSurfaceGridTexture`），燃烧通过 `onBeforeCompile` 注入「顶点形变 + 火焰着色」。箱子与碎片共用，保证碎裂前后外观一致。`SURFACE_GRID_COLOR` / `SURFACE_EDGE_COLOR` 定义在 `constants.ts`。
- 跨模块共用颜色集中在 `constants.ts`。
- 纹理、材质、几何体按需单例复用；帧内逻辑避免无谓分配，更新路径中禁止创建 DOM。

## 陷阱

- **共享材质单例不得 `dispose`**（如 `getSurfaceMaterials` / `getSurfaceMaterial`），只释放各自几何。
- `raycaster.intersectObjects(meshes, false)` 必须传 `false` 禁止递归，否则会检测到 `LineSegments` 子对象而非 Mesh（Three.js r185 默认 `recursive = true`）。
- `Mesh` 是运行时值（`new Mesh(...)`），必须用 `import {Mesh}` 而非 `import type {Mesh}`。
- CanvasTexture 必须 `trackTexture` 登记，材质必须 `trackMaterial` 登记，否则泄漏。
