# 地形（entity/terrain/）模块约定

## 约定

- Trimesh 地形（高度数组生成）；地形雕刻只在选中地形并勾选「启用（滚轮雕刻）」后拦截滚轮，且**仅**关闭相机缩放、保留旋转 / 平移（`base/edit/sculpt.ts` + `ui/sculpt_panel.ts`）。

## 陷阱

- **heightfield 禁用**（该版本 wasm 直接崩溃）；地形一律用 `RAPIER.ColliderDesc.trimesh` 生成；`FIX_INTERNAL_EDGES` 已损坏，**禁止开启**（详见 `src/physics/physics.md`）。
