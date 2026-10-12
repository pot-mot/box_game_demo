# 角色领域（character/）模块约定

## 约定

- 阵营定义在 `faction.ts`（涂色入口为 `entity/character/appearance/constants.ts` 的 `factionColorOf`，见对应模块文档）。
- 角色原型配置在 `archetypes.ts`。
- 锁定点领域定义在 `lock_point.ts`。

## 陷阱

- **角色锁定点**：默认锁定点恒为身体最中心（`body.translation()`，不落数组），额外点 = 关节 id + **关节本地**偏移（`CharacterEntity.lockPoints`）。关节解析先 `updateWorldMatrix(true, false)` 再 `localToWorld`（动画刚写入 Group、`matrixWorld` 可能滞后），找不到关节的点跳过，锁定期间点被移除即自动解除。
