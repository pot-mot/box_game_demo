# 箱子（entity/box/）模块约定

## 约定

- 变体：common / destructed / burning / magnet / elasticity。

## 陷阱

- 修改箱子尺寸（高）后需要同步调整 `body.translation()` / `mesh.position`，防止底部钻入地面引发物理引擎暴力弹飞。
- 纹理使用单例 `CanvasTexture`（`gridMaskTexture()`，`render/texture.ts`），所有箱子共享。
