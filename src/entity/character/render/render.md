# 角色渲染（entity/character/render/）模块约定

## 约定

- `index.ts`：碰撞体可视化胶囊（`createCharacterMesh` / `updateCharacterMesh`）与尺寸常量。
- `debug_view.ts`：角色调试可视化基本能力 `createCharacterDebugView(scene, model)`，统一创建并同步：
  - 碰撞箱（模型自带 `colliderMeshes`）；
  - 攻击箱（当前武器 / 副手武器攻击箱 + 远程弹丸预览）；
  - 受击箱（受击子块，缺失时回退身体盒）；
  - 攻击检测区（橙色近战检测箱 / 远程射程圆环）；
  - 视线扇形（蓝色扫描线）。
- **模式只负责开关与提供帧数据**：编辑模式由显示控制面板调用 `setDebugVisible`；展示模式 `actor_debug.ts` 包装同一能力。禁止在模式侧另建线框几何或复制同步逻辑。
- 攻击箱默认 **50%** 不透明；进入命中 / 释放阶段（`strike` / `release` / `spin`）调用 `setAttackActive(true)` 恢复 100%，结束后回到 50%。

## 陷阱

- 碰撞箱关闭时不要设置 `entity.mesh.visible = false`：选中线框是 mesh 的子节点，隐藏 mesh 会一并隐藏选中描边；应调整胶囊材质透明度。
- 角色体形切换重建模型后必须调用 `CharacterDebugView.setModel(model)`。
